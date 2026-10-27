import { expect, test } from '../fixtures/base';
import type { Page, Request } from '@playwright/test';

async function setup(page: Page) {
  const requests: Request[] = [];
  let layout = 'testagent';
  let files = [{ path: '.testagent/agents/custom-prompt.md', size: 1024 }];
  let failPath = '';
  const entries = () => [
    { path: 'demo-extension/codeagent-extension.json', type: 'file', source: 'SYSTEM', size: null },
    { path: 'demo-extension/.cac-plugin/plugin.json', type: 'file', source: 'SYSTEM', size: null },
    {
      path: `demo-extension/${layout === 'testagent' ? '.testagent/' : ''}agents/review.md`,
      type: 'file',
      source: 'COMPONENT',
      size: null,
    },
    ...files.map((file) => ({
      ...file,
      path: `demo-extension/${file.path}`,
      type: 'file',
      source: 'FILE',
    })),
  ];
  await page.route('**/api/harness/**', async (route) => {
    const req = route.request();
    requests.push(req);
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/harness', '');
    if (failPath === path) {
      failPath = '';
      return route.fulfill({ json: { code: 1, message: '服务暂不可用，请重试', data: null } });
    }
    let data: unknown = null;
    if (path === '/extensions/detail')
      data = {
        firstScene: '开发',
        secondScene: '测试',
        readyStatus: '已就绪',
        publishedExtension: { extensionName: 'demo-extension', description: '原有说明' },
        components: { agents: [{ name: 'review', version: '1.0' }], skills: [], commands: [] },
        layoutMode: layout,
        hasBypass: files.length > 0,
        bypassEntries: files,
      };
    if (path === '/extensions/orgs') data = [{ orgCode: 'org1', orgName: '测试组织' }];
    if (path === '/extensions/structure/tree') data = { layoutMode: layout, entries: entries() };
    if (path === '/extensions/layout') {
      layout = url.searchParams.get('layout')!;
      data = { layoutMode: layout };
    }
    if (path === '/extensions/bypass') {
      files = [{ path: '.testagent/agents/uploaded.md', size: 12 }];
      data = {
        layoutMode: layout,
        acceptedEntries: files,
        ignoredEntries: [{ path: 'codeagent-extension.json', size: 4, reason: '系统文件，已忽略' }],
      };
    }
    if (path === '/extensions/bypass/clear') files = [];
    if (path === '/extensions/search')
      data = [
        {
          extensionName: 'shared-baseline',
          description: '按工作流名匹配',
          layoutMode: 'standard',
          hasBypass: false,
          entryCount: 0,
          latestVersion: '1.0',
          sourceDimName: '平台开发部',
        },
      ];
    if (path === '/extensions/bypass/inherit') {
      layout = 'standard';
      files = [];
      data = {
        layoutMode: layout,
        acceptedEntries: [],
        ignoredEntries: [
          { path: 'commands/protected.md', size: 8, reason: '命中目标组件保护区，已剥离' },
        ],
      };
    }
    if (path === '/extensions/history') data = [];
    await route.fulfill({ json: { code: 0, message: '成功', data } });
  });
  await page.route('**/skill-market/assembly-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="test-host" style="height:100vh"></div>',
    }),
  );
  await page.goto('/skill-market/assembly-test');
  await page.evaluate(async () => {
    const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
    const viewUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
    const apiUrl = '/skill-market/src/services/skillMarket/extensionPublishHttp.ts';
    const { createApp, h } = await import(vueUrl);
    const { default: Component } = await import(viewUrl);
    const { queryHttpExtensionDetail } = await import(apiUrl);
    const scope = {
      dimType: '产品级',
      dimCode: 'P1',
      dimName: 'demo',
      productId: 'P1',
      departmentPath: [],
    };
    const scene = await queryHttpExtensionDetail('user1', scope, {
      extensionName: 'demo-extension',
      firstScene: '开发',
      secondScene: '测试',
    });
    createApp({
      render: () =>
        h(Component, {
          userId: 'user1',
          userName: '发布用户',
          releaseContext: { scope, scene, productName: 'demo' },
        }),
    }).mount('#test-host');
  });
  const assembly = page.getByRole('region', { name: 'Extension 发布组装' });
  await expect(assembly).toBeVisible();
  return {
    assembly,
    requests,
    failNext: (path: string) => {
      failPath = path;
    },
  };
}

test.describe('Extension HTTP 发布组装', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('详情回显布局和旁路，取消继承只在发布时传 false', async ({ page }) => {
    const { assembly, requests } = await setup(page);
    await expect(assembly.getByRole('button', { name: 'TestAgent', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const tree = assembly.getByRole('list', { name: '最终目录结构' });
    await expect(tree.getByText('.cac-plugin/', { exact: true })).toBeVisible();
    await expect(tree.getByText('custom-prompt.md', { exact: true })).toBeVisible();
    await expect(
      assembly.getByText('.testagent/agents/custom-prompt.md', { exact: true }),
    ).toBeVisible();
    const inherit = assembly.getByLabel('继承当前旁路文件');
    await expect(inherit).toBeChecked();
    await page.getByLabel('Extension 描述', { exact: true }).fill('填写后保持不变');
    await inherit.uncheck();
    await expect(tree.getByText('custom-prompt.md', { exact: true })).toHaveCount(0);
    await expect(tree.getByText('review.md', { exact: true })).toBeVisible();
    expect(requests.some((req) => req.url().includes('/bypass/clear'))).toBe(false);
    await assembly.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    const save = requests.find((req) => new URL(req.url()).pathname.endsWith('/extensions/save'))!;
    expect(save.postDataJSON()).toMatchObject({
      inheritBypass: false,
      description: '填写后保持不变',
    });
    expect(save.postDataJSON()).not.toHaveProperty('layout');
    const detail = requests.find((req) => req.url().includes('/extensions/detail'))!;
    expect(detail.method()).toBe('GET');
    expect(new URL(detail.url()).searchParams.get('extensionName')).toBe('demo-extension');
    const structure = requests.find((req) => req.url().includes('/structure/tree'))!;
    expect(JSON.parse(new URL(structure.url()).searchParams.get('components')!)).toEqual([
      { componentType: 'agent', componentName: 'review', componentVersion: '1.0' },
    ]);
  });

  test('布局和旁路操作失败保留状态，上传展示服务端忽略原因', async ({ page }) => {
    const { assembly, requests, failNext } = await setup(page);
    const tree = assembly.getByRole('list', { name: '最终目录结构' });
    await expect(tree.getByText('custom-prompt.md', { exact: true })).toBeVisible();
    failNext('/extensions/layout');
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await expect(assembly.getByRole('alert').filter({ hasText: '服务暂不可用' })).toBeVisible();
    await expect(assembly.getByRole('button', { name: 'TestAgent', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await expect(assembly.getByRole('button', { name: 'CodeAgent（标准）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      new URL(
        requests
          .filter((req) => req.url().includes('/extensions/layout'))
          .at(-1)!
          .url(),
      ).searchParams.get('layout'),
    ).toBe('standard');
    failNext('/extensions/bypass');
    await assembly.locator('input[type=file]').setInputFiles({
      name: 'custom.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip-bytes'),
    });
    await expect(assembly.getByRole('alert').filter({ hasText: '服务暂不可用' })).toBeVisible();
    await expect(tree.getByText('custom-prompt.md', { exact: true })).toBeVisible();
    await assembly.locator('input[type=file]').setInputFiles({
      name: 'custom.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip-bytes'),
    });
    await expect(tree.getByText('uploaded.md', { exact: true })).toBeVisible();
    await expect(assembly.getByRole('alert').filter({ hasText: '系统文件，已忽略' })).toBeVisible();
    const upload = requests
      .filter((req) => new URL(req.url()).pathname.endsWith('/extensions/bypass'))
      .at(-1)!;
    expect(upload.headers()['content-type']).toContain('multipart/form-data; boundary=');
    expect(upload.postData()).toContain('name="layout"\r\n\r\nstandard');
    failNext('/extensions/bypass/clear');
    await assembly.getByRole('button', { name: '移除旁路', exact: true }).click();
    await expect(assembly.getByRole('alert').filter({ hasText: '服务暂不可用' })).toBeVisible();
    await expect(tree.getByText('uploaded.md', { exact: true })).toBeVisible();
    await assembly.getByRole('button', { name: '移除旁路', exact: true }).click();
    await expect(tree.getByText('uploaded.md', { exact: true })).toHaveCount(0);
    await expect(assembly.getByLabel('继承当前旁路文件')).toHaveCount(0);
    await expect(assembly.getByRole('button', { name: 'CodeAgent（标准）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('取消继承后上传新包会重新启用继承，并发布新旁路', async ({ page }) => {
    const { assembly, requests } = await setup(page);
    await assembly.getByLabel('继承当前旁路文件').uncheck();
    await assembly.locator('input[type="file"]').setInputFiles({
      name: 'new-bypass.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('backend validates zip'),
    });
    await expect(assembly.getByLabel('继承当前旁路文件')).toBeChecked();
    await expect(
      assembly
        .getByRole('list', { name: '最终目录结构' })
        .getByText('uploaded.md', { exact: true }),
    ).toBeVisible();
    await assembly.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    const save = requests.find((req) => new URL(req.url()).pathname.endsWith('/extensions/save'))!;
    expect(save.postDataJSON().inheritBypass).toBe(true);
  });

  test('服务端搜索结果可按工作流命中，支持仅继承源布局', async ({ page }) => {
    const { assembly, requests, failNext } = await setup(page);
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择继承源' });
    await dialog.getByRole('searchbox').fill('测试工作流');
    await dialog.getByRole('radio', { name: /shared-baseline/ }).check();
    await expect(dialog.getByText('无旁路文件，仅继承布局')).toBeVisible();
    failNext('/extensions/bypass/inherit');
    await dialog.getByRole('button', { name: '确认继承' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('服务暂不可用');
    await dialog.getByRole('button', { name: '确认继承' }).click();
    await expect(dialog).toBeHidden();
    await expect(assembly.getByRole('button', { name: 'CodeAgent（标准）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(assembly.getByLabel('继承当前旁路文件')).toHaveCount(0);
    await expect(
      assembly.getByRole('alert').filter({ hasText: '命中目标组件保护区，已剥离' }),
    ).toBeVisible();
    const inherit = requests.filter((req) => req.url().includes('/bypass/inherit')).at(-1)!;
    expect(inherit.postDataJSON()).toEqual({
      sourceExtensionName: 'shared-baseline',
      targetExtensionName: 'demo-extension',
    });
  });

  test('目录刷新失败显示重试且不回退到 Mock 目录', async ({ page }) => {
    const { assembly, failNext } = await setup(page);
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    failNext('/extensions/structure/tree');
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await expect(assembly.getByRole('button', { name: '重试目录加载' })).toBeVisible();
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await expect(assembly.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '返回', exact: true })).toBeEnabled();
    await assembly.getByRole('button', { name: '重试目录加载' }).click();
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    await expect(assembly.getByText('checker.py', { exact: true })).toHaveCount(0);
  });

  test('保存布局期间禁止发布，迟到的搜索响应不能覆盖新结果', async ({ page }) => {
    const { assembly } = await setup(page);
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    let releaseLayout!: () => void;
    const layoutReady = new Promise<void>((resolve) => {
      releaseLayout = resolve;
    });
    await page.route('**/api/harness/extensions/layout**', async (route) => {
      await layoutReady;
      await route.fallback();
    });
    const pendingLayout = page.waitForRequest('**/api/harness/extensions/layout**');
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await pendingLayout;
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await expect(assembly.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '返回', exact: true })).toBeDisabled();
    releaseLayout();
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
    await expect(assembly.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '返回', exact: true })).toBeEnabled();
    await assembly.getByRole('button', { name: 'TestAgent', exact: true }).click();
    await expect(assembly.getByRole('button', { name: '更换继承', exact: true })).toBeEnabled();
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择继承源' });
    let releaseOld!: () => void;
    const oldReady = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    await page.route('**/api/harness/extensions/search**', async (route) => {
      const keyword = new URL(route.request().url()).searchParams.get('keyword');
      if (keyword !== '旧搜索') return route.fallback();
      await oldReady;
      return route.fulfill({
        json: {
          code: 0,
          data: [
            {
              extensionName: 'stale-result',
              description: '',
              layoutMode: 'standard',
              hasBypass: false,
              entryCount: 0,
              latestVersion: '',
              sourceDimName: '',
            },
          ],
        },
      });
    });
    const oldRequest = page.waitForRequest(
      (req) => new URL(req.url()).searchParams.get('keyword') === '旧搜索',
    );
    await dialog.getByRole('searchbox').fill('旧搜索');
    await oldRequest;
    await dialog.getByRole('searchbox').fill('新搜索');
    await expect(dialog.getByRole('radio', { name: /shared-baseline/ })).toBeVisible();
    const oldResponse = page.waitForResponse(
      (res) => new URL(res.url()).searchParams.get('keyword') === '旧搜索',
    );
    releaseOld();
    await oldResponse;
    await expect(dialog.getByRole('radio', { name: /shared-baseline/ })).toBeVisible();
    await expect(dialog.getByText('stale-result', { exact: true })).toHaveCount(0);
  });
});

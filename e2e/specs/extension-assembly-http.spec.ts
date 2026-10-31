import { expect, test } from '../fixtures/base';
import type { Page, Request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import { APP_BASE_PATH } from '../helpers/constants';

async function setup(
  page: Page,
  options: {
    holdInitialTree?: boolean;
    fullPage?: boolean;
    omitDetailSceneCode?: boolean;
    extensionName?: string;
  } = {},
) {
  const sceneExtensionCode = 'scene-code-001';
  const requests: Request[] = [];
  let layout = 'testagent';
  let files = [{ path: '.testagent/agents/custom-prompt.md', size: 1024 }];
  let failPath = '';
  let initialTreePending = options.holdInitialTree === true;
  let releaseInitialTree: (() => void) | undefined;
  const initialTreeReady = new Promise<void>((resolve) => {
    releaseInitialTree = resolve;
  });
  const entries = () => [
    {
      path: `${sceneExtensionCode}/codeagent-extension.json`,
      type: 'file',
      source: 'SYSTEM',
      size: null,
    },
    {
      path: `${sceneExtensionCode}/.cac-plugin/plugin.json`,
      type: 'file',
      source: 'SYSTEM',
      size: null,
    },
    {
      path: `${sceneExtensionCode}/${layout === 'testagent' ? '.testagent/' : ''}agents/review.md`,
      type: 'file',
      source: 'COMPONENT',
      size: null,
    },
    ...files.map((file) => ({
      ...file,
      path: `${sceneExtensionCode}/${file.path}`,
      type: 'file',
      source: 'FILE',
    })),
  ];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    requests.push(req);
    const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    const path = url.pathname.replace('/api/harness', '');
    // 后端没有 /extensions/save；旧错误地址不能被默认成功响应掩盖。
    if (path === '/extensions/save') {
      return route.fulfill({ status: 404, json: { code: 404, message: '接口不存在' } });
    }
    if (failPath === path) {
      failPath = '';
      return route.fulfill({ json: { code: 1, message: '服务暂不可用，请重试', data: null } });
    }
    let data: unknown = null;
    if (path === '/permission/user-depts')
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    if (path === '/smapi-product-by-dept') data = [{ offeringId: 'P1', offeringName: 'demo' }];
    if (path === '/workflow/list')
      data = {
        total: 1,
        pageNo: 1,
        pageSize: 10,
        list: [
          {
            flowName: 'HTTP 发布交互流程',
            firstScene: '开发',
            secondScene: '测试',
            sceneExtensionCode,
            dimType: '产品级',
            dimCode: 'P1',
            dimName: 'demo',
            status: '待发布',
            canPublish: true,
          },
        ],
      };
    if (path === '/extensions/detail')
      data = {
        firstScene: '开发',
        secondScene: '测试',
        readyStatus: '已就绪',
        publishedExtension: {
          extensionName: options.extensionName ?? 'demo-extension',
          description: '原有说明',
        },
        ...(options.omitDetailSceneCode ? {} : { sceneExtensionCode }),
        components: { agents: [{ name: 'review', version: '1.0' }], skills: [], commands: [] },
        layoutMode: layout,
        hasBypass: files.length > 0,
        bypassEntries: files,
      };
    if (path === '/extensions/orgs') data = [{ orgCode: 'org1', orgName: '测试组织' }];
    if (path === '/extensions/structure/tree') {
      const body = req.postDataJSON();
      if (
        req.method() !== 'POST' ||
        [...url.searchParams.keys()].join(',') !== 'userId' ||
        !Array.isArray(body?.components)
      ) {
        return route.fulfill({ status: 400, json: { message: '目录树必须使用 POST JSON 契约' } });
      }
      if (initialTreePending) {
        initialTreePending = false;
        await initialTreeReady;
      }
      data = { layoutMode: layout, entries: entries() };
    }
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
      data = {
        total: 1,
        list: [
          {
            extensionName: 'shared-baseline',
            description: '按工作流名匹配',
            layoutMode: 'standard',
            hasBypass: false,
            entryCount: 0,
            latestVersion: '1.0',
            sourceDimName: '平台开发部',
          },
        ],
      };
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
    await route.fulfill({ json: { code: 0, meta: { success: true }, message: '成功', data } });
  });
  await page.route('**/skill-market/assembly-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="test-host" style="height:100vh"></div>',
    }),
  );
  if (options.fullPage) {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        '__skill_market_parent_context_v1__',
        JSON.stringify({
          type: 'Skill_Square_Init',
          userId: 'user1',
          userName: '发布用户',
          departmentList: [
            { deptId: 'dept-root', deptCode: 'dept-root', deptName: '研发部', deptLevel: 1 },
          ],
        }),
      );
    });
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.locator('#harness-tab-workflows').click();
    await page
      .getByRole('row')
      .filter({ hasText: 'HTTP 发布交互流程' })
      .getByRole('button', { name: '发布', exact: true })
      .click();
  } else {
    await page.goto(`${APP_BASE_PATH}/assembly-test`);
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
  }
  const assembly = page.getByRole('region', { name: 'Extension 发布组装' });
  await expect(assembly).toBeVisible();
  const inheritanceSection = assembly.getByRole('button', { name: /继承与目录结构/ });
  const uploadSection = assembly.getByRole('button', { name: /自定义附加文件/ });
  await expect(inheritanceSection).toHaveAttribute('aria-expanded', 'false');
  await expect(uploadSection).toHaveAttribute('aria-expanded', 'false');
  await inheritanceSection.click();
  await uploadSection.click();
  return {
    assembly,
    requests,
    failNext: (path: string) => {
      failPath = path;
    },
    releaseInitialTree,
  };
}

test.describe('Extension HTTP 发布组装', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('未发布 Extension 移除旁路后仍可下载完整包，折叠目录不影响下载', async ({
    page,
    context,
  }) => {
    const { assembly, requests, failNext } = await setup(page);
    await assembly.getByRole('button', { name: '移除旁路', exact: true }).click();
    await expect(
      assembly
        .getByRole('list', { name: '最终目录结构' })
        .getByText('custom-prompt.md', { exact: true }),
    ).toHaveCount(0);
    const button = assembly.getByRole('button', { name: '下载完整包', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await assembly.getByRole('button', { name: '最终目录结构预览', exact: true }).click();
    await expect(assembly.getByRole('list', { name: '最终目录结构' })).toBeHidden();
    await expect(button).toBeVisible();
    failNext('/extensions/bypass/download');
    await button.click();
    await expect(assembly.getByRole('alert').filter({ hasText: '服务暂不可用' })).toBeVisible();
    await expect(button).toBeEnabled();
    const archive = new PizZip();
    archive.file('scene-code-001/.testagent/agents/review.md', '# Review');
    archive.file('scene-code-001/codeagent-extension.json', '{}');
    await context.route('**/test-package.zip', (route) =>
      route.fulfill({
        contentType: 'application/zip',
        headers: { 'content-disposition': 'attachment; filename="complete.zip"' },
        body: archive.generate({ type: 'nodebuffer' }),
      }),
    );
    let downloadRequest: Request | undefined;
    await page.route('**/api/harness/extensions/bypass/download**', (route) => {
      downloadRequest = route.request();
      return route.fulfill({
        json: {
          code: 0,
          data: { downloadUrl: new URL('/test-package.zip', page.url()).href, expireSeconds: 3600 },
        },
      });
    });
    const downloaded = page.waitForEvent('download');
    await button.click();
    const download = await downloaded;
    expect(await download.failure()).toBeNull();
    const zip = new PizZip(await readFile((await download.path())!));
    expect(zip.file('scene-code-001/.testagent/agents/review.md')?.asText()).toBe('# Review');
    expect(zip.file('scene-code-001/codeagent-extension.json')).toBeTruthy();
    expect(downloadRequest!.method()).toBe('GET');
    expect(Object.fromEntries(new URL(downloadRequest!.url()).searchParams)).toEqual({
      userId: 'user1',
      extensionName: 'scene-code-001',
    });
    expect(requests.some((req) => req.url().includes('/extensions/bypass/clear'))).toBe(true);
  });

  test('已发布布局被后端锁定时，在目标按钮旁显示原因并保留原目标', async ({ page }) => {
    const { assembly, requests } = await setup(page, { fullPage: true });
    const standard = assembly.getByRole('button', { name: 'CodeAgent（标准）' });
    const testagent = assembly.getByRole('button', { name: 'TestAgent', exact: true });
    const publish = assembly.getByRole('button', { name: '确认发布', exact: true });
    await standard.click();
    await expect(publish).toBeEnabled();
    const treeCount = () =>
      requests.filter((req) => new URL(req.url()).pathname.endsWith('/extensions/structure/tree'))
        .length;
    const previousTreeCount = treeCount();
    const lockedMessage = '该Extension已发布，布局（形态）已锁定，不允许切换。';
    let locked = true;
    await page.route('**/api/harness/extensions/layout**', (route) =>
      locked
        ? route.fulfill({ json: { meta: { success: false, message: lockedMessage }, data: null } })
        : route.fallback(),
    );
    await testagent.click();
    const warning = assembly.getByRole('alert').filter({ hasText: lockedMessage });
    await expect(warning).toHaveCount(1);
    await expect(warning).toBeInViewport();
    await expect(standard).toHaveAttribute('aria-pressed', 'true');
    await expect(publish).toBeEnabled();
    expect(treeCount()).toBe(previousTreeCount);
    locked = false;
    await testagent.click();
    await expect(publish).toBeEnabled();
    await expect(testagent).toHaveAttribute('aria-pressed', 'true');
    await expect(warning).toHaveCount(0);
  });

  test('飞机入口可直接发布接口已有名称，不再被新建名称前缀规则拦截', async ({ page }) => {
    const { assembly, requests } = await setup(page, {
      fullPage: true,
      extensionName: 'pipeline-analysis',
    });
    const publish = assembly.getByRole('button', { name: '确认发布', exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect
      .poll(
        () => requests.filter((req) => new URL(req.url()).pathname.endsWith('/extensions')).length,
      )
      .toBe(1);
    const save = requests.find((req) => new URL(req.url()).pathname.endsWith('/extensions'))!;
    expect(new URL(save.url()).pathname).toBe('/api/harness/extensions');
    expect(save.method()).toBe('POST');
    expect(Object.fromEntries(new URL(save.url()).searchParams)).toEqual({
      userId: 'user1',
      operatorName: '发布用户',
      dimType: '产品级',
      dimCode: 'P1',
      dimName: 'demo',
    });
    expect(save.postDataJSON().extensionName).toBe('pipeline-analysis');
    expect(save.postDataJSON().inheritBypass).toBe(true);
    expect(save.postDataJSON()).not.toHaveProperty('layout');
    expect(save.postDataJSON()).not.toHaveProperty('layoutMode');
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
  });

  test('确认发布的校验及接口失败提示始终显示在底部按钮旁，失败后可重试', async ({ page }) => {
    const { assembly, requests, failNext } = await setup(page, { fullPage: true });
    const publish = assembly.getByRole('button', { name: '确认发布', exact: true });
    const footer = assembly
      .locator('footer')
      .filter({ has: page.getByRole('button', { name: '确认发布', exact: true }) });
    const description = page.getByRole('textbox', { name: 'Extension 描述', exact: true });
    await description.fill('');
    await publish.click();
    await expect(footer.getByRole('alert')).toHaveText('请输入 Extension 描述');
    await expect(footer.getByRole('alert')).toBeInViewport();
    expect(requests.some((req) => new URL(req.url()).pathname.endsWith('/extensions'))).toBe(false);
    await description.fill('问题分析说明');
    failNext('/extensions');
    await publish.click();
    await expect(footer.getByRole('alert')).toContainText('服务暂不可用');
    await expect(footer.getByRole('alert')).toBeInViewport();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    expect(
      requests.filter((req) => new URL(req.url()).pathname.endsWith('/extensions')),
    ).toHaveLength(2);
  });

  test('目录树按接口路径展开并沿用 Skill 详情的树形连线样式', async ({ page }, testInfo) => {
    const { assembly } = await setup(page);
    const tree = assembly.getByRole('list', { name: '最终目录结构' });
    await expect(tree.getByText('review.md', { exact: true })).toBeVisible();
    await page.route('**/api/harness/extensions/structure/tree**', (route) =>
      route.fulfill({
        json: {
          code: 0,
          data: {
            layoutMode: 'standard',
            entries: [
              { path: 'scene-code-001/commands/拉取日志.md', type: 'file', source: 'COMPONENT' },
              { path: 'scene-code-001/agents/review.md', type: 'file', source: 'COMPONENT' },
              { path: 'scene-code-001/agents/team/config.yaml', type: 'file', source: 'COMPONENT' },
              { path: 'scene-code-001/skills/log/SKILL.md', type: 'file', source: 'COMPONENT' },
              { path: 'scene-code-001/.cac-plugin/plugin.json', type: 'file', source: 'SYSTEM' },
              { path: 'scene-code-001/docs/empty/', type: 'dir', source: 'FILE' },
              { path: 'scene-code-001/docs/guide.md', type: 'file', source: 'FILE', size: 18 },
            ],
          },
        },
      }),
    );
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await expect(tree.getByText('拉取日志.md', { exact: true })).toBeVisible();
    await expect(tree.locator('.package-tree-name')).toHaveText([
      'scene-code-001/',
      'skills/',
      'log/',
      'SKILL.md',
      'commands/',
      '拉取日志.md',
      'agents/',
      'team/',
      'config.yaml',
      'review.md',
      '.cac-plugin/',
      'plugin.json',
      'docs/',
      'empty/',
      'guide.md',
    ]);
    const commandRow = tree.locator('.package-tree-row').filter({ hasText: '拉取日志.md' });
    await expect(commandRow.locator('.package-tree-branch')).toHaveText('   │  └─ ', {
      useInnerText: true,
    });
    await expect(commandRow).toHaveCSS('font-family', 'Consolas, "Courier New", monospace');
    await commandRow.click();
    await expect(commandRow).toHaveClass(/is-selected/);
    await expect(commandRow).toHaveCSS('background-color', 'rgb(238, 246, 255)');
    await tree.screenshot({ path: testInfo.outputPath('extension-directory-tree.png') });
    const agents = tree.getByRole('button', { name: 'agents/ 组件', exact: true });
    await agents.click();
    await expect(tree.getByText('review.md', { exact: true })).toHaveCount(0);
    await agents.click();
    await expect(tree.getByText('review.md', { exact: true })).toBeVisible();
  });

  test('完整工作区中可点击发布目标、继承和上传', async ({ page }) => {
    const { assembly, requests } = await setup(page, { fullPage: true });
    const tree = assembly.getByRole('list', { name: '最终目录结构' });
    await expect(tree.getByText('.testagent/', { exact: true })).toBeVisible();
    const target = assembly.getByRole('button', { name: 'CodeAgent（标准）' });
    await expect(target).toBeEnabled();
    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/extensions/structure/tree') &&
        response.request().postDataJSON().layout === 'standard',
    );
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await refreshed;
    await expect(tree.getByText('review.md', { exact: true })).toBeVisible();
    const layoutIndex = requests.findIndex((req) =>
      new URL(req.url()).pathname.endsWith('/extensions/layout'),
    );
    const refreshedTree = requests
      .slice(layoutIndex + 1)
      .find((req) => new URL(req.url()).pathname.endsWith('/extensions/structure/tree'))!;
    expect(layoutIndex).toBeGreaterThanOrEqual(0);
    expect(refreshedTree.postDataJSON()).toEqual({
      extensionName: 'scene-code-001',
      layout: 'standard',
      components: [{ componentType: 'agent', componentName: 'review', componentVersion: '1.0' }],
    });
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择继承源' });
    await expect(dialog).toBeVisible();
    await dialog.locator('..').click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('heading', { name: '选择继承源', exact: true }).click();
    await dialog.locator('footer').click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    await dialog.getByRole('button', { name: '关闭选择继承源', exact: true }).click();
    await expect(dialog).toBeHidden();
    const chooser = page.waitForEvent('filechooser');
    await assembly.getByRole('button', { name: /拖拽压缩包到此处/ }).click();
    await (
      await chooser
    ).setFiles({
      name: 'custom.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip-bytes'),
    });
    await expect(assembly.getByText('uploaded.md', { exact: true })).toBeVisible();
  });

  test('飞机入口保留列表场景编码，详情省略编码时仍可切换目标、继承和上传', async ({ page }) => {
    const { assembly, requests } = await setup(page, {
      fullPage: true,
      omitDetailSceneCode: true,
    });
    const target = assembly.getByRole('button', { name: 'CodeAgent（标准）' });
    await expect(target).toBeEnabled();
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择继承源' });
    await dialog.getByRole('searchbox').fill('shared');
    await dialog.getByRole('radio', { name: /shared-baseline/ }).check();
    await dialog.getByRole('button', { name: '确认继承', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await assembly.getByRole('button', { name: /拖拽压缩包到此处/ }).click();
    await (
      await chooser
    ).setFiles({
      name: 'custom.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip-bytes'),
    });
    await expect(assembly.getByText('uploaded.md', { exact: true })).toBeVisible();
    const layout = requests.find((req) =>
      new URL(req.url()).pathname.endsWith('/extensions/layout'),
    )!;
    expect(new URL(layout.url()).searchParams.get('extensionName')).toBe('scene-code-001');
    const structure = requests.find((req) =>
      new URL(req.url()).pathname.endsWith('/extensions/structure/tree'),
    )!;
    expect(structure.postDataJSON().extensionName).toBe('scene-code-001');
    const upload = requests.find((req) =>
      new URL(req.url()).pathname.endsWith('/extensions/bypass'),
    );
    expect(upload?.postData()).toContain('name="extensionName"\r\n\r\nscene-code-001');
    expect(upload?.postData()).not.toContain('demo-extension');
    const inherit = requests.find((req) => new URL(req.url()).pathname.endsWith('/bypass/inherit'));
    expect(inherit?.postDataJSON()).toEqual({
      sourceExtensionName: 'shared-baseline',
      targetExtensionName: 'scene-code-001',
    });
  });

  test('初始目录加载期间仍可选择继承和上传旁路文件', async ({ page }) => {
    const { assembly, releaseInitialTree } = await setup(page, { holdInitialTree: true });
    try {
      await expect(assembly.getByRole('status')).toContainText('正在加载目录');
      const inheritButton = assembly.getByRole('button', { name: /(?:选择|更换)继承/ });
      const uploadButton = assembly.getByRole('button', { name: /拖拽压缩包到此处/ });
      await expect(inheritButton).toBeEnabled();
      await expect(uploadButton).toBeEnabled();
      await expect(assembly.locator('input[type="file"]')).toBeEnabled();
      await inheritButton.click();
      await expect(page.getByRole('dialog', { name: '选择继承源' })).toBeVisible();
    } finally {
      releaseInitialTree?.();
    }
  });

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
    ).toHaveCount(0);
    const inherit = assembly.getByLabel('继承当前旁路文件');
    await expect(inherit).toBeChecked();
    await page.getByLabel('Extension 描述', { exact: true }).fill('填写后保持不变');
    await inherit.uncheck();
    await expect(tree.getByText('custom-prompt.md', { exact: true })).toHaveCount(0);
    await expect(tree.getByText('review.md', { exact: true })).toBeVisible();
    expect(requests.some((req) => req.url().includes('/bypass/clear'))).toBe(false);
    await assembly.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    const save = requests.find((req) => new URL(req.url()).pathname.endsWith('/extensions'))!;
    expect(save.postDataJSON()).toMatchObject({
      inheritBypass: false,
      description: '填写后保持不变',
    });
    expect(save.postDataJSON()).not.toHaveProperty('layout');
    expect(save.postDataJSON()).not.toHaveProperty('layoutMode');
    const detail = requests.find((req) => req.url().includes('/extensions/detail'))!;
    expect(detail.method()).toBe('POST');
    expect(new URL(detail.url()).searchParams.get('userId')).toBe('user1');
    expect(detail.postDataJSON().extensionName).toBe('demo-extension');
    const structure = requests.find((req) => req.url().includes('/structure/tree'))!;
    expect(structure.method()).toBe('POST');
    expect(Object.fromEntries(new URL(structure.url()).searchParams)).toEqual({ userId: 'user1' });
    expect(structure.headers()['content-type']).toContain('application/json');
    expect(structure.postDataJSON()).toEqual({
      extensionName: 'scene-code-001',
      layout: 'testagent',
      components: [{ componentType: 'agent', componentName: 'review', componentVersion: '1.0' }],
    });
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
    await expect(assembly.locator('input[type=file]')).toBeEnabled();
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
    const save = requests.find((req) => new URL(req.url()).pathname.endsWith('/extensions'))!;
    expect(save.postDataJSON().inheritBypass).toBe(true);
  });

  test('服务端搜索结果可按工作流命中，支持仅继承源布局', async ({ page }) => {
    const { assembly, requests, failNext } = await setup(page);
    await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择继承源' });
    await dialog.getByRole('searchbox').fill('测试工作流');
    await dialog.getByRole('radio', { name: /shared-baseline/ }).check();
    await expect(dialog.getByText('无旁路文件，仅继承布局')).toBeVisible();
    await dialog.locator('..').click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox')).toHaveValue('测试工作流');
    await expect(dialog.getByRole('radio', { name: /shared-baseline/ })).toBeChecked();
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
      targetExtensionName: 'scene-code-001',
    });
  });

  test('飞机入口的继承源按页滚动加载，保留选择、支持失败重试和搜索重置', async ({ page }) => {
    const { assembly } = await setup(page, { fullPage: true });
    const queries: { keyword: string; pageNum: number }[] = [];
    const source = (extensionName: string) => ({
      extensionName,
      description: '分页继承来源',
      layoutMode: 'standard',
      hasBypass: false,
      entryCount: 0,
      latestVersion: '1.0',
      sourceDimName: '研发部',
    });
    const rows = [
      source('scene-code-001'),
      ...Array.from({ length: 40 }, (_, i) => source(`paged-source-${i + 1}`)),
    ];
    let releaseSecond!: () => void;
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let secondAttempts = 0;
    await page.route('**/api/harness/extensions/search**', async (route) => {
      const request = route.request();
      const params = new URL(request.url()).searchParams;
      expect(request.method()).toBe('GET');
      expect(params.get('userId')).toBe('user1');
      expect(params.get('pageSize')).toBe('20');
      expect(params.has('limit')).toBe(false);
      const keyword = params.get('keyword')!;
      const pageNum = Number(params.get('pageNum'));
      queries.push({ keyword, pageNum });
      if (keyword === 'paged' && pageNum === 2 && ++secondAttempts === 1) {
        await secondReady;
        await route.fulfill({
          json: { meta: { success: false, message: '下一页查询失败' }, data: null },
        });
        return;
      }
      const matches = keyword === 'paged' ? rows : [source('new-result')];
      await route.fulfill({
        json: {
          meta: { success: true },
          data: { total: matches.length, list: matches.slice((pageNum - 1) * 20, pageNum * 20) },
        },
      });
    });
    try {
      await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '选择继承源' });
      const search = dialog.getByRole('searchbox');
      const results = dialog.getByRole('region', { name: '可继承的 Extension' });
      await search.fill('paged');
      await expect(results.getByRole('radio')).toHaveCount(19);
      const selected = results.getByRole('radio', { name: /^paged-source-1 v/ });
      await selected.check();
      await results.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(results.getByRole('status')).toHaveText('正在加载更多…');
      await expect(results.getByRole('radio')).toHaveCount(19);
      await expect(selected).toBeChecked();
      await results.dispatchEvent('wheel', { deltaY: 200 });
      expect(queries.filter((query) => query.pageNum === 2)).toHaveLength(1);
      releaseSecond();
      await expect(dialog.getByRole('alert')).toContainText('下一页查询失败');
      await expect(selected).toBeChecked();
      await dialog.getByRole('button', { name: '重试', exact: true }).click();
      await expect(results.getByRole('radio')).toHaveCount(39);
      await expect(selected).toBeChecked();
      await results.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(results.getByRole('radio')).toHaveCount(40);
      await expect(results.getByText('已加载全部结果', { exact: true })).toBeVisible();
      await results.dispatchEvent('wheel', { deltaY: 200 });
      await search.fill('new');
      await expect(results.getByRole('radio')).toHaveCount(1);
      await expect(results.getByRole('radio', { name: /new-result/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '确认继承', exact: true })).toBeDisabled();
      expect(await results.evaluate((element) => element.scrollTop)).toBe(0);
      expect(queries).toEqual([
        { keyword: 'paged', pageNum: 1 },
        { keyword: 'paged', pageNum: 2 },
        { keyword: 'paged', pageNum: 2 },
        { keyword: 'paged', pageNum: 3 },
        { keyword: 'new', pageNum: 1 },
      ]);
    } finally {
      releaseSecond();
    }
  });

  test('目录刷新失败显示重试且不回退到 Mock 目录', async ({ page }) => {
    const { assembly, failNext } = await setup(page, { fullPage: true });
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    failNext('/extensions/structure/tree');
    await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
    await expect(assembly.getByRole('button', { name: '重试目录加载' })).toBeVisible();
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await expect(assembly.locator('footer').filter({ hasText: '目录预览未就绪' })).toBeInViewport();
    await expect(assembly.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '返回', exact: true })).toBeEnabled();
    await assembly.getByRole('button', { name: '重试目录加载' }).click();
    await expect(assembly.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    await expect(assembly.getByText('checker.py', { exact: true })).toHaveCount(0);
  });

  test('布局保存和目录刷新期间可连续切换，最终保存最后一次选择', async ({ page }) => {
    const { assembly } = await setup(page, { fullPage: true });
    await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    const layouts: Request[] = [];
    let releaseLayout!: () => void;
    let releaseTree!: () => void;
    const layoutReady = new Promise<void>((resolve) => {
      releaseLayout = resolve;
    });
    const treeReady = new Promise<void>((resolve) => {
      releaseTree = resolve;
    });
    await page.route('**/api/harness/extensions/layout**', async (route) => {
      layouts.push(route.request());
      if (layouts.length === 1) await layoutReady;
      await route.fallback();
    });
    await page.route('**/api/harness/extensions/structure/tree**', async (route) => {
      if (route.request().postDataJSON().layout === 'standard') await treeReady;
      await route.fallback();
    });
    const standard = assembly.getByRole('button', { name: 'CodeAgent（标准）' });
    const testagent = assembly.getByRole('button', { name: 'TestAgent', exact: true });
    const publish = assembly.getByRole('button', { name: '确认发布', exact: true });
    try {
      const saving = page.waitForRequest('**/api/harness/extensions/layout**');
      await standard.click();
      await saving;
      await expect(standard).toBeEnabled();
      await expect(standard).toHaveCSS('cursor', 'pointer');
      await expect(testagent).toBeEnabled();
      await expect(standard).toHaveAttribute('aria-pressed', 'true');
      await expect(publish).toBeDisabled();
      await testagent.click();
      await expect(testagent).toHaveAttribute('aria-pressed', 'true');
      expect(layouts).toHaveLength(1);
      const refreshing = page.waitForRequest('**/api/harness/extensions/structure/tree**');
      releaseLayout();
      await refreshing;
      await standard.click();
      await testagent.click();
      await expect(standard).toBeEnabled();
      await expect(publish).toBeDisabled();
      expect(layouts).toHaveLength(1);
      releaseTree();
      await expect(publish).toBeEnabled();
      await expect(testagent).toHaveAttribute('aria-pressed', 'true');
      expect(layouts.map((req) => new URL(req.url()).searchParams.get('layout'))).toEqual([
        'standard',
        'testagent',
      ]);
      await expect(assembly.getByText('review.md', { exact: true })).toBeVisible();
    } finally {
      releaseLayout();
      releaseTree();
    }
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
          data: {
            total: 1,
            list: [
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

import type { Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('Extension 详情与发布旁路 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('详情旁路清单支持本次发布取消继承，保留发布字段与历史重试', async ({ page }, testInfo) => {
    const detailRequests: Request[] = [];
    const bindingRequests: Request[] = [];
    const publishRequests: Request[] = [];
    const organizationRequests: Request[] = [];
    const historyRequests: Request[] = [];
    const assetRequests: Request[] = [];
    const retryRequests: Request[] = [];
    const clearRequests: Request[] = [];
    let historyRecords = [
      {
        id: 'older-release',
        firstScene: '应用开发',
        secondScene: '代码开发',
        extensionName: 'udm-code-extension',
        version: '0.9.0',
        publishStatus: '发布成功',
        description: '旧发布历史中的描述',
        publishedAt: '2026-07-01 10:00:00',
        operatorId: 'author-1',
        operatorName: '原发布人',
        targetOrgName: '目标组织',
        releaseType: 'beta',
        errorMessage: '',
        commands: [{ name: 'udm-code-command', version: '1.0.0' }],
      },
    ];
    const detail = {
      firstScene: '应用开发',
      secondScene: '代码开发',
      readyStatus: '已就绪',
      sceneExtensionCode: 'scene-code-1',
      layoutMode: 'testagent',
      hasBypass: true,
      bypassEntries: [
        { path: 'docs/config.json', size: 24 },
        { path: 'assets/logo.png', size: 2048 },
      ],
      publishChecks: {
        beta: { canPublish: true, message: '清单完备，可发布' },
        product: { canPublish: true, message: '清单完备，可发布' },
      },
      publishedExtension: {
        extensionName: 'udm-code-extension',
        version: '1.0.0',
        description: '新详情接口提供的描述',
        publishStatus: '发布成功',
      },
      components: {
        commands: [{ name: 'udm-code-command', version: '2.0.0', uploadAt: '2026-08-01 10:00:00' }],
        agents: [{ name: 'udm-code-agent', version: '3.0.0', uploadAt: '2026-08-02 10:00:00' }],
        skills: [],
      },
    };
    let rejectDetail = false;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data: unknown = [];
      if (path.includes('/components/')) {
        assetRequests.push(request);
      } else if (path.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product-1', offeringName: 'udm' }];
      } else if (path.endsWith('/scene-activity/scene')) {
        data = [
          { firstScene: '应用开发', secondScene: '代码开发', sort: 0 },
          { firstScene: '应用开发', secondScene: '场景二', sort: 1 },
        ];
      } else if (path.endsWith('/scenes/bindings')) {
        bindingRequests.push(request);
      } else if (path === '/api/harness/extensions/detail') {
        detailRequests.push(request);
        if (rejectDetail) {
          await route.fulfill({
            json: { meta: { success: false, message: 'DETAIL_UNAVAILABLE' }, data: null },
          });
          return;
        }
        const payload = request.postDataJSON() as Record<string, unknown>;
        data =
          payload.secondScene === '场景二' || payload.extensionName === 'scene-code-2'
            ? { ...detail, secondScene: '场景二', sceneExtensionCode: 'scene-code-2' }
            : detail;
      } else if (path.endsWith('/extensions/orgs')) {
        organizationRequests.push(request);
        data = [{ orgCode: 'org-1', orgName: '目标组织' }];
      } else if (path.endsWith('/extensions/structure/tree')) {
        data = {
          layoutMode: detail.layoutMode,
          entries: detail.bypassEntries.map((entry) => ({
            ...entry,
            type: 'file',
            source: 'FILE',
          })),
        };
      } else if (path.endsWith('/extensions/history')) {
        historyRequests.push(request);
        data = historyRecords;
      } else if (path.endsWith('/retry')) {
        retryRequests.push(request);
        data = 'retry-1';
      } else if (path === '/api/harness/extensions/save' && request.method() === 'POST') {
        publishRequests.push(request);
        data = 'release-1';
      } else if (path.endsWith('/extensions/bypass/clear')) {
        clearRequests.push(request);
      }
      await route.fulfill({
        json: {
          meta: { success: true, message: 'OK', number: Array.isArray(data) ? data.length : 0 },
          data,
        },
      });
    });

    await page.route(`**${APP_BASE_PATH}/extension-test`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    await page.goto(`${APP_BASE_PATH}/extension-test`);
    await page.evaluate(async () => {
      const componentUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
      const componentSource = await (await fetch(componentUrl)).text();
      const vueUrl = componentSource.match(/from ["']([^"']*\/vue\.js[^"']*)["']/)?.[1];
      if (!vueUrl) throw new Error('Vite did not emit a Vue dependency URL');
      const { createApp, h } = await import(vueUrl);
      const { default: Component } = await import(componentUrl);
      createApp({
        setup() {
          return () =>
            h(Component, {
              userId: 'extension-tester',
              userName: 'Extension 测试用户',
              departmentTree: [{ id: 'dept-1', deptCode: 'dept-1', name: '研发部', children: [] }],
              currentUserDepartmentPath: ['研发部'],
              allowedDepartmentPaths: [['研发部']],
              restrictToAllowedDepartments: true,
            });
        },
      }).mount('#test-host');
    });
    expect(assetRequests).toHaveLength(0);
    const panel = page.locator('#test-host');
    await expect(panel.locator('.extension-name')).toHaveText('udm-code-extension');
    await expect(panel.locator('.extension-description')).toHaveText('新详情接口提供的描述');
    await expect(panel.locator('.version-text')).toHaveText('v1.0.0');
    await expect(panel.getByRole('button', { name: /udm-code-agent/ })).toContainText('2026-08-02');
    await expect(panel.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
    expect(detailRequests).toHaveLength(1);
    expect(bindingRequests).toHaveLength(0);
    expect(detailRequests[0]!.method()).toBe('POST');
    expect(Object.fromEntries(new URL(detailRequests[0]!.url()).searchParams)).toEqual({
      userId: 'extension-tester',
    });
    expect(detailRequests[0]!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'product-1',
      dimName: 'udm',
      firstScene: '应用开发',
      secondScene: '代码开发',
    });
    expect(historyRequests).toHaveLength(0);

    const initialDetails = detailRequests.length;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect.poll(() => detailRequests.length).toBe(initialDetails + 1);
    await expect(panel.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
    expect(bindingRequests).toHaveLength(0);

    await panel.getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /目标组织/ })).toHaveAttribute(
      'data-value',
      'org-1',
    );
    await expect(dialog.getByRole('textbox', { name: /Extension 名称/ })).toHaveValue(
      'udm-code-extension',
    );
    await expect(dialog.getByRole('textbox', { name: /Extension 名称/ })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(dialog.getByRole('combobox', { name: /发布通道/ })).toHaveAttribute(
      'data-value',
      'beta',
    );
    const bypass = dialog.getByRole('region', { name: '发布时继承当前旁路文件' });
    const inherit = bypass.getByRole('checkbox', { name: '发布时继承当前旁路文件' });
    await expect(inherit).toBeChecked();
    await expect(bypass.getByRole('listitem')).toHaveCount(2);
    await expect(bypass).toContainText('docs/config.json');
    await expect(bypass).toContainText('24 B');
    await expect(bypass).toContainText('assets/logo.png');
    await expect(bypass).toContainText('2 KB');
    await expect(bypass).toContainText('本次发布将包含以下编辑态旁路文件');
    await inherit.uncheck();
    await expect(bypass.getByRole('alert')).toContainText('本次发布将在打包前清空编辑态旁路文件');
    expect(clearRequests).toHaveLength(0);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await panel.getByRole('button', { name: '发布', exact: true }).click();
    await expect(inherit).toBeChecked();
    await expect(bypass.getByRole('alert')).toHaveCount(0);
    await expect(bypass.getByRole('listitem')).toHaveCount(2);
    await inherit.uncheck();
    await dialog.screenshot({ path: testInfo.outputPath('legacy-publish-dialog.png') });
    expect(historyRequests).toHaveLength(0);
    expect(organizationRequests).toHaveLength(2);
    expect(Object.fromEntries(new URL(organizationRequests[0]!.url()).searchParams)).toEqual({
      userId: 'extension-tester',
      dimType: '产品级',
      dimCode: 'product-1',
    });
    await dialog.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(historyRequests).toHaveLength(0);
    expect(publishRequests).toHaveLength(1);
    expect(publishRequests[0]!.postDataJSON()).toEqual({
      extensionName: 'udm-code-extension',
      description: '新详情接口提供的描述',
      releaseType: 'beta',
      inheritBypass: false,
      firstScene: '应用开发',
      secondScene: '代码开发',
      targetOrgCode: 'org-1',
      targetOrgName: '目标组织',
      commands: [{ name: 'udm-code-command', version: '2.0.0' }],
      agents: [{ name: 'udm-code-agent', version: '3.0.0' }],
      skills: [],
    });
    expect(Object.fromEntries(new URL(publishRequests[0]!.url()).searchParams)).toEqual({
      userId: 'extension-tester',
      operatorName: 'Extension 测试用户',
      dimType: '产品级',
      dimCode: 'product-1',
      dimName: 'udm',
    });
    expect(publishRequests[0]!.postData()).not.toMatch(/"layout(?:Mode)?"\s*:/);
    expect(new URL(publishRequests[0]!.url()).searchParams.has('layout')).toBe(false);
    expect(clearRequests).toHaveLength(0);

    // A cancelled opt-out must not leak into another scene's publication.
    await panel.getByRole('button', { name: '发布', exact: true }).click();
    await expect(inherit).toBeChecked();
    await inherit.uncheck();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await panel.getByRole('button', { name: /应用开发 场景二/ }).click();
    await expect(
      panel.getByRole('heading', { name: '应用开发 / 场景二', exact: true }),
    ).toBeVisible();
    await panel.getByRole('button', { name: '发布', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: '发布时继承当前旁路文件' })).toBeChecked();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect(
      panel.getByRole('heading', { name: '应用开发 / 代码开发', exact: true }),
    ).toBeVisible();

    const historyCount = historyRequests.length;
    historyRecords = [
      {
        ...historyRecords[0]!,
        id: 'failed-release',
        version: '1.0.0',
        publishStatus: '发布失败',
        errorMessage: '原平台发布失败原因',
        publishedAt: '2026-07-02 10:00:00',
      },
      ...historyRecords,
      {
        ...historyRecords[0]!,
        id: 'release-08',
        version: '0.8.0',
        publishedAt: '2026-06-01 10:00:00',
      },
      {
        ...historyRecords[0]!,
        id: 'release-07',
        version: '0.7.0',
        publishedAt: '2026-05-01 10:00:00',
      },
    ];
    await panel.getByRole('button', { name: '发布历史', exact: true }).click();
    const historyDialog = page.getByRole('dialog', { name: /发布历史/ });
    await expect(historyDialog.locator('.timeline-item')).toHaveCount(3);
    await expect(historyDialog).toContainText('原平台发布失败原因');
    await expect(historyDialog).toContainText('原发布人（author-1）');
    await expect(historyDialog).toContainText('内部结构（1 项）');
    await historyDialog.screenshot({ path: testInfo.outputPath('legacy-history-dialog.png') });
    expect(historyRequests).toHaveLength(historyCount + 1);
    await historyDialog.getByRole('button', { name: /加载更多/ }).click();
    await expect(historyDialog.locator('.timeline-item')).toHaveCount(4);
    await historyDialog.getByRole('button', { name: /重试发布/ }).click();
    await expect.poll(() => retryRequests.length).toBe(1);
    expect(new URL(retryRequests[0]!.url()).pathname).toBe(
      '/api/harness/extensions/failed-release/retry',
    );
    expect(retryRequests[0]!.method()).toBe('POST');
    expect(Object.fromEntries(new URL(retryRequests[0]!.url()).searchParams)).toEqual({
      userId: 'extension-tester',
      operatorName: 'Extension 测试用户',
    });
    await historyDialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    rejectDetail = true;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect(panel.getByRole('alert').filter({ hasText: 'DETAIL_UNAVAILABLE' })).toBeVisible();
    expect(bindingRequests).toHaveLength(0);
    expect(assetRequests).toHaveLength(0);
  });

  for (const hasBypass of [true, false]) {
    test(`嵌入式发布默认继承旁路（hasBypass=${hasBypass}）`, async ({ page }) => {
      const saves: Request[] = [];
      const clears: Request[] = [];
      const details: Request[] = [];
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const endpoint = new URL(request.url()).pathname;
        let data: unknown = [];
        if (endpoint === '/api/harness/extensions/detail') {
          details.push(request);
          data = {
            firstScene: '开发',
            secondScene: '嵌入发布',
            sceneExtensionCode: 'embedded-scene',
            readyStatus: '已就绪',
            layoutMode: 'standard',
            hasBypass,
            bypassEntries: hasBypass ? [{ path: 'docs/readme.md', size: 1048576 }] : [],
            publishedExtension: {
              extensionName: 'udm-embedded',
              version: '1.0.0',
              description: '嵌入式描述',
              publishStatus: '发布成功',
            },
            components: {
              skills: [{ name: 'udm-skill', version: '1.0.0' }],
              commands: [],
              agents: [],
            },
            publishChecks: {
              beta: { canPublish: false, message: 'beta 配置未变化' },
              product: { canPublish: true, message: 'product 可以发布' },
            },
          };
        } else if (endpoint.endsWith('/extensions/orgs')) {
          data = [{ orgCode: 'org-embedded', orgName: '嵌入式组织' }];
        } else if (endpoint.endsWith('/extensions/structure/tree')) {
          data = { layoutMode: 'standard', entries: [] };
        } else if (endpoint === '/api/harness/extensions/save') {
          saves.push(request);
          data = 'release-embedded';
        } else if (endpoint.endsWith('/extensions/bypass/clear')) {
          clears.push(request);
        }
        await route.fulfill({ json: { meta: { success: true, message: 'OK' }, data } });
      });
      await page.route(`**${APP_BASE_PATH}/embedded-publish-test`, (route) =>
        route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
      );
      await page.goto(`${APP_BASE_PATH}/embedded-publish-test`);
      await page.evaluate(async () => {
        const componentUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
        const source = await (await fetch(componentUrl)).text();
        const vueUrl = source.match(/from ["']([^"']*\/vue\.js[^"']*)["']/)?.[1];
        if (!vueUrl) throw new Error('Vite did not emit a Vue dependency URL');
        const { createApp, h } = await import(vueUrl);
        const { default: Component } = await import(componentUrl);
        const serviceUrl = '/skill-market/src/services/skillMarket/extensionPublishHttp.ts';
        const { queryHttpExtensionDetail } = await import(serviceUrl);
        const scope = {
          dimType: '产品级',
          dimCode: 'product-1',
          dimName: 'udm',
          productId: 'product-1',
          departmentPath: ['研发部'],
        };
        const scene = await queryHttpExtensionDetail('context-user', scope, {
          extensionName: 'embedded-scene',
        });
        createApp({
          setup: () => () =>
            h(Component, {
              userId: 'context-user',
              userName: 'Context User',
              releaseContext: { scope, scene, productName: 'udm' },
            }),
        }).mount('#test-host');
      });
      const panel = page.getByRole('region', { name: '发布 Extension · 嵌入发布' });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('textbox', { name: 'Extension 描述' })).toHaveValue(
        '嵌入式描述',
      );
      await expect(panel).toContainText('包含清单（1 项）');
      const assembly = page.getByRole('region', { name: 'Extension 发布组装' });
      await assembly.getByRole('button', { name: /继承与目录结构/ }).click();
      const inherit = assembly.getByRole('checkbox', { name: '继承当前旁路文件' });
      if (hasBypass) {
        await expect(inherit).toBeChecked();
        await expect(assembly).toContainText('docs/readme.md');
        await expect(assembly).toContainText('1.0 MB');
      } else {
        await expect(inherit).toHaveCount(0);
      }
      const confirmPublish = assembly.getByRole('button', { name: '确认发布', exact: true });
      await expect(confirmPublish).toBeDisabled();
      await expect(panel).toContainText('beta 配置未变化');
      await panel.getByRole('combobox', { name: /发布通道/ }).click();
      await page.getByRole('option', { name: 'product', exact: true }).click();
      await expect(panel).toContainText('product 可以发布');
      await confirmPublish.click();
      await expect(panel).toBeHidden();
      expect(saves).toHaveLength(1);
      expect(saves[0]!.method()).toBe('POST');
      expect(Object.fromEntries(new URL(saves[0]!.url()).searchParams)).toEqual({
        userId: 'context-user',
        operatorName: 'Context User',
        dimType: '产品级',
        dimCode: 'product-1',
        dimName: 'udm',
      });
      expect(saves[0]!.postDataJSON()).toEqual({
        extensionName: 'udm-embedded',
        description: '嵌入式描述',
        releaseType: 'product',
        inheritBypass: true,
        firstScene: '开发',
        secondScene: '嵌入发布',
        targetOrgCode: 'org-embedded',
        targetOrgName: '嵌入式组织',
        skills: [{ name: 'udm-skill', version: '1.0.0' }],
        commands: [],
        agents: [],
      });
      expect(clears).toHaveLength(0);
      expect(details[0]!.method()).toBe('POST');
      expect(Object.fromEntries(new URL(details[0]!.url()).searchParams)).toEqual({
        userId: 'context-user',
      });
      expect(details[0]!.postDataJSON()).toEqual({
        dimType: '产品级',
        dimCode: 'product-1',
        dimName: 'udm',
        extensionName: 'embedded-scene',
      });
    });
  }
});

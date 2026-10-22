import type { Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('旧资产清单 Extension 场景绑定与发布', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('选择场景沿用绑定和历史接口，已有名称不走新详情，发布保留旧请求体', async ({
    page,
  }, testInfo) => {
    const detailRequests: Request[] = [];
    const bindingRequests: Request[] = [];
    const publishRequests: Request[] = [];
    const organizationRequests: Request[] = [];
    const historyRequests: Request[] = [];
    const catalogRequests: Request[] = [];
    const assetRequests: Request[] = [];
    const retryRequests: Request[] = [];
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
    let rejectBindings = false;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/management/query')) {
        catalogRequests.push(request);
        const type = path.includes('/commands/')
          ? 'command'
          : path.includes('/agents/')
            ? 'agent'
            : 'skill';
        data = [
          {
            id: `${type}-1`,
            name: `udm-legacy-${type}`,
            [`${type}Name`]: `udm-legacy-${type}`,
            description: '旧清单记录',
            dimType: '产品级',
            dimCode: 'product-1',
            dimName: 'udm',
            status: '未开始',
            versions: [],
          },
        ];
      } else if (path.includes('/components/')) {
        assetRequests.push(request);
      } else if (path.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product-1', offeringName: 'udm' }];
      } else if (path.endsWith('/scene-activity/scene')) {
        data = [{ firstScene: '应用开发', secondScene: '代码开发', sort: 0 }];
      } else if (path.endsWith('/scenes/bindings')) {
        bindingRequests.push(request);
        if (rejectBindings) {
          await route.fulfill({
            json: { meta: { success: false, message: 'BINDINGS_UNAVAILABLE' }, data: null },
          });
          return;
        }
        data = [
          {
            firstScene: '应用开发',
            secondScenes: [
              {
                secondScene: '代码开发',
                ready: true,
                components: detail.components,
              },
            ],
          },
        ];
      } else if (path.endsWith('/extensions/detail')) {
        detailRequests.push(request);
        data = detail;
      } else if (path.endsWith('/extensions/orgs')) {
        organizationRequests.push(request);
        data = [{ orgCode: 'org-1', orgName: '目标组织' }];
      } else if (path.endsWith('/extensions/history')) {
        historyRequests.push(request);
        data = historyRecords;
      } else if (path.endsWith('/retry')) {
        retryRequests.push(request);
        data = 'retry-1';
      } else if (path.endsWith('/extensions') && request.method() === 'POST') {
        publishRequests.push(request);
        data = 'release-1';
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
      const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
      const componentUrl = '/skill-market/src/views/skill/HarnessCapabilityManagementPage.vue';
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
    for (const [tab, endpoint] of [
      ['command', '/api/harness/commands/management/query'],
      ['skill', '/api/harness/skills/management/query'],
      ['agent', '/api/harness/agents/management/query'],
    ]) {
      await page.locator(`#capability-management-tab-${tab}`).click();
      await expect(page.locator(`#capability-management-panel-${tab}`)).toContainText(
        `udm-legacy-${tab}`,
      );
      const request = catalogRequests.find((item) => new URL(item.url()).pathname === endpoint);
      expect(request, `${tab} uses its original management endpoint`).toBeDefined();
      expect(request!.method()).toBe('GET');
      expect(Object.fromEntries(new URL(request!.url()).searchParams)).toMatchObject({
        userId: 'extension-tester',
        dimType: '产品级',
        dimCode: 'product-1',
        dimName: 'udm',
        pageNum: '1',
        pageSize: '10',
      });
    }
    expect(assetRequests).toHaveLength(0);
    await page.locator('#capability-management-tab-extension').click();
    const panel = page.locator('#capability-management-panel-extension');
    await expect(panel.locator('.extension-name')).toHaveText('udm-code-extension');
    await expect(panel.locator('.extension-description')).toHaveText('旧发布历史中的描述');
    await expect(panel.locator('.version-text')).toHaveText('v0.9.0');
    await expect(panel.getByRole('button', { name: /udm-code-agent/ })).toContainText('2026-08-02');
    await expect(panel.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
    expect(detailRequests).toHaveLength(0);
    expect(bindingRequests).toHaveLength(1);
    expect(bindingRequests[0]!.method()).toBe('POST');
    expect(new URL(bindingRequests[0]!.url()).searchParams.get('userId')).toBe('extension-tester');
    expect(bindingRequests[0]!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'product-1',
      dimName: 'udm',
    });
    expect(historyRequests).toHaveLength(1);

    const initialBindings = bindingRequests.length;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect.poll(() => bindingRequests.length).toBe(initialBindings + 1);
    await expect(panel.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
    expect(detailRequests).toHaveLength(0);

    await panel.getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: '目标组织' })).toHaveValue('org-1');
    await expect(dialog.getByRole('textbox', { name: /Extension 名称/ })).toHaveValue(
      'udm-code-extension',
    );
    await expect(dialog.getByRole('textbox', { name: /Extension 名称/ })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(dialog.getByRole('combobox', { name: '发布通道' })).toHaveValue('beta');
    await dialog.screenshot({ path: testInfo.outputPath('legacy-publish-dialog.png') });
    expect(historyRequests).toHaveLength(2);
    expect(organizationRequests).toHaveLength(1);
    expect(Object.fromEntries(new URL(organizationRequests[0]!.url()).searchParams)).toEqual({
      userId: 'extension-tester',
      dimType: '产品级',
      dimCode: 'product-1',
    });
    await dialog.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(historyRequests).toHaveLength(3);
    expect(publishRequests).toHaveLength(1);
    expect(publishRequests[0]!.postDataJSON()).toMatchObject({
      extensionName: 'udm-code-extension',
      description: '旧发布历史中的描述',
      releaseType: 'beta',
      firstScene: '应用开发',
      secondScene: '代码开发',
      targetOrgCode: 'org-1',
      targetOrgName: '目标组织',
      commands: [{ name: 'udm-code-command', version: '2.0.0' }],
      agents: [{ name: 'udm-code-agent', version: '3.0.0' }],
      skills: [],
    });
    expect(new URL(publishRequests[0]!.url()).searchParams.get('operatorName')).toBe(
      'Extension 测试用户',
    );

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
    rejectBindings = true;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect(panel.getByRole('alert')).toContainText('BINDINGS_UNAVAILABLE');
    expect(detailRequests).toHaveLength(0);
    expect(assetRequests).toHaveLength(0);
  });
});

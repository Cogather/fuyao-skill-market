import { expect, test, type Page, type Request } from '@playwright/test';
import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

const success = (data: unknown) => ({ meta: { success: true }, data });
const workflow = (name: string, status = '待发布') => ({
  flowName: name,
  flowDescription: `${name}说明`,
  firstScene: '研发提效',
  secondScene: '接口生成',
  secondSceneDescription: '接口场景说明',
  sceneExtensionCode: 'api-code',
  dimType: '产品级',
  dimCode: 'remote-product',
  dimName: '服务端产品',
  commandCount: 7,
  status,
  changed: false,
  canPublish: true,
  targetOrgCode: 'org-target',
  targetOrgName: '目标组织',
  latestPublishTime: '2026-09-15 10:20:30',
  latestVersion: '1.3.0',
});

async function prepare(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts'))
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    else if (path.endsWith('/smapi-product-by-dept'))
      data = [{ offeringId: 'remote-product', offeringName: '产品筛选项' }];
    // A scene endpoint failure must not prevent the independent workflow inventory from loading.
    else if (path.endsWith('/scene-activity/scene'))
      return route.fulfill({
        json: { meta: { success: false, message: '场景列表不可用' }, data: null },
      });
    await route.fulfill({ json: success(data) });
  });
}

async function mountWorkflowPage(page: Page) {
  await page.route('**/skill-market/workflow-list-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/workflow-list-test');
  await page.evaluate(async () => {
    const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
    const workspaceUrl = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
    const componentUrl = '/skill-market/src/views/skill/HarnessWorkflowsPage.vue';
    const { createApp, h } = await import(vueUrl);
    const { createHarnessScenarioWorkspace } = await import(workspaceUrl);
    const { default: Component } = await import(componentUrl);
    createApp({
      setup() {
        const workspace = createHarnessScenarioWorkspace(() => ({
          ready: true,
          userId: 'workflow-reader',
          departmentTree: [
            {
              id: 'dept-root',
              deptCode: 'dept-root',
              name: '研发部',
              children: [
                { id: 'dept-child', deptCode: 'dept-child', name: '平台组', children: [] },
              ],
            },
          ],
          defaultDepartmentPath: ['研发部'],
          allowedDepartmentPaths: [['研发部']],
          restrictToAllowedDepartments: true,
        }));
        return () =>
          h('div', { id: 'harness-panel-workflows' }, [
            h('span', { id: 'workflow-list-event-probe', 'data-open-count': '0' }),
            h(Component, {
              workspace,
              userName: '工作流发布人',
              onOpenScenarios() {
                const probe = document.getElementById('workflow-list-event-probe');
                probe?.setAttribute(
                  'data-open-count',
                  String(Number(probe.getAttribute('data-open-count')) + 1),
                );
              },
            }),
          ]);
      },
    }).mount('#test-host');
  });
}

test.describe('Harness 工作流服务端列表', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('独立读取后端分页和总数，并传递部门路径、产品编码及状态筛选', async ({ page }) => {
    await prepare(page);
    const queries: { method: string; params: Record<string, string> }[] = [];
    await page.route('**/api/harness/workflow/list**', async (route) => {
      const params = Object.fromEntries(new URL(route.request().url()).searchParams);
      queries.push({ method: route.request().method(), params });
      const pageNo = Number(params.pageNo);
      const filtered = Boolean(params.status || params.productCode || params.dimName.includes('/'));
      await route.fulfill({
        json: success({
          total: filtered ? 1 : 23,
          pageNo,
          pageSize: 10,
          list: [workflow(`服务端第${pageNo}页`, params.status || '待发布')],
        }),
      });
    });
    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    await expect(harness.workflowsPanel.getByText('共 23 条', { exact: true })).toBeVisible();
    expect(queries.at(-1)).toEqual({
      method: 'GET',
      params: {
        userId: 'workflow-reader',
        dimName: '研发部',
        pageNo: '1',
        pageSize: '10',
      },
    });
    const row = harness.workflowInventoryRow('服务端第1页');
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell').nth(1)).toHaveText('服务端产品');
    await expect(row).toContainText('研发提效 / 接口生成');
    await expect(row).toContainText('7 个');
    await expect(
      harness.workflowsTable.getByRole('columnheader', { name: '部门', exact: true }),
    ).toHaveCount(0);
    await expect(harness.workflowsPanel.locator('.wf-status-count')).toHaveCount(0);
    await expect(
      harness.workflowsPanel.getByRole('button', { name: '待发布', exact: true }),
    ).toHaveCount(1);

    await harness.workflowsNextPageButton.click();
    await expect(harness.workflowInventoryRow('服务端第2页')).toBeVisible();
    expect(queries.at(-1)?.params.pageNo).toBe('2');
    await expect(harness.workflowsTable.locator('tbody tr')).toHaveCount(1);
    await harness.workflowStatusButton('已发布').click();
    await expect(harness.workflowsPanel.getByText('共 1 条', { exact: true })).toBeVisible();
    expect(queries.at(-1)?.params).toMatchObject({ status: '已发布', pageNo: '1' });
    await harness.selectWorkflowProduct('产品筛选项');
    await expect.poll(() => queries.at(-1)?.params.productCode).toBe('remote-product');
    await harness.selectWorkflowDepartment('平台组');
    await expect.poll(() => queries.at(-1)?.params.dimName).toBe('研发部/平台组');
    expect(queries.at(-1)?.params).toEqual({
      userId: 'workflow-reader',
      dimName: '研发部/平台组',
      pageNo: '1',
      pageSize: '10',
    });
  });

  test('操作列始终显示查看发布历史并按状态、canPublish 和 changed 显示发布', async ({ page }) => {
    await prepare(page);
    await page.route('**/api/harness/workflow/list**', (route) =>
      route.fulfill({
        json: success({
          total: 5,
          pageNo: 1,
          pageSize: 10,
          list: [
            { ...workflow('设计中可发布', '开发中'), canPublish: true, changed: true },
            { ...workflow('待发布允许', '待发布'), canPublish: true, changed: false },
            { ...workflow('待发布拒绝', '待发布'), canPublish: false, changed: true },
            { ...workflow('已发布有变更', '已发布'), canPublish: true, changed: true },
            { ...workflow('已发布无变更', '已发布'), canPublish: true, changed: false },
          ],
        }),
      }),
    );
    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);

    await expect(
      harness.workflowsTable.getByRole('columnheader', { name: '操作', exact: true }),
    ).toBeVisible();
    await expect(harness.workflowInventoryRow('设计中可发布').getByRole('cell').nth(2)).toHaveText(
      '设计中',
    );
    const actionableRow = harness.workflowInventoryRow('待发布允许');
    const historyButton = actionableRow.getByRole('button', {
      name: '查看发布历史',
      exact: true,
    });
    const publishButton = actionableRow.getByRole('button', { name: '发布', exact: true });
    await expect(historyButton).toHaveAttribute('title', '查看发布历史');
    await expect(historyButton.locator('svg')).toHaveCount(1);
    await expect(historyButton).toHaveText('');
    await expect(publishButton).toHaveAttribute('title', '发布');
    await expect(publishButton.locator('svg')).toHaveCount(1);
    await expect(publishButton).toHaveText('');
    for (const name of [
      '设计中可发布',
      '待发布允许',
      '待发布拒绝',
      '已发布有变更',
      '已发布无变更',
    ]) {
      await expect(
        harness
          .workflowInventoryRow(name)
          .getByRole('button', { name: '查看发布历史', exact: true }),
      ).toBeEnabled();
    }
    await expect(
      harness
        .workflowInventoryRow('设计中可发布')
        .getByRole('button', { name: '发布', exact: true }),
    ).toHaveCount(0);
    await expect(
      harness.workflowInventoryRow('待发布允许').getByRole('button', { name: '发布', exact: true }),
    ).toBeEnabled();
    await expect(
      harness.workflowInventoryRow('待发布拒绝').getByRole('button', { name: '发布', exact: true }),
    ).toHaveCount(0);
    await expect(
      harness
        .workflowInventoryRow('已发布有变更')
        .getByRole('button', { name: '发布', exact: true }),
    ).toBeEnabled();
    await expect(
      harness
        .workflowInventoryRow('已发布无变更')
        .getByRole('button', { name: '发布', exact: true }),
    ).toHaveCount(0);

    await expect(page.locator('#workflow-list-event-probe')).toHaveAttribute(
      'data-open-count',
      '0',
    );
  });

  test('仅有 Command 的工作流显示查看按钮，并支持展开内容与失败重试', async ({ page }) => {
    await prepare(page);
    const detailRequests: Request[] = [];
    const contentRequests: Request[] = [];
    let contentAttempts = 0;
    await page.route('**/api/harness/workflow/list**', (route) =>
      route.fulfill({
        json: success({
          total: 3,
          pageNo: 1,
          pageSize: 10,
          list: [
            { ...workflow('有入口流程'), commandCount: 2 },
            { ...workflow('无入口流程'), commandCount: 0 },
            { ...workflow('入口数量未知'), commandCount: null },
          ],
        }),
      }),
    );
    await page.route('**/api/harness/workflow/detail**', (route) => {
      detailRequests.push(route.request());
      return route.fulfill({
        json: success({
          flowName: '有入口流程',
          flowDescription: '流程说明',
          sceneExtensionCode: 'api-code',
          secondSceneDescription: '接口说明',
          commands: [
            { commandName: '/build-api', description: '构建并检查接口', version: '2.1.0' },
            { commandName: '/draft-api', description: '仍在设计中的入口', version: null },
          ],
          assetPool: [],
          stages: [],
          steps: [],
          nextStep: 0,
          allDone: false,
        }),
      });
    });
    await page.route('**/api/harness/packages/file**', (route) => {
      contentRequests.push(route.request());
      contentAttempts += 1;
      if (contentAttempts === 1) {
        return route.fulfill({
          json: { meta: { success: false, message: 'Command 内容暂时不可用' }, data: null },
        });
      }
      return route.fulfill({
        json: success('# /build-api\n\n执行接口构建与校验。'),
      });
    });

    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    const populatedRow = harness.workflowInventoryRow('有入口流程');
    await expect(
      populatedRow.getByRole('button', { name: '查看 Command', exact: true }),
    ).toBeVisible();
    await expect(
      harness
        .workflowInventoryRow('无入口流程')
        .getByRole('button', { name: '查看 Command', exact: true }),
    ).toHaveCount(0);
    await expect(
      harness
        .workflowInventoryRow('入口数量未知')
        .getByRole('button', { name: '查看 Command', exact: true }),
    ).toHaveCount(0);

    await populatedRow.getByRole('button', { name: '查看 Command', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '有入口流程 Command 清单', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('/build-api', { exact: true })).toBeVisible();
    await expect(dialog.getByText('v2.1.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('/draft-api', { exact: true })).toBeVisible();
    await expect(dialog.getByText('暂无版本', { exact: true })).toBeVisible();
    expect(detailRequests).toHaveLength(1);
    expect(Object.fromEntries(new URL(detailRequests[0]!.url()).searchParams)).toEqual({
      userId: 'workflow-reader',
      dimCode: 'remote-product',
      firstScene: '研发提效',
      secondScene: '接口生成',
    });

    await dialog.getByRole('button', { name: '展开 Command /build-api', exact: true }).click();
    await expect.poll(() => contentRequests.length).toBe(1);
    await expect(dialog.getByText('Command 内容暂时不可用', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '重新加载 /build-api', exact: true }).click();
    await expect(dialog.getByText('执行接口构建与校验。', { exact: false })).toBeVisible();
    expect(contentRequests).toHaveLength(2);
    expect(Object.fromEntries(new URL(contentRequests[1]!.url()).searchParams)).toEqual({
      userId: 'workflow-reader',
      componentType: 'command',
      componentName: '/build-api',
      componentVersion: '2.1.0',
      filePath: '/build-api.md',
    });

    await dialog.getByRole('button', { name: '展开 Command /draft-api', exact: true }).click();
    await expect(dialog.getByText('暂无已发布版本，暂不能查看内容', { exact: true })).toBeVisible();
    expect(contentRequests).toHaveLength(2);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('查看发布历史进入 Extension 发布历史页面并按维度与场景查询记录', async ({ page }) => {
    await prepare(page);
    const historyQueries: Request[] = [];
    let workflowDetailQueries = 0;
    await page.route('**/api/harness/workflow/list**', (route) =>
      route.fulfill({
        json: success({
          total: 1,
          pageNo: 1,
          pageSize: 10,
          list: [workflow('接口生成流程', '待发布')],
        }),
      }),
    );
    await page.route('**/api/harness/workflow/detail**', (route) => {
      workflowDetailQueries += 1;
      return route.fulfill({ json: success(null) });
    });
    await page.route('**/api/harness/extensions/history**', (route) => {
      historyQueries.push(route.request());
      return route.fulfill({
        json: success({
          total: 1,
          pageNum: 1,
          pageSize: 100,
          list: [
            {
              id: 'release-1',
              extensionName: 'api-code',
              version: '1.3.0',
              description: '接口生成流程首次发布',
              publishStatus: 'success',
              operatorId: 'publisher-1',
              operatorName: '历史发布人',
              targetOrgCode: 'org-target',
              targetOrgName: '目标组织',
              firstScene: '研发提效',
              secondScene: '接口生成',
              updatedAt: '2026-09-15 10:20:30',
              skills: [{ name: '接口生成 Skill', version: '2.0.0' }],
              commands: [{ name: '执行 Command', version: '1.2.0' }],
              agents: [{ name: '接口 Agent', version: '3.0.0' }],
            },
          ],
        }),
      });
    });

    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    await harness
      .workflowInventoryRow('接口生成流程')
      .getByRole('button', { name: '查看发布历史', exact: true })
      .click();

    const history = harness.workflowsPanel.getByRole('region', {
      name: '发布历史 · 接口生成',
      exact: true,
    });
    await expect(history).toBeVisible();
    await expect(history.getByLabel('所属 DIM')).toHaveText('服务端产品');
    await expect(history.getByLabel('所属场景')).toHaveText('研发提效 / 接口生成');
    await expect(history.locator('.modal-header')).not.toContainText('接口生成流程说明');
    await expect(history).toContainText('v1.3.0');
    await expect(history).toContainText('接口生成流程首次发布');
    await expect(history).toContainText('历史发布人');
    expect(workflowDetailQueries).toBe(0);
    expect(historyQueries).toHaveLength(1);
    expect(historyQueries[0]!.postDataJSON()).toMatchObject({
      dimType: '产品级',
      dimCode: 'remote-product',
      dimName: '服务端产品',
      firstScene: '研发提效',
      secondScene: '接口生成',
      pageNum: 1,
      pageSize: 100,
    });
    await harness.workflowsPanel.getByRole('button', { name: '返回', exact: true }).click();
    await expect(harness.workflowInventoryRow('接口生成流程')).toBeVisible();
  });

  test('发布页清单项可按原交互展开文件内容', async ({ page }) => {
    await prepare(page);
    const publishDetails: Request[] = [];
    const publishRequests: Request[] = [];
    const packageTreeRequests: Request[] = [];
    const packageFileRequests: Request[] = [];
    await page.route('**/api/harness/workflow/list**', (route) =>
      route.fulfill({
        json: success({
          total: 1,
          pageNo: 1,
          pageSize: 10,
          list: [
            {
              ...workflow('待发布流程', '待发布'),
              flowDescription: '本次发布说明',
              sceneExtensionCode: 'product-b-api-extension',
              dimCode: 'product-b-id',
              dimName: 'product-b',
            },
          ],
        }),
      }),
    );
    await page.route('**/api/harness/extensions/detail**', (route) => {
      publishDetails.push(route.request());
      return route.fulfill({
        json: success({
          firstScene: '研发提效',
          secondScene: '接口生成',
          readyStatus: '就绪',
          publishedExtension: {
            extensionName: 'product-b-api-extension',
            version: '1.3.0',
            description: '已发布说明',
            publishStatus: '发布成功',
          },
          components: {
            skills: [{ name: '接口生成 Skill', version: '2.0.0', ready: true }],
            commands: [{ name: '执行 Command', version: '1.2.0', ready: true }],
            agents: [{ name: '接口 Agent', version: '3.0.0', ready: true }],
          },
          publishChecks: {
            beta: {
              canPublish: false,
              message: '当前配置与已发布版本 v1.3.0 完全一致，无需重新发布',
            },
            product: { canPublish: true, message: '清单完备，可发布' },
          },
        }),
      });
    });
    await page.route('**/api/harness/extensions/orgs**', (route) =>
      route.fulfill({
        json: success([
          { orgCode: 'org-first', orgName: '默认组织' },
          { orgCode: 'org-target', orgName: '目标组织' },
        ]),
      }),
    );
    await page.route('**/api/harness/packages/tree**', (route) => {
      packageTreeRequests.push(route.request());
      return route.fulfill({ json: success(['skills/接口生成/SKILL.md']) });
    });
    await page.route('**/api/harness/packages/file**', (route) => {
      packageFileRequests.push(route.request());
      const params = new URL(route.request().url()).searchParams;
      const content =
        params.get('componentType') === 'skill'
          ? '# 接口生成 Skill\n\n读取接口定义并生成调用代码。'
          : '# 执行 Command\n\n执行接口生成命令。';
      return route.fulfill({ json: success({ content }) });
    });
    await page.route(/\/api\/harness\/extensions(?:\?.*)?$/, (route) => {
      publishRequests.push(route.request());
      return route.fulfill({ json: success({ extensionId: 'extension-release-1' }) });
    });

    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    await harness
      .workflowInventoryRow('待发布流程')
      .getByRole('button', { name: '发布', exact: true })
      .click();

    const publish = harness.workflowsPanel.getByRole('region', {
      name: /\u53d1\u5e03 Extension/,
    });
    await expect(publish).toBeVisible();
    await expect(publish.getByRole('heading', { name: 'product-b-api-extension' })).toBeVisible();
    await expect(publish.getByRole('combobox', { name: '目标组织' })).toHaveAttribute(
      'data-value',
      'org-target',
    );
    expect(publishDetails).toHaveLength(1);
    const detailUrl = new URL(publishDetails[0]!.url());
    expect(detailUrl.searchParams.get('userId')).toBe('workflow-reader');
    expect(publishDetails[0]!.postDataJSON()).toMatchObject({
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
      extensionName: 'product-b-api-extension',
    });

    const publishCheckMessage = publish.locator('.publish-check-message');
    const confirmPublish = publish.getByRole('button', { name: '确认发布', exact: true });
    await expect(publishCheckMessage).toHaveText(
      '当前配置与已发布版本 v1.3.0 完全一致，无需重新发布',
    );
    await expect(publishCheckMessage).toHaveCSS('color', 'rgb(220, 38, 38)');
    await expect(confirmPublish).toBeDisabled();
    await selectHarnessOption(publish.getByRole('combobox', { name: '发布通道' }), 'product');
    await expect(publishCheckMessage).toHaveText('清单完备，可发布');
    await expect(publishCheckMessage).toHaveCSS('color', 'rgb(21, 128, 61)');
    await expect(confirmPublish).toBeEnabled();

    const skillItem = publish.locator('.capability-item').filter({ hasText: '接口生成 Skill' });
    await skillItem.getByRole('button', { name: /接口生成 Skill/ }).click();
    const skillFile = skillItem.getByRole('button', { name: 'skills/接口生成/SKILL.md' });
    await expect(skillFile).toBeVisible();
    expect(packageTreeRequests).toHaveLength(1);
    expect(Object.fromEntries(new URL(packageTreeRequests[0]!.url()).searchParams)).toEqual({
      userId: 'workflow-reader',
      componentType: 'skill',
      componentName: '接口生成 Skill',
      componentVersion: '2.0.0',
    });
    await skillFile.click();
    await expect(skillItem.locator('.file-content')).toContainText('读取接口定义并生成调用代码。');

    const commandItem = publish.locator('.capability-item').filter({ hasText: '执行 Command' });
    await commandItem.getByRole('button', { name: /执行 Command/ }).click();
    await expect(commandItem.locator('.file-content')).toContainText('执行接口生成命令。');
    expect(
      packageFileRequests.map((request) => Object.fromEntries(new URL(request.url()).searchParams)),
    ).toEqual([
      {
        userId: 'workflow-reader',
        componentType: 'skill',
        componentName: '接口生成 Skill',
        componentVersion: '2.0.0',
        filePath: 'skills/接口生成/SKILL.md',
      },
      {
        userId: 'workflow-reader',
        componentType: 'command',
        componentName: '执行 Command',
        componentVersion: '1.2.0',
        filePath: '执行 Command.md',
      },
    ]);

    await confirmPublish.click();
    await expect.poll(() => publishRequests.length).toBe(1);
    const publishUrl = new URL(publishRequests[0]!.url());
    expect(Object.fromEntries(publishUrl.searchParams)).toMatchObject({
      userId: 'workflow-reader',
      operatorName: '工作流发布人',
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
    });
    expect(publishRequests[0]!.postDataJSON()).toMatchObject({
      extensionName: 'product-b-api-extension',
      firstScene: '研发提效',
      secondScene: '接口生成',
      targetOrgCode: 'org-target',
      targetOrgName: '目标组织',
      skills: [{ name: '接口生成 Skill', version: '2.0.0' }],
      commands: [{ name: '执行 Command', version: '1.2.0' }],
      agents: [{ name: '接口 Agent', version: '3.0.0' }],
    });

    const historyRegion = harness.workflowsPanel.getByRole('region', { name: /发布历史/ });
    await expect(historyRegion).toBeVisible();
    await expect(
      harness.workflowsPanel.getByRole('button', { name: '刷新发布历史' }),
    ).toBeEnabled();
  });

  test('当前发布通道没有 message 时不展示提示区域', async ({ page }) => {
    await prepare(page);
    await page.route('**/api/harness/workflow/list**', (route) =>
      route.fulfill({
        json: success({
          total: 1,
          pageNo: 1,
          pageSize: 10,
          list: [
            {
              ...workflow('待发布无提示流程', '待发布'),
              sceneExtensionCode: 'product-b-api-extension',
              dimCode: 'product-b-id',
              dimName: 'product-b',
            },
          ],
        }),
      }),
    );
    await page.route('**/api/harness/extensions/detail**', (route) =>
      route.fulfill({
        json: success({
          firstScene: '研发提效',
          secondScene: '接口生成',
          readyStatus: '就绪',
          publishedExtension: {
            extensionName: 'product-b-api-extension',
            version: '1.3.0',
            description: '已发布说明',
            publishStatus: '发布成功',
          },
          components: { skills: [], commands: [], agents: [] },
          publishChecks: {
            beta: { canPublish: true, message: '' },
            product: { canPublish: true, message: '清单完备，可发布' },
          },
        }),
      }),
    );
    await page.route('**/api/harness/extensions/orgs**', (route) =>
      route.fulfill({
        json: success([{ orgCode: 'org-target', orgName: '目标组织' }]),
      }),
    );

    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    await harness
      .workflowInventoryRow('待发布无提示流程')
      .getByRole('button', { name: '发布', exact: true })
      .click();

    const publish = harness.workflowsPanel.getByRole('region', { name: /发布 Extension/ });
    await expect(publish.locator('.publish-check-message')).toHaveCount(0);
    await expect(publish).not.toContainText(
      '清单中的 Skill、Command 和 Agent 将随 Extension 一起发布至 Agent Center 平台。',
    );
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
  });

  test('失败可重试，空筛选仍可切换，过期请求不能覆盖新的状态结果', async ({ page }) => {
    await prepare(page);
    let fail = true;
    let emptyDesign = false;
    let releasePublished: (() => void) | undefined;
    await page.route('**/api/harness/workflow/list**', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (fail)
        return route.fulfill({
          json: { meta: { success: false, message: '工作流查询暂时失败' }, data: null },
        });
      const status = params.get('status');
      if (status === '已发布')
        await new Promise<void>((resolve) => {
          releasePublished = resolve;
        });
      await route.fulfill({
        json: success({
          total: emptyDesign && status === '设计中' ? 0 : 1,
          pageNo: 1,
          pageSize: 10,
          list:
            emptyDesign && status === '设计中'
              ? []
              : [workflow(status === '已发布' ? '过期已发布' : '最新结果', status || '设计中')],
        }),
      });
    });
    const harness = new HarnessManagementPage(page);
    await mountWorkflowPage(page);
    await expect(harness.workflowsPanel.getByRole('alert')).toContainText('工作流查询暂时失败');
    fail = false;
    await harness.workflowsPanel.getByRole('button', { name: '重试加载', exact: true }).click();
    await expect(harness.workflowInventoryRow('最新结果')).toBeVisible();
    await harness.workflowStatusButton('已发布').click();
    await expect.poll(() => Boolean(releasePublished)).toBe(true);
    await harness.workflowStatusButton('设计中').click();
    await expect(harness.workflowInventoryRow('最新结果')).toBeVisible();
    const publishedResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/workflow/list') &&
        new URL(response.url()).searchParams.get('status') === '已发布',
    );
    releasePublished?.();
    await publishedResponse;
    await expect(harness.workflowInventoryRow('最新结果')).toBeVisible();
    await expect(harness.workflowInventoryRow('过期已发布')).toHaveCount(0);
    await harness.workflowStatusButton('全部').click();
    await expect(harness.workflowInventoryRow('最新结果')).toBeVisible();
    emptyDesign = true;
    await harness.workflowStatusButton('设计中').click();
    await expect(
      harness.workflowsPanel.getByText('该状态下暂无工作流', { exact: true }),
    ).toBeVisible();
    await harness.workflowStatusButton('全部').click();
    await expect(harness.workflowInventoryRow('最新结果')).toBeVisible();
  });
});

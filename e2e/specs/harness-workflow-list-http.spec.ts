import { expect, test, type Page } from '@playwright/test';
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
        return () => h('div', { id: 'harness-panel-workflows' }, h(Component, { workspace }));
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
    ).toHaveCount(0);

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

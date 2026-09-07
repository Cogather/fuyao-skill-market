import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

const workspaceKey = 'harness-scenario-workspace-v2:mock:w30000001';

test('Mock 工作流首次打开即可跨产品和子部门分页，并按状态与范围筛选', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();

  await expect(harness.workflowsPanel.getByText('共 15 条', { exact: true })).toBeVisible();
  const rows = harness.workflowsTable.locator('tbody').getByRole('row');
  await expect(rows).toHaveCount(10);
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  const firstPageNames = await rows.locator('td:first-child').allTextContents();
  const commandCounts = await rows.locator('td:last-child').allTextContents();

  await harness.workflowsNextPageButton.click();
  await expect(rows).toHaveCount(5);
  await expect(harness.workflowsNextPageButton).toBeDisabled();
  const secondPageNames = await rows.locator('td:first-child').allTextContents();
  expect(new Set([...firstPageNames, ...secondPageNames]).size).toBe(15);
  expect(
    new Set([...commandCounts, ...(await rows.locator('td:last-child').allTextContents())]),
  ).toEqual(new Set(['0 个', '1 个', '2 个', '3 个']));

  await harness.workflowStatusButton('已发布').click();
  await expect(
    harness.workflowsPanel.getByRole('button', { name: '第 1 页', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(rows.first().getByRole('cell').nth(3)).toHaveText('已发布');
  expect(await rows.locator('td:nth-child(4)').allTextContents()).toEqual(
    expect.arrayContaining(['已发布']),
  );
  expect(new Set(await rows.locator('td:nth-child(4)').allTextContents())).toEqual(
    new Set(['已发布']),
  );

  await harness.workflowStatusButton('设计中').click();
  await expect(rows.first().getByRole('cell').nth(3)).toHaveText('设计中');
  expect(new Set(await rows.locator('td:nth-child(4)').allTextContents())).toEqual(
    new Set(['设计中']),
  );

  await harness.selectWorkflowDepartment('流水线平台小组');
  await expect(harness.workflowStatusButton('全部')).toHaveAttribute('aria-pressed', 'true');
  await expect(harness.workflowsProductFilter).toHaveValue('');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('td:nth-child(3)')).toHaveText(Array(3).fill('流水线平台小组'));

  await harness.selectWorkflowDepartment('持续交付组');
  await expect(harness.workflowsPanel.getByText('共 15 条', { exact: true })).toBeVisible();
  await harness.workflowsNextPageButton.click();
  await harness.selectWorkflowProduct('devops-center-v2');
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('td:nth-child(2)')).toHaveText(Array(4).fill('devops-center-v2'));
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  await expect(harness.workflowsNextPageButton).toBeDisabled();

  await harness.selectWorkflowProduct('harness-pipeline');
  await expect(harness.workflowsPanel.getByText('暂无工作流', { exact: true })).toBeVisible();
});

test('不同部门提供独立的 Mock 工作流，返回父部门仍包含下级工作流', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();

  for (const [department, product, count] of [
    ['变更管控小组', '发布编排平台', 3],
    ['联调工具部', 'API产品线', 3],
    ['评审小组', '质量产品线', 3],
    ['日志工具组', 'SRE产品线', 3],
    ['SQL治理组', '数据产品线', 2],
    ['需求分析组', '业务产品线', 2],
    ['体验设计部', '设计产品线', 2],
    ['项目管理部', '项目产品线', 2],
    ['变更分析组', '平台工具产品线', 2],
    ['发布工具组', '平台产品线', 2],
  ] as const) {
    await harness.selectWorkflowDepartment(department);
    const rows = harness.workflowsTable.locator('tbody').getByRole('row');
    await expect(rows).toHaveCount(count);
    await expect(rows.locator('td:nth-child(2)')).toHaveText(Array(count).fill(product));
    await expect(rows.locator('td:nth-child(3)')).toHaveText(Array(count).fill(department));
  }

  await harness.selectWorkflowDepartment('持续交付组');
  await expect(harness.workflowsPanel.getByText('共 15 条', { exact: true })).toBeVisible();
});

test('Mock 工作流刷新不重复播种，并保留用户修改、删除与新建草稿', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  await expect(harness.workflowsPanel.getByText('共 15 条', { exact: true })).toBeVisible();
  await harness.openScenariosFromWorkflows();
  await harness.openScenarioDesign();
  await page.keyboard.press('Escape');
  await expect(harness.workflowDesignDialog).toBeHidden();

  const expected = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    const draft = saved.workflows.find(
      (workflow: { name: string }) => workflow.name === '代码生成作业流',
    );
    const samples = saved.workflows.filter(
      (workflow: { name: string }) => workflow.name !== draft.name,
    );
    const edited = samples[0];
    const removed = samples[1];
    edited.name = '用户保留的工作流名称';
    saved.workflows = saved.workflows.filter(
      (workflow: { _id: string }) => workflow._id !== removed._id,
    );
    localStorage.setItem(key, JSON.stringify(saved));
    return {
      draftId: draft._id,
      editedId: edited._id,
      removedId: removed._id,
      total: saved.workflows.length,
    };
  }, workspaceKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.reload();
    await harness.switchToWorkflows();
    await harness.selectWorkflowProduct('harness-pipeline');
    await expect(harness.workflowInventoryRow('代码生成作业流')).toBeVisible();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      workspaceKey,
    );
    expect(saved.workflows).toHaveLength(expected.total);
    expect(
      saved.workflows.find((workflow: { _id: string }) => workflow._id === expected.draftId)?.name,
    ).toBe('代码生成作业流');
    expect(
      saved.workflows.find((workflow: { _id: string }) => workflow._id === expected.editedId)?.name,
    ).toBe('用户保留的工作流名称');
    expect(
      saved.workflows.some((workflow: { _id: string }) => workflow._id === expected.removedId),
    ).toBe(false);
    expect(
      new Set(saved.workflows.map((workflow: { scenarioId: string }) => workflow.scenarioId)).size,
    ).toBe(saved.workflows.length);
  }
});

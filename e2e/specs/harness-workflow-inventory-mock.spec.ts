import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

const workspaceKey = 'harness-scenario-workspace-v2:mock:w30000001';

test('Harness 工作流使用与资产清单一致的四状态胶囊筛选', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();

  const statusFilter = harness.workflowsPanel.getByRole('group', {
    name: '筛选工作流状态',
  });
  const statusButtons = statusFilter.getByRole('button');
  await expect(statusButtons).toHaveText(['全部', '设计中', '待发布', '已发布']);
  await expect(statusFilter.locator('.wf-status-count')).toHaveCount(0);

  const activeStyle = await harness.workflowStatusButton('全部').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      color: style.color,
    };
  });
  expect(activeStyle).toEqual({
    backgroundColor: 'rgb(31, 35, 41)',
    borderRadius: '16px',
    color: 'rgb(255, 255, 255)',
  });

  await harness.workflowStatusButton('设计中').click();
  const rows = harness.workflowsTable.locator('tbody').getByRole('row');
  await expect(rows.first().getByRole('cell').nth(3)).toHaveText('设计中');
  expect(new Set(await rows.locator('td:nth-child(4)').allTextContents())).toEqual(
    new Set(['设计中']),
  );
});

test('Mock 工作流提供可发布示例并使用白色查看、蓝色发布按钮', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();

  await harness.workflowStatusButton('待发布').click();
  for (const name of ['单元测试补全流程', '回归测试编排流程']) {
    await expect(
      harness.workflowInventoryRow(name).getByRole('button', { name: '发布', exact: true }),
    ).toBeVisible();
  }

  const pendingRow = harness.workflowInventoryRow('单元测试补全流程');
  const view = pendingRow.getByRole('button', { name: '查看发布历史', exact: true });
  const publish = pendingRow.getByRole('button', { name: '发布', exact: true });
  expect(
    await view.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        color: style.color,
      };
    }),
  ).toEqual({
    backgroundColor: 'rgb(255, 255, 255)',
    borderRadius: '6px',
    color: 'rgb(52, 64, 84)',
  });
  expect(
    await publish.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        color: style.color,
      };
    }),
  ).toEqual({
    backgroundColor: 'rgb(37, 99, 235)',
    borderRadius: '6px',
    color: 'rgb(255, 255, 255)',
  });

  await harness.workflowStatusButton('已发布').click();
  for (const name of ['应用脚手架生成流程', '合并请求自动评审流程']) {
    await expect(
      harness.workflowInventoryRow(name).getByRole('button', { name: '发布', exact: true }),
    ).toBeVisible();
  }
});

test('Mock 工作流首次打开即可跨产品和子部门分页，并按状态与范围筛选', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();

  await expect(harness.workflowsPanel.getByText('共 26 条', { exact: true })).toBeVisible();
  const rows = harness.workflowsTable.locator('tbody').getByRole('row');
  await expect(rows).toHaveCount(10);
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  const pageContent = async () => ({
    names: await rows.locator('td:first-child').allTextContents(),
    commands: await rows.locator('td:nth-child(6)').allTextContents(),
  });
  const firstPage = await pageContent();

  await harness.workflowsNextPageButton.click();
  await expect(rows).toHaveCount(10);
  const secondPage = await pageContent();
  await harness.workflowsNextPageButton.click();
  await expect(rows).toHaveCount(6);
  await expect(harness.workflowsNextPageButton).toBeDisabled();
  const thirdPage = await pageContent();
  const allNames = [...firstPage.names, ...secondPage.names, ...thirdPage.names];
  expect(allNames).toHaveLength(26);
  // 桥接行与 harness-pipeline 产品的同名场景跨产品重名，属于预期数据。
  expect(allNames.filter((name) => name === 'MML开发流程')).toHaveLength(2);
  expect(
    [...new Set([...firstPage.commands, ...secondPage.commands, ...thirdPage.commands])],
  ).toEqual(expect.arrayContaining(['0 个', '1 个', '2 个', '3 个']));

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
  await expect(harness.workflowsProductFilter).toHaveAttribute('data-value', '');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('td:nth-child(3)')).toHaveText(Array(3).fill('流水线平台小组'));

  await harness.selectWorkflowDepartment('持续交付组');
  await expect(harness.workflowsPanel.getByText('共 26 条', { exact: true })).toBeVisible();
  await harness.workflowsNextPageButton.click();
  await harness.selectWorkflowProduct('devops-center-v2');
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('td:nth-child(2)')).toHaveText(Array(4).fill('devops-center-v2'));
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  await expect(harness.workflowsNextPageButton).toBeDisabled();

  await harness.selectWorkflowProduct('harness-pipeline');
  await expect(harness.workflowsPanel.getByText('共 8 条', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(8);
  await expect(harness.workflowInventoryRow('MML开发流程')).toBeVisible();
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
  await expect(harness.workflowsPanel.getByText('共 26 条', { exact: true })).toBeVisible();
});

test('Mock 工作流刷新不重复播种，并保留用户修改、删除与新建草稿', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  await expect(harness.workflowsPanel.getByText('共 26 条', { exact: true })).toBeVisible();
  await harness.openScenariosFromWorkflows();
  await harness.openScenarioDesign();
  await harness.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
  await expect(harness.workflowDesignDialog).toBeHidden();

  const expected = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    const draft = saved.workflows.find((workflow: { name: string }) => workflow.name === '');
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
    await expect(harness.workflowInventoryRow('未命名 Workflow')).toBeVisible();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      workspaceKey,
    );
    expect(saved.workflows).toHaveLength(expected.total);
    expect(
      saved.workflows.find((workflow: { _id: string }) => workflow._id === expected.draftId)?.name,
    ).toBe('');
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

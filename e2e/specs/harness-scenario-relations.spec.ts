import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test.describe('Harness 场景与流程关系', () => {
  let harnessPage: HarnessManagementPage;

  test.beforeEach(async ({ page }) => {
    harnessPage = new HarnessManagementPage(page);
    await harnessPage.goto();
  });

  test.skip('业务场景设计复用配置管理的默认场景树并移除 UDM 演示树', async ({ page }) => {
    await page.locator('#harness-tab-settings').click();
    const configuredScenes = page.locator('#configuration-panel-scenes');
    await expect(configuredScenes).toBeVisible();
    await expect(configuredScenes.getByText('研发提效', { exact: true }).first()).toBeVisible();
    await expect(configuredScenes.getByText('代码生成', { exact: true }).first()).toBeVisible();

    await harnessPage.switchToScenarios();
    const designTree = harnessPage.scenariosPanel.getByRole('tree', { name: '业务场景地图' });
    await expect(designTree.getByText('研发提效', { exact: true })).toBeVisible();
    await expect(designTree.getByText('代码生成', { exact: true })).toBeVisible();
    await expect(designTree.getByText('需求开发', { exact: true })).toHaveCount(0);
    await expect(designTree.getByText('MML开发', { exact: true })).toHaveCount(0);
  });

  test('每个二级场景只创建一个 Workflow，并在刷新后保留关联', async ({ page }) => {
    await harnessPage.switchToScenarios();

    const designTree = harnessPage.scenariosPanel.getByRole('tree', { name: '业务场景地图' });
    await designTree.getByText('代码生成', { exact: true }).click();

    const workflowCards = harnessPage.scenariosPanel.locator('.workflow-card');
    const startWorkflow = harnessPage.scenariosPanel.getByRole('button', {
      name: '+ 开始设计 Workflow',
      exact: true,
    });
    await expect(workflowCards).toHaveCount(0);
    await expect(startWorkflow).toBeVisible();

    await startWorkflow.click();
    await expect(harnessPage.workflowDesignDialog).toBeVisible();
    await expect(harnessPage.workflowDesignDialog.locator('input[readonly]').first()).toHaveValue(
      '代码生成',
    );
    await harnessPage.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
    await expect(harnessPage.workflowDesignDialog).toBeHidden();

    const codeGenerationWorkflow = harnessPage.workflowCard('代码生成作业流');
    await expect(workflowCards).toHaveCount(1);
    await expect(codeGenerationWorkflow).toBeVisible();
    await expect(startWorkflow).toHaveCount(0);

    await codeGenerationWorkflow.getByRole('button', { name: '继续设计', exact: true }).click();
    await expect(harnessPage.workflowDesignDialog).toBeVisible();
    await harnessPage.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
    await expect(harnessPage.workflowDesignDialog).toBeHidden();
    await expect(workflowCards).toHaveCount(1);

    await designTree.getByText('接口开发', { exact: true }).click();
    await expect(workflowCards).toHaveCount(0);
    await expect(startWorkflow).toBeVisible();

    await designTree.getByText('代码生成', { exact: true }).click();
    await expect(codeGenerationWorkflow).toBeVisible();

    await page.reload();
    await harnessPage.tabList.waitFor();
    await harnessPage.switchToScenarios();
    await expect(harnessPage.workflowCard('代码生成作业流')).toBeVisible();
    await expect(harnessPage.scenariosPanel.locator('.workflow-card')).toHaveCount(1);
    await expect(
      harnessPage.scenariosPanel.getByRole('button', {
        name: '+ 开始设计 Workflow',
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test.skip('旧活动只导入当前二级场景，并在设计台与刷新后保持一致', async ({ page }) => {
    await page.locator('#harness-tab-settings').click();
    await page.getByRole('tab', { name: '环节与节点', exact: true }).click();

    const activityPanel = page.locator('#configuration-panel-activities');
    await expect(activityPanel).toBeVisible();

    const departmentSelect = activityPanel.getByRole('combobox', {
      name: '选择部门',
      exact: true,
    });
    const productSelect = activityPanel.getByRole('combobox', {
      name: '选择产品',
      exact: true,
    });
    const primarySceneSelect = activityPanel.getByRole('combobox', {
      name: '选择一级场景',
      exact: true,
    });
    const secondarySceneSelect = activityPanel.getByRole('combobox', {
      name: '选择二级场景',
      exact: true,
    });
    const legacyActivitySelect = activityPanel.getByRole('combobox', {
      name: '选择旧活动',
      exact: true,
    });

    await departmentSelect.selectOption({
      label: '部门1 / 平台产品线 / 平台工具组 / DevOps部 / 持续交付组 / 流水线平台小组',
    });
    await expect(productSelect.locator('option:checked')).toHaveText('DevOps 管理工作台');
    await expect(secondarySceneSelect.locator('option:checked')).toHaveText('代码生成');
    await expect(legacyActivitySelect).toBeEnabled();
    await expect(legacyActivitySelect.getByRole('option', { name: /需求研发/ })).toHaveCount(1);

    await departmentSelect.selectOption({
      label: '部门1 / 平台产品线 / 平台工具组 / DevOps部 / 持续交付组',
    });
    await expect(productSelect.locator('option:checked')).toHaveText('harness-pipeline');
    await expect(primarySceneSelect.locator('option:checked')).toHaveText('研发提效');
    await expect(secondarySceneSelect.locator('option:checked')).toHaveText('代码生成');

    await expect(legacyActivitySelect).toBeEnabled();
    await legacyActivitySelect.selectOption({ label: '需求研发（2 个子活动）' });
    await activityPanel.getByRole('button', { name: '导入到当前场景', exact: true }).click();

    const importedStage = activityPanel.getByRole('article', { name: '环节 需求研发' });
    await expect(importedStage).toBeVisible();
    await expect(importedStage.locator('.scenario-node-row')).toHaveCount(2);
    await expect(importedStage.getByText('接口开发', { exact: true })).toBeVisible();
    await expect(importedStage.getByText('合并评审', { exact: true })).toBeVisible();
    await expect(activityPanel.getByRole('status')).toHaveText(
      '已将所选活动及子活动导入当前场景，旧活动数据已保留。',
    );

    await secondarySceneSelect.selectOption({ label: '接口开发' });
    await expect(activityPanel.locator('.scenario-stage-card')).toHaveCount(0);
    await expect(
      activityPanel.getByText('该场景尚未配置环节与节点', { exact: true }),
    ).toBeVisible();

    await secondarySceneSelect.selectOption({ label: '代码生成' });
    await expect(importedStage).toBeVisible();

    await harnessPage.switchToScenarios();
    const codeGenerationWorkflow = harnessPage.workflowCard('代码生成作业流');
    await expect(codeGenerationWorkflow).toBeVisible();
    await expect(
      codeGenerationWorkflow.locator('.pipeline').getByText('需求研发', { exact: true }),
    ).toBeVisible();
    await expect(
      codeGenerationWorkflow.locator('.pipeline').getByText('接口开发', { exact: true }),
    ).toBeVisible();
    await expect(
      codeGenerationWorkflow.locator('.pipeline').getByText('合并评审', { exact: true }),
    ).toBeVisible();

    await page.reload();
    await harnessPage.tabList.waitFor();
    await harnessPage.switchToScenarios();
    const restoredWorkflow = harnessPage.workflowCard('代码生成作业流');
    await expect(restoredWorkflow).toBeVisible();
    await expect(
      restoredWorkflow.locator('.pipeline').getByText('需求研发', { exact: true }),
    ).toBeVisible();
    await expect(
      restoredWorkflow.locator('.pipeline').getByText('接口开发', { exact: true }),
    ).toBeVisible();
    await expect(
      restoredWorkflow.locator('.pipeline').getByText('合并评审', { exact: true }),
    ).toBeVisible();
  });

  test.skip('设计台新增场景同步配置，配置重命名和排序保留 Workflow 身份，删除后级联清理', async ({
    page,
  }) => {
    const originalScenarioName = '链路回归场景';
    const renamedScenarioName = '链路回归场景已重命名';
    const workflowName = `${originalScenarioName}作业流`;

    await harnessPage.switchToScenarios();
    await harnessPage.createChildScenario({
      parentScenarioName: '研发提效',
      scenarioName: originalScenarioName,
      scenarioCode: 'harness-pipeline-relation-regression',
      scenarioDescription: '验证配置场景与 Workflow 使用同一稳定身份。',
    });
    await harnessPage.openScenarioDesign();
    await harnessPage.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
    await expect(harnessPage.workflowDesignDialog).toBeHidden();

    const originalWorkflow = harnessPage.workflowCard(workflowName);
    await expect(originalWorkflow).toBeVisible();
    const workflowId = await originalWorkflow.getAttribute('data-workflow-id');
    expect(workflowId).toBeTruthy();

    await page.locator('#harness-tab-settings').click();
    const configuredScenes = page.locator('#configuration-panel-scenes');
    await expect(configuredScenes).toBeVisible();

    const researchEfficiencyNode = configuredScenes.locator('.primary-node').filter({
      has: page.locator('strong').filter({ hasText: /^研发提效$/ }),
    });
    await researchEfficiencyNode.locator('.node-main').click();

    const originalRow = configuredScenes.getByRole('row').filter({
      has: page.getByText(originalScenarioName, { exact: true }),
    });
    await expect(originalRow).toBeVisible();
    await originalRow.getByRole('button', { name: '编辑', exact: true }).click();

    const editor = page.locator('.modal-card').filter({
      has: page.getByRole('heading', { name: '编辑二级场景', exact: true }),
    });
    await editor.getByRole('textbox').fill(renamedScenarioName);
    await editor.getByRole('button', { name: '保存并更新', exact: true }).click();
    await expect(editor).toBeHidden();

    const renamedRow = configuredScenes.getByRole('row').filter({
      has: page.getByText(renamedScenarioName, { exact: true }),
    });
    await expect(renamedRow).toBeVisible();
    await renamedRow.getByRole('button', { name: '↑', exact: true }).click();
    await expect(
      configuredScenes.locator('.list-panel tbody tr td:nth-child(2) strong'),
    ).toHaveText(['代码生成', '接口开发', 'SQL优化', '单元测试', renamedScenarioName, '代码审查']);

    await harnessPage.switchToScenarios();
    const designTree = harnessPage.scenariosPanel.getByRole('tree', { name: '业务场景地图' });
    await expect(designTree.getByText(originalScenarioName, { exact: true })).toHaveCount(0);
    await expect(designTree.getByText(renamedScenarioName, { exact: true })).toBeVisible();
    const workflowAfterConfiguration = harnessPage.workflowCard(workflowName);
    await expect(workflowAfterConfiguration).toBeVisible();
    await expect(workflowAfterConfiguration).toHaveAttribute('data-workflow-id', workflowId!);

    await page.locator('#harness-tab-settings').click();
    await expect(renamedRow).toBeVisible();
    await renamedRow.getByRole('button', { name: '删除', exact: true }).click();
    const deleteDialog = page.locator('.modal-card.delete-card').filter({
      has: page.getByRole('heading', {
        name: `删除场景“${renamedScenarioName}”`,
        exact: true,
      }),
    });
    await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(renamedRow).toHaveCount(0);

    await harnessPage.switchToScenarios();
    await expect(designTree.getByText(renamedScenarioName, { exact: true })).toHaveCount(0);
    await expect(
      harnessPage.scenariosPanel.locator(`[data-workflow-id="${workflowId}"]`),
    ).toHaveCount(0);
    await harnessPage.switchToWorkflows();
    await expect(harnessPage.workflowInventoryRow(workflowName)).toHaveCount(0);
  });

  test.skip('配置管理阻止删除已有规划项引用的二级场景', async ({ page }) => {
    await page.locator('#harness-tab-settings').click();
    const configuredScenes = page.locator('#configuration-panel-scenes');
    await expect(configuredScenes).toBeVisible();

    const researchEfficiencyNode = configuredScenes.locator('.primary-node').filter({
      has: page.locator('strong').filter({ hasText: /^研发提效$/ }),
    });
    await researchEfficiencyNode.locator('.node-main').click();

    const referencedScene = configuredScenes.getByRole('row').filter({
      has: page.getByText('代码生成', { exact: true }),
    });
    await expect(referencedScene.getByText('5', { exact: true })).toBeVisible();
    await referencedScene.getByRole('button', { name: '删除', exact: true }).click();

    await expect(page.locator('[data-app-toast]')).toHaveText(
      '二级场景“代码生成”已关联 5 个规划项，请先解除关联后再删除。',
    );
    await expect(page.locator('.modal-card.delete-card')).toHaveCount(0);
    await expect(referencedScene).toBeVisible();
  });
});

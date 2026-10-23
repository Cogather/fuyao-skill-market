import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('从其他场景搜索并继承 Workflow，同时保留当前场景信息', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();

  const currentScenarioName = await harness.scenariosPanel.locator('.summary h2').textContent();
  await harness.scenariosPanel.getByRole('button', { name: '继承 Workflow', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '继承已有 Workflow', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('继承会覆盖当前 Workflow 配置', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('当前场景名称、编码、说明和标签保持不变。', { exact: false }),
  ).toBeVisible();

  const search = dialog.getByRole('searchbox', {
    name: '搜索场景名称或 Workflow 名称',
    exact: true,
  });
  await search.fill('单元测试');
  const option = dialog.getByRole('button', { name: /单元测试补全流程/ });
  await expect(option).toBeVisible();
  await option.click();
  await dialog.getByRole('button', { name: '确认继承', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(harness.workflowCard('单元测试补全流程')).toBeVisible();
  await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText(currentScenarioName || '');

  await harness.scenariosPanel.getByRole('button', { name: '继承 Workflow', exact: true }).click();
  await search.fill('应用脚手架');
  await dialog.getByRole('button', { name: /应用脚手架生成流程/ }).click();
  await dialog.getByRole('button', { name: '确认继承', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(harness.workflowCard('应用脚手架生成流程')).toBeVisible();
  await expect(harness.workflowCard('单元测试补全流程')).toHaveCount(0);
  await expect(harness.scenariosPanel.locator('.workflow-card')).toHaveCount(1);
  await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText(currentScenarioName || '');
});

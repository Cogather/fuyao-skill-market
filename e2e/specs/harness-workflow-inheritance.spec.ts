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
  await expect(
    dialog.getByText('当前未输入任何关键字，未查到任何数据', { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator('.inheritance-warning')).toHaveCount(0);

  const search = dialog.getByRole('searchbox', {
    name: '搜索场景名称或 Workflow 名称',
    exact: true,
  });
  await search.fill('单元测试');
  const option = dialog.getByRole('button', { name: /单元测试补全流程/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(
    dialog.getByText('确认后，将用「单元测试补全流程」的完整配置直接覆盖当前内容', {
      exact: false,
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '确认覆盖并继承', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(harness.workflowCard('单元测试补全流程')).toBeVisible();
  await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText(currentScenarioName || '');

  await harness.scenariosPanel.getByRole('button', { name: '继承 Workflow', exact: true }).click();
  await search.fill('应用脚手架');
  await dialog.getByRole('button', { name: /应用脚手架生成流程/ }).click();
  await dialog.getByRole('button', { name: '确认覆盖并继承', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(harness.workflowCard('应用脚手架生成流程')).toBeVisible();
  await expect(harness.workflowCard('单元测试补全流程')).toHaveCount(0);
  await expect(harness.scenariosPanel.locator('.workflow-card')).toHaveCount(1);
  await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText(currentScenarioName || '');
});

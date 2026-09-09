import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('工作流分页支持每页条数、页码跳转和图标翻页', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用本地工作流数据');
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  const pagination = harness.workflowsPanel.getByRole('navigation', { name: '工作流分页' });
  const rows = harness.workflowsTable.locator('tbody tr');
  const pageSize = pagination.getByRole('combobox', { name: '每页条数' });
  const jump = pagination.getByRole('spinbutton', { name: '跳转页码' });
  await expect(pageSize).toHaveAttribute('data-value', '10');
  await expect(rows).toHaveCount(10);
  const total = Number((await pagination.locator('.wf-page-total').innerText()).match(/\d+/)![0]);
  expect(total).toBeGreaterThan(10);
  expect(total).toBeLessThanOrEqual(20);
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  await expect(harness.workflowsPreviousPageButton).toHaveText('');
  await expect(harness.workflowsNextPageButton).toHaveText('');

  await jump.fill('2');
  await jump.press('Enter');
  await expect(rows).toHaveCount(total - 10);
  await expect(harness.workflowsNextPageButton).toBeDisabled();
  await selectHarnessOption(pageSize, '20');
  await expect(rows).toHaveCount(total);
  await expect(jump).toHaveValue('1');
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
  await expect(harness.workflowsNextPageButton).toBeDisabled();
  for (const size of ['50', '100', '10']) {
    await selectHarnessOption(pageSize, size);
    await expect(rows).toHaveCount(Math.min(Number(size), total));
  }

  await jump.fill('999');
  await jump.press('Tab');
  await expect(jump).toHaveValue('2');
  await expect(rows).toHaveCount(total - 10);
  await harness.workflowsPreviousPageButton.click();
  await expect(jump).toHaveValue('1');
  await harness.workflowsNextPageButton.click();
  await expect(jump).toHaveValue('2');
  await jump.fill('');
  await jump.press('Enter');
  await expect(jump).toHaveValue('2');
  await jump.fill('0');
  await jump.press('Enter');
  await expect(jump).toHaveValue('1');
  await expect(rows).toHaveCount(10);
  await jump.fill('2');
  await jump.press('Enter');
  await harness.workflowStatusButton('已发布').click();
  await expect(jump).toHaveValue('1');
  await expect(harness.workflowsPreviousPageButton).toBeDisabled();
});

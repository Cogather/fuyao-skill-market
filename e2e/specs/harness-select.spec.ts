import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';
import { openHarnessSelect } from '../helpers/selectHarnessOption';

test('三个工作区的产品选择使用统一浮层，并支持键盘、搜索和关闭', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用本地产品数据');
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.selectScenarioDepartment('平台工具组');
  const product = harness.scenariosPanel.getByRole('combobox', { name: '选择产品', exact: true });
  await product.click();
  const menu = page.getByRole('listbox', { name: '选择产品' });
  await expect(menu).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索选项' }).fill('harness-demo');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜索选项' }).press('ArrowDown');
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Enter');
  await expect(product).toHaveText('harness-demo');
  await expect(product).toBeFocused();
  await expect(menu).toBeHidden();
  await product.click();
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Enter');
  await expect(product).toHaveText('harness-demo');
  await product.click();
  await page.getByRole('searchbox', { name: '搜索选项' }).fill('不存在的产品');
  await expect(page.getByRole('status').filter({ hasText: '没有匹配的选项' })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Escape');
  await expect(product).toHaveText('harness-demo');
  await expect(product).toBeFocused();

  await harness.switchToWorkflows();
  await harness.workflowsProductFilter.click();
  await expect(page.getByRole('listbox', { name: '筛选产品' })).toBeVisible();
  await harness.workflowsHeading.click();
  await expect(page.getByRole('listbox')).toBeHidden();

  await page.locator('#harness-tab-assets').click();
  const assetsProduct = page.getByRole('combobox', { name: '产品筛选', exact: true });
  await assetsProduct.click();
  await page
    .getByRole('listbox', { name: '产品筛选' })
    .getByRole('option', { name: 'harness-pipeline', exact: true })
    .click();
  await expect(assetsProduct).toHaveText('harness-pipeline');
  await expect(
    page.getByRole('heading', { name: '流水线异常分析 Agent', exact: true }),
  ).toBeVisible();
});

test('创建资产弹窗内点击标题可收起下拉菜单，Escape 不关闭表单', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: '+ 新建资产', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Skill', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加 Skill' });
  const trigger = dialog.getByRole('combobox', { name: '层级', exact: true });
  const menu = await openHarnessSelect(trigger);
  await expect(menu).toBeVisible();
  await dialog.getByText('添加 Skill', { exact: true }).click();
  await expect(menu).toBeHidden();
  await trigger.click();
  await trigger.press('Escape');
  await expect(menu).toBeHidden();
  await expect(dialog).toBeVisible();
});

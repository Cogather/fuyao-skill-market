import { expect, test } from '../fixtures/base';
import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('业务场景设计可在产品级和部门级之间切换并按层级调整筛选布局', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用本地完整场景数据验证交互');

  const harness = new HarnessManagementPage(page);
  await harness.goto();
  const panel = harness.scenariosPanel;
  const level = panel.getByRole('combobox', { name: '选择层级', exact: true });
  const product = panel.getByRole('combobox', { name: '选择产品', exact: true });

  await expect(level).toBeVisible();
  await expect(level).toHaveText('产品级');
  await expect(product).toBeVisible();

  await selectHarnessOption(level, { label: '部门级' });

  await expect(level).toHaveText('部门级');
  await expect(product).toBeHidden();
  await expect(panel.getByText('请先在上方选择部门与产品。', { exact: true })).toHaveCount(0);

  const [selectorBox, levelBox, departmentBox] = await Promise.all([
    panel.locator('.selector').boundingBox(),
    level.boundingBox(),
    harness.scenariosDepartmentTrigger.boundingBox(),
  ]);
  expect(levelBox!.x).toBeGreaterThanOrEqual(selectorBox!.x);
  expect(departmentBox!.x).toBeGreaterThan(levelBox!.x + levelBox!.width);

  await selectHarnessOption(level, { label: '产品级' });
  await expect(product).toBeVisible();
});

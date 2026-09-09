import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('资产页从 Harness 清单聚合 Mock 资产而不是使用独立静态种子', async ({ page }) => {
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();

  const filters = page.getByRole('navigation', { name: '资产类型' });
  await expect(filters.getByRole('button')).toHaveText(['Agent', 'Skill', 'Command', 'Extension']);
  await expect(filters.getByRole('button', { name: 'Agent', exact: true })).toHaveClass(
    /is-active/,
  );
  await expect(page.getByText('流水线异常分析 Agent', { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Skill', exact: true }).click();
  await expect(page.getByText('流水线失败诊断 Skill', { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Command', exact: true }).click();
  await expect(page.getByText('接口契约检查 Command', { exact: true })).toBeVisible();
});

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('Skill 新增弹框不受宿主通用最小高度影响，且两个页签等高', async ({ page }) => {
  await page.setViewportSize({ width: 1905, height: 1400 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  // HTTP 宿主页可能注入通用 dialog 样式；组件自身必须守住外框高度上限。
  await page.addStyleTag({ content: '.dialog { min-height: 1126px; }' });
  await page.getByRole('tab', { name: 'Skill 规划', exact: true }).click();
  await page.getByRole('button', { name: 'Skill 清单', exact: true }).click();

  const addButton = page.locator('.master-panel .master-btn--primary', { hasText: '新增' });
  await expect(addButton).toBeEnabled({ timeout: 10_000 });
  await addButton.click();

  const dialog = page.locator('form.dialog.is-create-dialog');
  await expect(dialog).toBeVisible();

  const directHeight = await dialog.evaluate((element) => element.getBoundingClientRect().height);
  expect(directHeight).toBe(760);
  await expect(dialog).toHaveCSS('min-height', '0px');
  await expect(dialog).toHaveCSS('box-sizing', 'border-box');

  await dialog.getByRole('tab', { name: '从 Skill 广场引入', exact: true }).click();
  await expect
    .poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(directHeight);

  await page.setViewportSize({ width: 1280, height: 700 });
  await expect
    .poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(616);
});

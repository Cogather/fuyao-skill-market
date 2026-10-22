import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('top navigation hides the legacy capability inventory tab', async ({ page }) => {
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  const navigation = page.getByRole('tablist', { name: 'Harness 管理分区' });
  await expect(navigation.getByRole('tab', { name: '资产清单', exact: true })).toHaveCount(1);
  await expect(page.locator('#harness-tab-capabilities')).toHaveCount(0);
  await expect(page.locator('#harness-tab-assets')).toBeVisible();
});

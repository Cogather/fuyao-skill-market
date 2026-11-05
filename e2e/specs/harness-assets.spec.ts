import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('第二个资产清单页签整合筛选、参考卡片与详情流程', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  await expect(page.locator('#harness-tab-scenarios')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'false');
  const scenarioLayout = await page.locator('.scenario-page').boundingBox();

  await page.locator('#harness-tab-assets').click();
  const assetPanel = page.locator('#harness-panel-assets');
  await expect(assetPanel.getByRole('heading', { name: '资产清单', exact: true })).toBeVisible();
  const assetLayout = await assetPanel.locator('.asset-page').boundingBox();
  expect(scenarioLayout).not.toBeNull();
  expect(assetLayout).not.toBeNull();
  expect(assetLayout!.x).toBeCloseTo(scenarioLayout!.x, 0);
  expect(assetLayout!.y).toBeCloseTo(scenarioLayout!.y, 0);
  expect(assetLayout!.width).toBeCloseTo(scenarioLayout!.width, 0);
  await expect(page.getByLabel('产品筛选')).toBeVisible();

  const actionButtonStyle = await page
    .getByRole('button', { name: '＋ 新增' })
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        height: style.height,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        backgroundColor: style.backgroundColor,
      };
    });
  expect(actionButtonStyle).toEqual({
    height: '34px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '400',
    backgroundColor: 'rgb(255, 255, 255)',
  });

  const firstCard = page.locator('.asset-card').first();
  const cardStyle = await firstCard.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      gap: style.gap,
      minHeight: style.minHeight,
      padding: style.padding,
      borderRadius: style.borderRadius,
    };
  });
  expect(cardStyle).toEqual({
    gap: '10px',
    minHeight: '168px',
    padding: '16px',
    borderRadius: '14px',
  });
  await expect(page.locator('.asset-board')).toHaveCSS('overflow-y', 'auto');
  await expect(firstCard).toBeVisible();
  await firstCard.getByRole('heading').click();
  await expect(page.locator('.asset-detail')).toBeVisible();
});

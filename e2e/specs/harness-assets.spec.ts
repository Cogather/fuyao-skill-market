import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('Agent / Skill 资产页签整合资产筛选、详情与发布流程', async ({ page }) => {
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  const tabs = page.getByRole('tablist', { name: 'Harness 管理分区' }).getByRole('tab');
  await expect(tabs.filter({ hasText: 'Agent / Skill 资产' })).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Skill 规划' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const planningLayout = await page.locator('.planning-pageNum').boundingBox();

  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
  await expect(page.getByRole('heading', { name: 'Agent / Skill 资产' })).toBeVisible();
  const assetLayout = await page.locator('.asset-page').boundingBox();
  expect(planningLayout).not.toBeNull();
  expect(assetLayout).not.toBeNull();
  expect(assetLayout!.x).toBeCloseTo(planningLayout!.x, 0);
  expect(assetLayout!.y).toBeCloseTo(planningLayout!.y, 0);
  expect(assetLayout!.width).toBeCloseTo(planningLayout!.width, 0);
  await expect(page.getByLabel('产品筛选')).toBeVisible();

  const primaryButtonStyle = await page
    .getByRole('button', { name: '+ 新建资产' })
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        padding: `${style.paddingTop} ${style.paddingRight}`,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        backgroundColor: style.backgroundColor,
      };
    });
  expect(primaryButtonStyle).toEqual({
    padding: '0px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: '20px',
    letterSpacing: 'normal',
    backgroundColor: 'rgb(37, 99, 235)',
  });

  const cardStyle = await page
    .locator('.asset-card')
    .first()
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        gap: style.gap,
        minHeight: style.minHeight,
        padding: style.padding,
        borderRadius: style.borderRadius,
      };
    });
  expect(cardStyle).toEqual({
    gap: '6.4px',
    minHeight: 'auto',
    padding: '16px',
    borderRadius: '8px',
  });
  const assetBoard = page.locator('.asset-board');
  await expect(assetBoard).toHaveCSS('overflow-y', 'auto');
  expect(
    await assetBoard.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  const headerTop = await page.locator('.asset-page__header').evaluate((element) =>
    element.getBoundingClientRect().top,
  );
  await assetBoard.evaluate((element) => element.scrollTo({ top: 320 }));
  expect(await assetBoard.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(
    await page.locator('.asset-page__header').evaluate((element) =>
      element.getBoundingClientRect().top,
    ),
  ).toBe(headerTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('.asset-card').first()).toBeVisible();
});

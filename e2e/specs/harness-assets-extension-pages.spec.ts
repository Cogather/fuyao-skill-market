import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { clickAssetCardAction } from '../helpers/assetCardActions';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('资产卡片 Extension 发布页面', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用 Mock 场景');

  test.beforeEach(async ({ page }) => {
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.locator('#harness-tab-assets').click();
    await selectHarnessOption(page.getByLabel('产品筛选'), { label: 'harness-pipeline' });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
  });

  test('Extension 列表仅显示已发布资产', async ({ page }) => {
    await expect(page.getByRole('button', { name: '已发布', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.asset-card').getByRole('heading')).toHaveText([
      '日志获取 Extension',
      '问题分析 Extension',
    ]);
    await expect(page.locator('.asset-card__meta .asset-badge')).toHaveText([
      '已发布',
      '已发布',
    ]);
    await expect(page.getByRole('heading', { name: '构建诊断 Extension', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { name: 'MML开发 Extension', exact: true })).toHaveCount(0);
  });

  test('已发布 Extension 可从卡片和详情进入历史并返回原视图', async ({
    page,
  }, testInfo) => {
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: '问题分析 Extension', exact: true }) });
    await clickAssetCardAction(card, '发布历史');
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Extension 发布分区' })).toHaveCount(0);
    await expect(history.locator('.timeline-item')).toHaveCount(2);
    await expect(history.getByRole('button', { name: /加载更多/ })).toHaveCount(0);
    await page
      .locator('.extension-page--embedded')
      .screenshot({ path: testInfo.outputPath('extension-history-page.png') });
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await card.click();
    await page.locator('.asset-detail__actions').getByRole('button', { name: '发布历史' }).click();
    await expect(history).toBeVisible();
    await expect(page.locator('.asset-detail')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.locator('.asset-detail')).toBeVisible();
  });
});

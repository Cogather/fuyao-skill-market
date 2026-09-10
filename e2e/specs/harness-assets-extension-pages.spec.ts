import { selectHarnessOption } from '../helpers/selectHarnessOption';
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

  test('发布页面只读展示资产信息，提交后显示历史，返回刷新卡片', async ({ page }, testInfo) => {
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: '构建诊断 Extension', exact: true }) });
    await card.getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('region', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '发布', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Extension 发布分区' })).toHaveCount(0);
    await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.asset-grid')).toHaveCount(0);
    await expect(dialog.getByLabel(/发布通道/)).toHaveAttribute('data-value', 'beta');
    await expect(dialog.locator('.publish-summary li')).toHaveCount(2);
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await expect(
      dialog.getByRole('heading', { name: '构建诊断 Extension', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('harness-pipeline', { exact: true }).first()).toBeVisible();
    await selectHarnessOption(dialog.getByLabel(/发布通道/), 'product');
    await selectHarnessOption(dialog.getByLabel(/目标组织/), 'org-yunshan');
    await page
      .locator('.extension-page--embedded')
      .screenshot({ path: testInfo.outputPath('extension-publish-page.png') });
    await dialog.getByRole('button', { name: '确认发布' }).click();
    await expect(dialog).toBeHidden();
    const publishedCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '构建诊断 Extension', exact: true }),
    });
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Extension 发布分区' })).toHaveCount(0);
    await expect(history.locator('.timeline-item')).toHaveCount(1);
    await expect(history.locator('.timeline-item')).toContainText('Product');
    await expect(history.locator('.timeline-item')).toContainText('云山组织');
    await expect(history.locator('.timeline-item')).toContainText('构建诊断 Extension');
    await expect(history.locator('.history-structure > span')).toHaveCount(2);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(history).toBeHidden();
    await expect(publishedCard.locator('.asset-card__meta')).toContainText('发布中');
    await expect(publishedCard.getByRole('button', { name: '发布', exact: true })).toHaveCount(0);
  });

  test('发布历史显示失败原因、能力版本及更多记录，从详情进入可返回详情', async ({
    page,
  }, testInfo) => {
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: 'MML开发 Extension', exact: true }) });
    await card.getByRole('button', { name: '发布历史', exact: true }).click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Extension 发布分区' })).toHaveCount(0);
    await expect(history.locator('.timeline-item')).toHaveCount(3);
    await history.getByRole('button', { name: /加载更多/ }).click();
    await expect(history.locator('.timeline-item')).toHaveCount(6);
    await expect(history.locator('.failure-reason').first()).toContainText('失败原因');
    await expect(history.getByRole('button', { name: /重试发布/ }).first()).toBeVisible();
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

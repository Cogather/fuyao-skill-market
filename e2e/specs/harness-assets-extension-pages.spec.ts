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

  test('Extension 列表仅显示已发布资产', async ({ page }) => {
    await expect(page.getByRole('button', { name: '已发布', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.asset-card').getByRole('heading')).toHaveText([
      '日志获取 Extension',
      '问题分析 Extension',
    ]);
    await expect(page.locator('.asset-card__meta .asset-badge')).toHaveText(['已发布', '已发布']);
    await expect(
      page.getByRole('heading', { name: '构建诊断 Extension', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'MML开发 Extension', exact: true })).toHaveCount(
      0,
    );
  });

  test('Extension 详情文件默认折叠并按点击展开内容', async ({ page }) => {
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: '问题分析 Extension', exact: true }) });
    await card.getByRole('heading', { name: '问题分析 Extension', exact: true }).click();

    const tree = page.locator('.asset-extension-content');
    await expect(tree).toBeVisible();
    await expect(tree.getByRole('button', { name: /skills\// })).toBeVisible();
    await expect(tree.getByRole('button', { name: /commands\// })).toBeVisible();
    await expect(tree.getByRole('button', { name: /agents\// })).toBeVisible();
    await expect(tree.locator('pre')).toHaveCount(0);

    await tree.getByRole('button', { name: /异常归因Skill/ }).click();
    const skillFile = tree.getByRole('button', { name: 'SKILL.md', exact: true });
    await expect(skillFile).toBeVisible();
    await expect(tree.locator('pre')).toHaveCount(0);
    await skillFile.click();
    await expect(tree.locator('pre')).toContainText('异常归因Skill');

    await tree.getByRole('button', { name: /缺陷归因Agent/ }).click();
    await expect(tree.locator('pre')).toHaveCount(2);
    await expect(tree.locator('pre').last()).toContainText('缺陷归因Agent');
  });

  test('已发布 Extension 详情内切换发布记录页签展示历史并保持详情页', async ({
    page,
  }, testInfo) => {
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: '问题分析 Extension', exact: true }) });
    await card.getByRole('heading', { name: '问题分析 Extension', exact: true }).click();
    await expect(page.locator('.asset-detail')).toBeVisible();
    await expect(page.locator('.asset-detail__actions')).toHaveCount(0);
    await expect(
      page.locator('.asset-detail').getByRole('button', { name: '发布', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.asset-detail__version-panel')).toBeVisible();

    await page.locator('#asset-detail-tab-history').click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history).toBeVisible();
    await expect(page.locator('.asset-detail')).toBeVisible();
    await expect(page.locator('.asset-detail__version-panel')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toHaveCount(0);
    await expect(history.locator('.timeline-item')).toHaveCount(3);
    await expect(history.getByRole('button', { name: /加载更多/ })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .locator('.extension-page--embedded')
      .screenshot({ path: testInfo.outputPath('extension-history-tab.png') });

    await page.locator('#asset-detail-tab-content').click();
    await expect(history).toHaveCount(0);
    await expect(page.locator('.asset-detail__version-panel')).toBeVisible();

    await page.locator('#asset-detail-tab-history').click();
    await expect(history).toBeVisible();

    await page.getByRole('button', { name: '返回列表', exact: true }).click();
    await expect(page.locator('.asset-card')).toHaveCount(2);
  });
});

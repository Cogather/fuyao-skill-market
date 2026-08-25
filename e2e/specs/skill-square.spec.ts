import { expect, test } from '../fixtures/base';
import { SkillSquarePage } from '../pages/skillSquare.page';

/**
 * 冒烟用例：少而精、必须稳定。
 * 只验证"页面能打开、核心路径能走通"，业务细节验证放到各页面的回归用例里。
 * 页面改版时优先保证本文件全绿，再更新对应回归用例。
 */
test.describe('技能市场冒烟', { tag: '@smoke' }, () => {
  let marketPage: SkillSquarePage;

  test.beforeEach(async ({ page }) => {
    marketPage = new SkillSquarePage(page);
  });

  test('首页加载并展示热榜', async () => {
    await marketPage.gotoHotTab();

    await expect(marketPage.tabHot).toBeVisible();
    await expect(marketPage.publishButton).toBeVisible();
    await expect(
      marketPage.page.getByRole('heading', { name: /发现高价值/ }),
    ).toBeVisible();
  });

  test('切换到全部技能并搜索', async () => {
    await marketPage.gotoHotTab();
    await marketPage.switchToAllSkills();

    await marketPage.allSkillsSearchInput.fill('测试关键词');
    await expect(marketPage.allSkillsSearchInput).toHaveValue('测试关键词');
  });

  test('我的发布页可打开', async () => {
    await marketPage.gotoHotTab();
    await marketPage.tabMyReleases.click();

    await expect(
      marketPage.page.getByRole('heading', { name: '我的发布', exact: true }),
    ).toBeVisible();
  });
});

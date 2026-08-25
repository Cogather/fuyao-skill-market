import type { Locator, Page } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';

/**
 * 技能市场主页面（/skill-square）Page Object。
 *
 * 约定（重要）：
 * - 本页面的所有定位器集中在此文件；UI 改版时优先改这里，用例文件尽量不动；
 * - 定位器优先级：role/可见文本 > placeholder/aria-label > data-testid > 其他；
 * - 页面新增交互区域时，在这里加只读 Locator + 一个语义化动作方法（gotoXxx/switchToXxx/openXxx）。
 */
export class SkillSquarePage {
  readonly page: Page;

  // 顶部导航
  readonly tabHot: Locator;
  readonly tabAllSkills: Locator;
  readonly tabMyReleases: Locator;
  readonly publishButton: Locator;

  // 搜索框（不同 tab 下的 placeholder 不同，分别定义）
  readonly hotSearchInput: Locator;
  readonly allSkillsSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;

    // 热榜 tab 用 data-testid 定位（文案曾变动导致用例失效，已与文案解耦；见 contexts/skill-square.md 演进记录）
    this.tabHot = page.getByTestId('market-tab-hot');
    this.tabAllSkills = page.getByRole('button', { name: '全部技能', exact: true });
    this.tabMyReleases = page.getByRole('button', { name: '我的发布', exact: true });
    this.publishButton = page.getByRole('button', { name: '发布 Skill' });

    this.hotSearchInput = page.getByPlaceholder('搜索热门 Skill / 创建者 / 描述');
    this.allSkillsSearchInput = page.getByPlaceholder('搜索名称 / 描述 / 创建者工号');
  }

  /** 直达热榜 tab，并等待导航就绪 */
  async gotoHotTab(): Promise<void> {
    await this.page.goto(`${APP_BASE_PATH}/skill-square?tab=hot`);
    await this.tabHot.waitFor();
  }

  /** 切换到「全部技能」，并等待标题渲染完成 */
  async switchToAllSkills(): Promise<void> {
    await this.tabAllSkills.click();
    await this.page.getByRole('heading', { name: '全部技能', exact: true }).waitFor();
  }
}

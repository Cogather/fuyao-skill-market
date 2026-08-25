import type { Locator, Page } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';

/**
 * Harness 管理页（/harness-management）Page Object。
 *
 * 约定：本页面的所有定位器集中在此文件；UI 改版时优先改这里，用例文件尽量不动。
 * 定位器优先级：role/可见文本 > placeholder/aria-label > data-testid > 其他。
 */
export class HarnessManagementPage {
  readonly page: Page;

  // 顶栏身份区（任何权限下都渲染）
  readonly topbarIdentity: Locator;
  readonly tabList: Locator;
  readonly tabTasks: Locator;
  readonly tasksPanel: Locator;

  constructor(page: Page) {
    this.page = page;

    this.topbarIdentity = page.getByText('Harness 管理', { exact: true }).first();
    this.tabList = page.getByRole('tablist', { name: 'Harness 管理分区' });
    this.tabTasks = page.getByRole('tab', { name: '任务管理' });
    this.tasksPanel = page.locator('#harness-panel-tasks');
  }

  /** 直达本页，等待顶部导航就绪 */
  async goto(): Promise<void> {
    await this.page.goto(`${APP_BASE_PATH}/harness-management`);
    await this.tabList.waitFor();
  }

  /** 切换到「任务管理」，并等待面板渲染 */
  async switchToTasks(): Promise<void> {
    await this.tabTasks.click();
    await this.tasksPanel.waitFor();
  }
}

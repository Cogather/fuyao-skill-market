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
  readonly tabExtension: Locator;
  readonly applicationRelationTab: Locator;
  readonly atomicCatalogTab: Locator;
  readonly planningHeroDescription: Locator;
  readonly tasksPanel: Locator;
  readonly extensionPanel: Locator;
  readonly extensionReadySceneButton: Locator;
  readonly extensionPublishButton: Locator;
  readonly extensionPublishDialog: Locator;
  readonly extensionFollowPublishNote: Locator;
  readonly extensionTargetOrganizationField: Locator;

  constructor(page: Page) {
    this.page = page;

    this.topbarIdentity = page.getByText('Harness 管理', { exact: true }).first();
    this.tabList = page.getByRole('tablist', { name: 'Harness 管理分区' });
    this.tabTasks = page.getByRole('tab', { name: '任务管理' });
    this.tabExtension = page.getByRole('tab', { name: 'Extension 发布' });
    this.applicationRelationTab = page.getByRole('button', {
      name: new RegExp('\\u5e94\\u7528\\u5173\\u7cfb\\u914d\\u7f6e'),
    });
    this.atomicCatalogTab = page.getByRole('button', {
      name: new RegExp('\\u539f\\u5b50\\u6e05\\u5355'),
    });
    this.planningHeroDescription = page.locator('.planning-hero .all-desc');
    this.tasksPanel = page.locator('#harness-panel-tasks');
    this.extensionPanel = page.locator('#harness-panel-extension');
    this.extensionReadySceneButton = this.extensionPanel.getByRole('button', {
      name: /构建诊断/,
    });
    this.extensionPublishButton = this.extensionPanel.getByRole('button', {
      name: '发布',
      exact: true,
    });
    this.extensionPublishDialog = page.getByRole('dialog', { name: /发布 Extension/ });
    this.extensionFollowPublishNote = this.extensionPublishDialog.getByText(
      '列表中归属于当前所选产品的 skill, command, agent 实体会跟随 Extension 一起发布到 Agent Center 平台。',
      { exact: true },
    );
    this.extensionTargetOrganizationField = this.extensionPublishDialog
      .locator('label.modal-field')
      .filter({ hasText: '目标组织' });
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

  /** 切换到「Extension 发布」，并等待发布内容渲染 */
  async switchToExtension(): Promise<void> {
    await this.tabExtension.click();
    await this.extensionPanel.waitFor();
  }

  /** 切换到「原子清单」子页签 */
  async switchToAtomicCatalog(): Promise<void> {
    await this.atomicCatalogTab.click();
  }

  /** 选择一个可发布且未处于发布中的 Extension 场景 */
  async selectReadyExtensionScene(): Promise<void> {
    await this.extensionReadySceneButton.click();
    await this.extensionPanel.getByRole('heading', { name: /构建诊断/ }).waitFor();
  }

  /** 打开当前场景的 Extension 发布弹窗 */
  async openExtensionPublishDialog(): Promise<void> {
    await this.extensionPublishButton.click();
    await this.extensionPublishDialog.waitFor();
  }
}

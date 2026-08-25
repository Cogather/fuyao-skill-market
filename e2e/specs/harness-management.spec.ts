import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

/**
 * Harness 管理页冒烟：只验证"能打开 + tab 切换核心路径走通"。
 * 页面演进时优先保证本文件全绿。
 */
test.describe('Harness 管理冒烟', { tag: '@smoke' }, () => {
  let harnessPage: HarnessManagementPage;

  test.beforeEach(async ({ page }) => {
    harnessPage = new HarnessManagementPage(page);
  });

  test('页面打开并渲染顶部工作台', async () => {
    await harnessPage.goto();

    await expect(harnessPage.topbarIdentity).toBeVisible();
    await expect(harnessPage.tabList).toBeVisible();
    await expect(harnessPage.tabTasks).toBeVisible();
  });

  test('切换到任务管理面板', async () => {
    await harnessPage.goto();
    await harnessPage.switchToTasks();

    await expect(harnessPage.tabTasks).toHaveAttribute('aria-selected', 'true');
    await expect(harnessPage.tasksPanel).toBeVisible();
  });
});

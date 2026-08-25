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

  test('发布 Extension 弹窗以普通文字提示产品下实体会跟随发布', async () => {
    await harnessPage.goto();
    await harnessPage.switchToExtension();
    await harnessPage.selectReadyExtensionScene();
    await harnessPage.openExtensionPublishDialog();

    await expect(harnessPage.extensionFollowPublishNote).toBeVisible();
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('border-top-width', '0px');
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('padding-left', '0px');
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('padding-right', '0px');

    const noteBox = await harnessPage.extensionFollowPublishNote.boundingBox();
    const targetOrganizationBox =
      await harnessPage.extensionTargetOrganizationField.boundingBox();

    expect(noteBox).not.toBeNull();
    expect(targetOrganizationBox).not.toBeNull();
    expect(noteBox!.y).toBeLessThan(targetOrganizationBox!.y);
  });

  test('inner planning description switches with child tab', async () => {
    await harnessPage.goto();

    await expect(harnessPage.applicationRelationTab).toBeVisible();
    await expect(harnessPage.planningHeroDescription).toContainText(
      '用于配置原子能力在部门/产品下的应用关系，将能力关联到一级/二级场景及归属活动/子活动，形成可跟踪的能力规划关系。',
    );

    await harnessPage.switchToAtomicCatalog();

    await expect(harnessPage.planningHeroDescription).toContainText(
      '用于维护部门/产品范围内的原子能力及基础建设信息，作为应用关系配置的数据来源，支持查询、新增、导入、导出和批量维护。',
    );
  });
});

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('Harness 任务管理 Mock 数据', () => {
  test('三个待办页签展示当前用户任务及指定状态', async ({ page }) => {
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: '任务管理', exact: true }).click();

    const taskPanel = page.locator('.task-management-content');
    const cases = [
      { tab: 'Command待办', capability: 'Command' },
      { tab: 'Skill待办', capability: 'Skill' },
      { tab: 'Agent待办', capability: 'Agent' },
    ];

    for (const item of cases) {
      await page.getByRole('tab', { name: new RegExp(`^${item.tab}`) }).click();

      const taskNames = taskPanel.locator('.task-name-cell strong');
      const statuses = taskPanel.locator('tbody .status-badge');
      const versions = taskPanel.locator('tbody .task-version');
      await expect(taskNames).toHaveCount(10);
      await expect(taskNames.first()).toContainText(item.capability);
      await expect(statuses).toHaveCount(10);
      await expect(versions).toHaveCount(10);

      const statusTexts = (await statuses.allTextContents()).map((text) => text.trim());
      expect(new Set(statusTexts)).toEqual(new Set(['已完成', '进行中']));
      expect(
        (await versions.allTextContents()).every((version) => /^v0\.0\.\d+$/.test(version)),
      ).toBe(true);

      const completedStatus = statuses.filter({ hasText: '已完成' }).first();
      await expect(completedStatus).toHaveClass(/is-done/);
      await expect(completedStatus).toHaveCSS('color', 'rgb(24, 121, 78)');

      const inProgressStatus = statuses.filter({ hasText: '进行中' }).first();
      await expect(inProgressStatus).toHaveClass(/is-inProgress/);
      await expect(inProgressStatus).toHaveCSS('color', 'rgb(49, 86, 181)');
    }
  });
});

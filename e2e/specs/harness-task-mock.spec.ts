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
      const versionTexts = (await versions.allTextContents()).map((version) => version.trim());
      expect(versionTexts.filter((version) => version === '—')).toHaveLength(2);
      expect(
        versionTexts
          .filter((version) => version !== '—')
          .every((version) => /^0\.0\.\d+$/.test(version)),
      ).toBe(true);

      const completedStatus = statuses.filter({ hasText: '已完成' }).first();
      await expect(completedStatus).toHaveClass(/is-done/);
      await expect(completedStatus).toHaveCSS('color', 'rgb(24, 121, 78)');

      const inProgressStatus = statuses.filter({ hasText: '进行中' }).first();
      await expect(inProgressStatus).toHaveClass(/is-inProgress/);
      await expect(inProgressStatus).toHaveCSS('color', 'rgb(49, 86, 181)');
    }
  });

  test('任务详情按版本展示对应目录和文件内容', async ({ page }) => {
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: '任务管理', exact: true }).click();

    const cases = [
      { tab: 'Command待办', capability: 'Command' },
      { tab: 'Skill待办', capability: 'Skill' },
      { tab: 'Agent待办', capability: 'Agent' },
    ];
    let expectedDialogHeight: number | undefined;
    let expectedCapabilityHeight: number | undefined;

    for (const item of cases) {
      await page.getByRole('tab', { name: new RegExp(`^${item.tab}`) }).click();
      await page
        .getByRole('button', { name: `查看 ${item.capability}`, exact: true })
        .first()
        .click();

      const dialog = page.getByRole('dialog');
      const versionSelect = dialog.getByLabel('详情版本');
      const fileContent = dialog.locator('.task-detail-file-content').first();
      const capabilitySection = dialog.locator('.task-detail-capability');
      const detailContent = dialog.locator('.task-detail-content');
      const versionUpdatedAt = dialog.locator('.task-detail-version-filter__updated > strong');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS('overflow-y', 'hidden');
      const dialogFrame = await dialog.boundingBox();
      const topCloseButton = await dialog
        .getByRole('button', { name: '关闭', exact: true })
        .first()
        .boundingBox();
      expect(dialogFrame).not.toBeNull();
      expect(topCloseButton).not.toBeNull();
      expect(
        Math.abs(
          dialogFrame!.x + dialogFrame!.width - (topCloseButton!.x + topCloseButton!.width) - 12,
        ),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(topCloseButton!.y - dialogFrame!.y - 12)).toBeLessThanOrEqual(1);
      await expect(detailContent).toHaveCSS('overflow-y', 'auto');
      await expect(versionSelect.locator('option')).toHaveCount(3);
      await expect(versionSelect).toHaveValue('0.0.3');
      await expect(dialog.locator('.task-detail-folder-heading')).toHaveCount(0);
      await expect(dialog.locator('.task-detail-type-tag')).toHaveCount(0);
      await expect(dialog.getByText('计划完成时间', { exact: true })).toHaveCount(0);
      await expect(dialog.locator('.skill-detail-dialog__meta')).toContainText('规划部门或产品');
      await expect(versionUpdatedAt).toHaveText('2026-07-20 18:20:00');
      await expect(fileContent).toContainText('0.0.3');

      const capabilityToggle = dialog.locator('.task-detail-capability-toggle');
      await capabilityToggle.click();
      await expect(capabilityToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(dialog.locator('.task-detail-content')).toBeHidden();
      await capabilityToggle.click();
      await expect(detailContent).toBeVisible();

      const initialDialogBox = await dialog.boundingBox();
      const initialCapabilityBox = await capabilitySection.boundingBox();
      expect(initialDialogBox).not.toBeNull();
      expect(initialCapabilityBox).not.toBeNull();
      expectedDialogHeight ??= initialDialogBox!.height;
      expectedCapabilityHeight ??= initialCapabilityBox!.height;
      expect(Math.abs(initialDialogBox!.height - expectedDialogHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(initialCapabilityBox!.height - expectedCapabilityHeight)).toBeLessThanOrEqual(
        1,
      );

      await versionSelect.selectOption('0.0.2');
      await expect(dialog.locator('.task-detail-selected-version')).toHaveText('0.0.2');
      await expect(versionUpdatedAt).toHaveText('2026-07-19 18:20:00');
      await expect(fileContent).toContainText('0.0.2');

      const updatedDialogBox = await dialog.boundingBox();
      const updatedCapabilityBox = await capabilitySection.boundingBox();
      expect(updatedDialogBox).not.toBeNull();
      expect(updatedCapabilityBox).not.toBeNull();
      expect(Math.abs(updatedDialogBox!.height - initialDialogBox!.height)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(updatedCapabilityBox!.height - initialCapabilityBox!.height),
      ).toBeLessThanOrEqual(1);

      if (item.capability === 'Skill') {
        const firstFileRow = dialog.locator('.task-detail-file-row').first();
        await expect(dialog.locator('.task-detail-file-row')).toHaveCount(4);
        const caretBox = await firstFileRow.locator('.task-detail-caret').boundingBox();
        const fileNameBox = await firstFileRow.locator('span').last().boundingBox();
        expect(caretBox).not.toBeNull();
        expect(fileNameBox).not.toBeNull();
        expect(
          Math.abs(caretBox!.y + caretBox!.height / 2 - (fileNameBox!.y + fileNameBox!.height / 2)),
        ).toBeLessThanOrEqual(1);
      }

      await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
      await expect(dialog).toBeHidden();
    }
  });

  test('versions 为空时仅展示任务基本信息', async ({ page }) => {
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
      const emptyVersionCell = taskPanel
        .locator('tbody .task-version')
        .filter({ hasText: '—' })
        .first();
      await emptyVersionCell.locator('xpath=ancestor::tr').getByRole('button').click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/is-basic-only/);
      await expect(dialog.locator('.task-detail-version-filter')).toHaveCount(0);
      await expect(dialog.locator('.task-detail-capability')).toHaveCount(0);
      await expect(dialog.locator('footer')).toHaveCount(0);
      const compactDialogBox = await dialog.boundingBox();
      expect(compactDialogBox).not.toBeNull();
      expect(compactDialogBox!.height).toBeLessThan(200);
      await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
      await expect(dialog).toBeHidden();
    }
  });
});

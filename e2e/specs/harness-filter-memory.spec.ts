import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';
import type { Locator, Page } from '@playwright/test';

async function openAssets(page: Page): Promise<void> {
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await expect(page.getByRole('heading', { name: '资产清单', exact: true })).toBeVisible();
}

async function openCommandDialog(page: Page, action: '新增' | '导入' | '导出'): Promise<Locator> {
  await page.getByRole('button', { name: 'Command', exact: true }).click();
  await page
    .getByRole('button', { name: action === '新增' ? '＋ 新增' : action, exact: true })
    .click();
  return page.getByRole('dialog', {
    name: action === '新增' ? '添加 Command' : `${action} Command`,
    exact: true,
  });
}

async function closeDialog(dialog: Locator): Promise<void> {
  const closeButton = dialog.getByRole('button', { name: /关闭/ });
  if (await closeButton.count()) await closeButton.click();
  else await dialog.locator('header button').click();
  await expect(dialog).toBeHidden();
}

async function selectDialogDepartment(
  page: Page,
  dialog: Locator,
  ariaLabel: string,
  path: string[],
): Promise<void> {
  await dialog.getByRole('button', { name: ariaLabel, exact: true }).click();
  const panel = page.getByRole('listbox');
  for (let index = 0; index < path.length; index += 1) {
    await panel
      .locator('.market-dept-cascader-col')
      .nth(index)
      .getByRole('option')
      .filter({ has: page.getByText(path[index]!, { exact: true }) })
      .click();
  }
  await panel.getByRole('button', { name: '完成', exact: true }).click();
}

test.describe('Harness 部门与产品选择记忆', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '使用 mock 产品与部门数据验证页面生命周期',
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await openAssets(page);
  });

  test('资产弹窗按类型和操作记忆，切页签保留，刷新与路由切换后重置', async ({ page }) => {
    const createDialog = await openCommandDialog(page, '新增');
    const createScope = createDialog.getByRole('group', { name: '新增资产归属' });
    await selectHarnessOption(createScope.getByLabel('产品', { exact: true }), {
      label: 'devops-center-v2',
    });
    await closeDialog(createDialog);

    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    await page.locator('#harness-tab-assets').click();
    const restoredCreateDialog = await openCommandDialog(page, '新增');
    await expect(restoredCreateDialog.getByLabel('产品', { exact: true })).toHaveAttribute(
      'data-value',
      'devops-center-v2',
    );
    await closeDialog(restoredCreateDialog);

    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: '＋ 新增', exact: true }).click();
    const agentDialog = page.getByRole('dialog', { name: '添加 Agent', exact: true });
    await expect(agentDialog.getByLabel('产品', { exact: true })).not.toHaveAttribute(
      'data-value',
      'devops-center-v2',
    );
    await closeDialog(agentDialog);

    const importDialog = await openCommandDialog(page, '导入');
    await expect(importDialog.getByLabel('层级')).toHaveAttribute('data-value', '部门级');
    await selectDialogDepartment(page, importDialog, '导入资产部门', [
      '部门1',
      '平台产品线',
      '平台工具组',
    ]);
    await closeDialog(importDialog);

    const restoredImportDialog = await openCommandDialog(page, '导入');
    await expect(
      restoredImportDialog.getByRole('button', { name: '导入资产部门', exact: true }),
    ).toContainText('部门1 / 平台产品线 / 平台工具组');
    await closeDialog(restoredImportDialog);

    const exportDialog = await openCommandDialog(page, '导出');
    await selectHarnessOption(exportDialog.getByLabel('层级'), '产品级');
    await selectHarnessOption(exportDialog.getByLabel('产品', { exact: true }), {
      label: 'devops-center-v2',
    });
    await closeDialog(exportDialog);
    const restoredExportDialog = await openCommandDialog(page, '导出');
    await expect(restoredExportDialog.getByLabel('产品', { exact: true })).toHaveAttribute(
      'data-value',
      'devops-center-v2',
    );
    await closeDialog(restoredExportDialog);

    await page.evaluate(() =>
      window.postMessage({ type: 'Skill_Square_Init', tab: 'hot' }, window.location.origin),
    );
    await expect(page).toHaveURL(/\/skill-square/);
    await page.evaluate(() =>
      window.postMessage({ type: 'Skill_Square_Init', tab: 'planning' }, window.location.origin),
    );
    await expect(page).toHaveURL(/\/harness-management/);
    await page.locator('#harness-tab-assets').click();
    const routeResetDialog = await openCommandDialog(page, '导入');
    await expect(routeResetDialog.getByLabel('层级')).toHaveAttribute('data-value', '部门级');
    await expect(
      routeResetDialog.getByRole('button', { name: '导入资产部门', exact: true }),
    ).toContainText('持续交付组');
    await closeDialog(routeResetDialog);

    const rememberedBeforeRefresh = await openCommandDialog(page, '导入');
    await selectDialogDepartment(page, rememberedBeforeRefresh, '导入资产部门', [
      '部门1',
      '平台产品线',
      '平台工具组',
    ]);
    await closeDialog(rememberedBeforeRefresh);
    await page.reload();
    await page.locator('#harness-tab-assets').click();
    const refreshResetDialog = await openCommandDialog(page, '导入');
    await expect(refreshResetDialog.getByLabel('层级')).toHaveAttribute('data-value', '部门级');
    await expect(
      refreshResetDialog.getByRole('button', { name: '导入资产部门', exact: true }),
    ).toContainText('持续交付组');
  });

  test('业务场景选择在页签切换时保留，刷新后恢复默认', async ({ page }) => {
    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    const product = page.getByRole('combobox', { name: '选择产品', exact: true });
    await selectHarnessOption(product, { label: 'devops-center-v2' });
    await page.locator('#harness-tab-assets').click();
    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    await expect(product).toHaveAttribute('title', 'devops-center-v2');

    await page.reload();
    await expect(page.getByRole('combobox', { name: '选择产品', exact: true })).not.toHaveAttribute(
      'title',
      'devops-center-v2',
    );
  });
});

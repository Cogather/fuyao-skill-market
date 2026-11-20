import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';
import type { Locator, Page } from '@playwright/test';

const importDepartment = [
  '部门1',
  '平台产品线',
  '平台工具组',
  'DevOps部',
  '持续交付组',
  '流水线平台小组',
];

function departmentLabel(container: Locator, name: string) {
  return container
    .getByRole('button', { name, exact: true })
    .locator('.market-dept-cascader-trigger-text');
}

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
  await expect(panel).toBeHidden();
}

test.describe('Harness 部门与产品选择记忆', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '使用 mock 产品与部门数据验证页面生命周期',
  );

  test.beforeEach(async ({ page }) => {
    await openAssets(page);
  });

  test('资产弹窗按类型和操作记忆，刷新、路由切换与新页面继续保留', async ({ page, context }) => {
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
    await selectDialogDepartment(page, importDialog, '导入资产部门', importDepartment);
    await closeDialog(importDialog);

    const restoredImportDialog = await openCommandDialog(page, '导入');
    await expect(departmentLabel(restoredImportDialog, '导入资产部门')).toHaveText(
      importDepartment.join(' / '),
    );
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
    await expect(departmentLabel(routeResetDialog, '导入资产部门')).toHaveText(
      importDepartment.join(' / '),
    );
    await closeDialog(routeResetDialog);

    const rememberedBeforeRefresh = await openCommandDialog(page, '导入');
    await selectDialogDepartment(page, rememberedBeforeRefresh, '导入资产部门', importDepartment);
    await closeDialog(rememberedBeforeRefresh);
    await page.reload();
    await page.locator('#harness-tab-assets').click();
    const refreshResetDialog = await openCommandDialog(page, '导入');
    await expect(refreshResetDialog.getByLabel('层级')).toHaveAttribute('data-value', '部门级');
    await expect(departmentLabel(refreshResetDialog, '导入资产部门')).toHaveText(
      importDepartment.join(' / '),
    );
    await closeDialog(refreshResetDialog);
    for (const action of ['新增', '导出'] as const) {
      const dialog = await openCommandDialog(page, action);
      await expect(dialog.getByLabel('产品', { exact: true })).toHaveAttribute(
        'data-value',
        'devops-center-v2',
      );
      await closeDialog(dialog);
    }

    const nextPage = await context.newPage();
    await page.close();
    await openAssets(nextPage);
    const dialog = await openCommandDialog(nextPage, '导入');
    await expect(departmentLabel(dialog, '导入资产部门')).toHaveText(importDepartment.join(' / '));
  });

  test('业务场景和工作流独立记忆，刷新后恢复各自的部门和产品', async ({ page }) => {
    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    const product = page.getByRole('combobox', { name: '选择产品', exact: true });
    await selectHarnessOption(product, { label: 'devops-center-v2' });
    await page.locator('#harness-tab-assets').click();
    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    await expect(product).toHaveAttribute('title', 'devops-center-v2');

    await page.getByRole('tab', { name: 'Harness 工作流', exact: true }).click();
    const workflowPanel = page.locator('#harness-panel-workflows');
    await selectDialogDepartment(page, workflowPanel, '选择部门', [
      '部门1',
      '平台产品线',
      '平台工具组',
    ]);
    const workflowProduct = workflowPanel.getByRole('combobox', { name: '筛选产品', exact: true });
    await selectHarnessOption(workflowProduct, { label: 'DevOps 管理工作台' });

    await page.reload();
    await expect(page.getByRole('combobox', { name: '选择产品', exact: true })).toHaveAttribute(
      'title',
      'devops-center-v2',
    );
    await expect(
      page
        .locator('#harness-panel-scenarios')
        .getByRole('button', { name: '选择部门', exact: true }),
    ).toContainText('持续交付组');
    await page.getByRole('tab', { name: 'Harness 工作流', exact: true }).click();
    await expect(departmentLabel(workflowPanel, '选择部门')).toHaveText(
      '部门1 / 平台产品线 / 平台工具组',
    );
    await expect(workflowProduct).toHaveAttribute('title', 'DevOps 管理工作台');
  });

  test('资产列表部门和产品刷新后保留，清空部门后也记住空选择', async ({ page }) => {
    const panel = page.locator('#harness-panel-assets');
    await selectDialogDepartment(page, panel, '选择部门', ['部门1', '平台产品线', '平台工具组']);
    await selectHarnessOption(panel.getByRole('combobox', { name: '产品筛选', exact: true }), {
      label: 'Harness-Pipeline-Pro',
    });
    await page.reload();
    await page.locator('#harness-tab-assets').click();
    await expect(departmentLabel(panel, '选择部门')).toHaveText('部门1 / 平台产品线 / 平台工具组');
    await expect(panel.getByRole('combobox', { name: '产品筛选', exact: true })).toHaveAttribute(
      'title',
      'Harness-Pipeline-Pro',
    );
    await panel.getByRole('button', { name: '选择部门', exact: true }).click();
    await page.getByRole('listbox').getByRole('button', { name: '清空部门', exact: true }).click();
    await page.reload();
    await page.locator('#harness-tab-assets').click();
    await expect(departmentLabel(panel, '选择部门')).toHaveText('选部门…');
  });

  for (const assetType of ['Agent', 'Skill'] as const) {
    test(`${assetType} 的新增、导入、导出均持久化部门产品`, async ({ page }) => {
      async function open(action: '新增' | '导入' | '导出') {
        await page.getByRole('button', { name: assetType, exact: true }).click();
        await page
          .getByRole('button', { name: action === '新增' ? '＋ 新增' : action, exact: true })
          .click();
        return page.getByRole('dialog');
      }
      for (const action of ['新增', '导入', '导出'] as const) {
        const dialog = await open(action);
        await selectHarnessOption(dialog.getByLabel('层级'), '产品级');
        await selectHarnessOption(dialog.getByLabel('产品', { exact: true }), {
          label: 'devops-center-v2',
        });
        await closeDialog(dialog);
      }
      await page.reload();
      await page.locator('#harness-tab-assets').click();
      for (const action of ['新增', '导入', '导出'] as const) {
        const dialog = await open(action);
        await expect(dialog.getByLabel('层级')).toHaveAttribute('data-value', '产品级');
        await expect(dialog.getByLabel('产品', { exact: true })).toHaveAttribute(
          'data-value',
          'devops-center-v2',
        );
        await closeDialog(dialog);
      }
    });
  }
});

test('HTTP 权限配置刷新后恢复已选部门', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '使用 HTTP 权限部门树');
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'permission-memory-user',
        departmentList: [
          {
            deptCode: 'root',
            deptName: '研发部',
            deptLevel: 1,
            children: [{ deptCode: 'team-a', deptName: '团队A', deptLevel: 2 }],
          },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith('/api/')) return route.fallback();
    const data = pathname.endsWith('/permission/user-depts')
      ? {
          ownedOrgs: [{ deptName: '研发部', deptCode: 'root', path: ['研发部'], levelNo: 1 }],
          adminOrgs: [],
        }
      : [];
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: '权限管理', exact: true }).click();
  const panel = page.getByRole('region', { name: '部门权限配置', exact: true });
  await selectDialogDepartment(page, panel, '部门权限配置部门级联选择', ['研发部', '团队A']);
  await page.reload();
  await page.getByRole('tab', { name: '权限管理', exact: true }).click();
  await expect(departmentLabel(panel, '部门权限配置部门级联选择')).toHaveText('研发部 / 团队A');
});

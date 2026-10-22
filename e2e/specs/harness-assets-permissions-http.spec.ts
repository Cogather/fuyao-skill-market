import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

async function prepare(
  page: Page,
  type: string,
  permission: {
    canEdit?: unknown;
    listCanEdit?: unknown;
    ownerId?: string | null;
    delayDetail?: boolean;
    failDetail?: boolean;
    enterDetail?: boolean;
    dimType?: '产品级' | '部门级';
  } = {},
) {
  const dimType = permission.dimType ?? '部门级';
  const dimName = dimType === '产品级' ? '资产产品' : '研发部';
  const writes: Request[] = [];
  let releaseDetail!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'current-user',
        userName: '同名用户',
        departmentList: [
          { deptId: 'dept-root', deptCode: 'dept-root', deptName: '研发部', deptLevel: 1 },
        ],
      }),
    ),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return route.fallback();
    if (pathname.includes('/management/update') || pathname.includes('/management/delete/'))
      writes.push(request);
    let data: unknown = [];
    if (pathname.endsWith('/permission/user-depts'))
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    else if (pathname.endsWith('/components/query'))
      data = {
        records: [
          {
            name: 'permission-asset',
            description: '权限检查',
            category: `${dimType}/${dimName}`,
            dimType,
            dimName,
            latestVersion: '1.0.0',
            status: '已发布',
            canEdit: permission.listCanEdit,
            owner: '同名用户 current-user',
            developer: '同名用户 current-user',
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      };
    else if (pathname.endsWith('/components/detail')) {
      if (permission.delayDetail) await gate;
      if (permission.failDetail)
        return route.fulfill({ json: { meta: { success: false, message: '详情暂不可用' } } });
      data = {
        name: 'permission-asset',
        description: '权限检查',
        category: `${dimType}/${dimName}`,
        dimType,
        type: type.toUpperCase(),
        canEdit: permission.canEdit,
        ownerName: '同名用户',
        ownerId: permission.ownerId,
        developerName: '同名用户',
        developerId: 'current-user',
        versions: [{ version: '1.0.0' }],
      };
    } else if (pathname.endsWith('/management/query'))
      data = [
        {
          id: 42,
          [`${type.toLowerCase()}Name`]: 'permission-asset',
          dimType,
          dimCode: dimType === '产品级' ? 'asset-product' : 'dept-root',
          dimName,
        },
      ];
    else if (pathname.endsWith('/packages/tree')) data = ['SKILL.md'];
    else if (pathname.endsWith('/packages/file')) data = { content: '文件内容' };
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: type, exact: true }).click();
  const card = page.locator('.asset-card').filter({ hasText: 'permission-asset' });
  if (permission.enterDetail !== false) {
    await card.getByRole('heading', { name: 'permission-asset', exact: true }).click();
    if (!permission.delayDetail && !permission.failDetail)
      await expect(page.locator('.asset-detail__people')).toContainText('同名用户（current-user）');
  }
  return { writes, releaseDetail, card };
}

test.describe('资产详情权限 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const [dimType, expectedLabel] of [
    ['产品级', '归属产品'],
    ['部门级', '归属部门'],
  ] as const) {
    test(`${dimType}资产详情显示“${expectedLabel}”`, async ({ page }) => {
      await prepare(page, 'Agent', {
        canEdit: true,
        listCanEdit: true,
        ownerId: 'current-user',
        dimType,
      });

      const scope = page.locator('.asset-detail__scope').first();
      await expect(scope.getByText(expectedLabel, { exact: true })).toBeVisible();
      await expect(scope.getByText('归属 dim', { exact: true })).toHaveCount(0);
    });
  }

  test('列表 canEdit=true 时查看详情和编辑信息均可用', async ({ page }) => {
    const { card } = await prepare(page, 'Agent', {
      canEdit: true,
      listCanEdit: true,
      ownerId: 'other-user',
      enterDetail: false,
    });
    await card.getByRole('button', { name: /^更多操作：/ }).click();
    const menu = card.getByRole('menu');
    const view = menu.getByRole('menuitem', { name: '查看详情', exact: true });
    const edit = menu.getByRole('menuitem', { name: '编辑信息', exact: true });
    await expect(view).toBeEnabled();
    await expect(edit).toBeEnabled();
    await edit.click();
    const editDialog = page.getByRole('dialog', { name: '编辑 Agent', exact: true });
    await expect(editDialog).toBeVisible();
    await expect(page.locator('.asset-detail')).toHaveCount(0);
    await editDialog.getByRole('button', { name: '取消', exact: true }).click();
    await card.getByRole('button', { name: /^更多操作：/ }).click();
    await view.click();
    await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeVisible();
  });

  test('编辑弹窗仅通过关闭或操作按钮退出', async ({ page }) => {
    const { card } = await prepare(page, 'Agent', {
      canEdit: true,
      listCanEdit: true,
      ownerId: 'current-user',
      enterDetail: false,
    });
    await card.getByRole('button', { name: /^更多操作：/ }).click();
    await card.getByRole('menuitem', { name: '编辑信息', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑 Agent', exact: true });
    await expect(dialog).toBeVisible();

    await page.locator('.asset-master-overlay').click({ position: { x: 6, y: 6 } });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('heading', { name: '编辑 Agent', exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  for (const listCanEdit of [false, undefined, null, 'true', 1]) {
    test(`列表 canEdit=${typeof listCanEdit}:${String(listCanEdit)} 时仅禁用编辑信息，查看详情仍可用`, async ({
      page,
    }) => {
      const { card, writes } = await prepare(page, 'Agent', {
        canEdit: true,
        listCanEdit,
        ownerId: 'current-user',
        enterDetail: false,
      });
      await expect(card).toHaveAttribute('tabindex', '0');
      await card.getByRole('button', { name: /^更多操作：/ }).click();
      const menu = card.getByRole('menu');
      const view = menu.getByRole('menuitem', { name: '查看详情', exact: true });
      const edit = menu.getByRole('menuitem', { name: '编辑信息', exact: true });
      await expect(view).toBeEnabled();
      await expect(edit).toBeDisabled();

      await view.click();
      await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '返回列表', exact: true }).click();

      await card.getByRole('button', { name: /^更多操作：/ }).click();
      const forcedEdit = card.getByRole('menuitem', { name: '编辑信息', exact: true });
      await forcedEdit.evaluate((button) => button.removeAttribute('disabled'));
      await forcedEdit.click();
      await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
      expect(writes).toHaveLength(0);

      await card.getByRole('heading', { name: 'permission-asset', exact: true }).click();
      await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeVisible();
    });
  }

  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} canEdit=true 可编辑和删除，不要求当前用户是责任人`, async ({ page }) => {
      const { writes } = await prepare(page, type, {
        canEdit: true,
        listCanEdit: true,
        ownerId: 'other-user',
      });
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByRole('textbox', { name: '描述', exact: true }).fill('允许保存的描述');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('.asset-detail__description')).toHaveText('允许保存的描述');
      expect(writes).toHaveLength(1);
      await page.getByRole('button', { name: '删除资产', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `删除 ${type} 资产` });
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(writes).toHaveLength(2);
      expect(writes[1]!.method()).toBe('DELETE');
    });

    test(`${type} canEdit=false 时责任人的编辑和删除按钮也置灰禁用`, async ({ page }) => {
      const { writes } = await prepare(page, type, {
        canEdit: false,
        listCanEdit: true,
        ownerId: 'current-user',
      });
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCSS(
        'background-color',
        'rgb(229, 231, 235)',
      );
      await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
      // The handler must still reject edits if the DOM disabled attribute is removed.
      const edit = page.getByRole('button', { name: '编辑', exact: true });
      await edit.evaluate((button) => button.removeAttribute('disabled'));
      await edit.click();
      await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
      const remove = page.getByRole('button', { name: '删除资产', exact: true });
      await expect(remove).toBeDisabled();
      await expect(remove).toHaveCSS('background-color', 'rgb(229, 231, 235)');
      await remove.evaluate((button) => button.removeAttribute('disabled'));
      await remove.click();
      await expect(page.getByRole('dialog', { name: `删除 ${type} 资产` })).toHaveCount(0);
      expect(writes).toHaveLength(0);
    });
  }

  for (const canEdit of [null, 'true', 1]) {
    test(`canEdit=${String(canEdit)} 不按 truthy 值授予编辑权限`, async ({ page }) => {
      const { writes } = await prepare(page, 'Command', {
        canEdit,
        listCanEdit: true,
        ownerId: null,
      });
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeDisabled();
      expect(writes).toHaveLength(0);
    });
  }

  test('责任人转交并保存后，删除仍由 canEdit 决定', async ({ page }) => {
    const { writes } = await prepare(page, 'Command', {
      canEdit: true,
      listCanEdit: true,
      ownerId: 'current-user',
    });
    await page.route('**/dataengineering/config-center/hw-userinfo**', (route) =>
      route.fulfill({
        json: {
          meta: { success: true },
          data: [
            {
              id: 'new-owner',
              sAMAccountName: 'new-owner',
              chName: '新责任人',
              deptName: '研发部',
            },
          ],
        },
      }),
    );
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name: '清空责任人', exact: true }).click();
    await page.getByRole('combobox', { name: '责任人', exact: true }).fill('new-owner');
    await page.getByRole('option', { name: /新责任人/ }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑 Agent', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeEnabled();
    expect(writes[0]!.postDataJSON().ownerId).toBe('new-owner');
  });

  test('列表显式返回 canEdit 时透传，详情未给该字段可使用列表权限', async ({ page }) => {
    await prepare(page, 'Agent', { listCanEdit: true, ownerId: 'current-user-suffix' });
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeEnabled();
  });

  test('详情加载中编辑和删除均禁用，响应后按 canEdit 启用', async ({ page }) => {
    const { releaseDetail } = await prepare(page, 'Skill', {
      canEdit: true,
      listCanEdit: true,
      ownerId: 'current-user',
      delayDetail: true,
    });
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeDisabled();
    releaseDetail();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeEnabled();
  });

  test('详情失败时，即使列表标记可编辑也禁用编辑和删除', async ({ page }) => {
    await prepare(page, 'Agent', { listCanEdit: true, ownerId: 'current-user', failDetail: true });
    await expect(page.getByText('详情暂不可用', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeDisabled();
  });
});

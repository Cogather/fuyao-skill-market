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
  } = {},
) {
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
            category: '部门级/研发部',
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
        category: '部门级/研发部',
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
          dimType: '部门级',
          dimCode: 'dept-root',
          dimName: '研发部',
        },
      ];
    else if (pathname.endsWith('/packages/tree')) data = ['SKILL.md'];
    else if (pathname.endsWith('/packages/file')) data = { content: '文件内容' };
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: type, exact: true }).click();
  await page.getByRole('heading', { name: 'permission-asset', exact: true }).click();
  if (!permission.delayDetail && !permission.failDetail)
    await expect(page.locator('.asset-detail__people')).toContainText('同名用户（current-user）');
  return { writes, releaseDetail };
}

test.describe('资产详情权限 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} canEdit=true 可编辑，非责任人即使同名且是开发责任人也看不到删除`, async ({
      page,
    }) => {
      const { writes } = await prepare(page, type, { canEdit: true, ownerId: 'other-user' });
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByRole('textbox', { name: '描述', exact: true }).fill('允许保存的描述');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('.asset-detail__description')).toHaveText('允许保存的描述');
      expect(writes).toHaveLength(1);
    });

    test(`${type} 责任人没有 canEdit 时编辑禁用，但仍可打开删除确认`, async ({ page }) => {
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
      await page.getByRole('button', { name: '删除资产', exact: true }).click();
      await expect(page.getByRole('dialog', { name: `删除 ${type} 资产` })).toBeVisible();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      expect(writes).toHaveLength(0);
    });
  }

  for (const canEdit of [undefined, null, 'true', 1]) {
    test(`canEdit=${String(canEdit)} 不按 truthy 值授予编辑权限`, async ({ page }) => {
      const { writes } = await prepare(page, 'Command', { canEdit, ownerId: null });
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
      expect(writes).toHaveLength(0);
    });
  }

  test('责任人转交并保存后，原责任人的删除按钮立即隐藏', async ({ page }) => {
    const { writes } = await prepare(page, 'Command', { canEdit: true, ownerId: 'current-user' });
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
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
    expect(writes[0]!.postDataJSON().ownerId).toBe('new-owner');
  });

  test('列表显式返回 canEdit 时透传，详情未给该字段可使用列表权限', async ({ page }) => {
    await prepare(page, 'Agent', { listCanEdit: true, ownerId: 'current-user-suffix' });
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
  });

  test('详情加载中不授予权限，响应后显示责任人操作', async ({ page }) => {
    const { releaseDetail } = await prepare(page, 'Skill', {
      canEdit: true,
      listCanEdit: true,
      ownerId: 'current-user',
      delayDetail: true,
    });
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
    releaseDetail();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeVisible();
  });

  test('详情失败时，即使列表标记可编辑也禁用编辑并隐藏删除', async ({ page }) => {
    await prepare(page, 'Agent', { listCanEdit: true, ownerId: 'current-user', failDetail: true });
    await expect(page.getByText('详情暂不可用', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
  });
});

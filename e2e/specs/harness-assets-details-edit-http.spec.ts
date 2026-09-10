import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

async function prepare(page: Page, type: string, rejectFirst = false) {
  const updates: Request[] = [];
  const queries: Request[] = [];
  let rejectNext = rejectFirst;
  const record = {
    name: `asset-${type.toLowerCase()}`,
    canEdit: true,
    description: '原描述',
    ownerName: '原责任人',
    ownerId: 'u1',
    developerName: '原开发人',
    developerId: 'u2',
  };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'edit-user',
        userName: '编辑用户',
        departmentList: [
          { deptId: 'dept-root', deptCode: 'dept-root', deptName: '研发部', deptLevel: 1 },
        ],
      }),
    ),
  );
  await page.route('**/dataengineering/config-center/hw-userinfo**', (route) =>
    route.fulfill({
      json: {
        meta: { success: true },
        data: [{ id: 'u9', sAMAccountName: 'u9', chName: '新负责人', deptName: '新部门' }],
      },
    }),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts'))
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    else if (path.endsWith('/components/query'))
      data = {
        records: [
          {
            ...record,
            latestVersion: '1.0',
            status: '已发布',
            category: '产品级/资产产品',
            dimType: '产品级',
            dimCode: 'asset-product',
            dimName: '资产产品',
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      };
    else if (path.endsWith('/components/detail'))
      data = {
        ...record,
        type: type.toUpperCase(),
        category: '产品级/资产产品',
        versions: [{ version: '1.0' }],
      };
    else if (path.endsWith('/management/query')) {
      queries.push(request);
      data = [
        {
          id: 42,
          [`${type.toLowerCase()}Name`]: record.name,
          dimType: '产品级',
          dimCode: 'asset-product',
          dimName: '资产产品',
        },
      ];
    } else if (path.endsWith('/management/update')) {
      updates.push(request);
      if (rejectNext) {
        rejectNext = false;
        return route.fulfill({ json: { meta: { success: false, message: '保存暂时失败' } } });
      }
      const body = request.postDataJSON();
      record.name = body[`${type.toLowerCase()}Name`] ?? record.name;
      record.description = body[`${type.toLowerCase()}Description`] ?? record.description;
      if (body.ownerId) Object.assign(record, { ownerName: body.ownerName, ownerId: body.ownerId });
      if (body.developOwnerId)
        Object.assign(record, {
          developerName: body.developOwnerName,
          developerId: body.developOwnerId,
        });
    } else if (path.endsWith('/packages/tree')) data = ['SKILL.md'];
    else if (path.endsWith('/packages/file')) data = { content: '文件内容' };
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: type, exact: true }).click();
  await page.locator('.asset-card').getByRole('heading').click();
  await expect(page.locator('.asset-detail__description')).toHaveText('原描述');
  return { record, updates, queries };
}

test.describe('资产详情统一编辑 HTTP', () => {
  test('编辑责任人时浮层不撑高信息区，两个选择器均可正常选择和关闭', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepare(page, 'Agent');
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const people = page.locator('.asset-detail__people');
    const bounds = await people.boundingBox();
    expect(bounds).not.toBeNull();
    for (const label of ['责任人', '开发责任人']) {
      const input = page.getByRole('combobox', { name: label, exact: true });
      await page.getByRole('button', { name: `清空${label}`, exact: true }).click();
      await input.fill('u9');
      const option = page.getByRole('option').filter({ hasText: '新负责人' });
      await expect(option).toBeVisible();
      expect(await people.boundingBox()).toEqual(bounds);
      await option.click();
      await expect(input).toHaveValue('新负责人 u9');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    }
    const input = page.getByRole('combobox', { name: '开发责任人', exact: true });
    await page.getByRole('button', { name: '清空开发责任人', exact: true }).click();
    await input.fill('u9');
    await expect(page.getByRole('option')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('asset-edit-floating-picker.png') });
    await input.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await input.fill('u9');
    await expect(page.getByRole('option')).toBeVisible();
    await page.getByRole('textbox', { name: '描述', exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await people.boundingBox()).toEqual(bounds);
  });

  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} 一次保存名称、描述和两个责任人，并能重新打开和继续编辑`, async ({
      page,
    }, testInfo) => {
      const { updates, queries } = await prepare(page, type);
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      const save = page.getByRole('button', { name: '保存', exact: true });
      await expect(save).toBeVisible();
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('renamed-asset');
      await page.getByRole('textbox', { name: '描述', exact: true }).fill('新的资产描述');
      for (const label of ['责任人', '开发责任人']) {
        const picker = page.getByRole('combobox', { name: label, exact: true });
        await picker.locator('..').getByRole('button', { name: /清空/ }).click();
        await picker.fill('u9');
        await page.getByRole('option').filter({ hasText: '新负责人' }).click();
      }
      expect(updates).toHaveLength(0);
      if (type === 'Agent') await page.screenshot({ path: testInfo.outputPath('asset-edit.png') });
      await save.click();
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible();
      await expect(page.locator('#asset-detail-title')).toHaveText('renamed-asset');
      await expect(page.locator('.asset-detail__description')).toHaveText('新的资产描述');
      await expect(page.locator('.asset-detail__people')).toContainText('新负责人');
      expect(updates).toHaveLength(1);
      expect(updates[0]!.method()).toBe('PUT');
      expect(new URL(updates[0]!.url()).pathname).toBe(
        `/api/harness/${type.toLowerCase()}s/management/update`,
      );
      expect(updates[0]!.postDataJSON()).toEqual({
        id: 42,
        [`${type.toLowerCase()}Name`]: 'renamed-asset',
        [`${type.toLowerCase()}Description`]: '新的资产描述',
        ownerName: '新负责人',
        ownerId: 'u9',
        developOwnerName: '新负责人',
        developOwnerId: 'u9',
      });
      expect(Object.fromEntries(new URL(updates[0]!.url()).searchParams)).toEqual({
        userId: 'edit-user',
        dimType: '产品级',
        dimCode: 'asset-product',
        dimName: '资产产品',
      });
      await page.getByRole('button', { name: '返回列表', exact: true }).click();
      await page
        .locator('.asset-card')
        .getByRole('heading', { name: 'renamed-asset', exact: true })
        .click();
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByRole('textbox', { name: '描述', exact: true }).fill('第二次保存');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('.asset-detail__description')).toHaveText('第二次保存');
      expect(new URL(queries.at(-1)!.url()).searchParams.get('keyword')).toBe('renamed-asset');
      expect(updates.at(-1)!.postDataJSON()).not.toHaveProperty('ownerId');
    });
  }

  test('取消不保存，名称为空不提交，接口失败保留草稿以便重试', async ({ page }) => {
    const { updates } = await prepare(page, 'Agent', true);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('cancel-name');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('#asset-detail-title')).toHaveText('asset-agent');
    expect(updates).toHaveLength(0);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill(' ');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('名称');
    expect(updates).toHaveLength(0);
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('retry-name');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('保存暂时失败');
    await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue(
      'retry-name',
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('#asset-detail-title')).toHaveText('retry-name');
    expect(updates).toHaveLength(2);
  });

  test('保存期间禁止重复提交和切换详情，响应后退出编辑', async ({ page }) => {
    await prepare(page, 'Agent');
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let requests = 0;
    await page.route('**/api/harness/agents/management/update**', async (route) => {
      requests += 1;
      await gate;
      await route.fulfill({ json: { meta: { success: true } } });
    });
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('pending-name');
    const request = page.waitForRequest('**/api/harness/agents/management/update**');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await request;
    await expect(page.getByRole('button', { name: '保存中…', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: '名称', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: '责任人', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: '版本', exact: true })).toBeDisabled();
    finish();
    await expect(page.locator('#asset-detail-title')).toHaveText('pending-name');
    expect(requests).toBe(1);
  });
});

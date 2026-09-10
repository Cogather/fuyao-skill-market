import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

async function prepare(
  page: Page,
  type: string,
  options = { rejectFirst: false, ambiguous: false },
) {
  const updates: Request[] = [];
  const queries: Request[] = [];
  let rejectNext = options.rejectFirst;
  const names = { owner: '原责任人 u1', developer: '原开发人 u2' };
  const assetName = `asset-${type.toLowerCase()}`;
  await page.addInitScript(() => {
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
    );
  });
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
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data = [{ offeringId: 'list-product', offeringName: '列表产品' }];
    } else if (path.endsWith('/components/query')) {
      data = {
        records: [
          {
            name: assetName,
            description: '原描述',
            latestVersion: '1.0.0',
            status: '已发布',
            category: '产品级/资产所属产品',
            ...names,
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      };
    } else if (path.endsWith('/components/detail')) {
      const [ownerName, ownerId] = names.owner.split(' ');
      const [developerName, developerId] = names.developer.split(' ');
      data = {
        canEdit: true,
        name: assetName,
        description: '原描述',
        type: type.toUpperCase(),
        category: '产品级/资产所属产品',
        ownerName,
        ownerId,
        developerName,
        developerId,
        versions: [{ version: '1.0.0' }],
      };
    } else if (path.endsWith('/management/query')) {
      queries.push(request);
      const record = {
        id: `master-${type}`,
        [`${type.toLowerCase()}Name`]: assetName,
        dimType: '产品级',
        dimCode: 'asset-product-code',
        dimName: '资产所属产品',
      };
      data = [
        { ...record, id: 'same-name-other-product', dimCode: 'wrong-product', dimName: '其他产品' },
        record,
        ...(options.ambiguous ? [{ ...record, id: 'duplicate-master' }] : []),
      ];
    } else if (path.endsWith('/management/update')) {
      updates.push(request);
      if (rejectNext) {
        rejectNext = false;
        return route.fulfill({ json: { meta: { success: false, message: '保存暂时失败' } } });
      }
      const body = request.postDataJSON();
      if ('ownerId' in body) names.owner = `${body.ownerName} ${body.ownerId}`;
      if ('developOwnerId' in body)
        names.developer = `${body.developOwnerName} ${body.developOwnerId}`;
      data = { id: `master-${type}` };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  const openDetail = async () => {
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: '资产清单', exact: true }).click();
    await page.getByRole('button', { name: type, exact: true }).click();
    await page.getByRole('heading', { name: assetName, exact: true }).click();
  };
  await openDetail();
  return { updates, queries, openDetail };
}

async function selectPerson(page: Page, label: string) {
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: `清空${label}`, exact: true }).click();
  await page.getByRole('combobox', { name: label, exact: true }).fill('u9');
  await page
    .getByRole('listbox', { name: `${label}搜索结果`, exact: true })
    .getByRole('option')
    .filter({ hasText: '新负责人' })
    .click();
}

test.describe('HTTP 资产人员编辑', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  for (const type of ['Skill', 'Agent', 'Command']) {
    test(`${type} 整体编辑使用真实主数据 ID 和资产归属，仅提交变更的人员字段`, async ({
      page,
    }, testInfo) => {
      const { updates, queries, openDetail } = await prepare(page, type);
      await selectPerson(page, '责任人');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      expect(updates).toHaveLength(0);
      await expect(page.locator('.asset-detail__people dd')).toHaveText([
        '原责任人（u1）',
        '原开发人（u2）',
      ]);
      for (const [label, expectedFields] of [
        ['责任人', { ownerName: '新负责人', ownerId: 'u9' }],
        ['开发责任人', { developOwnerName: '新负责人', developOwnerId: 'u9' }],
      ] as const) {
        await selectPerson(page, label);
        if (type === 'Skill' && label === '责任人') {
          await page.screenshot({ path: testInfo.outputPath('person-editor.png') });
        }
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible();
        const request = updates.at(-1)!;
        expect(request.method()).toBe('PUT');
        expect(new URL(request.url()).pathname).toBe(
          `/api/harness/${type.toLowerCase()}s/management/update`,
        );
        expect(request.postDataJSON()).toEqual({
          id: `master-${type}`,
          [`${type.toLowerCase()}Name`]: `asset-${type.toLowerCase()}`,
          [`${type.toLowerCase()}Description`]: '原描述',
          ...expectedFields,
        });
        expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
          userId: 'edit-user',
          dimType: '产品级',
          dimCode: 'asset-product-code',
          dimName: '资产所属产品',
        });
      }
      expect(queries.length).toBeGreaterThan(0);
      await openDetail();
      await expect(page.locator('.asset-detail__people dd')).toHaveText([
        '新负责人（u9）',
        '新负责人（u9）',
      ]);
      if (type === 'Skill') {
        await page
          .locator('.asset-detail__people')
          .screenshot({ path: testInfo.outputPath('asset-people.png') });
      }
    });
  }

  test('保存失败保留人员草稿，重试成功后再更新详情', async ({ page }) => {
    const { updates } = await prepare(page, 'Skill', { rejectFirst: true, ambiguous: false });
    await selectPerson(page, '开发责任人');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('保存暂时失败');
    await expect(page.getByRole('combobox', { name: '开发责任人', exact: true })).toHaveValue(
      '新负责人 u9',
    );
    await expect(page.getByRole('combobox', { name: '责任人', exact: true })).toHaveValue(
      '原责任人 u1',
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible();
    expect(updates).toHaveLength(2);
    await expect(page.locator('.asset-detail__people dd')).toHaveText([
      '原责任人（u1）',
      '新负责人（u9）',
    ]);
  });

  test('同一归属存在多个同名主数据时不提交更新', async ({ page }) => {
    const { updates } = await prepare(page, 'Agent', { rejectFirst: false, ambiguous: true });
    await selectPerson(page, '责任人');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('多个同名');
    expect(updates).toHaveLength(0);
  });
});

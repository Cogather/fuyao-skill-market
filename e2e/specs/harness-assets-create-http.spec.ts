import { selectHarnessOption } from '../helpers/selectHarnessOption';
import type { Locator, Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const envelope = (data: unknown) => ({ meta: { success: true }, data });

async function prepareAssets(page: Page) {
  const creates: Request[] = [];
  const listRequests: Request[] = [];
  const catalogQueries: Request[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'create-user',
        userName: '新建测试用户',
        departmentList: [
          {
            deptId: 'dept-root',
            deptCode: 'dept-root',
            deptName: '研发部',
            deptLevel: 1,
            children: [
              { deptId: 'dept-a', deptCode: 'dept-a', deptName: '团队A', deptLevel: 2 },
              { deptId: 'dept-b', deptCode: 'dept-b', deptName: '团队B', deptLevel: 2 },
            ],
          },
        ],
      }),
    );
  });
  await page.route('**/dataengineering/config-center/hw-userinfo**', (route) =>
    route.fulfill({
      json: envelope([{ id: 'u1', chName: '张三', sAMAccountName: 'u1', deptName: '研发部' }]),
    }),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data =
        url.searchParams.get('deptCode') === 'dept-b'
          ? [
              { offeringId: 'b-default', offeringName: 'team-b-default' },
              { offeringId: 'b-target', offeringName: 'target-product' },
            ]
          : [
              { offeringId: 'default-product', offeringName: 'default-product' },
              { offeringId: 'list-product', offeringName: 'list-product' },
            ];
    } else if (path.endsWith('/components/query')) {
      listRequests.push(request);
      data = {
        records: [{ name: 'existing-asset', latestVersion: '1.0.0', status: '可发布' }],
        total: 1,
        pageNo: request.postDataJSON().pageNo,
        pageSize: request.postDataJSON().pageSize,
      };
    } else if (path.endsWith('/management/add')) {
      creates.push(request);
      data = { id: `created-${creates.length}` };
    } else if (path.endsWith('/management/query')) {
      catalogQueries.push(request);
    }
    await route.fulfill({ json: envelope(data) });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await selectHarnessOption(page.getByLabel('产品筛选'), 'list-product');
  return { creates, listRequests, catalogQueries };
}

async function selectTargetDepartment(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: '新增资产部门', exact: true }).click();
  const panel = page.getByRole('listbox');
  await panel
    .locator('.market-dept-cascader-col')
    .nth(0)
    .getByRole('option')
    .filter({ hasText: '研发部' })
    .click();
  await panel
    .locator('.market-dept-cascader-col')
    .nth(1)
    .getByRole('option')
    .filter({ hasText: '团队B' })
    .click();
  await panel.getByRole('button', { name: '完成', exact: true }).click();
  await expect(panel).toBeHidden();
}

async function fillCreateForm(dialog: Locator, type: string, name: string) {
  await dialog.locator('input[maxlength="64"]').fill(name);
  await dialog.locator('textarea').first().fill(`${type} 新增测试说明`);
  for (const picker of await dialog.locator('.person-search').all()) {
    await picker.locator('input').fill('u1');
    await picker.locator('.person-search__panel button').first().click();
  }
  await dialog.locator('input[type="date"]').fill('2099-12-31');
}

test.describe('资产页新建 HTTP 归属', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} 人员搜索面板仅在点击自身区域外时独立收起`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await prepareAssets(page);
      await page.getByRole('button', { name: '+ 新建资产' }).click();
      await page.getByRole('menuitem', { name: type, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `添加 ${type}` });
      const pickers = dialog.locator('.person-search:visible');
      const owner = pickers.nth(0);
      const developer = pickers.nth(1);
      const ownerPanel = owner.locator('.person-search__panel');
      const developerPanel = developer.locator('.person-search__panel');

      await owner.locator('input').click();
      await expect(ownerPanel).toBeVisible();
      await ownerPanel.getByText('请输入人员信息').click();
      await expect(ownerPanel).toBeVisible();
      await page.mouse.move(5, 5);
      await expect(ownerPanel).toBeVisible();
      await dialog.locator('header strong').click();
      await expect(ownerPanel).toBeHidden();

      await owner.locator('input').click();
      await developer.locator('input').click();
      await expect(ownerPanel).toBeHidden();
      await expect(developerPanel).toBeVisible();
      await owner.locator('input').click();
      await expect(developerPanel).toBeHidden();
      await expect(ownerPanel).toBeVisible();

      await owner.locator('input').fill('u1');
      await ownerPanel.getByRole('button').first().click();
      await expect(owner.locator('input')).toHaveValue('张三 u1');
      await expect(ownerPanel).toBeHidden();

      let releaseSearch!: () => void;
      const searchGate = new Promise<void>((resolve) => {
        releaseSearch = resolve;
      });
      await page.route('**/dataengineering/config-center/hw-userinfo**', async (route) => {
        await searchGate;
        await route.fallback();
      });
      const searchRequest = page.waitForRequest('**/dataengineering/config-center/hw-userinfo**');
      await developer.locator('input').fill('u1');
      await searchRequest;
      await expect(developerPanel).toBeVisible();
      await page.mouse.click(5, 5);
      await expect(developerPanel).toBeHidden();
      const searchResponse = page.waitForResponse('**/dataengineering/config-center/hw-userinfo**');
      releaseSearch();
      await searchResponse;
      await expect(developerPanel).toBeHidden();
      await expect(dialog).toBeVisible();
      await developer.locator('input').click();
      await developerPanel.getByRole('button').first().click();
      await expect(developer.locator('input')).toHaveValue('张三 u1');
      await expect(developerPanel).toBeHidden();

      if (type === 'Skill') {
        await dialog.getByRole('tab', { name: '从 Skill 广场引入', exact: true }).click();
        await owner.getByRole('button', { name: '清除责任 Owner' }).click();
        await developer.getByRole('button', { name: '清除开发责任人' }).click();
        await owner.locator('input').click();
        await expect(ownerPanel).toBeVisible();
        await developer.locator('input').click();
        await expect(ownerPanel).toBeHidden();
        await expect(developerPanel).toBeVisible();
        await dialog.locator('header strong').first().click();
        await expect(developerPanel).toBeHidden();
      }
    });

    test(`${type} 在当前页签新建，产品级和部门级 dim 均取弹窗选择`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { creates, listRequests, catalogQueries } = await prepareAssets(page);
      await page.getByRole('button', { name: type, exact: true }).click();
      await expect(page.locator('.asset-card')).toHaveCount(1);
      const originalListQuery = listRequests.at(-1)!.postDataJSON();
      for (const level of ['产品级', '部门级']) {
        await page.getByRole('button', { name: '+ 新建资产' }).click();
        await page.getByRole('menuitem', { name: type, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: `添加 ${type}` });
        await expect(dialog).toBeVisible();
        await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#harness-panel-capabilities')).toHaveCount(0);
        const scope = dialog.getByRole('group', { name: '新增资产归属' });
        await expect(scope.getByLabel('产品', { exact: true })).toHaveAttribute(
          'data-value',
          'default-product',
        );
        const nameInput = dialog.locator('input[maxlength="64"]');
        await nameInput.fill('default-product-draft');
        await selectHarnessOption(scope.getByLabel('层级'), level);
        await selectTargetDepartment(page, dialog);
        if (level === '产品级') {
          await selectHarnessOption(scope.getByLabel('产品', { exact: true }), 'target-product');
        } else {
          await expect(scope.getByLabel('产品', { exact: true })).toHaveCount(0);
        }
        await expect(nameInput).toHaveValue(level === '产品级' ? 'target-product-draft' : 'draft');
        const name =
          level === '产品级'
            ? `target-product-${type.toLowerCase()}`
            : `department-${type.toLowerCase()}`;
        await fillCreateForm(dialog, type, name);
        if (type === 'Skill' && level === '产品级') {
          await dialog.screenshot({ path: testInfo.outputPath('asset-create-skill.png') });
        }
        const beforeListCount = listRequests.length;
        await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await expect(dialog).toBeHidden();
        const request = creates.at(-1)!;
        expect(request.method()).toBe('POST');
        expect(new URL(request.url()).pathname).toBe(
          `/api/harness/${type.toLowerCase()}s/management/add`,
        );
        expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
          userId: 'create-user',
          dimType: level,
          dimCode: level === '产品级' ? 'b-target' : 'dept-b',
          dimName: level === '产品级' ? 'target-product' : '团队B',
        });
        expect(request.postDataJSON()).toMatchObject({
          [`${type.toLowerCase()}Name`]: name,
          ownerId: 'u1',
          developOwnerId: 'u1',
          planFinishDate: '2099-12-31',
        });
        await expect.poll(() => listRequests.length).toBeGreaterThan(beforeListCount);
        expect(listRequests.at(-1)!.postDataJSON()).toEqual(originalListQuery);
        await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByLabel('产品筛选')).toHaveAttribute('data-value', 'list-product');
      }
      expect(creates).toHaveLength(2);
      expect(catalogQueries).toHaveLength(0);
    });
  }

  test('Skill 新增失败保留弹窗和输入，修改归属后重试使用新的 dim', async ({ page }) => {
    const { creates, listRequests } = await prepareAssets(page);
    let rejectNextCreate = true;
    await page.route('**/api/harness/skills/management/add**', (route) => {
      if (!rejectNextCreate) return route.fallback();
      rejectNextCreate = false;
      return route.fulfill({
        json: { meta: { success: false, message: '名称已存在' }, data: null },
      });
    });
    await page.getByRole('button', { name: '+ 新建资产' }).click();
    await page.getByRole('menuitem', { name: 'Skill', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加 Skill' });
    const scope = dialog.getByRole('group', { name: '新增资产归属' });
    await expect(scope.getByLabel('产品', { exact: true })).toHaveAttribute(
      'data-value',
      'default-product',
    );
    await fillCreateForm(dialog, 'Skill', 'default-product-retry');
    const beforeListCount = listRequests.length;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('名称已存在', { exact: true })).toBeVisible();
    await expect(dialog.locator('input[maxlength="64"]')).toHaveValue('default-product-retry');
    expect(listRequests).toHaveLength(beforeListCount);
    await selectHarnessOption(scope.getByLabel('层级'), '部门级');
    await selectTargetDepartment(page, dialog);
    await expect(dialog.locator('input[maxlength="64"]')).toHaveValue('retry');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(creates).toHaveLength(1);
    expect(Object.fromEntries(new URL(creates[0]!.url()).searchParams)).toEqual({
      userId: 'create-user',
      dimType: '部门级',
      dimCode: 'dept-b',
      dimName: '团队B',
    });
    await expect(page.getByLabel('产品筛选')).toHaveAttribute('data-value', 'list-product');
  });
});

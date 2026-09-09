import { expect, test, type Page, type Request } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';

async function prepare(page: Page) {
  const requests: Request[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'department-filter-user',
        departmentList: [
          {
            deptCode: 'root',
            deptName: '研发部',
            deptLevel: 1,
            children: [
              { deptCode: 'team-a', deptName: '团队A', deptLevel: 2 },
              { deptCode: 'team-b', deptName: '团队B', deptLevel: 2 },
            ],
          },
          { deptCode: 'operations', deptName: '运营部', deptLevel: 1 },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    requests.push(request);
    let data: unknown = [];
    if (url.pathname.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [],
        adminOrgs: [
          { deptName: '团队A', deptCode: 'team-a', path: ['研发部', '团队A'], levelNo: 2 },
        ],
      };
    } else if (url.pathname.endsWith('/smapi-product-by-dept')) {
      data = [
        { offeringId: `product-${url.searchParams.get('deptCode')}`, offeringName: '筛选产品' },
      ];
    } else if (url.pathname.endsWith('/workflow/list')) {
      data = { list: [], total: 0, pageNo: 1, pageSize: 10 };
    } else if (url.pathname.endsWith('/components/query')) {
      data = { records: [], total: 0, pageNo: 1, pageSize: 30 };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  return requests;
}

async function selectDepartment(page: Page, panelId: string, path: string[]) {
  await page.locator(panelId).getByRole('button', { name: '选择部门', exact: true }).click();
  const panel = page.getByRole('listbox');
  for (const [index, name] of path.entries()) {
    await panel
      .locator('.market-dept-cascader-col')
      .nth(index)
      .getByRole('option')
      .filter({ hasText: name })
      .click();
  }
  await panel.getByRole('button', { name: '完成', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(
    page.locator(panelId).getByRole('button', { name: '选择部门', exact: true }),
  ).toContainText(path.at(-1)!);
}

test.describe('HTTP 部门筛选独立于管理权限', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const target of [
    {
      tab: '业务场景设计',
      panel: '#harness-panel-scenarios',
      endpoint: '/smapi-product-by-dept',
      key: 'deptCode',
    },
    {
      tab: 'Harness 工作流',
      panel: '#harness-panel-workflows',
      endpoint: '/workflow/list',
      key: 'dimName',
    },
    {
      tab: 'Agent / Skill 资产',
      panel: '#harness-panel-assets',
      endpoint: '/components/query',
      key: 'deptCode',
    },
  ]) {
    test(`${target.tab} 可以筛选未授权的同级部门、上级部门及其他分支`, async ({ page }) => {
      const requests = await prepare(page);
      await page.getByRole('tab', { name: target.tab, exact: true }).click();
      for (const [path, code] of [
        [['研发部', '团队B'], 'team-b'],
        [['研发部'], 'root'],
        [['运营部'], 'operations'],
      ] as const) {
        await selectDepartment(page, target.panel, [...path]);
        await expect
          .poll(() => {
            const request = requests
              .filter((item) => new URL(item.url()).pathname.endsWith(target.endpoint))
              .at(-1);
            if (!request) return undefined;
            return request.method() === 'POST'
              ? request.postDataJSON()[target.key]
              : new URL(request.url()).searchParams.get(target.key);
          })
          .toBe(target.key === 'dimName' ? path.join('/') : code);
      }
      await page
        .locator(target.panel)
        .getByRole('button', { name: '选择部门', exact: true })
        .click();
      await page
        .getByRole('listbox')
        .getByRole('button', { name: '清空部门', exact: true })
        .click();
      await expect(
        page.locator(target.panel).getByRole('button', { name: '选择部门', exact: true }),
      ).toContainText('选部门…');
    });
  }

  test('场景筛选可查看其他部门，但只允许管理授权部门', async ({ page }) => {
    await prepare(page);
    const panel = page.locator('#harness-panel-scenarios');
    const create = panel.locator('.tree-panel > header button');
    await selectDepartment(page, '#harness-panel-scenarios', ['研发部', '团队A']);
    await expect(create).toBeEnabled();
    await selectDepartment(page, '#harness-panel-scenarios', ['研发部', '团队B']);
    await expect(panel.getByRole('combobox', { name: '选择产品', exact: true })).toContainText(
      '筛选产品',
    );
    await expect(create).toBeDisabled();
    await selectDepartment(page, '#harness-panel-scenarios', ['研发部', '团队A']);
    await expect(create).toBeEnabled();
  });

  test('资产页放开筛选后，新增归属仍使用授权部门', async ({ page }) => {
    await prepare(page);
    await page.getByRole('tab', { name: 'Agent / Skill 资产', exact: true }).click();
    await selectDepartment(page, '#harness-panel-assets', ['运营部']);
    await page.getByRole('button', { name: '+ 新建资产', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Agent', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加 Agent' });
    await dialog.getByRole('button', { name: '新增资产部门', exact: true }).click();
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options.filter({ hasText: '团队A' })).toBeVisible();
    await expect(options.filter({ hasText: '团队B' })).toHaveCount(0);
    await expect(options.filter({ hasText: '运营部' })).toHaveCount(0);
  });
});

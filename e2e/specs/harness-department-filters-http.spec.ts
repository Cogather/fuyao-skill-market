import { expect, test, type Page, type Request } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';
import { selectHarnessOption } from '../helpers/selectHarnessOption';

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
              {
                deptCode: 'team-a',
                deptName: '团队A',
                deptLevel: 2,
                children: [{ deptCode: 'team-a-child', deptName: 'A子团队', deptLevel: 3 }],
              },
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
    } else if (url.pathname.endsWith('/management/import')) {
      data = { successCount: 1, failCount: 0 };
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

test.describe('HTTP 场景部门权限与列表筛选', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const target of [
    {
      tab: 'Harness 工作流',
      tabId: '#harness-tab-workflows',
      panel: '#harness-panel-workflows',
      endpoint: '/workflow/list',
      key: 'dimName',
    },
    {
      tab: '资产清单',
      tabId: '#harness-tab-assets',
      panel: '#harness-panel-assets',
      endpoint: '/components/query',
      key: 'deptCode',
    },
  ]) {
    test(`${target.tab} 可以筛选未授权的同级部门、上级部门及其他分支`, async ({ page }) => {
      const requests = await prepare(page);
      await page.locator(target.tabId).click();
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

  test('场景设计只可选择授权部门及下级，上级仅用于导航', async ({ page }) => {
    const requests = await prepare(page);
    const panel = page.locator('#harness-panel-scenarios');
    const create = panel.locator('.tree-panel > header button');
    const trigger = panel.getByRole('button', { name: '选择部门', exact: true });
    await expect(trigger).toContainText('团队A');
    await expect(create).toBeEnabled();
    await trigger.click();
    const picker = page.getByRole('listbox');
    await expect(picker.getByRole('option').filter({ hasText: '团队B' })).toHaveCount(0);
    await expect(picker.getByRole('option').filter({ hasText: '运营部' })).toHaveCount(0);
    await picker.getByRole('option').filter({ hasText: '研发部' }).click();
    await picker.getByRole('button', { name: '完成', exact: true }).click();
    await expect(picker).toBeVisible();
    await expect(panel.getByRole('alert')).toContainText('请选择有管理权限的部门');
    await expect(trigger).toContainText('团队A');
    await picker.getByRole('option').filter({ hasText: '团队A' }).click();
    await picker.getByRole('option').filter({ hasText: 'A子团队' }).click();
    await picker.getByRole('button', { name: '完成', exact: true }).click();
    await expect(trigger).toContainText('A子团队');
    await expect
      .poll(() =>
        requests
          .filter((request) => new URL(request.url()).pathname.endsWith('/smapi-product-by-dept'))
          .map((request) => new URL(request.url()).searchParams.get('deptCode')),
      )
      .toContain('team-a-child');
    await expect(create).toBeEnabled();
    await selectDepartment(page, '#harness-panel-scenarios', ['研发部', '团队A']);
    await expect(create).toBeEnabled();
  });

  test('从工作流返回场景设计时，未授权的筛选部门会重置为授权部门', async ({ page }) => {
    await prepare(page);
    await page.getByRole('tab', { name: 'Harness 工作流', exact: true }).click();
    await selectDepartment(page, '#harness-panel-workflows', ['研发部', '团队B']);
    await page.getByRole('button', { name: /前往场景设计/ }).click();
    const trigger = page
      .locator('#harness-panel-scenarios')
      .getByRole('button', { name: '选择部门', exact: true });
    await expect(trigger).toContainText('团队A');
    await trigger.click();
    await expect(
      page.getByRole('listbox').getByRole('option').filter({ hasText: '团队B' }),
    ).toHaveCount(0);
    await page.getByRole('listbox').getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('tab', { name: 'Harness 工作流', exact: true }).click();
    await selectDepartment(page, '#harness-panel-workflows', ['运营部']);
  });

  test('资产页放开筛选后，新增归属仍使用授权部门', async ({ page }) => {
    await prepare(page);
    await page.locator('#harness-tab-assets').click();
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

  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} 导入默认部门与新增一致，并重新加载授权部门的产品`, async ({ page }) => {
      const requests = await prepare(page);
      await page.locator('#harness-tab-assets').click();
      await selectDepartment(page, '#harness-panel-assets', ['运营部']);
      await selectHarnessOption(page.getByLabel('产品筛选'), 'product-operations');

      await page.getByRole('button', { name: '+ 新建资产', exact: true }).click();
      await page.getByRole('menuitem', { name: type, exact: true }).click();
      const createDialog = page.getByRole('dialog');
      const createDepartment = createDialog.getByRole('button', {
        name: '新增资产部门',
        exact: true,
      });
      await expect(createDepartment).toContainText('团队A');
      const defaultDepartmentText = await createDepartment
        .locator('.market-dept-cascader-trigger-text')
        .innerText();
      await createDialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(createDialog).toHaveCount(0);

      await page.getByRole('button', { name: '导入', exact: true }).click();
      await page.getByRole('menuitem', { name: type, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `导入 ${type}`, exact: true });
      const department = dialog.getByRole('button', { name: '导入资产部门', exact: true });
      await expect(department.locator('.market-dept-cascader-trigger-text')).toHaveText(
        defaultDepartmentText,
      );
      await expect(department).not.toContainText('运营部');
      await expect(dialog.getByLabel('产品', { exact: true })).toHaveAttribute(
        'data-value',
        '筛选产品',
      );
      await dialog.locator('input[type="file"]').setInputFiles({
        name: 'assets.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('test-import'),
      });
      await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
      await expect
        .poll(() =>
          requests
            .filter((request) =>
              new URL(request.url()).pathname.endsWith(`/${type.toLowerCase()}s/management/import`),
            )
            .map((request) => new URL(request.url()).searchParams.get('dimCode')),
        )
        .toEqual(['product-team-a']);
      await expect(
        page
          .locator('#harness-panel-assets')
          .getByRole('button', { name: '选择部门', exact: true }),
      ).toContainText('运营部');
    });
  }
});

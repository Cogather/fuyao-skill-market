import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';
import { selectHarnessOption } from '../helpers/selectHarnessOption';

const http = process.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const path = http
  ? ['部门根', '产品线', '业务部', '研发组', '交付小组', '执行分组', '项目组', '实施小组']
  : ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组', '流水线平台小组'];
const departmentDepth = path.length;
const productDepth = http ? 4 : 6;
const deepestCode = `dept-${departmentDepth + 2}`;

async function selectTabDepartment(page: Page, tab: string, depth: number) {
  await page.locator(`#harness-tab-${tab}`).click();
  const trigger = page
    .locator(`#harness-panel-${tab}`)
    .getByRole('button', { name: '选择部门', exact: true });
  await trigger.click();
  const picker = page.getByRole('listbox');
  for (const [index, name] of path.slice(0, depth).entries()) {
    await picker
      .locator('.market-dept-cascader-col')
      .nth(index)
      .getByRole('option')
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
  }
  await picker.getByRole('button', { name: '完成', exact: true }).click();
  await expect(picker).toBeHidden();
  return trigger;
}

const tabProduct = (page: Page, tab: string) =>
  page.locator(`#harness-panel-${tab}`).getByRole('combobox', {
    name: tab === 'scenarios' ? '选择产品' : tab === 'workflows' ? '筛选产品' : '产品筛选',
    exact: true,
  });

test('三个页签独立记忆部门产品，并记住清空部门和全部产品', async ({ page }) => {
  const requests = await prepare(page);
  const choices = [
    { tab: 'scenarios', depth: http ? 3 : 5, product: http ? '第二个产品' : 'devops-center-v2' },
    { tab: 'workflows', depth: http ? 2 : 4, product: '深层部门产品' },
    { tab: 'assets', depth: http ? 4 : 6, product: http ? '第二个产品' : 'DevOps 管理工作台' },
  ];
  const remembered = new Map<string, string>();
  for (const choice of choices) {
    await selectTabDepartment(page, choice.tab, choice.depth);
    const product = tabProduct(page, choice.tab);
    await selectHarnessOption(
      product,
      choice.tab === 'workflows' ? { index: 1 } : { label: choice.product },
    );
    remembered.set(choice.tab, (await product.getAttribute('data-value'))!);
  }
  for (const tab of ['scenarios', 'workflows', 'assets', 'workflows', 'scenarios']) {
    await page.locator(`#harness-tab-${tab}`).click();
    const choice = choices.find((item) => item.tab === tab)!;
    const department = page
      .locator(`#harness-panel-${tab}`)
      .getByRole('button', { name: '选择部门', exact: true });
    await expect(department.locator('.market-dept-cascader-trigger-text')).toHaveText(
      path.slice(0, choice.depth).join(' / '),
    );
    await expect(tabProduct(page, tab)).toHaveAttribute('data-value', remembered.get(tab)!);
  }
  if (http) {
    await expect
      .poll(() =>
        requests
          .filter((r) => new URL(r.url()).pathname.endsWith('/workflow/list'))
          .map((r) => new URL(r.url()).searchParams)
          .at(-1)
          ?.get('productCode'),
      )
      .toBe('product-1');
    const assetQuery = requests
      .filter((r) => new URL(r.url()).pathname.endsWith('/components/query'))
      .at(-1)!
      .postDataJSON();
    expect(assetQuery.productCode).toBe('product-2');
  }
  // The same department can still have a different selected product on each tab.
  await selectTabDepartment(page, 'workflows', http ? 3 : 5);
  await selectHarnessOption(tabProduct(page, 'workflows'), { label: '全部产品' });
  await page.locator('#harness-tab-scenarios').click();
  await expect(tabProduct(page, 'scenarios')).toHaveAttribute(
    'data-value',
    remembered.get('scenarios')!,
  );
  await page.locator('#harness-tab-workflows').click();
  await expect(tabProduct(page, 'workflows')).toHaveAttribute('data-value', '');

  for (const tab of ['scenarios', 'workflows', 'assets']) {
    await page.locator(`#harness-tab-${tab}`).click();
    await page
      .locator(`#harness-panel-${tab}`)
      .getByRole('button', { name: '选择部门', exact: true })
      .click();
    const picker = page.getByRole('listbox');
    await picker.getByRole('button', { name: '清空部门', exact: true }).click();
    if (await picker.isVisible())
      await picker.getByRole('button', { name: '完成', exact: true }).click();
  }
  for (const tab of ['scenarios', 'workflows', 'assets']) {
    await page.locator(`#harness-tab-${tab}`).click();
    await expect(
      page.locator(`#harness-panel-${tab}`).getByRole('button', { name: '选择部门', exact: true }),
    ).toContainText('选部门…');
  }
});

test('页签筛选记忆在刷新或离开路由后重置', async ({ page }) => {
  await prepare(page);
  const defaultDepth = http ? 1 : 5;
  for (const reset of ['route', 'refresh']) {
    for (const tab of ['scenarios', 'workflows', 'assets']) {
      await selectTabDepartment(page, tab, http ? 3 : 6);
      if (tab !== 'scenarios') await selectHarnessOption(tabProduct(page, tab), { index: 1 });
    }
    if (reset === 'refresh') await page.reload();
    else {
      await page.evaluate(() =>
        window.postMessage({ type: 'Skill_Square_Init', tab: 'hot' }, location.origin),
      );
      await expect(page).toHaveURL(/\/skill-square/);
      await page.evaluate(() =>
        window.postMessage({ type: 'Skill_Square_Init', tab: 'planning' }, location.origin),
      );
      await expect(page).toHaveURL(/\/harness-management/);
    }
    for (const tab of ['scenarios', 'workflows', 'assets']) {
      await page.locator(`#harness-tab-${tab}`).click();
      await expect(
        page
          .locator(`#harness-panel-${tab}`)
          .getByRole('button', { name: '选择部门', exact: true })
          .locator('.market-dept-cascader-trigger-text'),
      ).toHaveText(path.slice(0, defaultDepth).join(' / '));
      if (tab !== 'scenarios')
        await expect(tabProduct(page, tab)).toHaveAttribute('data-value', '');
    }
  }
});

test('HTTP 产品恢复请求未完成时快速切换页签仍保留所选产品', async ({ page }) => {
  test.skip(!http, '需要控制 HTTP 产品响应时机');
  await prepare(page);
  await selectTabDepartment(page, 'scenarios', 3);
  await selectHarnessOption(tabProduct(page, 'scenarios'), { label: '第二个产品' });
  await selectTabDepartment(page, 'assets', 4);
  await selectHarnessOption(tabProduct(page, 'assets'), { label: '第二个产品' });
  await page.locator('#harness-tab-scenarios').click();
  await expect(tabProduct(page, 'scenarios')).toHaveAttribute('title', '第二个产品');

  const releaseRequests: Array<() => void> = [];
  await page.route('**/smapi-product-by-dept**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('deptCode') !== 'dept-6') {
      await route.fallback();
      return;
    }
    await new Promise<void>((resolve) => releaseRequests.push(resolve));
    await route.fulfill({
      json: {
        meta: { success: true },
        data: [
          { offeringId: 'product-1', offeringName: '深层部门产品' },
          { offeringId: 'product-2', offeringName: '第二个产品' },
        ],
      },
    });
  });
  try {
    await page.locator('#harness-tab-assets').click();
    await expect.poll(() => releaseRequests.length).toBe(1);
    await page.locator('#harness-tab-workflows').click();
    await page.locator('#harness-tab-assets').click();
    await expect.poll(() => releaseRequests.length).toBe(2);
  } finally {
    releaseRequests.forEach((release) => release());
  }
  await expect(tabProduct(page, 'assets')).toHaveAttribute('data-value', 'product-2');
  await page.locator('#harness-tab-scenarios').click();
  await expect(tabProduct(page, 'scenarios')).toHaveAttribute('title', '第二个产品');
});

async function prepare(page: Page, departmentPath = path, permissionPath = path.slice(0, 1)) {
  const requests: Request[] = [];
  if (http) {
    await page.addInitScript((names) => {
      const departmentList = names.reduceRight<Record<string, unknown>[]>(
        (children, name, index) => [
          { deptCode: `dept-${index + 3}`, deptName: name, deptLevel: index + 3, children },
        ],
        [],
      );
      sessionStorage.setItem(
        '__skill_market_parent_context_v1__',
        JSON.stringify({
          type: 'Skill_Square_Init',
          userId: 'depth-user',
          departmentList,
        }),
      );
    }, departmentPath);
    await page.route('**/dataengineering/config-center/hw-userinfo**', (route) =>
      route.fulfill({
        json: {
          meta: { success: true },
          data: [{ id: 'u1', chName: '张三', sAMAccountName: 'u1', deptName: path[0] }],
        },
      }),
    );
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
            {
              deptName: permissionPath.at(-1),
              deptCode: `dept-${permissionPath.length + 2}`,
              path: permissionPath,
              levelNo: permissionPath.length + 2,
            },
          ],
        };
      } else if (url.pathname.endsWith('/smapi-product-by-dept')) {
        data = [
          { offeringId: 'product-1', offeringName: '深层部门产品' },
          { offeringId: 'product-2', offeringName: '第二个产品' },
        ];
      } else if (url.pathname.endsWith('/workflow/list')) {
        data = { list: [], total: 0, pageNo: 1, pageSize: 10 };
      } else if (url.pathname.endsWith('/components/query')) {
        data = { records: [], total: 0, pageNo: 1, pageSize: 30 };
      } else if (url.pathname.endsWith('/management/import')) {
        data = { successCount: 1, failCount: 0 };
      } else if (url.pathname.endsWith('/management/add')) {
        data = { id: 'created-deep-asset' };
      } else if (url.pathname.endsWith('/management/export')) {
        await route.fulfill({ contentType: 'application/octet-stream', body: 'test-export' });
        return;
      }
      await route.fulfill({ json: { meta: { success: true }, data } });
    });
  }
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  return requests;
}

async function chooseDeepest(page: Page, trigger: Locator, depth: number) {
  await trigger.click();
  const picker = page.getByRole('listbox');
  for (const [index, name] of path.slice(0, depth).entries()) {
    await picker
      .locator('.market-dept-cascader-col')
      .nth(index)
      .getByRole('option')
      .filter({ hasText: name })
      .click();
  }
  await expect(picker.locator('.market-dept-cascader-col')).toHaveCount(depth);
  if (depth < path.length) {
    await expect(picker.getByRole('option').filter({ hasText: path[depth] })).toHaveCount(0);
    await picker.getByPlaceholder('搜索部门').fill(path[depth]!);
    await expect(picker.locator('.market-dept-cascader-result')).toHaveCount(0);
    await picker.getByPlaceholder('搜索部门').fill('');
  } else {
    await picker.getByPlaceholder('搜索部门').fill(path[depth - 1]!);
    await picker
      .getByRole('button')
      .filter({ hasText: path[depth - 1] })
      .click();
    await expect(picker.locator('.market-dept-cascader-col')).toHaveCount(depth);
  }
  await picker.getByRole('button', { name: '完成', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(trigger).toContainText(path[depth - 1]!);
}

test('场景 HTTP 产品级限四层、部门级支持完整八层，Mock 保持原深度', async ({ page }) => {
  const requests = await prepare(page);
  const panel = page.locator('#harness-panel-scenarios');
  const level = panel.getByLabel('选择层级', { exact: true });
  const department = panel.getByRole('button', { name: '选择部门', exact: true });
  await chooseDeepest(page, department, productDepth);
  await selectHarnessOption(level, '部门级');
  await chooseDeepest(page, department, departmentDepth);
  if (http) {
    await expect
      .poll(() =>
        requests
          .filter((item) => new URL(item.url()).pathname.endsWith('/scene-activity/scene'))
          .map((item) => new URL(item.url()).searchParams)
          .filter((query) => query.get('dimType') === '部门级')
          .at(-1)
          ?.get('dimCode'),
      )
      .toBe(deepestCode);
  }
  await selectHarnessOption(level, '产品级');
  if (http) await expect(department).not.toContainText(path[productDepth]!);
  await chooseDeepest(page, department, productDepth);
  if (http) {
    await expect
      .poll(() =>
        requests
          .filter((item) => new URL(item.url()).pathname.endsWith('/smapi-product-by-dept'))
          .map((item) => new URL(item.url()).searchParams.get('deptCode'))
          .at(-1),
      )
      .toBe(`dept-${productDepth + 2}`);
  }
});

test('HTTP 部门树只有四层时按实际层数展示', async ({ page }) => {
  test.skip(!http, '需要 HTTP 模式');
  await prepare(page, path.slice(0, 4));
  const panel = page.locator('#harness-panel-scenarios');
  await selectHarnessOption(panel.getByLabel('选择层级', { exact: true }), '部门级');
  await chooseDeepest(page, panel.getByRole('button', { name: '选择部门', exact: true }), 4);
});

test('工作流与资产顶部筛选 HTTP 限四层，Mock 保持原深度', async ({ page }) => {
  const requests = await prepare(page);
  for (const tab of ['workflows', 'assets']) {
    await page.locator(`#harness-tab-${tab}`).click();
    await chooseDeepest(
      page,
      page.locator(`#harness-panel-${tab}`).getByRole('button', { name: '选择部门', exact: true }),
      productDepth,
    );
    if (http) {
      await expect
        .poll(() => {
          const request = requests
            .filter((item) =>
              new URL(item.url()).pathname.endsWith(
                tab === 'workflows' ? '/workflow/list' : '/components/query',
              ),
            )
            .at(-1);
          if (!request) return null;
          return tab === 'workflows'
            ? new URL(request.url()).searchParams.get('dimName')
            : request.postDataJSON().deptCode;
        })
        .toBe(tab === 'workflows' ? path.slice(0, 4).join('/') : 'dept-6');
    }
  }
  await page.locator('#harness-tab-scenarios').click();
  const panel = page.locator('#harness-panel-scenarios');
  await selectHarnessOption(panel.getByLabel('选择层级', { exact: true }), '部门级');
  await chooseDeepest(
    page,
    panel.getByRole('button', { name: '选择部门', exact: true }),
    departmentDepth,
  );
});

test('HTTP 顶部筛选归一化深层默认值，返回场景仍保留部门级权限和完整深度', async ({ page }) => {
  test.skip(!http, '需要 HTTP 模式');
  const requests = await prepare(page, path, path.slice(0, 5));
  const scenarios = page.locator('#harness-panel-scenarios');
  const scenarioDepartment = scenarios.getByRole('button', { name: '选择部门', exact: true });
  await selectHarnessOption(scenarios.getByLabel('选择层级', { exact: true }), '部门级');
  await chooseDeepest(page, scenarioDepartment, departmentDepth);

  for (const tab of ['workflows', 'assets']) {
    await page.locator(`#harness-tab-${tab}`).click();
    const department = page
      .locator(`#harness-panel-${tab}`)
      .getByRole('button', { name: '选择部门', exact: true });
    await expect(department).toContainText(path[3]!);
    await expect(department).not.toContainText(path[4]!);
    await chooseDeepest(page, department, 4);
    await department.click();
    const picker = page.getByRole('listbox');
    await picker
      .locator('.market-dept-cascader-col')
      .nth(2)
      .getByRole('option')
      .filter({ hasText: path[2] })
      .click();
    await picker.getByRole('button', { name: '完成', exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(department).toContainText(path[2]!);
    await expect(department).not.toContainText(path[3]!);
  }
  const workflowScopes = requests
    .filter((item) => new URL(item.url()).pathname.endsWith('/workflow/list'))
    .map((item) => new URL(item.url()).searchParams.get('dimName'));
  expect(workflowScopes).toContain(path.slice(0, 4).join('/'));
  expect(workflowScopes.every((scope) => (scope?.split('/').length ?? 0) <= 4)).toBe(true);
  const assetScopes = requests
    .filter((item) => new URL(item.url()).pathname.endsWith('/components/query'))
    .map((item) => item.postDataJSON().deptCode);
  expect(assetScopes).toContain('dept-6');
  expect(assetScopes.every((code) => ['dept-5', 'dept-6'].includes(code))).toBe(true);

  await page.locator('#harness-tab-scenarios').click();
  await expect(scenarios.getByLabel('选择层级', { exact: true })).toHaveAttribute(
    'data-value',
    '部门级',
  );
  await scenarioDepartment.click();
  const picker = page.getByRole('listbox');
  await picker
    .locator('.market-dept-cascader-col')
    .nth(3)
    .getByRole('option')
    .filter({ hasText: path[3] })
    .click();
  await picker.getByRole('button', { name: '完成', exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(scenarios.getByRole('alert')).toContainText('请选择有管理权限的部门');
  await page.keyboard.press('Escape');
  await chooseDeepest(page, scenarioDepartment, departmentDepth);
});

for (const type of ['Agent', 'Skill', 'Command']) {
  test(`${type} 新增、导入、导出产品级限四层，部门级深度与请求一致`, async ({ page }) => {
    const requests = await prepare(page);
    await page.locator('#harness-tab-assets').click();
    await page.getByRole('button', { name: type, exact: true }).click();
    for (const action of ['新增', '导入', '导出']) {
      await page
        .getByRole('button', { name: action === '新增' ? '＋ 新增' : action, exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      const level = dialog.getByLabel('层级', { exact: true });
      const department = dialog.getByRole('button', { name: `${action}资产部门`, exact: true });
      await selectHarnessOption(level, '产品级');
      await chooseDeepest(page, department, productDepth);
      await selectHarnessOption(level, '部门级');
      await chooseDeepest(page, department, departmentDepth);
      await selectHarnessOption(level, '产品级');
      if (http) await expect(department).not.toContainText(path[productDepth]!);
      await chooseDeepest(page, department, productDepth);
      if (http) {
        await expect
          .poll(() =>
            requests
              .filter((item) => new URL(item.url()).pathname.endsWith('/smapi-product-by-dept'))
              .map((item) => new URL(item.url()).searchParams.get('deptCode'))
              .at(-1),
          )
          .toBe(`dept-${productDepth + 2}`);
      }
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page
        .getByRole('button', { name: action === '新增' ? '＋ 新增' : action, exact: true })
        .click();
      await expect(level).toHaveAttribute('data-value', '产品级');
      await expect(department).toContainText(path[productDepth - 1]!);
      if (http) await expect(department).not.toContainText(path[productDepth]!);
      await selectHarnessOption(level, '部门级');
      await chooseDeepest(page, department, departmentDepth);
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page
        .getByRole('button', { name: action === '新增' ? '＋ 新增' : action, exact: true })
        .click();
      await expect(level).toHaveAttribute('data-value', '部门级');
      await expect(department).toContainText(path.at(-1)!);
      if (http && action === '新增') {
        await dialog.locator('input[maxlength="64"]').fill(`deep-${type.toLowerCase()}`);
        await dialog.locator('textarea').first().fill('验证完整部门路径的新增归属');
        for (const picker of await dialog.locator('.person-search:visible').all()) {
          await picker.locator('input').fill('u1');
          await picker.locator('.person-search__panel button').first().click();
        }
        await dialog.locator('input[type="date"]').fill('2099-12-31');
        await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await expect(page.getByText(`${type} 已新增，可继续添加`, { exact: true })).toBeVisible();
      } else if (http && action === '导入') {
        await dialog.locator('input[type="file"]').setInputFiles({
          name: 'assets.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('test-import'),
        });
        await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
      } else if (http && action === '导出') {
        await dialog.getByRole('button', { name: '下载', exact: true }).click();
      }
      if (http) {
        const endpoint = `/${type.toLowerCase()}s/management/${action === '新增' ? 'add' : action === '导入' ? 'import' : 'export'}`;
        await expect
          .poll(() => {
            const request = requests
              .filter((item) => new URL(item.url()).pathname.endsWith(endpoint))
              .at(-1);
            const query = request ? new URL(request.url()).searchParams : null;
            return [query?.get('dimType'), query?.get('dimCode')];
          })
          .toEqual(['部门级', deepestCode]);
      }
      await dialog
        .getByRole('button', {
          name: http && action === '导入' ? '完成' : '取消',
          exact: true,
        })
        .click();
      await expect(dialog).toHaveCount(0);
    }
  });
}

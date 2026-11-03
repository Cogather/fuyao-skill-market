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

async function prepare(page: Page, departmentPath = path) {
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
          adminOrgs: [{ deptName: path[0], deptCode: 'dept-3', path: [path[0]], levelNo: 3 }],
        };
      } else if (url.pathname.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product-1', offeringName: '深层部门产品' }];
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

test('工作流与资产列表筛选保持原深度', async ({ page }) => {
  await prepare(page);
  for (const tab of ['workflows', 'assets']) {
    await page.locator(`#harness-tab-${tab}`).click();
    await chooseDeepest(
      page,
      page.locator(`#harness-panel-${tab}`).getByRole('button', { name: '选择部门', exact: true }),
      6,
    );
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

import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';
import { selectHarnessOption } from '../helpers/selectHarnessOption';

const http = process.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const path = http
  ? ['部门根', '产品线', '业务部', '研发组', '交付小组', '执行分组']
  : ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组', '流水线平台小组'];
const departmentDepth = http ? 5 : 6;

async function prepare(page: Page) {
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
    }, path);
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
  if (depth === 5) {
    await expect(picker.getByRole('option').filter({ hasText: path[5] })).toHaveCount(0);
    await picker.getByPlaceholder('搜索部门').fill(path[5]!);
    await expect(picker.getByRole('option')).toHaveCount(0);
    await picker.getByPlaceholder('搜索部门').fill('');
  }
  await picker.getByRole('button', { name: '完成', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(trigger).toContainText(path[depth - 1]!);
}

test('场景部门级最多五列，产品级与 Mock 保持原深度', async ({ page }) => {
  const requests = await prepare(page);
  const panel = page.locator('#harness-panel-scenarios');
  const level = panel.getByLabel('选择层级', { exact: true });
  const department = panel.getByRole('button', { name: '选择部门', exact: true });
  await chooseDeepest(page, department, 6);
  await selectHarnessOption(level, '部门级');
  if (http) await expect(department).not.toContainText(path[5]!);
  await chooseDeepest(page, department, departmentDepth);
  if (http) {
    await expect
      .poll(() => [
        ...new Set(
          requests
            .filter((item) => new URL(item.url()).pathname.endsWith('/scene-activity/scene'))
            .map((item) => new URL(item.url()).searchParams)
            .filter((query) => query.get('dimType') === '部门级')
            .map((query) => query.get('dimCode')),
        ),
      ])
      .toEqual(['dept-7']);
  }
  await selectHarnessOption(level, '产品级');
  await chooseDeepest(page, department, 6);
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
  test(`${type} 新增、导入、导出部门级深度与请求一致`, async ({ page }) => {
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
      await chooseDeepest(page, department, 6);
      await selectHarnessOption(level, '部门级');
      if (http) await expect(department).not.toContainText(path[5]!);
      await chooseDeepest(page, department, departmentDepth);
      if (http && action === '导入') {
        await dialog.locator('input[type="file"]').setInputFiles({
          name: 'assets.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('test-import'),
        });
        await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
      } else if (http && action === '导出') {
        await dialog.getByRole('button', { name: '下载', exact: true }).click();
      }
      if (http && action !== '新增') {
        const endpoint = `/${type.toLowerCase()}s/management/${action === '导入' ? 'import' : 'export'}`;
        await expect
          .poll(() => {
            const request = requests
              .filter((item) => new URL(item.url()).pathname.endsWith(endpoint))
              .at(-1);
            const query = request ? new URL(request.url()).searchParams : null;
            return [query?.get('dimType'), query?.get('dimCode')];
          })
          .toEqual(['部门级', 'dept-7']);
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

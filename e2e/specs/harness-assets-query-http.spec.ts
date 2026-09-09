import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('HTTP 资产筛选使用编码和 30 条分页，清空范围、切换类型和失败重试正确', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '验证 HTTP 统一组件查询');
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'asset-user',
        userName: '测试用户',
        departmentList: [
          { deptId: 'department-id', deptCode: 'delivery-code', deptName: '交付部', deptLevel: 5 },
        ],
      }),
    );
  });
  const bodies: Record<string, unknown>[] = [];
  let failNext = false;
  let delayAgent = false;
  let releaseAgent: (() => void) | undefined;
  const success = (data: unknown) => ({ meta: { success: true, message: 'OK', number: 1 }, data });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/permission/user-depts')) {
      return route.fulfill({
        json: success({
          ownedOrgs: [
            { deptName: '交付部', deptCode: 'delivery-code', path: ['交付部'], levelNo: 5 },
          ],
          adminOrgs: [],
        }),
      });
    }
    if (url.pathname.endsWith('/smapi-product-by-dept')) {
      return route.fulfill({
        json: success([
          { offeringId: 'pipeline-code', offeringName: '流水线', planningDeptName: '交付部' },
        ]),
      });
    }
    if (url.pathname.endsWith('/plans/components/query')) {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (failNext) {
        failNext = false;
        return route.fulfill({
          json: { meta: { success: false, message: '查询暂时失败' }, data: null },
        });
      }
      if (delayAgent && body.type === 'AGENT') {
        delayAgent = false;
        await new Promise<void>((resolve) => {
          releaseAgent = resolve;
        });
      }
      const total = body.type === 'AGENT' ? 61 : 1;
      const records = Array.from({ length: total }, (_, index) => ({
        name: `${body.type}-${index + 1}`,
        description: `资产说明 ${index + 1}`,
        latestVersion: '0.0.1',
        status: '可发布',
        category: '部门级/交付部',
        updatedAt: '2026-03-24 10:00:00',
      })).slice((body.pageNo - 1) * body.pageSize, body.pageNo * body.pageSize);
      return route.fulfill({
        json: success({ records, total, pageNo: body.pageNo, pageSize: body.pageSize }),
      });
    }
    return route.fulfill({ json: success([]) });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: 'Agent / Skill 资产', exact: true }).click();
  const filters = page.getByRole('navigation', { name: '资产类型' });
  await expect(filters.getByRole('button')).toHaveText(['Agent', 'Skill', 'Command', 'Extension']);
  await expect(filters.getByRole('button', { name: 'Agent', exact: true })).toHaveClass(
    /is-active/,
  );
  const board = page.locator('.asset-board--catalog');
  const cards = board.locator('.asset-card');
  await expect(cards).toHaveCount(30);
  expect(bodies[0]).toEqual({
    userId: 'asset-user',
    deptCode: 'delivery-code',
    type: 'AGENT',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNo: 1,
    pageSize: 30,
  });
  await expect(cards.first()).toContainText('v0.0.1');
  await expect(cards.first()).toContainText('可发布');
  for (const count of [60, 61]) {
    await board.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(cards).toHaveCount(count);
  }
  await expect(board).toContainText('已加载全部 61 项');
  expect(bodies.map((body) => body.pageNo)).toEqual([1, 2, 3]);
  await expect(cards.first().getByRole('heading')).toHaveText('AGENT-1');
  await expect(cards.last().getByRole('heading')).toHaveText('AGENT-61');

  await page.getByLabel('产品筛选').selectOption('pipeline-code');
  await expect(cards).toHaveCount(30);
  expect(bodies.at(-1)).toMatchObject({ productCode: 'pipeline-code', pageNo: 1 });
  await expect.poll(() => board.evaluate((element) => element.scrollTop)).toBe(0);
  for (const [label, type] of [
    ['Skill', 'SKILL'],
    ['Command', 'COMMAND'],
    ['Extension', 'EXTENSION'],
  ]) {
    await filters.getByRole('button', { name: label, exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first().getByRole('heading')).toHaveText(`${type}-1`);
    expect(bodies.at(-1)).toMatchObject({
      type,
      productCode: 'pipeline-code',
      pageNo: 1,
      pageSize: 30,
    });
  }
  await page.getByLabel('产品筛选').selectOption('');
  await expect.poll(() => bodies.at(-1)?.productCode).toBeUndefined();
  await page.getByRole('button', { name: '选择部门', exact: true }).click();
  await page.getByRole('button', { name: '清空部门', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.deptCode).toBeUndefined();
  await expect(cards).toHaveCount(1);
  expect(bodies.at(-1)).toEqual({
    userId: 'asset-user',
    type: 'EXTENSION',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNo: 1,
    pageSize: 30,
  });

  failNext = true;
  await filters.getByRole('button', { name: 'Skill', exact: true }).click();
  await expect(board.getByRole('alert')).toContainText('查询暂时失败');
  await board.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(cards.first().getByRole('heading')).toHaveText('SKILL-1');
  expect(bodies.at(-1)).toMatchObject({ type: 'SKILL', pageNo: 1 });

  delayAgent = true;
  await filters.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect.poll(() => Boolean(releaseAgent)).toBe(true);
  await filters.getByRole('button', { name: 'Skill', exact: true }).click();
  await expect(cards.first().getByRole('heading')).toHaveText('SKILL-1');
  const lateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/plans/components/query') &&
      response.request().postDataJSON().type === 'AGENT',
  );
  releaseAgent!();
  await lateResponse;
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('heading')).toHaveText('SKILL-1');
});

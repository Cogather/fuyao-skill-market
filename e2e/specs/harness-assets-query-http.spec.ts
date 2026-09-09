import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('HTTP 四类资产详情展示 owner 和 developer，空人员字段保留占位', async ({ page }, testInfo) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '验证 HTTP 人员字段');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'people-user',
        userName: '人员测试用户',
        departmentList: [
          { deptId: 'department-id', deptCode: 'delivery-code', deptName: '交付部', deptLevel: 5 },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [
          { deptName: '交付部', deptCode: 'delivery-code', path: ['交付部'], levelNo: 5 },
        ],
        adminOrgs: [],
      };
    } else if (path.endsWith('/components/query')) {
      const type = route.request().postDataJSON().type;
      const records = [
        { name: `${type}-assigned`, owner: '李丹 w1001', developer: '王强 w1002' },
        { name: `${type}-developer-only`, owner: null, developer: '陈洁 w1003' },
        { name: `${type}-unassigned`, owner: '', developer: null },
      ].map((record) => ({ ...record, latestVersion: '1.0.0', status: '已发布' }));
      data = { records, total: records.length, pageNo: 1, pageSize: 30 };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
  for (const type of ['Agent', 'Skill', 'Command', 'Extension']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    for (const [suffix, expectedNames] of [
      ['assigned', ['李丹 w1001', '王强 w1002']],
      ['developer-only', ['—', '陈洁 w1003']],
      ['unassigned', ['—', '—']],
    ] as const) {
      await page
        .getByRole('heading', { name: `${type.toUpperCase()}-${suffix}`, exact: true })
        .click();
      const people = page.locator('.asset-detail__people');
      await expect(people).toBeVisible();
      await expect(people.locator('dt')).toHaveText(['责任人', '开发责任人']);
      await expect(people.locator('dd')).toHaveText([...expectedNames]);
      if (type === 'Skill' && suffix === 'assigned') {
        await people.screenshot({ path: testInfo.outputPath('asset-detail-people.png') });
      }
      await page.locator('.asset-detail-back').click();
    }
  }
});

test('HTTP 资产状态严格使用接口字段，空值不根据版本推导，按钮遵循状态', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '验证 HTTP 状态字段');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'status-user',
        userName: '状态测试用户',
        departmentList: [
          { deptId: 'department-id', deptCode: 'delivery-code', deptName: '交付部', deptLevel: 5 },
        ],
      }),
    );
  });
  const records = [
    { name: 'empty-with-version', latestVersion: '1.0.0', status: '' },
    { name: 'empty-without-version', latestVersion: '', status: '' },
    { name: 'null-status', latestVersion: '1.0.0', status: null },
    { name: 'missing-status', latestVersion: '1.0.0' },
    { name: 'published', latestVersion: '1.0.0', status: '已发布' },
    { name: 'developing', latestVersion: '1.0.0', status: '开发中' },
    { name: 'publishable', latestVersion: '1.0.0', status: '待发布' },
    { name: 'pending-without-version', latestVersion: '', status: '待发布' },
    { name: 'publishing', latestVersion: '1.0.0', status: '发布中' },
    { name: 'custom-status', latestVersion: '', status: '接口自定义状态' },
  ];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    if (path.endsWith('/permission/user-depts')) {
      return route.fulfill({
        json: {
          meta: { success: true },
          data: {
            ownedOrgs: [
              { deptName: '交付部', deptCode: 'delivery-code', path: ['交付部'], levelNo: 5 },
            ],
            adminOrgs: [],
          },
        },
      });
    }
    const data = path.endsWith('/components/query')
      ? { records, total: records.length, pageNo: 1, pageSize: 30 }
      : [];
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
  for (const type of ['Agent', 'Skill', 'Command', 'Extension']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    await expect(page.locator('.asset-card')).toHaveCount(records.length);
    for (const record of records) {
      const card = page.locator('.asset-card').filter({
        has: page.getByRole('heading', { name: record.name, exact: true }),
      });
      const status = card.locator('.asset-card__meta .asset-badge');
      if (record.status) await expect(status).toHaveText(record.status);
      else await expect(status).toHaveCount(0);
    }
  }

  for (const [name, expectedButtons] of [
    ['published', ['发布历史']],
    ['developing', []],
    ['publishable', ['发布', '发布历史']],
    ['pending-without-version', ['发布', '发布历史']],
    ['publishing', ['发布历史']],
    ['empty-with-version', []],
    ['custom-status', []],
  ] as const) {
    const card = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name, exact: true }),
    });
    await expect(card.locator('.asset-card__actions button')).toHaveText([...expectedButtons]);
    await card.getByRole('heading').click();
    const detail = page.locator('.asset-detail');
    await expect(detail.locator('.asset-detail__actions button')).toHaveText([...expectedButtons]);
    if (name === 'empty-with-version') {
      await expect(detail.locator('.asset-detail__badges .asset-badge:not(.is-type)')).toHaveCount(
        0,
      );
    }
    await page.locator('.asset-detail-back').click();
  }
});

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
        status: '待发布',
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
  await expect(cards.first()).toContainText('待发布');
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

import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { openAssetCardMenu } from '../helpers/assetCardActions';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('HTTP 原子资产卡片显示开发责任人，Extension 卡片显示发布人', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '验证 HTTP 卡片人员字段');
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'card-developer-user',
        userName: '卡片人员测试用户',
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
      const people =
        type === 'EXTENSION'
          ? [
              {
                name: `${type}-assigned`,
                owner: '不应展示的 Owner w1001',
                developer: '不应展示的开发责任人 w1002',
                publisher: '周发布 w1004',
              },
              { name: `${type}-publisher-only`, publisher: '吴发布 w1005' },
              { name: `${type}-unassigned`, publisher: null },
            ]
          : [
              { name: `${type}-assigned`, owner: '李丹 w1001', developer: '王强 w1002' },
              { name: `${type}-developer-only`, owner: null, developer: '陈洁 w1003' },
              { name: `${type}-unassigned`, owner: '', developer: null },
            ];
      const records = people.map((record) => ({
        ...record,
        latestVersion: '1.0.0',
        status: '已发布',
        canEdit: true,
      }));
      data = { records, total: records.length, pageNo: 1, pageSize: 30 };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();

  for (const type of ['Agent', 'Skill', 'Command']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    const assignedCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: `${type.toUpperCase()}-assigned`, exact: true }),
    });
    await expect(assignedCard.locator('.asset-card__developer')).toHaveText('王强 w1002');
    await expect(assignedCard.locator('.asset-card__developer')).toHaveAttribute(
      'title',
      '王强 w1002',
    );
    await expect(assignedCard).not.toContainText('李丹');

    const developerOnlyCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', {
        name: `${type.toUpperCase()}-developer-only`,
        exact: true,
      }),
    });
    await expect(developerOnlyCard.locator('.asset-card__developer')).toHaveText('陈洁 w1003');

    const unassignedCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: `${type.toUpperCase()}-unassigned`, exact: true }),
    });
    await expect(unassignedCard.locator('.asset-card__developer')).toHaveText('未指定');
    await expect(unassignedCard.locator('.asset-card__developer')).toHaveAttribute(
      'title',
      '未指定开发责任人',
    );
  }

  await page.getByRole('button', { name: 'Extension', exact: true }).click();
  const extensionCard = page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name: 'EXTENSION-assigned', exact: true }),
  });
  await expect(extensionCard.locator('.asset-card__publisher')).toHaveText('周发布 w1004');
  await expect(extensionCard.locator('.asset-card__publisher')).toHaveAttribute(
    'title',
    '周发布 w1004',
  );
  await expect(extensionCard.locator('.asset-card__developer')).toHaveCount(0);
  await expect(extensionCard).not.toContainText('不应展示的 Owner');
  await expect(extensionCard).not.toContainText('不应展示的开发责任人');

  const publisherOnlyCard = page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name: 'EXTENSION-publisher-only', exact: true }),
  });
  await expect(publisherOnlyCard.locator('.asset-card__publisher')).toHaveText('吴发布 w1005');

  const extensionWithoutPublisher = page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name: 'EXTENSION-unassigned', exact: true }),
  });
  await expect(extensionWithoutPublisher.locator('.asset-card__publisher')).toHaveText('未指定');
  await expect(extensionWithoutPublisher.locator('.asset-card__publisher')).toHaveAttribute(
    'title',
    '未指定发布人',
  );
});

test('HTTP Extension 详情仅显示发布人，其他资产展示 owner 和 developer 并保留空值占位', async ({
  page,
}, testInfo) => {
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
        {
          name: `${type}-assigned`,
          owner: '李丹 w1001',
          developer: '王强 w1002',
          publisher: '周发布 w1004',
        },
        {
          name: `${type}-developer-only`,
          owner: null,
          developer: '陈洁 w1003',
          publisher: '吴发布 w1005',
        },
        { name: `${type}-unassigned`, owner: '', developer: null, publisher: null },
      ].map((record) => ({
        ...record,
        latestVersion: '1.0.0',
        status: '已发布',
        canEdit: true,
      }));
      data = { records, total: records.length, pageNo: 1, pageSize: 30 };
    } else if (path.endsWith('/components/detail')) {
      const query = new URL(route.request().url()).searchParams;
      const type = query.get('type')!;
      const name = query.get('name')!;
      const suffix = name.replace(`${type}-`, '');
      data = {
        name,
        description: '人员字段详情',
        category: '部门级/交付部',
        ownerName: suffix === 'assigned' ? '李丹' : null,
        ownerId: suffix === 'assigned' ? 'w1001' : null,
        developerName:
          type === 'EXTENSION'
            ? null
            : suffix === 'assigned'
              ? '王强'
              : suffix === 'developer-only'
                ? '陈洁'
                : null,
        developerId:
          type === 'EXTENSION'
            ? null
            : suffix === 'assigned'
              ? 'w1002'
              : suffix === 'developer-only'
                ? 'w1003'
                : null,
        type,
        firstScene: type === 'EXTENSION' ? '研发提效' : null,
        secondScene: type === 'EXTENSION' ? '代码生成' : null,
        versions: [
          {
            version: '1.0.0',
            uploadedAt: '2026-09-15 10:00:00',
            uploadedBy:
              type === 'EXTENSION'
                ? suffix === 'assigned'
                  ? 'w1004'
                  : suffix === 'developer-only'
                    ? 'w1005'
                    : ''
                : '上传用户',
          },
        ],
      };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  for (const type of ['Agent', 'Skill', 'Command', 'Extension']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    for (const [suffix, expectedNames] of [
      ['assigned', ['李丹（w1001）', '王强（w1002）']],
      ['developer-only', ['—', '陈洁（w1003）']],
      ['unassigned', ['—', '—']],
    ] as const) {
      await page
        .getByRole('heading', { name: `${type.toUpperCase()}-${suffix}`, exact: true })
        .click();
      const people = page.locator('.asset-detail__people');
      if (type === 'Extension') {
        await expect(people.locator('dt')).toHaveText(['发布人']);
        await expect(people.locator('dd')).toHaveText([
          suffix === 'assigned'
            ? '周发布 w1004'
            : suffix === 'developer-only'
              ? '吴发布 w1005'
              : '—',
        ]);
        await expect(people.getByText('责任人', { exact: true })).toHaveCount(0);
        await expect(people.getByText('开发责任人', { exact: true })).toHaveCount(0);
      } else {
        await expect(people).toBeVisible();
        await expect(people.locator('dt')).toHaveText(['责任人', '开发责任人']);
        await expect(people.locator('dd')).toHaveText([...expectedNames]);
      }
      if (type === 'Skill' && suffix === 'assigned') {
        await people.screenshot({ path: testInfo.outputPath('asset-detail-people.png') });
      }
      await page.locator('.asset-detail-back').click();
    }
  }
});

test('HTTP Extension 仅显示接口状态为已发布的资产', async ({ page }) => {
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
  ].map((record) => ({ ...record, canEdit: true }));
  const componentBodies: Record<string, unknown>[] = [];
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
    let data: unknown = [];
    if (path.endsWith('/components/query')) {
      const body = route.request().postDataJSON();
      componentBodies.push(body);
      const filtered = records.filter((record) => !body.status || record.status === body.status);
      data = { records: filtered, total: filtered.length, pageNo: 1, pageSize: 30 };
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: 'Extension', exact: true }).click();
  await expect.poll(() => componentBodies.at(-1)?.status).toBe('已发布');
  await expect(page.locator('.asset-card')).toHaveCount(1);
  for (const record of records.filter((record) => record.status !== '已发布')) {
    await expect(page.getByRole('heading', { name: record.name, exact: true })).toHaveCount(0);
  }

  await expect(page.getByRole('button', { name: '已发布', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const publishedCard = page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name: 'published', exact: true }),
  });
  const cardMenu = await openAssetCardMenu(publishedCard);
  await expect(cardMenu.getByRole('menuitem')).toHaveText(['查看详情']);
  await publishedCard.getByRole('heading').click();
  await expect(page.locator('.asset-detail__actions button')).toHaveCount(0);
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
    if (url.pathname.endsWith('/components/query')) {
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
        status: body.status ?? (body.type === 'EXTENSION' ? '已发布' : '待发布'),
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
  await page.locator('#harness-tab-assets').click();
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

  for (const [label, status] of [
    ['开发中', '开发中'],
    ['待发布', '待发布'],
    ['已发布', '已发布'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => bodies.at(-1)?.status).toBe(status);
    await expect.poll(() => bodies.at(-1)?.pageNo).toBe(1);
  }
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.status).toBeUndefined();

  const search = page.getByRole('searchbox', { name: '搜索资产' });
  await search.fill('  pipeline owner  ');
  await expect.poll(() => bodies.at(-1)?.keyword).toBe('pipeline owner');
  await expect.poll(() => bodies.at(-1)?.pageNo).toBe(1);
  await expect(cards).toHaveCount(30);
  await search.fill('');
  await expect.poll(() => bodies.at(-1)?.keyword).toBeUndefined();

  await selectHarnessOption(page.getByLabel('产品筛选'), 'pipeline-code');
  await expect(cards).toHaveCount(30);
  expect(bodies.at(-1)).toMatchObject({ productCode: 'pipeline-code', pageNo: 1 });
  expect(bodies.at(-1)?.deptCode).toBeUndefined();
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
      ...(type === 'EXTENSION' ? { status: '已发布' } : {}),
    });
  }
  await selectHarnessOption(page.getByLabel('产品筛选'), '');
  await expect.poll(() => bodies.at(-1)?.productCode).toBeUndefined();
  await page.getByRole('button', { name: '选择部门', exact: true }).click();
  await page.getByRole('button', { name: '清空部门', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.deptCode).toBeUndefined();
  await expect(cards).toHaveCount(1);
  expect(bodies.at(-1)).toEqual({
    userId: 'asset-user',
    type: 'EXTENSION',
    status: '已发布',
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
      response.url().endsWith('/components/query') &&
      response.request().postDataJSON().type === 'AGENT',
  );
  releaseAgent!();
  await lateResponse;
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('heading')).toHaveText('SKILL-1');
});

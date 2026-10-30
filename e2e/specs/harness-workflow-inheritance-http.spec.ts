import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';
import { HarnessManagementPage } from '../pages/harnessManagement.page';
import { selectHarnessOption } from '../helpers/selectHarnessOption';

async function mountHarness(page: Page) {
  await page.route(`**${APP_BASE_PATH}/harness-inheritance-http-test`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto(`${APP_BASE_PATH}/harness-inheritance-http-test`);
  await page.evaluate(async () => {
    const componentUrl = '/skill-market/src/views/HarnessManagementPage.vue';
    const storeUrl = '/skill-market/src/stores/skillMarketStore.ts';
    const componentSource = await (await fetch(componentUrl)).text();
    const storeSource = await (await fetch(storeUrl)).text();
    const dependency = (source: string, name: string) => {
      const url = source.match(new RegExp(`from ["']([^"']*/${name}\\.js[^"']*)["']`))?.[1];
      if (!url) throw new Error(`Vite did not emit ${name}`);
      return url;
    };
    const { createApp, h } = await import(dependency(componentSource, 'vue'));
    const { createPinia } = await import(dependency(storeSource, 'pinia'));
    const { createRouter, createMemoryHistory, RouterView } = await import(
      dependency(componentSource, 'vue-router')
    );
    const { useSkillMarketStore } = await import(storeUrl);
    const { default: Component } = await import(componentUrl);
    const pinia = createPinia();
    const store = useSkillMarketStore(pinia);
    store.updateUserId('parent-scene-user');
    store.updateUserName('Parent scene user');
    store.updateDept([
      { deptCode: 'outside-code', deptName: '外部部门', deptLevel: 3 },
      { deptCode: 'allowed-code', deptName: '授权部门', deptLevel: 3 },
    ]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Component }],
    });
    const app = createApp({ render: () => h(RouterView) });
    app.use(pinia).use(router);
    await router.push('/');
    await router.isReady();
    app.mount('#test-host');
  });
}

async function interceptHarness(page: Page, authorized = true) {
  const requests: Request[] = [];
  let copied = false;
  let failCopy = true;
  let failSearchPage: number | null = null;
  const source = (index: number | string) => ({
    sourceDimType: '产品级',
    sourceDimCode: 'source-product',
    sourceDimName: 'Source product',
    firstScene: '来源一级',
    secondScene: `来源场景 ${index}`,
    sceneExtensionCode: `source-${index}`,
    flowName: `Source workflow ${index}`,
    activityCount: 3,
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    requests.push(request);
    let data: unknown = [];
    if (url.pathname.endsWith('/permission/user-depts'))
      data = {
        ownedOrgs: [],
        adminOrgs: authorized
          ? [{ deptCode: 'allowed-code', deptName: '授权部门', deptLevel: 3 }]
          : [],
      };
    else if (url.pathname.endsWith('/smapi-product-by-dept'))
      data = [{ offeringId: 'outside-product', offeringName: 'outside-product' }];
    else if (url.pathname.endsWith('/scene-activity/scene'))
      data = [
        {
          firstScene: '目标一级',
          secondScene: '当前场景',
          firstSceneId: 'root',
          secondSceneId: 'current',
          sceneExtensionCode: 'current-code',
          sort: 0,
        },
        ...(copied
          ? [
              {
                firstScene: '来源一级',
                secondScene: '服务端规范场景',
                firstSceneId: 'copied-root',
                secondSceneId: 'copied',
                sceneExtensionCode: 'copied-code',
                sort: 1,
              },
            ]
          : []),
      ];
    else if (url.pathname.endsWith('/workflow/detail'))
      data = {
        flowName:
          url.searchParams.get('secondScene') === '服务端规范场景'
            ? 'Copied authoritative workflow'
            : 'Current authoritative workflow',
        flowDescription: '',
        sceneExtensionCode:
          url.searchParams.get('secondScene') === '服务端规范场景' ? 'copied-code' : 'current-code',
        secondSceneDescription: '',
        commands: [],
        assetPool: [],
        stages: [],
        steps: [],
        nextStep: 0,
        allDone: false,
      };
    else if (url.pathname.endsWith('/scenes/search')) {
      if (!url.searchParams.get('keyword')?.trim()) {
        await route.fulfill({
          json: { meta: { success: false, message: 'keyword不能为空' }, data: null },
        });
        return;
      }
      const pageNum = Number(url.searchParams.get('pageNum'));
      const pageSize = Number(url.searchParams.get('pageSize'));
      if (pageNum === failSearchPage) {
        await route.fulfill({
          json: { meta: { success: false, message: '下一页查询失败，请重试' }, data: null },
        });
        return;
      }
      const rows = Array.from({ length: 41 }, (_, index) => source(index + 1));
      rows[0] = {
        ...source(1),
        sourceDimCode: 'outside-product',
        secondScene: 'Renamed current scene',
        sceneExtensionCode: 'current-code',
      };
      rows[1] = {
        ...source(2),
        sourceDimCode: 'outside-product',
        firstScene: '目标一级',
        secondScene: '当前场景',
      };
      rows[20] = source('X');
      data = {
        list: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        total: rows.length,
        pageNum,
        pageSize,
      };
    } else if (url.pathname.endsWith('/scene/copy')) {
      if (failCopy) {
        await route.fulfill({
          json: { meta: { success: false, message: 'SAME_NAME_REJECTED' }, data: null },
        });
        return;
      }
      copied = true;
      data = 'copied-code';
    }
    await route.fulfill({ json: { meta: { success: true, message: 'OK' }, data } });
  });
  return {
    requests,
    setFailedSearchPage: (pageNum: number | null) => {
      failSearchPage = pageNum;
    },
    allowCopy: () => {
      failCopy = false;
    },
  };
}

test.describe('Harness scene inheritance HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', 'Requires HTTP transport');

  test('parent identity, paged search, copy retry and returned-code selection use the current Harness workspace', async ({
    page,
  }) => {
    const fixture = await interceptHarness(page);
    await mountHarness(page);
    const harness = new HarnessManagementPage(page);
    await expect(harness.scenariosPanel).toBeVisible();
    await harness.selectScenarioDepartment('外部部门');
    await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText('当前场景');
    const opener = harness.scenariosPanel.getByRole('button', {
      name: '继承 Workflow',
      exact: true,
    });
    await expect(opener).toBeEnabled();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '继承已有 Workflow', exact: true });
    await expect(
      dialog.getByText('当前未输入任何关键字，未查到任何数据', { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator('.error-state')).toHaveCount(0);
    const search = dialog.getByRole('searchbox');
    await search.fill(' code % _ ');
    await search.press('Enter');
    const first = dialog.getByRole('button', { name: /Source workflow 2 / });
    await expect(first).toBeVisible();
    await expect(first).toContainText('产品级');
    await expect(first).toContainText('source-2');
    await expect(first).toContainText('3 个活动');
    const results = dialog.getByRole('region', { name: '可继承的 Workflow' });
    await expect(results.getByRole('button')).toHaveCount(19);
    await expect(dialog.getByText('找到 40 个可用 Workflow', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Renamed current scene/ })).toHaveCount(0);
    await results.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const inserted = dialog.getByRole('button', { name: /Source workflow X/ });
    await expect(inserted).toHaveCount(1);
    await expect(results.getByRole('button')).toHaveCount(39);
    await results.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(results.getByRole('button')).toHaveCount(40);
    await expect(results.getByText('已加载全部结果', { exact: true })).toBeVisible();
    await results.dispatchEvent('wheel', { deltaY: 300 });
    await inserted.click();
    const confirm = dialog.getByRole('button', { name: '确认继承', exact: true });
    await confirm.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText('SAME_NAME_REJECTED');
    await expect(inserted).toHaveAttribute('aria-pressed', 'true');
    fixture.allowCopy();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText('服务端规范场景');
    await expect(harness.workflowCard('Copied authoritative workflow')).toBeVisible();
    const searchRequests = fixture.requests.filter((request) =>
      new URL(request.url()).pathname.endsWith('/scenes/search'),
    );
    expect(
      searchRequests
        .filter((request) => new URL(request.url()).searchParams.get('keyword') === 'code % _')
        .map((request) => Number(new URL(request.url()).searchParams.get('pageNum'))),
    ).toEqual([1, 2, 3]);
    for (const request of searchRequests) {
      expect(new URL(request.url()).searchParams.get('userId')).toBe('parent-scene-user');
      expect(new URL(request.url()).searchParams.get('pageSize')).toBe('20');
      expect(new URL(request.url()).searchParams.has('limit')).toBe(false);
    }
    const copies = fixture.requests.filter((request) =>
      new URL(request.url()).pathname.endsWith('/scene/copy'),
    );
    expect(copies).toHaveLength(2);
    for (const request of copies) {
      expect(request.method()).toBe('POST');
      expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
        userId: 'parent-scene-user',
      });
      expect(request.postDataJSON()).toEqual({
        sourceDimType: '产品级',
        sourceDimCode: 'source-product',
        sourceFirstScene: '来源一级',
        sourceSecondScene: '来源场景 X',
        sourceSceneExtensionCode: 'source-X',
        targetDimType: '产品级',
        targetDimCode: 'outside-product',
        targetFirstScene: '目标一级',
        targetSecondScene: '当前场景',
      });
    }
    const inheritedDetails = fixture.requests.filter((request) =>
      new URL(request.url()).pathname.endsWith('/extensions/detail'),
    );
    expect(inheritedDetails).toHaveLength(1);
    expect(inheritedDetails[0]!.method()).toBe('POST');
    expect(Object.fromEntries(new URL(inheritedDetails[0]!.url()).searchParams)).toEqual({
      userId: 'parent-scene-user',
    });
    expect(inheritedDetails[0]!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'outside-product',
      dimName: 'outside-product',
      extensionName: 'copied-code',
      firstScene: '目标一级',
      secondScene: '当前场景',
    });
    expect(fixture.requests.indexOf(inheritedDetails[0]!)).toBeGreaterThan(
      fixture.requests.indexOf(copies[1]!),
    );
    const afterCopy = fixture.requests.slice(fixture.requests.indexOf(copies[1]!));
    expect(
      afterCopy.some(
        (request) =>
          new URL(request.url()).pathname.endsWith('/scene-activity/scene') &&
          new URL(request.url()).searchParams.get('dimCode') === 'outside-product',
      ),
    ).toBe(true);
    expect(
      afterCopy.some(
        (request) =>
          new URL(request.url()).pathname.endsWith('/workflow/detail') &&
          new URL(request.url()).searchParams.get('secondScene') === '服务端规范场景',
      ),
    ).toBe(true);
    expect(
      fixture.requests.some((request) =>
        new URL(request.url()).pathname.endsWith('/workflow/list'),
      ),
    ).toBe(false);
    expect(
      fixture.requests.some(
        (request) =>
          new URL(request.url()).pathname.endsWith('/workflow/detail') &&
          new URL(request.url()).searchParams.get('dimCode') === 'source-product',
      ),
    ).toBe(false);
    expect(fixture.requests.filter((request) => request.method() === 'POST')).toEqual([
      ...copies,
      ...inheritedDetails,
    ]);

    const start = fixture.requests.length;
    await selectHarnessOption(harness.scenariosPanel.getByRole('combobox', { name: '选择层级' }), {
      label: '部门级',
    });
    await expect(harness.scenariosDepartmentTrigger).toContainText('授权部门');
    await expect
      .poll(
        () =>
          fixture.requests
            .slice(start)
            .filter((request) => new URL(request.url()).searchParams.get('dimType') === '部门级')
            .length,
      )
      .toBeGreaterThan(0);
    for (const request of fixture.requests.slice(start)) {
      const params = new URL(request.url()).searchParams;
      if (
        params.get('dimType') === '部门级' ||
        new URL(request.url()).pathname.endsWith('/workflow/detail')
      ) {
        expect(params.get('dimCode')).toBe('allowed-code');
      }
    }
  });

  test('next-page failure keeps candidates for retry and a new search resets pagination', async ({
    page,
  }) => {
    const fixture = await interceptHarness(page);
    await mountHarness(page);
    const harness = new HarnessManagementPage(page);
    await harness.scenariosPanel
      .getByRole('button', { name: '继承 Workflow', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: '继承已有 Workflow', exact: true });
    const search = dialog.getByRole('searchbox');
    const results = dialog.getByRole('region', { name: '可继承的 Workflow' });
    await search.fill('Source');
    await search.press('Enter');
    await expect(results.getByRole('button')).toHaveCount(19);
    const selected = results.getByRole('button', { name: /Source workflow 2 / });
    await selected.click();
    fixture.setFailedSearchPage(2);
    await results.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(results.getByRole('alert')).toContainText('下一页查询失败，请重试');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    fixture.setFailedSearchPage(null);
    await results.getByRole('button', { name: '重试', exact: true }).click();
    await expect(results.getByRole('button')).toHaveCount(39);
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await search.fill('new keyword');
    await search.press('Enter');
    await expect(results.getByRole('button')).toHaveCount(19);
    await expect(dialog.getByRole('button', { name: '确认继承', exact: true })).toBeDisabled();
    expect(await results.evaluate((element) => element.scrollTop)).toBe(0);
    const searches = fixture.requests.filter((request) =>
      new URL(request.url()).pathname.endsWith('/scenes/search'),
    );
    expect(
      searches
        .filter((request) => new URL(request.url()).searchParams.get('keyword') === 'Source')
        .map((request) => new URL(request.url()).searchParams.get('pageNum')),
    ).toEqual(['1', '2', '2']);
    expect(
      searches
        .filter((request) => new URL(request.url()).searchParams.get('keyword') === 'new keyword')
        .map((request) => new URL(request.url()).searchParams.get('pageNum')),
    ).toEqual(['1']);
  });

  test('product writes remain reachable without department grants; department scope sends no request', async ({
    page,
  }) => {
    const fixture = await interceptHarness(page, false);
    await mountHarness(page);
    const harness = new HarnessManagementPage(page);
    await expect(harness.scenariosPanel.locator('.summary h2')).toHaveText('当前场景');
    await harness.scenariosPanel
      .getByRole('button', { name: '继承 Workflow', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: '继承已有 Workflow', exact: true });
    await dialog.getByRole('searchbox').fill('Source workflow');
    await dialog.getByRole('button', { name: /Source workflow 2 / }).click();
    await dialog.getByRole('button', { name: '确认继承', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('SAME_NAME_REJECTED');
    expect(
      fixture.requests.filter((request) => new URL(request.url()).pathname.endsWith('/scene/copy')),
    ).toHaveLength(1);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    const before = fixture.requests.length;
    await selectHarnessOption(harness.scenariosPanel.getByRole('combobox', { name: '选择层级' }), {
      label: '部门级',
    });
    await expect(harness.scenariosPanel.locator('.summary h2')).toHaveCount(0);
    await expect(
      harness.scenariosPanel.getByRole('button', { name: '继承 Workflow', exact: true }),
    ).toHaveCount(0);
    expect(fixture.requests.slice(before)).toHaveLength(0);
  });
});

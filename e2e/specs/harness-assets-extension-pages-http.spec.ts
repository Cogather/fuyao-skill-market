import { selectHarnessOption } from '../helpers/selectHarnessOption';
import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const envelope = (data: unknown) => ({ meta: { success: true }, data });

async function prepare(
  page: Page,
  withHistory = false,
  unavailableScene = false,
  emptyProducts = false,
) {
  const publishes: Request[] = [];
  const retries: Request[] = [];
  const organizationQueries: Request[] = [];
  const detailQueries: Request[] = [];
  const historyQueries: Request[] = [];
  let failNextHistory = false;
  let rejectPublish = true;
  let releaseName = 'product-b-build-extension';
  let publishing = false;
  const components = {
    skills: [{ id: 's1', name: '分析 Skill', version: '1.2.0', ready: true }],
    commands: [{ id: 'c1', name: '执行 Command', version: '2.1.0', ready: true }],
    agents: [{ id: 'a1', name: '诊断 Agent', version: '3.0.0', ready: true }],
  };
  let releases = withHistory
    ? Array.from({ length: 5 }, (_, index) => ({
        id: `release-${index}`,
        extensionName: releaseName,
        version: `0.${5 - index}`,
        firstScene: '开发',
        secondScene: '构建诊断',
        description: `历史说明 ${index}`,
        releaseType: index % 2 ? 'product' : 'beta',
        publishStatus: index === 0 ? 'failed' : 'success',
        errorMessage: index === 0 ? '目标组织拒绝签名' : '',
        operatorId: 'historical-user',
        operatorName: '历史发布人',
        publishedAt: `2026-08-0${5 - index} 10:00:00`,
        targetOrgName: '历史组织',
        ...components,
      }))
    : [];
  const sceneDetail = () => ({
    firstScene: '开发',
    secondScene: '构建诊断',
    readyStatus: '就绪',
    publishedExtension: {
      extensionName: releaseName,
      description: '当前场景的说明',
      ...(withHistory ? { version: '0.4', publishStatus: '发布成功' } : {}),
    },
    components,
  });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'release-user',
        userName: '发布测试用户',
        departmentList: [
          { deptId: 'dept-root', deptCode: 'dept-root', deptName: '研发部', deptLevel: 1 },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    const path = url.pathname;
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data = emptyProducts
        ? []
        : [
            { offeringId: 'product-a-id', offeringName: 'product-a' },
            { offeringId: 'product-b-id', offeringName: 'product-b' },
          ];
    } else if (path.endsWith('/components/query')) {
      data = {
        records: [
          {
            name: releaseName,
            description: '资产卡片摘要',
            latestVersion: '0.4',
            status: publishing ? '发布中' : '待发布',
            category: '产品级/product-b',
            dimType: '产品级',
            dimCode: 'product-b-id',
            dimName: 'product-b',
            firstScene: unavailableScene ? null : '开发',
            secondScene: unavailableScene ? null : '构建诊断',
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      };
    } else if (path.endsWith('/scenes/bindings')) {
      data =
        request.postDataJSON().dimCode === 'product-b-id'
          ? [{ firstScene: '开发', secondScenes: [sceneDetail()] }]
          : [];
    } else if (path.endsWith('/extensions/detail')) {
      detailQueries.push(request);
      if (unavailableScene) {
        return route.fulfill({
          json: { meta: { success: false, message: 'SCENE_NOT_FOUND' }, data: null },
        });
      }
      data = sceneDetail();
    } else if (path.endsWith('/extensions/history')) {
      historyQueries.push(request);
      if (failNextHistory) {
        failNextHistory = false;
        return route.fulfill({
          json: { meta: { success: false, message: '历史服务暂不可用' }, data: null },
        });
      }
      data = request.postDataJSON().dimCode === 'product-b-id' ? releases : [];
    } else if (path.endsWith('/extensions/orgs')) {
      organizationQueries.push(request);
      data = [
        { orgCode: 'org-first', orgName: '默认组织' },
        { orgCode: 'org-target', orgName: '目标组织', deptId: 'org-dept', deptName: '组织部门' },
      ];
    } else if (path.endsWith('/extensions') && request.method() === 'POST') {
      publishes.push(request);
      if (rejectPublish) {
        rejectPublish = false;
        return route.fulfill({ json: { meta: { success: false, message: '发布服务暂不可用' } } });
      }
      const body = request.postDataJSON();
      releaseName = body.extensionName;
      publishing = true;
      releases.unshift({
        ...body,
        id: 'new-release',
        version: '0.6',
        publishStatus: 'processing',
        failReason: '',
        operatorId: 'release-user',
        operatorName: '发布测试用户',
        publishedAt: '2026-09-09 12:00:00',
      });
      data = { id: 'new-release' };
    } else if (path.endsWith('/retry')) {
      retries.push(request);
      releases[0]!.publishStatus = 'processing';
      publishing = true;
      data = 'retry-accepted';
    }
    await route.fulfill({ json: envelope(data) });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: 'Extension', exact: true }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  return {
    publishes,
    retries,
    organizationQueries,
    detailQueries,
    historyQueries,
    failHistoryOnce: () => {
      failNextHistory = true;
    },
    setLatestReleaseStatus: (status: 'processing' | 'success') => {
      releases[0]!.publishStatus = status;
      publishing = status === 'processing';
    },
  };
}

test.describe('资产卡片 Extension 发布和历史 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('publishCheck 控制确认发布且仅在不可发布时展示提示，再次进入使用最新检查结果', async ({
    page,
  }) => {
    const { publishes } = await prepare(page, true);
    let publishCheck: { canPublish: boolean; message: string } | undefined;
    let readyStatus = '就绪';
    await page.route('**/api/harness/extensions/detail**', (route) =>
      route.fulfill({
        json: envelope({
          firstScene: '开发',
          secondScene: '构建诊断',
          readyStatus,
          publishedExtension: {
            extensionName: 'product-b-build-extension',
            version: '1.1.0',
            description: '扩展说明',
            publishStatus: '发布成功',
          },
          components: {
            commands: [{ name: '执行 Command', version: '2.1.0', ready: true }],
            skills: [],
            agents: [],
          },
          publishCheck,
        }),
      }),
    );

    for (const scenario of [
      {
        check: {
          canPublish: false,
          message: '当前配置与已发布版本 v1.1.0 完全一致，无需重新发布',
        },
        ready: '就绪',
        disabled: true,
      },
      { check: { canPublish: false, message: '' }, ready: '就绪', disabled: true },
      {
        check: { canPublish: true, message: '配置已变更，可以发布' },
        ready: '就绪',
        disabled: false,
      },
      {
        check: { canPublish: true, message: '等待场景就绪' },
        ready: '不完备',
        disabled: true,
      },
      { check: undefined, ready: '就绪', disabled: false },
    ]) {
      publishCheck = scenario.check;
      readyStatus = scenario.ready;
      await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
      const publish = page.getByRole('region', { name: /发布 Extension/ });
      await expect(publish.getByLabel(/目标组织/)).toHaveAttribute('data-value', 'org-first');
      const confirm = publish.getByRole('button', { name: '确认发布', exact: true });
      const message = publish.locator('.publish-check-message');
      if (scenario.check?.canPublish === false && scenario.check.message) {
        await expect(message).toHaveText(scenario.check.message);
        await expect(message).toBeVisible();
      } else {
        await expect(message).toHaveCount(0);
      }
      if (scenario.disabled) {
        await expect(confirm).toBeDisabled();
        await selectHarnessOption(publish.getByLabel(/发布通道/), 'product');
        await expect(confirm).toBeDisabled();
      } else {
        await expect(confirm).toBeEnabled();
        if (scenario.check?.canPublish) {
          await confirm.click();
          await expect(publish.getByRole('alert')).toHaveText('发布服务暂不可用');
          await expect(message).toHaveCount(0);
          expect(publishes).toHaveLength(1);
        }
      }
      await publish.getByRole('button', { name: '取消', exact: true }).click();
      await expect(publish).toHaveCount(0);
    }
    expect(publishes).toHaveLength(1);
  });

  test('已发布的 Extension 有权限时在卡片和详情显示发布按钮并可再次进入发布', async ({ page }) => {
    const { detailQueries } = await prepare(page, true);
    const records = [true, false, undefined].map((canPublish, index) => ({
      name: index === 0 ? 'product-b-build-extension' : `published-extension-${index}`,
      description: '已发布的 Extension',
      latestVersion: '0.4',
      status: '已发布',
      category: '产品级/product-b',
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
      firstScene: '开发',
      secondScene: '构建诊断',
      canPublish,
    }));
    await page.route('**/api/v1/harness/plans/components/query', (route) =>
      route.fulfill({
        json: envelope({ records, total: records.length, pageNo: 1, pageSize: 30 }),
      }),
    );
    await page.route('**/api/v1/harness/plans/components/detail**', (route) =>
      route.fulfill({
        json: envelope({
          ...records[0],
          name: new URL(route.request().url()).searchParams.get('name'),
          type: 'EXTENSION',
          versions: [{ version: '0.4', uploadedAt: null, uploadedBy: null }],
        }),
      }),
    );
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    await expect(page.locator('.asset-card')).toHaveCount(3);

    for (const [index, record] of records.entries()) {
      const card = page.locator('.asset-card').filter({
        has: page.getByRole('heading', { name: record.name, exact: true }),
      });
      await expect(card.locator('.asset-card__meta')).toContainText('已发布');
      await expect(card.getByRole('button', { name: '发布历史', exact: true })).toBeVisible();
      const publish = card.getByRole('button', { name: '发布', exact: true });
      if (index === 0) await expect(publish).toBeEnabled();
      else await expect(publish).toHaveCount(0);

      await card.getByRole('heading', { name: record.name, exact: true }).click();
      const detailPublish = page
        .locator('.asset-detail__actions')
        .getByRole('button', { name: '发布', exact: true });
      if (index === 0) {
        await expect(detailPublish).toBeEnabled();
        await detailPublish.click();
        await expect(page.getByRole('region', { name: /发布 Extension/ })).toBeVisible();
        expect(detailQueries.at(-1)?.postDataJSON()).toMatchObject({
          dimCode: 'product-b-id',
          firstScene: '开发',
          secondScene: '构建诊断',
        });
        await page.getByRole('button', { name: '取消', exact: true }).click();
      } else {
        await expect(detailPublish).toHaveCount(0);
      }
      await page.getByRole('button', { name: '返回列表', exact: true }).click();
    }
  });

  for (const [label, latestVersion] of [
    ['null', null],
    ['空字符串', ''],
    ['缺省', undefined],
  ] as const) {
    test(`无版本的 Extension（${label}）点击后提示无法查看详情且不请求接口`, async ({ page }) => {
      await prepare(page);
      await page.route('**/api/v1/harness/plans/components/query', (route) =>
        route.fulfill({
          json: envelope({
            records: [
              {
                name: 'undeveloped-extension',
                description: '尚未生成版本的 Extension',
                category: '产品级/product-b',
                dimType: '产品级',
                dimCode: 'product-b-id',
                dimName: 'product-b',
                firstScene: '开发',
                secondScene: '构建诊断',
                latestVersion,
                status: '未开发',
              },
            ],
            total: 1,
            pageNo: 1,
            pageSize: 30,
          }),
        }),
      );
      await page.getByRole('button', { name: 'Agent', exact: true }).click();
      await page.getByRole('button', { name: 'Extension', exact: true }).click();
      const card = page.locator('.asset-card');
      await expect(card.getByRole('heading')).toHaveText('undeveloped-extension');
      const requests: Request[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request);
      });
      await card.click({ position: { x: 10, y: 10 } });
      const detail = page.locator('.asset-detail');
      await expect(detail.getByRole('status')).toHaveText('暂无版本，当前无法查看详情');
      await expect(detail.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0);
      expect(requests).toHaveLength(0);
      await page.getByRole('button', { name: '返回列表', exact: true }).click();
      await card.focus();
      await card.press('Enter');
      await expect(detail.getByRole('status')).toHaveText('暂无版本，当前无法查看详情');
      expect(requests).toHaveLength(0);
    });
  }

  test('点击发布直接查询单场景详情，不重新调用部门产品接口', async ({ page }) => {
    const { detailQueries, historyQueries, organizationQueries } = await prepare(
      page,
      false,
      false,
      true,
    );
    const productQueries: Request[] = [];
    await page.route('**/api/harness/smapi-product-by-dept**', async (route) => {
      productQueries.push(route.request());
      await route.fulfill({ status: 503, json: { message: '产品服务暂不可用' } });
    });
    await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publish).toBeVisible();
    await expect(publish.locator('.publish-summary li')).toHaveCount(3);
    await expect(publish.getByRole('combobox', { name: '目标组织' })).toHaveAttribute(
      'data-value',
      'org-first',
    );
    expect(historyQueries).toHaveLength(0);
    expect(organizationQueries).toHaveLength(1);
    expect(productQueries).toHaveLength(0);
    expect(detailQueries).toHaveLength(1);
    expect(detailQueries[0]!.method()).toBe('POST');
    expect(new URL(detailQueries[0]!.url()).pathname).toBe('/api/harness/extensions/detail');
    expect(detailQueries[0]!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
      extensionName: 'product-b-build-extension',
      firstScene: '开发',
      secondScene: '构建诊断',
    });
  });

  test('产品列表为空时，发布历史使用卡片维度并只查询历史接口', async ({ page }) => {
    const { detailQueries, historyQueries } = await prepare(page, true, false, true);
    const unrelatedQueries: Request[] = [];
    page.on('request', (request) => {
      if (/\/(smapi-product-by-dept|components\/detail)$/.test(new URL(request.url()).pathname)) {
        unrelatedQueries.push(request);
      }
    });
    await page
      .locator('.asset-card')
      .getByRole('button', { name: '发布历史', exact: true })
      .click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history.locator('.timeline-item')).toHaveCount(3);
    await expect(history.getByText('目标组织拒绝签名', { exact: true })).toBeVisible();
    expect(historyQueries).toHaveLength(1);
    expect(historyQueries[0]!.method()).toBe('POST');
    expect(new URL(historyQueries[0]!.url()).pathname).toBe('/api/harness/extensions/history');
    expect(historyQueries[0]!.postDataJSON()).toMatchObject({
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
    });
    expect(detailQueries).toHaveLength(0);
    expect(unrelatedQueries).toHaveLength(0);
  });

  for (const readyStatus of ['已就绪', '不完备']) {
    test(`发布详情返回后加载真实目标组织（${readyStatus}）`, async ({ page }) => {
      const { organizationQueries, historyQueries } = await prepare(page, false, false, true);
      let releaseDetail!: () => void;
      const detailGate = new Promise<void>((resolve) => {
        releaseDetail = resolve;
      });
      await page.route('**/api/harness/extensions/detail**', async (route) => {
        await detailGate;
        await route.fulfill({
          json: envelope({
            firstScene: '开发',
            secondScene: '构建诊断',
            readyStatus,
            components: { commands: [{ name: '构建命令', version: '1.0' }] },
          }),
        });
      });
      const detailRequest = page.waitForRequest('**/api/harness/extensions/detail**');
      await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
      await detailRequest;
      expect(organizationQueries).toHaveLength(0);
      releaseDetail();
      const publish = page.getByRole('region', { name: /发布 Extension/ });
      const orgSelect = publish.getByRole('combobox', { name: '目标组织' });
      await expect(orgSelect).toHaveAttribute('data-value', 'org-first');
      expect(organizationQueries).toHaveLength(1);
      expect(historyQueries).toHaveLength(0);
      expect(organizationQueries[0]!.method()).toBe('GET');
      expect(new URL(organizationQueries[0]!.url()).pathname).toBe('/api/harness/extensions/orgs');
      expect(Object.fromEntries(new URL(organizationQueries[0]!.url()).searchParams)).toEqual({
        userId: 'release-user',
        dimType: '产品级',
        dimCode: 'product-b-id',
      });
      await orgSelect.click();
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
        '默认组织',
        '目标组织',
      ]);
      await page.getByRole('option', { name: '目标组织', exact: true }).click();
      await expect(orgSelect).toHaveAttribute('data-value', 'org-target');
      if (readyStatus === '不完备') {
        await expect(publish.getByText('场景不完备，无法发布', { exact: true })).toHaveCount(0);
        await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
      }
    });
  }

  test('组织查询失败可单独重试，空结果不回退默认组织且保留表单', async ({ page }) => {
    const { detailQueries } = await prepare(page);
    const organizationQueries: Request[] = [];
    await page.route('**/api/harness/extensions/orgs**', (route) => {
      organizationQueries.push(route.request());
      if (organizationQueries.length === 1)
        return route.fulfill({
          json: { meta: { success: false, message: '组织服务暂不可用' }, data: null },
        });
      return route.fulfill({
        json: envelope(
          organizationQueries.length === 2 ? [] : [{ orgCode: 'org-api', orgName: '接口目标组织' }],
        ),
      });
    });
    await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    const orgSelect = publish.getByRole('combobox', { name: '目标组织' });
    await expect(publish.getByRole('alert')).toContainText('组织服务暂不可用');
    await expect(orgSelect).toBeDisabled();
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await selectHarnessOption(publish.getByLabel(/发布通道/), 'product');
    await publish.getByRole('button', { name: '重新加载组织', exact: true }).click();
    await expect(publish.getByRole('alert')).toContainText('当前用户暂无可发布组织');
    await expect(orgSelect).toBeDisabled();
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await publish.getByRole('button', { name: '重新加载组织', exact: true }).click();
    await expect(orgSelect).toHaveAttribute('data-value', 'org-api');
    await expect(orgSelect).toContainText('接口目标组织');
    await expect(publish.getByRole('alert')).toHaveCount(0);
    await expect(
      publish.getByRole('heading', { name: 'product-b-build-extension', exact: true }),
    ).toBeVisible();
    await expect(publish.getByText('当前场景的说明', { exact: true })).toBeVisible();
    await expect(publish.getByLabel(/发布通道/)).toHaveAttribute('data-value', 'product');
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
    expect(organizationQueries).toHaveLength(3);
    expect(detailQueries).toHaveLength(1);
  });

  test('有版本卡片先查询组件详情和场景绑定，点击具体文件才加载内容', async ({ page }) => {
    const { detailQueries, historyQueries, organizationQueries, publishes } = await prepare(
      page,
      false,
      false,
      true,
    );
    const metadataQueries: Request[] = [];
    const bindingQueries: Request[] = [];
    const treeQueries: Request[] = [];
    const fileQueries: Request[] = [];
    const requestOrder: string[] = [];
    const productQueries: Request[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/smapi-product-by-dept')) {
        productQueries.push(request);
      }
    });
    await page.route('**/api/v1/harness/plans/components/detail**', async (route) => {
      metadataQueries.push(route.request());
      requestOrder.push('detail');
      await route.fulfill({
        json: envelope({
          name: 'product-b-build-extension',
          description: '接口返回的 Extension 详情',
          type: 'EXTENSION',
          category: '产品级/product-b',
          firstScene: '开发',
          secondScene: '构建诊断',
          versions: [
            { version: '0.5', uploadedAt: '2026-09-10 10:00:00', uploadedBy: 'release-user' },
            { version: '0.4', uploadedAt: '2026-09-09 10:00:00', uploadedBy: 'release-user' },
          ],
        }),
      });
    });
    await page.route('**/api/harness/scenes/bindings**', (route) => {
      bindingQueries.push(route.request());
      requestOrder.push('bindings');
      return route.fulfill({
        json: envelope([
          {
            firstScene: '其他一级场景',
            secondScenes: [
              {
                secondScene: '构建诊断',
                components: { skills: [{ name: '不应显示的 Skill', version: '9.0' }] },
              },
            ],
          },
          {
            firstScene: '开发',
            secondScenes: [
              {
                secondScene: '其他二级场景',
                components: { commands: [{ name: '不应显示的 Command', version: '9.0' }] },
              },
              {
                secondScene: '构建诊断',
                components: {
                  skills: [{ name: '分析 Skill', version: '1.2.0' }],
                  commands: [
                    { name: '执行 Command', version: '2.1.0', filePath: 'commands/run.md' },
                  ],
                  agents: [{ name: '诊断 Agent', version: '3.0.0' }],
                },
              },
            ],
          },
        ]),
      });
    });
    await page.route('**/api/harness/packages/tree**', (route) => {
      treeQueries.push(route.request());
      return route.fulfill({ json: envelope(['README.md', 'scripts/check.py']) });
    });
    await page.route('**/api/harness/packages/file**', (route) => {
      fileQueries.push(route.request());
      return route.fulfill({ json: envelope({ content: '来自接口的组件文件内容' }) });
    });
    // Click the article's padding, outside its title and action buttons.
    await page.locator('.asset-card').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.asset-detail__description')).toHaveText(
      '接口返回的 Extension 详情',
    );
    const tree = page.locator('.asset-extension-content');
    await expect(tree).toContainText('分析 Skill');
    await expect(tree).toContainText('执行 Command');
    await expect(tree).toContainText('诊断 Agent');
    await expect(tree).not.toContainText('不应显示');
    await expect(page.getByRole('combobox', { name: '版本', exact: true })).toContainText('v0.5');
    expect(requestOrder).toEqual(['detail', 'bindings']);
    expect(treeQueries).toHaveLength(0);
    expect(fileQueries).toHaveLength(0);
    await tree.getByRole('button', { name: /分析 Skill/ }).click();
    await expect(tree.getByRole('button', { name: 'README.md', exact: true })).toBeVisible();
    expect(treeQueries).toHaveLength(1);
    expect(fileQueries).toHaveLength(0);
    await tree.getByRole('button', { name: 'README.md', exact: true }).click();
    await expect(tree.locator('pre')).toHaveText('来自接口的组件文件内容');
    expect(fileQueries).toHaveLength(1);
    expect(Object.fromEntries(new URL(fileQueries[0]!.url()).searchParams)).toEqual({
      userId: 'release-user',
      componentType: 'skill',
      componentName: '分析 Skill',
      componentVersion: '1.2.0',
      filePath: 'README.md',
    });
    await tree.getByRole('button', { name: 'README.md', exact: true }).click();
    await tree.getByRole('button', { name: 'README.md', exact: true }).click();
    expect(fileQueries).toHaveLength(1);
    for (const [name, filePath, type, version] of [
      ['执行 Command', 'commands/run.md', 'command', '2.1.0'],
      ['诊断 Agent', '诊断 Agent.md', 'agent', '3.0.0'],
    ]) {
      const previous = fileQueries.length;
      await tree.getByRole('button', { name: new RegExp(name!) }).click();
      await expect(tree.getByRole('button', { name: filePath, exact: true })).toBeVisible();
      expect(fileQueries).toHaveLength(previous);
      await tree.getByRole('button', { name: filePath, exact: true }).click();
      await expect(tree.locator('pre')).toHaveCount(previous + 1);
      expect(Object.fromEntries(new URL(fileQueries.at(-1)!.url()).searchParams)).toEqual({
        userId: 'release-user',
        componentType: type,
        componentName: name,
        componentVersion: version,
        filePath,
      });
    }
    expect(metadataQueries).toHaveLength(1);
    expect(metadataQueries[0]!.method()).toBe('GET');
    expect(Object.fromEntries(new URL(metadataQueries[0]!.url()).searchParams)).toEqual({
      userId: 'release-user',
      type: 'EXTENSION',
      name: 'product-b-build-extension',
    });
    expect(bindingQueries).toHaveLength(1);
    expect(bindingQueries[0]!.postDataJSON()).toMatchObject({
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
      version: '0.5',
    });
    expect(detailQueries).toHaveLength(0);
    expect(historyQueries).toHaveLength(0);
    expect(productQueries).toHaveLength(0);
    expect(organizationQueries).toHaveLength(0);
    expect(publishes).toHaveLength(0);
  });

  test('绑定失败可重试，切换版本后迟到文件不能覆盖新版本', async ({ page }) => {
    await prepare(page);
    const bindingQueries: Request[] = [];
    const fileQueries: Request[] = [];
    await page.route('**/api/v1/harness/plans/components/detail**', (route) =>
      route.fulfill({
        json: envelope({
          name: 'product-b-build-extension',
          type: 'EXTENSION',
          versions: [{ version: '0.5' }, { version: '0.4' }],
        }),
      }),
    );
    await page.route('**/api/harness/scenes/bindings**', (route) => {
      bindingQueries.push(route.request());
      if (bindingQueries.length === 1)
        return route.fulfill({
          json: { meta: { success: false, message: '绑定服务暂不可用' }, data: null },
        });
      return route.fulfill({
        json: envelope([
          {
            firstScene: '开发',
            secondScenes: [
              {
                secondScene: '构建诊断',
                components: {
                  commands: [
                    {
                      name: '构建命令',
                      version: route.request().postDataJSON().version === '0.5' ? '2.0' : '1.0',
                    },
                  ],
                },
              },
            ],
          },
        ]),
      });
    });
    let releaseOldFile!: () => void;
    const oldFileGate = new Promise<void>((resolve) => {
      releaseOldFile = resolve;
    });
    await page.route('**/api/harness/packages/file**', async (route) => {
      fileQueries.push(route.request());
      const version = new URL(route.request().url()).searchParams.get('componentVersion');
      if (version === '2.0') await oldFileGate;
      await route.fulfill({ json: envelope({ content: `命令内容 ${version}` }) });
    });
    await page.locator('.asset-card').getByRole('heading').click();
    await expect(page.getByRole('alert')).toContainText('绑定服务暂不可用');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    const tree = page.locator('.asset-extension-content');
    await tree.getByRole('button', { name: /构建命令/ }).click();
    const pendingRequest = page.waitForRequest('**/api/harness/packages/file**');
    const file = tree.getByRole('button', { name: '构建命令.md', exact: true });
    await file.click();
    await pendingRequest;
    await file.click();
    await file.click();
    expect(fileQueries).toHaveLength(1);
    await page.getByRole('combobox', { name: '版本', exact: true }).click();
    await page.getByRole('option', { name: 'v0.4', exact: true }).click();
    await tree.getByRole('button', { name: /构建命令/ }).click();
    await tree.getByRole('button', { name: '构建命令.md', exact: true }).click();
    await expect(tree.locator('pre')).toHaveText('命令内容 1.0');
    expect(bindingQueries.map((request) => request.postDataJSON().version)).toEqual([
      '0.5',
      '0.5',
      '0.4',
    ]);
    expect(fileQueries).toHaveLength(2);
    const oldResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('componentVersion') === '2.0',
    );
    releaseOldFile();
    await oldResponse;
    await expect(tree.locator('pre')).toHaveText('命令内容 1.0');
    await expect(tree).not.toContainText('命令内容 2.0');
  });

  test('从尚未加载完的资产详情进入发布，取消后恢复详情内容', async ({ page }) => {
    await prepare(page);
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let detailCount = 0;
    await page.route('**/api/v1/harness/plans/components/detail**', async (route) => {
      detailCount += 1;
      if (detailCount === 1) await responseGate;
      await route.fulfill({
        json: envelope({
          name: 'product-b-build-extension',
          description: '恢复后的资产详情',
          type: 'EXTENSION',
          category: '产品级/product-b',
          versions: [],
        }),
      });
    });
    const firstRequest = page.waitForRequest('**/api/v1/harness/plans/components/detail**');
    await page.locator('.asset-card').getByRole('heading').click();
    await firstRequest;
    await page
      .locator('.asset-detail__actions')
      .getByRole('button', { name: '发布', exact: true })
      .click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publish).toBeVisible();
    const firstResponse = page.waitForResponse('**/api/v1/harness/plans/components/detail**');
    releaseResponse();
    await firstResponse;
    await publish.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.asset-detail__description')).toHaveText('恢复后的资产详情');
    expect(detailCount).toBe(2);
    await expect(page.locator('.asset-detail').getByRole('alert')).toHaveCount(0);
  });

  test('发布详情加载期间可以返回，迟到响应不能重新打开发布页', async ({ page }) => {
    await prepare(page);
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/api/harness/extensions/detail**', async (route) => {
      await responseGate;
      await route.fulfill({
        json: envelope({
          firstScene: '开发',
          secondScene: '构建诊断',
          readyStatus: '就绪',
          publishedExtension: null,
          components: { skills: [], commands: [], agents: [] },
        }),
      });
    });
    const detailRequest = page.waitForRequest('**/api/harness/extensions/detail**');
    await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
    await detailRequest;
    await expect(page.getByRole('heading', { name: '发布', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('正在加载 Extension 发布信息');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const detailResponse = page.waitForResponse('**/api/harness/extensions/detail**');
    releaseResponse();
    await detailResponse;
    await expect(page.locator('.asset-card')).toBeVisible();
    await expect(page.getByRole('heading', { name: '发布', exact: true })).toBeHidden();
  });

  test('发布按被点击记录传场景，详情失败和场景不完备仍可进入页面重试', async ({ page }) => {
    await prepare(page);
    const detailRequests: Request[] = [];
    await page.route('**/api/v1/harness/plans/components/query', (route) =>
      route.fulfill({
        json: envelope({
          records: [
            {
              name: 'product-b-first',
              category: '产品级/product-b',
              dimType: '产品级',
              dimCode: 'first-product-code',
              dimName: 'first-product',
              description: '第一张',
              status: '待发布',
              latestVersion: '0.1',
              firstScene: '第一场景',
              secondScene: '第一子场景',
              canPublish: true,
            },
            {
              name: 'product-b-second',
              category: '产品级/product-b',
              dimType: '产品级',
              dimCode: 'product-b-id',
              dimName: 'product-b',
              description: '第二张',
              status: '待发布',
              latestVersion: '0.1',
              firstScene: '应用开发',
              secondScene: '代码开发',
              canPublish: true,
            },
          ],
          total: 2,
          pageNo: 1,
          pageSize: 30,
        }),
      }),
    );
    await page.route('**/api/harness/extensions/detail**', (route) => {
      detailRequests.push(route.request());
      if (detailRequests.length === 1)
        return route.fulfill({
          json: { meta: { success: false, message: '详情服务暂不可用' }, data: null },
        });
      return route.fulfill({
        json: envelope({
          firstScene: '应用开发',
          secondScene: '代码开发',
          readyStatus: detailRequests.length === 2 ? '不完备' : '已就绪',
          publishedExtension: null,
          components: {
            skills: [{ name: '分析 Skill', version: '1.2.0' }],
            commands: [],
            agents: [],
          },
        }),
      });
    });
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const card = page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: 'product-b-second', exact: true }) });
    await card.getByRole('button', { name: '发布', exact: true }).click();
    await expect(page.getByRole('heading', { name: '发布', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('详情服务暂不可用');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publish).toBeVisible();
    await expect(publish.getByText('场景不完备，无法发布', { exact: true })).toHaveCount(0);
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
    await publish.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(publish.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled();
    expect(detailRequests).toHaveLength(3);
    for (const request of detailRequests) {
      expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
        userId: 'release-user',
      });
      expect(request.postDataJSON()).toEqual({
        dimType: '产品级',
        dimCode: 'product-b-id',
        dimName: 'product-b',
        extensionName: 'product-b-second',
        firstScene: '应用开发',
        secondScene: '代码开发',
      });
    }
    await publish.getByRole('button', { name: '取消', exact: true }).click();
    await expect(card).toBeVisible();
    await expect(page.getByLabel('产品筛选')).toHaveAttribute('data-value', '');
  });

  test('旧资产不依赖当前场景即可查历史，查询失败可重试，重试发布后仍刷新同一资产', async ({
    page,
  }) => {
    const { detailQueries, historyQueries, retries, failHistoryOnce } = await prepare(
      page,
      true,
      true,
    );
    failHistoryOnce();
    await page.getByRole('button', { name: '发布历史', exact: true }).click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history).toBeVisible();
    await expect(history.getByRole('alert')).toContainText('历史服务暂不可用');
    await history.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(history.getByRole('heading', { name: /product-b-build-extension/ })).toBeVisible();
    await expect(history.getByText('目标组织拒绝签名', { exact: true })).toBeVisible();
    expect(detailQueries).toHaveLength(0);
    expect(historyQueries).toHaveLength(2);
    expect(
      historyQueries.every((request) => request.postDataJSON().dimCode === 'product-b-id'),
    ).toBe(true);
    await history.getByRole('button', { name: /重试发布/ }).click();
    await expect(history.getByText('进行中', { exact: true })).toBeVisible();
    expect(retries).toHaveLength(1);
    expect(detailQueries).toHaveLength(0);
    expect(historyQueries).toHaveLength(3);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.getByLabel('产品筛选')).toHaveAttribute('data-value', '');
    await expect(
      page.getByRole('heading', { name: 'product-b-build-extension', exact: true }),
    ).toBeVisible();
  });

  test('手动刷新发布历史更新进行中状态，保留已展开记录并支持失败重试', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const {
      historyQueries,
      detailQueries,
      publishes,
      retries,
      failHistoryOnce,
      setLatestReleaseStatus,
    } = await prepare(page, true);
    setLatestReleaseStatus('processing');
    await page
      .locator('.asset-card')
      .getByRole('button', { name: '发布历史', exact: true })
      .click();
    const history = page.getByRole('region', { name: /发布历史/ });
    const refresh = page.getByRole('button', { name: '刷新发布历史', exact: true });
    await expect(refresh).toBeVisible();
    await expect(history.locator('.timeline-item').first().locator('.release-status')).toHaveText(
      '进行中',
    );
    await history.getByRole('button', { name: /加载更多/ }).click();
    await expect(history.locator('.timeline-item')).toHaveCount(5);

    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    await page.route('**/api/harness/extensions/history', async (route) => {
      await historyGate;
      await route.fallback();
    });
    setLatestReleaseStatus('success');
    const pendingRefresh = page.waitForRequest('**/api/harness/extensions/history');
    await refresh.click();
    await pendingRefresh;
    await expect(refresh).toBeDisabled();
    await expect(refresh).toHaveAttribute('aria-busy', 'true');
    await expect(history.locator('.timeline-item')).toHaveCount(5);
    await expect(history.locator('.timeline-item').first().locator('.release-status')).toHaveText(
      '进行中',
    );
    releaseHistory();
    await expect(history.locator('.timeline-item').first().locator('.release-status')).toHaveText(
      '成功',
    );
    await expect(history.locator('.timeline-item')).toHaveCount(5);
    await expect(refresh).toBeEnabled();
    expect(historyQueries).toHaveLength(2);
    expect(historyQueries[1]!.method()).toBe('POST');
    expect(historyQueries[1]!.postDataJSON()).toEqual(historyQueries[0]!.postDataJSON());

    failHistoryOnce();
    await refresh.click();
    await expect(history.getByRole('alert')).toContainText('历史服务暂不可用');
    await expect(history.locator('.timeline-item')).toHaveCount(5);
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(history.getByRole('alert')).toHaveCount(0);
    await expect(history.locator('.timeline-item')).toHaveCount(5);
    expect(historyQueries).toHaveLength(4);
    expect(detailQueries).toHaveLength(0);
    expect(publishes).toHaveLength(0);
    expect(retries).toHaveLength(0);
    await page
      .locator('.extension-page--embedded')
      .screenshot({ path: testInfo.outputPath('extension-history-refresh.png') });
  });

  test('全部产品下只读展示资产信息并沿用原名发布，失败保留通道和组织', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { publishes, organizationQueries, detailQueries, historyQueries } = await prepare(page);
    await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('region', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await expect(
      dialog.getByRole('heading', { name: 'product-b-build-extension', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('当前场景的说明', { exact: true })).toBeVisible();
    await expect(dialog.getByText('product-b', { exact: true })).toBeVisible();
    await expect(dialog.getByText('product-b-id', { exact: true })).toBeVisible();
    await expect(dialog.getByText('产品级', { exact: true })).toBeVisible();
    await expect(dialog.getByText('开发', { exact: true })).toBeVisible();
    await expect(dialog.getByText('构建诊断', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel(/发布通道/)).toHaveAttribute('data-value', 'beta');
    await expect(dialog.locator('.publish-summary li')).toHaveCount(3);
    await selectHarnessOption(dialog.getByLabel(/发布通道/), 'product');
    await selectHarnessOption(dialog.getByLabel(/目标组织/), 'org-target');
    await page
      .locator('.extension-page--embedded')
      .screenshot({ path: testInfo.outputPath('extension-publish-overview.png') });
    await dialog.getByRole('button', { name: '确认发布' }).click();
    await expect(dialog.locator('.modal-error')).toHaveText('发布服务暂不可用');
    await expect(
      dialog.getByRole('heading', { name: 'product-b-build-extension', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/发布通道/)).toHaveAttribute('data-value', 'product');
    await expect(dialog.getByLabel(/目标组织/)).toHaveAttribute('data-value', 'org-target');
    await dialog.getByRole('button', { name: '确认发布' }).click();
    await expect(dialog).toBeHidden();
    expect(publishes).toHaveLength(2);
    const request = publishes[1]!;
    expect(Object.fromEntries(new URL(request.url()).searchParams)).toMatchObject({
      userId: 'release-user',
      operatorName: '发布测试用户',
      dimType: '产品级',
      dimCode: 'product-b-id',
      dimName: 'product-b',
    });
    expect(request.postDataJSON()).toEqual({
      extensionName: 'product-b-build-extension',
      description: '当前场景的说明',
      releaseType: 'product',
      firstScene: '开发',
      secondScene: '构建诊断',
      targetOrgCode: 'org-target',
      targetOrgName: '目标组织',
      skills: [{ name: '分析 Skill', version: '1.2.0' }],
      commands: [{ name: '执行 Command', version: '2.1.0' }],
      agents: [{ name: '诊断 Agent', version: '3.0.0' }],
    });
    expect(new URL(organizationQueries[0]!.url()).searchParams.get('dimCode')).toBe('product-b-id');
    expect(detailQueries[0]!.postDataJSON().dimCode).toBe('product-b-id');
    await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.asset-card__meta')).toContainText('发布中');
    expect(historyQueries).toHaveLength(0);
    await page
      .locator('.asset-card')
      .getByRole('button', { name: '发布历史', exact: true })
      .click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history.locator('.timeline-item')).toContainText('当前场景的说明');
    await expect(history.locator('.timeline-item')).toContainText('目标组织');
    expect(historyQueries).toHaveLength(1);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.getByLabel('产品筛选')).toHaveAttribute('data-value', '');
    await expect(page.locator('.asset-card__meta')).toContainText('发布中');
  });

  test('历史时间线显示完整记录、失败原因和重试，已发布名称锁定', async ({ page }) => {
    const { retries } = await prepare(page, true);
    const card = page.locator('.asset-card');
    await card.getByRole('button', { name: '发布', exact: true }).click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publish.getByRole('textbox')).toHaveCount(0);
    await expect(
      publish.getByRole('heading', { name: 'product-b-build-extension', exact: true }),
    ).toBeVisible();
    await publish.getByRole('button', { name: '取消', exact: true }).click();
    await card.getByRole('button', { name: '发布历史' }).click();
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history.locator('.timeline-item')).toHaveCount(3);
    await expect(history.locator('.failure-reason')).toContainText('目标组织拒绝签名');
    await expect(history.locator('.release-meta').first()).toContainText(
      '历史发布人（historical-user）',
    );
    await history.getByRole('button', { name: /加载更多/ }).click();
    await expect(history.locator('.timeline-item')).toHaveCount(5);
    await history.getByRole('button', { name: /重试发布/ }).click();
    await expect(history.locator('.timeline-item').first().locator('.release-status')).toHaveText(
      '进行中',
    );
    expect(retries).toHaveLength(1);
    expect(new URL(retries[0]!.url()).pathname).toBe('/api/harness/extensions/release-0/retry');
    expect(Object.fromEntries(new URL(retries[0]!.url()).searchParams)).toEqual({
      userId: 'release-user',
      operatorName: '发布测试用户',
    });
    await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
  });
});

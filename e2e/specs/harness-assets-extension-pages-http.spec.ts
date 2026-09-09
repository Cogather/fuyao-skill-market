import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const envelope = (data: unknown) => ({ meta: { success: true }, data });

async function prepare(page: Page, withHistory = false) {
  const publishes: Request[] = [];
  const retries: Request[] = [];
  const organizationQueries: Request[] = [];
  const detailQueries: Request[] = [];
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
    publishedExtension: { extensionName: releaseName, description: '当前场景的说明' },
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
      data = [
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
      data = sceneDetail();
    } else if (path.endsWith('/extensions/history')) {
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
  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
  await page.getByRole('button', { name: 'Extension', exact: true }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  return { publishes, retries, organizationQueries, detailQueries };
}

test.describe('资产卡片 Extension 发布和历史 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('全部产品下使用卡片所属产品，名称通道描述和组织取页面输入，失败保留内容', async ({
    page,
  }) => {
    const { publishes, organizationQueries, detailQueries } = await prepare(page);
    await page.locator('.asset-card').getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('region', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dialog.getByLabel(/Extension 名称/)).toHaveValue('product-b-');
    await expect(dialog.getByLabel(/发布通道/)).toHaveValue('beta');
    await expect(dialog.locator('.publish-summary li')).toHaveCount(3);
    await dialog.getByLabel(/Extension 名称/).fill('product-b-dialog-release');
    await dialog.getByLabel(/Extension 描述/).fill('用户编辑的发布描述');
    await dialog.getByLabel(/发布通道/).selectOption('product');
    await dialog.getByLabel(/目标组织/).selectOption('org-target');
    await dialog.getByRole('button', { name: '确认发布' }).click();
    await expect(dialog.locator('.modal-error')).toHaveText('发布服务暂不可用');
    await expect(dialog.getByLabel(/Extension 名称/)).toHaveValue('product-b-dialog-release');
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
      extensionName: 'product-b-dialog-release',
      description: '用户编辑的发布描述',
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
    const history = page.getByRole('region', { name: /发布历史/ });
    await expect(history.locator('.timeline-item')).toContainText('用户编辑的发布描述');
    await expect(history.locator('.timeline-item')).toContainText('目标组织');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.getByLabel('产品筛选')).toHaveValue('');
    await expect(page.locator('.asset-card__meta')).toContainText('发布中');
  });

  test('历史时间线显示完整记录、失败原因和重试，已发布名称锁定', async ({ page }) => {
    const { retries } = await prepare(page, true);
    const card = page.locator('.asset-card');
    await card.getByRole('button', { name: '发布', exact: true }).click();
    const publish = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publish.getByLabel(/Extension 名称/)).toHaveAttribute('readonly', '');
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

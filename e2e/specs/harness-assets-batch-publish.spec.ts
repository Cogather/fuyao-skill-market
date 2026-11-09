import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

async function openAssets(page: Page): Promise<void> {
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await expect(page.locator('.asset-card').first()).toBeVisible();
}

test.describe('批量发布 Mock 完整流程', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 Mock 模式');

  test('三类资产支持搜索、组织单选、提交和重新打开后的清单更新', async ({ page }) => {
    await openAssets(page);
    for (const type of ['Agent', 'Skill', 'Command']) {
      await page.getByRole('button', { name: type, exact: true }).click();
      const trigger = page.getByRole('button', { name: '批量发布', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: `批量发布 · ${type}` });
      const rows = dialog.locator('.batch-publish__row');
      await expect(rows).toHaveCount(12);
      await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(1);
      await expect(dialog.getByRole('button', { name: '发布 0 项', exact: true })).toBeDisabled();
      const name = (await rows.first().locator('.batch-publish__name').innerText()).trim();
      await rows.first().getByRole('button').click();
      await dialog.getByRole('searchbox').fill(` ${name.toUpperCase()} `);
      await expect(rows).toHaveCount(1);
      await dialog.getByRole('searchbox').fill('没有这项资产');
      await expect(dialog).toContainText('未找到匹配的资产');
      await expect(dialog.getByRole('region', { name: '发布池' })).toContainText(name);
      await dialog.getByRole('searchbox').fill('');
      await rows.nth(1).getByRole('button').click();
      await dialog.getByRole('radio', { name: /^云山组织/ }).click();
      await expect(dialog.getByRole('alert')).toContainText('将清空当前发布池（2 项）');
      await dialog.getByRole('button', { name: '取消切换' }).click();
      await expect(dialog.getByRole('radio', { name: /^扶摇组织/ })).toBeChecked();
      await dialog.getByRole('radio', { name: /^云山组织/ }).click();
      await dialog.getByRole('button', { name: '确认切换' }).click();
      await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('0/10');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(`运维巡检 ${type}`);
      await expect(rows.first()).not.toContainText(name);
      await rows.first().getByRole('button').click();
      await dialog.getByRole('button', { name: `移除 运维巡检 ${type}`, exact: true }).click();
      await expect(dialog.getByRole('button', { name: '发布 0 项', exact: true })).toBeDisabled();
      await rows.first().getByRole('button').click();
      await dialog.getByRole('button', { name: '发布 1 项', exact: true }).click();
      await expect(dialog.getByRole('region', { name: '批量发布结果' })).toContainText(
        '已受理 1 项，未受理 0 项',
      );
      await expect(dialog).toContainText('将在后台发布');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog.getByRole('radio', { name: /^云山组织/ })).toHaveCount(0);
      await dialog.getByRole('radio', { name: /^扶摇组织/ }).press('ArrowRight');
      await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(1);
      await expect(dialog.getByRole('radio', { name: /^海川组织/ })).toBeChecked();
      await dialog.getByRole('button', { name: '关闭批量发布' }).click();
    }
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    await expect(page.getByRole('button', { name: '批量发布', exact: true })).toBeDisabled();
  });

  test('最多十项，查询后台结果并重试失败任务', async ({ page }, testInfo) => {
    await openAssets(page);
    await page.getByRole('button', { name: '批量发布', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const rows = dialog.locator('.batch-publish__row');
    await expect(rows).toHaveCount(12);
    for (let index = 0; index < 10; index += 1) await rows.nth(index).getByRole('button').click();
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('10/10');
    await expect(rows.nth(10).getByRole('button')).toBeDisabled();
    await dialog.getByRole('searchbox').fill('需求澄清');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('button')).toBeDisabled();
    await dialog.getByRole('button', { name: '移除 交付协同 Agent', exact: true }).click();
    await rows.first().getByRole('button').click();
    await dialog.getByRole('button', { name: '发布 10 项', exact: true }).click();
    const result = dialog.getByRole('region', { name: '批量发布结果' });
    await expect(result).toContainText('已受理 10 项，未受理 0 项');
    const retry = result.getByRole('button', { name: '重试 失败根因分析 Agent', exact: true });
    await expect(async () => {
      await result.getByRole('button', { name: '刷新进度' }).click();
      await expect(retry).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 8000, intervals: [500] });
    await dialog.screenshot({ path: testInfo.outputPath('batch-publish-results.png') });
    await retry.click();
    await expect(retry).toHaveCount(0);
    const failedRow = result
      .locator('.batch-publish__result-row')
      .filter({ hasText: '失败根因分析 Agent' });
    await expect(async () => {
      await result.getByRole('button', { name: '刷新进度' }).click();
      await expect(failedRow).toContainText('发布成功', { timeout: 500 });
    }).toPass({ timeout: 8000, intervals: [500] });
    await dialog.getByRole('button', { name: '继续选择' }).click();
    await expect(rows).toHaveCount(2);
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('0/10');
  });

  test('窄屏窗口和结果页底部操作可见', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAssets(page);
    await page.getByRole('button', { name: '批量发布', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.batch-publish__row')).toHaveCount(12);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
    await dialog.locator('.batch-publish__row').first().getByRole('button').click();
    await dialog.getByRole('button', { name: '发布 1 项' }).click();
    await expect(dialog.getByRole('region', { name: '批量发布结果' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
    await dialog.screenshot({ path: testInfo.outputPath('batch-publish-mobile.png') });
  });
});

const success = (data: unknown) => ({ meta: { success: true, message: 'OK' }, data });
const pendingGroups = (type = 'AGENT') => [
  {
    orgCode: 'ORG001',
    orgName: '云核网络智能组织',
    deptCode: '031562',
    deptName: '云核软件部',
    assets: Array.from({ length: 12 }, (_, index) => ({
      assetType: type,
      assetName: `${type.toLowerCase()}-asset-${index + 1}`,
      assetVersion: index === 0 ? 'v01.2.0' : '1.2.0',
      description: '接口返回的待发布资产',
      dimType: index % 2 ? '产品级' : '部门级',
      dimCode: index % 2 ? 'PROD001' : '031562',
      dimName: index % 2 ? '数据智能产品' : '云核软件部',
      developOwnerName: '张三',
      developOwnerId: 'l00000001',
    })),
  },
  {
    orgCode: 'ORG002',
    orgName: '云核数据智能组织',
    deptCode: '031563',
    deptName: '云核数据部',
    assets: [
      {
        assetType: type,
        assetName: 'other-org-asset',
        assetVersion: '0.9.1',
        dimType: '产品级',
        dimCode: 'PROD002',
        dimName: '下游产品',
      },
    ],
  },
];
type ApiState = {
  pending: (url: URL) => unknown;
  submit: (body: any) => Promise<unknown> | unknown;
  history: () => unknown;
  retry: () => unknown;
  requests: Array<{
    path: string;
    method: string;
    params: Record<string, string>;
    body: any;
    cookie: string;
  }>;
};

async function installHttp(page: Page): Promise<ApiState> {
  const state: ApiState = {
    pending: (url) => success(pendingGroups(url.searchParams.get('assetType') || 'AGENT')),
    submit: () => success(null),
    history: () => success({ records: [] }),
    retry: () => success(null),
    requests: [],
  };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'batch-user',
        userName: '批量发布用户',
        departmentList: [
          { deptId: 'dept-1', deptCode: '031562', deptName: '云核软件部', deptLevel: 1 },
        ],
      }),
    ),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    const body = request.method() === 'POST' && request.postData() ? request.postDataJSON() : null;
    state.requests.push({
      path: url.pathname,
      method: request.method(),
      params: Object.fromEntries(url.searchParams),
      body,
      cookie: request.headers().cookie || '',
    });
    let response: unknown = success([]);
    if (url.pathname.endsWith('/permission/user-depts'))
      response = success({
        ownedOrgs: [
          { deptName: '云核软件部', deptCode: '031562', path: ['云核软件部'], levelNo: 1 },
        ],
        adminOrgs: [],
      });
    else if (url.pathname.endsWith('/components/query'))
      response = success({
        records: [
          {
            name: '仅列表中的 Agent',
            type: 'AGENT',
            latestVersion: 'v1.0.0',
            status: '待发布',
            category: '部门级/云核软件部',
            dimType: '部门级',
            dimCode: '031562',
            dimName: '云核软件部',
            canPublish: true,
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      });
    else if (url.pathname === '/api/v1/harness/assets/publish/batch/pending-list')
      response = state.pending(url);
    else if (url.pathname === '/api/v1/harness/assets/publish/batch')
      response = await state.submit(body);
    else if (url.pathname === '/api/harness/assets/publish/history') response = state.history();
    else if (url.pathname.endsWith('/retry')) response = state.retry();
    await route.fulfill({ json: response });
  });
  return state;
}

test.describe('批量发布 HTTP 完整流程', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('按契约查询和提交、部分受理、进度重试及仅重提拒绝项', async ({ page }, testInfo) => {
    const state = await installHttp(page);
    let release!: () => void;
    const submitted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted: any;
    let failed = false;
    let phase = '发布失败';
    state.submit = async (body) => {
      await submitted;
      accepted = { ...body.items[0], taskId: 'task/1' };
      return {
        meta: {
          success: body.items.length === 1,
          message: body.items.length > 1 ? '部分资产未受理，请查看明细' : 'OK',
        },
        data: {
          batchId: 'batch-001',
          accepted: [accepted],
          rejected: body.items.slice(1).map((item: any) => ({
            ...item,
            reason: '目标组织与该维度的绑定关系不一致，请刷新后重试',
          })),
        },
      };
    };
    state.history = () =>
      failed
        ? { meta: { success: false, message: '进度服务暂不可用' }, data: null }
        : success({
            records: [
              {
                ...accepted,
                id: 'task/1',
                operatorId: 'batch-user',
                publishStatus: phase,
                errorMessage: phase === '发布失败' ? '签名失败' : '',
              },
            ],
          });
    state.retry = () => {
      phase = '进行中';
      return success(null);
    };
    await openAssets(page);
    await page
      .context()
      .addCookies([
        { name: 'batch_session', value: 'e2e-cookie', url: new URL(page.url()).origin },
      ]);
    await page.getByRole('button', { name: '批量发布', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const rows = dialog.locator('.batch-publish__row');
    await expect(rows).toHaveCount(12);
    await expect(dialog).toContainText('组织所属部门：云核软件部');
    await expect(rows.nth(1)).toContainText('产品级 · 数据智能产品');
    await expect(dialog).not.toContainText('仅列表中的 Agent');
    const query = state.requests.find((request) => request.path.endsWith('/pending-list'))!;
    expect(query.method).toBe('GET');
    expect(query.params).toEqual({ userId: 'batch-user', deptCode: '031562', assetType: 'AGENT' });
    await rows.nth(0).getByRole('button').click();
    await rows.nth(1).getByRole('button').click();
    await dialog.getByRole('button', { name: '发布 2 项' }).click();
    await expect(dialog.getByRole('button', { name: '正在提交…' })).toBeDisabled();
    await expect(dialog.getByRole('radio').first()).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    release();
    const result = dialog.getByRole('region', { name: '批量发布结果' });
    await expect(result).toContainText('已受理 1 项，未受理 1 项');
    await expect(result).toContainText('绑定关系不一致');
    const writes = () =>
      state.requests.filter((request) => request.path === '/api/v1/harness/assets/publish/batch');
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      targetOrgId: 'ORG001',
      userId: 'batch-user',
      userName: '批量发布用户',
      items: [
        { assetType: 'AGENT', assetName: 'agent-asset-1', assetVersion: 'v01.2.0' },
        { assetType: 'AGENT', assetName: 'agent-asset-2', assetVersion: '1.2.0' },
      ],
    });
    expect(writes()[0].cookie).toContain('batch_session=e2e-cookie');
    await expect(
      result.getByRole('button', { name: '重试 agent-asset-1', exact: true }),
    ).toBeVisible();
    await dialog.screenshot({ path: testInfo.outputPath('batch-publish-partial.png') });
    failed = true;
    await result.getByRole('button', { name: '刷新进度' }).click();
    await expect(result.getByRole('alert')).toContainText('进度服务暂不可用');
    failed = false;
    await result.getByRole('button', { name: '刷新进度' }).click();
    await result.getByRole('button', { name: '重试 agent-asset-1', exact: true }).click();
    await expect(result).toContainText('进行中');
    const history = state.requests.find(
      (request) => request.path.endsWith('/history') && request.body?.batchId,
    )!;
    expect(history.body).toEqual({
      batchId: 'batch-001',
      operatorId: 'batch-user',
      pageNum: 1,
      pageSize: 10,
    });
    expect(state.requests.find((request) => request.path.endsWith('/retry'))?.path).toBe(
      '/api/harness/assets/publish/task%2F1/retry',
    );
    expect(state.requests.find((request) => request.path.endsWith('/retry'))?.params).toEqual({
      userId: 'batch-user',
    });
    state.pending = () =>
      success(
        pendingGroups().map((group) => ({
          ...group,
          assets: group.assets.filter((item) => item.assetName !== 'agent-asset-1'),
        })),
      );
    await dialog.getByRole('button', { name: '继续选择' }).click();
    await expect(rows).toHaveCount(11);
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('1/10');
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('agent-asset-2');
    await dialog.getByRole('button', { name: '发布 1 项' }).click();
    await expect(result).toContainText('已受理 1 项，未受理 0 项');
    expect(writes()).toHaveLength(2);
    expect(writes()[1].body.items).toEqual([
      { assetType: 'AGENT', assetName: 'agent-asset-2', assetVersion: '1.2.0' },
    ]);
    expect(
      state.requests.filter((request) => request.path.endsWith('/extensions/orgs')),
    ).toHaveLength(0);
  });

  test('查询失败可重试、空清单、整体拒绝保留选择、全项拒绝显示原因', async ({ page }) => {
    const state = await installHttp(page);
    state.pending = () => ({ meta: { success: false, message: '部门编码无效' }, data: null });
    await openAssets(page);
    await page.getByRole('button', { name: '批量发布', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('部门编码无效');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    state.pending = () => success([]);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('暂无有权限发布的待发布资产');
    await expect(dialog.getByRole('button', { name: '发布 0 项' })).toBeDisabled();
    state.pending = () => success(pendingGroups());
    await dialog.getByRole('button', { name: '刷新清单' }).click();
    await dialog.locator('.batch-publish__row').first().getByRole('button').click();
    state.submit = () => ({
      meta: { success: false, message: '您不是目标组织的管理员，无法发布' },
      data: null,
    });
    await dialog.getByRole('button', { name: '发布 1 项' }).click();
    await expect(dialog.getByRole('alert')).toContainText('不是目标组织的管理员');
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('1/10');
    state.submit = (body) => ({
      meta: { success: false, message: '全部未受理' },
      data: {
        batchId: '',
        accepted: [],
        rejected: body.items.map((item: any) => ({
          ...item,
          reason: '该版本已发布，无需重复发布',
        })),
      },
    });
    await dialog.getByRole('button', { name: '发布 1 项' }).click();
    await expect(dialog.getByRole('region', { name: '批量发布结果' })).toContainText(
      '已受理 0 项，未受理 1 项',
    );
    await expect(dialog).toContainText('该版本已发布，无需重复发布');
    expect(
      state.requests.filter(
        (request) => request.path.endsWith('/history') && request.body?.batchId,
      ),
    ).toHaveLength(0);
    state.pending = () => success([]);
    await dialog.getByRole('button', { name: '继续选择' }).click();
    await expect(dialog.getByRole('region', { name: '发布池' })).toContainText('0/10');
    await expect(dialog.getByRole('button', { name: '发布 0 项' })).toBeDisabled();
  });
});

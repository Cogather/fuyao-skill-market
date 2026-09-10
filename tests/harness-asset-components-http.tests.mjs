import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { default: httpRequest } = await server.ssrLoadModule(
    '/src/services/skillMarket/request.ts',
  );
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const requests = [];
  httpRequest.api = async (config) => {
    requests.push(config);
    return {};
  };
  const body = {
    userId: 'asset-user',
    deptCode: 'dept-delivery',
    productCode: 'product-pipeline',
    type: 'SKILL',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNo: 2,
    pageSize: 30,
  };

  await skillBaseService.queryHarnessAssetComponents(body);
  assert.deepEqual(requests, [
    {
      url: '/v1/harness/plans/components/query',
      method: 'post',
      data: body,
    },
  ]);
  console.log('PASS component list uses httpRequest.api POST with the filters in the body');

  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const { harnessAssetStatus } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementTypes.ts',
  );
  const api = getHarnessAssetApi();
  const scope = {
    userId: 'asset-user',
    userName: '测试用户',
    department: { id: 'dept-id', code: 'dept-delivery', name: '交付部', path: ['交付部'] },
    product: { id: 'product-pipeline', name: '流水线', departmentPath: ['交付部'] },
  };
  const row = {
    name: 'pipeline-check',
    description: '检查流水线',
    latestVersion: '0.0.1',
    status: '待发布',
    category: '产品级/流水线',
    updatedAt: '2026-03-24 10:00:00',
  };
  const response = (records, total, pageNo = 1, pageSize = 30) => ({
    meta: { success: true, message: 'OK', number: records.length },
    data: { records, total, pageNo, pageSize },
  });
  let nextResponse = response([row], 31);
  httpRequest.api = async (config) => {
    requests.push(config);
    return nextResponse;
  };
  for (const name of [
    'queryAgentMasterManagement',
    'querySkillMasterManagement',
    'queryCommandMasterManagement',
    'querySceneAndBindingPlanningItems',
    'queryHarnessDeptProducts',
  ]) {
    skillBaseService[name] = async () => assert.fail(`list must not call legacy API ${name}`);
  }

  for (const [assetType, type] of [
    ['Agent', 'AGENT'],
    ['Skill', 'SKILL'],
    ['Command', 'COMMAND'],
    ['Extension', 'EXTENSION'],
  ]) {
    requests.length = 0;
    const result = await api.queryAssets({ ...scope, assetType }, { pageNum: 1, pageSize: 30 });
    assert.deepEqual(requests, [
      {
        url: '/v1/harness/plans/components/query',
        method: 'post',
        data: { ...body, type, pageNo: 1 },
      },
    ]);
    assert.equal(result.total, 31, 'use data.total, not meta.number');
    assert.equal(result.hasMore, true);
    assert.equal(result.list.length, 1);
    const asset = result.list[0];
    assert.equal(asset.name, row.name);
    assert.equal(asset.description, row.description);
    assert.equal(asset.assetType, assetType);
    assert.equal(asset.currentVersion, '0.0.1');
    assert.deepEqual(asset.versions, ['0.0.1']);
    assert.equal(harnessAssetStatus(asset), '待发布');
    assert.equal(asset.publishable, assetType === 'Extension');
    assert.equal(asset.category, row.category);
    assert.equal(asset.updatedAt, row.updatedAt);
    assert.ok(asset.id, 'records without a backend id still need a stable list key');
  }
  console.log('PASS all four filters use one components query and map the supplied records');

  for (const [status, canPublish, latestVersion, publishable] of [
    ['已发布', true, '0.0.1', true],
    ['已发布', true, null, true],
    ['已发布', false, '0.0.1', false],
    ['已发布', undefined, '0.0.1', false],
    ['发布中', true, '0.0.1', false],
    ['未开发', true, null, false],
    ['待发布', true, null, true],
    ['可发布', true, '0.0.1', true],
    ['可发布', false, '0.0.1', true],
    ['可发布', true, null, false],
  ]) {
    nextResponse = response([{ ...row, status, canPublish, latestVersion }], 1);
    const result = await api.queryAssets(
      { ...scope, assetType: 'Extension' },
      { pageNum: 1, pageSize: 30 },
    );
    assert.equal(
      result.list[0].publishable,
      publishable,
      `${status}, canPublish=${canPublish}, version=${latestVersion}: publish action visibility`,
    );
    assert.equal(result.list[0].canPublish, canPublish);
  }
  console.log('PASS published Extensions can be published again only with explicit permission');

  requests.length = 0;
  nextResponse = response([{ ...row, name: 'next-page' }], 31, 2);
  const lastPage = await api.queryAssets(
    { ...scope, assetType: 'Skill' },
    { pageNum: 2, pageSize: 30 },
  );
  assert.equal(requests[0].data.pageNo, 2);
  assert.deepEqual(
    lastPage.list.map((asset) => asset.name),
    ['next-page'],
  );
  assert.equal(lastPage.hasMore, false);

  nextResponse = response([], 0);
  const empty = await api.queryAssets(
    { ...scope, assetType: 'Skill' },
    { pageNum: 1, pageSize: 30 },
  );
  assert.deepEqual(empty, { list: [], total: 0, hasMore: false });
  console.log('PASS server pagination appends a later page and stops at total');

  requests.length = 0;
  await api.queryAssets(
    {
      ...scope,
      department: { id: '', code: '', name: '', path: [] },
      product: undefined,
      assetType: 'Agent',
    },
    { pageNum: 1, pageSize: 30 },
  );
  assert.deepEqual(requests[0].data, {
    userId: 'asset-user',
    type: 'AGENT',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNo: 1,
    pageSize: 30,
  });
  console.log('PASS unselected department and product are omitted from the body');

  nextResponse = response([row, { ...row, category: '部门级/交付部' }], 2);
  const named = await api.queryAssets(
    { ...scope, assetType: 'Skill' },
    { pageNum: 1, pageSize: 30 },
  );
  assert.equal(new Set(named.list.map((asset) => asset.id)).size, 2);
  nextResponse = response([{ ...row, latestVersion: '0.0.2' }], 1);
  const refreshed = await api.queryAssets(
    { ...scope, assetType: 'Skill' },
    { pageNum: 1, pageSize: 30 },
  );
  assert.equal(refreshed.list[0].id, named.list[0].id, 'version changes preserve asset identity');
  console.log('PASS same-name assets in different categories remain distinct');

  nextResponse = { meta: { success: false, message: '没有查询权限' }, data: null };
  await assert.rejects(
    api.queryAssets({ ...scope, assetType: 'Agent' }, { pageNum: 1, pageSize: 30 }),
    /没有查询权限/,
  );
  nextResponse = { meta: { success: true }, data: { total: 1 } };
  await assert.rejects(
    api.queryAssets({ ...scope, assetType: 'Agent' }, { pageNum: 1, pageSize: 30 }),
    /响应格式/,
  );
  console.log('PASS API failures and malformed responses are not treated as empty success');
} finally {
  await server.close();
}

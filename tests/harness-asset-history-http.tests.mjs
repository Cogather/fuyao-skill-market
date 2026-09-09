import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const scope = {
  userId: 'history-user',
  userName: '历史测试用户',
  department: { id: 'dept-1', code: 'dept-1', name: '研发部', path: ['研发部'] },
  product: { id: 'product-a', name: '产品A', departmentPath: ['研发部'] },
  assetType: 'Extension',
};
const row = {
  name: 'legacy-extension',
  description: '历史资产',
  latestVersion: '0.2',
  status: '已发布',
  category: '产品级/产品B',
  updatedAt: '2026-09-09 10:00:00',
  canPublish: false,
};
try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const { queryHttpExtensionHistory } = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionPublishHttp.ts',
  );
  const api = getHarnessAssetApi();
  request.api = async () => success({ records: [row], total: 1, pageNo: 1, pageSize: 30 });
  const asset = (await api.queryAssets(scope, { pageNum: 1, pageSize: 30 })).list[0];
  assert.equal(
    asset.productId,
    '',
    'an unmatched category must not borrow the selected product ID',
  );

  let productQueries = 0;
  skillBaseService.queryHarnessDeptProducts = async () => {
    productQueries += 1;
    return success(
      productQueries === 1 ? [] : [{ offeringId: 'product-b', offeringName: '产品B' }],
    );
  };
  await api.queryProducts(scope);
  let historyResponse = success([
    {
      id: 'other',
      extensionName: 'another-extension',
      version: '9.0',
      publishStatus: 'success',
      publishedAt: '2026-09-09',
    },
    {
      id: 'match',
      extensionName: 'legacy-extension',
      version: '0.2',
      publishStatus: 'failed',
      errorMessage: '签名失败',
      publishedAt: '2026-09-08',
      skills: [{ name: 'old-skill', version: '1.2' }],
    },
  ]);
  const historyRequests = [];
  request.harnessApi = async (config) => {
    assert.equal(
      config.url,
      '/extensions/history',
      'history must not depend on current scene details',
    );
    historyRequests.push(config);
    return historyResponse;
  };
  const context = await api.queryExtensionReleaseContext(scope, asset, 'history');
  assert.equal(context.scope.dimCode, 'product-b');
  assert.equal(context.scope.dimName, '产品B');
  assert.equal(productQueries, 2, 'refresh a stale product cache when the asset is missing');
  assert.equal(
    historyRequests.length,
    0,
    'context preparation leaves the single history load to the page',
  );
  assert.equal(context.scene.extension.name, 'legacy-extension');
  let history = await queryHttpExtensionHistory(context.scope, context.scene);
  assert.deepEqual(
    history.releases.map((item) => item.id),
    ['match'],
  );
  assert.equal(history.releases[0].failReason, '签名失败');
  assert.equal(history.releases[0].items[0].version, '1.2');
  assert.equal(historyRequests[0].data.dimCode, 'product-b');
  assert.equal(historyRequests[0].method, 'post');

  // Scene codes in asset names can differ from published Extension names.
  const sceneAsset = { ...asset, name: 'scene-code', firstScene: '开发', secondScene: '旧场景' };
  const sceneContext = await api.queryExtensionReleaseContext(
    { ...scope, product: undefined },
    sceneAsset,
    'history',
  );
  historyResponse = success([
    {
      id: 'renamed',
      extensionName: 'published-name',
      version: '0.3',
      firstScene: '开发',
      secondScene: '旧场景',
      publishStatus: 'processing',
    },
    {
      id: 'different-scene',
      extensionName: 'published-name',
      version: '8.0',
      firstScene: '开发',
      secondScene: '其他场景',
      publishStatus: 'success',
    },
  ]);
  history = await queryHttpExtensionHistory(sceneContext.scope, sceneContext.scene);
  assert.equal(history.publishing.id, 'renamed');
  assert.deepEqual(history.releases, []);
  assert.equal(history.extension.name, 'published-name');
  history = await queryHttpExtensionHistory(sceneContext.scope, history);
  assert.equal(history.publishing.id, 'renamed', 'refresh keeps the same scene identity');

  const departmentAsset = {
    ...asset,
    productName: '',
    productId: '',
    category: '部门级/研发部',
    departmentName: '研发部',
  };
  const departmentContext = await api.queryExtensionReleaseContext(
    scope,
    departmentAsset,
    'history',
  );
  assert.equal(departmentContext.scope.dimType, '部门级');
  assert.equal(departmentContext.scope.dimCode, 'dept-1');
  const before = {
    name: asset.name,
    status: asset.status,
    version: asset.currentVersion,
    canPublish: asset.canPublish,
  };
  historyResponse = success([]);
  assert.deepEqual(await api.queryReleases(scope, asset), []);
  assert.deepEqual(
    {
      name: asset.name,
      status: asset.status,
      version: asset.currentVersion,
      canPublish: asset.canPublish,
    },
    before,
    'history refresh must preserve list metadata and permission',
  );
  historyResponse = { meta: { success: false, message: '历史查询失败' }, data: null };
  await assert.rejects(queryHttpExtensionHistory(context.scope, context.scene), /历史查询失败/);
  historyResponse = success({ unexpected: [] });
  await assert.rejects(queryHttpExtensionHistory(context.scope, context.scene), /响应格式/);
  historyResponse = success([]);
  assert.deepEqual((await queryHttpExtensionHistory(context.scope, context.scene)).releases, []);
  await assert.rejects(
    api.queryExtensionReleaseContext(
      scope,
      { ...asset, productName: '不存在的产品', productId: '' },
      'history',
    ),
    /所属产品/,
  );
  await assert.rejects(
    api.queryExtensionReleaseContext(
      scope,
      { ...departmentAsset, departmentName: '其他部门' },
      'history',
    ),
    /所属部门/,
  );
  console.log(
    'PASS HTTP history is independent of scene preparation, resolves scope safely, isolates records and preserves errors/metadata',
  );
} finally {
  await server.close();
}

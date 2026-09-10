import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const scope = {
  userId: ' user-001 ',
  userName: '测试用户',
  department: { id: 'dept-1', code: 'dept-1', name: '研发部', path: ['研发部'] },
  assetType: 'Extension',
};
const product = { id: '30222', name: 'Udm产品部', departmentPath: ['研发部'] };
const record = {
  name: 'udm-mml-e2e-extension',
  description: '扩展摘要',
  category: '产品级/Udm产品部',
  dimType: '产品级',
  dimCode: '30222',
  dimName: 'Udm产品部',
  latestVersion: '1.0.0',
  status: '待发布',
  firstScene: '应用开发',
  secondScene: 'mml代码开发',
};

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const calls = [];
  let records = [record];
  let availableProducts = [];
  request.api = async () => success({ records, total: records.length, pageNo: 1, pageSize: 30 });
  request.harnessApi = async (config) => {
    calls.push(config);
    if (config.url === '/smapi-product-by-dept') return success(availableProducts);
    if (config.url === '/extensions/history') return success([]);
    assert.equal(config.url, '/extensions/detail');
    return success({
      firstScene: '应用开发',
      secondScene: 'mml代码开发',
      readyStatus: '已就绪',
      publishedExtension: null,
      components: {
        commands: [{ name: '/udm-e2e-command', version: '1.0.0' }],
        skills: [],
        agents: [],
      },
    });
  };

  // The list item supplies dimensions even when no product filter/cache is available.
  records = [{ ...record, name: 'another-extension', dimCode: '40011' }, record];
  const asset = (await api.queryAssets(scope, { pageNum: 1, pageSize: 30 })).list[1];
  const context = await api.queryExtensionReleaseContext(scope, asset);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/extensions/detail', '/extensions/history'],
  );
  assert.deepEqual(calls[0], {
    url: '/extensions/detail',
    method: 'POST',
    params: { userId: 'user-001' },
    data: {
      dimType: '产品级',
      dimCode: '30222',
      dimName: 'Udm产品部',
      extensionName: 'udm-mml-e2e-extension',
      firstScene: '应用开发',
      secondScene: 'mml代码开发',
    },
  });
  assert.equal(context.scope.dimCode, '30222');
  assert.equal(context.productName, 'Udm产品部');
  assert.equal(context.scene.capabilities.command[0].name, '/udm-e2e-command');
  console.log('PASS publish uses the clicked list record dimensions without a product filter');

  // A same-name product from the UI must not override the record's authoritative code.
  calls.length = 0;
  await api.queryExtensionReleaseContext(
    { ...scope, product: { ...product, id: 'stale-filter-code' } },
    asset,
  );
  assert.equal(calls[0].data.dimCode, '30222');
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/extensions/detail', '/extensions/history'],
  );

  // Department Extensions must not need a product list either.
  records = [
    {
      ...record,
      category: '部门级/另一部门',
      dimType: '部门级',
      dimCode: 'dept-2',
      dimName: '另一部门',
    },
  ];
  const departmentAsset = (await api.queryAssets(scope, { pageNum: 1, pageSize: 30 })).list[0];
  calls.length = 0;
  const departmentContext = await api.queryExtensionReleaseContext(scope, departmentAsset);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/extensions/detail', '/extensions/history'],
  );
  assert.equal(calls[0].data.dimType, '部门级');
  assert.equal(calls[0].data.dimCode, 'dept-2');
  assert.equal(calls[0].data.dimName, '另一部门');
  assert.equal(departmentContext.productName, '');

  // Unresolved card ownership must neither reload products nor borrow an unrelated filter.
  records = [{ ...record, dimType: undefined, dimCode: undefined, dimName: undefined }];
  const unresolved = (await api.queryAssets(scope, { pageNum: 1, pageSize: 30 })).list[0];
  calls.length = 0;
  await assert.rejects(
    api.queryExtensionReleaseContext(
      { ...scope, product: { ...product, id: 'other', name: '其他产品' } },
      unresolved,
    ),
    /无法确定该 Extension 所属产品/,
  );
  assert.deepEqual(calls, [], 'missing dimensions must not trigger a product lookup on publish');

  // A subsequently loaded matching filter can resolve the same retained card on retry.
  availableProducts = [{ offeringId: '30222', offeringName: 'Udm产品部' }];
  await api.queryProducts(scope);
  calls.length = 0;
  const retried = await api.queryExtensionReleaseContext(scope, unresolved);
  assert.equal(retried.scope.dimCode, '30222');
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/extensions/detail', '/extensions/history'],
  );
  console.log('PASS department scope, missing product identity, and cached-product retry');
} finally {
  await server.close();
}

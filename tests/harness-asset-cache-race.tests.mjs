import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Expected request did not start');
}
const scope = {
  userId: 'race-tester',
  userName: 'Race Tester',
  department: { id: 'dept-1', code: 'dept-1', name: 'Delivery', path: ['Delivery'] },
  assetType: 'Agent',
};
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const response = (name, pageNo = 1) =>
  success({
    records: [
      {
        name,
        description: name,
        latestVersion: '1.0.0',
        status: '可发布',
        category: '产品级/new-product',
        updatedAt: '2026-03-24 10:00:00',
      },
    ],
    total: 2,
    pageNo,
    pageSize: 1,
  });
try {
  const { default: httpRequest } = await server.ssrLoadModule(
    '/src/services/skillMarket/request.ts',
  );
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const products = [];
  skillBaseService.queryHarnessDeptProducts = () => {
    const request = deferred();
    products.push(request);
    return request.promise;
  };
  const olderProducts = api.queryProducts(scope);
  const newerProducts = api.queryProducts(scope);
  await waitFor(() => products.length === 2);
  products[1].resolve(
    success([{ offeringId: 'new-id', offeringName: 'new-product', planningDeptName: 'Delivery' }]),
  );
  await newerProducts;
  products[0].resolve(
    success([{ offeringId: 'old-id', offeringName: 'new-product', planningDeptName: 'Delivery' }]),
  );
  await olderProducts;
  httpRequest.api = async () => response('new-asset');
  const first = await api.queryAssets(scope, { pageNum: 1, pageSize: 1 });
  assert.equal(
    first.list[0].productId,
    'new-id',
    'late product responses must not overwrite current product metadata',
  );

  const requests = [];
  httpRequest.api = (config) => {
    const request = { ...deferred(), body: config.data };
    requests.push(request);
    return request.promise;
  };
  const oldPageTwo = api.queryAssets(scope, { pageNum: 2, pageSize: 1 });
  const newPageOne = api.queryAssets(scope, { pageNum: 1, pageSize: 1 });
  await waitFor(() => requests.length === 2);
  requests[1].resolve(response('refreshed'));
  assert.equal((await newPageOne).list[0].name, 'refreshed');
  requests[0].reject(new Error('old request failed'));
  await assert.rejects(oldPageTwo, /old request failed/);
  const retry = api.queryAssets(scope, { pageNum: 2, pageSize: 1 });
  await waitFor(() => requests.length === 3);
  assert.equal(requests[2].body.pageNo, 2);
  requests[2].resolve(response('second', 2));
  const second = await retry;
  assert.equal(second.list[0].name, 'second');
  assert.equal(second.hasMore, false);

  const oldAgent = api.queryAssets(scope, { pageNum: 1, pageSize: 1 });
  const newExtension = api.queryAssets(
    { ...scope, assetType: 'Extension' },
    { pageNum: 1, pageSize: 1 },
  );
  await waitFor(() => requests.length === 5);
  requests[4].resolve(response('extension'));
  assert.equal((await newExtension).list[0].assetType, 'Extension');
  requests[3].resolve(response('agent'));
  assert.equal((await oldAgent).list[0].assetType, 'Agent');
  assert.deepEqual(
    requests.slice(3).map((request) => request.body.type),
    ['AGENT', 'EXTENSION'],
  );
  console.log('PASS stale metadata, failed pages and concurrent type queries remain isolated');
} finally {
  await server.close();
}

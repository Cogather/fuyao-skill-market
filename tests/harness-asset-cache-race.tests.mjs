import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

const success = (data, number = Array.isArray(data) ? data.length : 0) => ({
  meta: { success: true, message: '', number },
  data,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function product(id, name) {
  return {
    offeringId: id,
    offeringName: name,
    planningDeptName: 'Delivery',
  };
}

function bindingResponse(sceneNames) {
  return success([
    {
      firstScene: 'Race',
      secondScenes: sceneNames.map((secondScene) => ({
        secondScene,
        publishable: true,
        components: { skills: [], commands: [], agents: [] },
      })),
    },
  ]);
}

const baseScope = {
  userId: 'race-tester',
  userName: 'Race Tester',
  department: {
    id: 'dept-1',
    code: 'dept-1',
    name: 'Delivery',
    path: ['Platform', 'Delivery'],
  },
};

try {
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const productRequests = [];
  skillBaseService.queryHarnessDeptProducts = () => {
    const request = deferred();
    productRequests.push(request);
    return request.promise;
  };
  const agentScopeRequests = [];
  let queryAgentCatalog = async (params) => {
    agentScopeRequests.push({ ...params });
    return success([], 0);
  };
  skillBaseService.queryAgentMasterManagement = (params) => queryAgentCatalog(params);
  skillBaseService.queryPublishedHistoryList = async () => success({ list: [], total: 0 }, 0);
  const bindingRequests = [];
  skillBaseService.querySceneAndBindingPlanningItems = () => {
    const request = deferred();
    bindingRequests.push(request);
    return request.promise;
  };

  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();

  const olderProducts = api.queryProducts(baseScope);
  await waitFor(() => productRequests.length === 1, 'the older product request');
  const newerProducts = api.queryProducts(baseScope);
  await waitFor(() => productRequests.length === 2, 'the newer product request');

  productRequests[1].resolve(success([product('product-new', 'new-product')]));
  assert.deepEqual(
    (await newerProducts).map((item) => item.id),
    ['product-new'],
  );
  productRequests[0].resolve(success([product('product-old', 'old-product')]));
  assert.deepEqual(
    (await olderProducts).map((item) => item.id),
    ['product-old'],
  );

  await api.queryAssets({ ...baseScope, assetType: 'Agent' }, { pageNum: 1, pageSize: 2 });
  assert.ok(
    agentScopeRequests.some((request) => request.dimCode === 'product-new'),
    'the newer product response should remain cached for subsequent asset queries',
  );
  assert.ok(
    agentScopeRequests.every((request) => request.dimCode !== 'product-old'),
    'the older product response must not overwrite the newer cache entry',
  );

  const agentPageTwo = deferred();
  let agentPageTwoStarted = false;
  queryAgentCatalog = (params) => {
    if (Number(params.pageNum) === 2) {
      agentPageTwoStarted = true;
      return agentPageTwo.promise;
    }
    return success(
      [
        {
          id: 'replacement-agent',
          agentName: 'Replacement Agent',
          agentDescription: 'Replacement page-one result',
          dimType: '产品级',
          dimCode: 'product-new',
          dimName: 'new-product',
          ownerName: 'Owner',
          ownerId: 'u-1',
          developOwnerName: 'Developer',
          developOwnerId: 'u-2',
          status: '已完成',
          versions: [],
          updatedAt: '2026-09-06 10:00:00',
        },
      ],
      2,
    );
  };
  const agentScope = {
    ...baseScope,
    product: {
      id: 'product-new',
      name: 'new-product',
      departmentPath: [...baseScope.department.path],
    },
    assetType: 'Agent',
  };
  await api.queryAssets(agentScope, { pageNum: 1, pageSize: 1 });
  const staleNextPage = api.queryAssets(agentScope, { pageNum: 2, pageSize: 1 });
  await waitFor(() => agentPageTwoStarted, 'the stale Agent second-page request');
  const replacementPageOne = api.queryAssets(agentScope, { pageNum: 1, pageSize: 1 });
  agentPageTwo.reject(new Error('stale second page failed'));
  await assert.rejects(staleNextPage, /stale second page failed/);
  const replacementResult = await replacementPageOne;
  assert.equal(replacementResult.list.length, 1);
  assert.equal(
    replacementResult.list[0].id,
    'replacement-agent',
    'a stale page failure must not invalidate a newer page-one reset',
  );

  const extensionScope = {
    ...baseScope,
    product: {
      id: 'product-new',
      name: 'new-product',
      departmentPath: [...baseScope.department.path],
    },
    assetType: 'Extension',
  };

  const olderPageOne = api.queryAssets(extensionScope, { pageNum: 1, pageSize: 1 });
  await waitFor(() => bindingRequests.length === 1, 'the older Extension page-one request');
  const newerPageOne = api.queryAssets(extensionScope, { pageNum: 1, pageSize: 1 });
  await waitFor(() => bindingRequests.length === 2, 'the newer Extension page-one request');

  bindingRequests[1].resolve(bindingResponse(['new-1', 'new-2']));
  const newerFirstPage = await newerPageOne;
  assert.equal(newerFirstPage.list.length, 1);
  assert.match(newerFirstPage.list[0].description, /new-1/);
  assert.equal(newerFirstPage.hasMore, true);

  bindingRequests[0].resolve(bindingResponse(['old-1']));
  const olderFirstPage = await olderPageOne;
  assert.equal(olderFirstPage.list.length, 1);
  assert.match(olderFirstPage.list[0].description, /old-1/);

  const secondPage = await api.queryAssets(extensionScope, { pageNum: 2, pageSize: 1 });
  assert.equal(secondPage.list.length, 1);
  assert.match(
    secondPage.list[0].description,
    /new-2/,
    'the late older response must not replace the newer Extension pagination state',
  );
  assert.equal(secondPage.hasMore, false);
  assert.equal(
    bindingRequests.length,
    2,
    'page two should reuse the winning page-one snapshot instead of refetching Extension scenes',
  );

  console.log('PASS stale product and Extension responses cannot overwrite newer cache sessions');
} finally {
  await server.close();
}

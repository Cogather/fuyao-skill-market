import assert from 'node:assert/strict';
import { createServer } from 'vite';

// HTTP 分页契约见 harness-asset-components-http.tests.mjs。
process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';
const originalWindow = globalThis.window;
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};
const mockServer = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { getHarnessAssetApi } = await mockServer.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const scope = {
    userId: 'extension-tester',
    userName: 'Extension Tester',
    department: {
      id: 'dept-continuous-delivery',
      code: 'dept-continuous-delivery',
      name: '持续交付组',
      path: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'],
    },
    product: {
      id: 'harness-pipeline',
      name: 'harness-pipeline',
      departmentPath: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'],
    },
    assetType: 'Extension',
  };
  const collected = [];
  let expectedTotal = 0;
  let pageNum = 1;
  let hasMore = true;
  while (hasMore && pageNum <= 20) {
    const result = await api.queryAssets(scope, { pageNum, pageSize: 2 });
    expectedTotal = result.total;
    collected.push(...result.list.map((asset) => `${asset.assetType}:${asset.id}`));
    hasMore = result.hasMore;
    pageNum += 1;
  }
  assert.ok(expectedTotal > 2, 'fixture must span multiple Extension pages');
  assert.equal(collected.length, expectedTotal);
  assert.equal(new Set(collected).size, expectedTotal);
  assert.equal(hasMore, false);
  console.log('PASS Extension assets use the same stable page contract');
} finally {
  await mockServer.close();
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';

const storage = new Map();
const previousWindow = globalThis.window;
const legacyAgentRecord = {
  id: 'legacy-custom-agent',
  name: '旧版自定义 Agent',
  description: '验证 v4 用户数据在新增产品资产后仍被保留。',
  level: '产品级',
  product: 'legacy-product',
  owner: '历史用户 w39999991',
  department: '持续交付组',
  developOwner: '历史开发者 w39999992',
  developOwnerDepartment: '持续交付组',
  plannedCompleteDate: '2026-09-01',
  status: '已完成',
  versions: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
storage.set(
  'skill-market-harness-capability-planning-v4-agent',
  JSON.stringify({
    catalog: [legacyAgentRecord],
    planning: [],
    catalogSeed: 3000,
    planningSeed: 3000,
  }),
);
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const { harnessAssetStatus } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementTypes.ts',
  );
  const api = getHarnessAssetApi();
  const baseScope = {
    userId: 'harness-product-assets-test',
    userName: 'Harness Product Assets Test',
    department: {
      id: '持续交付组',
      code: '持续交付组',
      name: '持续交付组',
      path: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'],
    },
    product: {
      id: 'offering-harness-pipeline',
      name: 'Harness 流水线平台',
      departmentPath: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'],
    },
  };

  const expectations = [
    { type: 'Agent', minimum: 3 },
    { type: 'Skill', minimum: 4 },
    { type: 'Command', minimum: 3 },
    { type: 'Extension', minimum: 2 },
  ];
  for (const expectation of expectations) {
    const result = await api.queryAssets(
      { ...baseScope, assetType: expectation.type },
      { pageNum: 1, pageSize: 24 },
    );
    assert.ok(
      result.list.length >= expectation.minimum,
      `${expectation.type} should expose at least ${expectation.minimum} Harness product assets`,
    );
    assert.equal(
      result.list.every(
        (asset) =>
          asset.assetType === expectation.type &&
          asset.productId === baseScope.product.id &&
          asset.productName === baseScope.product.name,
      ),
      true,
      `${expectation.type} assets must stay inside the selected product scope`,
    );
    assert.equal(
      result.list.some(
        (asset) => harnessAssetStatus(asset) === '已发布' && asset.versions.length > 0,
      ),
      true,
      `${expectation.type} should include a published versioned example`,
    );
  }
  console.log('PASS Harness 流水线平台 exposes scoped Agent, Skill, Command and Extension assets');

  const migratedAgentState = JSON.parse(
    storage.get('skill-market-harness-capability-planning-v5-agent'),
  );
  assert.equal(
    migratedAgentState.catalog.some((record) => record.id === legacyAgentRecord.id),
    true,
    'v4 custom Agent records must survive the seed migration',
  );
  assert.equal(
    migratedAgentState.catalog.some((record) => record.product === 'Harness 流水线平台'),
    true,
    'the migration must append the new Harness product seeds',
  );
  console.log('PASS Agent mock storage migrates v4 user data and appends the new product seeds');
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

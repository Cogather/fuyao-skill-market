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
const requests = { Agent: [], Skill: [], Command: [] };
const totals = { Agent: 5, Skill: 5, Command: 5 };
const fieldByType = {
  Agent: ['agentName', 'agentDescription'],
  Skill: ['skillName', 'skillDescription'],
  Command: ['commandName', 'commandDescription'],
};
let catalogResponseOverride = null;

function responseFor(type, params) {
  requests[type].push({ ...params });
  if (catalogResponseOverride) return catalogResponseOverride(type, params);
  const pageNum = Number(params.pageNum);
  const pageSize = Number(params.pageSize);
  const start = (pageNum - 1) * pageSize;
  const [nameField, descriptionField] = fieldByType[type];
  const total = totals[type];
  const data = Array.from({ length: total }, (_, index) => ({
    id: `${type.toLowerCase()}-${index + 1}`,
    [nameField]: `${type} ${index + 1}`,
    [descriptionField]: `${type} description ${index + 1}`,
    dimType: '产品级',
    dimCode: 'product-1',
    dimName: 'harness-pipeline',
    ownerName: 'Owner',
    ownerId: 'u-1',
    developOwnerName: 'Developer',
    developOwnerId: 'u-2',
    status: '已完成',
    versions: [],
    updatedAt: `2026-09-0${index + 1} 10:00:00`,
  })).slice(start, start + pageSize);
  return success(data, total);
}

try {
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  skillBaseService.queryHarnessDeptProducts = async () =>
    success([
      {
        offeringId: 'product-1',
        offeringName: 'harness-pipeline',
        planningDeptName: '持续交付组',
      },
    ]);
  skillBaseService.queryAgentMasterManagement = async (params) => responseFor('Agent', params);
  skillBaseService.querySkillMasterManagement = async (params) => responseFor('Skill', params);
  skillBaseService.queryCommandMasterManagement = async (params) => responseFor('Command', params);

  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const baseScope = {
    userId: 'asset-tester',
    userName: 'Asset Tester',
    department: {
      id: 'dept-1',
      code: 'dept-1',
      name: '持续交付组',
      path: ['平台产品线', '持续交付组'],
    },
    product: {
      id: 'product-1',
      name: 'harness-pipeline',
      departmentPath: ['平台产品线', '持续交付组'],
    },
  };

  for (const assetType of ['Agent', 'Skill', 'Command']) {
    const first = await api.queryAssets({ ...baseScope, assetType }, { pageNum: 1, pageSize: 2 });
    assert.equal(first.list.length, 2, `${assetType} first page size`);
    assert.equal(first.total, 5, `${assetType} total`);
    assert.equal(first.hasMore, true, `${assetType} should expose another page`);
    assert.equal(requests[assetType][0].pageNum, 1);
    assert.equal(requests[assetType][0].pageSize, 2);

    const second = await api.queryAssets({ ...baseScope, assetType }, { pageNum: 2, pageSize: 2 });
    assert.deepEqual(
      second.list.map((asset) => asset.id),
      [`${assetType.toLowerCase()}-3`, `${assetType.toLowerCase()}-4`],
    );
    assert.equal(second.hasMore, true);
    assert.equal(requests[assetType][1].pageNum, 2);
    assert.equal(requests[assetType][1].pageSize, 2);

    const third = await api.queryAssets({ ...baseScope, assetType }, { pageNum: 3, pageSize: 2 });
    assert.deepEqual(
      third.list.map((asset) => asset.id),
      [`${assetType.toLowerCase()}-5`],
    );
    assert.equal(third.hasMore, false);
    assert.equal(requests[assetType][2].pageNum, 3);
    assert.equal(requests[assetType][2].pageSize, 2);
  }

  totals.Agent = 4;
  requests.Agent.length = 0;
  const exactLastPage = await api.queryAssets(
    { ...baseScope, assetType: 'Agent' },
    { pageNum: 2, pageSize: 2 },
  );
  assert.equal(exactLastPage.list.length, 2);
  assert.equal(exactLastPage.total, 4);
  assert.equal(exactLastPage.hasMore, false, 'a full final page must stop pagination');

  const edgeCaseFailures = [];
  const captureEdgeCase = (label, assertion) => {
    try {
      assertion();
    } catch (error) {
      edgeCaseFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const multiScopeResponse = (type, params) => {
    const [nameField, descriptionField] = fieldByType[type];
    const isProductScope = params.dimType === '产品级';
    const scopeId = isProductScope ? 'product' : 'department';
    return success(
      [
        {
          id: `shared-${scopeId}`,
          [nameField]: `${type} ${scopeId}`,
          [descriptionField]: `${type} ${scopeId} description`,
          dimType: isProductScope ? '产品级' : '部门级',
          dimCode: isProductScope ? 'product-1' : 'dept-1',
          dimName: isProductScope ? 'harness-pipeline' : '持续交付组',
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
  for (const assetType of ['Agent', 'Skill', 'Command']) requests[assetType].length = 0;
  catalogResponseOverride = multiScopeResponse;
  skillBaseService.querySceneAndBindingPlanningItems = async () => success([], 0);
  skillBaseService.queryPublishedHistoryList = async () => success([], 0);

  const combinedPage = await api.queryAssets(
    { ...baseScope, product: undefined, assetType: 'all' },
    { pageNum: 1, pageSize: 4 },
  );
  captureEdgeCase('combined department page respects requested pageSize', () => {
    assert.ok(
      combinedPage.list.length <= 4,
      `expected at most 4 assets, received ${combinedPage.list.length}`,
    );
  });
  captureEdgeCase('combined page deduplicates by asset type plus id', () => {
    assert.equal(
      new Set(combinedPage.list.map((asset) => `${asset.assetType}:${asset.id}`)).size,
      combinedPage.list.length,
    );
    assert.ok(
      new Set(combinedPage.list.map((asset) => asset.id)).size < combinedPage.list.length,
      'assets with the same raw id but different types must both be retained',
    );
  });

  const rowsWithoutTotal = [
    ['unknown-total-1', 'unknown-total-2'],
    ['unknown-total-2', 'unknown-total-1'],
    ['unknown-total-3'],
  ];
  const unknownRequestStart = requests.Agent.length;
  catalogResponseOverride = (type, params) => {
    assert.equal(type, 'Agent');
    const pageNum = Number(params.pageNum);
    const data = (rowsWithoutTotal[pageNum - 1] ?? []).map((id) => ({
      id,
      agentName: id,
      agentDescription: `${id} description`,
      dimType: '产品级',
      dimCode: 'product-1',
      dimName: 'harness-pipeline',
      ownerName: 'Owner',
      ownerId: 'u-1',
      developOwnerName: 'Developer',
      developOwnerId: 'u-2',
      status: '已完成',
      versions: [],
      updatedAt: '2026-09-06 10:00:00',
    }));
    return { meta: { success: true, message: '' }, data };
  };
  const unknownTotalFirst = await api.queryAssets(
    { ...baseScope, assetType: 'Agent' },
    { pageNum: 1, pageSize: 2 },
  );
  const unknownTotalSecond = await api.queryAssets(
    { ...baseScope, assetType: 'Agent' },
    { pageNum: 2, pageSize: 2 },
  );
  captureEdgeCase('a full page without total keeps probing', () => {
    assert.equal(unknownTotalFirst.list.length, 2);
    assert.equal(unknownTotalFirst.hasMore, true);
  });
  captureEdgeCase('a short page without total stops probing', () => {
    assert.equal(unknownTotalSecond.list.length, 1);
    assert.equal(unknownTotalSecond.hasMore, false);
    assert.deepEqual(
      requests.Agent.slice(unknownRequestStart).map((request) => request.pageNum),
      [1, 2, 3],
      'a duplicate-only backend page must be skipped within the same load chain',
    );
  });

  let failCommandPageTwo = true;
  catalogResponseOverride = (type, params) => {
    const pageNum = Number(params.pageNum);
    if (type === 'Command' && pageNum === 2 && failCommandPageTwo) {
      failCommandPageTwo = false;
      throw new Error('simulated Command page failure');
    }
    const [nameField, descriptionField] = fieldByType[type];
    return success(
      pageNum <= 3
        ? [
            {
              id: `${type.toLowerCase()}-retry-${pageNum}`,
              [nameField]: `${type} retry ${pageNum}`,
              [descriptionField]: `${type} retry ${pageNum} description`,
              dimType: '产品级',
              dimCode: 'product-1',
              dimName: 'harness-pipeline',
              ownerName: 'Owner',
              ownerId: 'u-1',
              developOwnerName: 'Developer',
              developOwnerId: 'u-2',
              status: '已完成',
              versions: [],
              updatedAt: `2026-09-0${pageNum} 10:00:00`,
            },
          ]
        : [],
      3,
    );
  };
  skillBaseService.querySceneAndBindingPlanningItems = async () =>
    success([
      {
        firstScene: 'Retry',
        secondScenes: [
          {
            secondScene: 'retry-extension',
            publishable: true,
            components: { skills: [], commands: [], agents: [] },
          },
        ],
      },
    ]);

  const retryScope = { ...baseScope, assetType: 'all' };
  await api.queryAssets(retryScope, { pageNum: 1, pageSize: 4 });
  await assert.rejects(
    api.queryAssets(retryScope, { pageNum: 2, pageSize: 4 }),
    /simulated Command page failure/,
  );
  const retriedSecondPage = await api.queryAssets(retryScope, { pageNum: 2, pageSize: 4 });
  captureEdgeCase('a failed multi-source page is rebuilt before retrying', () => {
    const retryIds = new Set(retriedSecondPage.list.map((asset) => asset.id));
    assert.ok(retryIds.has('agent-retry-2'));
    assert.ok(retryIds.has('skill-retry-2'));
    assert.ok(retryIds.has('command-retry-2'));
  });

  if (edgeCaseFailures.length > 0) {
    assert.fail(`asset pagination edge cases failed:\n${edgeCaseFailures.join('\n')}`);
  }

  console.log('PASS asset pagination reaches Agent, Skill and Command query endpoints');
} finally {
  await server.close();
}

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

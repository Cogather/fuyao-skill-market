import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const atomicPublish = await server.ssrLoadModule(
    '/src/services/skillMarket/atomicAssetPublishHttp.ts',
  );

  const scope = {
    userId: 'mock-user',
    userName: 'Mock 发布人',
    department: {
      id: 'mock-root',
      code: 'mock-root',
      name: '',
      path: [
        '联调工具部',
        '评审小组',
        '日志工具组',
        '项目管理部',
        '发布工具组',
        'SRE团队',
        '变更分析组',
        '质量工具组',
        'SQL治理组',
        '需求分析组',
        '体验设计部',
        '测试部门',
      ],
    },
  };

  const api = getHarnessAssetApi();
  for (const assetType of ['Agent', 'Skill', 'Command']) {
    const page = await api.queryAssets({ ...scope, assetType }, { pageNum: 1, pageSize: 10 });
    assert.ok(page.list.length > 3, `${assetType} mock list should contain contrasting rows`);
    assert.deepEqual(
      page.list.slice(0, 4).map((asset) => asset.canPublish === true),
      [true, true, true, false],
      `${assetType} should expose publish only on its first three cards`,
    );
    page.list.slice(0, 3).forEach((asset) => {
      assert.ok(asset.latestVersion, `${assetType} publishable rows need latestVersion`);
      assert.ok(asset.dimType, `${assetType} publishable rows need dimType`);
      assert.ok(asset.dimCode, `${assetType} publishable rows need dimCode`);
      assert.ok(asset.dimName, `${assetType} publishable rows need dimName`);
    });
  }

  const skillPage = await api.queryAssets(
    { ...scope, assetType: 'Skill' },
    { pageNum: 1, pageSize: 10 },
  );
  const asset = skillPage.list[0];
  const organizations = await atomicPublish.queryAtomicPublishOrganizations(asset, scope.userId);
  assert.ok(organizations.length >= 2, 'mock publishing should offer target organizations');

  const beforeRetry = await atomicPublish.queryAtomicAssetPublishHistory({
    assetType: 'SKILL',
    assetName: asset.name,
  });
  const failed = beforeRetry.records.find((record) => atomicPublish.canRetryAtomicPublish(record));
  assert.ok(failed, 'mock history should include a retryable independent publish failure');
  await atomicPublish.retryAtomicAssetPublish(failed.id, scope.userId);
  const afterRetry = await atomicPublish.queryAtomicAssetPublishHistory({
    assetType: 'SKILL',
    assetName: asset.name,
  });
  assert.equal(
    afterRetry.records.find((record) => record.id === failed.id)?.publishStatus,
    '进行中',
  );

  const result = await atomicPublish.publishAtomicAsset({
    asset,
    organizationCode: organizations[0].id,
    userId: scope.userId,
    userName: scope.userName,
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
  const submitted = await atomicPublish.queryAtomicAssetPublishHistory({
    batchId: result.batchId,
  });
  assert.equal(submitted.records.length, 1);
  assert.equal(submitted.records[0].publishStatus, '进行中');
  assert.equal(submitted.records[0].targetOrgCode, organizations[0].id);

  console.log(
    'PASS atomic asset mock publishing supports the first three cards and full demo flow',
  );
} finally {
  await server.close();
}

import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true }, data });
try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const calls = [];
  let rows = [];
  let deleteResponse = success(null);
  for (const client of ['harnessAgent', 'harnessCommand', 'harnessSkill']) {
    request[client] = async (config) => {
      calls.push({ client, ...config });
      return config.method === 'delete' ? deleteResponse : success(rows);
    };
  }
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  assert.equal(typeof api.deleteAsset, 'function', 'asset API exposes deletion');
  for (const type of ['Agent', 'Command', 'Skill']) {
    const asset = {
      id: 'component-id',
      assetType: type,
      name: '示例资产',
      category: '产品级/产品 A',
    };
    const record = {
      id: `master/${type}`,
      [`${type.toLowerCase()}Name`]: asset.name,
      dimType: '产品级',
      dimCode: 'product-a',
      dimName: '产品 A',
    };
    rows = [{ ...record, id: 'other-scope', dimName: '其他产品' }, record];
    calls.length = 0;
    await api.deleteAsset({ asset, userId: ' user-1 ' });
    assert.deepEqual(calls.at(-1), {
      client: `harness${type}`,
      url: `/management/delete/master%2F${type}`,
      method: 'delete',
      params: { userId: 'user-1' },
    });
    assert.equal(calls[0].params.dimName, '产品 A');
    assert.equal(calls[0].params.keyword, '示例资产');

    for (const [records, category, expected] of [
      [[record, { ...record, id: 'duplicate' }], asset.category, /多个同名/],
      [[], asset.category, /未找到/],
      [[record], '', /缺少资产归属/],
    ]) {
      rows = records;
      calls.length = 0;
      await assert.rejects(
        api.deleteAsset({ asset: { ...asset, category }, userId: 'user-1' }),
        expected,
      );
      assert.ok(
        calls.every((call) => call.method !== 'delete'),
        'unresolved target must never delete',
      );
    }
    rows = [record];
    deleteResponse = { meta: { success: false, message: '已被引用' } };
    await assert.rejects(api.deleteAsset({ asset, userId: 'user-1' }), /已被引用/);
    deleteResponse = success(null);
    calls.length = 0;
    await assert.rejects(api.deleteAsset({ asset, userId: ' ' }), /当前用户/);
    assert.equal(calls.length, 0);
  }
  await assert.rejects(
    api.deleteAsset({ asset: { assetType: 'Extension' }, userId: 'user-1' }),
    /Extension/,
  );
  console.log(
    'Asset deletion: endpoint, target scope, ambiguity, missing target, errors and user checks passed.',
  );
  const { deleteHarnessAsset } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetDeletionService.ts',
  );
  const { listSkillMasterRecords, createSkillMasterRecord } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillMasterManagementService.ts',
  );
  const { queryMockCapabilityCatalog } = await server.ssrLoadModule(
    '/src/services/skillMarket/harnessCapabilityPlanningMock.ts',
  );
  const { exportAllSkillPlanningList } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillPlanningMockService.ts',
  );
  const planning = await exportAllSkillPlanningList();
  createSkillMasterRecord({
    name: 'delete-test-skill',
    description: '临时删除测试资产',
    level: '部门级',
    product: '',
    owner: '测试用户 u1',
    department: '测试部门',
    developOwner: '测试用户 u1',
    plannedCompleteDate: '2026-10-01',
    status: '未开始',
  });
  for (const type of ['Agent', 'Command', 'Skill']) {
    const list = () =>
      type === 'Skill' ? listSkillMasterRecords() : queryMockCapabilityCatalog(type.toLowerCase());
    const records = await list();
    const record = records.find(
      (item) =>
        !item.referenceCount &&
        (type !== 'Skill' || !planning.some((plan) => plan.skillId === item.id)),
    );
    assert.ok(record, `${type} has an unreferenced fixture`);
    await deleteHarnessAsset({ asset: { ...record, assetType: type }, userId: '' }, 'mock');
    assert.ok(
      !(await list()).some((item) => item.id === record.id),
      `${type} mock deletion survives a list reload`,
    );
    const referenced = records.find((item) => item.referenceCount > 0);
    if (referenced && type !== 'Skill') {
      await assert.rejects(
        deleteHarnessAsset({ asset: { ...referenced, assetType: type }, userId: '' }, 'mock'),
        /引用/,
      );
      assert.ok((await list()).some((item) => item.id === referenced.id));
    }
  }
  console.log('Mock asset deletion persists across reloads and preserves referenced fixtures.');
} finally {
  await server.close();
}

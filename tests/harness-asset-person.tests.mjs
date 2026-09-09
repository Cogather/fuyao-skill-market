import assert from 'node:assert/strict';
import { createServer } from 'vite';

const storage = new Map();
const previousWindow = globalThis.window;
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
};
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { updateHarnessAssetPerson } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetPersonManagementService.ts',
  );
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const { listSkillMasterRecords } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillMasterManagementService.ts',
  );
  const { queryMockCapabilityCatalog } = await server.ssrLoadModule(
    '/src/services/skillMarket/harnessCapabilityPlanningMock.ts',
  );
  const person = {
    id: 'new-id',
    sAMAccountName: 'new-id',
    chName: '新人员',
    label: '新人员 new-id',
    deptName: '另一个部门',
  };

  for (const type of ['Skill', 'Agent', 'Command']) {
    const listRecords = () =>
      type === 'Skill' ? listSkillMasterRecords() : queryMockCapabilityCatalog(type.toLowerCase());
    const original = (await listRecords())[0];
    const asset = { id: original.id, assetType: type };
    for (const [field, recordField] of [
      ['owner', 'owner'],
      ['developer', 'developOwner'],
    ]) {
      const before = (await listRecords()).find((item) => item.id === original.id);
      assert.equal(
        await updateHarnessAssetPerson({ asset, field, person, userId: '' }, 'mock'),
        person.label,
      );
      const after = (await listRecords()).find((item) => item.id === original.id);
      assert.deepEqual(after, {
        ...before,
        [recordField]: person.label,
        updatedAt: after.updatedAt,
      });
      const key =
        type === 'Skill'
          ? 'skill-market-master-records-v5'
          : `skill-market-harness-capability-planning-v4-${type.toLowerCase()}`;
      const stored = JSON.parse(storage.get(key));
      const persisted = (Array.isArray(stored) ? stored : stored.catalog).find(
        (item) => item.id === original.id,
      );
      assert.equal(persisted[recordField], person.label);
    }
  }
  console.log(
    'PASS Mock person edits persist without changing asset ownership scope or other fields',
  );

  const queries = [];
  const updates = [];
  const target = {
    id: 42,
    commandName: 'dept-command',
    dimType: '部门级',
    dimName: '资产部门',
    dimCode: 'asset-dept-code',
  };
  skillBaseService.queryCommandMasterManagement = async (body) => {
    queries.push(body);
    const rows =
      body.pageNum === 1
        ? Array.from({ length: 200 }, (_, i) => ({
            ...target,
            id: `other-${i}`,
            dimName: '其他部门',
          }))
        : [target];
    return { meta: { success: true, number: rows.length }, data: rows };
  };
  skillBaseService.updateCommandMasterManagement = async (body, params) => {
    updates.push({ body, params });
    return { meta: { success: true } };
  };
  const input = {
    asset: {
      id: 'frontend-key',
      assetType: 'Command',
      name: 'dept-command',
      category: '部门级/资产部门',
    },
    field: 'owner',
    person,
    userId: 'user',
  };
  await updateHarnessAssetPerson(input, 'http');
  assert.equal(queries.length, 2, 'a full page must not treat meta.number as the total');
  assert.deepEqual(updates, [
    {
      body: { id: 42, ownerName: person.chName, ownerId: person.id },
      params: {
        userId: 'user',
        dimType: '部门级',
        dimName: '资产部门',
        dimCode: 'asset-dept-code',
      },
    },
  ]);
  console.log(
    'PASS department-level edit resolves later pages and preserves the numeric backend ID',
  );

  updates.length = 0;
  skillBaseService.queryCommandMasterManagement = async () => ({
    meta: { success: true },
    data: [],
  });
  await assert.rejects(updateHarnessAssetPerson(input, 'http'), /未找到对应资产/);
  skillBaseService.queryCommandMasterManagement = async () => ({
    meta: { success: false, message: '无法查询资产' },
  });
  await assert.rejects(updateHarnessAssetPerson(input, 'http'), /无法查询资产/);
  assert.equal(updates.length, 0);
  console.log('PASS missing assets and failed queries never submit updates');
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

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
  const { updateHarnessAssetDetails: update } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetDetailEditingService.ts',
  );
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const { getMockSkillMasterManagementRecord } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseServiceMock.ts',
  );
  const { queryMockCapabilityCatalog } = await server.ssrLoadModule(
    '/src/services/skillMarket/harnessCapabilityPlanningMock.ts',
  );
  const person = {
    id: ' u9 ',
    chName: ' 新人员 ',
    sAMAccountName: 'u9',
    label: '新人员 u9',
    deptName: '其他部门',
  };
  for (const type of ['Skill', 'Agent', 'Command']) {
    const calls = [];
    const asset = {
      id: 'frontend-key',
      assetType: type,
      name: 'old-name',
      category: '部门级/研发部',
      dimCode: 'record-dept',
    };
    const input = {
      asset,
      userId: ' user ',
      name: ' renamed ',
      description: ' new description ',
      owner: person,
      developer: person,
    };
    let failUpdate = false;
    let wrongScope = false;
    skillBaseService[`query${type}MasterManagement`] = async (query) => {
      assert.equal(query.keyword, 'old-name');
      assert.equal(query.dimCode, 'record-dept');
      return {
        meta: { success: true },
        data: [
          {
            id: 42,
            [`${type.toLowerCase()}Name`]: asset.name,
            dimType: '部门级',
            dimCode: wrongScope ? 'wrong' : 'record-dept',
            dimName: '研发部',
          },
        ],
      };
    };
    skillBaseService[`update${type}MasterManagement`] = async (body, params) => {
      calls.push({ body, params });
      return { meta: { success: !failUpdate, message: '后端拒绝保存' } };
    };
    assert.deepEqual(await update(input, 'http'), {
      name: 'renamed',
      description: 'new description',
      owner: '新人员 u9',
      developer: '新人员 u9',
    });
    assert.deepEqual(calls, [
      {
        body: {
          id: 42,
          [`${type.toLowerCase()}Name`]: 'renamed',
          [`${type.toLowerCase()}Description`]: 'new description',
          ownerName: '新人员',
          ownerId: 'u9',
          developOwnerName: '新人员',
          developOwnerId: 'u9',
        },
        params: { userId: 'user', dimType: '部门级', dimCode: 'record-dept', dimName: '研发部' },
      },
    ]);
    assert.equal(
      asset.name,
      'old-name',
      'service leaves displayed state untouched until caller handles success',
    );
    failUpdate = true;
    await assert.rejects(update(input, 'http'), /后端拒绝保存/);
    const previousCalls = calls.length;
    await assert.rejects(update({ ...input, owner: null }, 'http'), /选择有效/);
    await assert.rejects(update({ ...input, name: ' ' }, 'http'), /名称/);
    wrongScope = true;
    await assert.rejects(update(input, 'http'), /未找到对应资产/);
    assert.equal(calls.length, previousCalls, 'invalid edits never submit updates');
    wrongScope = false;
    failUpdate = false;
    for (const name of ['Invalid Name', '中文名称', 'a'.repeat(65)]) {
      await assert.rejects(update({ ...input, name }, 'http'), /名称仅允许/);
    }
    skillBaseService[`query${type}MasterManagement`] = async () => ({
      meta: { success: true },
      data: ['other-dept', 'record-dept'].map((dimCode, i) => ({
        id: i === 0 ? 99 : 42,
        [`${type.toLowerCase()}Name`]: asset.name,
        dimType: '部门级',
        dimName: '研发部',
        dimCode,
      })),
    });
    await update(input, 'http');
    assert.equal(calls.at(-1).body.id, 42, 'list dimension code disambiguates names');
    await assert.rejects(
      update({ ...input, asset: { ...asset, dimCode: undefined } }, 'http'),
      /多个同名/,
    );
    skillBaseService[`query${type}MasterManagement`] = async () => ({
      meta: { success: true },
      data: [
        {
          id: 42,
          [`${type.toLowerCase()}Name`]: asset.name,
          dimType: '产品级',
          dimName: 'MyProduct',
          dimCode: 'record-dept',
        },
      ],
    });
    const productInput = { ...input, asset: { ...asset, category: '产品级/MyProduct' } };
    await assert.rejects(update(productInput, 'http'), /需以产品名称/);
    await assert.rejects(update({ ...productInput, name: 'myproduct-' }, 'http'), /后补充/);
    await update({ ...productInput, name: 'myproduct-renamed' }, 'http');
    await update({ ...productInput, name: asset.name }, 'http');

    const records = () =>
      type === 'Skill'
        ? [getMockSkillMasterManagementRecord('504')]
        : queryMockCapabilityCatalog(type.toLowerCase());
    const before = (await records())[0];
    const mockName = 'harness-pipeline-renamed';
    for (const name of ['Invalid Name', '中文名称', 'a'.repeat(65)]) {
      await assert.rejects(
        update({ ...input, asset: { ...asset, id: before.id }, name }, 'mock'),
        /名称仅允许/,
      );
    }
    await update(
      { ...input, name: mockName, asset: { ...asset, id: before.id }, developer: undefined },
      'mock',
    );
    const after = (await records()).find((record) => record.id === before.id);
    assert.deepEqual(after, {
      ...before,
      ...(type === 'Skill'
        ? {
            skillName: mockName,
            skillDescription: 'new description',
            ownerName: '新人员',
            ownerId: 'u9',
          }
        : { name: mockName, description: 'new description', owner: '新人员 u9' }),
      updatedAt: after.updatedAt,
    });
    assert.ok(
      [...storage.values()].some((value) =>
        JSON.stringify(JSON.parse(value)).includes('new description'),
      ),
    );
  }
  console.log(
    'PASS all asset types save a single update with authoritative ID/scope, reject invalid edits and persist Mock fields without changing versions or scope',
  );
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

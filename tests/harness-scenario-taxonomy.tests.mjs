import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});

let failures = 0;

async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

function success(data) {
  return { meta: { success: true, message: '' }, data };
}

function failure(message) {
  return { meta: { success: false, message }, data: null };
}

function scope(suffix) {
  return {
    departmentName: `研发部-${suffix}`,
    deptCode: `D-${suffix}`,
    userId: 'tester',
    offeringId: `P-${suffix}`,
    offeringName: `产品-${suffix}`,
  };
}

try {
  const adapter = await server.ssrLoadModule(
    '/src/services/skillMarket/harnessScenarioTaxonomyService.ts',
  );
  const base = await server.ssrLoadModule('/src/services/skillMarket/skillBaseService.ts');
  const sync = await server.ssrLoadModule(
    '/src/services/skillMarket/harnessConfigurationSyncService.ts',
  );

  await test('HTTP rows keep the same IDs when server order changes', async () => {
    const testScope = scope('reorder');
    let rows = [
      {
        firstScene: '研发提效',
        secondScene: '代码生成',
        tags: ['AI'],
        sort: 2,
        referenceCount: 0,
      },
      {
        firstScene: '质量保障',
        secondScene: '测试生成',
        tags: [],
        sort: 1,
        referenceCount: 0,
      },
    ];
    let requestContext;
    base.skillBaseService.getSceneOptionGroups = async (context) => {
      requestContext = context;
      return success(rows);
    };

    const first = await adapter.loadScenarioRecords(testScope);
    const firstIds = Object.fromEntries(first.map((record) => [record.name, record.id]));
    rows = [rows[1], rows[0]];
    const reordered = await adapter.loadScenarioRecords(testScope);

    assert.deepEqual(
      requestContext,
      {
        userId: 'tester',
        dimType: '产品级',
        dimCode: 'P-reorder',
        dimName: '产品-reorder',
      },
      'the product dimension must be sent explicitly',
    );
    assert.deepEqual(
      Object.fromEntries(reordered.map((record) => [record.name, record.id])),
      firstIds,
    );
  });

  await test('a rejected scene save does not commit a renamed identity', async () => {
    const testScope = scope('save-rejected');
    let rows = [
      {
        firstScene: '研发提效',
        secondScene: '代码生成',
        tags: [],
        sort: 1,
        referenceCount: 0,
      },
    ];
    base.skillBaseService.getSceneOptionGroups = async () => success(rows);
    const loaded = await adapter.loadScenarioRecords(testScope);
    const originalChild = loaded.find((record) => record.name === '代码生成');
    assert.ok(originalChild);
    base.skillBaseService.refreshSceneOptionGroups = async () => failure('拒绝保存');

    await assert.rejects(
      () =>
        adapter.saveScenarioRecords(
          testScope,
          loaded.map((record) =>
            record.id === originalChild.id ? { ...record, name: '代码助手' } : record,
          ),
        ),
      /拒绝保存/,
    );

    rows = [
      {
        firstScene: '研发提效',
        secondScene: '代码助手',
        tags: [],
        sort: 1,
        referenceCount: 0,
      },
    ];
    const externallyRenamed = await adapter.loadScenarioRecords(testScope);
    assert.notEqual(
      externallyRenamed.find((record) => record.name === '代码助手')?.id,
      originalChild.id,
    );
  });

  await test('a committed rename keeps its ID when the readback fails', async () => {
    const testScope = scope('readback-failed');
    let response = success([
      {
        firstScene: '研发提效',
        secondScene: '代码生成',
        tags: [],
        sort: 1,
        referenceCount: 0,
      },
    ]);
    base.skillBaseService.getSceneOptionGroups = async () => response;
    base.skillBaseService.refreshSceneOptionGroups = async () => success(null);
    const loaded = await adapter.loadScenarioRecords(testScope);
    const originalChild = loaded.find((record) => record.name === '代码生成');
    assert.ok(originalChild);
    const renamed = loaded.map((record) =>
      record.id === originalChild.id ? { ...record, name: '代码助手' } : record,
    );
    const revisionBeforeSave = sync.harnessConfigurationRevision.value;
    response = failure('刷新读取超时');

    await assert.rejects(
      () => adapter.saveScenarioRecords(testScope, renamed),
      (error) => {
        assert.match(error.message, /场景已保存，但刷新最新配置失败/);
        assert.match(error.message, /刷新读取超时/);
        return true;
      },
    );
    assert.equal(sync.harnessConfigurationRevision.value, revisionBeforeSave + 1);

    response = success([
      {
        firstScene: '研发提效',
        secondScene: '代码助手',
        tags: [],
        sort: 1,
        referenceCount: 0,
      },
    ]);
    const refreshed = await adapter.loadScenarioRecords(testScope);
    assert.equal(refreshed.find((record) => record.name === '代码助手')?.id, originalChild.id);
  });

  await test('a failed HTTP tag envelope rejects instead of clearing tags', async () => {
    const testScope = scope('tag-rejected');
    const parent = {
      id: 'scene-parent',
      parentId: null,
      name: '研发提效',
      sort: 1,
      status: 'enabled',
      skillCount: 0,
      tags: ['旧标签'],
    };
    base.skillBaseService.saveSceneTags = async () => failure('标签保存被拒绝');

    await assert.rejects(
      () => adapter.saveScenarioTagBindings(testScope, parent, ['新标签']),
      /标签保存被拒绝/,
    );
  });

  await test('a successful HTTP tag save returns normalized requested tags', async () => {
    const testScope = scope('tag-success');
    const parent = {
      id: 'scene-parent',
      parentId: null,
      name: '研发提效',
      sort: 1,
      status: 'enabled',
      skillCount: 0,
      tags: [],
    };
    let requestBody;
    let requestContext;
    base.skillBaseService.saveSceneTags = async (body, context) => {
      requestBody = body;
      requestContext = context;
      return success(null);
    };

    const saved = await adapter.saveScenarioTagBindings(testScope, parent, [
      'AI 提效',
      ' AI 提效 ',
      '',
      '研发效能',
    ]);

    assert.deepEqual(saved, ['AI 提效', '研发效能']);
    assert.deepEqual(requestBody, {
      bindings: [{ firstScene: '研发提效', tags: ['AI 提效', '研发效能'] }],
    });
    assert.deepEqual(requestContext, {
      userId: 'tester',
      dimType: '产品级',
      dimCode: 'P-tag-success',
    });
  });
} finally {
  await server.close();
}

process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';
const mockServer = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});
try {
  const adapter = await mockServer.ssrLoadModule(
    '/src/services/skillMarket/harnessScenarioTaxonomyService.ts',
  );
  const tags = await mockServer.ssrLoadModule('/src/services/skillMarket/sceneTagService.ts');

  await test('mock deletion clears the removed L1 scene tag binding', async () => {
    const testScope = {
      departmentName: '标签删除测试部门',
      deptCode: 'D-mock-delete',
      userId: 'tester',
      offeringId: 'P-mock-delete',
      offeringName: '产品-mock-delete',
    };
    const loaded = await adapter.loadScenarioRecords(testScope);
    const added = {
      id: 'scene-tag-delete-regression',
      parentId: null,
      name: '待删除标签场景',
      sort: loaded.filter((record) => record.parentId === null).length + 1,
      status: 'enabled',
      skillCount: 0,
      tags: [],
    };
    await adapter.saveScenarioRecords(testScope, [...loaded, added]);
    await adapter.saveScenarioTagBindings(testScope, added, ['待清理标签']);
    assert.deepEqual(await tags.getSceneTags(added.id, testScope.departmentName), ['待清理标签']);

    const beforeDelete = await adapter.loadScenarioRecords(testScope);
    await adapter.saveScenarioRecords(
      testScope,
      beforeDelete.filter((record) => record.id !== added.id),
    );

    assert.deepEqual(await tags.getSceneTags(added.id, testScope.departmentName), []);
  });
} finally {
  await mockServer.close();
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`${failures} taxonomy adapter regression test(s) failed`);
} else {
  console.log('All taxonomy adapter regression tests passed');
}

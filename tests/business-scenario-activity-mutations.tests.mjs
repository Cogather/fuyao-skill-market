import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });
const success = (data) => ({ meta: { isSuccess: true }, data });
const clone = (value) => structuredClone(value);
let failed = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`, error);
  }
}
try {
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const repository = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignRepository.ts',
  );
  const scope = {
    userId: 'designer',
    dimType: '产品级',
    dimCode: 'p1',
    dimName: 'demo',
    firstScene: '研发',
    secondScene: '代码生成',
  };
  const dimensions = {
    userId: scope.userId,
    dimType: scope.dimType,
    dimCode: scope.dimCode,
    dimName: scope.dimName,
  };
  const pool = [
    { assetType: 'Skill', assetName: 'demo-skill' },
    { assetType: 'Agent', assetName: 'demo-agent' },
  ];
  function fixture({ parent = true } = {}) {
    let rows = [
      ...(parent
        ? [{ activityNodeName: '编码', subActivityNodeName: null, sort: 0, boundAssets: [] }]
        : []),
      { activityNodeName: '编码', subActivityNodeName: '生成', sort: 1, boundAssets: clone(pool) },
      {
        activityNodeName: '编码',
        subActivityNodeName: '验证',
        sort: 2,
        boundAssets: [clone(pool[0])],
      },
      {
        activityNodeName: '交付',
        subActivityNodeName: '发布',
        sort: 3,
        boundAssets: [clone(pool[1])],
      },
    ];
    const calls = [];
    const detail = () => ({
      flowName: '流程',
      flowDescription: '',
      sceneExtensionCode: 'demo-code',
      secondSceneDescription: '说明',
      commands: [],
      assetPool: clone(pool),
      steps: [],
      nextStep: 0,
      allDone: false,
      stages: [...new Set(rows.map((row) => row.activityNodeName))].map((name, index) => ({
        activityNodeName: name,
        sort: index,
        steps: rows
          .filter((row) => row.activityNodeName === name && row.subActivityNodeName)
          .map((row, order) => ({
            subActivityNodeName: row.subActivityNodeName,
            sort: order,
            boundAssets: clone(row.boundAssets),
          })),
      })),
    });
    const find = (stage, node) =>
      rows.find(
        (row) =>
          row.activityNodeName === stage && (row.subActivityNodeName || null) === (node || null),
      );
    api.queryHarnessWorkflowDetail = async () => success(detail());
    api.queryActivitiesByScene = async (params) => {
      assert.deepEqual(params, scope);
      return success(rows.map((row) => ({ ...scope, ...clone(row) })));
    };
    api.querySceneList = async () =>
      success([{ firstScene: scope.firstScene, secondScene: scope.secondScene, sort: 0 }]);
    api.renameActivity = async (body, params) => {
      assert.deepEqual(params, dimensions);
      assert.equal(body.firstScene, scope.firstScene);
      assert.equal(body.secondScene, scope.secondScene);
      const row = find(body.oldActivityNodeName, body.oldSubActivityNodeName);
      assert.ok(row, 'rename must use an existing exact key');
      assert.equal(
        find(body.newActivityNodeName, body.newSubActivityNodeName),
        undefined,
        'rename must not overwrite a sibling',
      );
      calls.push(['rename', clone(body)]);
      row.activityNodeName = body.newActivityNodeName;
      row.subActivityNodeName = body.newSubActivityNodeName;
      return success(null);
    };
    api.deleteActivity = async (params) => {
      for (const [key, value] of Object.entries(scope)) assert.equal(params[key], value);
      const row = find(params.activityNodeName, params.subActivityNodeName);
      assert.ok(row, 'delete must use an existing exact key');
      calls.push(['delete', clone(params)]);
      rows = rows.filter((item) => item !== row);
      return success(null);
    };
    api.refreshActivities = async (_params, body) => {
      calls.push(['refresh', clone(body)]);
      rows = body.activities.map((row) => ({
        ...row,
        boundAssets: find(row.activityNodeName, row.subActivityNodeName)?.boundAssets || [],
      }));
      return success(null);
    };
    api.querySceneAssetPool = async () => success(clone(pool));
    for (const method of [
      'queryConfigurationBindings',
      'skillUnbindScene',
      'agentUnbindScene',
      'skillBindActivity',
      'agentBindActivity',
      'componentExitPool',
      'componentEnterPool',
    ])
      api[method] = async () => {
        throw new Error(`unexpected binding/pool mutation: ${method}`);
      };
    const before = detail();
    const mapped = repository.mapDesignDetail(scope, before, 'scene-id', 'product-id');
    const save = async () => {
      const migrated = await repository.prepareDesignActivityChanges(
        scope,
        mapped.workflow,
        detail(),
      );
      await repository.saveDesignActivities(scope, mapped.workflow, migrated);
      await repository.saveDesignAssets(scope, mapped.workflow, mapped.assets, migrated);
    };
    return { before, mapped, calls, save, detail, rows: () => rows };
  }
  await test('renaming a bound node migrates both Skill and Agent bindings without rebinds', async () => {
    const f = fixture();
    f.mapped.workflow.stages[0].steps[0].name = '实现';
    await f.save();
    assert.deepEqual(
      f.calls.map(([op]) => op),
      ['rename'],
    );
    assert.deepEqual(f.detail().stages[0].steps[0].boundAssets, pool);
    assert.equal(f.detail().stages[0].steps[0].subActivityNodeName, '实现');
  });
  await test('renaming a stage migrates each child and the exact parent row', async () => {
    const f = fixture();
    f.mapped.workflow.stages[0].name = '实现';
    await f.save();
    assert.deepEqual(
      f.calls.map(([op]) => op),
      ['rename', 'rename', 'rename'],
    );
    assert.deepEqual(
      f.calls.map(([, body]) => body.oldSubActivityNodeName),
      ['生成', '验证', null],
    );
    assert.ok(f.calls.every(([, body]) => body.newActivityNodeName === '实现'));
    assert.deepEqual(f.detail().stages[0].steps[0].boundAssets, pool);
  });
  await test('deleting a stage deletes all children before the parent and preserves the pool and other stages', async () => {
    const f = fixture();
    f.mapped.workflow.stages.splice(0, 1);
    await f.save();
    const deletes = f.calls.filter(([op]) => op === 'delete');
    assert.deepEqual(
      deletes.map(([, params]) => params.subActivityNodeName),
      ['生成', '验证', undefined],
    );
    assert.equal(Object.hasOwn(deletes[2][1], 'subActivityNodeName'), false);
    assert.deepEqual(
      f.detail().stages.map((stage) => stage.activityNodeName),
      ['交付'],
    );
    assert.deepEqual(f.detail().assetPool, pool);
  });
  await test('deleting a virtual stage never issues a DELETE for a missing parent record', async () => {
    const f = fixture({ parent: false });
    f.mapped.workflow.stages.splice(0, 1);
    await f.save();
    assert.deepEqual(
      f.calls.filter(([op]) => op === 'delete').map(([, params]) => params.subActivityNodeName),
      ['生成', '验证'],
    );
  });
  await test('deleting a bound node preserves its sibling binding and asset pool', async () => {
    const f = fixture();
    f.mapped.workflow.stages[0].steps.splice(0, 1);
    await f.save();
    assert.equal(f.calls.filter(([op]) => op === 'delete').length, 1);
    assert.deepEqual(f.detail().stages[0].steps[0].boundAssets, [pool[0]]);
    assert.deepEqual(f.detail().assetPool, pool);
  });
  await test('a partially completed stage rename retries only remaining exact records', async () => {
    const f = fixture();
    f.mapped.workflow.stages[0].name = '实现';
    const rename = api.renameActivity;
    let fail = true;
    api.renameActivity = async (body, params) => {
      if (body.oldSubActivityNodeName === '验证' && fail) {
        fail = false;
        throw new Error('temporary failure');
      }
      return rename(body, params);
    };
    await assert.rejects(f.save, /temporary failure/);
    assert.equal(f.calls.length, 1);
    await f.save();
    assert.equal(f.calls.filter(([op]) => op === 'rename').length, 3);
    assert.deepEqual(f.detail().stages[0].steps[0].boundAssets, pool);
  });
} finally {
  await server.close();
}
if (failed) process.exitCode = 1;

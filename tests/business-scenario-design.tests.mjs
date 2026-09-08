import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });
const success = (data) => ({ meta: { success: true }, data });
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}`, error);
  }
}
try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const calls = [];
  request.harnessApi = async (config) => {
    calls.push(config);
    return success([]);
  };
  const scope = { userId: 'tester', dimType: '产品级', dimCode: 'P1', dimName: 'demo' };
  const scene = { firstScene: '研发', secondScene: '代码生成' };
  await test('pool add uses the documented route and full scene identity', async () => {
    await api.componentEnterPool({
      ...scope,
      ...scene,
      assetType: 'SKILL',
      assetName: 'demo-code',
    });
    assert.equal(calls.at(-1).url, '/workflow/asset-pool/add');
    assert.equal(calls.at(-1).data.secondScene, '代码生成');
  });
  await test('Command is bound at scene level with explicit null activity columns', async () => {
    await api.commandBindScene({ ...scene, commandName: 'demo-entry' }, scope);
    assert.equal(calls.at(-1).data.activityNodeName, null);
    assert.equal(calls.at(-1).data.subActivityNodeName, null);
  });
  await test('documented routes preserve HTTP methods, query dimensions and request body placement', async () => {
    const context = { ...scope, ...scene };
    const meta = {
      ...scene,
      flowName: '流程',
      secondSceneDescription: '目标',
      flowDescription: '说明',
    };
    const extension = {
      ...scene,
      targetOrgCode: 'org',
      targetOrgName: '研发',
      skills: [{ name: 'demo-skill', version: '1.0.0' }],
    };
    const contracts = [
      ['querySceneList', [scope], 'GET', '/scene-activity/scene', scope, undefined],
      [
        'refreshScene',
        [scope, { scenes: [{ ...scene, sort: 0, sceneExtensionCode: null }] }],
        'POST',
        '/scene-activity/scene',
        scope,
        { scenes: [{ ...scene, sort: 0, sceneExtensionCode: null }] },
      ],
      [
        'updateSecondSceneCode',
        [{ ...scene, sceneExtensionCode: 'demo-code' }, scope],
        'PUT',
        '/scene-activity/scene/code',
        scope,
        { ...scene, sceneExtensionCode: 'demo-code' },
      ],
      [
        'updateSceneMetadata',
        [meta, scope],
        'PUT',
        '/scene-activity/scene/workflow-meta',
        scope,
        meta,
      ],
      ['queryActivitiesByScene', [context], 'GET', '/scene-activity/activity', context, undefined],
      [
        'refreshActivities',
        [scope, { activities: [] }],
        'POST',
        '/scene-activity/activity',
        scope,
        { activities: [] },
      ],
      [
        'queryHarnessWorkflowList',
        [{ userId: 'tester', dimName: '部门/团队' }],
        'GET',
        '/workflow/list',
        { userId: 'tester', dimName: '部门/团队' },
        undefined,
      ],
      ['querySceneAssetPool', [context], 'GET', '/workflow/asset-pool', context, undefined],
      [
        'componentExitPool',
        [{ ...context, assetType: 'AGENT', assetName: 'demo-agent' }],
        'DELETE',
        '/workflow/asset-pool/remove',
        { ...context, assetType: 'AGENT', assetName: 'demo-agent' },
        undefined,
      ],
      ['queryHarnessWorkflowDetail', [context], 'GET', '/workflow/detail', context, undefined],
      [
        'agentBindActivity',
        [
          {
            ...scene,
            agentName: 'demo-agent',
            activityNodeName: '环节',
            subActivityNodeName: '节点',
          },
          scope,
        ],
        'POST',
        '/agents/config/supplement/add',
        scope,
        {
          ...scene,
          agentName: 'demo-agent',
          activityNodeName: '环节',
          subActivityNodeName: '节点',
        },
      ],
      [
        'saveExtension',
        [extension, { ...scope, operatorName: '设计者' }],
        'POST',
        '/extensions',
        { ...scope, operatorName: '设计者' },
        extension,
      ],
      [
        'querySceneBinding',
        [
          { dimType: scope.dimType, dimCode: scope.dimCode, dimName: scope.dimName },
          { userId: scope.userId },
        ],
        'POST',
        '/scenes/bindings',
        { userId: scope.userId },
        { dimType: scope.dimType, dimCode: scope.dimCode, dimName: scope.dimName },
      ],
      [
        'queryExtensionSceneDetail',
        [
          { userId: scope.userId },
          {
            dimType: scope.dimType,
            dimCode: scope.dimCode,
            dimName: scope.dimName,
            extensionName: 'demo-code',
          },
        ],
        'POST',
        '/extensions/detail',
        { userId: scope.userId },
        {
          dimType: scope.dimType,
          dimCode: scope.dimCode,
          dimName: scope.dimName,
          extensionName: 'demo-code',
        },
      ],
    ];
    for (const [name, args, method, url, params, body] of contracts) {
      await api[name](...args);
      assert.equal(calls.at(-1).method, method, name);
      assert.equal(calls.at(-1).url, url, name);
      assert.deepEqual(calls.at(-1).params, params, name);
      assert.deepEqual(calls.at(-1).data, body, name);
    }
    for (const type of ['skill', 'agent', 'command']) {
      await api[`${type}UnbindScene`]('binding/id', { userId: scope.userId });
      assert.equal(calls.at(-1).url, `/${type}s/config/supplement/delete/binding%2Fid`);
      assert.deepEqual(calls.at(-1).params, { userId: scope.userId });
    }
  });
  const repository = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignRepository.ts',
  );
  const context = { ...scope, ...scene };
  const detail = {
    flowName: '代码作业流',
    flowDescription: '流程说明',
    sceneExtensionCode: 'demo-code',
    secondSceneDescription: '场景目标',
    commands: [{ commandName: '/demo-start', description: '入口' }],
    assetPool: [
      { assetType: 'Skill', assetName: 'demo-code', description: '生成代码', packageReady: true },
    ],
    stages: [
      {
        activityNodeName: '编码',
        sort: 0,
        steps: [
          {
            subActivityNodeName: '生成',
            sort: 0,
            boundAssets: [{ assetType: 'SKILL', assetName: 'demo-code' }],
          },
        ],
      },
    ],
    steps: ['scenario', 'workflow', 'command', 'assets'].map((key) => ({
      key,
      label: key,
      state: 'done',
      reason: '',
    })),
    nextStep: 4,
    allDone: true,
  };
  await test('detail maps server progress, nested activities and pool identity', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    assert.equal(mapped.workflow.name, '代码作业流');
    assert.equal(mapped.workflow.progress.allDone, true);
    assert.equal(mapped.workflow.commands[0].name, '/demo-start');
    assert.equal(mapped.workflow.stages[0].steps[0].assets[0].assetId, mapped.assets[0]._id);
    assert.equal(mapped.assets[0].packageReady, true);
  });
  await test('assets enter pool before node binding; unchanged entries are not added twice', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    const operations = [];
    api.querySceneAssetPool = async () => success([]);
    api.componentEnterPool = async (body) => {
      operations.push(['pool', body]);
      return success(null);
    };
    api.skillBindActivity = async (body, params) => {
      operations.push(['bind', body, params]);
      return success(null);
    };
    await repository.saveDesignAssets(context, mapped.workflow, mapped.assets, {
      ...detail,
      assetPool: [],
      stages: [],
    });
    assert.deepEqual(
      operations.map((item) => item[0]),
      ['pool', 'bind'],
    );
    assert.equal(operations[0][1].secondScene, scene.secondScene);
    assert.equal(operations[1][2].dimCode, scope.dimCode);
    operations.length = 0;
    api.querySceneAssetPool = async () => success(detail.assetPool);
    await repository.saveDesignAssets(context, mapped.workflow, mapped.assets, detail);
    assert.equal(operations.length, 0);
  });
  await test('binding removal resolves IDs across pages and never deletes a sibling scene binding', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    mapped.workflow.stages[0].steps[0].assets = [];
    const removed = [];
    api.querySceneAssetPool = async () => success(detail.assetPool);
    api.queryConfigurationBindings = async (type, params) => ({
      meta: { success: true, number: 2 },
      data:
        params.pageNum === 1
          ? [
              {
                skillConfigEntity: {
                  id: 'other',
                  ...scene,
                  secondScene: '其他场景',
                  skillName: 'demo-code',
                  activityNodeName: '编码',
                  subActivityNodeName: '生成',
                },
              },
            ]
          : [
              {
                skillConfigEntity: {
                  id: 'current',
                  ...scene,
                  skillName: 'demo-code',
                  activityNodeName: '编码',
                  subActivityNodeName: '生成',
                },
              },
            ],
    });
    api.skillUnbindScene = async (id) => {
      removed.push(id);
      return success(null);
    };
    await repository.saveDesignAssets(context, mapped.workflow, mapped.assets, detail);
    assert.deepEqual(removed, ['current']);
  });
  await test('pool removal lets the server unbind once without deleting other scenes', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    mapped.workflow.assets = [];
    mapped.workflow.stages[0].steps[0].assets = [];
    const removed = [];
    api.componentExitPool = async (params) => {
      removed.push(params);
      return success(null);
    };
    api.queryConfigurationBindings = async () => {
      throw Error('should use automatic unbinding on pool removal');
    };
    await repository.saveDesignAssets(context, mapped.workflow, mapped.assets, detail);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].secondScene, scene.secondScene);
  });
  await test('renaming a bound node unbinds old activity before refresh and binds the new one afterwards', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    mapped.workflow.stages[0].steps[0].name = '新节点';
    const operations = [];
    api.queryConfigurationBindings = async () =>
      success([
        {
          id: 'old-binding',
          ...scene,
          skillName: 'demo-code',
          activityNodeName: '编码',
          subActivityNodeName: '生成',
        },
      ]);
    api.skillUnbindScene = async (id) => {
      operations.push(['unbind', id]);
      return success(null);
    };
    api.querySceneList = async () =>
      success([
        { ...scene, sort: 0 },
        { firstScene: '研发', secondScene: '保留场景', sort: 1 },
      ]);
    api.queryActivitiesByScene = async (params) =>
      success([
        { ...params, activityNodeName: '保留环节', subActivityNodeName: '保留节点', sort: 0 },
      ]);
    api.refreshActivities = async (params, body) => {
      operations.push(['activities', body]);
      return success(null);
    };
    api.skillBindActivity = async (body) => {
      operations.push(['bind', body]);
      return success(null);
    };
    api.querySceneAssetPool = async () => success(detail.assetPool);
    const updatedBefore = await repository.prepareDesignActivityChanges(
      context,
      mapped.workflow,
      detail,
    );
    await repository.saveDesignActivities(context, mapped.workflow, detail);
    await repository.saveDesignAssets(context, mapped.workflow, mapped.assets, updatedBefore);
    assert.deepEqual(
      operations.map((item) => item[0]),
      ['unbind', 'activities', 'bind'],
    );
    assert.equal(operations[1][1].activities[0].secondScene, '保留场景');
    assert.equal(operations[2][1].subActivityNodeName, '新节点');
  });
  await test('successful code writes are remembered even if the subsequent metadata request fails', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    const remembered = {};
    api.updateSecondSceneCode = async () => success(null);
    api.updateSceneMetadata = async () => ({ meta: { success: false, message: '元数据拒绝' } });
    await assert.rejects(
      () =>
        repository.saveDesignMetadata(
          context,
          { code: 'demo-new-code', description: '新目标' },
          mapped.workflow,
          detail,
          (values) => Object.assign(remembered, values),
        ),
      /元数据拒绝/,
    );
    assert.equal(remembered.sceneExtensionCode, 'demo-new-code');
    assert.equal(remembered.secondSceneDescription, undefined);
  });
} finally {
  await server.close();
}
if (failures) process.exitCode = 1;

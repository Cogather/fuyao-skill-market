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
  await test('pool add sends userId in query params and keeps scene identity in the body', async () => {
    const { userId, ...dimension } = scope;
    await api.componentEnterPool(
      { ...dimension, ...scene, assetType: 'SKILL', assetName: 'demo-code' },
      { userId },
    );
    assert.equal(calls.at(-1).url, '/workflow/asset-pool/add');
    assert.equal(calls.at(-1).method, 'POST');
    assert.deepEqual(calls.at(-1).params, { userId });
    assert.equal(Object.hasOwn(calls.at(-1).data, 'userId'), false);
    assert.equal(calls.at(-1).data.secondScene, '代码生成');
  });
  await test('Command is bound at scene level with explicit null activity columns', async () => {
    await api.commandBindScene({ ...scene, commandName: 'demo-entry' }, scope);
    assert.equal(calls.at(-1).data.activityNodeName, null);
    assert.equal(calls.at(-1).data.subActivityNodeName, null);
  });
  await test('scene refresh sends firstSceneDescription and retains existing child metadata', async () => {
    const root = {
      firstScene: '新建一级场景',
      firstSceneDescription: '一级场景目标',
      secondScene: '',
      sort: 0,
    };
    const child = {
      ...scene,
      firstSceneDescription: '研发说明',
      sort: 1,
      sceneExtensionCode: 'demo-code',
      secondSceneDescription: '场景目标',
      flowName: '代码作业流',
      flowDescription: '流程说明',
    };
    const emptyChild = {
      firstScene: '研发',
      secondScene: '待设计场景',
      sort: 2,
      sceneExtensionCode: null,
    };
    const body = { scenes: [root, child, emptyChild] };
    const original = structuredClone(body);
    await api.refreshScene(scope, body);
    assert.deepEqual(calls.at(-1).data.scenes, [
      {
        ...root,
        sceneExtensionCode: '',
        secondSceneDescription: '',
        flowName: '',
        flowDescription: '',
      },
      child,
      {
        ...emptyChild,
        sceneExtensionCode: '',
        secondSceneDescription: '',
        flowName: '',
        flowDescription: '',
      },
    ]);
    assert.deepEqual(body, original, 'building the request must not mutate the scene cache');
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
        {
          scenes: [
            {
              ...scene,
              sort: 0,
              sceneExtensionCode: '',
              secondSceneDescription: '',
              flowName: '',
              flowDescription: '',
            },
          ],
        },
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
  await test('detail mapping tolerates null Command names and uses a nonempty name alias', async () => {
    const mapped = repository.mapDesignDetail(
      context,
      {
        ...detail,
        commands: [
          { commandName: null, description: null },
          null,
          { commandName: null, name: 'demo-start', description: '入口' },
          { commandName: ' /demo-ready ', description: null },
        ],
      },
      'scenario-id',
      'product-id',
    );
    assert.deepEqual(
      mapped.commands.map((item) => item.name),
      ['/demo-start', '/demo-ready'],
    );
    assert.equal(mapped.commands[1].description, '');
  });
  await test('malformed detail Command names are resolved from current scene bindings before saving', async () => {
    api.queryHarnessWorkflowDetail = async () =>
      success({ ...detail, commands: [{ commandName: null, description: null }] });
    const queries = [];
    api.queryConfigurationBindings = async (type, params) => {
      queries.push({ type, params });
      return success([
        {
          commandConfigEntity: {
            id: 'other',
            ...scene,
            secondScene: '其他场景',
            commandName: '/demo-other',
            activityNodeName: null,
            subActivityNodeName: null,
          },
        },
        {
          commandConfigEntity: {
            id: 'other-product',
            ...scene,
            dimCode: 'P2',
            commandName: '/demo-other-product',
            activityNodeName: null,
            subActivityNodeName: null,
          },
        },
        {
          commandConfigEntity: {
            id: 'node-command',
            ...scene,
            commandName: '/demo-node',
            activityNodeName: '编码',
            subActivityNodeName: '生成',
          },
        },
        {
          commandConfigEntity: {
            id: 'scene-command',
            ...scene,
            commandName: 'demo-start',
            commandDescription: '入口',
            activityNodeName: null,
            subActivityNodeName: null,
          },
        },
      ]);
    };
    const loaded = await repository.loadDesignDetail(context);
    assert.deepEqual(loaded.commands, [{ commandName: '/demo-start', description: '入口' }]);
    assert.equal(queries[0].type, 'COMMAND');
    assert.equal(queries[0].params.dimCode, context.dimCode);
    const mapped = repository.mapDesignDetail(context, loaded, 'scenario-id', 'product-id');
    api.commandBindScene = async () => {
      throw new Error('must not duplicate an existing binding');
    };
    api.commandUnbindScene = async () => {
      throw new Error('must not remove a valid binding');
    };
    await repository.saveDesignCommands(context, mapped.workflow, loaded);
    const removed = [];
    mapped.workflow.commands = [];
    api.commandUnbindScene = async (id) => {
      removed.push(id);
      return success(null);
    };
    await repository.saveDesignCommands(context, mapped.workflow, loaded);
    assert.deepEqual(
      removed,
      ['scene-command'],
      'with/without slash must resolve the same binding ID',
    );
  });
  await test('valid and empty Command lists use the aggregate detail without extra binding queries', async () => {
    api.queryConfigurationBindings = async () => {
      throw new Error('valid detail needs no fallback');
    };
    for (const commands of [detail.commands, []]) {
      api.queryHarnessWorkflowDetail = async () => success({ ...detail, commands });
      const loaded = await repository.loadDesignDetail(context);
      assert.deepEqual(loaded.commands, commands);
    }
  });
  await test('unrecoverable Command names report a data error before any binding writes', async () => {
    api.queryHarnessWorkflowDetail = async () =>
      success({ ...detail, commands: [{ commandName: null }] });
    api.queryConfigurationBindings = async () =>
      success([{ ...scene, commandName: null, activityNodeName: null, subActivityNodeName: null }]);
    await assert.rejects(() => repository.loadDesignDetail(context), /Command 名称为空/);
    api.queryConfigurationBindings = async () => success([]);
    await assert.rejects(() => repository.loadDesignDetail(context), /Command 名称为空/);
  });
  await test('Command name recovery respects paginated bindings and existing server progress', async () => {
    api.queryHarnessWorkflowDetail = async () =>
      success({ ...detail, commands: [{ commandName: null }] });
    const pages = [];
    api.queryConfigurationBindings = async (_type, params) => {
      pages.push(params.pageNum);
      return {
        meta: { success: true, number: 2 },
        data: [
          {
            id: `binding-${params.pageNum}`,
            ...scene,
            secondScene: params.pageNum === 1 ? '其他场景' : scene.secondScene,
            commandName: params.pageNum === 1 ? '/other' : '/demo-start',
            activityNodeName: null,
            subActivityNodeName: null,
          },
        ],
      };
    };
    const loaded = await repository.loadDesignDetail(context);
    assert.deepEqual(loaded.commands, [{ commandName: '/demo-start', description: '' }]);
    assert.deepEqual(pages, [1, 2]);
    assert.deepEqual(loaded.steps, detail.steps);
    assert.equal(loaded.nextStep, detail.nextStep);
  });
  await test('assets enter pool before node binding; unchanged entries are not added twice', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    const operations = [];
    api.querySceneAssetPool = async () => success([]);
    api.componentEnterPool = async (body, params) => {
      assert.deepEqual(params, { userId: scope.userId });
      assert.equal(Object.hasOwn(body, 'userId'), false);
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
  await test('bound node rename is blocked; after explicit unbinding refresh preserves other scenes', async () => {
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
    await assert.rejects(
      () => repository.prepareDesignActivityChanges(context, mapped.workflow, detail),
      /已绑定资产/,
    );
    assert.deepEqual(operations, []);
    const unbound = structuredClone(detail);
    unbound.stages[0].steps[0].boundAssets = [];
    mapped.workflow.stages[0].steps[0].assets = [];
    await repository.prepareDesignActivityChanges(context, mapped.workflow, unbound);
    await repository.saveDesignActivities(context, mapped.workflow, unbound);
    assert.deepEqual(
      operations.map((item) => item[0]),
      ['activities'],
    );
    assert.equal(operations[0][1].activities[0].secondScene, '保留场景');
    assert.equal(operations[0][1].activities.at(-1).subActivityNodeName, '新节点');
  });
  await test('successful code writes are remembered even if the subsequent metadata request fails', async () => {
    const mapped = repository.mapDesignDetail(context, detail, 'scenario-id', 'product-id');
    mapped.workflow.name = '新流程名称';
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
    assert.equal(remembered.secondSceneDescription, '新目标');
    assert.equal(remembered.flowName, undefined);
  });
} finally {
  await server.close();
}
if (failures) process.exitCode = 1;

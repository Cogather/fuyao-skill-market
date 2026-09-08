import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { effectScope, nextTick } from 'vue';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const previousWindow = globalThis.window;
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};

const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });
const success = (data) => ({ meta: { success: true }, data });
const clone = (value) => structuredClone(value);
let failed = 0;
let scope;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`, error);
  } finally {
    scope?.stop();
    await nextTick();
  }
}
try {
  const { createHarnessScenarioWorkspace } = await server.ssrLoadModule(
    '/src/composables/useHarnessScenarioWorkspace.ts',
  );
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  async function fixture({ bound = false, failReadbackOnce = false, sceneCode = 'demo-old' } = {}) {
    storage.clear();
    const calls = [];
    let rows = [
      {
        firstScene: '研发',
        firstSceneDescription: '一级研发说明',
        secondScene: '代码生成',
        sort: 0,
        sceneExtensionCode: sceneCode,
        secondSceneDescription: '旧目标',
        flowName: '原流程',
        flowDescription: '',
      },
    ];
    let detail = {
      ...rows[0],
      commands: bound ? [{ commandName: '/demo-entry', description: '' }] : [],
      assetPool: [],
      stages: [
        {
          activityNodeName: '编码',
          sort: 0,
          steps: [{ subActivityNodeName: '生成', sort: 0, boundAssets: [] }],
        },
      ],
      steps: [],
      nextStep: 0,
      allDone: false,
    };
    api.queryProducts = async () => success([{ offeringId: 'product-demo', offeringName: 'demo' }]);
    api.querySceneList = async () => {
      if (failReadbackOnce && calls.some(([op]) => ['refresh', 'rename'].includes(op))) {
        failReadbackOnce = false;
        throw new Error('list readback outage');
      }
      return success(clone(rows));
    };
    api.queryHarnessWorkflowDetail = async (params) => {
      calls.push(['detail', params]);
      if (params.secondScene !== detail.secondScene) throw new Error('SCENE_NOT_FOUND');
      return success(clone(detail));
    };
    api.refreshScene = async (_params, body) => {
      calls.push(['refresh', clone(body)]);
      rows = clone(body.scenes);
      // Reproduce the backend deleting the old scene then inserting its renamed replacement.
      detail = {
        ...detail,
        ...rows[0],
        sceneExtensionCode: null,
        secondSceneDescription: null,
        flowName: null,
        flowDescription: null,
      };
      return success(null);
    };
    api.renameScene = async (body, params) => {
      calls.push(['rename', clone(body), clone(params)]);
      assert.equal(params.userId, 'designer');
      for (const row of rows) {
        if (
          row.firstScene === body.oldFirstScene &&
          (!body.oldSecondScene || row.secondScene === body.oldSecondScene)
        ) {
          row.firstScene = body.newFirstScene;
          if (body.oldSecondScene) row.secondScene = body.newSecondScene;
        }
      }
      detail.firstScene = body.newFirstScene;
      if (body.oldSecondScene) detail.secondScene = body.newSecondScene;
      return { meta: { isSuccess: true }, data: null };
    };
    api.deleteScene = async (params) => {
      calls.push(['delete-scene', clone(params)]);
      rows = rows.filter(
        (row) =>
          row.firstScene !== params.firstScene ||
          (params.secondScene && row.secondScene !== params.secondScene),
      );
      return success(null);
    };
    api.queryActivitiesByScene = async () =>
      success(
        detail.stages.flatMap((stage) =>
          (stage.steps.length ? stage.steps : [null]).map((node) => ({
            firstScene: detail.firstScene,
            secondScene: detail.secondScene,
            activityNodeName: stage.activityNodeName,
            subActivityNodeName: node?.subActivityNodeName || null,
            sort: 0,
          })),
        ),
      );
    api.deleteActivity = async (params) => {
      calls.push(['delete-activity', clone(params)]);
      const stage = detail.stages.find((item) => item.activityNodeName === params.activityNodeName);
      if (params.subActivityNodeName)
        stage.steps = stage.steps.filter(
          (node) => node.subActivityNodeName !== params.subActivityNodeName,
        );
      else detail.stages = detail.stages.filter((item) => item !== stage);
      return success(null);
    };
    api.updateSecondSceneCode = async (body) => {
      calls.push(['code', clone(body)]);
      Object.assign(detail, body);
      Object.assign(rows[0], body);
      return success(null);
    };
    api.updateSceneMetadata = async (body) => {
      calls.push(['meta', clone(body)]);
      Object.assign(detail, body);
      Object.assign(rows[0], body);
      return success(null);
    };
    api.querySceneAssetPool = async () => success(clone(detail.assetPool));
    api.queryConfigurationBindings = async () => success([]);
    api.refreshActivities = async () => {
      calls.push(['activities']);
      return success(null);
    };
    api.commandBindScene = async (body, params) => {
      calls.push(['command-bind', clone(body), clone(params)]);
      detail.commands.push({ commandName: body.commandName, description: '' });
      return success('binding');
    };
    api.componentEnterPool = async (body, params) => {
      assert.deepEqual(params, { userId: 'designer' });
      assert.equal(Object.hasOwn(body, 'userId'), false);
      calls.push(['pool-add', clone(body)]);
      detail.assetPool.push(clone(body));
      return success(null);
    };
    api.createCapability = async (type, body) => {
      calls.push(['create', type, clone(body)]);
      return success('created-id');
    };
    api.skillUnbindScene = async () => {
      calls.push(['unbind']);
      return success(null);
    };
    const context = {
      ready: true,
      userId: 'designer',
      departmentTree: [{ name: '研发部', deptCode: 'dept-demo' }],
      defaultDepartmentPath: ['研发部'],
      allowedDepartmentPaths: [['研发部']],
      restrictToAllowedDepartments: true,
    };
    scope = effectScope();
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
    for (
      let i = 0;
      i < 100 &&
      (!workspace.available.value ||
        workspace.workflowLoading.value ||
        !workspace.workflows.length);
      i++
    ) {
      await nextTick();
      await setImmediate();
    }
    assert.equal(workspace.available.value, true);
    const scenario = workspace.scenarios.find((item) => item.level === 2);
    const workflow = clone(JSON.parse(JSON.stringify(workspace.workflows[0])));
    calls.length = 0;
    return { workspace, scenario, workflow, calls, detail: () => detail };
  }
  await test('HTTP scene loading maps first and second scene descriptions to their respective levels', async () => {
    const f = await fixture();
    assert.equal(
      f.workspace.scenarios.find((item) => item.level === 1).description,
      '一级研发说明',
    );
    assert.equal(f.scenario.description, '旧目标');
  });
  await test('creating a root scene sends firstSceneDescription and restores it after reloading', async () => {
    const f = await fixture();
    const root = f.workspace.scenarios.find((item) => item.level === 1);
    const saved = await f.workspace.saveScenario({
      ...root,
      _id: 'new-root',
      sourceId: undefined,
      name: '交付发布',
      description: '  发布目标\n输入输出与业务边界  ',
      tags: [],
    });
    const writes = f.calls.filter(([op]) => ['refresh', 'rename', 'code', 'meta'].includes(op));
    assert.deepEqual(
      writes.map(([op]) => op),
      ['refresh'],
    );
    const created = writes[0][1].scenes.find((item) => item.firstScene === '交付发布');
    assert.equal(created.secondScene, '');
    assert.equal(created.firstSceneDescription, '发布目标\n输入输出与业务边界');
    assert.equal(
      writes[0][1].scenes.find((item) => item.firstScene === '研发').firstSceneDescription,
      '一级研发说明',
    );
    await f.workspace.reloadScenes();
    assert.equal(
      f.workspace.scenarios.find((item) => item._id === saved._id).description,
      '发布目标\n输入输出与业务边界',
    );
  });
  await test('updating, renaming and clearing a root description persists firstSceneDescription without changing child metadata', async () => {
    const f = await fixture();
    const rootId = f.workspace.scenarios.find((item) => item.level === 1)._id;
    for (const [name, description, expected] of [
      ['研发', '  修改后的一级说明  ', '修改后的一级说明'],
      ['研发设计', '改名后的一级说明', '改名后的一级说明'],
      ['研发设计', '   ', ''],
    ]) {
      const root = f.workspace.scenarios.find((item) => item._id === rootId);
      await f.workspace.saveScenario({ ...root, name, description });
      const rows = f.calls.filter(([op]) => op === 'refresh').at(-1)[1].scenes;
      assert.equal(rows[0].firstScene, name);
      assert.equal(rows[0].firstSceneDescription, expected);
      assert.equal(rows[0].secondSceneDescription, '旧目标');
      assert.equal(rows[0].sceneExtensionCode, 'demo-old');
      await f.workspace.reloadScenes();
      assert.equal(f.workspace.scenarios.find((item) => item._id === rootId).description, expected);
    }
    assert.equal(
      f.calls.some(([op]) => ['code', 'meta'].includes(op)),
      false,
    );
  });
  await test('creating a child scene sends its entered code and description in the initial scene refresh', async () => {
    const f = await fixture();
    const root = f.workspace.scenarios.find((item) => item.level === 1);
    const saved = await f.workspace.saveScenario({
      _id: 'new-child',
      name: '新增下级场景',
      code: '  demo-child-extension  ',
      description: '  下级场景说明  ',
      parentId: root._id,
      productId: root.productId,
      level: 2,
      tags: [],
      status: 'draft',
      releaseCount: 0,
    });
    const writes = f.calls.filter(([op]) => ['refresh', 'code'].includes(op));
    assert.deepEqual(
      writes.map(([op]) => op),
      ['refresh', 'code'],
    );
    const rows = writes[0][1].scenes;
    assert.deepEqual(
      rows.map((item) => item.firstSceneDescription),
      ['一级研发说明', '一级研发说明'],
    );
    assert.equal(
      rows.find((item) => item.secondScene === '新增下级场景').sceneExtensionCode,
      'demo-child-extension',
    );
    assert.equal(
      rows.find((item) => item.secondScene === '新增下级场景').secondSceneDescription,
      '下级场景说明',
    );
    assert.equal(
      rows.find((item) => item.secondScene === '代码生成').sceneExtensionCode,
      'demo-old',
    );
    assert.equal(
      rows.find((item) => item.secondScene === '代码生成').secondSceneDescription,
      '旧目标',
    );
    assert.equal(writes[1][1].sceneExtensionCode, 'demo-child-extension');
    assert.equal(writes[1][1].secondSceneDescription, '下级场景说明');
    assert.equal(saved.code.trim(), 'demo-child-extension');
    assert.equal(saved.description.trim(), '下级场景说明');
  });
  await test('renaming a scene migrates its identity before updating changed code and description', async () => {
    const f = await fixture();
    await f.workspace.saveWorkflow(f.workflow, {
      name: '新场景',
      code: 'demo-new',
      description: '新目标',
    });
    const writes = f.calls.filter(([op]) => ['refresh', 'rename', 'code', 'meta'].includes(op));
    assert.deepEqual(
      writes.map(([op]) => op),
      ['rename', 'code'],
    );
    assert.equal(writes[0][1].oldSecondScene, '代码生成');
    assert.equal(writes[0][1].newSecondScene, '新场景');
    assert.equal(writes[1][1].secondScene, '新场景');
    assert.equal(writes[1][1].secondSceneDescription, '新目标');
    assert.equal(f.workspace.scenarios.find((item) => item._id === f.scenario._id).name, '新场景');
  });
  await test('renaming an undesigned child preserves an empty code without bypassing normal scene validation', async () => {
    const f = await fixture({ sceneCode: null });
    const renamed = { ...f.scenario, name: '新的二级场景' };
    await assert.rejects(() => f.workspace.saveScenario(renamed), /编码/);
    const saved = await f.workspace.saveScenario(renamed, { nameOnly: true });
    const writes = f.calls.filter(([op]) => ['refresh', 'rename', 'code', 'meta'].includes(op));
    assert.deepEqual(
      writes.map(([op]) => op),
      ['rename'],
    );
    assert.equal(writes[0][1].newSecondScene, '新的二级场景');
    assert.equal(f.detail().flowName, '原流程');
    assert.equal(saved._id, f.scenario._id);
    assert.equal(saved.parentId, f.scenario.parentId);
    assert.equal(saved.code, '');
  });
  await test('a committed rename survives failed list readback and retries with the new scene name', async () => {
    const f = await fixture({ failReadbackOnce: true });
    const values = { name: '新场景', code: 'demo-new', description: '新目标' };
    await assert.rejects(
      () => f.workspace.saveWorkflow(f.workflow, values),
      /list readback outage/,
    );
    assert.equal(f.workspace.scenarios.find((item) => item._id === f.scenario._id).name, '新场景');
    await f.workspace.saveWorkflow(f.workflow, values);
    assert.equal(f.calls.filter(([op]) => op === 'rename').length, 1);
    assert.equal(f.detail().secondSceneDescription, '新目标');
    assert.equal(f.detail().sceneExtensionCode, 'demo-new');
  });
  await test('a newly committed scene exposes its identity even when list readback fails', async () => {
    const f = await fixture({ failReadbackOnce: true });
    const scene = {
      ...f.workspace.scenarios.find((item) => item.level === 1),
      _id: 'draft-id',
      sourceId: undefined,
      name: '新一级场景',
      description: '刷新失败也要保留的一级说明',
      tags: [],
    };
    await assert.rejects(() => f.workspace.saveScenario(scene), /list readback outage/);
    assert.ok(scene.sourceId);
    const committedId = scene._id;
    assert.equal(
      f.workspace.scenarios.find((item) => item._id === committedId).description,
      '刷新失败也要保留的一级说明',
    );
    await f.workspace.saveScenario(scene);
    assert.equal(scene._id, committedId);
    assert.equal(f.workspace.scenarios.filter((item) => item.name === scene.name).length, 1);
    await f.workspace.reloadScenes();
    assert.equal(
      f.workspace.scenarios.find((item) => item._id === committedId).description,
      '刷新失败也要保留的一级说明',
    );
  });
  await test('bound child and parent renames cascade without unbinding or refreshing scenes', async () => {
    const f = await fixture({ bound: true });
    await f.workspace.saveWorkflow(f.workflow, {
      name: '新场景',
      code: 'demo-old',
      description: '旧目标',
    });
    const root = f.workspace.scenarios.find((item) => item.level === 1);
    await f.workspace.saveScenario({ ...root, name: '新一级场景' }, { nameOnly: true });
    const writes = f.calls.filter(([op]) =>
      ['refresh', 'rename', 'code', 'meta', 'unbind'].includes(op),
    );
    assert.deepEqual(
      writes.map(([op]) => op),
      ['rename', 'rename'],
    );
    assert.equal(writes[1][1].oldSecondScene, '');
    assert.equal(writes[1][1].newSecondScene, '');
    assert.equal(f.detail().firstScene, '新一级场景');
    assert.equal(f.detail().commands[0].commandName, '/demo-entry');
  });
  await test('deleting a referenced child uses the scene DELETE and keeps unrelated assets', async () => {
    const f = await fixture({ bound: true });
    f.scenario.skillCount = 3;
    await f.workspace.removeScenario(f.scenario);
    assert.equal(f.calls.find(([op]) => op === 'delete-scene')[1].secondScene, '代码生成');
    assert.equal(
      f.calls.some(([op]) => ['refresh', 'unbind'].includes(op)),
      false,
    );
    assert.equal(
      f.workspace.scenarios.some((item) => item._id === f.scenario._id),
      false,
    );
  });
  await test('a published Extension rejection leaves the scene and workflow intact', async () => {
    const f = await fixture({ bound: true });
    api.deleteScene = async () => ({
      meta: { isSuccess: false, message: '该场景下存在已发布的Extension，不允许删除' },
      data: null,
    });
    await assert.rejects(() => f.workspace.removeScenario(f.scenario), /Extension/);
    assert.ok(f.workspace.scenarios.some((item) => item._id === f.scenario._id));
    assert.ok(f.workspace.workflows.some((item) => item.scenarioId === f.scenario._id));
  });
  await test('root deletion requires deleting children first and omits the second scene query key', async () => {
    const f = await fixture();
    const root = f.workspace.scenarios.find((item) => item.level === 1);
    await assert.rejects(() => f.workspace.removeScenario(root), /二级场景/);
    assert.equal(
      f.calls.some(([op]) => op === 'delete-scene'),
      false,
    );
    // This fixture keeps an explicit empty root after the last child is deleted.
    const query = api.querySceneList;
    let keepRoot = true;
    api.querySceneList = async () => {
      const result = await query();
      return keepRoot && result.data.length === 0
        ? success([{ firstScene: root.name, secondScene: '', sort: 0 }])
        : result;
    };
    await f.workspace.removeScenario(f.scenario);
    keepRoot = false;
    await f.workspace.removeScenario(root);
    const deletes = f.calls.filter(([op]) => op === 'delete-scene');
    assert.equal(deletes.length, 2);
    assert.equal(Object.hasOwn(deletes[1][1], 'secondScene'), false);
    assert.equal(deletes[1][1].firstScene, '研发');
  });
  await test('code lock failure preserves the already migrated scene name for retry', async () => {
    const f = await fixture({ bound: true });
    api.updateSecondSceneCode = async () => ({
      meta: { isSuccess: false, message: 'Extension编码已锁定' },
    });
    await assert.rejects(
      () =>
        f.workspace.saveWorkflow(f.workflow, {
          name: '新场景',
          code: 'demo-new',
          description: '旧目标',
        }),
      /锁定/,
    );
    assert.equal(f.workspace.scenarios.find((item) => item._id === f.scenario._id).name, '新场景');
    assert.equal(f.detail().sceneExtensionCode, 'demo-old');
    await f.workspace.saveWorkflow(f.workflow, {
      name: '新场景',
      code: 'demo-old',
      description: '旧目标',
    });
    assert.equal(f.calls.filter(([op]) => op === 'rename').length, 1);
  });
  await test('invalid extension names are rejected on every save before HTTP mutations', async () => {
    const f = await fixture();
    for (const code of [
      '',
      'demo-',
      'Demo-name',
      'demo_name',
      'demo--name',
      'other-name',
      'demo-' + 'x'.repeat(65),
    ]) {
      await assert.rejects(
        () => f.workspace.saveWorkflow(f.workflow, { code, description: '目标' }),
        /命名|编码/,
      );
    }
    assert.equal(
      f.calls.some(([op]) => ['refresh', 'rename', 'code', 'meta'].includes(op)),
      false,
    );
  });
  await test('creating Command and Skill waits for creation then binds the scene or adds to pool', async () => {
    const f = await fixture();
    const item = {
      _id: 'new-command',
      name: '/demo-command',
      description: '入口',
      owner: '张三 u1',
      ownerId: 'u1',
      developer: '李四 u2',
      developerId: 'u2',
      version: null,
    };
    await f.workspace.createCapability('Command', item);
    await f.workspace.createCapability('Skill', {
      ...item,
      _id: 'new-skill',
      name: 'demo-skill',
      assetType: 'Skill',
      status: 'draft',
    });
    assert.deepEqual(
      f.calls.filter(([op]) => op !== 'detail').map(([op]) => op),
      ['create', 'command-bind', 'create', 'pool-add'],
    );
    const binding = f.calls.find(([op]) => op === 'command-bind')[1];
    assert.equal(binding.secondScene, '代码生成');
    assert.equal(f.calls.find(([op]) => op === 'pool-add')[1].assetType, 'SKILL');
  });
  await test('creation failure stops binding and attachment failure reports the already created capability', async () => {
    const f = await fixture();
    const item = {
      _id: 'new-agent',
      name: 'demo-agent',
      description: '',
      owner: '',
      developer: '',
      version: null,
      assetType: 'Agent',
      status: 'draft',
    };
    api.createCapability = async () => ({ meta: { success: false, message: '创建失败' } });
    await assert.rejects(() => f.workspace.createCapability('Agent', item), /创建失败/);
    assert.equal(
      f.calls.some(([op]) => op === 'pool-add'),
      false,
    );
    api.createCapability = async () => success('created-id');
    api.componentEnterPool = async () => ({ meta: { success: false, message: '入池拒绝' } });
    let created;
    await assert.rejects(
      () =>
        f.workspace.createCapability('Agent', item, (value) => {
          created = value;
        }),
      /已创建.*入池拒绝/,
    );
    assert.equal(created.sourceId, 'created-id');
  });
  await test('removing a bound node uses cascade DELETE without explicit unbinding', async () => {
    const f = await fixture();
    f.detail().stages[0].steps[0].boundAssets.push({ assetType: 'Skill', assetName: 'demo-skill' });
    f.workflow.stages[0].steps = [];
    await f.workspace.saveWorkflow(f.workflow, { code: 'demo-old', description: '旧目标' });
    const deleted = f.calls.find(([op]) => op === 'delete-activity')[1];
    assert.equal(deleted.activityNodeName, '编码');
    assert.equal(deleted.subActivityNodeName, '生成');
    assert.equal(
      f.calls.some(([op]) => op === 'unbind'),
      false,
    );
  });
} finally {
  await server.close();
  globalThis.window = previousWindow;
}
if (failed) process.exitCode = 1;

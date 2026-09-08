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
  async function fixture({ bound = false, failReadbackOnce = false } = {}) {
    storage.clear();
    const calls = [];
    let rows = [
      {
        firstScene: '研发',
        secondScene: '代码生成',
        sort: 0,
        sceneExtensionCode: 'demo-old',
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
      if (failReadbackOnce && calls.some(([op]) => op === 'refresh')) {
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
    api.componentEnterPool = async (body) => {
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
  await test('renaming a scene refreshes its identity before updating code, description and flow metadata', async () => {
    const f = await fixture();
    await f.workspace.saveWorkflow(f.workflow, {
      name: '新场景',
      code: 'demo-new',
      description: '新目标',
    });
    const writes = f.calls.filter(([op]) => ['refresh', 'code', 'meta'].includes(op));
    assert.deepEqual(
      writes.map(([op]) => op),
      ['refresh', 'code', 'meta'],
    );
    assert.equal(writes[0][1].scenes[0].secondScene, '新场景');
    assert.equal(writes[0][1].scenes[0].sceneExtensionCode, 'demo-old');
    assert.equal(writes[1][1].secondScene, '新场景');
    assert.equal(writes[1][1].secondSceneDescription, '新目标');
    assert.equal(f.workspace.scenarios.find((item) => item._id === f.scenario._id).name, '新场景');
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
    assert.equal(f.calls.filter(([op]) => op === 'refresh').length, 1);
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
      tags: [],
    };
    await assert.rejects(() => f.workspace.saveScenario(scene), /list readback outage/);
    assert.ok(scene.sourceId);
    const committedId = scene._id;
    await f.workspace.saveScenario(scene);
    assert.equal(scene._id, committedId);
    assert.equal(f.workspace.scenarios.filter((item) => item.name === scene.name).length, 1);
  });
  await test('a bound child or its parent cannot be renamed and no mutation is issued', async () => {
    const f = await fixture({ bound: true });
    await assert.rejects(
      () =>
        f.workspace.saveWorkflow(f.workflow, {
          name: '新场景',
          code: 'demo-new',
          description: '目标',
        }),
      /绑定|关联|引用/,
    );
    const root = f.workspace.scenarios.find((item) => item.level === 1);
    await assert.rejects(
      () => f.workspace.saveScenario({ ...root, name: '新一级场景' }),
      /绑定|关联|引用/,
    );
    assert.equal(
      f.calls.some(([op]) => ['refresh', 'code', 'meta'].includes(op)),
      false,
    );
  });
  await test('invalid extension names are rejected on every save before HTTP mutations', async () => {
    const f = await fixture();
    for (const code of [
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
      f.calls.some(([op]) => ['refresh', 'code', 'meta'].includes(op)),
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
  await test('removing a bound node is blocked before metadata or automatic unbinding writes', async () => {
    const f = await fixture();
    f.detail().stages[0].steps[0].boundAssets.push({ assetType: 'Skill', assetName: 'demo-skill' });
    f.workflow.stages[0].steps = [];
    await assert.rejects(
      () => f.workspace.saveWorkflow(f.workflow, { code: 'demo-new', description: '新目标' }),
      /绑定/,
    );
    assert.equal(
      f.calls.some(([op]) => ['code', 'meta', 'activities', 'unbind'].includes(op)),
      false,
    );
  });
} finally {
  await server.close();
  globalThis.window = previousWindow;
}
if (failed) process.exitCode = 1;

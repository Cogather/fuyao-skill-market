import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { effectScope, nextTick, reactive } from 'vue';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const storage = new Map();
const originalWindow = globalThis.window;
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});
let failures = 0;
const scopes = [];
const success = (data) => ({ meta: { success: true, message: '' }, data });
const failure = (message) => ({ meta: { success: false, message }, data: null });
const clone = (value) => JSON.parse(JSON.stringify(value));

async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  } finally {
    scopes.splice(0).forEach((scope) => scope.stop());
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

  async function fixture() {
    storage.clear();
    const context = reactive({
      ready: true,
      userId: 'ordering-tester',
      departmentTree: [{ name: '研发部', deptCode: 'ordering-department' }],
      defaultDepartmentPath: ['研发部'],
      allowedDepartmentPaths: [['研发部']],
      restrictToAllowedDepartments: true,
    });
    const initial = [
      ['研发提效', '接口生成'],
      ['研发提效', '代码评审'],
      ['研发提效', '代码重构'],
      ['质量保障', '测试生成'],
      ['质量保障', '缺陷分析'],
      ['交付发布', ''],
    ].map(([firstScene, secondScene], index) => ({
      firstScene,
      secondScene,
      firstSceneId: `root-${firstScene}`,
      secondSceneId: secondScene ? `child-${secondScene}` : '',
      tags: firstScene === '研发提效' ? ['研发'] : [],
      sort: index + 1,
      referenceCount: secondScene === '接口生成' ? 2 : 0,
      ...(secondScene === '接口生成'
        ? {
            sceneExtensionCode: 'demo-api',
            secondSceneDescription: '接口工作流',
            flowName: '接口生成作业流',
            flowDescription: '',
          }
        : {}),
    }));
    const rowsByProduct = new Map([
      ['ordering-product-a', clone(initial)],
      ['ordering-product-b', clone(initial)],
    ]);
    const writes = [];
    let rejectWrite = false;
    let rejectReadback = false;
    let writeGate = null;
    api.queryProducts = async () =>
      success([
        { offeringId: 'ordering-product-a', offeringName: '产品甲' },
        { offeringId: 'ordering-product-b', offeringName: '产品乙' },
      ]);
    api.querySceneList = async ({ dimCode }) =>
      rejectReadback ? failure('读取失败') : success(clone(rowsByProduct.get(dimCode)));
    api.refreshScene = async (requestContext, body) => {
      writes.push({ body: clone(body), context: clone(requestContext) });
      if (writeGate) await writeGate;
      if (rejectWrite) return failure('保存被拒绝');
      const existing = rowsByProduct.get(requestContext.dimCode);
      rowsByProduct.set(
        requestContext.dimCode,
        body.scenes.map((row) => ({
          ...existing.find(
            (item) => item.firstScene === row.firstScene && item.secondScene === row.secondScene,
          ),
          ...row,
        })),
      );
      return success(null);
    };
    api.queryHarnessWorkflowDetail = async ({ dimCode, firstScene, secondScene }) => {
      const row = rowsByProduct
        .get(dimCode)
        .find((item) => item.firstScene === firstScene && item.secondScene === secondScene);
      return success({
        ...row,
        commands: [],
        assetPool: [],
        stages: row.flowName ? [{ activityNodeName: '设计', sort: 0, steps: [] }] : [],
        steps: [],
        nextStep: 1,
        allDone: false,
      });
    };

    async function open() {
      const scope = effectScope();
      scopes.push(scope);
      const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
      for (let attempt = 0; attempt < 100 && !workspace.available.value; attempt += 1) {
        await nextTick();
        await setImmediate();
      }
      assert.equal(workspace.error.value, '');
      assert.equal(workspace.available.value, true, 'fixture scenarios should finish loading');
      await workspace.loadSelectedWorkflow();
      return workspace;
    }

    const workspace = await open();
    const scene = (name, productId = workspace.productId.value) => {
      const found = workspace.scenarios.find(
        (item) => item.name === name && item.productId === productId,
      );
      assert.ok(found, `missing scenario: ${name}`);
      return found;
    };
    const names = (parentId = null, source = workspace) =>
      source.scenarios
        .filter((item) => item.productId === source.productId.value && item.parentId === parentId)
        .map((item) => item.name);
    return {
      workspace,
      context,
      scene,
      names,
      writes,
      open,
      rejectWrite: (value) => (rejectWrite = value),
      rejectReadback: (value) => (rejectReadback = value),
      holdWrite: () => {
        let release;
        writeGate = new Promise((resolve) => (release = resolve));
        return release;
      },
    };
  }

  await test('root reordering persists once and keeps IDs, hierarchy, metadata and workflows', async () => {
    const { workspace, scene, names, writes, open } = await fixture();
    const child = scene('接口生成');
    workspace.selectedScenarioId.value = child._id;
    const workflow = workspace.ensureWorkflow(child._id);
    const before = clone(workspace.scenarios);
    const savedWorkflow = clone(workflow);

    await workspace.reorderScenario(scene('交付发布')._id, scene('研发提效')._id, 'before');

    assert.deepEqual(names(), ['交付发布', '研发提效', '质量保障']);
    assert.deepEqual(names(scene('研发提效')._id), ['接口生成', '代码评审', '代码重构']);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].context, {
      userId: 'ordering-tester',
      dimType: '产品级',
      dimCode: 'ordering-product-a',
      dimName: '产品甲',
    });
    assert.deepEqual(writes[0].body.scenes, [
      { firstScene: '交付发布', secondScene: '', sort: 0 },
      {
        firstScene: '研发提效',
        secondScene: '接口生成',
        sort: 1,
        sceneExtensionCode: 'demo-api',
        secondSceneDescription: '接口工作流',
        flowName: '接口生成作业流',
        flowDescription: '',
      },
      { firstScene: '研发提效', secondScene: '代码评审', sort: 2 },
      { firstScene: '研发提效', secondScene: '代码重构', sort: 3 },
      { firstScene: '质量保障', secondScene: '测试生成', sort: 4 },
      { firstScene: '质量保障', secondScene: '缺陷分析', sort: 5 },
    ]);
    for (const prior of before) {
      assert.deepEqual(
        workspace.scenarios.find((item) => item._id === prior._id),
        prior,
      );
    }
    assert.equal(workspace.selectedScenarioId.value, child._id);
    assert.deepEqual(clone(workspace.workflows), [savedWorkflow]);
    await nextTick();
    scopes.splice(0).forEach((scope) => scope.stop());
    const reopened = await open();
    assert.deepEqual(names(null, reopened), ['交付发布', '研发提效', '质量保障']);
    assert.deepEqual(clone(reopened.workflows), [savedWorkflow]);
    assert.equal(reopened.selectedScenarioId.value, child._id);
  });

  await test('child reordering supports distant before and after positions without moving other groups', async () => {
    const { workspace, scene, names, writes } = await fixture();
    const parentId = scene('研发提效')._id;
    await workspace.reorderScenario(scene('代码重构')._id, scene('接口生成')._id, 'before');
    assert.deepEqual(names(parentId), ['代码重构', '接口生成', '代码评审']);
    await workspace.reorderScenario(scene('代码重构')._id, scene('代码评审')._id, 'after');
    assert.deepEqual(names(parentId), ['接口生成', '代码评审', '代码重构']);
    assert.deepEqual(names(), ['研发提效', '质量保障', '交付发布']);
    assert.deepEqual(names(scene('质量保障')._id), ['测试生成', '缺陷分析']);
    assert.equal(writes.length, 2);
  });

  await test('self drops and already-adjacent placements do not save', async () => {
    const { workspace, scene, writes } = await fixture();
    const before = clone(workspace.scenarios);
    await workspace.reorderScenario(scene('接口生成')._id, scene('接口生成')._id, 'before');
    await workspace.reorderScenario(scene('接口生成')._id, scene('代码评审')._id, 'before');
    await workspace.reorderScenario(scene('代码评审')._id, scene('接口生成')._id, 'after');
    assert.equal(writes.length, 0);
    assert.deepEqual(clone(workspace.scenarios), before);
  });

  await test('unknown IDs, cross-parent drops, cross-level drops and invalid placements reject without saving', async () => {
    const { workspace, scene, writes } = await fixture();
    const before = clone(workspace.scenarios);
    for (const [sourceId, targetId, placement] of [
      ['missing', scene('接口生成')._id, 'before'],
      [scene('接口生成')._id, 'missing', 'after'],
      [scene('接口生成').sourceId, scene('代码评审').sourceId, 'before'],
      [scene('接口生成')._id, scene('测试生成')._id, 'before'],
      [scene('研发提效')._id, scene('接口生成')._id, 'before'],
      [scene('接口生成')._id, scene('代码评审')._id, 'inside'],
    ]) {
      await assert.rejects(() => workspace.reorderScenario(sourceId, targetId, placement));
    }
    assert.equal(writes.length, 0);
    assert.deepEqual(clone(workspace.scenarios), before);
  });

  await test('cross-product IDs and a pair from another product cannot reorder the current product', async () => {
    const { workspace, scene, writes } = await fixture();
    const otherProduct = workspace.productOptions.value[1]._id;
    const before = clone(workspace.scenarios);
    for (const [sourceId, targetId] of [
      [scene('研发提效')._id, scene('交付发布', otherProduct)._id],
      [scene('交付发布', otherProduct)._id, scene('研发提效')._id],
      [scene('研发提效', otherProduct)._id, scene('交付发布', otherProduct)._id],
    ]) {
      await assert.rejects(() => workspace.reorderScenario(sourceId, targetId, 'before'));
    }
    assert.equal(writes.length, 0);
    assert.deepEqual(clone(workspace.scenarios), before);
  });

  await test('loading or unavailable permissions prevent reordering', async () => {
    const { workspace, context, scene, writes } = await fixture();
    const sourceId = scene('交付发布')._id;
    const targetId = scene('研发提效')._id;
    workspace.loading.value = true;
    await assert.rejects(() => workspace.reorderScenario(sourceId, targetId, 'before'));
    workspace.loading.value = false;
    context.ready = false;
    await assert.rejects(() => workspace.reorderScenario(sourceId, targetId, 'before'));
    assert.equal(writes.length, 0);
  });

  await test('pending persistence leaves the visible order unchanged and rejects a concurrent save', async () => {
    const { workspace, scene, names, writes, holdWrite } = await fixture();
    const release = holdWrite();
    const pending = workspace.reorderScenario(
      scene('交付发布')._id,
      scene('研发提效')._id,
      'before',
    );
    try {
      assert.equal(workspace.saving.value, true);
      assert.deepEqual(names(), ['研发提效', '质量保障', '交付发布']);
      await assert.rejects(() =>
        workspace.reorderScenario(scene('质量保障')._id, scene('研发提效')._id, 'before'),
      );
      assert.equal(writes.length, 1);
    } finally {
      release();
      await pending;
    }
    assert.equal(workspace.saving.value, false);
    assert.deepEqual(names(), ['交付发布', '研发提效', '质量保障']);
  });

  await test('rejected persistence preserves the visible order and the order used by the next save', async () => {
    const { workspace, scene, names, writes, rejectWrite } = await fixture();
    const before = clone(workspace.scenarios);
    rejectWrite(true);
    await assert.rejects(
      () => workspace.reorderScenario(scene('交付发布')._id, scene('研发提效')._id, 'before'),
      /保存被拒绝/,
    );
    assert.deepEqual(clone(workspace.scenarios), before);
    assert.equal(workspace.saving.value, false);
    rejectWrite(false);
    await workspace.reorderScenario(scene('质量保障')._id, scene('交付发布')._id, 'after');
    assert.deepEqual(names(), ['研发提效', '交付发布', '质量保障']);
    assert.equal(writes.length, 2);
  });

  await test('a failed readback retains the committed order and existing workflow association', async () => {
    const { workspace, scene, names, rejectReadback } = await fixture();
    const workflow = workspace.ensureWorkflow(scene('接口生成')._id);
    const savedWorkflow = clone(workflow);
    rejectReadback(true);
    await assert.rejects(
      () => workspace.reorderScenario(scene('交付发布')._id, scene('研发提效')._id, 'before'),
      /场景已保存，但刷新最新配置失败/,
    );
    assert.deepEqual(names(), ['交付发布', '研发提效', '质量保障']);
    assert.deepEqual(clone(workspace.workflows), [savedWorkflow]);
    assert.equal(workspace.saving.value, false);
    rejectReadback(false);
    await workspace.reloadScenes();
    assert.deepEqual(names(), ['交付发布', '研发提效', '质量保障']);
    assert.deepEqual(clone(workspace.workflows), [savedWorkflow]);
  });
} finally {
  scopes.splice(0).forEach((scope) => scope.stop());
  await server.close();
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

if (failures) {
  process.exitCode = 1;
  console.error(`${failures} scenario ordering regression test(s) failed`);
} else {
  console.log('All scenario ordering regression tests passed');
}

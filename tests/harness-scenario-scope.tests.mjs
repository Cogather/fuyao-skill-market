import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { effectScope, nextTick, reactive } from 'vue';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const originalWindow = globalThis.window;
globalThis.window = {
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
  },
};

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});
const scopes = [];
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
let failures = 0;

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

async function settleUntil(predicate, message) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) {
    await nextTick();
    await setImmediate();
  }
  assert.equal(predicate(), true, message);
}

try {
  const capabilityPickerSource = await readFile(
    new URL('../src/components/skill/WorkflowCapabilityPicker.vue', import.meta.url),
    'utf8',
  );
  const scenarioPageSource = await readFile(
    new URL('../src/views/skill/BusinessScenarioDesignPage.vue', import.meta.url),
    'utf8',
  );
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const { createHarnessScenarioWorkspace } = await server.ssrLoadModule(
    '/src/composables/useHarnessScenarioWorkspace.ts',
  );

  await test('capability search scope copy follows the selected design level', () => {
    assert.match(capabilityPickerSource, /scopeLevel\?: HarnessScopeLevel/);
    assert.match(capabilityPickerSource, /props\.scopeLevel === '部门级' \? '部门' : '产品'/);
    assert.equal(scenarioPageSource.match(/:scope-level="scopeLevel"/g)?.length, 2);
  });

  await test('switching to department level reloads scenarios with department dimensions', async () => {
    const sceneQueries = [];
    let productQueries = 0;
    api.queryProducts = async () => {
      productQueries += 1;
      return success([{ offeringId: 'product-code', offeringName: 'harness-pipeline' }]);
    };
    api.querySceneList = async (scope) => {
      sceneQueries.push(structuredClone(scope));
      return success([
        {
          firstScene: scope.dimType === '部门级' ? '部门场景' : '产品场景',
          secondScene: '持续交付',
          firstSceneId: `${scope.dimCode}-root`,
          secondSceneId: `${scope.dimCode}-child`,
          sort: 0,
          referenceCount: 0,
        },
      ]);
    };
    api.queryHarnessWorkflowDetail = async () =>
      success({
        flowName: '',
        flowDescription: '',
        sceneExtensionCode: '',
        secondSceneDescription: '',
        commands: [],
        assetPool: [],
        stages: [],
        steps: [],
        nextStep: 0,
        allDone: false,
      });

    const context = reactive({
      ready: true,
      userId: 'scope-tester',
      departmentTree: [
        { id: 'dept-design', deptCode: 'dept-design', name: '研发部', children: [] },
      ],
      defaultDepartmentPath: ['研发部'],
      allowedDepartmentPaths: [['研发部']],
      restrictToAllowedDepartments: true,
    });
    const scope = effectScope();
    scopes.push(scope);
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));

    await settleUntil(
      () =>
        workspace.available.value && workspace.scenarios.some((item) => item.name === '产品场景'),
      'product-level scenarios should load initially',
    );
    assert.equal(workspace.scopeLevel.value, '产品级');
    assert.equal(productQueries, 1);

    workspace.selectLevel('部门级');

    await settleUntil(
      () =>
        workspace.available.value &&
        workspace.scenarios.some((item) => item.name === '部门场景') &&
        sceneQueries.at(-1)?.dimType === '部门级',
      'department-level scenarios should replace the product-level scope',
    );
    assert.equal(productQueries, 1, 'department scope must not request a product list');
    assert.equal(workspace.productOptions.value.length, 0);
    assert.deepEqual(
      workspace.inventoryProductOptions.value.map((item) => item.name),
      ['harness-pipeline'],
      'switching design scope must retain product options used by the workflow inventory',
    );
    assert.deepEqual(sceneQueries.at(-1), {
      userId: 'scope-tester',
      dimType: '部门级',
      dimCode: 'dept-design',
      dimName: '研发部',
    });
  });

  await test('department-level writes use department dimensions without product prefixes', async () => {
    const capabilityCalls = [];
    const sceneWrites = [];
    const sceneCodeWrites = [];
    let sceneRows = [
      {
        firstScene: '交付保障',
        secondScene: '发布检查',
        firstSceneId: 'dept-devops-root',
        secondSceneId: 'dept-devops-child',
        sort: 0,
        referenceCount: 0,
      },
    ];
    api.queryProducts = async () =>
      success([{ offeringId: 'product-code', offeringName: 'harness-pipeline' }]);
    api.querySceneList = async () => success(structuredClone(sceneRows));
    api.refreshScene = async (scope, body) => {
      sceneWrites.push({ scope: structuredClone(scope), body: structuredClone(body) });
      sceneRows = body.scenes.map((item) => ({
        ...item,
        firstSceneId: `root-${item.firstScene}`,
        secondSceneId: item.secondScene ? `child-${item.secondScene}` : '',
        referenceCount: 0,
      }));
      return success(null);
    };
    api.updateSecondSceneCode = async (body, scope) => {
      sceneCodeWrites.push({ scope: structuredClone(scope), body: structuredClone(body) });
      return success(null);
    };
    api.queryHarnessWorkflowDetail = async () =>
      success({
        flowName: '',
        flowDescription: '',
        sceneExtensionCode: '',
        secondSceneDescription: '',
        commands: [],
        assetPool: [],
        stages: [],
        steps: [],
        nextStep: 0,
        allDone: false,
      });
    api.createCapability = async (type, body, scope) => {
      capabilityCalls.push({ type, body: structuredClone(body), scope: structuredClone(scope) });
      return success('created-command');
    };

    const context = reactive({
      ready: true,
      userId: 'scope-tester',
      departmentTree: [
        { id: 'dept-devops', deptCode: 'dept-devops', name: 'devops', children: [] },
      ],
      defaultDepartmentPath: ['devops'],
      allowedDepartmentPaths: [['devops']],
      restrictToAllowedDepartments: true,
    });
    const scope = effectScope();
    scopes.push(scope);
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
    await settleUntil(() => workspace.available.value, 'product-level scope should load');
    workspace.selectLevel('部门级');
    await settleUntil(
      () =>
        workspace.available.value &&
        workspace.scopeLevel.value === '部门级' &&
        workspace.products.some(
          (item) => item._id === workspace.productId.value && item.scopeLevel === '部门级',
        ),
      'department-level scope should load',
    );

    await workspace.createCapability('Command', {
      _id: 'draft-command',
      name: '/release-check',
      description: '发布前检查',
      owner: '负责人 owner-1',
      ownerId: 'owner-1',
      developer: '开发人 developer-1',
      developerId: 'developer-1',
      version: null,
      dueDate: '2026-12-31',
    });

    assert.equal(capabilityCalls.length, 1);
    assert.equal(capabilityCalls[0].type, 'COMMAND');
    assert.deepEqual(capabilityCalls[0].scope, {
      userId: 'scope-tester',
      dimType: '部门级',
      dimCode: 'dept-devops',
      dimName: 'devops',
    });
    assert.equal(capabilityCalls[0].body.commandName, 'release-check');

    const parent = workspace.scenarios.find(
      (item) => item.productId === workspace.productId.value && item.parentId === null,
    );
    assert.ok(parent);
    await workspace.saveScenario({
      _id: 'draft-scene',
      name: '变更复盘',
      code: 'change-review',
      description: '部门级场景不使用产品名前缀',
      parentId: parent._id,
      level: 2,
      productId: workspace.productId.value,
      tags: [],
    });
    assert.deepEqual(sceneWrites.at(-1).scope, {
      userId: 'scope-tester',
      dimType: '部门级',
      dimCode: 'dept-devops',
      dimName: 'devops',
    });
    assert.deepEqual(sceneCodeWrites.at(-1).scope, sceneWrites.at(-1).scope);
    assert.equal(sceneCodeWrites.at(-1).body.sceneExtensionCode, 'change-review');
  });
  for (const restrictToAllowedDepartments of [true, false]) {
    await test(`both design levels require department permissions (tree restriction ${restrictToAllowedDepartments})`, async () => {
      const sceneQueries = [];
      const capabilityCalls = [];
      const productQueries = [];
      api.queryProducts = async ({ deptCode }) => {
        productQueries.push(deptCode);
        return success([{ offeringId: 'allowed-offering', offeringName: 'allowed-product' }]);
      };
      api.querySceneList = async (dimension) => {
        sceneQueries.push(structuredClone(dimension));
        return success([]);
      };
      api.createCapability = async (type, body, dimension) => {
        capabilityCalls.push({ type, body, dimension: structuredClone(dimension) });
        return success('created-command');
      };
      const context = reactive({
        ready: true,
        userId: 'parent-injected-user',
        departmentTree: [
          { id: 'outside', deptCode: 'outside-code', name: '外部部门', children: [] },
          {
            id: 'allowed',
            deptCode: 'allowed-code',
            name: '授权部门',
            children: [{ id: 'child', deptCode: 'child-code', name: '子部门', children: [] }],
          },
        ],
        defaultDepartmentPath: ['外部部门'],
        allowedDepartmentPaths: [['授权部门']],
        restrictToAllowedDepartments,
      });
      const scope = effectScope();
      scopes.push(scope);
      const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
      await settleUntil(() => workspace.available.value, 'product-level data should load');
      assert.equal(
        workspace.selectedDeptId.value,
        'allowed-code',
        'product scope replaces an unauthorized default department',
      );
      assert.deepEqual(
        workspace.departments.map((item) => item.deptCode),
        restrictToAllowedDepartments
          ? ['allowed-code', 'child-code']
          : ['outside-code', 'allowed-code', 'child-code'],
      );
      assert.equal(
        workspace.canManageDepartment.value,
        true,
        'authorized product-level management remains available',
      );
      assert.deepEqual(sceneQueries.at(-1), {
        userId: 'parent-injected-user',
        dimType: '产品级',
        dimCode: 'allowed-offering',
        dimName: 'allowed-product',
      });
      workspace.selectDepartment('outside-code');
      await nextTick();
      assert.equal(workspace.selectedDeptId.value, 'allowed-code');
      assert.deepEqual(productQueries, ['allowed-code'], 'unauthorized products are never queried');
      const command = {
        _id: 'draft',
        name: '/allowed-product-check',
        description: '产品检查',
        owner: 'owner',
        ownerId: 'owner',
        developer: 'developer',
        developerId: 'developer',
        version: null,
        dueDate: null,
      };
      await workspace.createCapability('Command', command);
      assert.equal(capabilityCalls.length, 1, 'product-level write reaches the backend');
      assert.deepEqual(capabilityCalls[0].dimension, {
        userId: 'parent-injected-user',
        dimType: '产品级',
        dimCode: 'allowed-offering',
        dimName: 'allowed-product',
      });

      sceneQueries.length = 0;
      workspace.selectLevel('部门级');
      await settleUntil(
        () => workspace.available.value && sceneQueries.some((item) => item.dimType === '部门级'),
        'authorized department scope should load after switching levels',
      );
      assert.equal(workspace.selectedDeptId.value, 'allowed-code');
      assert.ok(
        sceneQueries.every((item) => item.dimType === '部门级' && item.dimCode === 'allowed-code'),
        'transition must not request unauthorized department data',
      );
      assert.deepEqual(sceneQueries.at(-1), {
        userId: 'parent-injected-user',
        dimType: '部门级',
        dimCode: 'allowed-code',
        dimName: '授权部门',
      });
      assert.deepEqual(
        workspace.departments.map((item) => item.deptCode),
        restrictToAllowedDepartments
          ? ['allowed-code', 'child-code']
          : ['outside-code', 'allowed-code', 'child-code'],
      );
      workspace.selectDepartment('outside-code');
      assert.equal(
        workspace.selectedDeptId.value,
        'allowed-code',
        'unauthorized department selection is blocked',
      );
      workspace.selectDepartment('child-code');
      await settleUntil(
        () => workspace.available.value && sceneQueries.at(-1)?.dimCode === 'child-code',
        'authorized descendants remain selectable',
      );
      assert.equal(workspace.canManageDepartment.value, true);

      workspace.selectLevel('产品级');
      await settleUntil(
        () => workspace.available.value && sceneQueries.at(-1)?.dimType === '产品级',
        'product scope should reload',
      );
      assert.deepEqual(
        workspace.departments.map((item) => item.deptCode),
        restrictToAllowedDepartments
          ? ['allowed-code', 'child-code']
          : ['outside-code', 'allowed-code', 'child-code'],
      );
      workspace.selectDepartment('outside-code');
      await nextTick();
      assert.equal(workspace.selectedDeptId.value, 'child-code');
      assert.ok(!productQueries.includes('outside-code'));
      assert.equal(workspace.canManageDepartment.value, true);
      assert.deepEqual(
        context.allowedDepartmentPaths,
        [['授权部门']],
        'permission data stays unchanged',
      );
    });
  }

  await test('read-only filters cap selections without losing descendant metadata or granting write access', async () => {
    api.queryProducts = async () => success([{ offeringId: 'product', offeringName: 'product' }]);
    api.querySceneList = async () => success([]);
    const names = Array.from({ length: 8 }, (_, index) => `部门${index + 1}`);
    const context = reactive({
      ready: true,
      userId: 'list-depth-user',
      departmentTree: names.reduceRight(
        (children, name, index) => [{ id: `dept-${index + 1}`, name, children }],
        [],
      ),
      defaultDepartmentPath: names.slice(0, 5),
      allowedDepartmentPaths: [names.slice(0, 5)],
      restrictToAllowedDepartments: true,
      departmentMaxLevel: Number.POSITIVE_INFINITY,
      readOnlyDepartmentSelection: false,
    });
    const scope = effectScope();
    scopes.push(scope);
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
    workspace.selectLevel('部门级');
    await settleUntil(() => workspace.available.value, 'department scope should load');
    workspace.selectDepartment('dept-8');
    await settleUntil(() => workspace.available.value, 'deep department should load');
    workspace.products.push({
      _id: 'deep-product',
      name: '下级产品',
      code: 'deep-product',
      departmentId: 'dept-8',
    });

    Object.assign(context, {
      restrictToAllowedDepartments: false,
      readOnlyDepartmentSelection: true,
      departmentMaxLevel: 4,
    });
    await nextTick();
    assert.equal(workspace.selectedDeptId.value, 'dept-4');
    assert.equal(workspace.departments.length, 8, 'keep metadata for deep workflow rows');
    assert.equal(workspace.workflowListScope.value.dimName, names.slice(0, 4).join('/'));
    assert.ok(workspace.inventoryProductOptions.value.some((item) => item._id === 'deep-product'));
    workspace.selectDepartment('dept-8');
    assert.equal(
      workspace.selectedDeptId.value,
      'dept-4',
      'filter cannot select beyond four levels',
    );
    workspace.selectDepartment('dept-3');
    assert.equal(
      workspace.selectedDeptId.value,
      'dept-3',
      'read-only filters can select ancestors',
    );
    assert.equal(workspace.canManageDepartment.value, false);
    await assert.rejects(
      () => workspace.createCapability('Command', { name: '/check' }),
      /无管理权限/,
    );

    Object.assign(context, {
      readOnlyDepartmentSelection: false,
      restrictToAllowedDepartments: true,
      departmentMaxLevel: Number.POSITIVE_INFINITY,
    });
    await settleUntil(() => workspace.available.value, 'authorized scenario scope should reload');
    assert.equal(workspace.selectedDeptId.value, 'dept-5');
    workspace.selectDepartment('dept-4');
    assert.equal(
      workspace.selectedDeptId.value,
      'dept-5',
      'scenario ancestors remain navigation only',
    );
    workspace.selectDepartment('dept-8');
    assert.equal(
      workspace.selectedDeptId.value,
      'dept-8',
      'scenario department depth stays unlimited',
    );
  });

  await test('both design levels without any authorized node block data and writes', async () => {
    const sceneQueries = [];
    const productQueries = [];
    let writes = 0;
    api.queryProducts = async ({ deptCode }) => {
      productQueries.push(deptCode);
      return success([{ offeringId: 'product-code', offeringName: 'test-product' }]);
    };
    api.querySceneList = async (dimension) => {
      sceneQueries.push(structuredClone(dimension));
      return success([]);
    };
    api.createCapability = async () => {
      writes += 1;
      return success('created');
    };
    const context = reactive({
      ready: true,
      userId: 'parent-user',
      departmentTree: [{ id: 'outside', name: '外部部门', children: [] }],
      defaultDepartmentPath: ['外部部门'],
      allowedDepartmentPaths: [],
      restrictToAllowedDepartments: false,
    });
    const scope = effectScope();
    scopes.push(scope);
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
    for (const level of ['产品级', '部门级']) {
      workspace.selectLevel(level);
      await nextTick();
      await setImmediate();
      assert.equal(workspace.selectedDeptId.value, '');
      assert.equal(workspace.available.value, false);
      assert.equal(workspace.canManageDepartment.value, false);
      assert.deepEqual(productQueries, [], 'no product request is allowed without permission');
      assert.deepEqual(sceneQueries, [], 'no scene request is allowed without permission');
      await assert.rejects(
        () => workspace.createCapability('Command', { name: '/check' }),
        /无管理权限/,
      );
    }
    assert.equal(writes, 0);
  });
} finally {
  await server.close();
  globalThis.window = originalWindow;
}

if (failures) process.exitCode = 1;

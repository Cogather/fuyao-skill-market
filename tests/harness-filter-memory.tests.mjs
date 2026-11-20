import assert from 'node:assert/strict';
import { effectScope, nextTick, reactive, ref } from 'vue';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const originalWindow = globalThis.window;
const storage = new Map();
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
const scopes = [];
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
async function settle(predicate) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++) {
    await nextTick();
    await setImmediate();
  }
  assert.ok(predicate(), 'workspace should finish restoring');
}
function inScope(create) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(create);
}

try {
  const memory = await server.ssrLoadModule('/src/composables/useHarnessFilterMemory.ts');
  const userId = ref('user-a');
  const filters = inScope(() =>
    memory.useHarnessFilterMemory(
      () => userId.value,
      'asset-list',
      memory.isListFilterSnapshot,
      () => undefined,
    ),
  );
  filters.value = { departmentId: 'department-a', productId: 'product-a' };
  userId.value = 'user-b';
  assert.equal(filters.value, undefined, 'another user starts with their own defaults');
  filters.value = { departmentId: '', productId: '' };
  userId.value = 'user-a';
  assert.equal(filters.value.productId, 'product-a', 'switching users must not overwrite memory');
  const reopened = inScope(() =>
    memory.useHarnessFilterMemory(
      () => 'user-b',
      'asset-list',
      memory.isListFilterSnapshot,
      () => undefined,
    ),
  );
  assert.deepEqual(reopened.value, { departmentId: '', productId: '' });
  const key = [...storage.keys()].find((item) => item.includes(':user-a:'));
  for (const invalid of ['{broken', '{"departmentId": [], "productId": 42}']) {
    storage.set(key, invalid);
    assert.equal(
      memory.readHarnessFilterMemory('user-a', 'asset-list', memory.isListFilterSnapshot),
      undefined,
    );
  }
  const accessibleStorage = window.localStorage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Storage disabled');
    },
  });
  assert.doesNotThrow(() => {
    filters.value = { departmentId: 'still-usable', productId: '' };
  });
  assert.equal(filters.value.departmentId, 'still-usable');
  assert.equal(
    memory.readHarnessFilterMemory('user-a', 'asset-list', memory.isListFilterSnapshot),
    undefined,
  );
  Object.defineProperty(window, 'localStorage', { configurable: true, value: accessibleStorage });
  console.log('PASS user isolation, cleared filters, corrupt data and unavailable storage');

  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  api.queryProducts = async () =>
    success([
      { offeringId: 'first', offeringName: 'first-product' },
      { offeringId: 'second', offeringName: 'second-product' },
    ]);
  api.querySceneList = async () => success([]);
  const { createHarnessScenarioWorkspace } = await server.ssrLoadModule(
    '/src/composables/useHarnessScenarioWorkspace.ts',
  );
  function createContext() {
    return reactive({
      ready: true,
      userId: 'workspace-user',
      departmentTree: [
        { id: 'allowed', name: '授权部门', children: [] },
        { id: 'outside', name: '其他部门', children: [] },
      ],
      defaultDepartmentPath: ['授权部门'],
      allowedDepartmentPaths: [['授权部门']],
      restrictToAllowedDepartments: true,
      filterKey: 'scenarios',
    });
  }
  const context = createContext();
  const workspace = inScope(() => createHarnessScenarioWorkspace(() => context));
  await settle(() => workspace.available.value);
  workspace.productId.value = workspace.products.find((item) => item.code === 'second')._id;
  await nextTick();
  const restoredContext = createContext();
  const restored = inScope(() => createHarnessScenarioWorkspace(() => restoredContext));
  await settle(() => restored.available.value);
  assert.equal(
    restored.products.find((item) => item._id === restored.productId.value).code,
    'second',
  );
  context.filterKey = 'workflows';
  await settle(() => workspace.available.value);
  assert.equal(
    workspace.products.find((item) => item._id === workspace.productId.value).code,
    'first',
  );
  context.filterKey = 'scenarios';
  await settle(() => workspace.available.value);
  assert.equal(
    workspace.products.find((item) => item._id === workspace.productId.value).code,
    'second',
  );

  memory.writeHarnessFilterMemory('workspace-user', 'workspace:scenarios', {
    level: '产品级',
    departmentId: 'outside',
    product: { offeringId: 'removed', offeringName: 'removed-product' },
  });
  const validatedContext = createContext();
  const validated = inScope(() => createHarnessScenarioWorkspace(() => validatedContext));
  await settle(() => validated.available.value);
  assert.equal(
    validated.selectedDeptId.value,
    'allowed',
    'storage cannot restore an unauthorized department',
  );
  assert.equal(
    validated.products.find((item) => item._id === validated.productId.value).code,
    'first',
  );
  console.log('PASS workspace reload, independent tab selections and invalid scope fallback');
} finally {
  scopes.forEach((scope) => scope.stop());
  await server.close();
  globalThis.window = originalWindow;
}

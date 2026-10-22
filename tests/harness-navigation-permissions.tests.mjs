import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createPinia, setActivePinia } from 'pinia';
import { createRenderer, createSSRApp, h, nextTick, ssrContextKey } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const renderer = createRenderer({
  createElement: () => ({}),
  insert() {},
  remove() {},
  setElementText() {},
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setComment() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
});
const settle = async () => {
  await nextTick();
  await setImmediate();
  await nextTick();
};

try {
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const { useSkillMarketStore } = await server.ssrLoadModule('/src/stores/skillMarketStore.ts');
  const { default: HarnessManagementPage } = await server.ssrLoadModule(
    '/src/views/HarnessManagementPage.vue',
  );
  globalThis.window = {
    location: { href: 'http://localhost/' },
    scrollY: 0,
    addEventListener() {},
    removeEventListener() {},
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      return setTimeout(callback, 0);
    },
    cancelAnimationFrame(handle) {
      clearTimeout(handle);
    },
  };
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
  };

  async function mountHarness(permissionData) {
    skillBaseService.queryHarnessDeptPermissions = async () => ({
      meta: { success: true },
      data: permissionData,
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    const market = useSkillMarketStore(pinia);
    market.userId = 'permission-user';
    market.departmentList = [
      {
        deptId: 'dept-root',
        deptCode: 'dept-root',
        deptName: '研发部',
        deptLevel: 1,
        children: [],
      },
    ];
    let state;
    const Host = {
      setup() {
        state = HarnessManagementPage.setup({}, { expose() {} });
        return () => h('div');
      },
    };
    const app = renderer.createApp(Host);
    app.use(pinia);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount({});
    await settle();
    return { app, state };
  }

  const alwaysVisibleTabKeys = ['workflows', 'capabilities', 'assets', 'tasks'];
  const taskOnly = await mountHarness({ ownedOrgs: [], adminOrgs: [] });
  assert.deepEqual(
    taskOnly.state.visibleHarnessTabs.value.map((tab) => tab.key),
    alwaysVisibleTabKeys,
    'users without owner or admin scope only see the unrestricted Harness tabs',
  );
  assert.equal(
    taskOnly.state.activeHarnessTab.value,
    'workflows',
    'users without management scope land on the first visible tab',
  );
  taskOnly.app.unmount();

  async function renderTaskOnlyPanel(activeTab) {
    const originalSetup = HarnessManagementPage.setup;
    HarnessManagementPage.setup = (props, context) => {
      const state = originalSetup(props, context);
      state.permissionContextReady.value = true;
      state.harnessPermissionLoadState.value = 'ready';
      state.harnessPermissions.value = {
        accessLevel: 'task-only',
        ownedOrgs: [],
        adminOrgs: [],
        manageableOrgs: [],
      };
      state.activeHarnessTab.value = activeTab;
      return state;
    };
    try {
      const app = createSSRApp(HarnessManagementPage);
      app.use(createPinia());
      return await renderToString(app);
    } finally {
      HarnessManagementPage.setup = originalSetup;
    }
  }

  const workflowPanel = await renderTaskOnlyPanel('workflows');
  assert.match(
    workflowPanel,
    /class="workflows-page harness-viewport-page"/,
    'the public workflow panel renders without management scope',
  );

  const adminOnly = await mountHarness({
    ownedOrgs: [],
    adminOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
  });
  assert.deepEqual(
    adminOnly.state.visibleHarnessTabs.value.map((tab) => tab.key),
    ['scenarios', ...alwaysVisibleTabKeys],
    'an admin sees scenario design but not permission management',
  );
  adminOnly.app.unmount();

  const owner = await mountHarness({
    ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
    adminOrgs: [],
  });
  assert.deepEqual(
    owner.state.visibleHarnessTabs.value.map((tab) => tab.key),
    ['scenarios', 'workflows', 'capabilities', 'assets', 'settings', 'tasks'],
    'an owner sees both scenario design and permission management',
  );
  owner.app.unmount();

  const { default: AgentSkillAssetsPage } = await server.ssrLoadModule(
    '/src/views/skill/AgentSkillAssetsPage.vue',
  );
  const originalAssetSetup = AgentSkillAssetsPage.setup;
  const departmentTree = [
    {
      id: 'root',
      deptCode: 'root',
      name: '研发部',
      children: [
        { id: 'allowed', deptCode: 'allowed', name: '平台组', children: [] },
        { id: 'denied', deptCode: 'denied', name: '其他组', children: [] },
      ],
    },
  ];
  const assetProps = {
    userId: 'permission-user',
    userName: '权限用户',
    departmentTree,
    currentUserDepartmentPath: ['研发部', '平台组'],
    allowedDepartmentPaths: [['研发部', '平台组']],
    restrictToAllowedDepartments: true,
  };
  const baseAsset = {
    id: 'agent-permission',
    name: '权限测试 Agent',
    description: '验证卡片操作可见性',
    assetType: 'Agent',
    currentVersion: '1.0.0',
    versions: ['1.0.0'],
    owner: '责任人 w0001',
    developer: '开发人 w0002',
    departmentName: '平台组',
    departmentPath: ['研发部', '平台组'],
    productId: 'product-harness',
    productName: 'harness-pipeline',
    category: '产品级/harness-pipeline',
    auto: false,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    releases: [],
    publishable: false,
  };

  async function renderAssetMenu(canEdit) {
    let state;
    AgentSkillAssetsPage.setup = (props, context) => {
      state = originalAssetSetup(props, context);
      const asset = { ...baseAsset, canEdit };
      state.assets.value = [asset];
      state.listLoading.value = false;
      state.listError.value = '';
      state.cardMenuKey.value = `Agent:${asset.id}`;
      return state;
    };
    const html = await renderToString(createSSRApp(AgentSkillAssetsPage, assetProps));
    return { html, state };
  }

  const denied = await renderAssetMenu(false);
  assert.match(denied.html, /查看详情/, 'the card menu remains available for viewing');
  assert.doesNotMatch(denied.html, /编辑信息/, 'unauthorized card editing is hidden');
  assert.doesNotMatch(denied.html, />\s*删除\s*</, 'unauthorized card deletion is hidden');
  assert.deepEqual(
    denied.state.manageableDepartmentTree.value[0].children.map((node) => node.name),
    ['平台组'],
    'create, import and export scopes only receive manageable departments',
  );

  const allowed = await renderAssetMenu(true);
  assert.match(allowed.html, /编辑信息/, 'authorized card editing stays visible');
  assert.match(allowed.html, />\s*删除\s*</, 'authorized card deletion stays visible');
  AgentSkillAssetsPage.setup = originalAssetSetup;

  console.log('PASS Harness navigation and asset management permissions stay scoped');
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

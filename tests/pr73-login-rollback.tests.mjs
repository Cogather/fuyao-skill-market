import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createRenderer, createSSRApp, h, nextTick, ssrContextKey } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
};

const messageHandlers = new Set();
globalThis.window = {
  __SKILL_MARKET_PARENT_CONTEXT__: undefined,
  sessionStorage: globalThis.localStorage,
  location: { href: 'http://localhost/' },
  self: null,
  top: null,
  parent: null,
  scrollY: 0,
  innerHeight: 900,
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
  addEventListener(type, handler) {
    if (type === 'message') messageHandlers.add(handler);
  },
  removeEventListener(type, handler) {
    if (type === 'message') messageHandlers.delete(handler);
  },
};
globalThis.window.self = globalThis.window;
globalThis.window.top = globalThis.window;
globalThis.window.parent = globalThis.window;
globalThis.document = {
  location: globalThis.window.location,
  documentElement: { scrollHeight: 0, clientHeight: 900 },
  body: { scrollHeight: 0 },
};

const renderer = createRenderer({
  createElement: (type) => ({ type, children: [] }),
  insert(child, parent) {
    parent.children ??= [];
    parent.children.push(child);
  },
  remove() {},
  setElementText(element, text) {
    element.text = text;
  },
  createText: (text) => ({ text }),
  createComment: (text) => ({ comment: text }),
  setText(node, text) {
    node.text = text;
  },
  setComment(node, text) {
    node.comment = text;
  },
  parentNode: () => null,
  nextSibling: () => null,
  patchProp(element, key, previous, value) {
    element.props ??= {};
    element.props[key] = value;
  },
});

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await server.close();
});

test('Skill_Square_Init populates the injected user and department context', async () => {
  const { default: App } = await server.ssrLoadModule('/src/App.vue');
  const { useSkillMarketStore } = await server.ssrLoadModule('/src/stores/skillMarketStore.ts');
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'skill-square', component: { render: () => h('div') } }],
  });
  await router.push('/');
  await router.isReady();

  const app = createSSRApp(App);
  app.use(pinia);
  app.use(router);
  await renderToString(app);

  const departmentList = [
    { deptId: 'dept-1', deptCode: 'dept-1', deptName: '研发部', deptLevel: 1, children: [] },
  ];
  for (const handler of messageHandlers) {
    handler({
      data: {
        type: 'Skill_Square_Init',
        userId: 'injected-user',
        userName: 'Injected User',
        departmentList,
      },
    });
  }

  const market = useSkillMarketStore(pinia);
  assert.equal(market.userId, 'injected-user');
  assert.equal(market.userName, 'Injected User');
  assert.deepEqual(market.departmentList, departmentList);
});

test('application startup does not initialize or schedule the profile login chain', async () => {
  const { default: App } = await server.ssrLoadModule('/src/App.vue');
  const { useProfileStore } = await server.ssrLoadModule('/src/stores/userStore.ts');
  const pinia = createPinia();
  setActivePinia(pinia);
  const profile = useProfileStore(pinia);
  let initCalls = 0;
  let tokenCheckCalls = 0;
  let intervalCalls = 0;
  profile.initUserInfo = async () => {
    initCalls += 1;
  };
  profile.checkUserToken = () => {
    tokenCheckCalls += 1;
  };
  const originalSetInterval = globalThis.window.setInterval;
  globalThis.window.setInterval = (...args) => {
    intervalCalls += 1;
    return originalSetInterval(...args);
  };

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'skill-square', component: { render: () => h('div') } }],
  });
  await router.push('/');
  await router.isReady();
  const app = renderer.createApp(App);
  app.use(pinia);
  app.use(router);
  app.provide(ssrContextKey, { modules: new Set() });

  try {
    app.mount({ children: [] });
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    assert.equal(initCalls, 0);
    assert.equal(tokenCheckCalls, 0);
    assert.equal(intervalCalls, 0);
  } finally {
    app.unmount();
    globalThis.window.setInterval = originalSetInterval;
  }
});

test('login user lookup uses the original direct request channel', async () => {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { managerUserService } = await server.ssrLoadModule('/src/api/user.ts');
  const originalDirect = request.direct;
  const originalWithCookie = request.getWithCookie;
  let directCalls = 0;
  let cookieCalls = 0;
  request.direct = async () => {
    directCalls += 1;
    return { uid: 'direct-user' };
  };
  request.getWithCookie = async () => {
    cookieCalls += 1;
    return { uid: 'cookie-user' };
  };

  try {
    await managerUserService.getUserInfo();
    assert.equal(directCalls, 1);
    assert.equal(cookieCalls, 0);
  } finally {
    request.direct = originalDirect;
    request.getWithCookie = originalWithCookie;
  }
});

test('profile initialization does not fetch a separate department tree', async () => {
  const { managerUserService } = await server.ssrLoadModule('/src/api/user.ts');
  const { useProfileStore } = await server.ssrLoadModule('/src/stores/userStore.ts');
  const originalGetUserInfo = managerUserService.getUserInfo;
  const originalGetAdminInfo = managerUserService.getAdminInfo;
  const originalGetUserDepartment = managerUserService.getUserDepartment;
  let departmentCalls = 0;
  managerUserService.getUserInfo = async () => ({
    uid: 'profile-user',
    displayNameEN: 'Profile User',
    displayNameCN: '测试用户',
    mail: 'profile@example.com',
  });
  managerUserService.getAdminInfo = async () => ({ messageEn: 'not-admin' });
  managerUserService.getUserDepartment = async () => {
    departmentCalls += 1;
    return { code: 200, data: [] };
  };

  try {
    const pinia = createPinia();
    setActivePinia(pinia);
    const profile = useProfileStore(pinia);
    await profile.initUserInfo();
    assert.equal(profile.userInfo.w3Id, 'profile-user');
    assert.equal(departmentCalls, 0);
  } finally {
    managerUserService.getUserInfo = originalGetUserInfo;
    managerUserService.getAdminInfo = originalGetAdminInfo;
    managerUserService.getUserDepartment = originalGetUserDepartment;
  }
});

test('skill upload prefers the injected parent identity over the profile fallback', async () => {
  const { useSkillMarketStore } = await server.ssrLoadModule('/src/stores/skillMarketStore.ts');
  const { useProfileStore } = await server.ssrLoadModule('/src/stores/userStore.ts');
  const { default: UploadSkillModal } = await server.ssrLoadModule(
    '/src/components/skill/UploadSkillModal.vue',
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  const market = useSkillMarketStore(pinia);
  market.updateUserId('injected-user');
  market.updateUserName('Injected User');
  const profile = useProfileStore(pinia);
  profile.updateUserInfo({ w3Id: 'profile-user' });

  let bindings;
  const Host = {
    setup(_, context) {
      bindings = UploadSkillModal.setup({ modelValue: false, operatorUserId: '' }, context);
      return () => h('div');
    },
  };
  await renderToString(createSSRApp(Host).use(pinia));

  assert.equal(bindings.userId.value, 'injected-user');
});

test('shell, Harness, and detail consumers use the injected parent identity', async () => {
  const { useSkillMarketStore } = await server.ssrLoadModule('/src/stores/skillMarketStore.ts');
  const { useProfileStore } = await server.ssrLoadModule('/src/stores/userStore.ts');
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  let UserMarketShell;
  let HarnessManagementPage;
  let SkillDetailPage;
  delete globalThis.window;
  delete globalThis.document;
  try {
    ({ default: UserMarketShell } = await server.ssrLoadModule(
      '/src/views/skill/UserMarketShell.vue',
    ));
    ({ default: HarnessManagementPage } = await server.ssrLoadModule(
      '/src/views/HarnessManagementPage.vue',
    ));
    ({ default: SkillDetailPage } = await server.ssrLoadModule(
      '/src/views/skill/SkillDetailPage.vue',
    ));
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
  const pinia = createPinia();
  setActivePinia(pinia);
  const market = useSkillMarketStore(pinia);
  const departmentList = [
    { deptId: 'dept-1', deptCode: 'dept-1', deptName: '研发部', deptLevel: 1, children: [] },
  ];
  market.updateUserId('injected-user');
  market.updateUserName('Injected User');
  market.updateDept(departmentList);
  const profile = useProfileStore(pinia);
  profile.updateUserInfo({ w3Id: 'profile-user', name: 'Profile User' });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'skill-square', component: { render: () => h('div') } }],
  });
  await router.push({ path: '/', query: { tab: 'planning' } });
  await router.isReady();

  async function loadBindings(component) {
    let bindings;
    const Host = {
      setup(_, context) {
        bindings = component.setup({}, context);
        return () => h('div');
      },
    };
    const app = createSSRApp(Host);
    app.use(pinia);
    app.use(router);
    await renderToString(app);
    return bindings;
  }

  const shell = await loadBindings(UserMarketShell);
  assert.equal(shell.userId.value, 'injected-user');
  assert.equal(shell.userName.value, 'Injected User');
  assert.deepEqual(shell.departmentList.value, departmentList);

  const harness = await loadBindings(HarnessManagementPage);
  assert.equal(harness.userId.value, 'injected-user');
  assert.equal(harness.userName.value, 'Injected User');
  assert.equal(harness.departmentTree.value[0]?.name, '研发部');

  const detail = await loadBindings(SkillDetailPage);
  assert.equal(detail.userId.value, 'injected-user');
});

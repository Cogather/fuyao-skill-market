import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createServer } from 'vite';

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
  addEventListener(type, handler) {
    if (type === 'message') messageHandlers.add(handler);
  },
  removeEventListener(type, handler) {
    if (type === 'message') messageHandlers.delete(handler);
  },
};
globalThis.window.self = globalThis.window;
globalThis.window.top = globalThis.window;
globalThis.document = { location: globalThis.window.location };

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


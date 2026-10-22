import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
});

const server = await createServer({
  appType: 'custom',
  mode: 'development',
  server: { middlewareMode: true },
});

try {
  const { managerUserService } = await server.ssrLoadModule('/src/api/user.ts');
  const { buildDeptTreeFromUserInfo } = await server.ssrLoadModule(
    '/src/services/skillMarket/marketDeptTreeFromApi.ts',
  );
  const { useProfileStore } = await server.ssrLoadModule('/src/stores/userStore.ts');

  const validateUser = await managerUserService.getUserInfo();
  assert.equal(validateUser.uid, 'w30000001', '开发模式应通过登录 Mock 返回固定用户');

  const departmentResponse = await managerUserService.getUserDepartment(validateUser.uid);
  assert.ok(
    Array.isArray(departmentResponse.data) && departmentResponse.data.length > 0,
    '部门请求应复用可被 Mock 和 HTTP 共同处理的扶摇 API 通道',
  );

  const httpTree = buildDeptTreeFromUserInfo({
    hwDepartName1: '集团',
    hwDepartCode1: 'company',
    hwDepartName3: '平台产品线',
    hwDepartCode3: 'product-line',
    hwDepartName4: '平台工具组',
    hwDepartCode4: 'platform-tools',
  });
  assert.equal(httpTree[0]?.deptName, '平台产品线');
  assert.equal(httpTree[0]?.children?.[0]?.deptName, '平台工具组');
  assert.equal(httpTree[0]?.deptLevel, 1, '稀疏的 HTTP 层级应重新编号为连续层级');

  const legacyTree = buildDeptTreeFromUserInfo({
    department_l1: '部门1',
    department_l2: '平台产品线',
  });
  assert.equal(legacyTree[0]?.deptName, '部门1', '应兼容 Mock 与旧接口的 department_lN 字段');

  setActivePinia(createPinia());
  const profileStore = useProfileStore();
  await profileStore.initUserInfo();
  assert.equal(profileStore.userInfo.w3Id, 'w30000001');
  assert.ok(profileStore.departmentList.length > 0, '自动登录应同时完成部门上下文初始化');
  assert.equal(profileStore.userInitializationReady, true);
  assert.equal(profileStore.userInitializationError, '');

  console.log('PASS automatic login initializes user and department context through one API path');
} finally {
  await server.close();
}

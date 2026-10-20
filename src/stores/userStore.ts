import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { managerUserService } from '@/api/user';
import { buildDeptTreeFromUserInfo } from '@/services/skillMarket/marketDeptTreeFromApi';

interface UserInfo {
  w3Id: string;
  name: string;
  nameCn: string;
  dept: string;
  email: string;
  createTime: string;
  nameAndId: string;
  avatar?: string;
  role?: string;
  tenantId?: string;
  tenantName?: string;
}

interface UserPermission {
  isAdmin: boolean;
  owner: boolean;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function userPayload(response: unknown, depth = 0): UnknownRecord {
  const root = asRecord(response);
  if (readText(root.uid || root.userId || root.w3Id || root.userAccount || root.account)) {
    return root;
  }
  if (depth >= 3) {
    return {};
  }
  for (const key of ['data', 'result', 'user', 'userInfo']) {
    const nested = userPayload(root[key], depth + 1);
    if (Object.keys(nested).length > 0) {
      return nested;
    }
  }
  return {};
}

function responseStatus(error: unknown): number {
  return Number(asRecord(asRecord(error).response).status ?? 0);
}

export const useProfileStore = defineStore('userProfile', () => {
  // 子页面状态
  const loginStatus = reactive({ isEnd: false });

  function updateCheckLoginStatus(val: boolean): void {
    loginStatus.isEnd = val;
  }

  function getCheckLoginStatus(): boolean {
    return loginStatus.isEnd;
  }

  // 用户信息
  const userInfo = reactive<UserInfo>({
    w3Id: '',
    name: '',
    nameCn: '',
    nameAndId: '',
    dept: '',
    email: '',
    createTime: '',
    avatar: '',
    role: '',
  });

  // 用户部门树（由 getUserDepartment 接口获取，buildDeptTreeFromUserInfo 转换）
  const departmentList = ref<unknown[]>([]);

  function updateDept(list: unknown[]): void {
    departmentList.value = [...list];
  }

  // 子页面状态
  const isSubPage = reactive({ status: false });

  // 更新用户信息
  function updateUserInfo(info: Partial<UserInfo>): void {
    Object.assign(userInfo, {
      ...info,
      avatar: info.w3Id ? `https://xxx/face/${info.w3Id.substr(1)}/120` : '',
    });
  }

  // 更新用户角色信息
  function updateAdminUserInfo(role: string): void {
    userInfo.role = role;
  }

  // 更新子页面状态
  function updateSubPageStatus(val: boolean): void {
    isSubPage.status = val;
  }

  // 防重入锁：避免 initUserInfo 被并发调用导致多次跳转
  let initUserInfoPromise: Promise<void> | null = null;
  const userInitializationReady = ref(false);
  const userInitializationError = ref('');

  // 初始化用户信息
  const initUserInfo = async (): Promise<void> => {
    if (initUserInfoPromise) return initUserInfoPromise;
    initUserInfoPromise = (async () => {
      userInitializationReady.value = false;
      userInitializationError.value = '';
      try {
        const result = await managerUserService.getUserInfo();
        const payload = userPayload(result);
        const uid = readText(
          payload.uid || payload.userId || payload.w3Id || payload.userAccount || payload.account,
        );
        if (uid) {
          const info = {
            id: uid,
            w3Id: uid,
            uid,
            name: readText(payload.displayNameEN || payload.name || payload.userName),
            nameCn: readText(
              payload.displayNameCN || payload.nameCn || payload.userNameCn || payload.realName,
            ),
            nameAndId: readText(payload.displayNameEN || payload.name || payload.userName) || uid,
            dept: '',
            email: readText(payload.mail || payload.email),
            createTime: '',
            tenantId: readText(payload.tenantId),
            tenantName: readText(payload.tenantName),
          };
          updateUserInfo(info);

          // 用户已确认后并行补齐部门和管理员上下文，避免单个慢接口串行拖长首屏等待。
          await Promise.all([initUserDepartment(info.w3Id), getAdminInfo(info.w3Id)]);
        } else {
          clearUserInfo();
        }
      } catch (error) {
        userInitializationError.value =
          error instanceof Error && error.message ? error.message : '用户信息初始化失败';
        // 401/403 表示会话明确失效；网关不可达等网络错误保留页面，避免重定向死循环。
        if ([401, 403].includes(responseStatus(error))) {
          clearUserInfo();
        }
        console.error('Failed to initialize user info:', error);
      } finally {
        userInitializationReady.value = true;
        updateCheckLoginStatus(true);
        initUserInfoPromise = null;
      }
    })();
    return initUserInfoPromise;
  };

  /**
   * 获取用户部门信息并写入 departmentList
   */
  async function initUserDepartment(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const res = await managerUserService.getUserDepartment(userId);
      // 接口返回 { code: 200, data: [{ hwDepartName1-6, hwDepartCode1-6, ... }] }
      const deptInfo = Array.isArray(res?.data) && res.data.length > 0 ? res.data[0] : null;
      const deptTree = buildDeptTreeFromUserInfo(deptInfo);
      updateDept(deptTree);
    } catch (error) {
      console.error('Failed to fetch user department:', error);
    }
  }

  // 获取管理员信息
  const getAdminInfo = async (userId: string): Promise<void> => {
    const userPermissionObj: UserPermission = {
      isAdmin: false,
      owner: false,
    };

    try {
      if (!userId) {
        updateAdminUserInfo('');
        localStorage.setItem('userPermission', JSON.stringify(userPermissionObj));
        return;
      }

      const res = await managerUserService.getAdminInfo(userId);
      if (res && res.messageEn === 'success') {
        const userArr = Array.isArray(res?.data?.list)
          ? res.data.list.filter((item: any) => item.userId === userId)
          : [];
        if (userArr.length > 0) {
          const userRole = userArr[0];
          updateAdminUserInfo(userRole.role);
          userPermissionObj.isAdmin = true;
          localStorage.setItem('userPermission', JSON.stringify(userPermissionObj));

          // 登录校验结束
          updateCheckLoginStatus(true);
          console.log('登录校验结束', loginStatus.isEnd);
          return;
        }
      }

      // 没有权限访问的人
      updateAdminUserInfo('');
      localStorage.setItem('userPermission', JSON.stringify(userPermissionObj));

      // 登录校验结束
      updateCheckLoginStatus(true);
      console.log('登录校验结束', loginStatus.isEnd);
    } catch (err) {
      console.error('Failed to get admin info:', err);
      updateAdminUserInfo('');
      localStorage.setItem('userPermission', JSON.stringify(userPermissionObj));

      // 登录校验结束
      updateCheckLoginStatus(true);
      console.log('登录校验结束', loginStatus.isEnd);
    }
  };

  // 清除用户信息并重定向到登录页
  function clearUserInfo(): void {
    updateUserInfo({
      w3Id: '',
      name: '',
      nameCn: '',
      nameAndId: '',
      dept: '',
      email: '',
      createTime: '',
      avatar: '',
    });
    updateAdminUserInfo('');
    updateDept([]);
    localStorage.setItem('userPermission', JSON.stringify({ isAdmin: false, owner: false }));

    const currHref = document.location.href;
    const loginUrl = `xxx/login1/?redirect=${encodeURIComponent(currHref)}`;

    // 在 iframe 中：让父页面跳转登录页，避免 iframe 自身反复重载导致死循环
    if (window.self !== window.top) {
      window.top!.location.href = loginUrl;
      return;
    }
    // 非 iframe：直接跳转
    window.location.href = loginUrl;
  }

  const checkUserToken = (): void => {
    console.log(new Date(), ' ,start user login check begin...');
    managerUserService
      .getUserInfo()
      .then((res) => {
        const payload = userPayload(res);
        if (
          !readText(
            payload.uid || payload.userId || payload.w3Id || payload.userAccount || payload.account,
          )
        ) {
          console.log(new Date(), 'failed to get user info');
          clearUserInfo();
          return;
        }
        if (!userInfo.w3Id) {
          void initUserInfo();
        }
      })
      .catch((err) => {
        // 网络错误不跳登录页，等下次定时校验重试
        console.error(err);
      });
  };

  return {
    userInfo,
    departmentList,
    userInitializationReady,
    userInitializationError,
    isSubPage,
    loginStatus,
    initUserInfo,
    initUserDepartment,
    updateUserInfo,
    updateAdminUserInfo,
    updateSubPageStatus,
    clearUserInfo,
    getCheckLoginStatus,
    updateCheckLoginStatus,
    getAdminInfo,
    checkUserToken,
    updateDept,
  };
});

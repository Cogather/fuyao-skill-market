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
      avatar: info.w3Id
        ? `https://w3.huawei.com/w3lab/rest/yellowpage/face/${info.w3Id.substr(1)}/120`
        : '',
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

  // 初始化用户信息
  const initUserInfo = async (): Promise<void> => {
    if (initUserInfoPromise) return initUserInfoPromise;
    initUserInfoPromise = (async () => {
      try {
        const result = await managerUserService.getUserInfo();
        if (result) {
          const info = {
            id: result.uid,
            w3Id: result.uid,
            uid: result.uid,
            name: result.displayNameEN,
            nameCn: result.displayNameCN,
            nameAndId: result.displayNameEN,
            dept: '',
            email: result.mail || '',
            createTime: '',
            tenantId: result?.tenantId,
            tenantName: result?.tenantName,
          };
          updateUserInfo(info);

          // 通过接口获取用户部门信息，构建部门树
          await initUserDepartment(info.w3Id);

          await getAdminInfo(info.w3Id);
        } else {
          clearUserInfo();
        }
      } catch (error) {
        // 网络错误不跳登录页，避免短暂网络波动导致死循环
        // 只有 validate 接口明确返回未登录（result 为 false）才跳转
        console.error('Failed to initialize user info:', error);
      } finally {
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
      if (deptTree.length > 0) {
        updateDept(deptTree);
      }
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
        const userArr = res.data.list.filter((item: any) => item.userId === userId);
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
    const loginUrl = `xxx/login1/?redirect=${currHref}`;

    // 在 iframe 中：让父页面跳转登录页，避免iframe自身反复重载导致死循环
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
        if (!res) {
          console.log(new Date(), 'failed to get user info');
          clearUserInfo();
          return;
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

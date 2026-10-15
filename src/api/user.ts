import request from '@/services/skillMarket/request';

const configCenterHost = import.meta.env.VITE_APP_CORE_MLOPS_URL + '/config-service';
const dataengineerApiHost = import.meta.env.VITE_APP_CORE_MLOPS_URL + '/dataengineering'
/* 获取用户信息 */
export const managerUserService = {
  /**
   * w3 SSO 会话校验 → 返回用户信息 (含工号 uid)
   * 使用 withCredentials 携带 cookie
   */
  getUserInfo: (): Promise<any> =>
    request.getWithCookie({
      url: '/mateopenapi/rolex/matestoreauthservice/v1/users/validate',
    }),

  /**
   * 获取用户部门信息
   */
  getUserDepartment: (userId: string): Promise<any> =>
    request.getWithCookie({
      url: `${configCenterHost}/config-center/hw-userinfo?info=${userId}`
    }),

  // 获取登录用户信息
  getUserLoginInfo: () => {
    return request.fuyao({
      url: `${dataengineerApiHost}/auth-manager/login`,
      method: 'get',
    });
  },

  // 获取管理员白名单
  getAdminInfo: (userId: string) => {
    return request.fuyao({
      url: `config-service/config-center/user?userId=${userId}`,
      method: 'get',
    });
  },
};

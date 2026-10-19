import request from '@/services/skillMarket/request';

const dataengineerApiHost = import.meta.env.VITE_APP_CORE_MLOPS_URL + '/dataengineering';
/* 获取用户信息 */
export const managerUserService = {
  /**
   * w3 SSO 会话校验 → 返回用户信息（含工号 uid）
   * 使用 withCredentials 携带 cookie
   * 走nginx /mateopenapi 代理（开发环境走 Vite proxy）
   */
  getUserInfo: (): Promise<any> =>
    request.getWithCookie({
      url: '/mateopenapi/rolex/matestoreauthservice/v1/users/validate',
    }),

  /**
   * 获取用户部门信息
   * 走nginx /config-service 代理（开发环境走 Vite proxy）
   */
  getUserDepartment: (userId: string): Promise<any> =>
    request.getWithCookie({
      url: `/config-service/config-center/hw-userinfo?info=${userId}`,
    }),

  // 获取登录用户信息（扶摇平台）
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

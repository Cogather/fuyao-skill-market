import request from '@/services/skillMarket/request';
const dataengineerApiHost = import.meta.env.VITE_APP_CORE_MLOPS_URL + '/dataengineering';
/* 获取用户信息 */
export const managerUserService = {
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
  getUserInfo: () => {
    return request.direct({
      url: `/mateopenapi/rolex/matestoreauthservice/v1/users/validate`,
      method: 'get',
    });
  },
};

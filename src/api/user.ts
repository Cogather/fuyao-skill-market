import request from '@/services/skillMarket/request';

const userRequestTimeout = 10_000;
const userGatewayFallbackStatuses = new Set([0, 404, 502, 503, 504]);

function requestStatus(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }
  const response = (error as { response?: { status?: unknown } }).response;
  return Number(response?.status ?? 0);
}

function getMateUserInfo(): Promise<any> {
  return request.getWithCookie({
    url: '/mateopenapi/rolex/matestoreauthservice/v1/users/validate',
    timeout: userRequestTimeout,
  });
}

function getFuyaoLoginInfo(): Promise<any> {
  return request.fuyao({
    url: '/dataengineering/auth-manager/login',
    method: 'get',
    timeout: userRequestTimeout,
    withCredentials: true,
  });
}

/* 获取用户信息 */
export const managerUserService = {
  /**
   * w3 SSO 会话校验 → 返回用户信息（含工号 uid）
   * 使用 withCredentials 携带 cookie
   * 走nginx /mateopenapi 代理（开发环境走 Vite proxy）
   */
  getUserInfo: async (): Promise<any> => {
    try {
      return await getMateUserInfo();
    } catch (error) {
      const status = requestStatus(error);
      if (!userGatewayFallbackStatuses.has(status)) {
        throw error;
      }
      console.warn(`mateopenapi unavailable (${status || 'network'}), using auth-manager login`);
      return getFuyaoLoginInfo();
    }
  },

  /**
   * 获取用户部门信息
   * 复用项目已有的扶摇 API 通道，避免依赖部署环境额外配置 /config-service 反向代理。
   */
  getUserDepartment: (userId: string): Promise<any> =>
    request.fuyao({
      url: '/dataengineering/config-center/hw-userinfo',
      method: 'get',
      params: { info: userId },
      timeout: userRequestTimeout,
    }),

  // 获取登录用户信息（扶摇平台）
  getUserLoginInfo: getFuyaoLoginInfo,

  // 获取管理员白名单
  getAdminInfo: (userId: string) => {
    return request.fuyao({
      url: '/config-service/config-center/user',
      method: 'get',
      params: { userId },
      timeout: userRequestTimeout,
    });
  },
};

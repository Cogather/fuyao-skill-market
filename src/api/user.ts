import request from '@/services/skillMarket/request';
const dataenginnerApiHost = import.meta.env.VITE_APP_CORE_MLOPS_URL + '/dataengineering';
/* 获取用户信息 */
export const managerUserService = {
    // 获取登录用户信息
    getUserLoginInfo: () => {
        return request.fuyao({
            url: `${dataenginnerApiHost}/auth-manager/login`,
            method: 'get'
        })
    },

    // 获取管理员白名单
    getAdminInfo: (userId: string) => {
        return request.fuyao({
            url: `config-service/config-center/user?userId=${userId}`,
            method: 'get'
        })
    },
    getUserInfo: () => {
        return request.direct({
            url: `/mateopenai/rolex/matestoreauthservice/v1/users/validate`,
            method: 'get'
        })
    }
}
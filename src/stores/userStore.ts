import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { managerUserService } from '@/api/user';
import { relative } from 'path';

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
}

interface UserPermission {
    isAdmin: boolean;
    owner: boolean;
}

export const useProfileStore = defineStore('userProfile', () => {
    // 子页面状态
    const loginStatus = ref<boolean>({ isEnd: false });

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

    // 子页面状态
    const isSubPage = reactive({status: false})

    // 更新用户信息
    function updateUserInfo(info: UserInfo): void {
        Object.assign(userInfo, {
            ...info,
            avatar: info.w3Id ? `https://w3.huawei.com/w3lab/rest/yellowpage/face/${info.w3Id.substr(1)}/120` : '',
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

    // 初始化用户信息
    const initUserInfo = async (): Promise<void> => {
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
                }
                updateUserInfo(info);
                await getAdminInfo(info.w3Id);
            } else {
                clearUserInfo();
            }
        } catch (error) {
            console.error('Failed to initialize user info:', error);
            clearUserInfo();
        }
    }

    // 获取管理员信息
    const getAdminInfo = async (userId: string): Promise<void> => {
        const userPermissionObj: UserPermission = {
            isAdmin: false,
            owner: false,
        }

        try {
            if(!userId) {
                updateAdminUserInfo('');
                localStorage.setItem('userPermission', JSON.stringify(userPermissionObj));
                return;
            }

            const res = await managerUserService.getAdminInfo(userId);
            if(res && res.messageEn === 'success') {
                const userArr = res.data.list.filter((item: any) => item.userId === userId);
                if(userArr.length > 0) {
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
    }

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
        updateAdminUserInfo('')
        localStorage.setItem('userPermission', JSON.stringify({isAdmin: false, owner: false}));

        const currHref = document.location.href;
        window.location.href =  `https://login.huawei.com/login?redirect=${currHref}`;
    }

    return {
        userInfo,
        isSubPage,
        loginStatus,
        initUserInfo,
        updateUserInfo,
        updateAdminUserInfo,
        updateSubPageStatus,
        clearUserInfo,
        getCheckLoginStatus,
        updateCheckLoginStatus,
        getAdminInfo,
    }
})
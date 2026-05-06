/**
 * 与设计文档 §3.3.10「菜单展示规则」一致的前端辅助判断（最终以服务端鉴权为准）。
 */
export function parseUserMarketRole(value) {
    if (value === 'SUPER_ADMIN' || value === 'ORG_ADMIN' || value === 'USER') {
        return value;
    }
    return null;
}
export function marketRoleShowsAdminPerspective(role) {
    const r = role?.role;
    return r === 'SUPER_ADMIN' || r === 'ORG_ADMIN';
}
/** 组织管理入口：超级管理员与普通管理员 */
export function marketRoleShowsOrgManagement(role) {
    return marketRoleShowsAdminPerspective(role);
}
/** 超级管理员配置入口：仅 SUPER_ADMIN */
export function marketRoleShowsSuperAdminSettings(role) {
    return role?.role === 'SUPER_ADMIN';
}
/** 组织列表「新增组织」按钮 */
export function marketRoleCanCreateOrganization(role) {
    return role?.role === 'SUPER_ADMIN';
}
/**
 * 审核中心配套能力、运营看板 **Excel 导入** 等管理员能力（ORG_ADMIN / SUPER_ADMIN）。
 * 运营看板 **页签与只读内容** 全体用户可见；是否显示导入按钮请用本函数判断。
 */
export function marketRoleShowsOpsAndReview(role) {
    return marketRoleShowsAdminPerspective(role);
}

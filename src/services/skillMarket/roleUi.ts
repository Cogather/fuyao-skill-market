import type { CurrentUserRoleDto, UserMarketRole } from './apiTypes';

/**
 * 与设计文档 §3.3.10「菜单展示规则」一致的前端辅助判断（最终以服务端鉴权为准）。
 */
export function parseUserMarketRole(value: unknown): UserMarketRole | null {
  if (value === 'SUPER_ADMIN' || value === 'ORG_ADMIN' || value === 'USER') {
    return value;
  }
  return null;
}

function roleFlagIsTrue(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    (typeof value === 'string' && ['1', 'true'].includes(value.trim().toLowerCase()))
  );
}

export function marketRoleIsSuperAdmin(role: CurrentUserRoleDto | null): boolean {
  return role?.role === 'SUPER_ADMIN' || roleFlagIsTrue(role?.superAdmin);
}

export function marketRoleIsOrgAdmin(role: CurrentUserRoleDto | null): boolean {
  return role?.role === 'ORG_ADMIN' || roleFlagIsTrue(role?.orgAdmin);
}

/** 部门 Skill 规划权限配置入口：管理员或部门主任。 */
export function marketRoleCanConfigurePlanningPermissions(
  role: CurrentUserRoleDto | null,
): boolean {
  return (
    marketRoleIsSuperAdmin(role) ||
    marketRoleIsOrgAdmin(role) ||
    roleFlagIsTrue(role?.departmentDirector)
  );
}

export function marketRoleShowsAdminPerspective(role: CurrentUserRoleDto | null): boolean {
  return marketRoleIsSuperAdmin(role) || marketRoleIsOrgAdmin(role);
}

/** 组织管理入口：超级管理员与普通管理员 */
export function marketRoleShowsOrgManagement(role: CurrentUserRoleDto | null): boolean {
  return marketRoleShowsAdminPerspective(role);
}

/** 超级管理员配置入口：仅 SUPER_ADMIN */
export function marketRoleShowsSuperAdminSettings(role: CurrentUserRoleDto | null): boolean {
  return marketRoleIsSuperAdmin(role);
}

/** 组织列表「新增组织」按钮 */
export function marketRoleCanCreateOrganization(role: CurrentUserRoleDto | null): boolean {
  return marketRoleIsSuperAdmin(role);
}

/**
 * 审核中心配套能力、运营管理 **Excel 导入** 等管理员能力（ORG_ADMIN / SUPER_ADMIN）。
 * 运营管理 **页签与只读内容** 全体用户可见；是否显示导入按钮请用本函数判断。
 */
export function marketRoleShowsOpsAndReview(role: CurrentUserRoleDto | null): boolean {
  return marketRoleShowsAdminPerspective(role);
}

/** 设计文档统一响应壳 */
export type ApiMeta = {
  number?: number;
  message: string;
  success: boolean;
};

export type ApiEnvelope<T> = {
  code: number;
  message: string;
  meta?: ApiMeta;
  data: T;
};

export type UserDepartmentDto = {
  department_l1: string;
  department_l2: string;
  department_l3: string;
  department_l4: string;
  department_l5: string;
  department_l6: string;
};

/** §3.3.10 / §4.4 */
export type UserMarketRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'USER';

export type OrganizationScope = 'ALL' | 'MANAGED_ORG' | 'NONE';

export type CurrentUserRoleDto = {
  employeeNo: string;
  userName: string;
  role: UserMarketRole;
  superAdmin: boolean;
  orgAdmin: boolean;
  managedOrgIds: number[];
  managedOrgNames?: string[];
  organizationScope: OrganizationScope;
};

/** §3.3.12 */
export type SuperAdminDto = {
  id: number;
  employeeNo: string;
  employeeName: string | null;
  enabled: boolean;
  remark: string | null;
};

export type SuperAdminCreateBody = {
  employeeNo: string;
  employeeName?: string;
  enabled: boolean;
  remark?: string;
};

export type SuperAdminUpdateBody = {
  enabled?: boolean;
  employeeName?: string | null;
  remark?: string | null;
};

export type SkillListParamsDto = {
  userId?: string;
  keyword?: string;
  level?: string;
  orgId?: number;
  /** §3.3.3 市场列表：按 `skill.department_l1` 精确过滤，可与 L2～L6 组合 AND */
  departmentL1?: string;
  departmentL2?: string;
  departmentL3?: string;
  departmentL4?: string;
  departmentL5?: string;
  departmentL6?: string;
  categoryGroupName?: string;
  category?: string;
  /** 多选标签并集，逗号分隔，如 `pdf,api`（与设计文档 §3.3.3 一致） */
  tagList?: string;
  /** 单标签，兼容旧参数；优先使用 tagList */
  tag?: string;
  qualityMark?: string;
  badge?: string;
  scored?: boolean;
  minRating?: number;
  pageNum: number;
  pageSize: number;
};

export type SkillListRecordDto = {
  id: number;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  categoryGroupName: string;
  tags: string;
  level: string;
  status: string;
  orgId?: number | null;
  orgName: string | null;
  department_l1?: string;
  department_l2?: string;
  department_l3?: string;
  department_l4?: string;
  department_l5?: string;
  department_l6?: string;
  downloads: number;
  likes: number;
  dislikes: number;
  rating: number;
  qualityMark: string | null;
  qualityBadges: string[];
  scored: boolean;
  updatedAt: string;
};

export type SkillListPayloadDto = {
  total: number;
  records: SkillListRecordDto[];
};

/**
 * 目录树：`string[]` 为相对路径列表；`string` 可为已排版树文本、换行分隔路径或 JSON 数组字符串。
 */
export type SkillFileTreeField = string | string[];

/** §4.3 `GET /api/skills/my` */
export type MySkillsParams = {
  userId?: string;
  pageNo: number;
  pageSize: number;
  keyword?: string;
  /** 个人级 / 组织级 / 组织审核中 / 组织已驳回 等，取决于后端 */
  status?: string;
};

/**
 * `POST /api/skills/upload/parse`：仅解析压缩包内 SKILL.md，不写入市场。
 * 字段以后端实际响应为准；`nameExists` 表示与已有市场 Skill 重名。
 */
export type SkillUploadParseResultDto = {
  name: string;
  version: string;
  description: string;
  requirements?: string;
  author: string;
  category: string;
  categoryGroupName?: string;
  tags: string[];
  level?: string;
  nameExists?: boolean;
  canSubmit?: boolean;
  warnings?: string[];
  fileTree?: SkillFileTreeField;
};

/** `GET /api/skills/{id}/versions` 单条版本记录（接口返回数组元素） */
export type SkillVersionListItemDto = {
  id: number | string;
  skillId: number | string;
  version: string;
  packagePath: string;
  skillMdContent: string;
  fileTree: SkillFileTreeField;
  createBy: string;
  createdAt: string;
  /** 0 正常，1 已下架（已下架版本不可下载） */
  deleted: number;
};

/** `DELETE /api/skills/{id}/all`：query 传操作者工号 */
export type SkillDeleteAllParams = {
  /** 操作者工号；与全局其它 Skill 接口 query 字段一致 */
  userId: string;
};

/** `DELETE /api/skills/{id}` 下架指定版本：query 传 `version` 与 `userId` */
export type SkillUnpublishVersionParams = {
  version: string;
  userId: string;
};

export type SkillDetailDto = {
  id: number;
  name: string;
  description: string;
  requirements: string;
  author: string;
  version: string;
  category: string;
  categoryGroupName: string;
  tags: string[];
  level: string;
  status: string;
  orgName: string | null;
  downloads: number;
  likes: number;
  dislikes: number;
  rating: number;
  qualityMark: string | null;
  qualityBadges: string[];
  lastReviewComment: string | null;
  lastReviewedAt: string | null;
  fileTree: SkillFileTreeField;
  skillMdContent: string;
};

/** §3.3.3.2.1 `POST /api/skills/{id}/download` */
export type SkillDownloadSourcePage = 'market' | 'detail' | 'my-publish';

export type SkillDownloadRequestBody = {
  userId?: string;
  sourcePage?: SkillDownloadSourcePage;
  /** 可选；版本页下载时由前端传入，可与 query `version` 同时存在以兼容不同后端 */
  version?: string;
};

export type SkillDownloadResultDto = {
  id: number;
  skillId: number;
  name: string;
  version: string;
  currentVersion: string;
  description: string;
  downloads: number;
  packagePath: string;
  downloadUrl: string;
  tags: string;
};

/** §3.3.3.2.2 `GET /api/skills/{id}/download-stats` */
export type SkillDownloadStatsParams = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  granularity?: 'day';
};

export type SkillDownloadTrendPointDto = {
  statDate: string;
  downloads: number;
};

export type SkillDownloadStatsDto = {
  skillId: number;
  name: string;
  totalDownloads: number;
  currentDownloads: number;
  startDate?: string;
  endDate?: string;
  granularity?: string;
  trend: SkillDownloadTrendPointDto[];
};

export type UploadSkillResultDto = {
  skillId: number;
  name: string;
  description: string;
  requirements: string;
  author: string;
  version: string;
  category: string;
  categoryGroupName: string;
  tags: string[];
  level: string;
  status: string;
  orgId: number | null;
  orgName: string | null;
  ownerUser: string;
  ownerName: string;
  department_l1: string;
  department_l2: string;
  department_l3: string;
  department_l4: string;
  department_l5: string;
  department_l6: string;
  downloads: number;
  fileDir: string;
  packagePath: string;
  fileTree: SkillFileTreeField;
  skillMdContent: string;
  createdAt: string;
  updatedAt: string;
  likes: number | null;
  dislikes: number | null;
  rating: number | null;
  qualityMark: any;
  qualityBadges: any[];
  scored: boolean;
};

export type CreateSkillBody = {
  userId?: string;
  name: string;
  description: string;
  requirements?: string;
  author: string;
  version: string;
  category: string;
  tags?: string;
  packagePath: string;
  skillMdContent: string;
  fileTree: SkillFileTreeField;
};

export type CreateSkillResultDto = {
  skillId: number;
  level: string;
  status: string;
};

export type SyncApplicationBody = {
  userId?: string;
  targetOrgId: number;
  reason: string;
};

export type SyncUpdateApplicationBody = {
  userId?: string;
  targetOrgId: number;
  version: string;
  updateReason: string;
};

export type SyncApplicationResultDto = {
  applicationId: number;
  status: string;
  skillStatus?: string;
  syncType?: string;
};

export type SyncReviewBody = {
  decision: 'approve' | 'reject';
  comment: string;
};

export type SyncApplicationsParams = {
  tab: 'pending' | 'done';
  orgId?: number;
  pageNo: number;
  pageSize: number;
};

/** 审核中心列表行（接口可只返回部分字段，前端做展示补全） */
export type SyncApplicationListItemDto = {
  id: number;
  skillId?: number;
  skillName: string;
  applyType?: string;
  targetLevel?: string;
  targetOrgId?: number;
  targetOrgName?: string;
  reason?: string;
  reasonDetail?: string;
  approverLabel?: string;
  status?: string;
  reviewResult?: string;
  reviewComment?: string;
  completedAt?: string;
};

export type OrganizationDto = {
  id: number;
  orgName: string;
  orgCode: string;
  admins: string;
  enabled: boolean;
};

export type OrganizationUpsertBody = {
  orgName: string;
  orgCode: string;
  admins: string;
  enabled: boolean;
};

/**
 * 市场总览等部门级联：全量部门树（设计文档未定稿）。
 * 节点字段与 `DashboardOverviewDto.deptTree` 单节点对齐，便于后端与 Mock 复用。
 */
export type DepartmentTreeNodeDto = {
  deptName: string;
  deptLevel: number;
  children?: DepartmentTreeNodeDto[];
};

export type DashboardOverviewParams = {
  system: 'fuyao' | 'company';
  statDate?: string;
  deptLevel?: number;
  deptName?: string;
  metric?: 'count' | 'downloads';
};

export type DashboardOverviewDto = {
  system: string;
  statDate: string;
  kpis: {
    totalSkills?: number;
    /** 兼容部分旧文档里的字段名；优先使用 totalSkills */
    skillCount?: number;
    personalSkillCount: number;
    verifiedSkillCount: number;
    downloads: number;
  };
  deptTree: {
    deptName: string;
    deptLevel: number;
    totalSkills?: number;
    skillCount?: number;
    downloads: number;
    children: unknown[];
  }[];
  rankings: { name: string; totalSkills?: number; skillCount?: number; downloads: number }[];
  topSkills: {
    skillId: number;
    name: string;
    downloads: number;
    likes: number;
    dislikes: number;
    rating: number;
    qualityBadges: string[];
  }[];
};

export type QualityReviewListParams = {
  reviewMonth: string;
  deptLevel?: number;
  deptName?: string;
  reviewStatus?: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
};

export type QualityReviewSaveBody = {
  reviewMonth: string;
  deptLevel: number;
  deptName: string;
  items: {
    skillId: number;
    score: number;
    qualityMark: string;
    reviewComment: string;
  }[];
};

export type QualityReviewArchiveBody = {
  reviewMonth: string;
  deptLevel?: number;
  deptName?: string;
};

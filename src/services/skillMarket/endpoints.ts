/**
 * 与《Agent Center Skill 市场需求开发设计文档》对齐的接口路径。
 * 仅描述路径，不含 baseURL，便于切换网关前缀或版本。
 */
export const SKILL_MARKET_ENDPOINTS = {
  userCurrentDepartment: '/api/users/current/department',
  /** §3.3.10 前端菜单 / 按钮权限 */
  userCurrentRole: '/api/users/current/role',
  resourceFileUpload: '/resource/resource-management/v1/storage/file',
  skillsUpload: '/api/skills/upload',
  /** 设计文档流程：仅解压解析 SKILL.md，校验元数据与重名，不入库 */
  skillsUploadParse: '/api/skills/upload/parse',
  skills: '/api/skills',
  /** §4.3.1 我的发布列表 */
  skillsMy: '/api/skills/my',
  skillById: (id: string | number) => `/api/skills/${encodeURIComponent(String(id))}`,
  /** 删除 Skill 及其全部版本；query 需带操作者工号（与项目约定字段 `userId` 一致） */
  skillDeleteAll: (id: string | number) => `/api/skills/${encodeURIComponent(String(id))}/all`,
  /** §3.3.3.2.1 下载到本地：返回临时下载 URL 并累计下载量 */
  skillDownload: (id: string | number) => `/api/skills/${encodeURIComponent(String(id))}/download`,
  /** §3.3.3.2.2 单 Skill 下载量统计与趋势 */
  skillDownloadStats: (id: string | number) =>
    `/api/skills/${encodeURIComponent(String(id))}/download-stats`,
  skillVersions: (id: string | number) => `/api/skills/${encodeURIComponent(String(id))}/versions`,
  skillSyncApplications: (id: string | number) =>
    `/api/skills/${encodeURIComponent(String(id))}/sync-applications`,
  skillSyncUpdateApplications: (id: string | number) =>
    `/api/skills/${encodeURIComponent(String(id))}/sync-update-applications`,
  syncApplicationReview: (id: string | number) =>
    `/api/sync-applications/${encodeURIComponent(String(id))}/review`,
  syncApplications: '/api/sync-applications',
  /**
   * 全量部门树（L1～L6），供市场筛选级联；设计文档占位，当前 Mock 与 HTTP 客户端均已接好。
   * 响应：`ApiEnvelope<DepartmentTreeNodeDto[]>`（根为多棵一级部门）。
   */
  departmentsTree: '/api/departments/tree',
  /** 左侧目录栏业务维度筛选项；后端路径暂定，HTTP 模式后续可在这里微调。 */
  businessDimensions: '/api/business-dimensions',
  organizations: '/api/organizations',
  organizationById: (id: string | number) => `/api/organizations/${encodeURIComponent(String(id))}`,
  /** §3.3.12 仅 SUPER_ADMIN */
  superAdmins: '/api/super-admins',
  superAdminById: (id: string | number) => `/api/super-admins/${encodeURIComponent(String(id))}`,
  /** §3.3.13 运营管理（扶摇侧 HTTP 由 `fetchOpsDashboardUi('fuyao')` 使用并映射为 UI Bundle） */
  dashboardOverview: '/api/dashboard/overview',
  /** 占位；公司看板只读打包 mock JSON，前端不请求 */
  dashboardOpsUi: (system: 'fuyao' | 'company') =>
    `/api/dashboard/ops-ui?system=${encodeURIComponent(system)}`,
  /** 自进化草稿（skill drafts）：列表 / 详情 / 审批 / 下载，统一前缀 `/api/skill-drafts` */
  skillDrafts: '/api/skill-drafts',
  skillDraftById: (id: string | number) => `/api/skill-drafts/${encodeURIComponent(String(id))}`,
  skillDraftApprove: (id: string | number) =>
    `/api/skill-drafts/${encodeURIComponent(String(id))}/approve`,
  skillDraftReject: (id: string | number) =>
    `/api/skill-drafts/${encodeURIComponent(String(id))}/reject`,
  skillDraftDownload: (id: string | number) =>
    `/api/skill-drafts/${encodeURIComponent(String(id))}/download`,
  skillQualityReviews: '/api/skill-quality-reviews',
  skillQualityReviewsSave: '/api/skill-quality-reviews/save',
  skillQualityReviewsArchive: '/api/skill-quality-reviews/archive',
  dashboardImportExcel: '/api/dashboard/import-excel',
} as const;

import type { Ref } from 'vue';
import type {
  Skill,
  SkillListQuery,
  SkillListResponse,
  SkillUploadPayload,
  SkillUploadResponse,
} from '../../types/skill';
import type {
  ApiEnvelope,
  CreateSkillBody,
  CreateSkillResultDto,
  CurrentUserRoleDto,
  DepartmentTreeNodeDto,
  DashboardOverviewDto,
  DashboardOverviewParams,
  MySkillsParams,
  OrganizationDto,
  OrganizationUpsertBody,
  QualityReviewArchiveBody,
  QualityReviewListParams,
  QualityReviewSaveBody,
  SkillDetailDto,
  SkillDeleteAllParams,
  SkillDownloadSourcePage,
  SkillDownloadStatsDto,
  SkillDownloadStatsParams,
  SkillListParamsDto,
  SkillListPayloadDto,
  SkillUnpublishVersionParams,
  SkillUploadParseResultDto,
  SkillVersionListItemDto,
  SuperAdminCreateBody,
  SuperAdminDto,
  SuperAdminUpdateBody,
  SyncApplicationBody,
  SyncApplicationResultDto,
  SyncApplicationsParams,
  SyncReviewBody,
  SyncUpdateApplicationBody,
  UploadSkillResultDto,
  UserDepartmentDto,
} from './apiTypes';
import type { OpsDashboardBundle } from '../../utils/opsExcelImport';

export type SkillDownloadOptions = {
  sourcePage?: SkillDownloadSourcePage;
  /** 可选；版本列表页下载指定版本时传入 */
  version?: string;
};

/**
 * `downloadSkill` 结果：优先使用 `blob` 触发本地下载；若文件服务跨域无法拉取 Blob，则提供 `directDownloadUrl` 由页面打开链接。
 */
export type SkillDownloadResult = {
  blob: Blob | null;
  fileName: string;
  skill: Skill;
  directDownloadUrl?: string;
};

/**
 * Skill 市场后端契约（设计文档 3.3）。
 * Mock / HTTP 两种实现对外暴露相同方法，便于替换。
 */
export type SkillMarketClient = {
  readonly skills: Ref<Skill[]>;

  /** 当前 UI 使用的列表分页（内部仍走统一数据模型） */
  listSkills(query: SkillListQuery): Promise<SkillListResponse>;
  uploadSkill(payload: SkillUploadPayload): Promise<SkillUploadResponse>;
  /** §3.3.3.2.1 `POST /api/skills/{id}/download` */
  downloadSkill(skillId: string, options?: SkillDownloadOptions): Promise<SkillDownloadResult>;

  /** `DELETE /api/skills/{id}/all` 删除 Skill 及全部版本 */
  deleteSkillAll(
    skillId: string | number,
    params: SkillDeleteAllParams,
  ): Promise<ApiEnvelope<unknown>>;
  /** `GET /api/skills/{id}/versions` 版本列表/详情 */
  fetchSkillVersions(skillId: string | number): Promise<ApiEnvelope<SkillVersionListItemDto[]>>;
  /** `DELETE /api/skills/{id}` 下架指定版本（query：`version`、`userId`） */
  unpublishSkillVersion(
    skillId: string | number,
    params: SkillUnpublishVersionParams,
  ): Promise<ApiEnvelope<unknown>>;

  fetchUserDepartment(): Promise<ApiEnvelope<UserDepartmentDto>>;
  /** §3.3.10 初始化菜单与按钮权限 */
  fetchCurrentUserRole(): Promise<ApiEnvelope<CurrentUserRoleDto>>;
  /** §3.3.12 仅 SUPER_ADMIN */
  fetchSuperAdmins(): Promise<ApiEnvelope<SuperAdminDto[]>>;
  postSuperAdmin(body: SuperAdminCreateBody): Promise<ApiEnvelope<SuperAdminDto>>;
  putSuperAdmin(
    id: string | number,
    body: SuperAdminUpdateBody,
  ): Promise<ApiEnvelope<SuperAdminDto>>;
  fetchSkills(params: SkillListParamsDto): Promise<ApiEnvelope<SkillListPayloadDto>>;
  /** §4.3.1 我的发布列表 */
  fetchMySkills(params: MySkillsParams): Promise<ApiEnvelope<SkillListPayloadDto>>;
  fetchSkillDetail(id: string | number): Promise<ApiEnvelope<SkillDetailDto | null>>;
  /** §3.3.3.2.2 单 Skill 下载量统计（详情/运营趋势用） */
  fetchSkillDownloadStats(
    id: string | number,
    params?: SkillDownloadStatsParams,
  ): Promise<ApiEnvelope<SkillDownloadStatsDto>>;
  uploadSkillArchive(file: File): Promise<ApiEnvelope<UploadSkillResultDto>>;
  /** 设计文档：上传前仅解析 SKILL.md（`POST /api/skills/upload/parse`） */
  postSkillUploadParse(file: File): Promise<ApiEnvelope<SkillUploadParseResultDto>>;
  createSkill(body: CreateSkillBody): Promise<ApiEnvelope<CreateSkillResultDto>>;
  postSkillVersion(id: string | number, file: File): Promise<ApiEnvelope<unknown>>;
  postSyncApplication(
    id: string | number,
    body: SyncApplicationBody,
  ): Promise<ApiEnvelope<SyncApplicationResultDto>>;
  postSyncUpdateApplication(
    id: string | number,
    body: SyncUpdateApplicationBody,
  ): Promise<ApiEnvelope<SyncApplicationResultDto>>;
  postSyncApplicationReview(
    id: string | number,
    body: SyncReviewBody,
  ): Promise<ApiEnvelope<unknown>>;
  fetchSyncApplications(
    params: SyncApplicationsParams,
  ): Promise<ApiEnvelope<{ total: number; records: unknown[] }>>;
  /** 市场等部门级联：全量部门树（设计文档占位路径 `GET /api/departments/tree`） */
  fetchDepartmentsTree(): Promise<ApiEnvelope<DepartmentTreeNodeDto[]>>;
  fetchOrganizations(): Promise<ApiEnvelope<OrganizationDto[]>>;
  postOrganization(body: OrganizationUpsertBody): Promise<ApiEnvelope<OrganizationDto>>;
  putOrganization(
    id: string | number,
    body: OrganizationUpsertBody,
  ): Promise<ApiEnvelope<OrganizationDto>>;
  fetchDashboardOverview(
    params: DashboardOverviewParams,
  ): Promise<ApiEnvelope<DashboardOverviewDto>>;
  fetchQualityReviews(
    params: QualityReviewListParams,
  ): Promise<ApiEnvelope<{ total: number; records: unknown[] }>>;
  postQualityReviewsSave(body: QualityReviewSaveBody): Promise<ApiEnvelope<unknown>>;
  postQualityReviewsArchive(body: QualityReviewArchiveBody): Promise<ApiEnvelope<unknown>>;
  postDashboardImportExcel(
    file: File,
    system: 'fuyao' | 'company',
    statDate: string,
  ): Promise<ApiEnvelope<{ ok: boolean; importedRows?: number }>>;

  /**
   * 运营看板 UI 聚合（与 Excel 导入结构一致）。
   * `company`：仅读打包的 `opsDashboardCompanyDefault.json`，无 HTTP；`fuyao`：`GET /api/dashboard/overview?system=fuyao`（§3.3.13）再映射。
   */
  fetchOpsDashboardUi(system: 'fuyao' | 'company'): Promise<ApiEnvelope<OpsDashboardBundle>>;
};

import httpRequest from '@/services/skillMarket/request';
import type {
  ApiEnvelope,
  BatchDeleteSkillPlanningSupplementBody,
  CreateSkillMasterManagementBody,
  CreateSkillMasterManagementParams,
  CreateSkillPlanningSupplementBody,
  ExpertCheckDto,
  SkillPlanningDepartmentAdminsBody,
  QuerySkillMasterManagementBody,
  QueryHarnessPermissionUsersParams,
  QuerySkillPlanningSupplementParams,
  SkillPlanningSupplementMutationParams,
  SkillTransferParams,
  UpdateSkillMasterManagementBody,
  UpdateSkillMasterManagementParams,
  UpdateHarnessPermissionUsersRequest,
  UpdateSkillPlanningSupplementBody,
} from './apiTypes';

export interface SceneOptionGroupsParams {
  userId: string;
  /** 部门级 / 产品级 */
  dimType: string;
  dimCode: string;
  dimName: string;
}

export interface SceneOptionGroupRow {
  deptCode: string;
  deptName: string;
  firstScene: string;
  secondScene: string;
  sort: number;
}

export type SceneOptionGroupsResponse = ApiEnvelope<SceneOptionGroupRow[]> | SceneOptionGroupRow[];

export interface RefreshTaxonomyItem {
  firstScene?: string;
  secondScene?: string;
  activityNodeName?: string;
  subActivityNodeName?: string;
  sort: number;
}

export interface RefreshSceneOptionGroupsBody {
  scenes: RefreshTaxonomyItem[];
}

export interface RefreshActivityOptionGroupsBody {
  activities: RefreshTaxonomyItem[];
}

const _corecode_env = import.meta.env.VITE_SKILL_CORE_CODE_PROD_URL;

export const corecode = _corecode_env;

export const ai = import.meta.env.VITE_SKILL_CORE_CODE_URL;
export const webfrondUrl = import.meta.env.VITE_WEBFROND_APP_BASE;

export const skillBaseService = {
  // 获取用户部门信息
  getUserDepartment: (params: any): any => {
    return httpRequest.fuyao<any>({
      url: '/dataengineering/config-center/hw-userinfo',
      method: 'get',
      params,
    });
  },

  // skill压缩包解析接口
  parseSkillPackage: (formData: FormData, params: any): any => {
    return httpRequest.skill<any>({
      url: '/upload/parse',
      method: 'post',
      data: formData,
      params: params,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // skill压缩包上传接口
  uploadSkillPackage: (formData: FormData, params?: any): any => {
    return httpRequest.skill<any>({
      url: '/upload',
      method: 'post',
      withCredentials: true,
      data: formData,
      params: params,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // storage file上传接口
  uploadStorageFile: (formData: FormData): any => {
    return httpRequest.fuyao<any>({
      url: '/resource/resource-management/v1/storage/file',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // workspace清理并上传接口 (FormData 参数名：flie)
  clearAndUploadWorkspace: (formData: FormData, userId: string, agentId: string): any => {
    return httpRequest.direct<any>({
      baseURL: ai,
      url: `/aiapp-v2/v1/skills/${userId}/${agentId}/workspace/clear-and-upload`,
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // skill创建接口
  createSkill: (body: any): any => {
    return httpRequest.skill<any>({
      url: '',
      method: 'post',
      data: body,
    });
  },

  // skill列表查询接口
  querySkillList: (params: any): any => {
    return httpRequest.skill<any>({
      url: '',
      method: 'get',
      params,
    });
  },

  // 我的发布列表查询接口
  queryMySkills: (params: any): any => {
    return httpRequest.skill<any>({
      url: '/my',
      method: 'get',
      params,
    });
  },

  // projSkill发布到市场接口
  publishProjSkill: (body: any): any => {
    return httpRequest.skill<any>({
      url: '/publish-to-market',
      method: 'post',
      data: body,
    });
  },

  // skill下载接口
  downloadSkill: (params: any, id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}/download`,
      method: 'post',
      params: params,
    });
  },
  // 单个skill下载量统计接口
  downloadSkillStats: (id: string, params: any): any => {
    return httpRequest.skill<any>({
      url: `/${id}/download-stats`,
      method: 'get',
      params,
    });
  },

  // skill详情查询接口
  querySkillDetail: (id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}`,
      method: 'get',
    });
  },

  // 获取skill详情文件内容
  querySkillFile: (skillId: string, params: any): any => {
    return httpRequest.skill<any>({
      url: `/${skillId}/fileContent`,
      method: 'get',
      params,
    });
  },

  /** `GET /api/skills/{id}/versions` 版本列表 */
  querySkillVersions: (id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}/versions`,
      method: 'get',
    });
  },

  /** `DELETE /api/skills/{id}/all` 删除 Skill 及全部版本；params 含操作者工号 userId */
  deleteSkillAll: (id: string, params: any): any => {
    return httpRequest.skill<any>({
      url: `/${id}/all`,
      method: 'delete',
      params,
    });
  },

  /** `DELETE /api/skills/{id}` 下架指定版本；params 含 version、userId */
  unpublishSkillVersion: (id: string, params: any): any => {
    return httpRequest.skill<any>({
      url: `/${id}`,
      method: 'delete',
      params,
    });
  },

  // skill版本上传接口
  uploadSkillVersion: (formData: FormData, id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}/versions`,
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // skill发起同步至Agent Center组织接口
  syncSkillToAgentCenter: (body: any, id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}/sync-applications`,
      method: 'post',
      data: body,
    });
  },

  // skill发起更新同步接口
  syncUpdateSkillToAgentCenter: (body: any, id: string): any => {
    return httpRequest.skill<any>({
      url: `/${id}/sync-update-applications`,
      method: 'post',
      data: body,
    });
  },

  // skill审核同步申请接口
  reviewSyncApplication: (body: any, id: string): any => {
    return httpRequest.api<any>({
      url: `/sync-applications/${id}/review`,
      method: 'post',
      data: body,
    });
  },

  // 审核中心查询接口
  querySyncApplicationList: (params: any): any => {
    return httpRequest.api<any>({
      url: '/sync-applications',
      method: 'get',
      params,
    });
  },

  // 当前用户角色查询接口
  queryCurrentUserRole: (params: any): any => {
    return httpRequest.api<any>({
      url: '/users/current/role',
      method: 'get',
      params,
    });
  },

  // 组织查询接口（通用，/api/organizations）
  queryOrganizationList: (params?: any): any => {
    return httpRequest.api<any>({
      url: '/organizations',
      method: 'get',
      params,
    });
  },

  // 评审中心-组织查询接口（/api/skills/personal-batch/organizations）
  queryReviewOrganizations: (params?: any): any => {
    return httpRequest.skill<any>({
      url: '/personal-batch/organizations',
      method: 'get',
      params,
    });
  },

  // 组织创建接口
  createOrganization: (body: any, params?: any): any => {
    return httpRequest.api<any>({
      url: '/organizations',
      method: 'post',
      data: body,
      params,
    });
  },

  // 组织更新接口
  updateOrganization: (body: any, params: any | undefined, id: string): any => {
    return httpRequest.api<any>({
      url: `/organizations/${id}`,
      method: 'put',
      data: body,
      params,
    });
  },

  // 部门树查询接口
  queryDepartmentTree: (): any => {
    return httpRequest.api<any>({
      url: '/departments/tree',
      method: 'get',
    });
  },

  // 左侧目录栏业务维度查询接口；HTTP 模式下如路径调整，只改 endpoints.businessDimensions 即可
  queryBusinessDimensions: (params: any): any => {
    return httpRequest.api<any>({
      url: '/dashboard/categoryStats',
      method: 'get',
      params,
    });
  },

  // 运营管理接口
  queryDashboardOverview: (params: any): any => {
    return httpRequest.api<any>({
      url: '/dashboard/overview',
      method: 'get',
      params,
    });
  },

  /**
   *
   * Skill 规划相关接口
   */
  // 查询Skill规划部门列表
  querySkillPlanningDepartments: (params: { userId: string }): any => {
    return httpRequest.skill<any>({
      url: '/config/department',
      method: 'get',
      params,
    });
  },

  // 更新部门管理员；body包含当前用户工号及管理员列表
  updateSkillPlanningDepartmentAdmins: (body: SkillPlanningDepartmentAdminsBody): any => {
    return httpRequest.skill<any>({
      url: '/config/department/admins',
      method: 'put',
      data: body,
    });
  },

  // skill 规划补充相关接口
  createSkillPlanningSupplement: (
    body: CreateSkillPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.skill<any>({
      url: '/config/supplement/add',
      method: 'post',
      data: body,
      params,
    });
  },

  querySkillPlanningSupplement: (params: QuerySkillPlanningSupplementParams): any => {
    return httpRequest.skill<any>({
      url: '/config/supplement/query',
      method: 'get',
      params,
    });
  },

  updateSkillPlanningSupplement: (
    body: UpdateSkillPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.skill<any>({
      url: '/config/supplement/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteSkillPlanningSupplement: (id: string | number, userId: string): any => {
    return httpRequest.skill<any>({
      url: `/config/supplement/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  batchDeleteSkillPlanningSupplement: (
    body: BatchDeleteSkillPlanningSupplementBody,
    userId: string,
  ): any => {
    return httpRequest.skill<any>({
      url: '/config/supplement/batch_delete',
      method: 'delete',
      data: body,
      params: { userId },
    });
  },

  importSkillPlanningSupplement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.skill<unknown>({
      url: '/config/supplement/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportSkillPlanningSupplement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.skill<ApiEnvelope<string>>({
      url: '/config/supplement/export',
      method: 'get',
      params,
    });
  },

  // skill 原子能力相关接口

  createSkillMasterManagement: (
    body: CreateSkillMasterManagementBody,
    params: CreateSkillMasterManagementParams,
  ): any => {
    return httpRequest.skill<any>({
      url: '/management/add',
      method: 'post',
      data: body,
      params,
    });
  },

  querySkillMasterManagement: (body: QuerySkillMasterManagementBody): any => {
    return httpRequest.skill<any>({
      url: '/management/query',
      method: 'get',
      params: body,
    });
  },

  batchDeleteSkillMasterManagement: (ids: Array<string | number>, userId: string): any => {
    return httpRequest.skill<any>({
      url: '/management/batch_delete',
      method: 'delete',
      data: ids,
      params: { userId },
    });
  },

  updateSkillMasterManagement: (
    body: UpdateSkillMasterManagementBody,
    params: UpdateSkillMasterManagementParams,
  ): any => {
    return httpRequest.skill<any>({
      url: '/management/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteSkillMasterManagement: (id: string | number, userId: string): any => {
    return httpRequest.skill<any>({
      url: `/management/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  importSkillMasterManagement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.skill<unknown>({
      url: '/management/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportSkillMasterManagement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.skill<ApiEnvelope<string>>({
      url: '/management/export',
      method: 'get',
      params,
    });
  },

  updateSkillPlanning: (body: any): any => {
    return httpRequest.skill<any>({
      url: `/config/update`,
      method: 'put',
      data: body,
    });
  },

  // 批量更改skill规划
  batchUpdateSkillPlanning: (body: any): any => {
    return httpRequest.skill<any>({
      url: `/config/batch_update`,
      method: 'put',
      data: body,
    });
  },

  deleteSkillPlanning: (params: any): any => {
    return httpRequest.skill<any>({
      url: `/config/singel_delete`,
      method: 'delete',
      params,
    });
  },

  batchDeleteSkillPlanning: (body: any): any => {
    return httpRequest.skill<any>({
      url: '/config/batch_delete',
      method: 'delete',
      data: body,
    });
  },

  importSkillPlanning: (formData: FormData): any => {
    return httpRequest.skill<any>({
      url: '/config/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  exportSkillPlanning: (body: any): any => {
    return httpRequest.skill<any>({
      url: '/config/export',
      method: 'post',
      data: body,
    });
  },

  // 下载skill规划导入excel的模板
  downloadSkillPlanning: (): any => {
    return httpRequest.skill<any>({
      url: '/config/download_template',
      method: 'get',
    });
  },

  // 模糊查询产品
  getProductPlanning: (params: any): any => {
    return httpRequest.skill<any>({
      url: '/config/search_offering',
      method: 'get',
      params,
    });
  },

  // harness 查询接口

  // 查询当前用户的部门管理权限（有哪些部门可以管理）
  queryHarnessDeptPermissions: (params: { userId: string }): any => {
    return httpRequest.api<any>({
      url: '/harness/permission/user-depts',
      method: 'get',
      params, // { userId }
    });
  },

  // harness 权限人员列表查询
  queryHarnessPermissionUsers: (params: QueryHarnessPermissionUsersParams): any => {
    return httpRequest.api<any>({
      url: '/harness/permission/query',
      method: 'get',
      params,
    });
  },

  // harness 权限人员更新
  updateHarnessPermissionUsers: (body: UpdateHarnessPermissionUsersRequest): any => {
    return httpRequest.api<any>({
      url: '/harness/permission/update',
      method: 'put',
      data: body,
    });
  },

  // 查询某个部门的产品列表
  queryHarnessDeptProducts: (params: { deptCode: string }): any => {
    return httpRequest.api<any>({
      url: '/harness/smapi-product-by-dept',
      method: 'get',
      params, // { deptCode }
    });
  },

  // 获取场景列表
  getSceneOptionGroups: (params: SceneOptionGroupsParams): Promise<SceneOptionGroupsResponse> => {
    return httpRequest.api<SceneOptionGroupsResponse>({
      url: '/scene-activity/scene',
      method: 'get',
      params, // { userId, dimType, dimCode, dimName }
    });
  },

  // 全量刷新场景配置
  refreshSceneOptionGroups: (
    body: RefreshSceneOptionGroupsBody,
    params: SceneOptionGroupsParams,
  ): Promise<unknown> => {
    return httpRequest.api<unknown>({
      url: '/scene-activity/scene',
      method: 'post',
      params,
      data: body,
    });
  },

  // 获取活动列表
  getActivityOptionGroups: (params: SceneOptionGroupsParams): any => {
    return httpRequest.api<any>({
      url: '/scene-activity/activity',
      method: 'get',
      params, // { userId, dimType, dimCode, dimName }
    });
  },

  // 全量刷新活动配置
  refreshActivityOptionGroups: (
    body: RefreshActivityOptionGroupsBody,
    params: SceneOptionGroupsParams,
  ): Promise<unknown> => {
    return httpRequest.api<unknown>({
      url: '/scene-activity/activity',
      method: 'post',
      params,
      data: body,
    });
  },

  // 查询当前用户的Skill规划待办
  queryMySkillPlanningTasks: (params: { userId: string }): any => {
    return httpRequest.skill<any>({
      url: '/config/task/my',
      method: 'get',
      params,
    });
  },

  // 查询Skill规划操作日志
  querySkillPlanningOperationLogs: (params: any): any => {
    return httpRequest.skill<any>({
      url: '/config/operation_log',
      method: 'get',
      params,
    });
  },

  // 内部定时任务：刷新规划表进度
  refreshSkillPlanningTaskProgress: (): any => {
    return httpRequest.skill<any>({
      url: '/config/task/refresh-progress',
      method: 'get',
    });
  },

  /*
   * skill评审相关接口
   */

  // 判断是否为专家
  isReviewer: (params: { userId?: string }): Promise<ApiEnvelope<ExpertCheckDto>> => {
    return httpRequest.skill<ApiEnvelope<ExpertCheckDto>>({
      url: '/review/expert/check',
      method: 'get',
      params,
    });
  },

  // 获取评审的Skill列表
  getSkillReviewList: (params: any): any => {
    return httpRequest.skill<any>({
      url: '/review/list',
      method: 'get',
      params,
    });
  },

  // 获取评审详情
  getSkillReviewDetail: (skillId: string, params: any): any => {
    return httpRequest.skill<any>({
      url: `/review/${skillId}/detail`,
      method: 'get',
      params,
    });
  },

  // 获取专家评审维度
  getExpertReviewDimension: (): any => {
    return httpRequest.skill<any>({
      url: `/review/dimensions`,
      method: 'get',
    });
  },

  // 触发AI评审
  refreshAIReview: (): any => {
    return httpRequest.skill<any>({
      url: `/review/ai-score/refresh`,
      method: 'get',
    });
  },

  // 获取AI评审维度
  getAIReviewDimension: (): any => {
    return httpRequest.skill<any>({
      url: `/review/ai-dimensions`,
      method: 'get',
    });
  },

  // 获取勋章列表
  getReviewBadges: (): any => {
    return httpRequest.skill<any>({
      url: `/review/badges`,
      method: 'get',
    });
  },

  // 提交专家评审结果
  submitExpertReview: (skillId: string, body: any): any => {
    return httpRequest.skill<any>({
      url: `/review/${skillId}/submit`,
      method: 'post',
      data: body,
    });
  },

  // 评审历史记录
  getReviewHistory: (skillId: string): any => {
    return httpRequest.skill<any>({
      url: `/review/${skillId}/history`,
      method: 'get',
    });
  },

  // 质量评审列表查询接口
  queryQualityReviewList: (params: any): any => {
    return httpRequest.api<any>({
      url: '/skill-quality-reviews',
      method: 'get',
      params,
    });
  },

  // 质量评审保存接口
  saveQualityReview: (body: any): any => {
    return httpRequest.api<any>({
      url: '/skill-quality-reviews/save',
      method: 'post',
      data: body,
    });
  },

  // 质量评审归档接口
  archiveQualityReview: (body: any): any => {
    return httpRequest.api<any>({
      url: '/skill-quality-reviews/archive',
      method: 'post',
      data: body,
    });
  },

  // ==================== Agent 调测相关接口 ====================

  // agent详情查询
  getAgentDetail: (userId: string, agentId: string): any => {
    return httpRequest.direct<any>({
      baseURL: corecode,
      url: `/aiapp-v2/v1/ai_app_api/agent_portal/agent/detail?appId=${agentId}&userId=${userId}`,
      method: 'get',
    });
  },
  // agent用户config接口
  getAgentConfig: (agentId: string, userId: string): any => {
    return httpRequest.direct<any>({
      baseURL: ai,
      url: `/aiapp-v2/v1/ai_agent/agent_config/${agentId}/${userId}`,
      method: 'get',
    });
  },
  // streamchat
  apiRun: (data: any): any => {
    return httpRequest.direct<any>({
      baseURL: ai,
      url: `/aiapp-v2/v1/ai_app_api/run/stream_chat`,
      method: 'post',
      data: data,
    });
  },
  // agent插入历史记录接口
  setHistoryInfo: (data: any): any => {
    return httpRequest.direct<any>({
      baseURL: ai,
      url: `/aiapp-v2/v1/ai_api_history/insert_record`,
      method: 'post',
      data: data,
    });
  },

  // 热榜数量接口
  getHotSkillNums: (): any => {
    return httpRequest.skill<any>({
      url: '/stat',
      method: 'get',
    });
  },

  /*
   * 自进化草稿（skill drafts）相关接口，统一前缀 /api/skill-drafts
   */

  // 草稿列表查询接口（前端展示用）
  querySkillDraftList: (params: any): any => {
    return httpRequest.skillDraft<any>({
      url: '',
      method: 'get',
      params,
    });
  },

  // 草稿详情查询接口
  querySkillDraftDetail: (id: string): any => {
    return httpRequest.skillDraft<any>({
      url: `/${id}`,
      method: 'get',
    });
  },

  // 草稿审批通过接口；params 含审批人工号 userId
  approveSkillDraft: (id: string, params: any): any => {
    return httpRequest.skillDraft<any>({
      url: `/${id}/approve`,
      method: 'post',
      params,
    });
  },

  // 草稿审批驳回接口；params 含审批人工号 userId、可选驳回原因 reason
  rejectSkillDraft: (id: string, params: any): any => {
    return httpRequest.skillDraft<any>({
      url: `/${id}/reject`,
      method: 'post',
      params,
    });
  },

  // 草稿下载接口；params 含操作人工号 userId，返回下载 URL
  downloadSkillDraft: (id: string, params: any): any => {
    return httpRequest.skillDraft<any>({
      url: `/${id}/download`,
      method: 'post',
      params,
    });
  },

  /*
   * 部门 Skill 评审相关接口，统一前缀 /api/skills/personal-batch
   * 对接后端 SkillBatchPublishController
   */

  // 1. 部门树
  queryDeptReviewDepartments: (): any => {
    return httpRequest.api<any>({
      url: 'versioninfo/v1/hrms/departments/product/ai',
      method: 'get',
    });
  },

  // 1.1 可视部门树（用于部门评审可选性控制）
  queryVisibleDepts: (params?: { userId?: string }): any => {
    return httpRequest.api<any>({
      url: '/api/skills/personal-batch/visible-depts',
      method: 'get',
      params,
    });
  },

  // 2. 部门评审 Skill 列表 -> 后端 GET /publishable
  queryDeptReviewSkills: (params: any): any => {
    return httpRequest.api<any>({
      url: '/api/skills/personal-batch/publishable',
      method: 'get',
      params,
    });
  },

  // 3. 某 Skill 的意见列表 -> 后端 GET /opinions/{skillId}
  queryDeptSkillComments: (skillId: string, params: any): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/opinions/${skillId}`,
      method: 'get',
      params,
    });
  },

  // 4. 提交评审意见 -> 后端 POST /opinions
  submitDeptSkillComment: (skillId: string, body: any): any => {
    return httpRequest.api<any>({
      url: '/api/skills/personal-batch/opinions',
      method: 'post',
      data: { skillId, ...body },
    });
  },

  // 4.1 关闭（闭环）意见 -> 后端 POST /opinions/{opinionId}/close
  closeDeptSkillComment: (opinionId: string, userId: string): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/opinions/${opinionId}/close`,
      method: 'post',
      data: { userId },
    });
  },

  // 4.2 添加回复（提出人或 Owner ) -> 后端 POST /opinions/{opinionId}/replies
  addDeptSkillReply: (
    opinionId: string,
    userId: string,
    userName: string,
    content: string,
  ): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/opinions/${opinionId}/replies`,
      method: 'post',
      data: { userId, userName, content },
    });
  },

  // 4.3 删除检视意见（仅提出人） -> 后端 DELETE /opinions/{opinionId}?userId={userId}
  deleteDeptSkillComment: (opinionId: string, userId: string): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/opinions/${opinionId}`,
      method: 'delete',
      params: { userId },
    });
  },

  // 4.4 删除回复（仅回复人） -> 后端 DELETE /opinions/{opinionId}/replies/{replyId}?userId={userId}
  deleteDeptSkillReply: (opinionId: string, replyId: string, userId: string): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/opinions/${opinionId}/replies/${replyId}`,
      method: 'delete',
      params: { userId },
    });
  },

  // 5. 创建发布任务 -> 后端 POST /submit-preview
  createDeptPublishTask: (body: any): any => {
    return httpRequest.api<any>({
      url: '/api/skills/personal-batch/submit-preview',
      method: 'post',
      data: body,
    });
  },

  // 6. 发布任务列表 -> 后端 GET /tasks
  queryDeptPublishTasks: (params: any): any => {
    return httpRequest.api<any>({
      url: '/api/skills/personal-batch/tasks',
      method: 'get',
      params,
    });
  },

  // 7. 发布任务详情 -> 后端 GET /tasks/{taskId}
  queryDeptPublishTaskDetail: (taskId: string, params: any): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/tasks/${taskId}`,
      method: 'get',
      params,
    });
  },

  // 8. Owner一键发布 -> 后端 POST /tasks/{taskId}/publish
  publishDeptTask: (taskId: string, body: any): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/tasks/${taskId}/publish`,
      method: 'post',
      data: body,
      withCredentials: true,
    });
  },

  // 9. 重试失败项 -> 后端 POST /tasks/{taskId}/retry
  retryDeptTaskFailedItems: (taskId: string, body: any): any => {
    return httpRequest.api<any>({
      url: `/api/skills/personal-batch/tasks/${taskId}/retry`,
      method: 'post',
      data: body,
    });
  },
};

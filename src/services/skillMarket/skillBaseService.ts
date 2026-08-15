import httpRequest from '@/services/skillMarket/request';
import type {
  ApiEnvelope,
  BatchDeleteSkillPlanningSupplementBody,
  CreateAgentMasterManagementBody,
  CreateAgentPlanningSupplementBody,
  CreateCommandMasterManagementBody,
  CreateCommandPlanningSupplementBody,
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
  UpdateAgentMasterManagementBody,
  UpdateAgentPlanningSupplementBody,
  UpdateCommandMasterManagementBody,
  UpdateCommandPlanningSupplementBody,
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
  referenceCount: number;
}

export type SceneOptionGroupsResponse = ApiEnvelope<SceneOptionGroupRow[]> | SceneOptionGroupRow[];

export interface ActivityOptionGroupRow {
  deptCode: string;
  deptName: string;
  activityNodeName: string;
  subActivityNodeName: string;
  sort: number;
  referenceCount: number;
}

export type ActivityOptionGroupsResponse =
  | ApiEnvelope<ActivityOptionGroupRow[]>
  | ActivityOptionGroupRow[];

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

  // skill 规划列表相关接口
  createSkillPlanningSupplement: (
    body: CreateSkillPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessSkill<any>({
      url: '/config/supplement/add',
      method: 'post',
      data: body,
      params,
    });
  },

  querySkillPlanningSupplement: (params: QuerySkillPlanningSupplementParams): any => {
    return httpRequest.harnessSkill<any>({
      url: '/config/supplement/query',
      method: 'get',
      params,
    });
  },

  updateSkillPlanningSupplement: (
    body: UpdateSkillPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessSkill<any>({
      url: '/config/supplement/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteSkillPlanningSupplement: (id: string | number, userId: string): any => {
    return httpRequest.harnessSkill<any>({
      url: `/config/supplement/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  batchDeleteSkillPlanningSupplement: (
    body: BatchDeleteSkillPlanningSupplementBody,
    userId: string,
  ): any => {
    return httpRequest.harnessSkill<any>({
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
    return httpRequest.harnessSkill<unknown>({
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
    return httpRequest.harnessSkill<ApiEnvelope<string>>({
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
    return httpRequest.harnessSkill<any>({
      url: '/management/add',
      method: 'post',
      data: body,
      params,
    });
  },

  querySkillMasterManagement: (body: QuerySkillMasterManagementBody): any => {
    return httpRequest.harnessSkill<any>({
      url: '/management/query',
      method: 'get',
      params: body,
    });
  },

  batchDeleteSkillMasterManagement: (ids: Array<string | number>, userId: string): any => {
    return httpRequest.harnessSkill<any>({
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
    return httpRequest.harnessSkill<any>({
      url: '/management/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteSkillMasterManagement: (id: string | number, userId: string): any => {
    return httpRequest.harnessSkill<any>({
      url: `/management/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  importSkillMasterManagement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.harnessSkill<unknown>({
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
    return httpRequest.harnessSkill<ApiEnvelope<string>>({
      url: '/management/export',
      method: 'get',
      params,
    });
  },

  // Agent 规划相关接口
  createAgentPlanningSupplement: (
    body: CreateAgentPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessAgent<any>({
      url: '/config/supplement/add',
      method: 'post',
      data: body,
      params,
    });
  },

  queryAgentPlanningSupplement: (params: QuerySkillPlanningSupplementParams): any => {
    return httpRequest.harnessAgent<any>({
      url: '/config/supplement/query',
      method: 'get',
      params,
    });
  },

  updateAgentPlanningSupplement: (
    body: UpdateAgentPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessAgent<any>({
      url: '/config/supplement/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteAgentPlanningSupplement: (id: string | number, userId: string): any => {
    return httpRequest.harnessAgent<any>({
      url: `/config/supplement/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  batchDeleteAgentPlanningSupplement: (
    body: BatchDeleteSkillPlanningSupplementBody,
    userId: string,
  ): any => {
    return httpRequest.harnessAgent<any>({
      url: '/config/supplement/batch_delete',
      method: 'delete',
      data: body,
      params: { userId },
    });
  },

  importAgentPlanningSupplement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.harnessAgent<unknown>({
      url: '/config/supplement/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportAgentPlanningSupplement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.harnessAgent<ApiEnvelope<string>>({
      url: '/config/supplement/export',
      method: 'get',
      params,
    });
  },

  // Agent 原子能力相关接口
  createAgentMasterManagement: (
    body: CreateAgentMasterManagementBody,
    params: CreateSkillMasterManagementParams,
  ): any => {
    return httpRequest.harnessAgent<any>({
      url: '/management/add',
      method: 'post',
      data: body,
      params,
    });
  },

  queryAgentMasterManagement: (body: QuerySkillMasterManagementBody): any => {
    return httpRequest.harnessAgent<any>({
      url: '/management/query',
      method: 'get',
      params: body,
    });
  },

  batchDeleteAgentMasterManagement: (ids: Array<string | number>, userId: string): any => {
    return httpRequest.harnessAgent<any>({
      url: '/management/batch_delete',
      method: 'delete',
      data: ids,
      params: { userId },
    });
  },

  updateAgentMasterManagement: (
    body: UpdateAgentMasterManagementBody,
    params: UpdateSkillMasterManagementParams,
  ): any => {
    return httpRequest.harnessAgent<any>({
      url: '/management/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteAgentMasterManagement: (id: string | number, userId: string): any => {
    return httpRequest.harnessAgent<any>({
      url: `/management/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  importAgentMasterManagement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.harnessAgent<unknown>({
      url: '/management/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportAgentMasterManagement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.harnessAgent<ApiEnvelope<string>>({
      url: '/management/export',
      method: 'get',
      params,
    });
  },

  // Command 规划相关接口
  createCommandPlanningSupplement: (
    body: CreateCommandPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessCommand<any>({
      url: '/config/supplement/add',
      method: 'post',
      data: body,
      params,
    });
  },

  queryCommandPlanningSupplement: (params: QuerySkillPlanningSupplementParams): any => {
    return httpRequest.harnessCommand<any>({
      url: '/config/supplement/query',
      method: 'get',
      params,
    });
  },

  updateCommandPlanningSupplement: (
    body: UpdateCommandPlanningSupplementBody,
    params: SkillPlanningSupplementMutationParams,
  ): any => {
    return httpRequest.harnessCommand<any>({
      url: '/config/supplement/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteCommandPlanningSupplement: (id: string | number, userId: string): any => {
    return httpRequest.harnessCommand<any>({
      url: `/config/supplement/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  batchDeleteCommandPlanningSupplement: (
    body: BatchDeleteSkillPlanningSupplementBody,
    userId: string,
  ): any => {
    return httpRequest.harnessCommand<any>({
      url: '/config/supplement/batch_delete',
      method: 'delete',
      data: body,
      params: { userId },
    });
  },

  importCommandPlanningSupplement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.harnessCommand<unknown>({
      url: '/config/supplement/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportCommandPlanningSupplement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.harnessCommand<ApiEnvelope<string>>({
      url: '/config/supplement/export',
      method: 'get',
      params,
    });
  },

  // Command 原子能力相关接口
  createCommandMasterManagement: (
    body: CreateCommandMasterManagementBody,
    params: CreateSkillMasterManagementParams,
  ): any => {
    return httpRequest.harnessCommand<any>({
      url: '/management/add',
      method: 'post',
      data: body,
      params,
    });
  },

  queryCommandMasterManagement: (body: QuerySkillMasterManagementBody): any => {
    return httpRequest.harnessCommand<any>({
      url: '/management/query',
      method: 'get',
      params: body,
    });
  },

  batchDeleteCommandMasterManagement: (ids: Array<string | number>, userId: string): any => {
    return httpRequest.harnessCommand<any>({
      url: '/management/batch_delete',
      method: 'delete',
      data: ids,
      params: { userId },
    });
  },

  updateCommandMasterManagement: (
    body: UpdateCommandMasterManagementBody,
    params: UpdateSkillMasterManagementParams,
  ): any => {
    return httpRequest.harnessCommand<any>({
      url: '/management/update',
      method: 'put',
      data: body,
      params,
    });
  },

  deleteCommandMasterManagement: (id: string | number, userId: string): any => {
    return httpRequest.harnessCommand<any>({
      url: `/management/delete/${encodeURIComponent(String(id))}`,
      method: 'delete',
      params: { userId },
    });
  },

  importCommandMasterManagement: (
    formData: FormData,
    params: SkillTransferParams,
  ): Promise<unknown> => {
    return httpRequest.harnessCommand<unknown>({
      url: '/management/import',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params,
    });
  },

  exportCommandMasterManagement: (params: SkillTransferParams): Promise<ApiEnvelope<string>> => {
    return httpRequest.harnessCommand<ApiEnvelope<string>>({
      url: '/management/export',
      method: 'get',
      params,
    });
  },

  // Extension 相关接口
  // 查询用户可发布组织列表
  // 响应示例：{
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 2
  //   },
  //   "data": [
  //     {
  //       "deptId": "L0001",
  //       "deptName": "开发一部",
  //       "orgCode": "ORG001",
  //       "orgName": "AI平台",
  //     },
  //     {
  //       "deptId": "L0002",
  //       "deptName": "开发二部",
  //       "orgCode": "ORG002",
  //       "orgName": "AI平台2",
  //     }
  //   ]
  // }
  queryUserPublishableOrgs: (params: { userId: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/extensions/orgs',
      method: 'get',
      params,
    });
  },
  // 查询场景及绑定规划件
  // 请求体body示例：
  // {
  //   "dimType": "部门级",
  //   "dimCode": "00001",
  //   "dimName": "开发一部",
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 2
  //   },
  //   "data": {
  //     "scenes": [{
  //       "firstScene": "1",
  //       "secondScenes": [
  //         {
  //           "secondScene": "架构涉及",
  //           "subScenes": "已就绪"
  //           "components": {
  //             "commands": [
  //               {
  //                 "name": "cmd-A",
  //                 "version": "v1.0.0",
  //                 "uploadAt": "2026-01-01 12:00:00",
  //               }
  //             ],
  //             "agents": [
  //               {
  //                 "name": "agent-A",
  //                 "version": "v1.0.0",
  //                 "uploadAt": "2026-01-01 12:00:00",
  //               }
  //             ],
  //             "skills": [
  //               {
  //                 "name": "skill-A",
  //                 "version": "v1.0.0",
  //                 "uploadAt": "2026-01-01 12:00:00",
  //               }
  //             ],
  //           }
  //         }
  //       ]
  //     }
  //   ]
  // }
  querySceneAndBindingPlanningItems: (params: { userId: string }, body: any): any => {
    return httpRequest.harnessApi<any>({
      url: '/scenes/bindings',
      method: 'post',
      data: body,
      params,
    });
  },
  // Extension 保存
  // params示例：
  // {
  //   "userId": "1234567890",
  //   "operatorName": "L0001",
  //   "dimType": "部门级",
  //   "dimCode": "00001",
  //   "dimName": "开发一部",
  // }
  // body示例：
  // {
  //   "extensionName": "L0001",
  //   "description": "v1.0.0",
  //   "releaseType": "描述",
  //   "firstScene": "命令",
  //   "secondScene": "场景",
  //   "targeteOrgCode": "架构涉及",
  //   "targetOrgName": "已就绪",
  //   "agents": [
  //     {
  //       "name": "agent-A",
  //       "version": "v1.0.0",
  //     }
  //   ],
  //   "skills": [
  //     {
  //       "name": "skill-A",
  //       "version": "v1.0.0",
  //     }
  //   ],
  //   "commands": [
  //     {
  //       "name": "command-A",
  //       "version": "v1.0.0",
  //     }
  //   ],
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 1
  //   },
  //   "data": {
  //     "id": "xxxxx",
  //   }
  // }
  saveExtension: (params: any, body: any): any => {
    return httpRequest.harnessApi<any>({
      url: '/extensions',
      method: 'post',
      data: body,
      params,
    });
  },
  // 查询发布历史清单
  // body示例：
  // {
  //   "dimType": "部门级",
  //   "dimCode": "00001",
  //   "dimName": "开发一部",
  //   "firstScene": "命令",
  //   "secondScene": "场景",
  //   "keyword": "描述",
  //   "publishStatus": "发布成功",
  //   "releaseType": "beta",
  //   "pageNum": 1,
  //   "pageSize": 10,
  //   "sortBy": "updatedAt",
  //   "sortOrder": "desc",
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 1
  //   },
  //   "data": {
  //     "total": 1,
  //     "list": [
  //       {
  //         "id": "xxxxx",
  //         "extensionName": "L0001",
  //         "description": "v1.0.0",
  //         "releaseType": "描述",
  //         "firstScene": "命令",
  //         "secondScene": "场景",
  //         "targeteOrgCode": "架构涉及",
  //         "targetOrgName": "已就绪",
  //         "agents": [
  //           {
  //             "name": "agent-A",
  //             "version": "v1.0.0",
  //           }
  //         ],
  //         "skills": [
  //           {
  //             "name": "skill-A",
  //             "version": "v1.0.0",
  //           }
  //         "commands": [
  //           {
  //             "name": "command-A",
  //             "version": "v1.0.0",
  //           }
  //         ],
  //       }
  //     ],
  //   }
  // }
  queryPublishedHistoryList: (body: any): any => {
    return httpRequest.harnessApi<any>({
      url: '/extensions/history',
      method: 'post',
      data: body,
    });
  },
  // 规划件目录树
  // params示例：
  // {
  //   "userId": "1234567890",
  //   "componentType": "skill" | "agent" | "command",
  //   "componentName": "skill-A",
  //   "componentVersion": "v1.0.0"
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 1
  //   },
  //   "data": [
  //     "README.md",
  //     "src/index.js",
  //     "src/utils.js",
  //     "config.yaml",
  //   ]
  // }
  queryPlanningItemTree: (params: any): any => {
    return httpRequest.harnessApi<any>({
      url: '/packages/tree',
      method: 'get',
      params,
    });
  },
  // 规划件文件内容
  // params示例：
  // {
  //   "userId": "1234567890",
  //   "componentType": "skill" | "agent" | "command",
  //   "componentName": "skill-A",
  //   "componentVersion": "v1.0.0",
  //   "filePath": "README.md"
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 1
  //   },
  //   "data": {
  //     "componentType": "skill" | "agent" | "command",
  //     "componentName": "skill-A",
  //     "componentVersion": "v1.0.0",
  //     "filePath": "README.md",
  //     "fileSize": 5120,
  //     "encoding": "utf-8",
  //     "content": "" // 文件内容
  //   }
  // }
  queryPlanningItemContent: (params: any): Promise<unknown> => {
    return httpRequest.harnessApi<unknown>({
      url: '/packages/file',
      method: 'get',
      params,
    });
  },

  // Extension 重试发布
  // params示例：
  // {
  //   "userId": "1234567890",
  //   "operatorName": "张三",
  // }
  // 响应示例：
  // {
  //   "meta": {
  //     "success": true,
  //     "message": "OK",
  //     "number": 1
  //   },
  //   "data": {
  //     "id": "xxxxx",
  //   }
  // }
  retryPublishExtension: (id: string, params: any): any => {
    return httpRequest.harnessApi<any>({
      url: `/extensions/${id}/retry`,
      method: 'post',
      params,
    });
  },

  // harness 查询接口

  // 查询当前用户的部门管理权限（有哪些部门可以管理）
  queryHarnessDeptPermissions: (params: { userId: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/permission/user-depts',
      method: 'get',
      params, // { userId }
    });
  },

  // harness 权限人员列表查询
  queryHarnessPermissionUsers: (params: QueryHarnessPermissionUsersParams): any => {
    return httpRequest.harnessApi<any>({
      url: '/permission/query',
      method: 'get',
      params,
    });
  },

  // harness 权限人员更新
  updateHarnessPermissionUsers: (body: UpdateHarnessPermissionUsersRequest): any => {
    return httpRequest.harnessApi<any>({
      url: '/permission/update',
      method: 'put',
      data: body,
    });
  },

  // 产品
  // 查询某个部门的产品列表
  queryHarnessDeptProducts: (params: { deptCode: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/smapi-product-by-dept',
      method: 'get',
      params, // { deptCode }
    });
  },

  // 获取场景列表
  getSceneOptionGroups: (params: SceneOptionGroupsParams): Promise<SceneOptionGroupsResponse> => {
    return httpRequest.harnessApi<SceneOptionGroupsResponse>({
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
    return httpRequest.harnessApi<unknown>({
      url: '/scene-activity/scene',
      method: 'post',
      params,
      data: body,
    });
  },

  // 获取活动列表
  getActivityOptionGroups: (
    params: SceneOptionGroupsParams,
  ): Promise<ActivityOptionGroupsResponse> => {
    return httpRequest.harnessApi<ActivityOptionGroupsResponse>({
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
    return httpRequest.harnessApi<unknown>({
      url: '/scene-activity/activity',
      method: 'post',
      params,
      data: body,
    });
  },

  // 查询当前用户的 Command 规划待办
  queryMyCommandPlanningTasks: (params: { userId: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/task/command/my',
      method: 'get',
      params,
    });
  },

  // 查询当前用户的 Agent 规划待办
  queryMyAgentPlanningTasks: (params: { userId: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/task/agent/my',
      method: 'get',
      params,
    });
  },

  // 查询当前用户的Skill规划待办
  queryMySkillPlanningTasks: (params: { userId: string }): any => {
    return httpRequest.harnessApi<any>({
      url: '/task/skill/my',
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

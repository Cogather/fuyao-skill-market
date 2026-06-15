import httpRequest from '@/services/skillMarket/request';

const _corecode_env = import.meta.env.VITE_SKILL_CORE_CODE_PROD_URL;

export const corecode = _corecode_env;

const _ai_env = import.meta.env.VITE_SKILL_CORE_CODE_URL;

export const ai = _ai_env;

export const skillBaseService = {
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

  // 组织查询接口
  queryOrganizationList: (params?: any): any => {
    return httpRequest.api<any>({
      url: '/organizations',
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

  /*
   * skill评审相关接口
   */

  // 判断是否为专家
  isReviewer: (params: any): any => {
    return httpRequest.skill<any>({
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

  // 热榜数量接口
  getHotSkillNums: (): any => {
    return httpRequest.skill<any>({
      url: '/stat',
      method: 'get',
    });
  },
};

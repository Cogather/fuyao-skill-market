import httpRequest from '@/services/skillMarket/request';
import type { SceneTagDimContext } from './sceneTagService';

export type WorkflowDimension = SceneTagDimContext;
export interface WorkflowSceneKey {
  firstScene: string;
  secondScene: string;
}
export type WorkflowSceneContext = WorkflowDimension & WorkflowSceneKey;
export type WorkflowAssetType = 'SKILL' | 'AGENT';
export type WorkflowComponentType = WorkflowAssetType | 'COMMAND';
export interface WorkflowSceneRow extends WorkflowSceneKey {
  sort: number;
  sceneExtensionCode?: string | null;
  secondSceneDescription?: string | null;
  flowName?: string | null;
  flowDescription?: string | null;
  tags?: string[];
  referenceCount?: number | null;
}
export interface WorkflowActivityRow extends WorkflowSceneKey {
  activityNodeName: string;
  subActivityNodeName?: string;
  sort: number;
}
export interface WorkflowPoolItem {
  assetType: WorkflowAssetType | 'Skill' | 'Agent';
  assetName: string;
  description?: string;
  packageReady?: boolean;
}
export interface WorkflowProgressStep {
  key: 'scenario' | 'workflow' | 'command' | 'assets';
  label: string;
  state: 'done' | 'partial' | 'todo';
  reason: string;
}
export interface WorkflowDetail {
  flowName: string | null;
  flowDescription: string | null;
  sceneExtensionCode: string | null;
  secondSceneDescription: string | null;
  commands: { commandName: string; description: string }[];
  assetPool: WorkflowPoolItem[];
  stages: {
    activityNodeName: string;
    sort: number;
    steps: { subActivityNodeName: string; sort: number; boundAssets: WorkflowPoolItem[] }[];
  }[];
  steps: WorkflowProgressStep[];
  nextStep: number;
  allDone: boolean;
}

interface refreshSceneBody {
  scenes: WorkflowSceneRow[];
}

interface updateSecondSceneCodeBody {
  secondScene: string;
  firstScene: string;
  sceneExtensionCode: string;
  secondSceneDescription?: string;
}

interface updateSceneMetadataBody {
  firstScene: string;
  secondScene: string;
  secondSceneDescription?: string;
  flowName?: string;
  flowDescription?: string;
}

export const harnessWorkflowService = {
  // Supporting requests for this tab use the same service, including lookup of binding IDs.
  queryConfigurationBindings: (
    type: WorkflowComponentType,
    params: WorkflowDimension & { pageNum: number; pageSize: number },
  ): Promise<any> =>
    httpRequest.harnessApi({
      url: '/' + type.toLowerCase() + 's/config/supplement/query',
      method: 'GET',
      params,
    }),
  queryCapabilities: (type: WorkflowComponentType, params: Record<string, unknown>): Promise<any> =>
    httpRequest.harnessApi({
      url: '/' + type.toLowerCase() + 's/management/query',
      method: 'GET',
      params,
    }),
  createCapability: (
    type: WorkflowComponentType,
    body: Record<string, unknown>,
    params: WorkflowDimension,
  ): Promise<any> =>
    httpRequest.harnessApi({
      url: '/' + type.toLowerCase() + 's/management/add',
      method: 'POST',
      params,
      data: body,
    }),
  queryProducts: (params: { deptCode: string }): Promise<any> =>
    httpRequest.harnessApi({ url: '/smapi-product-by-dept', method: 'GET', params }),
  queryUsers: (params: { info: string }): Promise<any> =>
    httpRequest.fuyao({ url: '/dataengineering/config-center/hw-userinfo', method: 'GET', params }),
  querySceneTags: (): Promise<any> =>
    httpRequest.harnessApi({ url: '/scene-tag/tags', method: 'GET' }),
  saveSceneTags: (
    body: { bindings: { firstScene: string; tags: string[] }[] },
    params: WorkflowDimension,
  ): Promise<any> =>
    httpRequest.harnessApi({
      url: '/scene-tag/bindings/refresh',
      method: 'POST',
      params,
      data: body,
    }),

  /**
   * 查询场景列表
   * @param params
   * @returns
   */
  querySceneList: (params: SceneTagDimContext): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/scene',
      method: 'GET',
      params: params,
    });
  },

  /**
   * 全量刷新场景
   * @param params
   * @returns
   */
  refreshScene: (params: SceneTagDimContext, body: refreshSceneBody): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/scene',
      method: 'POST',
      params: params,
      data: {
        ...body,
        scenes: body.scenes.map((scene) => ({
          ...scene,
          sceneExtensionCode: scene.secondScene ? (scene.sceneExtensionCode ?? '') : '',
          secondSceneDescription: scene.secondScene ? (scene.secondSceneDescription ?? '') : '',
          flowName: scene.secondScene ? (scene.flowName ?? '') : '',
          flowDescription: scene.secondScene ? (scene.flowDescription ?? '') : '',
        })),
      },
    });
  },

  /**
   * 更新二级场景编码与描述（场景改名时，须等待刷新场景完成后调用）
   * @param body
   * @param params
   * @returns
   */
  updateSecondSceneCode: (
    body: updateSecondSceneCodeBody,
    params: SceneTagDimContext,
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/scene/code',
      method: 'PUT',
      params: params,
      data: body,
    });
  },

  /**
   * 更新场景元数据
   * @param body
   * @param params
   * @returns
   */
  updateSceneMetadata: (
    body: updateSceneMetadataBody,
    params: SceneTagDimContext,
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/scene/workflow-meta',
      method: 'PUT',
      data: body,
      params: params,
    });
  },

  /**
   * 查询指定场景下的活动
   * @param params
   * @returns
   */
  queryActivitiesByScene: (params: WorkflowSceneContext): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/activity',
      method: 'GET',
      params: params,
    });
  },

  /**
   * 全量刷新活动
   * @param params
   * @returns
   */
  refreshActivities: (
    params: SceneTagDimContext,
    body: { activities: WorkflowActivityRow[] },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scene-activity/activity',
      method: 'POST',
      params: params,
      data: body,
    });
  },

  /**
   * Harness Workflow 列表
   * @param params
   * @returns
   */
  queryHarnessWorkflowList: (params: {
    userId: string;
    dimName: string;
    productCode?: string;
    status?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/workflow/list',
      method: 'GET',
      params: params,
    });
  },

  /**
   * 查询场景资产池
   * @param params
   * @returns
   */
  querySceneAssetPool: (
    params: Omit<WorkflowSceneContext, 'dimName'> & {
      dimName?: string;
      assetType?: WorkflowAssetType;
    },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/workflow/asset-pool',
      method: 'GET',
      params: params,
    });
  },

  /**
   * 组件入池 (SKILL / AGENT)
   * @param body
   * @param params
   * @returns
   */
  componentEnterPool: (
    body: Omit<WorkflowDimension, 'userId'> &
      WorkflowSceneKey & { assetType: WorkflowAssetType; assetName: string },
    params: { userId: string },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/workflow/asset-pool/add',
      method: 'POST',
      params,
      data: body,
    });
  },

  /**
   * 组件出池 (SKILL / AGENT)
   * @param body
   * @param params
   * @returns
   */
  componentExitPool: (
    params: WorkflowSceneContext & { assetType: WorkflowAssetType; assetName: string },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/workflow/asset-pool/remove',
      method: 'DELETE',
      params: params,
    });
  },

  /**
   * 查询Harness Workflow 详情
   * @param params
   * @returns
   */
  queryHarnessWorkflowDetail: (params: WorkflowSceneContext): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/workflow/detail',
      method: 'GET',
      params: params,
    });
  },

  /**
   * skill 绑定活动
   * @param body
   * @param params
   * @returns
   */
  skillBindActivity: (
    body: {
      skillName: string;
      firstScene: string;
      secondScene: string;
      activityNodeName: string;
      subActivityNodeName: string;
    },
    params: SceneTagDimContext,
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/skills/config/supplement/add',
      method: 'POST',
      data: body,
      params: params,
    });
  },

  /**
   * agent 绑定活动
   * @param body
   * @param params
   * @returns
   */
  agentBindActivity: (
    body: {
      agentName: string;
      firstScene: string;
      secondScene: string;
      activityNodeName: string;
      subActivityNodeName: string;
    },
    params: SceneTagDimContext,
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/agents/config/supplement/add',
      method: 'POST',
      data: body,
      params: params,
    });
  },

  /**
   * Command 绑定场景（场景级入口）
   * @param body
   * @param params
   * @returns
   */
  commandBindScene: (
    body: { commandName: string; firstScene: string; secondScene: string },
    params: SceneTagDimContext,
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/commands/config/supplement/add',
      method: 'POST',
      data: { ...body, activityNodeName: null, subActivityNodeName: null },
      params: params,
    });
  },

  /**
   *  Skill解绑场景
   * @param id
   * @returns
   */
  skillUnbindScene: (id: string, params: Pick<WorkflowDimension, 'userId'>): Promise<any> => {
    return httpRequest.harnessApi({
      url: `/skills/config/supplement/delete/${encodeURIComponent(id)}`,
      method: 'DELETE',
      params,
    });
  },

  /**
   * Agent解绑场景
   * @param id
   * @returns
   */
  agentUnbindScene: (id: string, params: Pick<WorkflowDimension, 'userId'>): Promise<any> => {
    return httpRequest.harnessApi({
      url: `/agents/config/supplement/delete/${encodeURIComponent(id)}`,
      method: 'DELETE',
      params,
    });
  },

  /**
   * Command解绑场景
   * @param id
   * @returns
   */
  commandUnbindScene: (id: string, params: Pick<WorkflowDimension, 'userId'>): Promise<any> => {
    return httpRequest.harnessApi({
      url: `/commands/config/supplement/delete/${encodeURIComponent(id)}`,
      method: 'DELETE',
      params,
    });
  },

  /**
   * 保存 Extension
   * @param body
   * @param params
   * @returns
   */
  saveExtension: (
    body: {
      description?: string;
      firstScene: string;
      secondScene: string;
      targetOrgCode: string;
      targetOrgName: string;
      agents?: { name: string; version: string }[];
      commands?: { name: string; version: string }[];
      skills?: { name: string; version: string }[];
      releaseType?: string;
    },
    params: {
      dimType: string;
      dimCode: string;
      dimName: string;
      userId: string;
      operatorName: string;
    },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/extensions',
      method: 'POST',
      data: body,
      params: params,
    });
  },

  /**
   * 场景绑定查询（一）
   * @param params
   * @returns
   */
  querySceneBinding: (
    body: { dimType: string; dimCode: string; dimName: string },
    params: { userId: string },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/scenes/bindings',
      method: 'POST',
      params: params,
      data: body,
    });
  },

  /**
   * Extension 单场景详情
   * @param params
   * @returns
   */
  queryExtensionSceneDetail: (
    params: { userId: string },
    body: { dimType: string; dimCode: string; dimName: string; extensionName: string },
  ): Promise<any> => {
    return httpRequest.harnessApi({
      url: '/extensions/detail',
      method: 'POST',
      params: params,
      data: body,
    });
  },
};

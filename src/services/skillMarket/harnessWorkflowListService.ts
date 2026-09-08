import { harnessWorkflowService } from './businessScenarioDesignService';

export type HarnessWorkflowListQuery = Parameters<
  typeof harnessWorkflowService.queryHarnessWorkflowList
>[0];

export interface HarnessWorkflowListRow {
  flowName: string | null;
  flowDescription: string | null;
  firstScene: string;
  secondScene: string;
  secondSceneDescription: string | null;
  sceneExtensionCode: string | null;
  dimType: string;
  dimCode: string;
  dimName: string;
  commandCount: number | null;
  status: string;
}

export interface HarnessWorkflowListPage {
  total: number;
  pageNo: number;
  pageSize: number;
  list: HarnessWorkflowListRow[];
}

export async function queryHarnessWorkflowPage(
  query: HarnessWorkflowListQuery,
): Promise<HarnessWorkflowListPage> {
  const response = await harnessWorkflowService.queryHarnessWorkflowList(query);
  if (response?.meta?.success !== true) {
    throw new Error(response?.meta?.message || '工作流列表加载失败');
  }
  const data = response.data;
  if (
    !data ||
    !Array.isArray(data.list) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.pageNo) ||
    data.pageNo < 1 ||
    !Number.isSafeInteger(data.pageSize) ||
    data.pageSize < 1
  ) {
    throw new Error('工作流列表响应缺少有效的分页信息');
  }
  return data;
}

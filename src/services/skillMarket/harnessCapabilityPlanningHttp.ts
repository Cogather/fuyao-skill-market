import type { CreateSkillPlanningSupplementBody } from './apiTypes';
import type {
  HarnessCapabilityCatalogQuery,
  MockHarnessCapabilityType,
} from './harnessCapabilityPlanningMock';
import type { SkillMasterPayload, SkillMasterRecord } from './skillMasterManagementService';
import type {
  ProductPlanningOption,
  SkillPlanningBatchPatch,
  SkillPlanningImportResult,
  SkillPlanningListResult,
  SkillPlanningQuery,
} from './skillPlanningShared';

/**
 * Command / Agent 规划尚未提供真实接口。
 *
 * 路径保持为空字符串，后续拿到后端契约后只需要在本文件补齐 endpoint、请求参数和响应映射，
 * 页面与 mock 数据层无需再次调整。查询方法当前返回空集合，写操作明确提示“接口待配置”。
 */
export const harnessCapabilityPlanningHttpEndpoints: Record<
  MockHarnessCapabilityType,
  {
    queryPlanning: string;
    createPlanning: string;
    updatePlanning: string;
    deletePlanning: string;
    batchDeletePlanning: string;
    batchUpdatePlanning: string;
    importPlanning: string;
    exportPlanning: string;
    downloadPlanningTemplate: string;
    queryCatalog: string;
    createCatalog: string;
    updateCatalog: string;
    deleteCatalog: string;
    batchDeleteCatalog: string;
    importCatalog: string;
    exportCatalog: string;
  }
> = {
  command: {
    queryPlanning: '',
    createPlanning: '',
    updatePlanning: '',
    deletePlanning: '',
    batchDeletePlanning: '',
    batchUpdatePlanning: '',
    importPlanning: '',
    exportPlanning: '',
    downloadPlanningTemplate: '',
    queryCatalog: '',
    createCatalog: '',
    updateCatalog: '',
    deleteCatalog: '',
    batchDeleteCatalog: '',
    importCatalog: '',
    exportCatalog: '',
  },
  agent: {
    queryPlanning: '',
    createPlanning: '',
    updatePlanning: '',
    deletePlanning: '',
    batchDeletePlanning: '',
    batchUpdatePlanning: '',
    importPlanning: '',
    exportPlanning: '',
    downloadPlanningTemplate: '',
    queryCatalog: '',
    createCatalog: '',
    updateCatalog: '',
    deleteCatalog: '',
    batchDeleteCatalog: '',
    importCatalog: '',
    exportCatalog: '',
  },
};

function label(type: MockHarnessCapabilityType): string {
  return type === 'command' ? 'Command' : 'Agent';
}

function pending(type: MockHarnessCapabilityType, action: string): never {
  throw new Error(`${label(type)} ${action} HTTP 接口待配置`);
}

export async function queryHttpCapabilityPlanning(
  _type: MockHarnessCapabilityType,
  _query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  // TODO(api): 接入 queryPlanning endpoint 后在这里完成列表响应映射。
  return { list: [], total: 0 };
}

export async function createHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _body: CreateSkillPlanningSupplementBody,
  _userId: string,
): Promise<unknown> {
  return pending(type, '规划新增');
}

export async function updateHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _body: CreateSkillPlanningSupplementBody & { id: string },
  _userId: string,
): Promise<unknown> {
  return pending(type, '规划更新');
}

export async function batchUpdateHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _ids: string[],
  _patch: SkillPlanningBatchPatch,
): Promise<number> {
  return pending(type, '规划批量更新');
}

export async function deleteHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _id: string,
  _userId: string,
): Promise<void> {
  return pending(type, '规划删除');
}

export async function batchDeleteHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _ids: string[],
  _userId: string,
): Promise<number> {
  return pending(type, '规划批量删除');
}

export async function importHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _file: File,
  _query: SkillPlanningQuery,
): Promise<SkillPlanningImportResult> {
  return pending(type, '规划导入');
}

export async function exportHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  _query: SkillPlanningQuery,
): Promise<null> {
  return pending(type, '规划导出');
}

export async function downloadHttpCapabilityPlanningTemplate(
  type: MockHarnessCapabilityType,
): Promise<void> {
  return pending(type, '规划模板下载');
}

export async function queryHttpCapabilityCatalog(
  _type: MockHarnessCapabilityType,
  _query: HarnessCapabilityCatalogQuery = {},
): Promise<SkillMasterRecord[]> {
  // TODO(api): 接入 queryCatalog endpoint 后在这里完成原子清单响应映射。
  return [];
}

export async function createHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  _payload: SkillMasterPayload,
): Promise<SkillMasterRecord> {
  return pending(type, '清单新增');
}

export async function updateHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  _id: string,
  _payload: SkillMasterPayload,
): Promise<SkillMasterRecord> {
  return pending(type, '清单更新');
}

export async function deleteHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  _id: string,
): Promise<void> {
  return pending(type, '清单删除');
}

export async function batchDeleteHttpCapabilityCatalogRecords(
  type: MockHarnessCapabilityType,
  _ids: string[],
): Promise<number> {
  return pending(type, '清单批量删除');
}

export async function importHttpCapabilityCatalog(
  type: MockHarnessCapabilityType,
  _file: File,
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  return pending(type, '清单导入');
}

export async function exportHttpCapabilityCatalog(
  type: MockHarnessCapabilityType,
  _records: SkillMasterRecord[],
): Promise<void> {
  return pending(type, '清单导出');
}

export async function getHttpCapabilityProducts(
  _type: MockHarnessCapabilityType,
  _planningDeptName: string,
): Promise<ProductPlanningOption[]> {
  // 产品下拉后续可复用既有 Harness 产品接口；当前先保持为空。
  return [];
}

import type {
  CreateSkillPlanningSupplementBody,
  QuerySkillMasterManagementBody,
  SkillMasterManagementItemDto,
} from './apiTypes';
import {
  batchDeleteHttpCapabilityCatalogRecords,
  batchDeleteHttpCapabilityPlanning,
  batchUpdateHttpCapabilityPlanning,
  createHttpCapabilityCatalogRecord,
  createHttpCapabilityPlanning,
  deleteHttpCapabilityCatalogRecord,
  deleteHttpCapabilityPlanning,
  downloadHttpCapabilityPlanningTemplate,
  exportHttpCapabilityCatalog,
  exportHttpCapabilityPlanning,
  getHttpCapabilityProducts,
  importHttpCapabilityCatalog,
  importHttpCapabilityPlanning,
  queryHttpCapabilityCatalog,
  queryHttpCapabilityPlanning,
  updateHttpCapabilityCatalogRecord,
  updateHttpCapabilityPlanning,
} from './harnessCapabilityPlanningHttp';
import {
  batchDeleteMockCapabilityCatalogRecords,
  batchDeleteMockCapabilityPlanning,
  batchUpdateMockCapabilityPlanning,
  createMockCapabilityCatalogRecord,
  createMockCapabilityPlanning,
  deleteMockCapabilityCatalogRecord,
  deleteMockCapabilityPlanning,
  downloadMockCapabilityPlanningTemplate,
  exportMockCapabilityCatalog,
  exportMockCapabilityPlanning,
  getMockCapabilityProducts,
  importMockCapabilityCatalog,
  importMockCapabilityPlanning,
  queryMockCapabilityCatalog,
  queryMockCapabilityPlanning,
  updateMockCapabilityCatalogRecord,
  updateMockCapabilityPlanning,
  type HarnessCapabilityCatalogQuery,
  type HarnessCapabilityType,
  type MockHarnessCapabilityType,
} from './harnessCapabilityPlanningMock';
import { skillBaseService } from './skillBaseService';
import type {
  SkillMasterPayload,
  SkillMasterRecord,
  SkillMasterStatus,
} from './skillMasterManagementService';
import {
  batchUpdateSkillPlanning,
  createSkillPlanningSupplement,
  exportSkillPlanningSupplementFile,
  importSkillPlanningFromExcel,
  querySkillPlanningSupplement,
  updateSkillPlanningSupplement,
} from './skillPlanningService';
import type {
  ProductPlanningOption,
  SkillPlanningBatchPatch,
  SkillPlanningImportResult,
  SkillPlanningListResult,
  SkillPlanningQuery,
} from './skillPlanningShared';

export type { HarnessCapabilityType } from './harnessCapabilityPlanningMock';

export interface HarnessCapabilityPlanningCatalogQuery extends HarnessCapabilityCatalogQuery {
  userId?: string;
  dimType?: string;
  dimCode?: string;
  dimName?: string;
}

export interface HarnessCapabilityPlanningApi {
  type: HarnessCapabilityType;
  label: 'Skill' | 'Command' | 'Agent';
  queryPlanning(query?: SkillPlanningQuery): Promise<SkillPlanningListResult>;
  createPlanning(body: CreateSkillPlanningSupplementBody, userId: string): Promise<any>;
  updatePlanning(
    body: CreateSkillPlanningSupplementBody & { id: string },
    userId: string,
  ): Promise<any>;
  // batchUpdatePlanning(ids: string[], patch: SkillPlanningBatchPatch): Promise<number>;
  deletePlanning(id: string, userId: string): Promise<void>;
  batchDeletePlanning(ids: string[], userId: string): Promise<number>;
  importPlanning(file: File, query: SkillPlanningQuery): Promise<SkillPlanningImportResult>;
  exportPlanning(query: SkillPlanningQuery): Promise<any | null>;
  downloadPlanningTemplate(): Promise<string | void>;
  getProducts(
    offeringName: string,
    planningDeptName: string,
    deptCode: string,
  ): Promise<ProductPlanningOption[]>;
  queryCatalog(query?: HarnessCapabilityPlanningCatalogQuery): Promise<SkillMasterRecord[]>;
  createCatalog(payload: SkillMasterPayload): Promise<SkillMasterRecord>;
  updateCatalog(id: string, payload: SkillMasterPayload): Promise<SkillMasterRecord>;
  deleteCatalog(id: string): Promise<void>;
  batchDeleteCatalog(ids: string[]): Promise<number>;
  importCatalog(file: File): Promise<{ successCount: number; failCount: number; errors: string[] }>;
  exportCatalog(records: SkillMasterRecord[]): Promise<void>;
}

function useHttpTransport(): boolean {
  return String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';
}

function capabilityLabel(type: HarnessCapabilityType): 'Skill' | 'Command' | 'Agent' {
  if (type === 'command') return 'Command';
  if (type === 'agent') return 'Agent';
  return 'Skill';
}

function mapSkillCatalogItem(item: SkillMasterManagementItemDto): SkillMasterRecord {
  const skillName = String(item.skillName ?? '').trim();
  const ownerName = String(item.ownerName ?? '').trim();
  const ownerId = String(item.ownerId ?? '').trim();
  const developOwnerName = String(item.developOwnerName ?? '').trim();
  const developOwnerId = String(item.developOwnerId ?? '').trim();
  const dimType = String(item.dimType ?? '').trim();
  const dimName = String(item.dimName ?? '').trim();
  const status = String(item.status ?? '').trim() as SkillMasterStatus;
  const timestamp = new Date().toISOString();
  return {
    id: String(item.id ?? '').trim() || skillName,
    name: skillName,
    description: String(item.skillDescription ?? '').trim(),
    level: dimType,
    product: dimType === '产品级' ? dimName : '',
    owner: `${ownerName} ${ownerId}`.trim(),
    department: dimType === '部门级' ? dimName : '',
    developOwner: `${developOwnerName} ${developOwnerId}`.trim(),
    developOwnerDepartment: '',
    plannedCompleteDate: String(item.planFinishDate ?? '').trim(),
    status: status || '未开始',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function querySkillCatalog(
  query: HarnessCapabilityPlanningCatalogQuery = {},
): Promise<SkillMasterRecord[]> {
  const body: QuerySkillMasterManagementBody = {
    userId: String(query.userId ?? '').trim(),
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNum: 1,
    pageSize: 100,
  };
  if (query.keyword) body.keyword = query.keyword;
  if (query.dimType) body.dimType = query.dimType;
  if (query.dimCode) body.dimCode = query.dimCode;
  if (query.dimName) body.dimName = query.dimName;
  const response = await skillBaseService.querySkillMasterManagement(body);
  if (response?.meta?.success !== true) {
    throw new Error(String(response?.meta?.message || response?.message || 'Skill 查询失败'));
  }
  return (Array.isArray(response.data) ? response.data : []).map(mapSkillCatalogItem);
}

function nonSkillApi(type: MockHarnessCapabilityType): HarnessCapabilityPlanningApi {
  const isHttp = useHttpTransport();
  return {
    type,
    label: capabilityLabel(type),
    queryPlanning: (query = {}) =>
      isHttp ? queryHttpCapabilityPlanning(type, query) : queryMockCapabilityPlanning(type, query),
    createPlanning: (body, userId) =>
      isHttp
        ? createHttpCapabilityPlanning(type, body, userId)
        : createMockCapabilityPlanning(type, body),
    updatePlanning: (body, userId) =>
      isHttp
        ? updateHttpCapabilityPlanning(type, body, userId)
        : updateMockCapabilityPlanning(type, body),
    // batchUpdatePlanning: (ids, patch) =>
    //   isHttp
    //     ? batchUpdateHttpCapabilityPlanning(type, ids, patch)
    //     : batchUpdateMockCapabilityPlanning(type, ids, patch),
    deletePlanning: (id, userId) =>
      isHttp
        ? deleteHttpCapabilityPlanning(type, id, userId)
        : deleteMockCapabilityPlanning(type, id),
    batchDeletePlanning: (ids, userId) =>
      isHttp
        ? batchDeleteHttpCapabilityPlanning(type, ids, userId)
        : batchDeleteMockCapabilityPlanning(type, ids),
    importPlanning: (file, query) =>
      isHttp
        ? importHttpCapabilityPlanning(type, file, query)
        : importMockCapabilityPlanning(type, file),
    exportPlanning: (query) =>
      isHttp
        ? exportHttpCapabilityPlanning(type, query)
        : exportMockCapabilityPlanning(type, query),
    downloadPlanningTemplate: () =>
      isHttp
        ? downloadHttpCapabilityPlanningTemplate(type)
        : downloadMockCapabilityPlanningTemplate(type),
    getProducts: (_offeringName, planningDeptName) =>
      isHttp
        ? getHttpCapabilityProducts(type, planningDeptName)
        : getMockCapabilityProducts(type, planningDeptName),
    queryCatalog: (query = {}) =>
      isHttp ? queryHttpCapabilityCatalog(type, query) : queryMockCapabilityCatalog(type, query),
    createCatalog: (payload) =>
      isHttp
        ? createHttpCapabilityCatalogRecord(type, payload)
        : createMockCapabilityCatalogRecord(type, payload),
    updateCatalog: (id, payload) =>
      isHttp
        ? updateHttpCapabilityCatalogRecord(type, id, payload)
        : updateMockCapabilityCatalogRecord(type, id, payload),
    deleteCatalog: (id) =>
      isHttp
        ? deleteHttpCapabilityCatalogRecord(type, id)
        : deleteMockCapabilityCatalogRecord(type, id),
    batchDeleteCatalog: (ids) =>
      isHttp
        ? batchDeleteHttpCapabilityCatalogRecords(type, ids)
        : batchDeleteMockCapabilityCatalogRecords(type, ids),
    importCatalog: (file) =>
      isHttp ? importHttpCapabilityCatalog(type, file) : importMockCapabilityCatalog(type, file),
    exportCatalog: (records) =>
      isHttp
        ? exportHttpCapabilityCatalog(type, records)
        : exportMockCapabilityCatalog(type, records),
  };
}

const skillApi: HarnessCapabilityPlanningApi = {
  type: 'skill',
  label: 'Skill',
  queryPlanning: querySkillPlanningSupplement,
  createPlanning: createSkillPlanningSupplement,
  updatePlanning: updateSkillPlanningSupplement,
  // batchUpdatePlanning: batchUpdateSkillPlanning,
  importPlanning: importSkillPlanningFromExcel,
  exportPlanning: exportSkillPlanningSupplementFile,
  queryCatalog: querySkillCatalog,
  createCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  updateCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  deleteCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  batchDeleteCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  importCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  exportCatalog: async () => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
};

const commandApi = nonSkillApi('command');
const agentApi = nonSkillApi('agent');

export function getHarnessCapabilityPlanningApi(
  type: HarnessCapabilityType,
): HarnessCapabilityPlanningApi {
  if (type === 'command') return commandApi;
  if (type === 'agent') return agentApi;
  return skillApi;
}

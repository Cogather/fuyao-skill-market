import type {
  CreateSkillPlanningSupplementBody,
  QuerySkillMasterManagementBody,
  SkillMasterManagementItemDto,
  SkillTransferParams,
} from './apiTypes';
import {
  batchDeleteHttpCapabilityCatalogRecords,
  batchDeleteHttpCapabilityPlanning,
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
  queryHttpCapabilityCatalogPage,
  queryHttpCapabilityPlanning,
  updateHttpCapabilityCatalogRecord,
  updateHttpCapabilityPlanning,
} from './harnessCapabilityPlanningHttp';
import {
  batchDeleteMockCapabilityCatalogRecords,
  batchDeleteMockCapabilityPlanning,
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
import {
  normalizeSkillMasterVersions,
  type SkillMasterPayload,
  type SkillMasterRecord,
  type SkillMasterStatus,
} from './skillMasterManagementService';
import {
  batchDeleteSkillPlanningSupplement,
  createSkillPlanningSupplement,
  deleteSkillPlanningSupplement,
  downloadSkillPlanningTemplate,
  exportSkillPlanningSupplementFile,
  getProductPlanning,
  importSkillPlanningFromExcel,
  querySkillPlanningSupplement,
  updateSkillPlanningSupplement,
} from './skillPlanningService';
import type {
  ProductPlanningOption,
  SkillPlanningImportResult,
  SkillPlanningItem,
  SkillPlanningListResult,
  SkillPlanningQuery,
} from './skillPlanningShared';

import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';
export type { HarnessCapabilityType } from './harnessCapabilityPlanningMock';

export interface HarnessCapabilityPlanningCatalogQuery extends HarnessCapabilityCatalogQuery {
  userId?: string;
  dimType?: string;
  dimCode?: string;
  dimName?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface HarnessCapabilityCatalogListResult {
  list: SkillMasterRecord[];
  total: number;
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
  createCatalog(
    payload: SkillMasterPayload,
    scope: SkillTransferParams,
  ): Promise<SkillMasterRecord>;
  updateCatalog(
    id: string,
    payload: SkillMasterPayload,
    scope: SkillTransferParams,
  ): Promise<SkillMasterRecord>;
  deleteCatalog(id: string, userId: string): Promise<void>;
  batchDeleteCatalog(ids: string[], userId: string): Promise<number>;
  importCatalog(
    file: File,
    scope: SkillTransferParams,
  ): Promise<{ successCount: number; failCount: number; errors: string[] }>;
  exportCatalog(records: SkillMasterRecord[], scope: SkillTransferParams): Promise<void>;
}

function useHttpTransport(): boolean {
  return String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';
}

export async function queryHarnessCapabilityCatalogPage(
  type: MockHarnessCapabilityType,
  query: HarnessCapabilityPlanningCatalogQuery = {},
): Promise<HarnessCapabilityCatalogListResult> {
  if (useHttpTransport()) {
    return queryHttpCapabilityCatalogPage(type, query);
  }
  const records = await queryMockCapabilityCatalog(type, query);
  const pageNum = Math.max(1, Number(query.pageNum ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const start = (pageNum - 1) * pageSize;
  return {
    list: records.slice(start, start + pageSize),
    total: records.length,
  };
}

function capabilityLabel(type: HarnessCapabilityType): 'Skill' | 'Command' | 'Agent' {
  if (type === 'command') return 'Command';
  if (type === 'agent') return 'Agent';
  return 'Skill';
}

function validateProductCapabilityName(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
): void {
  const name = payload.name.trim();
  const label = capabilityLabel(type);
  if (!isCatalogItemNameValid(name)) {
    throw new Error(
      `${label} \u540d\u79f0\u4ec5\u5141\u8bb8\u5c0f\u5199\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u8fde\u5b57\u7b26\uff0c\u6700\u957f 64 \u5b57\u7b26`,
    );
  }
  const prefix = getProductCatalogItemNamePrefix(payload.level, payload.product);
  if (!prefix) return;
  if (!name.startsWith(prefix)) {
    throw new Error(
      `\u4ea7\u54c1\u7ea7 ${label} \u540d\u79f0\u9700\u4ee5\u4ea7\u54c1\u540d\u79f0\u7684\u5c0f\u5199\u5f62\u5f0f\u201c${prefix}\u201d\u5f00\u5934`,
    );
  }
  if (name.length === prefix.length) {
    throw new Error(`\u8bf7\u5728\u201c${prefix}\u201d\u540e\u8865\u5145 ${label} \u540d\u79f0`);
  }
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
    versions: normalizeSkillMasterVersions(item.versions),
    referenceCount: Number(
      item.referenceCount ??
        item.planningCount ??
        item.planningReferenceCount ??
        item.supplementCount ??
        item.configCount ??
        item.relatedPlanningCount ??
        0,
    ),
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
    getProducts: (offeringName, planningDeptName, deptCode) =>
      isHttp
        ? getHttpCapabilityProducts(type, offeringName, planningDeptName, deptCode)
        : getMockCapabilityProducts(type, planningDeptName, offeringName),
    queryCatalog: (query = {}) =>
      isHttp ? queryHttpCapabilityCatalog(type, query) : queryMockCapabilityCatalog(type, query),
    createCatalog: (payload, scope) => {
      if (isHttp) return createHttpCapabilityCatalogRecord(type, payload, scope);
      validateProductCapabilityName(type, payload);
      return createMockCapabilityCatalogRecord(type, payload);
    },
    updateCatalog: (id, payload, scope) => {
      if (isHttp) return updateHttpCapabilityCatalogRecord(type, id, payload, scope);
      validateProductCapabilityName(type, payload);
      return updateMockCapabilityCatalogRecord(type, id, payload);
    },
    deleteCatalog: (id, userId) =>
      isHttp
        ? deleteHttpCapabilityCatalogRecord(type, id, userId)
        : deleteMockCapabilityCatalogRecord(type, id),
    batchDeleteCatalog: (ids, userId) =>
      isHttp
        ? batchDeleteHttpCapabilityCatalogRecords(type, ids, userId)
        : batchDeleteMockCapabilityCatalogRecords(type, ids),
    importCatalog: (file, scope) =>
      isHttp
        ? importHttpCapabilityCatalog(type, file, scope)
        : importMockCapabilityCatalog(type, file),
    exportCatalog: (records, scope) =>
      isHttp
        ? exportHttpCapabilityCatalog(type, records, scope)
        : exportMockCapabilityCatalog(type, records),
  };
}

const skillApi: HarnessCapabilityPlanningApi = {
  type: 'skill',
  label: 'Skill',
  queryPlanning: querySkillPlanningSupplement,
  createPlanning: createSkillPlanningSupplement,
  updatePlanning: updateSkillPlanningSupplement,
  deletePlanning: deleteSkillPlanningSupplement,
  batchDeletePlanning: batchDeleteSkillPlanningSupplement,
  importPlanning: importSkillPlanningFromExcel,
  exportPlanning: exportSkillPlanningSupplementFile,
  downloadPlanningTemplate: downloadSkillPlanningTemplate,
  getProducts: getProductPlanning,
  queryCatalog: querySkillCatalog,
  createCatalog: async (_payload, _scope) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  updateCatalog: async (_id, _payload, _scope) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  deleteCatalog: async (_id, _userId) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  batchDeleteCatalog: async (_ids, _userId) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  importCatalog: async (_file, _scope) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
  exportCatalog: async (_records, _scope) => {
    throw new Error('Skill 清单继续使用现有管理组件');
  },
};

const commandApi = nonSkillApi('command');
const agentApi = nonSkillApi('agent');

export async function findReferencedCapabilityCatalogIds(
  type: HarnessCapabilityType,
  ids: string[],
  query: SkillPlanningQuery = {},
): Promise<string[]> {
  const counts = await getCapabilityCatalogReferenceCounts(type, ids, query);
  return Object.keys(counts).filter((id) => counts[id] > 0);
}

export async function getCapabilityCatalogReferenceCounts(
  type: HarnessCapabilityType,
  ids: string[],
  query: SkillPlanningQuery = {},
): Promise<Record<string, number>> {
  const normalizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const idSet = new Set(normalizedIds);
  const counts = Object.fromEntries(normalizedIds.map((id) => [id, 0]));
  if (!idSet.size) return counts;
  const result = await getHarnessCapabilityPlanningApi(type).queryPlanning({
    ...query,
    pageNum: 1,
    pageSize: 10000,
  });
  result.list.forEach((item: SkillPlanningItem) => {
    const id = String(item.skillId ?? '').trim();
    if (idSet.has(id)) counts[id] = (counts[id] ?? 0) + 1;
  });
  return counts;
}

export function getHarnessCapabilityPlanningApi(
  type: HarnessCapabilityType,
): HarnessCapabilityPlanningApi {
  if (type === 'command') return commandApi;
  if (type === 'agent') return agentApi;
  return skillApi;
}

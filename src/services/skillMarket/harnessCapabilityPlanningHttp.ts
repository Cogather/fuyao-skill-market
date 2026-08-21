import * as XLSX from 'xlsx';

import type {
  ApiEnvelope,
  BatchDeleteSkillPlanningSupplementBody,
  CreateAgentMasterManagementBody,
  CreateAgentPlanningSupplementBody,
  CreateCommandMasterManagementBody,
  CreateCommandPlanningSupplementBody,
  CreateSkillMasterManagementParams,
  CreateSkillPlanningSupplementBody,
  QuerySkillMasterManagementBody,
  QuerySkillPlanningSupplementParams,
  SkillPlanningSupplementMutationParams,
  SkillTransferParams,
  UpdateAgentMasterManagementBody,
  UpdateAgentPlanningSupplementBody,
  UpdateCommandMasterManagementBody,
  UpdateCommandPlanningSupplementBody,
  UpdateSkillMasterManagementParams,
} from './apiTypes';
import type {
  HarnessCapabilityCatalogQuery,
  MockHarnessCapabilityType,
} from './harnessCapabilityPlanningMock';
import { skillBaseService } from './skillBaseService';
import { getProductPlanning } from './skillPlanningService';
import {
  normalizeSkillImportResponse,
  normalizeSkillTransferParams,
  openSkillExportResponse,
  skillImportErrorMessage,
} from './skillTransferService';
import type {
  SkillMasterPayload,
  SkillMasterRecord,
  SkillMasterStatus,
} from './skillMasterManagementService';
import {
  normalizeSkillPlanningItem,
  normalizeText,
  type ProductPlanningOption,
  type SkillPlanningImportResult,
  type SkillPlanningItem,
  type SkillPlanningListResult,
  type SkillPlanningQuery,
} from './skillPlanningShared';
import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';

export type HarnessCapabilityCatalogHttpScope = SkillTransferParams;
export type HarnessCapabilityCatalogHttpQuery = HarnessCapabilityCatalogQuery &
  Partial<SkillTransferParams>;

export const harnessCapabilityPlanningHttpEndpoints: Record<
  MockHarnessCapabilityType,
  {
    queryPlanning: string;
    createPlanning: string;
    updatePlanning: string;
    deletePlanning: string;
    batchDeletePlanning: string;
    importPlanning: string;
    exportPlanning: string;
    downloadPlanningTemplate: 'client-generated';
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
    queryPlanning: '/config/supplement/query',
    createPlanning: '/config/supplement/add',
    updatePlanning: '/config/supplement/update',
    deletePlanning: '/config/supplement/delete/:id',
    batchDeletePlanning: '/config/supplement/batch_delete',
    importPlanning: '/config/supplement/import',
    exportPlanning: '/config/supplement/export',
    downloadPlanningTemplate: 'client-generated',
    queryCatalog: '/management/query',
    createCatalog: '/management/add',
    updateCatalog: '/management/update',
    deleteCatalog: '/management/delete/:id',
    batchDeleteCatalog: '/management/batch_delete',
    importCatalog: '/management/import',
    exportCatalog: '/management/export',
  },
  agent: {
    queryPlanning: '/config/supplement/query',
    createPlanning: '/config/supplement/add',
    updatePlanning: '/config/supplement/update',
    deletePlanning: '/config/supplement/delete/:id',
    batchDeletePlanning: '/config/supplement/batch_delete',
    importPlanning: '/config/supplement/import',
    exportPlanning: '/config/supplement/export',
    downloadPlanningTemplate: 'client-generated',
    queryCatalog: '/management/query',
    createCatalog: '/management/add',
    updateCatalog: '/management/update',
    deleteCatalog: '/management/delete/:id',
    batchDeleteCatalog: '/management/batch_delete',
    importCatalog: '/management/import',
    exportCatalog: '/management/export',
  },
};

type CapabilityPlanningCreateBody =
  | CreateCommandPlanningSupplementBody
  | CreateAgentPlanningSupplementBody;
type CapabilityPlanningUpdateBody =
  | UpdateCommandPlanningSupplementBody
  | UpdateAgentPlanningSupplementBody;
type CapabilityCatalogCreateBody =
  | CreateCommandMasterManagementBody
  | CreateAgentMasterManagementBody;
type CapabilityCatalogUpdateBody =
  | UpdateCommandMasterManagementBody
  | UpdateAgentMasterManagementBody;

type CapabilityHttpClient = {
  queryPlanning(params: QuerySkillPlanningSupplementParams): Promise<unknown>;
  createPlanning(
    body: CapabilityPlanningCreateBody,
    params: SkillPlanningSupplementMutationParams,
  ): Promise<unknown>;
  updatePlanning(
    body: CapabilityPlanningUpdateBody,
    params: SkillPlanningSupplementMutationParams,
  ): Promise<unknown>;
  deletePlanning(id: string | number, userId: string): Promise<unknown>;
  batchDeletePlanning(
    body: BatchDeleteSkillPlanningSupplementBody,
    userId: string,
  ): Promise<unknown>;
  importPlanning(formData: FormData, params: SkillTransferParams): Promise<unknown>;
  exportPlanning(params: SkillTransferParams): Promise<ApiEnvelope<string>>;
  queryCatalog(params: QuerySkillMasterManagementBody): Promise<unknown>;
  createCatalog(
    body: CapabilityCatalogCreateBody,
    params: CreateSkillMasterManagementParams,
  ): Promise<unknown>;
  updateCatalog(
    body: CapabilityCatalogUpdateBody,
    params: UpdateSkillMasterManagementParams,
  ): Promise<unknown>;
  deleteCatalog(id: string | number, userId: string): Promise<unknown>;
  batchDeleteCatalog(ids: Array<string | number>, userId: string): Promise<unknown>;
  importCatalog(formData: FormData, params: SkillTransferParams): Promise<unknown>;
  exportCatalog(params: SkillTransferParams): Promise<ApiEnvelope<string>>;
};

const capabilityHttpClients: Record<MockHarnessCapabilityType, CapabilityHttpClient> = {
  command: {
    queryPlanning: skillBaseService.queryCommandPlanningSupplement,
    createPlanning: (body, params) =>
      skillBaseService.createCommandPlanningSupplement(
        body as CreateCommandPlanningSupplementBody,
        params,
      ),
    updatePlanning: (body, params) =>
      skillBaseService.updateCommandPlanningSupplement(
        body as UpdateCommandPlanningSupplementBody,
        params,
      ),
    deletePlanning: skillBaseService.deleteCommandPlanningSupplement,
    batchDeletePlanning: skillBaseService.batchDeleteCommandPlanningSupplement,
    importPlanning: skillBaseService.importCommandPlanningSupplement,
    exportPlanning: skillBaseService.exportCommandPlanningSupplement,
    queryCatalog: skillBaseService.queryCommandMasterManagement,
    createCatalog: (body, params) =>
      skillBaseService.createCommandMasterManagement(
        body as CreateCommandMasterManagementBody,
        params,
      ),
    updateCatalog: (body, params) =>
      skillBaseService.updateCommandMasterManagement(
        body as UpdateCommandMasterManagementBody,
        params,
      ),
    deleteCatalog: skillBaseService.deleteCommandMasterManagement,
    batchDeleteCatalog: skillBaseService.batchDeleteCommandMasterManagement,
    importCatalog: skillBaseService.importCommandMasterManagement,
    exportCatalog: skillBaseService.exportCommandMasterManagement,
  },
  agent: {
    queryPlanning: skillBaseService.queryAgentPlanningSupplement,
    createPlanning: (body, params) =>
      skillBaseService.createAgentPlanningSupplement(
        body as CreateAgentPlanningSupplementBody,
        params,
      ),
    updatePlanning: (body, params) =>
      skillBaseService.updateAgentPlanningSupplement(
        body as UpdateAgentPlanningSupplementBody,
        params,
      ),
    deletePlanning: skillBaseService.deleteAgentPlanningSupplement,
    batchDeletePlanning: skillBaseService.batchDeleteAgentPlanningSupplement,
    importPlanning: skillBaseService.importAgentPlanningSupplement,
    exportPlanning: skillBaseService.exportAgentPlanningSupplement,
    queryCatalog: skillBaseService.queryAgentMasterManagement,
    createCatalog: (body, params) =>
      skillBaseService.createAgentMasterManagement(body as CreateAgentMasterManagementBody, params),
    updateCatalog: (body, params) =>
      skillBaseService.updateAgentMasterManagement(body as UpdateAgentMasterManagementBody, params),
    deleteCatalog: skillBaseService.deleteAgentMasterManagement,
    batchDeleteCatalog: skillBaseService.batchDeleteAgentMasterManagement,
    importCatalog: skillBaseService.importAgentMasterManagement,
    exportCatalog: skillBaseService.exportAgentMasterManagement,
  },
};

function label(type: MockHarnessCapabilityType): 'Command' | 'Agent' {
  return type === 'command' ? 'Command' : 'Agent';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) return value;
  }
  return '';
}

function unwrapResponseData(response: unknown): unknown {
  let value = response;
  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(value);
    const next = record.data ?? record.result;
    if (next === undefined || next === value) break;
    value = next;
  }
  return value;
}

function responseRows(response: unknown): unknown[] {
  const data = unwrapResponseData(response);
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  for (const key of ['list', 'records', 'items', 'rows', 'content']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function responseTotal(response: unknown, fallback: number): number {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const data = asRecord(unwrapResponseData(response));
  for (const value of [meta.number, meta.total, data.total, data.number, responseRecord.total]) {
    const parsed = readNumber(value, -1);
    if (parsed >= 0) return parsed;
  }
  return fallback;
}

function assertHttpSuccess(response: unknown, fallbackMessage: string): void {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  const code = readNumber(record.code, 0);
  if (meta.success === false || record.success === false || code >= 400) {
    throw new Error(
      readText(meta, ['message', 'msg']) ||
        readText(record, ['message', 'msg', 'error']) ||
        fallbackMessage,
    );
  }
}

function requiredText(value: unknown, message: string): string {
  const normalized = normalizeText(value);
  if (!normalized || /^(undefined|null)$/i.test(normalized)) throw new Error(message);
  return normalized;
}

function toPlanningQueryParams(query: SkillPlanningQuery): QuerySkillPlanningSupplementParams {
  const params: QuerySkillPlanningSupplementParams = {
    userId: requiredText(query.userId, '规划查询缺少当前用户工号'),
    dimType: requiredText(query.dimType, '规划查询缺少层级'),
    dimCode: requiredText(query.dimCode, '规划查询缺少部门或产品编码'),
    dimName: requiredText(query.dimName, '规划查询缺少部门或产品名称'),
  };
  const keyword = normalizeText(query.keyword);
  if (keyword) params.keyword = keyword;
  if (Number.isFinite(query.pageNum)) params.pageNum = Math.max(1, Number(query.pageNum));
  if (Number.isFinite(query.pageSize)) params.pageSize = Math.max(1, Number(query.pageSize));
  return params;
}

function toPlanningMutationParams(
  body: CreateSkillPlanningSupplementBody,
  userId: string,
): SkillPlanningSupplementMutationParams {
  return {
    userId: requiredText(userId, '规划保存缺少当前用户工号'),
    dimType: requiredText(body.dimType, '规划保存缺少层级'),
    dimCode: requiredText(body.dimCode, '规划保存缺少部门或产品编码'),
    dimName: requiredText(body.dimName, '规划保存缺少部门或产品名称'),
  };
}

function capabilityPlanningBody(
  type: MockHarnessCapabilityType,
  body: CreateSkillPlanningSupplementBody & { id?: string },
): CapabilityPlanningCreateBody | CapabilityPlanningUpdateBody {
  const { skillName, ...sharedBody } = body;
  return type === 'command'
    ? { ...sharedBody, commandName: requiredText(skillName, '请输入 Command 名称') }
    : { ...sharedBody, agentName: requiredText(skillName, '请输入 Agent 名称') };
}

function entityRecord(
  type: MockHarnessCapabilityType,
  value: unknown,
): { outer: Record<string, unknown>; record: Record<string, unknown> } {
  const outer = asRecord(value);
  const nestedKeys = [`${type}ConfigEntity`, 'skillConfigEntity', 'configEntity', 'entity'];
  const nested = nestedKeys
    .map((key) => asRecord(outer[key]))
    .find((item) => Object.keys(item).length);
  return { outer, record: nested ? { ...outer, ...nested } : outer };
}

function personDisplay(record: Record<string, unknown>, prefix: 'owner' | 'developOwner'): string {
  return (
    `${readText(record, [`${prefix}Name`])} ${readText(record, [`${prefix}Id`])}`.trim() ||
    readText(record, [prefix])
  );
}

function mapCapabilityPlanningItem(
  type: MockHarnessCapabilityType,
  value: unknown,
  fallback: { code: string; name: string },
): SkillPlanningItem {
  const { outer, record } = entityRecord(type, value);
  const rawLevel = readText(record, ['level', 'dimType']);
  const isProduct = rawLevel.toUpperCase() === 'PROD' || rawLevel === '产品级';
  const dimCode = readText(record, ['dimCode']);
  const dimName = readText(record, ['dimName']);
  const planningDeptCode =
    readText(record, ['planDeptCode', 'planningDeptCode']) ||
    (!isProduct ? dimCode : fallback.code);
  const planningDeptName =
    readText(record, ['planDeptName', 'planningDeptName']) ||
    (!isProduct ? dimName : fallback.name);
  const capabilityName = readText(record, [`${type}Name`, 'skillName', 'capabilityName', 'name']);
  const normalized = normalizeSkillPlanningItem({
    ...record,
    id: readText(record, ['id']) || readText(outer, ['id']),
    name: capabilityName,
    description: readText(record, [
      `${type}Description`,
      'skillDescription',
      'capabilityDescription',
      'description',
    ]),
    level: isProduct ? '产品级' : '部门级',
    offeringId: readText(record, ['offeringId']) || (isProduct ? dimCode : ''),
    offeringName: readText(record, ['offeringName']) || (isProduct ? dimName : ''),
    owner: personDisplay(record, 'owner'),
    developOwner: personDisplay(record, 'developOwner'),
    deptCode: readText(record, ['deptCode']) || (!isProduct ? dimCode : ''),
    deptName: readText(record, ['deptName']) || (!isProduct ? dimName : ''),
    planningDeptName,
    planedCompleteDate: readText(record, ['planedCompleteDate', 'planFinishDate']),
    status: readText(outer, ['status']) || readText(record, ['status']),
  });
  return { ...normalized, planningDeptCode };
}

const planningFilterKeys = [
  'firstScene',
  'secondScene',
  'activityNodeName',
  'subActivityNodeName',
  'level',
] as const;

const planningRefinementKeys = planningFilterKeys.filter((key) => key !== 'level');

function queryValues(value: string | string[] | undefined): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).map(normalizeText).filter(Boolean))];
}

function needsClientPlanningRefinement(query: SkillPlanningQuery): boolean {
  return (
    Boolean(query.sortOrder) ||
    planningRefinementKeys.some(
      (key) => queryValues(query[key] as string | string[] | undefined).length > 0,
    )
  );
}

function refinePlanningItems(
  items: SkillPlanningItem[],
  query: SkillPlanningQuery,
): SkillPlanningItem[] {
  const filtered = items.filter((item) =>
    planningFilterKeys.every((key) => {
      const values = queryValues(query[key] as string | string[] | undefined);
      return values.length === 0 || values.includes(item[key]);
    }),
  );
  if (query.sortBy === 'planedCompleteDate' && query.sortOrder) {
    filtered.sort((left, right) => {
      const result = left.planedCompleteDate.localeCompare(right.planedCompleteDate);
      return query.sortOrder === 'asc' ? result : -result;
    });
  }
  return filtered;
}

async function queryPlanningPage(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery,
): Promise<SkillPlanningListResult> {
  const response = await capabilityHttpClients[type].queryPlanning(toPlanningQueryParams(query));
  assertHttpSuccess(response, `${label(type)} 规划查询失败`);
  const rows = responseRows(response).map((item) =>
    mapCapabilityPlanningItem(type, item, {
      code: normalizeText(query.deptCode),
      name: normalizeText(query.planningDeptName),
    }),
  );
  return { list: rows, total: responseTotal(response, rows.length) };
}

async function queryAllPlanningItems(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery,
): Promise<SkillPlanningItem[]> {
  const pageSize = Math.max(200, Number(query.pageSize ?? 10));
  const first = await queryPlanningPage(type, { ...query, pageNum: 1, pageSize });
  const items = [...first.list];
  const pageCount = Math.ceil(first.total / Math.max(1, first.list.length || pageSize));
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await queryPlanningPage(type, { ...query, pageNum, pageSize });
    items.push(...page.list);
  }
  return items;
}

export async function queryHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  if (!needsClientPlanningRefinement(query)) return queryPlanningPage(type, query);
  const pageNum = Math.max(1, Number(query.pageNum ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const refined = refinePlanningItems(await queryAllPlanningItems(type, query), query);
  const start = (pageNum - 1) * pageSize;
  return { list: refined.slice(start, start + pageSize), total: refined.length };
}

export async function createHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  body: CreateSkillPlanningSupplementBody,
  userId: string,
): Promise<unknown> {
  const response = await capabilityHttpClients[type].createPlanning(
    capabilityPlanningBody(type, body) as CapabilityPlanningCreateBody,
    toPlanningMutationParams(body, userId),
  );
  assertHttpSuccess(response, `${label(type)} 规划新增失败`);
  return response;
}

export async function updateHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  body: CreateSkillPlanningSupplementBody & { id: string },
  userId: string,
): Promise<unknown> {
  const response = await capabilityHttpClients[type].updatePlanning(
    capabilityPlanningBody(type, body) as CapabilityPlanningUpdateBody,
    toPlanningMutationParams(body, userId),
  );
  assertHttpSuccess(response, `${label(type)} 规划更新失败`);
  return response;
}

export async function deleteHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  id: string,
  userId: string,
): Promise<void> {
  const response = await capabilityHttpClients[type].deletePlanning(
    requiredText(id, `缺少 ${label(type)} 规划 id`),
    requiredText(userId, '规划删除缺少当前用户工号'),
  );
  assertHttpSuccess(response, `${label(type)} 规划删除失败`);
}

export async function batchDeleteHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  ids: string[],
  userId: string,
): Promise<number> {
  const normalizedIds = [...new Set(ids.map(normalizeText).filter(Boolean))];
  if (!normalizedIds.length) return 0;
  const response = await capabilityHttpClients[type].batchDeletePlanning(
    { ids: normalizedIds },
    requiredText(userId, '规划批量删除缺少当前用户工号'),
  );
  assertHttpSuccess(response, `${label(type)} 规划批量删除失败`);
  return responseTotal(response, normalizedIds.length);
}

function planningTransferParams(query: SkillPlanningQuery): SkillTransferParams {
  return normalizeSkillTransferParams({
    userId: normalizeText(query.userId),
    dimType: normalizeText(query.dimType),
    dimCode: normalizeText(query.dimCode),
    dimName: normalizeText(query.dimName),
  });
}

async function capabilityImportResponse<T>(
  type: MockHarnessCapabilityType,
  request: Promise<T>,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw new Error(skillImportErrorMessage(error, `${label(type)} \u5bfc\u5165\u5931\u8d25`));
  }
}

export async function importHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  file: File,
  query: SkillPlanningQuery,
): Promise<SkillPlanningImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await capabilityImportResponse(
    type,
    capabilityHttpClients[type].importPlanning(formData, planningTransferParams(query)),
  );
  return normalizeSkillImportResponse(response);
}

export async function exportHttpCapabilityPlanning(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery,
): Promise<ApiEnvelope<string>> {
  const response = await capabilityHttpClients[type].exportPlanning(planningTransferParams(query));
  assertHttpSuccess(response, `${label(type)} 规划导出失败`);
  return response;
}

function planningHeaders(type: MockHarnessCapabilityType): string[] {
  const capability = label(type);
  return [
    '一级场景',
    '二级场景',
    '归属活动',
    '归属子活动',
    `${capability} 名称`,
    `${capability} 说明`,
    '层级',
    '产品',
    '责任 Owner',
    '归属部门',
    '规划部门',
    '开发责任人',
    '计划完成时间',
    '当前进展',
  ];
}

export async function downloadHttpCapabilityPlanningTemplate(
  type: MockHarnessCapabilityType,
): Promise<void> {
  const sheet = XLSX.utils.aoa_to_sheet([planningHeaders(type)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '导入模板');
  XLSX.writeFile(workbook, `${label(type)}规划导入模板.xlsx`);
}

function toCatalogQueryBody(
  query: HarnessCapabilityCatalogHttpQuery,
): QuerySkillMasterManagementBody {
  const body: QuerySkillMasterManagementBody = {
    userId: requiredText(query.userId, '清单查询缺少当前用户工号'),
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNum: 1,
    pageSize: 200,
  };
  const keyword = normalizeText(query.keyword);
  const dimType = normalizeText(query.dimType) || normalizeText(query.level);
  const dimCode = normalizeText(query.dimCode);
  const dimName =
    normalizeText(query.dimName) ||
    normalizeText(query.product) ||
    normalizeText(query.departmentName);
  if (keyword) body.keyword = keyword;
  if (dimType) body.dimType = dimType;
  if (dimCode) body.dimCode = dimCode;
  if (dimName) body.dimName = dimName;
  if (!keyword && (!dimType || !dimCode || !dimName)) {
    throw new Error('清单查询缺少完整的部门或产品范围');
  }
  return body;
}

function normalizeTimestamp(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value.map(Number);
    const date = new Date(year, Math.max(0, month - 1), day, hour, minute, second);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const text = normalizeText(value);
  return text || new Date().toISOString();
}

function normalizeStatus(value: unknown): SkillMasterStatus {
  const status = normalizeText(value);
  return (status || '未开始') as SkillMasterStatus;
}

function mapCapabilityCatalogItem(
  type: MockHarnessCapabilityType,
  value: unknown,
  query: HarnessCapabilityCatalogHttpQuery = {},
): SkillMasterRecord {
  const { record } = entityRecord(type, value);
  const dimType = readText(record, ['dimType', 'level']) || normalizeText(query.dimType);
  const dimName = readText(record, ['dimName']) || normalizeText(query.dimName);
  const isProduct = dimType.toUpperCase() === 'PROD' || dimType === '产品级';
  return {
    id: readText(record, ['id']),
    name: readText(record, [`${type}Name`, 'skillName', 'capabilityName', 'name']),
    description: readText(record, [
      `${type}Description`,
      'skillDescription',
      'capabilityDescription',
      'description',
    ]),
    level: isProduct ? '产品级' : '部门级',
    product: isProduct ? dimName : '',
    owner: personDisplay(record, 'owner'),
    department: isProduct ? normalizeText(query.departmentName) : dimName,
    developOwner: personDisplay(record, 'developOwner'),
    developOwnerDepartment: readText(record, ['developOwnerDepartment', 'deptName']),
    plannedCompleteDate: readText(record, ['planFinishDate', 'plannedCompleteDate']),
    status: normalizeStatus(record.status),
    referenceCount: readNumber(
      record.referenceCount ??
        record.planningCount ??
        record.planningReferenceCount ??
        record.supplementCount ??
        record.configCount ??
        record.relatedPlanningCount,
      0,
    ),
    createdAt: normalizeTimestamp(record.createdAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
  };
}

async function queryCatalogPage(
  type: MockHarnessCapabilityType,
  query: HarnessCapabilityCatalogHttpQuery,
  pageNum: number,
  pageSize: number,
): Promise<{ rows: SkillMasterRecord[]; total: number }> {
  const params = { ...toCatalogQueryBody(query), pageNum, pageSize };
  const response = await capabilityHttpClients[type].queryCatalog(params);
  assertHttpSuccess(response, `${label(type)} 清单查询失败`);
  const rows = responseRows(response).map((item) => mapCapabilityCatalogItem(type, item, query));
  return { rows, total: responseTotal(response, rows.length) };
}

export async function queryHttpCapabilityCatalog(
  type: MockHarnessCapabilityType,
  query: HarnessCapabilityCatalogHttpQuery = {},
): Promise<SkillMasterRecord[]> {
  const pageSize = 200;
  const first = await queryCatalogPage(type, query, 1, pageSize);
  const rows = [...first.rows];
  const pageCount = Math.ceil(first.total / Math.max(1, first.rows.length || pageSize));
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await queryCatalogPage(type, query, pageNum, pageSize);
    rows.push(...page.rows);
  }
  return rows;
}

function parsePerson(value: string, fieldLabel: string): { name: string; id: string } {
  const normalized = normalizeText(value);
  const parts = normalized.split(/\s+/).filter(Boolean);
  const id =
    parts.length > 1
      ? (parts.at(-1) ?? '')
      : /^(?=.*\d)[a-z0-9._-]+$/i.test(normalized)
        ? normalized
        : '';
  const name = parts.length > 1 ? parts.slice(0, -1).join(' ') : normalized;
  if (!name || !id) throw new Error(`${fieldLabel}信息不完整，请按“姓名 工号”填写`);
  return { name, id };
}

function normalizeCatalogScope(scope: HarnessCapabilityCatalogHttpScope): SkillTransferParams {
  return normalizeSkillTransferParams(scope);
}

function catalogBody(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
): CapabilityCatalogCreateBody {
  const personPayload = payload as SkillMasterPayload & {
    ownerId?: string;
    developOwnerId?: string;
  };
  const name = requiredText(payload.name, '请输入能力名称');
  const description = requiredText(payload.description, '请输入能力说明');
  const owner = parsePerson(payload.owner, '责任 Owner');
  const developOwner = parsePerson(payload.developOwner, '开发责任人');
  const planFinishDate = requiredText(payload.plannedCompleteDate, '请选择计划完成时间');
  const sharedBody = {
    ownerName: owner.name,
    ownerId: requiredText(
      personPayload.ownerId,
      '\u8d23\u4efb Owner \u7528\u6237\u4fe1\u606f\u7f3a\u5c11 sAMAccountName',
    ),
    developOwnerName: developOwner.name,
    developOwnerId: requiredText(
      personPayload.developOwnerId,
      '\u5f00\u53d1\u8d23\u4efb\u4eba\u7528\u6237\u4fe1\u606f\u7f3a\u5c11 sAMAccountName',
    ),
    planFinishDate,
  };
  return type === 'command'
    ? { ...sharedBody, commandName: name, commandDescription: description }
    : { ...sharedBody, agentName: name, agentDescription: description };
}

function validateHttpCatalogItemName(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
): void {
  const capabilityLabel = label(type);
  const name = normalizeText(payload.name);
  if (!isCatalogItemNameValid(name)) {
    throw new Error(
      `${capabilityLabel} \u540d\u79f0\u4ec5\u5141\u8bb8\u5c0f\u5199\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u8fde\u5b57\u7b26\uff0c\u6700\u957f 64 \u5b57\u7b26`,
    );
  }
  const prefix = getProductCatalogItemNamePrefix(payload.level, payload.product);
  if (!prefix) return;
  if (!name.startsWith(prefix)) {
    throw new Error(
      `\u4ea7\u54c1\u7ea7 ${capabilityLabel} \u540d\u79f0\u9700\u4ee5\u4ea7\u54c1\u540d\u79f0\u7684\u5c0f\u5199\u5f62\u5f0f\u201c${prefix}\u201d\u5f00\u5934`,
    );
  }
  if (name.length === prefix.length) {
    throw new Error(`\u8bf7\u5728\u201c${prefix}\u201d\u540e\u8865\u5145 ${capabilityLabel} \u540d\u79f0`);
  }
}

function payloadFallbackRecord(
  id: string,
  payload: SkillMasterPayload,
  scope: HarnessCapabilityCatalogHttpScope,
): SkillMasterRecord {
  const timestamp = new Date().toISOString();
  return {
    id,
    ...payload,
    level: scope.dimType,
    product: scope.dimType === '产品级' ? scope.dimName : '',
    department: scope.dimType === '部门级' ? scope.dimName : payload.department,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function responseCatalogRecord(
  type: MockHarnessCapabilityType,
  response: unknown,
  payload: SkillMasterPayload,
  scope: HarnessCapabilityCatalogHttpScope,
  fallbackId = '',
): SkillMasterRecord {
  const row = responseRows(response)[0] ?? unwrapResponseData(response);
  const record = asRecord(row);
  if (readText(record, ['id']) || readText(record, [`${type}Name`, 'skillName', 'name'])) {
    return mapCapabilityCatalogItem(type, row, {
      departmentName: payload.department,
      ...scope,
    });
  }
  const responseRecord = asRecord(response);
  const id = readText(record, ['id']) || readText(responseRecord, ['id']) || fallbackId;
  return payloadFallbackRecord(id, payload, scope);
}

export async function createHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
  scope: HarnessCapabilityCatalogHttpScope,
): Promise<SkillMasterRecord> {
  validateHttpCatalogItemName(type, payload);
  const normalizedScope = normalizeCatalogScope(scope);
  const response = await capabilityHttpClients[type].createCatalog(
    catalogBody(type, payload),
    normalizedScope,
  );
  assertHttpSuccess(response, `${label(type)} 清单新增失败`);
  return responseCatalogRecord(type, response, payload, normalizedScope);
}

export async function updateHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  id: string,
  payload: SkillMasterPayload,
  scope: HarnessCapabilityCatalogHttpScope,
): Promise<SkillMasterRecord> {
  validateHttpCatalogItemName(type, payload);
  const normalizedScope = normalizeCatalogScope(scope);
  const response = await capabilityHttpClients[type].updateCatalog(
    {
      id: requiredText(id, `缺少 ${label(type)} id`),
      ...catalogBody(type, payload),
    } as CapabilityCatalogUpdateBody,
    normalizedScope,
  );
  assertHttpSuccess(response, `${label(type)} 清单更新失败`);
  return responseCatalogRecord(type, response, payload, normalizedScope, id);
}

export async function deleteHttpCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  id: string,
  userId: string,
): Promise<void> {
  const response = await capabilityHttpClients[type].deleteCatalog(
    requiredText(id, `缺少 ${label(type)} id`),
    requiredText(userId, '清单删除缺少当前用户工号'),
  );
  assertHttpSuccess(response, `${label(type)} 清单删除失败`);
}

export async function batchDeleteHttpCapabilityCatalogRecords(
  type: MockHarnessCapabilityType,
  ids: string[],
  userId: string,
): Promise<number> {
  const normalizedIds = [...new Set(ids.map(normalizeText).filter(Boolean))];
  if (!normalizedIds.length) return 0;
  const response = await capabilityHttpClients[type].batchDeleteCatalog(
    normalizedIds,
    requiredText(userId, '清单批量删除缺少当前用户工号'),
  );
  assertHttpSuccess(response, `${label(type)} 清单批量删除失败`);
  return responseTotal(response, normalizedIds.length);
}

export async function importHttpCapabilityCatalog(
  type: MockHarnessCapabilityType,
  file: File,
  scope: HarnessCapabilityCatalogHttpScope,
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await capabilityImportResponse(
    type,
    capabilityHttpClients[type].importCatalog(formData, normalizeCatalogScope(scope)),
  );
  const result = normalizeSkillImportResponse(response);
  return {
    successCount: result.successCount,
    failCount: result.failCount,
    errors: result.errorList.map((item) => `第${item.rowNum}行：${item.errMsg}`),
  };
}

export async function exportHttpCapabilityCatalog(
  type: MockHarnessCapabilityType,
  _records: SkillMasterRecord[],
  scope: HarnessCapabilityCatalogHttpScope,
): Promise<void> {
  const response = await capabilityHttpClients[type].exportCatalog(normalizeCatalogScope(scope));
  openSkillExportResponse(response);
}

export async function getHttpCapabilityProducts(
  _type: MockHarnessCapabilityType,
  offeringName: string,
  planningDeptName: string,
  deptCode: string,
): Promise<ProductPlanningOption[]> {
  return getProductPlanning(offeringName, planningDeptName, deptCode);
}

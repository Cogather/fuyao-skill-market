import { skillBaseService } from './skillBaseService';
import type {
  ApiEnvelope,
  CreateSkillPlanningSupplementBody,
  QuerySkillPlanningSupplementParams,
  SkillPlanningSupplementItemDto,
  SkillTransferParams,
  UpdateSkillPlanningSupplementBody,
} from './apiTypes';
import { normalizeSkillImportResponse, normalizeSkillTransferParams } from './skillTransferService';
import {
  exportSkillPlanningToExcel,
  normalizeText,
  type ProductPlanningOption,
  type SkillPlanningUserOption,
  type SkillPlanningBatchPatch,
  type SkillPlanningBatchUpdatePayload,
  type SkillPlanningImportResult,
  type SkillPlanningOptionGroup,
  type SkillPlanningItem,
  type SkillPlanningListResult,
  type SkillPlanningPayload,
  type SkillPlanningQuery,
} from './skillPlanningShared';

export { exportSkillPlanningToExcel, skillPlanningExportHeaders } from './skillPlanningShared';
export type {
  ProductPlanningOption,
  SkillPlanningUserOption,
  SkillPlanningBatchPatch,
  SkillPlanningBatchUpdatePayload,
  SkillPlanningFilterOptions,
  SkillPlanningImportResult,
  SkillPlanningOptionGroup,
  SkillPlanningItem,
  SkillPlanningListResult,
  SkillPlanningPayload,
  SkillPlanningQuery,
  SkillPlanningSortField,
  SkillPlanningSortOrder,
} from './skillPlanningShared';

type SkillPlanningMockModule = typeof import('./skillPlanningMockService');

export interface SkillPlanningTaxonomyOptionParams {
  userId: string;
  /** 部门级 / 产品级 */
  dimType: string;
  dimCode: string;
  dimName: string;
}

function useHttpTransport(): boolean {
  return (
    String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock')
      .trim()
      .toLowerCase() === 'http'
  );
}

async function loadMockService(): Promise<SkillPlanningMockModule> {
  return import('./skillPlanningMockService');
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unwrapResponseData<T>(response: unknown): T {
  const record =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : undefined;
  return (record?.data ?? response) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function pickArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
}

function uniqueTextValues(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function readOptionText(value: unknown, keys: string[]): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeText(value);
  }

  const record = asRecord(value);
  for (const key of keys) {
    const text = normalizeText(record[key]);
    if (text) {
      return text;
    }
  }
  return '';
}

function assertHttpSuccess(response: unknown, fallbackMessage: string): void {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const fallback = /[^\x20-\x7e]/.test(fallbackMessage)
    ? 'Option list load failed'
    : fallbackMessage;
  if (meta.success === false) {
    throw new Error(
      normalizeText(meta.message) || normalizeText(responseRecord.message) || fallback,
    );
  }
}

function responseRows(response: unknown): unknown[] {
  const responseRecord = asRecord(response);
  const data = responseRecord.data ?? response;
  const dataRecord = asRecord(data);
  return Array.isArray(data)
    ? data
    : (['list', 'records', 'items', 'rows']
        .map((key) => dataRecord[key])
        .find((value): value is unknown[] => Array.isArray(value)) ?? []);
}

function normalizeTaxonomyOptionGroupsFromRows(
  response: unknown,
  parentKeys: string[],
  childKeys: string[],
  fallbackMessage: string,
): SkillPlanningOptionGroup[] {
  assertHttpSuccess(response, fallbackMessage);

  const groups = new Map<string, { children: string[]; sort: number; sourceIndex: number }>();

  responseRows(response).forEach((item, index) => {
    const record = asRecord(item);
    const parent = readOptionText(item, parentKeys);
    if (!parent) return;

    const nextChildren = uniqueTextValues([
      readOptionText(item, childKeys),
      ...pickArray(record, ['childrenList', 'children', 'childList']).map((child) =>
        readOptionText(child, childKeys),
      ),
    ]);
    const parsedSort = readNumber(record.sort, index + 1);
    const current = groups.get(parent);
    groups.set(parent, {
      children: uniqueTextValues([...(current?.children ?? []), ...nextChildren]),
      sort: current ? Math.min(current.sort, parsedSort) : parsedSort,
      sourceIndex: current?.sourceIndex ?? index,
    });
  });

  return Array.from(groups, ([value, group]) => ({ value, ...group }))
    .sort(
      (left, right) =>
        left.sort - right.sort ||
        left.sourceIndex - right.sourceIndex ||
        left.value.localeCompare(right.value, 'zh-Hans-CN'),
    )
    .map(({ value, children }) => ({ value, children }));
}

function mapPersonDisplay(name: unknown, id: unknown, fallback: unknown = ''): string {
  const joined = `${normalizeText(name)} ${normalizeText(id)}`.trim();
  return joined || normalizeText(fallback);
}

function mapSupplementItemToPlanningItem(
  item: SkillPlanningSupplementItemDto | Record<string, unknown>,
  fallbackPlanningDepartment: { code: string; name: string },
): SkillPlanningItem {
  const outerRecord = asRecord(item);
  const entityRecord = asRecord(outerRecord.skillConfigEntity);
  const record = Object.keys(entityRecord).length
    ? { ...outerRecord, ...entityRecord }
    : outerRecord;
  const level = normalizeText(record.level) || normalizeText(record.dimType);
  const levelUpper = level.toUpperCase();
  const isProd = levelUpper === 'PROD' || level === '产品级';
  const dimCode = normalizeText(record.dimCode);
  const dimName = normalizeText(record.dimName);
  const skillName = normalizeText(record.name) || normalizeText(record.skillName);
  const offeringId = normalizeText(record.offeringId) || (isProd ? dimCode : '');
  const offeringName = normalizeText(record.offeringName) || (isProd ? dimName : '');
  const planningDeptCode =
    normalizeText(entityRecord.planDeptCode) ||
    normalizeText(outerRecord.planDeptCode) ||
    normalizeText(entityRecord.planningDeptCode) ||
    normalizeText(outerRecord.planningDeptCode) ||
    (!isProd ? dimCode : fallbackPlanningDepartment.code);
  const planningDeptName =
    normalizeText(entityRecord.planDeptName) ||
    normalizeText(outerRecord.planDeptName) ||
    normalizeText(entityRecord.planningDeptName) ||
    normalizeText(outerRecord.planningDeptName) ||
    (!isProd ? dimName : fallbackPlanningDepartment.name);
  const status = normalizeText(outerRecord.status) || normalizeText(entityRecord.status);

  return {
    id: normalizeText(record.id),
    skillId: normalizeText(record.skillId) || undefined,
    sceneId: normalizeText(record.sceneId) || undefined,
    activityId: normalizeText(record.activityId) || undefined,
    firstScene: normalizeText(record.firstScene),
    secondScene: normalizeText(record.secondScene),
    activityNodeName: normalizeText(record.activityNodeName),
    subActivityNodeName: normalizeText(record.subActivityNodeName),
    name: skillName,
    description: normalizeText(record.description) || normalizeText(record.skillDescription),
    level: isProd ? '产品级' : '部门级',
    offeringId,
    offeringName,
    owner: mapPersonDisplay(record.ownerName, record.ownerId, record.owner),
    deptCode: normalizeText(record.deptCode) || (!isProd ? dimCode : ''),
    deptName: normalizeText(record.deptName) || (!isProd ? dimName : ''),
    planningDeptCode,
    planningDeptName,
    developOwner: mapPersonDisplay(
      record.developOwnerName,
      record.developOwnerId,
      record.developOwner,
    ),
    planedCompleteDate:
      normalizeText(record.planedCompleteDate) || normalizeText(record.planFinishDate),
    // 查询结果顶层 status 来自关联的 Skill 清单，优先级高于规划实体中的历史状态。
    // 状态由后端定义，前端仅去除首尾空白并原样展示。
    status: normalizeText(status),
    l5DeptCode: normalizeText(record.l5DeptCode),
    l5DeptName: normalizeText(record.l5DeptName),
    l4DeptCode: normalizeText(record.l4DeptCode),
    l4DeptName: normalizeText(record.l4DeptName),
    l3DeptCode: normalizeText(record.l3DeptCode),
    l3DeptName: normalizeText(record.l3DeptName),
    l2DeptCode: normalizeText(record.l2DeptCode),
    l2DeptName: normalizeText(record.l2DeptName),
    l1DeptCode: normalizeText(record.l1DeptCode),
    l1DeptName: normalizeText(record.l1DeptName),
  };
}
function normalizeSupplementListResult(
  response: unknown,
  fallbackPlanningDepartment: { code: string; name: string },
): SkillPlanningListResult {
  assertHttpSuccess(response, 'Skill 规划列表加载失败');
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const rows = responseRows(response);
  return {
    list: rows.map((item) =>
      mapSupplementItemToPlanningItem(
        item as SkillPlanningSupplementItemDto,
        fallbackPlanningDepartment,
      ),
    ),
    total: readNumber(meta.number, rows.length),
  };
}

function toHttpSkillPlanningSupplementParams(
  query: SkillPlanningQuery,
): QuerySkillPlanningSupplementParams {
  const params: QuerySkillPlanningSupplementParams = {
    userId: normalizeText(query.userId),
    dimType: normalizeText(query.dimType),
    dimCode: normalizeText(query.dimCode),
    dimName: normalizeText(query.dimName),
  };
  const keyword = normalizeText(query.keyword);
  if (keyword) {
    params.keyword = keyword;
  }
  if (typeof query.pageNum === 'number' && Number.isFinite(query.pageNum)) {
    params.pageNum = query.pageNum;
  }
  if (typeof query.pageSize === 'number' && Number.isFinite(query.pageSize)) {
    params.pageSize = query.pageSize;
  }
  return params;
}

const httpPlanningHeaderFilterKeys = [
  'firstScene',
  'secondScene',
  'activityNodeName',
  'subActivityNodeName',
] as const;

type HttpPlanningHeaderFilterKey = (typeof httpPlanningHeaderFilterKeys)[number];

function planningQuerySelections(
  query: SkillPlanningQuery,
  key: HttpPlanningHeaderFilterKey,
): string[] {
  const value = query[key];
  return uniqueTextValues(Array.isArray(value) ? value : [normalizeText(value)]);
}

function hasHttpPlanningHeaderFilters(query: SkillPlanningQuery): boolean {
  return httpPlanningHeaderFilterKeys.some((key) => planningQuerySelections(query, key).length > 0);
}

function filterHttpPlanningItems(
  items: SkillPlanningItem[],
  query: SkillPlanningQuery,
): SkillPlanningItem[] {
  const selections = new Map(
    httpPlanningHeaderFilterKeys.map((key) => [key, planningQuerySelections(query, key)]),
  );

  return items.filter((item) =>
    httpPlanningHeaderFilterKeys.every((key) => {
      const values = selections.get(key) ?? [];
      return values.length === 0 || values.includes(item[key]);
    }),
  );
}

async function queryAllHttpPlanningItems(query: SkillPlanningQuery): Promise<SkillPlanningItem[]> {
  const requestedPageSize = Math.max(1, Number(query.pageSize ?? 10));
  const fetchPageSize = Math.max(200, requestedPageSize);
  const fallbackPlanningDepartment = {
    code: normalizeText(query.deptCode),
    name: normalizeText(query.planningDeptName),
  };
  const fetchPage = async (pageNum: number): Promise<SkillPlanningListResult> => {
    const response = await skillBaseService.querySkillPlanningSupplement(
      toHttpSkillPlanningSupplementParams({
        ...query,
        pageNum,
        pageSize: fetchPageSize,
      }),
    );
    return normalizeSupplementListResult(response, fallbackPlanningDepartment);
  };

  const firstPage = await fetchPage(1);
  const effectivePageSize = Math.max(1, firstPage.list.length || fetchPageSize);
  const pageCount = Math.ceil(firstPage.total / effectivePageSize);
  const items = [...firstPage.list];

  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const page = await fetchPage(pageNum);
    items.push(...page.list);
  }

  return items;
}

async function queryHttpPlanningWithHeaderFilters(
  query: SkillPlanningQuery,
): Promise<SkillPlanningListResult> {
  const pageNum = Math.max(1, Number(query.pageNum ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const filtered = filterHttpPlanningItems(await queryAllHttpPlanningItems(query), query);
  const start = (pageNum - 1) * pageSize;

  return {
    list: filtered.slice(start, start + pageSize),
    total: filtered.length,
  };
}

function toSkillTransferParams(query: SkillPlanningQuery): SkillTransferParams {
  return normalizeSkillTransferParams({
    userId: normalizeText(query.userId),
    dimType: normalizeText(query.dimType),
    dimCode: normalizeText(query.dimCode),
    dimName: normalizeText(query.dimName),
  });
}

function normalizeProductPlanningOptions(response: unknown): ProductPlanningOption[] {
  assertHttpSuccess(response, '产品列表加载失败');
  const data = unwrapResponseData<unknown>(response);
  const source = Array.isArray(data)
    ? data
    : pickArray(asRecord(data), ['products', 'productList', 'list', 'records', 'items', 'rows']);
  const optionMap = new Map<string, ProductPlanningOption>();

  source.forEach((item) => {
    const record = asRecord(item);
    const offeringId = readOptionText(item, [
      'offeringId',
      'productId',
      'productCode',
      'offeringCode',
      'code',
      'id',
    ]);
    const offeringName = readOptionText(item, [
      'offeringName',
      'productName',
      'productNameCn',
      'offeringNameCn',
      'name',
      'label',
    ]);
    const planningDeptName =
      normalizeText(record.planningDeptName) ||
      normalizeText(record.departmentName) ||
      normalizeText(record.deptName);
    if (!offeringName) {
      return;
    }
    optionMap.set(`${planningDeptName}::${offeringId || offeringName}`, {
      offeringId,
      offeringName,
      planningDeptName,
    });
  });

  return Array.from(optionMap.values());
}

const userIdKeys = ['id', 'userId', 'employeeNo', 'account', 'uid', 'empNo', 'Account'];
const userSamAccountNameKeys = ['sAMAccountName', 'samAccountName'];
const userNameKeys = [
  'chName',
  'cnName',
  'userName',
  'displayNameCN',
  'displayName',
  'name',
  'lastName',
];
const userDepartmentKeys = [
  'departmentL8',
  'department_l8',
  'deptL8',
  'dept_l8',
  'departmentL7',
  'department_l7',
  'deptL7',
  'dept_l7',
  'departmentL6',
  'department_l6',
  'deptL6',
  'dept_l6',
  'departmentL5',
  'department_l5',
  'deptL5',
  'dept_l5',
  'departmentL4',
  'department_l4',
  'deptL4',
  'dept_l4',
  'departmentL3',
  'department_l3',
  'deptL3',
  'dept_l3',
  'departmentL2',
  'department_l2',
  'deptL2',
  'dept_l2',
  'departmentL1',
  'department_l1',
  'deptL1',
  'dept_l1',
  'departmentName',
  'department',
  'deptName',
  'dept_name',
];

function readFirstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = normalizeText(record[key]);
    if (text) {
      return text;
    }
  }
  return '';
}

function readDeepestDepartment(record: Record<string, unknown>): string {
  const hwDepartment = Object.entries(record)
    .flatMap(([key, value]) => {
      const match = /^hwDepartName(\d+)$/i.exec(key);
      const name = normalizeText(value);
      return match && name ? [{ level: Number(match[1]), name }] : [];
    })
    .sort((left, right) => right.level - left.level)[0]?.name;

  return hwDepartment || readFirstText(record, userDepartmentKeys);
}

function normalizeUserDepartmentOptions(response: unknown): SkillPlanningUserOption[] {
  const data = unwrapResponseData<unknown>(response);
  const source = Array.isArray(data)
    ? data
    : pickArray(asRecord(data), ['list', 'records', 'items', 'rows', 'data']);
  const optionMap = new Map<string, SkillPlanningUserOption>();

  source.forEach((item) => {
    const record = asRecord(item);
    const id = readFirstText(record, userIdKeys);
    const sAMAccountName = readFirstText(record, userSamAccountNameKeys);
    const chName = readFirstText(record, userNameKeys);
    const label = [chName, id].filter(Boolean).join(' ');
    if (!label) {
      return;
    }

    optionMap.set(label, {
      id,
      sAMAccountName,
      chName,
      label,
      deptName: readDeepestDepartment(record),
      raw: record,
    });
  });

  return Array.from(optionMap.values());
}

function normalizeHttpDownloadUrl(response: unknown): string {
  const data = unwrapResponseData<unknown>(response);
  if (typeof data === 'string') {
    const text = data.trim();
    if (text) {
      return text;
    }
  }

  const record =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const url = record.url ?? record.link ?? record.downloadUrl ?? record.href;
  const text = typeof url === 'string' ? url.trim() : '';
  if (!text) {
    throw new Error('未获取到导入模板下载链接');
  }
  return text;
}

function normalizeTaxonomyRequestParams(
  params: SkillPlanningTaxonomyOptionParams,
): SkillPlanningTaxonomyOptionParams {
  const normalized = {
    userId: normalizeText(params.userId),
    dimType: normalizeText(params.dimType),
    dimCode: normalizeText(params.dimCode),
    dimName: normalizeText(params.dimName),
  };
  const missing = Object.entries(normalized)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error('场景/活动列表查询缺少必填参数: ' + missing.join(', '));
  }
  return normalized;
}

export async function querySkillPlanningSceneOptionGroups(
  params: SkillPlanningTaxonomyOptionParams,
): Promise<SkillPlanningOptionGroup[]> {
  if (!useHttpTransport()) {
    return [];
  }

  const response = await skillBaseService.getSceneOptionGroups(
    normalizeTaxonomyRequestParams(params),
  );
  return normalizeTaxonomyOptionGroupsFromRows(
    response,
    ['firstScene', 'scene', 'name', 'label', 'value'],
    ['secondScene', 'scene', 'name', 'label', 'value'],
    '场景列表加载失败',
  );
}

export function httpDimContext(
  departmentName: string,
  userId: string,
  scopeForm: any,
  deptOptions: any,
): {
  userId: string;
  dimType: string;
  dimCode: string;
  dimName: string;
} {
  if (!userId) {
    throw new Error('请先获取当前用户工号');
  }
  if (scopeForm.level === '产品级') {
    const dimCode = scopeForm.offeringId.trim();
    const dimName = scopeForm.offeringName.trim();
    if (!dimCode || !dimName) {
      throw new Error('请先选择产品');
    }
    return {
      userId,
      dimType: '产品级',
      dimCode,
      dimName,
    };
  }
  const department = deptOptions.find((item) => item.name === departmentName);
  const dimCode = department?.deptCode.trim() || departmentName.trim();
  const dimName = departmentName.trim();
  if (!dimCode || !dimName) {
    throw new Error('请先选择归属部门');
  }
  return {
    userId,
    dimType: '部门级',
    dimCode,
    dimName,
  };
}

export async function querySkillPlanningActivityOptionGroups(
  params: SkillPlanningTaxonomyOptionParams,
): Promise<SkillPlanningOptionGroup[]> {
  if (!useHttpTransport()) {
    return [];
  }

  const response = await skillBaseService.getActivityOptionGroups(
    normalizeTaxonomyRequestParams(params),
  );
  return normalizeTaxonomyOptionGroupsFromRows(
    response,
    ['activityNodeName', 'activity', 'name', 'label', 'value'],
    ['subActivityNodeName', 'activityNodeName', 'activity', 'name', 'label', 'value'],
    '活动列表加载失败',
  );
}

export async function getProductPlanning(
  offeringName: string,
  planningDeptName: string,
  deptCode: string,
): Promise<ProductPlanningOption[]> {
  const params = {
    offeringName: normalizeText(offeringName),
    planningDeptName: normalizeText(planningDeptName),
  };

  const normalizedDeptCode = normalizeText(deptCode);
  if (!normalizedDeptCode || /^(undefined|null)$/i.test(normalizedDeptCode)) {
    throw new Error(
      '\u4ea7\u54c1\u5217\u8868\u67e5\u8be2\u7f3a\u5c11\u5f53\u524d\u6240\u9009\u6700\u5c0f\u90e8\u95e8\u7f16\u7801',
    );
  }

  const response = await skillBaseService.queryHarnessDeptProducts({
    deptCode: normalizedDeptCode,
  });
  const keyword = params.offeringName.toLowerCase();
  return normalizeProductPlanningOptions(response)
    .map((option) => ({
      ...option,
      planningDeptName: option.planningDeptName || params.planningDeptName,
    }))
    .filter((option) => !keyword || option.offeringName.toLowerCase().includes(keyword));
}

export async function querySkillPlanningUsers(info = ''): Promise<SkillPlanningUserOption[]> {
  const keyword = normalizeText(info);
  if (!keyword) {
    return [];
  }

  const response = await skillBaseService.getUserDepartment({ info: keyword });
  return normalizeUserDepartmentOptions(response);
}

export async function querySkillPlanningSupplement(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  if (!useHttpTransport()) {
    return (await loadMockService()).querySkillPlanningSupplement(query);
  }

  // 新版 GET 接口只接收维度、关键词和分页；表头多选条件需要在当前维度全集上细化。
  if (hasHttpPlanningHeaderFilters(query)) {
    return queryHttpPlanningWithHeaderFilters(query);
  }
  const params = toHttpSkillPlanningSupplementParams(query);
  const response = await skillBaseService.querySkillPlanningSupplement(params);
  return normalizeSupplementListResult(response, {
    code: normalizeText(query.deptCode),
    name: normalizeText(query.planningDeptName),
  });
}

export async function exportAllSkillPlanningList(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningItem[]> {
  if (!useHttpTransport()) {
    return (await loadMockService()).exportAllSkillPlanningList(query);
  }

  const nextQuery = { ...query };
  delete nextQuery.pageNum;
  delete nextQuery.pageSize;

  const result = await querySkillPlanningSupplement({
    ...nextQuery,
    pageNum: 1,
    pageSize: 10000,
  });
  return result.list;
}

export async function exportSkillPlanningSupplementFile(
  query: SkillPlanningQuery,
): Promise<ApiEnvelope<string> | null> {
  const params = toSkillTransferParams(query);
  if (!useHttpTransport()) {
    const rows = await (await loadMockService()).exportAllSkillPlanningList(query);
    await exportSkillPlanningToExcel(rows);
    return null;
  }
  return skillBaseService.exportSkillPlanningSupplement(params);
}

export async function createSkillPlanningSupplement(
  body: CreateSkillPlanningSupplementBody,
  userId: string,
): Promise<any> {
  const response = await skillBaseService.createSkillPlanningSupplement(body, {
    userId,
    dimCode: body.dimCode,
    dimType: body.dimType,
    dimName: body.dimName,
  });
  return response;
}

export async function updateSkillPlanningSupplement(
  body: UpdateSkillPlanningSupplementBody,
  userId: string,
): Promise<any> {
  const response = await skillBaseService.updateSkillPlanningSupplement(body, {
    userId,
    dimCode: body.dimCode,
    dimType: body.dimType,
    dimName: body.dimName,
  });
  return response;
}

export async function importSkillPlanningFromExcel(
  file: File,
  query: SkillPlanningQuery,
): Promise<SkillPlanningImportResult> {
  const params = toSkillTransferParams(query);
  if (!useHttpTransport()) {
    return (await loadMockService()).importSkillPlanningFromExcel(file);
  }

  const formData = new FormData();
  formData.append('file', file);
  const response = await skillBaseService.importSkillPlanningSupplement(formData, params);
  return normalizeSkillImportResponse(response);
}

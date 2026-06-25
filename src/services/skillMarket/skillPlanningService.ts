import { skillBaseService } from './skillBaseService';
import {
  exportSkillPlanningToExcel,
  normalizeProgress,
  normalizeSkillPlanningItem,
  normalizeText,
  normalizeTextArray,
  type SkillPlanningBatchPatch,
  type SkillPlanningBatchUpdatePayload,
  type SkillPlanningFilterOptions,
  type SkillPlanningImportResult,
  type SkillPlanningOptionGroup,
  type SkillPlanningItem,
  type SkillPlanningListResult,
  type SkillPlanningPayload,
  type SkillPlanningQuery,
} from './skillPlanningShared';

export { exportSkillPlanningToExcel, skillPlanningExportHeaders } from './skillPlanningShared';
export type {
  SkillPlanningBatchPatch,
  SkillPlanningBatchUpdatePayload,
  SkillPlanningFilterOptions,
  SkillPlanningImportResult,
  SkillPlanningOptionGroup,
  SkillPlanningItem,
  SkillPlanningListResult,
  SkillPlanningPayload,
  SkillPlanningProgress,
  SkillPlanningQuery,
  SkillPlanningSortField,
  SkillPlanningSortOrder,
} from './skillPlanningShared';

type SkillPlanningMockModule = typeof import('./skillPlanningMockService');

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

function normalizeOptionGroups(
  items: unknown[],
  parentKeys: string[],
  childKeys: string[],
): SkillPlanningOptionGroup[] {
  const groupMap = new Map<string, string[]>();

  items.forEach((item) => {
    const parent = readOptionText(item, parentKeys);
    if (!parent) {
      return;
    }

    const children = uniqueTextValues(
      pickArray(asRecord(item), ['childrenList', 'children', 'childList']).map((child) =>
        readOptionText(child, childKeys),
      ),
    );
    groupMap.set(parent, uniqueTextValues([...(groupMap.get(parent) ?? []), ...children]));
  });

  return Array.from(groupMap, ([value, children]) => ({ value, children }));
}

function flattenGroupChildren(groups: SkillPlanningOptionGroup[]): string[] {
  return uniqueTextValues(groups.flatMap((group) => group.children));
}

function normalizeHttpFilterOptions(response: unknown): SkillPlanningFilterOptions {
  const record = asRecord(unwrapResponseData<unknown>(response));
  const sceneGroups = normalizeOptionGroups(
    pickArray(record, ['skillSceneVoList']),
    ['scene', 'firstScene', 'name', 'label', 'value'],
    ['scene', 'secondScene', 'name', 'label', 'value'],
  );
  const activityGroups = normalizeOptionGroups(
    pickArray(record, ['skillActivityVoList']),
    ['activityNodeName', 'activity', 'name', 'label', 'value'],
    ['subActivityNodeName', 'activityNodeName', 'activity', 'name', 'label', 'value'],
  );

  return {
    firstScene: sceneGroups.map((group) => group.value),
    secondScene: flattenGroupChildren(sceneGroups),
    activityNodeName: activityGroups.map((group) => group.value),
    subActivityNodeName: flattenGroupChildren(activityGroups),
    level: normalizeTextArray(pickArray(record, ['levelList', 'levels'])),
    status: normalizeTextArray(pickArray(record, ['statusList', 'statuses'])).map(
      normalizeProgress,
    ),
    sceneGroups,
    activityGroups,
  };
}

function normalizeHttpListResult(response: unknown): SkillPlanningListResult {
  return {
    list: response?.data ?? [],
    total: response?.meta?.number ?? 0,
  };
}

function normalizeHttpCount(response: unknown): number {
  const data = unwrapResponseData<unknown>(response);
  if (typeof data === 'number') {
    return readNumber(data, 0);
  }

  if (Array.isArray(data)) {
    return data.length;
  }

  const record =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return readNumber(
    record.count ??
      record.updatedCount ??
      record.deletedCount ??
      record.affectedRows ??
      record.total,
    0,
  );
}

function normalizeHttpImportResult(response: unknown): SkillPlanningImportResult {
  const data = unwrapResponseData<unknown>(response);
  const record =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    created: readNumber(record.created, 0),
    missingFields: normalizeTextArray(record.missingFields),
  };
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

function normalizeHttpItem(response: unknown): SkillPlanningItem {
  return normalizeSkillPlanningItem(unwrapResponseData<unknown>(response));
}

const planningHeaderFilterHttpParamPairs = [
  ['firstScene', 'primaryScenes'],
  ['secondScene', 'secondaryScenes'],
  ['activityNodeName', 'activities'],
  ['subActivityNodeName', 'subActivities'],
  ['level', 'levels'],
  ['status', 'progresses'],
] as const satisfies ReadonlyArray<readonly [keyof SkillPlanningQuery, keyof SkillPlanningQuery]>;

const planningHeaderFilterHttpMultiKeys = new Set<string>(
  planningHeaderFilterHttpParamPairs.map(([, multiKey]) => multiKey),
);

function assignHttpQueryValue(
  body: Record<string, unknown>,
  key: keyof SkillPlanningQuery,
  value: unknown,
): void {
  if (Array.isArray(value)) {
    const values = normalizeTextArray(value);
    if (values.length > 0) {
      body[key] = values.length === 1 ? values[0] : values;
    }
    return;
  }

  if (typeof value === 'number') {
    body[key] = value;
    return;
  }

  const text = normalizeText(value);
  if (text) {
    body[key] = text;
  }
}

function toHttpSkillPlanningQuery(query: SkillPlanningQuery): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  Object.entries(query).forEach(([key, value]) => {
    if (planningHeaderFilterHttpMultiKeys.has(key)) {
      return;
    }
    assignHttpQueryValue(body, key as keyof SkillPlanningQuery, value);
  });

  planningHeaderFilterHttpParamPairs.forEach(([valueKey, multiKey]) => {
    const values = normalizeTextArray(query[multiKey]);
    if (values.length > 0) {
      body[valueKey] = values;
      return;
    }
    assignHttpQueryValue(body, valueKey, query[valueKey]);
  });

  return body;
}

export async function querySkillPlanningFilterOptions(): Promise<SkillPlanningFilterOptions> {
  if (!useHttpTransport()) {
    return (await loadMockService()).getPlanningOption();
  }

  const response = await skillBaseService.getPlanningOption();
  return normalizeHttpFilterOptions(response);
}

export async function querySkillConfig(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  if (!useHttpTransport()) {
    return (await loadMockService()).querySkillConfig(query);
  }

  const response = await skillBaseService.querySkillConfig(toHttpSkillPlanningQuery(query));
  return normalizeHttpListResult(response);
}

export async function queryAllSkillPlanningList(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningItem[]> {
  if (!useHttpTransport()) {
    return (await loadMockService()).queryAllSkillPlanningList(query);
  }

  const nextQuery = { ...query };
  delete nextQuery.pageNum;
  delete nextQuery.pageSize;

  const pageSize = Math.max(200, readNumber(query.pageSize, 200));
  const rows: SkillPlanningItem[] = [];
  let nextPage = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    const result = await querySkillConfig({
      ...nextQuery,
      pageNum: nextPage,
      pageSize,
    });

    rows.push(...result.list);
    total = result.total;

    if (result.list.length === 0 || result.list.length < pageSize) {
      break;
    }
    nextPage += 1;
  }

  return rows;
}

export async function createSkillPlanning(
  payload: SkillPlanningPayload,
): Promise<SkillPlanningItem> {
  if (!useHttpTransport()) {
    return (await loadMockService()).createSkillPlanning(payload);
  }

  const response = await skillBaseService.createSkillPlanning(payload);
  return normalizeHttpItem(response);
}

export async function updateSkillPlanning(
  id: string,
  payload: SkillPlanningPayload,
): Promise<SkillPlanningItem> {
  if (!useHttpTransport()) {
    return (await loadMockService()).updateSkillPlanning(id, payload);
  }

  const response = await skillBaseService.updateSkillPlanning(payload);
  return normalizeHttpItem(response);
}

export async function batchUpdateSkillPlanning(
  ids: string[],
  patch: SkillPlanningBatchPatch,
): Promise<number> {
  const body: SkillPlanningBatchUpdatePayload = { ids, ...patch };
  if (!useHttpTransport()) {
    return (await loadMockService()).batchUpdateSkillPlanning(ids, patch);
  }

  const response = await skillBaseService.batchUpdateSkillPlanning(body);
  return normalizeHttpCount(response);
}

export async function deleteSkillPlanning(id: string): Promise<void> {
  if (!useHttpTransport()) {
    return (await loadMockService()).deleteSkillPlanning(id);
  }

  await skillBaseService.deleteSkillPlanning({ id });
}

export async function batchDeleteSkillPlanning(ids: string[]): Promise<number> {
  if (!useHttpTransport()) {
    return (await loadMockService()).batchDeleteSkillPlanning(ids);
  }

  const response = await skillBaseService.batchDeleteSkillPlanning(ids);
  return normalizeHttpCount(response);
}

export async function importSkillPlanningFromExcel(file: File): Promise<SkillPlanningImportResult> {
  if (!useHttpTransport()) {
    return (await loadMockService()).importSkillPlanningFromExcel(file);
  }

  const formData = new FormData();
  formData.append('file', file);
  const response = await skillBaseService.importSkillPlanning(formData);
  return normalizeHttpImportResult(response);
}

export async function downloadSkillPlanningTemplate(): Promise<string | void> {
  if (!useHttpTransport()) {
    return (await loadMockService()).downloadSkillPlanningTemplate();
  }

  const response = await skillBaseService.downloadSkillPlanning();
  return normalizeHttpDownloadUrl(response);
}

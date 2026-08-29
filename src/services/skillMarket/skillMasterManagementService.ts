import { skillMasterSeedRecords } from './mock/skillMasterSeed';

import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';
export type SkillMasterStatus = '未开始' | '开发中' | '已完成' | '进行中' | '联调中';

export interface SkillMasterVersion {
  version: string;
  uploadedAt: string;
  mrId?: string;
  repoUrl?: string;
  tagName?: string | null;
}

export interface SkillMasterRecord {
  id: string;
  name: string;
  description: string;
  level: string;
  product: string;
  owner: string;
  department: string;
  developOwner: string;
  developOwnerDepartment?: string;
  plannedCompleteDate: string;
  status: SkillMasterStatus;
  versions?: SkillMasterVersion[];
  /** Number of planning records that currently reference this catalog item. */
  referenceCount?: number;
  /** 来源：created 直接新建 / imported 从 Skill 广场引入 */
  skillSource?: 'created' | 'imported';
  createdAt: string;
  updatedAt: string;
}

export type SkillMasterPayload = Omit<
  SkillMasterRecord,
  'id' | 'createdAt' | 'updatedAt' | 'versions'
>;

export interface SkillMasterQuery {
  keyword?: string;
  departmentName?: string;
  planningDeptName?: string;
  level?: string;
  product?: string;
  offeringId?: string;
  offeringName?: string;
  scopeStrict?: boolean;
}

const STORAGE_KEY = 'skill-market-master-records-v5';
const LEGACY_STORAGE_KEYS = [
  'skill-market-master-records-v4',
  'skill-market-master-records-v3',
  'skill-market-master-records-v2',
  'skill-market-master-records-v1',
];
const seedTimestamp = Date.parse('2026-07-18T09:00:00.000Z');
const defaultRecords: SkillMasterRecord[] = skillMasterSeedRecords.map((record, index) => {
  const timestamp = new Date(seedTimestamp + index * 10 * 60 * 1000).toISOString();
  return {
    ...record,
    level: '',
    product: '',
    developOwnerDepartment: String(record.developOwnerDepartment ?? '').trim(),
    versions:
      index % 4 === 1
        ? []
        : [
            {
              version: `0.${Math.floor(index / 4)}.${index + 1}`,
              uploadedAt: new Date(seedTimestamp + index * 10 * 60 * 1000).toISOString(),
            },
            {
              version: `0.${Math.floor(index / 4)}.${index + 2}`,
              uploadedAt: new Date(seedTimestamp + (index + 1) * 10 * 60 * 1000).toISOString(),
            },
          ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
});

let memoryRecords: SkillMasterRecord[] | null = null;

function cloneRecord(record: SkillMasterRecord): SkillMasterRecord {
  return {
    ...record,
    versions: normalizeSkillMasterVersions(record.versions),
  };
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseJsonCollection(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (!text.startsWith('[') && !text.startsWith('{'))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function collectionRows(value: unknown): unknown[] {
  const parsed = parseJsonCollection(value);
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  return (
    ['data', 'list', 'records', 'items', 'rows']
      .map((key) => parseJsonCollection(record[key]))
      .find((item): item is unknown[] => Array.isArray(item)) ?? []
  );
}

function compareVersionNumbersDescending(left: string, right: string): number {
  const leftParts = left
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number(part) || 0);
  const rightParts = right
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return right.localeCompare(left);
}

function versionTimestamp(value: string): number | null {
  const timestamp = Date.parse(value.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareVersionEntriesDescending(
  left: SkillMasterVersion,
  right: SkillMasterVersion,
): number {
  const leftTimestamp = versionTimestamp(left.uploadedAt);
  const rightTimestamp = versionTimestamp(right.uploadedAt);
  if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }
  return compareVersionNumbersDescending(left.version, right.version);
}

export function normalizeSkillMasterVersions(value: unknown): SkillMasterVersion[] {
  const entries = collectionRows(value)
    .map((item) => {
      const record = asRecord(item);
      return {
        version: normalize(record.version) || normalize(item),
        uploadedAt: normalize(record.uploadedAt),
        mrId: normalize(record.mrId),
        repoUrl: normalize(record.repoUrl),
        tagName: record.tagName == null ? null : normalize(record.tagName),
      };
    })
    .filter((item) => Boolean(item.version))
    .sort(compareVersionEntriesDescending);
  const seen = new Set<string>();
  return entries.filter((item) => {
    const key = item.version.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function latestSkillMasterVersion(
  record: Pick<SkillMasterRecord, 'versions'>,
): SkillMasterVersion | null {
  return normalizeSkillMasterVersions(record.versions)[0] ?? null;
}

function normalizeStoredStatus(value: unknown): SkillMasterStatus {
  if (value === '已完成') return '已完成';
  if (value === '未开始') return '未开始';
  if (value === '进行中') return '进行中';
  if (value === '联调中') return '联调中';
  return '开发中';
}

function migrateLegacyRecords(records: SkillMasterRecord[]): SkillMasterRecord[] {
  const defaultRecordById = new Map(defaultRecords.map((record) => [record.id, record]));
  const employeeNumberPattern = /\b[a-zA-Z]\d{8}\b/;
  const migrated = records.map((record) => {
    const defaultRecord = defaultRecordById.get(record.id);
    const isLegacyDefault =
      defaultRecord &&
      (!employeeNumberPattern.test(record.owner) ||
        !employeeNumberPattern.test(record.developOwner));

    if (defaultRecord && isLegacyDefault) {
      return {
        ...defaultRecord,
        createdAt: normalize(record.createdAt) || defaultRecord.createdAt,
        updatedAt: normalize(record.updatedAt) || defaultRecord.updatedAt,
      };
    }

    return {
      ...record,
      developOwnerDepartment:
        normalize(record.developOwnerDepartment) || defaultRecord?.developOwnerDepartment || '',
      status: normalizeStoredStatus(record.status),
      versions: normalizeSkillMasterVersions(record.versions ?? defaultRecord?.versions),
    };
  });
  const existingIds = new Set(migrated.map((record) => record.id));
  return [...migrated, ...defaultRecords.filter((record) => !existingIds.has(record.id))];
}

function readRecords(): SkillMasterRecord[] {
  if (memoryRecords) return memoryRecords;
  if (typeof window !== 'undefined') {
    try {
      const currentRaw = window.localStorage.getItem(STORAGE_KEY);
      const legacyRaw = LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(
        Boolean,
      );
      const raw = currentRaw || legacyRaw;
      if (raw) {
        const parsed = JSON.parse(raw) as SkillMasterRecord[];
        if (Array.isArray(parsed)) {
          memoryRecords = migrateLegacyRecords(parsed);
          if (!currentRaw) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRecords));
          }
          return memoryRecords;
        }
      }
    } catch {
      // Invalid local data falls back to the default master list.
    }
  }
  memoryRecords = defaultRecords.map(cloneRecord);
  return memoryRecords;
}

function persist(records: SkillMasterRecord[]): void {
  memoryRecords = records;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

function normalizePayload(payload: SkillMasterPayload): SkillMasterPayload {
  return {
    name: normalize(payload.name),
    description: normalize(payload.description),
    level: normalize(payload.level),
    product: normalize(payload.product),
    owner: normalize(payload.owner),
    department: normalize(payload.department),
    developOwner: normalize(payload.developOwner),
    developOwnerDepartment: normalize(payload.developOwnerDepartment),
    plannedCompleteDate: normalize(payload.plannedCompleteDate),
    status: payload.status,
  };
}

function validatePayload(payload: SkillMasterPayload, requiredProductPrefix: string): void {
  if (!payload.name) throw new Error('请输入 Skill 名称');
  if (!payload.description) throw new Error('请输入 Skill 说明');
  if (!payload.owner) throw new Error('请输入责任 Owner');
  if (payload.skillSource === 'imported') {
    return;
  }
  if (!isCatalogItemNameValid(payload.name)) {
    throw new Error(
      'Skill \u540d\u79f0\u4ec5\u5141\u8bb8\u5c0f\u5199\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u8fde\u5b57\u7b26\uff0c\u6700\u957f 64 \u5b57\u7b26',
    );
  }
  if (payload.level === '产品级' && requiredProductPrefix) {
    if (!payload.name.startsWith(requiredProductPrefix)) {
      throw new Error('产品级 Skill 名称需以产品名称的小写形式“' + requiredProductPrefix + '”开头');
    }
    if (payload.name.length === requiredProductPrefix.length) {
      throw new Error('请在“' + requiredProductPrefix + '”后补充 Skill 名称');
    }
  }
}

export function listSkillMasterRecords(): SkillMasterRecord[] {
  return readRecords()
    .map(cloneRecord)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * Skill 规划选择器查询语义：
 * - 无关键词时，只返回 Owner 或开发责任人属于指定部门的 Skill；
 * - 有关键词时，跨部门模糊查询名称、描述、Owner 和开发责任人。
 *
 * 保持 Promise 接口，后续可直接替换为后端搜索请求。
 */
export async function querySkillMasterRecords(
  query: SkillMasterQuery = {},
): Promise<SkillMasterRecord[]> {
  const keyword = normalize(query.keyword).toLocaleLowerCase();
  const departmentName = normalize(query.planningDeptName) || normalize(query.departmentName);
  const level = normalize(query.level);
  const product = normalize(query.offeringName) || normalize(query.product);

  return listSkillMasterRecords().filter((record) => {
    const matchesScope =
      (!departmentName ||
        [record.department, record.developOwnerDepartment].some(
          (value) => normalize(value) === departmentName,
        )) &&
      (!level || !record.level || normalize(record.level) === level) &&
      (!product || !record.product || normalize(record.product) === product);
    if (query.scopeStrict && !matchesScope) return false;
    if (keyword) {
      return [record.name, record.description, record.owner, record.developOwner].some((value) =>
        normalize(value).toLocaleLowerCase().includes(keyword),
      );
    }
    return matchesScope;
  });
}

export function createSkillMasterRecord(payload: SkillMasterPayload): SkillMasterRecord {
  const requiredProductPrefix = getProductCatalogItemNamePrefix(
    normalize(payload.level),
    payload.product,
  );
  const normalized = normalizePayload(payload);
  validatePayload(normalized, requiredProductPrefix);
  const now = new Date().toISOString();
  const record: SkillMasterRecord = {
    id: `skill-master-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...normalized,
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
  persist([record, ...readRecords()]);
  return cloneRecord(record);
}

export function updateSkillMasterRecord(
  id: string,
  payload: SkillMasterPayload,
): SkillMasterRecord {
  const records = readRecords();
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error('未找到该 Skill');
  const requiredProductPrefix = getProductCatalogItemNamePrefix(
    normalize(payload.level),
    payload.product,
  );
  const normalized = normalizePayload(payload);
  validatePayload(normalized, requiredProductPrefix);
  Object.assign(record, normalized, { updatedAt: new Date().toISOString() });
  persist(records);
  return cloneRecord(record);
}

export function deleteSkillMasterRecord(id: string): void {
  persist(readRecords().filter((item) => item.id !== id));
}

import { skillMasterSeedRecords } from './mock/skillMasterSeed';

export type SkillMasterStatus = '未开始' | '开发中' | '已完成';

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
  createdAt: string;
  updatedAt: string;
}

export type SkillMasterPayload = Omit<SkillMasterRecord, 'id' | 'createdAt' | 'updatedAt'>;

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

const STORAGE_KEY = 'skill-market-master-records-v4';
const LEGACY_STORAGE_KEYS = [
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
});

let memoryRecords: SkillMasterRecord[] | null = null;

function cloneRecord(record: SkillMasterRecord): SkillMasterRecord {
  return { ...record };
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeStoredStatus(value: unknown): SkillMasterStatus {
  if (value === '已完成') return '已完成';
  if (value === '未开始') return '未开始';
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
          memoryRecords = currentRaw ? parsed : migrateLegacyRecords(parsed);
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

function validatePayload(payload: SkillMasterPayload): void {
  if (!payload.name) throw new Error('请输入 Skill 名称');
  if (!payload.description) throw new Error('请输入 Skill 说明');
  if (!payload.owner) throw new Error('请输入责任 Owner');
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
  const normalized = normalizePayload(payload);
  validatePayload(normalized);
  const now = new Date().toISOString();
  const record: SkillMasterRecord = {
    id: `skill-master-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...normalized,
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
  const normalized = normalizePayload(payload);
  validatePayload(normalized);
  Object.assign(record, normalized, { updatedAt: new Date().toISOString() });
  persist(records);
  return cloneRecord(record);
}

export function deleteSkillMasterRecord(id: string): void {
  persist(readRecords().filter((item) => item.id !== id));
}

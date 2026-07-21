export type SkillMasterStatus = '未开始' | '开发中' | '联调中' | '已完成' | '已延期';

export interface SkillMasterRecord {
  id: string;
  name: string;
  description: string;
  level: string;
  product: string;
  owner: string;
  department: string;
  developOwner: string;
  plannedCompleteDate: string;
  status: SkillMasterStatus;
  createdAt: string;
  updatedAt: string;
}

export type SkillMasterPayload = Omit<SkillMasterRecord, 'id' | 'createdAt' | 'updatedAt'>;

const STORAGE_KEY = 'skill-market-master-records-v1';

const defaultRecords: SkillMasterRecord[] = [
  {
    id: 'skill-master-1001',
    name: '接口 Mock 生成 Skill',
    description: '根据接口定义自动生成 Mock 数据和联调示例，减少前后端等待时间。',
    level: '平台级',
    product: 'API 产品线',
    owner: '张三',
    department: '联调工具部',
    developOwner: '李明',
    plannedCompleteDate: '2026-08-15',
    status: '开发中',
    createdAt: '2026-07-18T09:00:00.000Z',
    updatedAt: '2026-07-18T09:00:00.000Z',
  },
  {
    id: 'skill-master-1002',
    name: '测试用例评审 Skill',
    description: '基于需求和历史缺陷生成测试用例评审建议，提升测试覆盖完整度。',
    level: '部门级',
    product: '质量产品线',
    owner: '李四',
    department: '评审小组',
    developOwner: '周扬',
    plannedCompleteDate: '2026-08-30',
    status: '未开始',
    createdAt: '2026-07-18T09:10:00.000Z',
    updatedAt: '2026-07-18T09:10:00.000Z',
  },
  {
    id: 'skill-master-1003',
    name: '日志异常定位 Skill',
    description: '汇总异常日志、调用链和发布记录，输出可执行的问题定位摘要。',
    level: '组织级',
    product: 'SRE 产品线',
    owner: '王五',
    department: '日志工具组',
    developOwner: '陈七',
    plannedCompleteDate: '2026-09-10',
    status: '联调中',
    createdAt: '2026-07-18T09:20:00.000Z',
    updatedAt: '2026-07-18T09:20:00.000Z',
  },
  {
    id: 'skill-master-1004',
    name: '会议纪要沉淀 Skill',
    description: '从会议记录中抽取决策、风险、待办和关联文档，沉淀为团队知识资产。',
    level: '部门级',
    product: '项目产品线',
    owner: '赵六',
    department: '项目管理部',
    developOwner: '刘岚',
    plannedCompleteDate: '2026-09-20',
    status: '已完成',
    createdAt: '2026-07-18T09:30:00.000Z',
    updatedAt: '2026-07-18T09:30:00.000Z',
  },
];

let memoryRecords: SkillMasterRecord[] | null = null;

function cloneRecord(record: SkillMasterRecord): SkillMasterRecord {
  return { ...record };
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function readRecords(): SkillMasterRecord[] {
  if (memoryRecords) return memoryRecords;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SkillMasterRecord[];
        if (Array.isArray(parsed)) {
          memoryRecords = parsed;
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
    plannedCompleteDate: normalize(payload.plannedCompleteDate),
    status: payload.status,
  };
}

function validatePayload(payload: SkillMasterPayload): void {
  if (!payload.name) throw new Error('请输入 Skill 名称');
  if (!payload.description) throw new Error('请输入 Skill 说明');
  if (!payload.level) throw new Error('请选择 Skill 层级');
  if (!payload.owner) throw new Error('请输入责任 Owner');
}

export function listSkillMasterRecords(): SkillMasterRecord[] {
  return readRecords()
    .map(cloneRecord)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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
  if (!record) throw new Error('未找到该 Skill 规划');
  const normalized = normalizePayload(payload);
  validatePayload(normalized);
  Object.assign(record, normalized, { updatedAt: new Date().toISOString() });
  persist(records);
  return cloneRecord(record);
}

export function deleteSkillMasterRecord(id: string): void {
  persist(readRecords().filter((item) => item.id !== id));
}

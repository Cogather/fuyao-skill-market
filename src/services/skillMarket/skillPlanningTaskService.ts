import { skillBaseService } from './skillBaseService';

export type SkillTaskStatus = string;
export type PlanningTaskCapabilityType = 'command' | 'skill' | 'agent';
export type SkillTaskPriority = 'high' | 'medium' | 'low';

export interface SkillPlanningTaskVersion {
  version: string;
  uploadedAt: string;
  mrId?: string;
  repoUrl?: string;
  tagName?: string | null;
}

export interface SkillPlanningTask {
  id: string;
  name: string;
  description: string;
  priority: SkillTaskPriority;
  status: SkillTaskStatus;
  versions: SkillPlanningTaskVersion[];
  filePath: string;
  progress: number;
  department: string;
  planningDepartment: string;
  dimName: string;
  ownerId: string;
  owner: string;
  ownerName: string;
  dueDate: string;
  planFinishDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillTaskAssociation {
  taskId: string;
  sceneIds: string[];
  activityIds: string[];
  departments: string[];
  services: string[];
}

const TASK_STORAGE_KEY = 'skill-market-planning-tasks-v4';
const ASSOCIATION_STORAGE_KEY = 'skill-market-task-associations-v1';

const skillNames = [
  '接口契约检查 Skill',
  '知识库质量巡检 Skill',
  '发布风险摘要 Skill',
  '代码评审摘要 Skill',
  '测试用例评审 Skill',
  '日志异常定位 Skill',
  '会议纪要沉淀 Skill',
  'SQL 改写建议 Skill',
  '需求澄清助手 Skill',
  '稳定性日报 Skill',
  '变更影响分析 Skill',
  '缺陷根因归纳 Skill',
];

const departments = [
  '联调工具部',
  '质量产品部',
  '日志工具组',
  '项目管理部',
  '数据平台部',
  '研发效能部',
];

const planningDepartments = [
  '研发效能部',
  '质量工具组',
  '平台稳定部',
  '项目管理部',
  'DevOps部',
  '数据平台部',
];

const descriptions = [
  '自动检查输入信息与上下游约束，形成可执行的分析结果。',
  '汇总业务数据和历史记录，输出结构化建议与处理清单。',
  '识别关键风险、异常和依赖关系，辅助团队快速决策。',
  '沉淀可复用的流程能力，减少重复人工操作。',
];

const statusSeeds: Array<{
  idStatus: 'done' | 'inProgress';
  status: SkillTaskStatus;
  count: number;
  progress: number;
}> = [
  { idStatus: 'done', status: '已完成', count: 6, progress: 100 },
  { idStatus: 'inProgress', status: '进行中', count: 6, progress: 46 },
];

function createDefaultTasks(): SkillPlanningTask[] {
  let globalIndex = 0;
  return statusSeeds.flatMap(({ idStatus, status, count, progress }) =>
    Array.from({ length: count }, (_, index) => {
      const number = globalIndex++;
      const day = String(20 - (number % 12)).padStart(2, '0');
      const hour = String(18 - (number % 9)).padStart(2, '0');
      const updatedAt = '2026-07-' + day + 'T' + hour + ':20:00.000Z';
      return {
        id: 'skill-task-' + idStatus + '-' + String(index + 1).padStart(3, '0'),
        name: skillNames[number % skillNames.length] ?? '??? Skill',
        description: descriptions[number % descriptions.length] ?? '',
        priority: (['high', 'medium', 'low'] as SkillTaskPriority[])[number % 3] ?? 'medium',
        status,
        versions: [{ version: `0.0.${number + 1}`, uploadedAt: updatedAt }],
        filePath: '',
        progress:
          idStatus === 'inProgress' ? Math.min(85, progress + ((index * 7) % 38)) : progress,
        department: departments[number % departments.length] ?? '',
        planningDepartment: planningDepartments[number % planningDepartments.length] ?? '',
        dimName: planningDepartments[number % planningDepartments.length] ?? '',
        ownerId: 'w30000001',
        owner: '演示用户',
        ownerName: '演示用户',
        dueDate: '2026-08-' + String(10 + (number % 18)).padStart(2, '0'),
        planFinishDate: '2026-08-' + String(10 + (number % 18)).padStart(2, '0'),
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt,
      };
    }),
  );
}

const defaultTasks = createDefaultTasks();

const capabilityLabels: Record<PlanningTaskCapabilityType, 'Command' | 'Skill' | 'Agent'> = {
  command: 'Command',
  skill: 'Skill',
  agent: 'Agent',
};
const mockEmptyVersionTaskIds = new Set(['skill-task-done-002', 'skill-task-inProgress-001']);

export function planningTaskCapabilityLabel(
  capabilityType: PlanningTaskCapabilityType,
): 'Command' | 'Skill' | 'Agent' {
  return capabilityLabels[capabilityType];
}

function adaptMockPlanningTask(
  task: SkillPlanningTask,
  capabilityType: PlanningTaskCapabilityType,
): SkillPlanningTask {
  const adaptedTask =
    capabilityType === 'skill'
      ? cloneTask(task)
      : {
          ...task,
          id: task.id.replace(/^skill-task-/, `${capabilityType}-task-`),
          name: `${task.name.replace(/\s+Skill$/i, '')} ${planningTaskCapabilityLabel(capabilityType)}`,
        };
  return mockEmptyVersionTaskIds.has(task.id)
    ? { ...adaptedTask, versions: [] }
    : adaptedTask;
}

const defaultAssociations: SkillTaskAssociation[] = [
  {
    taskId: 'skill-task-inProgress-001',
    sceneIds: ['scene-api-dev', 'scene-contract'],
    activityIds: ['sub-activity-api', 'sub-activity-contract'],
    departments: ['联调工具部'],
    services: ['API 产品线'],
  },
];

let memoryTasks: SkillPlanningTask[] | null = null;
let memoryAssociations: SkillTaskAssociation[] | null = null;

function cloneTask(task: SkillPlanningTask): SkillPlanningTask {
  return { ...task, versions: task.versions.map((version) => ({ ...version })) };
}

function normalizeProgress(value: unknown, status: SkillTaskStatus): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(numeric)));
  if (status === 'done') return 100;
  if (status === 'inProgress') return 20;
  return 0;
}

function normalizeTask(task: SkillPlanningTask): SkillPlanningTask {
  const defaultTask = defaultTasks.find((item) => item.id === task.id);
  const taskRecord = asRecord(task);
  const hasVersions = Object.prototype.hasOwnProperty.call(taskRecord, 'versions');
  const versions = normalizePlanningTaskVersions(taskRecord.versions);
  const legacyVersion = readText(taskRecord.version);
  const normalizedVersions = hasVersions
    ? versions
    : normalizePlanningTaskVersions(
        legacyVersion
          ? [{ version: legacyVersion, uploadedAt: readText(taskRecord.updatedAt) }]
          : defaultTask?.versions,
      );
  const status = readText(task.status) || '未设置';
  return {
    ...task,
    status,
    versions: normalizedVersions,
    filePath: readText(task.filePath) || readText(defaultTask?.filePath),
    progress: normalizeProgress(task.progress, status),
    department: String(task.department || defaultTask?.department || '').trim(),
    planningDepartment: String(
      task.planningDepartment || defaultTask?.planningDepartment || task.department || '',
    ).trim(),
    dimName:
      readText(task.dimName) || readText(task.planningDepartment) || readText(defaultTask?.dimName),
    ownerId: String(task.ownerId || defaultTask?.ownerId || task.owner).trim(),
    ownerName: readText(task.ownerName) || readText(task.owner) || readText(defaultTask?.ownerName),
    planFinishDate:
      readText(task.planFinishDate) ||
      readText(task.dueDate) ||
      readText(defaultTask?.planFinishDate),
  };
}

function cloneAssociation(value: SkillTaskAssociation): SkillTaskAssociation {
  return {
    ...value,
    sceneIds: [...value.sceneIds],
    activityIds: [...value.activityIds],
    departments: [...value.departments],
    services: [...value.services],
  };
}

function readTasks(): SkillPlanningTask[] {
  if (memoryTasks) return memoryTasks;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(TASK_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as SkillPlanningTask[]) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryTasks = parsed.map(normalizeTask);
        return memoryTasks;
      }
    } catch {
      // Invalid local data falls back to the dashboard defaults.
    }
  }
  memoryTasks = defaultTasks.map(cloneTask);
  return memoryTasks;
}

function readAssociations(): SkillTaskAssociation[] {
  if (memoryAssociations) return memoryAssociations;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(ASSOCIATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SkillTaskAssociation[];
        if (Array.isArray(parsed)) {
          memoryAssociations = parsed;
          return memoryAssociations;
        }
      }
    } catch {
      // Invalid local data falls back to defaults.
    }
  }
  memoryAssociations = defaultAssociations.map(cloneAssociation);
  return memoryAssociations;
}

function persistTasks(tasks: SkillPlanningTask[]): void {
  memoryTasks = tasks;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function parseHttpJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (!text.startsWith('[') && !text.startsWith('{'))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function httpCollectionRows(value: unknown): unknown[] {
  const parsed = parseHttpJsonValue(value);
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  return (
    ['data', 'list', 'records', 'items', 'rows']
      .map((key) => parseHttpJsonValue(record[key]))
      .find((item): item is unknown[] => Array.isArray(item)) ?? []
  );
}

function compareTaskVersionsDescending(left: string, right: string): number {
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

function taskVersionTimestamp(value: string): number | null {
  const timestamp = Date.parse(value.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareTaskVersionEntriesDescending(
  left: SkillPlanningTaskVersion,
  right: SkillPlanningTaskVersion,
): number {
  const leftTimestamp = taskVersionTimestamp(left.uploadedAt);
  const rightTimestamp = taskVersionTimestamp(right.uploadedAt);
  if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }
  return compareTaskVersionsDescending(left.version, right.version);
}

function normalizePlanningTaskVersions(value: unknown): SkillPlanningTaskVersion[] {
  const entries = httpCollectionRows(value)
    .map((item) => {
      const record = asRecord(item);
      return {
        version: readText(record.version) || readText(item),
        uploadedAt: readText(record.uploadedAt),
        mrId: readText(record.mrId),
        repoUrl: readText(record.repoUrl),
        tagName: record.tagName == null ? null : readText(record.tagName),
      };
    })
    .filter((item) => Boolean(item.version))
    .sort(compareTaskVersionEntriesDescending);
  const seen = new Set<string>();
  return entries.filter((item) => {
    const key = item.version.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortedPlanningTaskVersions(
  task: Pick<SkillPlanningTask, 'versions'>,
): SkillPlanningTaskVersion[] {
  return normalizePlanningTaskVersions(task.versions);
}

export function latestPlanningTaskVersion(
  task: Pick<SkillPlanningTask, 'versions'>,
): SkillPlanningTaskVersion | null {
  return sortedPlanningTaskVersions(task)[0] ?? null;
}

function readDateTime(value: unknown): string {
  if (Array.isArray(value)) {
    const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = value.map(Number);
    const parts = [year, month, day, hour, minute, second];

    if (year > 0 && month > 0 && day > 0 && parts.every(Number.isFinite)) {
      const pad = (part: number) => String(part).padStart(2, '0');
      return (
        String(year).padStart(4, '0') +
        '-' +
        pad(month) +
        '-' +
        pad(day) +
        'T' +
        pad(hour) +
        ':' +
        pad(minute) +
        ':' +
        pad(second)
      );
    }
  }

  return readText(value);
}

function normalizeHttpTaskStatus(value: unknown): SkillTaskStatus {
  return readText(value) || '未设置';
}

function normalizeHttpTaskPriority(value: unknown): SkillTaskPriority {
  const priority = readText(value).toLowerCase();
  return priority === 'high' || priority === 'low' ? priority : 'medium';
}

function responseTaskRows(response: unknown): unknown[] {
  let current = parseHttpJsonValue(response);
  for (let depth = 0; depth < 4; depth += 1) {
    if (Array.isArray(current)) return current;
    const record = asRecord(current);
    const meta = asRecord(record.meta);
    if (meta.success === false) {
      throw new Error(readText(record.message ?? meta.message) || '待办任务加载失败');
    }

    const rows = httpCollectionRows(current);
    if (rows.length > 0 || Array.isArray(parseHttpJsonValue(record.data))) return rows;

    const next = parseHttpJsonValue(record.data);
    if (next === undefined || next === current) return [];
    current = next;
  }
  return [];
}

function normalizeHttpTask(
  value: unknown,
  index: number,
  capabilityType: PlanningTaskCapabilityType,
): SkillPlanningTask {
  const record = asRecord(value);
  const versionSource = record.versions ?? record.versionList ?? record.version_list;
  const versions = normalizePlanningTaskVersions(versionSource);
  const status = normalizeHttpTaskStatus(record.status);
  const numericProgress = Number(record.progress);
  const progress = normalizeProgress(
    Number.isFinite(numericProgress) ? numericProgress : undefined,
    status,
  );
  const capabilityLabel = planningTaskCapabilityLabel(capabilityType);
  const capabilityName =
    capabilityType === 'command'
      ? (record.commandName ?? record.command_name)
      : capabilityType === 'agent'
        ? (record.agentName ?? record.agent_name)
        : (record.skillName ?? record.skill_name);
  const name =
    readText(capabilityName ?? record.capabilityName ?? record.name) || `未命名 ${capabilityLabel}`;
  const dimName = readText(record.dimName);
  const ownerName = readText(record.ownerName);
  const planFinishDate = readText(record.planFinishDate);
  const department = readText(
    record.deptName ?? record.departmentName ?? record.department ?? record.deptCode,
  );
  const planningDepartment =
    dimName ||
    readText(
      record.planningDeptName ?? record.planningDepartment ?? record.deptName ?? record.deptCode,
    );
  const ownerId = readText(record.ownerId ?? record.userId ?? record.owner);
  const description =
    readText(
      record.commandDescription ??
        record.agentDescription ??
        record.skillDescription ??
        record.description,
    ) ||
    [
      readText(record.level),
      [readText(record.firstScene), readText(record.secondScene)].filter(Boolean).join(' / '),
      [readText(record.activityNodeName), readText(record.subActivityNodeName)]
        .filter(Boolean)
        .join(' / '),
    ]
      .filter(Boolean)
      .join(' · ');
  const updatedAt = readDateTime(record.updatedAt);
  const id =
    readText(record.taskId ?? record.id) ||
    [name, readText(record.deptCode), ownerId || index].filter(Boolean).join('::');

  return {
    id,
    name,
    description,
    priority: normalizeHttpTaskPriority(record.priority),
    status,
    versions,
    filePath: readText(record.filePath ?? record.path ?? record.fileName),
    progress,
    department,
    planningDepartment,
    dimName,
    ownerId,
    owner: ownerName || readText(record.userName ?? record.owner) || ownerId,
    ownerName,
    dueDate: planFinishDate || readText(record.dueDate ?? record.planedCompleteDate),
    planFinishDate,
    createdAt: readDateTime(record.createdAt),
    updatedAt,
  };
}

export function usesRemotePlanningTasks(): boolean {
  return import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
}

export function usesRemoteSkillPlanningTasks(): boolean {
  return usesRemotePlanningTasks();
}

export async function queryPlanningTasks(
  capabilityType: PlanningTaskCapabilityType,
  ownerId: string,
): Promise<SkillPlanningTask[]> {
  const normalizedOwnerId = ownerId.trim();
  if (!normalizedOwnerId) return [];
  if (!usesRemotePlanningTasks()) return listPlanningTasks(capabilityType, normalizedOwnerId);

  let response: unknown;
  if (capabilityType === 'command') {
    response = await skillBaseService.queryMyCommandPlanningTasks({
      userId: normalizedOwnerId,
    });
  } else if (capabilityType === 'agent') {
    response = await skillBaseService.queryMyAgentPlanningTasks({
      userId: normalizedOwnerId,
    });
  } else {
    response = await skillBaseService.queryMySkillPlanningTasks({
      userId: normalizedOwnerId,
    });
  }

  return responseTaskRows(response)
    .map((value, index) => normalizeHttpTask(value, index, capabilityType))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function querySkillPlanningTasks(ownerId: string): Promise<SkillPlanningTask[]> {
  return queryPlanningTasks('skill', ownerId);
}

export function listPlanningTasks(
  capabilityType: PlanningTaskCapabilityType,
  ownerId: string,
): SkillPlanningTask[] {
  return listSkillPlanningTasks(ownerId).map((task) => adaptMockPlanningTask(task, capabilityType));
}

export function listSkillPlanningTasks(ownerId: string): SkillPlanningTask[] {
  const normalizedOwnerId = ownerId.trim();
  if (!normalizedOwnerId) return [];
  return readTasks()
    .filter((task) => task.ownerId === normalizedOwnerId)
    .map(cloneTask)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function updateSkillTaskProgress(id: string, progress: number): SkillPlanningTask {
  const tasks = readTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('\u672a\u627e\u5230\u8be5\u5f85\u529e\u4efb\u52a1');
  if (task.status !== 'inProgress')
    throw new Error(
      '\u53ea\u6709\u5f00\u53d1\u4e2d\u7684\u4efb\u52a1\u53ef\u4ee5\u66f4\u65b0\u8fdb\u5ea6',
    );
  task.progress = Math.max(1, Math.min(99, Math.round(Number(progress))));
  task.updatedAt = new Date().toISOString();
  persistTasks(tasks);
  return cloneTask(task);
}

export function updateSkillTaskStatus(id: string, status: SkillTaskStatus): SkillPlanningTask {
  const tasks = readTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('未找到该待办任务');
  task.status = status;
  if (status === 'todo') task.progress = 0;
  if (status === 'inProgress') task.progress = Math.max(10, task.progress);
  if (status === 'done') task.progress = 100;
  task.updatedAt = new Date().toISOString();
  persistTasks(tasks);
  return cloneTask(task);
}

export function getSkillTaskAssociation(taskId: string): SkillTaskAssociation {
  const existing = readAssociations().find((item) => item.taskId === taskId);
  return existing
    ? cloneAssociation(existing)
    : { taskId, sceneIds: [], activityIds: [], departments: [], services: [] };
}

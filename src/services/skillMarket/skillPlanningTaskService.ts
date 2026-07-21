export type SkillTaskStatus = 'todo' | 'inProgress' | 'done';
type LegacySkillTaskStatus = SkillTaskStatus | 'published';
export type SkillTaskPriority = 'high' | 'medium' | 'low';

export interface SkillPlanningTask {
  id: string;
  name: string;
  description: string;
  priority: SkillTaskPriority;
  status: SkillTaskStatus;
  progress: number;
  department: string;
  planningDepartment: string;
  ownerId: string;
  owner: string;
  dueDate: string;
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

const TASK_STORAGE_KEY = 'skill-market-planning-tasks-v2';
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

const statusSeeds: Array<{ status: SkillTaskStatus; count: number; progress: number }> = [
  { status: 'todo', count: 5, progress: 0 },
  { status: 'inProgress', count: 21, progress: 46 },
  { status: 'done', count: 41, progress: 100 },
];

function createDefaultTasks(): SkillPlanningTask[] {
  let globalIndex = 0;
  return statusSeeds.flatMap(({ status, count, progress }) =>
    Array.from({ length: count }, (_, index) => {
      const number = globalIndex++;
      const day = String(20 - (number % 12)).padStart(2, '0');
      const hour = String(18 - (number % 9)).padStart(2, '0');
      return {
        id: 'skill-task-' + status + '-' + String(index + 1).padStart(3, '0'),
        name: skillNames[number % skillNames.length] ?? '??? Skill',
        description: descriptions[number % descriptions.length] ?? '',
        priority: (['high', 'medium', 'low'] as SkillTaskPriority[])[number % 3] ?? 'medium',
        status,
        progress: status === 'inProgress' ? Math.min(85, progress + ((index * 7) % 38)) : progress,
        department: departments[number % departments.length] ?? '',
        planningDepartment: planningDepartments[number % planningDepartments.length] ?? '',
        ownerId: 'mock001',
        owner: '演示用户',
        dueDate: '2026-08-' + String(10 + (number % 18)).padStart(2, '0'),
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt: '2026-07-' + day + 'T' + hour + ':20:00.000Z',
      };
    }),
  );
}

const defaultTasks = createDefaultTasks();

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
  return { ...task };
}

function normalizeProgress(value: unknown, status: SkillTaskStatus): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(numeric)));
  if (status === 'done') return 100;
  if (status === 'inProgress') return 20;
  return 0;
}

function normalizeTask(
  task: Omit<SkillPlanningTask, 'status'> & { status: LegacySkillTaskStatus },
): SkillPlanningTask {
  const defaultTask = defaultTasks.find((item) => item.id === task.id);
  const status: SkillTaskStatus = task.status === 'published' ? 'inProgress' : task.status;
  return {
    ...task,
    status,
    progress: normalizeProgress(task.progress, status),
    department: String(task.department || defaultTask?.department || '').trim(),
    planningDepartment: String(
      task.planningDepartment || defaultTask?.planningDepartment || task.department || '',
    ).trim(),
    ownerId: String(task.ownerId || defaultTask?.ownerId || task.owner).trim(),
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
      const parsed = raw
        ? (JSON.parse(raw) as Array<SkillPlanningTask & { status: LegacySkillTaskStatus }>)
        : [];
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

import type { SkillPlanningOptionGroup } from './skillPlanningShared';

export type ActivityStatus = 'enabled' | 'disabled';

export interface ActivityRecord {
  id: string;
  parentId: string | null;
  name: string;
  sort: number;
  status: ActivityStatus;
  skillCount: number;
}

export interface ActivityDeleteOptions {
  force?: boolean;
  migrateToId?: string;
}

const STORAGE_KEY = 'skill-market-activity-settings-v1';

const defaultActivities: ActivityRecord[] = [
  {
    id: 'activity-demand-dev',
    parentId: null,
    name: '需求研发',
    sort: 1,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-test',
    parentId: null,
    name: '测试验证',
    sort: 2,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-online-ops',
    parentId: null,
    name: '线上运营',
    sort: 3,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-review',
    parentId: null,
    name: '交付复盘',
    sort: 4,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-release',
    parentId: null,
    name: '版本发布',
    sort: 5,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-support',
    parentId: null,
    name: '服务支持',
    sort: 6,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-problem',
    parentId: null,
    name: '问题闭环',
    sort: 7,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-data-dev',
    parentId: null,
    name: '数据开发',
    sort: 8,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-demand-analysis',
    parentId: null,
    name: '需求分析',
    sort: 9,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-interaction',
    parentId: null,
    name: '交互设计',
    sort: 10,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-change',
    parentId: null,
    name: '变更评估',
    sort: 11,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-project',
    parentId: null,
    name: '项目推进',
    sort: 12,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'activity-client-release',
    parentId: null,
    name: '客户端发布',
    sort: 13,
    status: 'enabled',
    skillCount: 0,
  },

  {
    id: 'sub-activity-api',
    parentId: 'activity-demand-dev',
    name: '接口开发',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-merge-review',
    parentId: 'activity-demand-dev',
    name: '合并评审',
    sort: 2,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-case',
    parentId: 'activity-test',
    name: '用例生成',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-contract',
    parentId: 'activity-test',
    name: '契约校验',
    sort: 2,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-locate',
    parentId: 'activity-online-ops',
    name: '异常定位',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-daily',
    parentId: 'activity-online-ops',
    name: '日报生成',
    sort: 2,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-knowledge',
    parentId: 'activity-review',
    name: '知识入库',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-release-check',
    parentId: 'activity-release',
    name: '发布检查',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-triage',
    parentId: 'activity-support',
    name: '问题分流',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-root-cause',
    parentId: 'activity-problem',
    name: '根因分析',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-sql',
    parentId: 'activity-data-dev',
    name: 'SQL优化',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-boundary',
    parentId: 'activity-demand-analysis',
    name: '边界确认',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-consistency',
    parentId: 'activity-interaction',
    name: '一致性检查',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-impact',
    parentId: 'activity-change',
    name: '影响面识别',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-weekly',
    parentId: 'activity-project',
    name: '周报生成',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'sub-activity-data-check',
    parentId: 'activity-client-release',
    name: '数据验收',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
];

type DepartmentActivityStore = Record<string, ActivityRecord[]>;

const DEPARTMENT_STORAGE_KEY = 'skill-market-activity-settings-by-department-v2';
const DEFAULT_SCOPE = '__default__';

let memoryActivityStore: DepartmentActivityStore | null = null;

function cloneActivities(activities: ActivityRecord[]): ActivityRecord[] {
  return activities.map((activity) => ({ ...activity }));
}

function normalizeSort(activities: ActivityRecord[], parentId: string | null): void {
  activities
    .filter((activity) => activity.parentId === parentId)
    .sort((left, right) => left.sort - right.sort)
    .forEach((activity, index) => {
      activity.sort = index + 1;
    });
}

function scopeKey(departmentName = ''): string {
  return departmentName.trim() || DEFAULT_SCOPE;
}

function readActivityStore(): DepartmentActivityStore {
  if (memoryActivityStore) return memoryActivityStore;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as DepartmentActivityStore) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        memoryActivityStore = parsed;
        return memoryActivityStore;
      }

      const legacyRaw = window.localStorage.getItem(STORAGE_KEY);
      const legacy = legacyRaw ? (JSON.parse(legacyRaw) as ActivityRecord[]) : [];
      if (Array.isArray(legacy) && legacy.length > 0) {
        memoryActivityStore = { [DEFAULT_SCOPE]: cloneActivities(legacy) };
        return memoryActivityStore;
      }
    } catch {
      // Invalid local data falls back to the product defaults below.
    }
  }

  memoryActivityStore = { [DEFAULT_SCOPE]: cloneActivities(defaultActivities) };
  return memoryActivityStore;
}

function readActivities(departmentName = ''): ActivityRecord[] {
  const store = readActivityStore();
  const key = scopeKey(departmentName);
  if (!store[key]) store[key] = cloneActivities(defaultActivities);
  return store[key];
}

function persistActivities(activities: ActivityRecord[], departmentName = ''): void {
  const store = readActivityStore();
  store[scopeKey(departmentName)] = activities;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, JSON.stringify(store));
  }
}

function nextActivityId(): string {
  return 'activity-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

export function getDefaultActivityRecords(): ActivityRecord[] {
  return cloneActivities(defaultActivities);
}

export function listActivities(departmentName = ''): ActivityRecord[] {
  return cloneActivities(readActivities(departmentName)).sort((left, right) => {
    if (left.parentId === right.parentId) return left.sort - right.sort;
    if (left.parentId === null) return -1;
    if (right.parentId === null) return 1;
    return left.parentId.localeCompare(right.parentId);
  });
}

export function replaceActivitiesForDepartment(
  departmentName: string,
  records: ActivityRecord[],
): ActivityRecord[] {
  const next = cloneActivities(records).map((activity) => ({
    ...activity,
    name: activity.name.trim(),
    skillCount: Math.max(0, Number(activity.skillCount) || 0),
  }));
  if (next.some((activity) => !activity.id || !activity.name)) {
    throw new Error('活动名称不能为空');
  }

  const ids = new Set(next.map((activity) => activity.id));
  if (ids.size !== next.length) throw new Error('活动数据存在重复 ID');
  if (next.some((activity) => activity.parentId !== null && !ids.has(activity.parentId))) {
    throw new Error('归属子活动必须归属于有效的归属活动');
  }

  const names = new Set<string>();
  next.forEach((activity) => {
    const nameKey = (activity.parentId ?? 'root') + '::' + activity.name;
    if (names.has(nameKey)) throw new Error('同一层级下不能存在同名活动');
    names.add(nameKey);
  });

  normalizeSort(next, null);
  next
    .filter((activity) => activity.parentId === null)
    .forEach((activity) => normalizeSort(next, activity.id));
  persistActivities(next, departmentName);
  return listActivities(departmentName);
}

export function getActivityUsageCount(id: string, departmentName = ''): number {
  const activities = readActivities(departmentName);
  const activity = activities.find((item) => item.id === id);
  if (!activity) return 0;
  return (
    activity.skillCount +
    activities
      .filter((item) => item.parentId === activity.id)
      .reduce((sum, item) => sum + item.skillCount, 0)
  );
}

export function createActivity(
  input: { parentId: string | null; name: string; status: ActivityStatus },
  departmentName = '',
): ActivityRecord {
  const activities = readActivities(departmentName);
  const name = input.name.trim();
  if (!name) throw new Error('请输入活动名称');
  if (activities.some((item) => item.parentId === input.parentId && item.name === name)) {
    throw new Error('同一层级下已存在同名活动');
  }

  const activity: ActivityRecord = {
    id: nextActivityId(),
    parentId: input.parentId,
    name,
    status: input.status,
    sort: activities.filter((item) => item.parentId === input.parentId).length + 1,
    skillCount: 0,
  };
  activities.push(activity);
  persistActivities(activities, departmentName);
  return { ...activity };
}

export function updateActivity(
  id: string,
  patch: Partial<Pick<ActivityRecord, 'name' | 'status'>>,
  departmentName = '',
): ActivityRecord {
  const activities = readActivities(departmentName);
  const activity = activities.find((item) => item.id === id);
  if (!activity) throw new Error('未找到该活动');

  const name = patch.name?.trim();
  if (name !== undefined) {
    if (!name) throw new Error('请输入活动名称');
    if (
      activities.some(
        (item) => item.id !== id && item.parentId === activity.parentId && item.name === name,
      )
    ) {
      throw new Error('同一层级下已存在同名活动');
    }
    activity.name = name;
  }
  if (patch.status) activity.status = patch.status;
  persistActivities(activities, departmentName);
  return { ...activity };
}

export function moveActivity(id: string, direction: -1 | 1, departmentName = ''): void {
  const activities = readActivities(departmentName);
  const activity = activities.find((item) => item.id === id);
  if (!activity) return;
  const siblings = activities
    .filter((item) => item.parentId === activity.parentId)
    .sort((left, right) => left.sort - right.sort);
  const currentIndex = siblings.findIndex((item) => item.id === id);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
  [siblings[currentIndex].sort, siblings[targetIndex].sort] = [
    siblings[targetIndex].sort,
    siblings[currentIndex].sort,
  ];
  persistActivities(activities, departmentName);
}

export function reorderActivity(sourceId: string, targetId: string, departmentName = ''): void {
  const activities = readActivities(departmentName);
  const source = activities.find((item) => item.id === sourceId);
  const target = activities.find((item) => item.id === targetId);
  if (!source || !target || source.parentId !== target.parentId || source.id === target.id) return;
  const siblings = activities
    .filter((item) => item.parentId === source.parentId)
    .sort((left, right) => left.sort - right.sort);
  const fromIndex = siblings.findIndex((item) => item.id === sourceId);
  const toIndex = siblings.findIndex((item) => item.id === targetId);
  const [moved] = siblings.splice(fromIndex, 1);
  siblings.splice(toIndex, 0, moved);
  siblings.forEach((item, index) => {
    item.sort = index + 1;
  });
  persistActivities(activities, departmentName);
}

export function deleteActivity(
  id: string,
  options: ActivityDeleteOptions = {},
  departmentName = '',
): void {
  const activities = readActivities(departmentName);
  const activity = activities.find((item) => item.id === id);
  if (!activity) return;
  const usageCount = getActivityUsageCount(id, departmentName);
  if (usageCount > 0 && !options.force && !options.migrateToId) {
    throw new Error('当前活动已被 ' + usageCount + ' 个 Skill 使用，请选择迁移或强制删除');
  }

  const migrationTarget = options.migrateToId
    ? activities.find((item) => item.id === options.migrateToId)
    : undefined;
  if (options.migrateToId && !migrationTarget) throw new Error('请选择有效的迁移活动');

  if (activity.parentId === null) {
    const children = activities.filter((item) => item.parentId === activity.id);
    const mergedChildIds = new Set<string>();
    if (migrationTarget) {
      migrationTarget.skillCount += activity.skillCount;
      children.forEach((child) => {
        const duplicate = activities.find(
          (item) => item.parentId === migrationTarget.id && item.name === child.name,
        );
        if (duplicate) {
          duplicate.skillCount += child.skillCount;
          mergedChildIds.add(child.id);
        } else {
          child.parentId = migrationTarget.id;
          child.sort = activities.filter((item) => item.parentId === migrationTarget.id).length + 1;
        }
      });
    }
    const childIds = new Set(children.map((item) => item.id));
    const next = activities.filter(
      (item) =>
        item.id !== id && !mergedChildIds.has(item.id) && !(options.force && childIds.has(item.id)),
    );
    normalizeSort(next, null);
    if (migrationTarget) normalizeSort(next, migrationTarget.id);
    persistActivities(next, departmentName);
    return;
  }

  if (migrationTarget) migrationTarget.skillCount += activity.skillCount;
  const next = activities.filter((item) => item.id !== id);
  normalizeSort(next, activity.parentId);
  persistActivities(next, departmentName);
}

export function getActivityOptionGroups(departmentName = ''): SkillPlanningOptionGroup[] {
  const activities = readActivities(departmentName);
  return activities
    .filter((activity) => activity.parentId === null && activity.status === 'enabled')
    .sort((left, right) => left.sort - right.sort)
    .map((parent) => ({
      value: parent.name,
      children: activities
        .filter((activity) => activity.parentId === parent.id && activity.status === 'enabled')
        .sort((left, right) => left.sort - right.sort)
        .map((activity) => activity.name),
    }));
}

export function findActivityIdByNames(
  activityName: string,
  subActivityName: string,
  departmentName = '',
): string {
  const activities = readActivities(departmentName);
  const parent = activities.find(
    (activity) => activity.parentId === null && activity.name === activityName.trim(),
  );
  return (
    activities.find(
      (activity) => activity.parentId === parent?.id && activity.name === subActivityName.trim(),
    )?.id ?? ''
  );
}

export function getActivitySortRank(
  activityName: string,
  subActivityName: string,
  departmentName = '',
): number {
  const activities = readActivities(departmentName);
  const parent = activities.find(
    (activity) => activity.parentId === null && activity.name === activityName,
  );
  const child = activities.find(
    (activity) => activity.parentId === parent?.id && activity.name === subActivityName,
  );
  return (parent?.sort ?? 999) * 1000 + (child?.sort ?? 999);
}

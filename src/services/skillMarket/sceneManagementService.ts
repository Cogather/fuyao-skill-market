import type { SkillPlanningOptionGroup } from './skillPlanningShared';
import { notifyHarnessConfigurationChanged } from './harnessConfigurationSyncService';

export type SceneStatus = 'enabled' | 'disabled';

export interface SceneRecord {
  id: string;
  parentId: string | null;
  name: string;
  sort: number;
  status: SceneStatus;
  skillCount: number;
}

export interface SceneDeleteOptions {
  force?: boolean;
  migrateToId?: string;
}

const STORAGE_KEY = 'skill-market-scene-settings-v1';

const defaultScenes: SceneRecord[] = [
  { id: 'scene-rd', parentId: null, name: '研发提效', sort: 1, status: 'enabled', skillCount: 0 },
  {
    id: 'scene-quality',
    parentId: null,
    name: '质量保障',
    sort: 2,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-knowledge',
    parentId: null,
    name: '知识管理',
    sort: 3,
    status: 'enabled',
    skillCount: 0,
  },
  { id: 'scene-ops', parentId: null, name: '运维分析', sort: 4, status: 'enabled', skillCount: 0 },
  {
    id: 'scene-release',
    parentId: null,
    name: '发布运维',
    sort: 5,
    status: 'enabled',
    skillCount: 0,
  },
  { id: 'scene-data', parentId: null, name: '数据治理', sort: 6, status: 'enabled', skillCount: 0 },
  {
    id: 'scene-support',
    parentId: null,
    name: '用户支持',
    sort: 7,
    status: 'disabled',
    skillCount: 0,
  },
  {
    id: 'scene-ops-existing',
    parentId: null,
    name: '运营分析',
    sort: 8,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-requirement',
    parentId: null,
    name: '需求管理',
    sort: 9,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-experience',
    parentId: null,
    name: '体验设计',
    sort: 10,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-project',
    parentId: null,
    name: '项目管理',
    sort: 11,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-mobile',
    parentId: null,
    name: '移动研发',
    sort: 12,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-stability',
    parentId: null,
    name: '稳定性保障',
    sort: 13,
    status: 'enabled',
    skillCount: 0,
  },

  {
    id: 'scene-code-gen',
    parentId: 'scene-rd',
    name: '代码生成',
    sort: 1,
    status: 'enabled',
    skillCount: 5,
  },
  {
    id: 'scene-api-dev',
    parentId: 'scene-rd',
    name: '接口开发',
    sort: 2,
    status: 'enabled',
    skillCount: 3,
  },
  {
    id: 'scene-sql-opt',
    parentId: 'scene-rd',
    name: 'SQL优化',
    sort: 3,
    status: 'enabled',
    skillCount: 2,
  },
  {
    id: 'scene-unit-test',
    parentId: 'scene-rd',
    name: '单元测试',
    sort: 4,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-code-review',
    parentId: 'scene-rd',
    name: '代码审查',
    sort: 5,
    status: 'enabled',
    skillCount: 2,
  },

  {
    id: 'scene-test-design',
    parentId: 'scene-quality',
    name: '测试设计',
    sort: 1,
    status: 'enabled',
    skillCount: 4,
  },
  {
    id: 'scene-defect-review',
    parentId: 'scene-quality',
    name: '缺陷复盘',
    sort: 2,
    status: 'enabled',
    skillCount: 2,
  },
  {
    id: 'scene-contract',
    parentId: 'scene-quality',
    name: '接口契约',
    sort: 3,
    status: 'enabled',
    skillCount: 1,
  },

  {
    id: 'scene-doc',
    parentId: 'scene-knowledge',
    name: '文档沉淀',
    sort: 1,
    status: 'enabled',
    skillCount: 3,
  },
  {
    id: 'scene-search',
    parentId: 'scene-knowledge',
    name: '知识检索',
    sort: 2,
    status: 'enabled',
    skillCount: 2,
  },

  {
    id: 'scene-log',
    parentId: 'scene-ops',
    name: '日志洞察',
    sort: 1,
    status: 'enabled',
    skillCount: 4,
  },
  {
    id: 'scene-alert',
    parentId: 'scene-ops',
    name: '异常定位',
    sort: 2,
    status: 'enabled',
    skillCount: 3,
  },

  {
    id: 'scene-change',
    parentId: 'scene-release',
    name: '变更管控',
    sort: 1,
    status: 'enabled',
    skillCount: 2,
  },
  {
    id: 'scene-change-analysis',
    parentId: 'scene-release',
    name: '变更分析',
    sort: 2,
    status: 'enabled',
    skillCount: 2,
  },

  {
    id: 'scene-sql-governance',
    parentId: 'scene-data',
    name: 'SQL治理',
    sort: 1,
    status: 'enabled',
    skillCount: 3,
  },
  {
    id: 'scene-data-quality',
    parentId: 'scene-data',
    name: '数据质量',
    sort: 2,
    status: 'enabled',
    skillCount: 1,
  },

  {
    id: 'scene-qa',
    parentId: 'scene-support',
    name: '问答助手',
    sort: 1,
    status: 'disabled',
    skillCount: 1,
  },
  {
    id: 'scene-ops-existing-log',
    parentId: 'scene-ops-existing',
    name: '日志洞察',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-requirement-clarify',
    parentId: 'scene-requirement',
    name: '需求澄清',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-design-review',
    parentId: 'scene-experience',
    name: '设计走查',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-risk-track',
    parentId: 'scene-project',
    name: '风险跟踪',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-tracking-check',
    parentId: 'scene-mobile',
    name: '埋点验收',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
  {
    id: 'scene-inspection',
    parentId: 'scene-stability',
    name: '巡检报告',
    sort: 1,
    status: 'enabled',
    skillCount: 1,
  },
];

type DepartmentSceneStore = Record<string, SceneRecord[]>;

const DEPARTMENT_STORAGE_KEY = 'skill-market-scene-settings-by-department-v2';
const DEFAULT_SCOPE = '__default__';

let memorySceneStore: DepartmentSceneStore | null = null;

function cloneScenes(scenes: SceneRecord[]): SceneRecord[] {
  return scenes.map((scene) => ({ ...scene }));
}

function normalizeSort(scenes: SceneRecord[], parentId: string | null): void {
  scenes
    .filter((scene) => scene.parentId === parentId)
    .sort((left, right) => left.sort - right.sort)
    .forEach((scene, index) => {
      scene.sort = index + 1;
    });
}

function scopeKey(departmentName = ''): string {
  return departmentName.trim() || DEFAULT_SCOPE;
}

function readSceneStore(): DepartmentSceneStore {
  if (memorySceneStore) return memorySceneStore;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as DepartmentSceneStore) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        memorySceneStore = parsed;
        return memorySceneStore;
      }

      const legacyRaw = window.localStorage.getItem(STORAGE_KEY);
      const legacy = legacyRaw ? (JSON.parse(legacyRaw) as SceneRecord[]) : [];
      if (Array.isArray(legacy) && legacy.length > 0) {
        memorySceneStore = { [DEFAULT_SCOPE]: cloneScenes(legacy) };
        return memorySceneStore;
      }
    } catch {
      // Invalid local data falls back to the product defaults below.
    }
  }

  memorySceneStore = { [DEFAULT_SCOPE]: cloneScenes(defaultScenes) };
  return memorySceneStore;
}

function readScenes(departmentName = ''): SceneRecord[] {
  const store = readSceneStore();
  const key = scopeKey(departmentName);
  if (!store[key]) store[key] = cloneScenes(defaultScenes);
  return store[key];
}

function persistScenes(scenes: SceneRecord[], departmentName = ''): void {
  const store = readSceneStore();
  store[scopeKey(departmentName)] = scenes;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, JSON.stringify(store));
  }
  notifyHarnessConfigurationChanged('scene', departmentName);
}

function nextSceneId(): string {
  return 'scene-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

export function getDefaultSceneRecords(): SceneRecord[] {
  return cloneScenes(defaultScenes);
}

export function listScenes(departmentName = ''): SceneRecord[] {
  return cloneScenes(readScenes(departmentName)).sort((left, right) => {
    if (left.parentId === right.parentId) return left.sort - right.sort;
    if (left.parentId === null) return -1;
    if (right.parentId === null) return 1;
    return left.parentId.localeCompare(right.parentId);
  });
}

export function replaceScenesForDepartment(
  departmentName: string,
  records: SceneRecord[],
): SceneRecord[] {
  const next = cloneScenes(records).map((scene) => ({
    ...scene,
    name: scene.name.trim(),
    skillCount: Math.max(0, Number(scene.skillCount) || 0),
  }));
  if (next.some((scene) => !scene.id || !scene.name)) throw new Error('场景名称不能为空');

  const ids = new Set(next.map((scene) => scene.id));
  if (ids.size !== next.length) throw new Error('场景数据存在重复 ID');
  if (next.some((scene) => scene.parentId !== null && !ids.has(scene.parentId))) {
    throw new Error('二级场景必须归属于有效的一级场景');
  }

  const names = new Set<string>();
  next.forEach((scene) => {
    const nameKey = (scene.parentId ?? 'root') + '::' + scene.name;
    if (names.has(nameKey)) throw new Error('同一层级下不能存在同名场景');
    names.add(nameKey);
  });

  normalizeSort(next, null);
  next.filter((scene) => scene.parentId === null).forEach((scene) => normalizeSort(next, scene.id));
  persistScenes(next, departmentName);
  return listScenes(departmentName);
}

export function getSceneUsageCount(id: string, departmentName = ''): number {
  const scenes = readScenes(departmentName);
  const scene = scenes.find((item) => item.id === id);
  if (!scene) return 0;
  return (
    scene.skillCount +
    scenes
      .filter((item) => item.parentId === scene.id)
      .reduce((sum, item) => sum + item.skillCount, 0)
  );
}

export function createScene(
  input: { parentId: string | null; name: string; status: SceneStatus },
  departmentName = '',
): SceneRecord {
  const scenes = readScenes(departmentName);
  const name = input.name.trim();
  if (!name) throw new Error('请输入场景名称');
  if (scenes.some((item) => item.parentId === input.parentId && item.name === name)) {
    throw new Error('同一层级下已存在同名场景');
  }

  const scene: SceneRecord = {
    id: nextSceneId(),
    parentId: input.parentId,
    name,
    status: input.status,
    sort: scenes.filter((item) => item.parentId === input.parentId).length + 1,
    skillCount: 0,
  };
  scenes.push(scene);
  persistScenes(scenes, departmentName);
  return { ...scene };
}

export function updateScene(
  id: string,
  patch: Partial<Pick<SceneRecord, 'name' | 'status'>>,
  departmentName = '',
): SceneRecord {
  const scenes = readScenes(departmentName);
  const scene = scenes.find((item) => item.id === id);
  if (!scene) throw new Error('未找到该场景');

  const name = patch.name?.trim();
  if (name !== undefined) {
    if (!name) throw new Error('请输入场景名称');
    if (
      scenes.some(
        (item) => item.id !== id && item.parentId === scene.parentId && item.name === name,
      )
    ) {
      throw new Error('同一层级下已存在同名场景');
    }
    scene.name = name;
  }
  if (patch.status) scene.status = patch.status;
  persistScenes(scenes, departmentName);
  return { ...scene };
}

export function moveScene(id: string, direction: -1 | 1, departmentName = ''): void {
  const scenes = readScenes(departmentName);
  const scene = scenes.find((item) => item.id === id);
  if (!scene) return;
  const siblings = scenes
    .filter((item) => item.parentId === scene.parentId)
    .sort((left, right) => left.sort - right.sort);
  const currentIndex = siblings.findIndex((item) => item.id === id);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
  [siblings[currentIndex].sort, siblings[targetIndex].sort] = [
    siblings[targetIndex].sort,
    siblings[currentIndex].sort,
  ];
  persistScenes(scenes, departmentName);
}

export function reorderScene(sourceId: string, targetId: string, departmentName = ''): void {
  const scenes = readScenes(departmentName);
  const source = scenes.find((item) => item.id === sourceId);
  const target = scenes.find((item) => item.id === targetId);
  if (!source || !target || source.parentId !== target.parentId || source.id === target.id) return;
  const siblings = scenes
    .filter((item) => item.parentId === source.parentId)
    .sort((left, right) => left.sort - right.sort);
  const fromIndex = siblings.findIndex((item) => item.id === sourceId);
  const toIndex = siblings.findIndex((item) => item.id === targetId);
  const [moved] = siblings.splice(fromIndex, 1);
  siblings.splice(toIndex, 0, moved);
  siblings.forEach((item, index) => {
    item.sort = index + 1;
  });
  persistScenes(scenes, departmentName);
}

export function deleteScene(
  id: string,
  options: SceneDeleteOptions = {},
  departmentName = '',
): void {
  const scenes = readScenes(departmentName);
  const scene = scenes.find((item) => item.id === id);
  if (!scene) return;
  const usageCount = getSceneUsageCount(id, departmentName);
  if (usageCount > 0 && !options.force && !options.migrateToId) {
    throw new Error('当前场景已被 ' + usageCount + ' 个规划项使用，请选择迁移或强制删除');
  }

  const migrationTarget = options.migrateToId
    ? scenes.find((item) => item.id === options.migrateToId)
    : undefined;
  if (options.migrateToId && !migrationTarget) throw new Error('请选择有效的迁移场景');

  if (scene.parentId === null) {
    const children = scenes.filter((item) => item.parentId === scene.id);
    const mergedChildIds = new Set<string>();
    if (migrationTarget) {
      migrationTarget.skillCount += scene.skillCount;
      children.forEach((child) => {
        const duplicate = scenes.find(
          (item) => item.parentId === migrationTarget.id && item.name === child.name,
        );
        if (duplicate) {
          duplicate.skillCount += child.skillCount;
          mergedChildIds.add(child.id);
        } else {
          child.parentId = migrationTarget.id;
          child.sort = scenes.filter((item) => item.parentId === migrationTarget.id).length + 1;
        }
      });
    }
    const childIds = new Set(children.map((item) => item.id));
    const next = scenes.filter(
      (item) =>
        item.id !== id && !mergedChildIds.has(item.id) && !(options.force && childIds.has(item.id)),
    );
    normalizeSort(next, null);
    if (migrationTarget) normalizeSort(next, migrationTarget.id);
    persistScenes(next, departmentName);
    return;
  }

  if (migrationTarget) migrationTarget.skillCount += scene.skillCount;
  const next = scenes.filter((item) => item.id !== id);
  normalizeSort(next, scene.parentId);
  persistScenes(next, departmentName);
}

export function getSceneOptionGroups(departmentName = ''): SkillPlanningOptionGroup[] {
  const scenes = readScenes(departmentName);
  return scenes
    .filter((scene) => scene.parentId === null && scene.status === 'enabled')
    .sort((left, right) => left.sort - right.sort)
    .map((parent) => ({
      value: parent.name,
      children: scenes
        .filter((scene) => scene.parentId === parent.id && scene.status === 'enabled')
        .sort((left, right) => left.sort - right.sort)
        .map((scene) => scene.name),
    }));
}

export function findSceneIdByNames(
  firstScene: string,
  secondScene: string,
  departmentName = '',
): string {
  const scenes = readScenes(departmentName);
  const parent = scenes.find(
    (scene) => scene.parentId === null && scene.name === firstScene.trim(),
  );
  return (
    scenes.find((scene) => scene.parentId === parent?.id && scene.name === secondScene.trim())
      ?.id ?? ''
  );
}

export function getSceneSortRank(
  firstScene: string,
  secondScene: string,
  departmentName = '',
): number {
  const scenes = readScenes(departmentName);
  const parent = scenes.find((scene) => scene.parentId === null && scene.name === firstScene);
  const child = scenes.find((scene) => scene.parentId === parent?.id && scene.name === secondScene);
  return (parent?.sort ?? 999) * 1000 + (child?.sort ?? 999);
}

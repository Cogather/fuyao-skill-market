import { notifyHarnessConfigurationChanged } from './harnessConfigurationSyncService';
import { skillBaseService } from './skillBaseService';

/**
 * 场景标签服务：
 * - `listSceneTags` 提供弹框可被选择的标签列表（mock 使用内置清单，http 调用后端接口）。
 * - `getSceneTags` / `saveSceneTags` 负责一级场景与标签的绑定读写。
 *
 * 标签绑定以「部门::场景标识」为键独立存储，避免与场景树的编辑/保存流程相互影响。
 * 场景标识：mock 使用稳定的场景 id；http 使用一级场景名称（firstScene）。
 */

export interface SceneTag {
  id: string;
  name: string;
}

export interface SceneTagDimContext {
  userId: string;
  dimType: string;
  dimCode: string;
  dimName: string;
}

const TAG_STORAGE_KEY = 'skill-market-scene-tags-v1';
const DEFAULT_SCOPE = '__default__';

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';

const defaultSceneTags: SceneTag[] = [
  { id: 'tag-ai', name: 'AI 提效' },
  { id: 'tag-rd', name: '研发效能' },
  { id: 'tag-qa', name: '质量保障' },
  { id: 'tag-ops', name: '运维监控' },
  { id: 'tag-data', name: '数据分析' },
  { id: 'tag-doc', name: '知识文档' },
  { id: 'tag-design', name: '体验设计' },
  { id: 'tag-project', name: '项目管理' },
  { id: 'tag-security', name: '安全合规' },
  { id: 'tag-test', name: '测试工具' },
  { id: 'tag-code', name: '代码生成与重构辅助' },
  { id: 'tag-review', name: '代码审查与缺陷复盘' },
  { id: 'tag-llm', name: '大模型应用与 Prompt 工程' },
  { id: 'tag-pipeline', name: '持续集成与持续交付流水线' },
  { id: 'tag-platform', name: '平台工程与开发者体验优化' },
  { id: 'tag-cost', name: '成本治理与资源利用率优化' },
  { id: 'tag-reliability', name: '稳定性保障与故障应急响应' },
  { id: 'tag-data-gov', name: '数据治理与数据质量管理' },
  { id: 'tag-arch', name: '架构设计与技术方案评审' },
  { id: 'tag-require', name: '需求澄清与项目管理协同' },
  { id: 'tag-e2e', name: '端到端测试与质量度量' },
  { id: 'tag-doc-know', name: '技术文档沉淀与知识库建设' },
  {
    id: 'tag-long-1',
    name: '覆盖研发全流程的质量保障与安全合规长效治理标签',
  },
  {
    id: 'tag-long-2',
    name: '面向多团队协同的跨部门流程打通与度量指标体系建设的超长标签示例',
  },
];

/**
 * 演示用：mock 模式下，未显式保存过绑定的内置场景返回的示例标签。
 * 用于验证「一级场景绑定了很多/超长标签」时的展示效果；用户保存过后以保存值为准。
 */
const demoSceneTagsBySceneId: Record<string, string[]> = {
  'scene-rd': [
    'AI 提效',
    '研发效能',
    '代码生成与重构辅助',
    '代码审查与缺陷复盘',
    '大模型应用与 Prompt 工程',
    '持续集成与持续交付流水线',
    '平台工程与开发者体验优化',
    '稳定性保障与故障应急响应',
    '架构设计与技术方案评审',
    '覆盖研发全流程的质量保障与安全合规长效治理标签',
    '面向多团队协同的跨部门流程打通与度量指标体系建设的超长标签示例',
  ],
  'scene-quality': [
    '质量保障',
    '端到端测试与质量度量',
    '覆盖研发全流程的质量保障与安全合规长效治理标签',
  ],
};

type SceneTagStore = Record<string, string[]>;

let memoryTagStore: SceneTagStore | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function responseRows(response: unknown): unknown[] {
  const record = asRecord(response);
  const data = record.data ?? response;
  const dataRecord = asRecord(data);
  return Array.isArray(data)
    ? data
    : (['list', 'records', 'items', 'rows']
        .map((key) => dataRecord[key])
        .find((value): value is unknown[] => Array.isArray(value)) ?? []);
}

function normalizeSceneTags(response: unknown): SceneTag[] {
  const tags = responseRows(response).flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      const name = readText(item);
      return name ? [{ id: name, name }] : [];
    }
    const record = asRecord(item);
    const name = readText(record.tagName ?? record.name ?? record.label ?? record.tag);
    if (!name) return [];
    const id = readText(record.tagId ?? record.id ?? record.code ?? record.value) || name;
    return [{ id, name }];
  });
  return Array.from(new Map(tags.map((tag) => [tag.name, tag])).values());
}

function readTagStore(): SceneTagStore {
  if (memoryTagStore) return memoryTagStore;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(TAG_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as SceneTagStore) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        memoryTagStore = parsed;
        return memoryTagStore;
      }
    } catch {
      // Invalid local data falls back to an empty store.
    }
  }

  memoryTagStore = {};
  return memoryTagStore;
}

function persistTagStore(store: SceneTagStore): void {
  memoryTagStore = store;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(store));
  }
}

function bindingKey(sceneKey: string, departmentName: string): string {
  return `${departmentName.trim() || DEFAULT_SCOPE}::${sceneKey}`;
}

/** 弹框可选标签列表（mock / http 双实现）。 */
export async function listSceneTags(): Promise<SceneTag[]> {
  if (!transportIsHttp) {
    return defaultSceneTags.map((tag) => ({ ...tag }));
  }

  const response = await skillBaseService.querySceneTags({});
  return normalizeSceneTags(response);
}

/** 读取某个一级场景当前绑定的标签名列表。 */
export async function getSceneTags(sceneKey: string, departmentName = ''): Promise<string[]> {
  if (!transportIsHttp) {
    const stored = readTagStore()[bindingKey(sceneKey, departmentName)];
    if (stored) return [...stored];
    const demo = demoSceneTagsBySceneId[sceneKey];
    return demo ? [...demo] : [];
  }

  try {
    const response = await skillBaseService.querySceneTags({
      firstScene: sceneKey,
      dimName: departmentName,
    });
    return normalizeSceneTags(response).map((tag) => tag.name);
  } catch {
    // 后端标签接口未就绪时按无标签处理，避免阻塞场景配置展示。
    return [];
  }
}

/** 保存某个一级场景绑定的标签名列表；失败时抛错以便上层提示。 */
export async function saveSceneTags(
  sceneKey: string,
  tags: string[],
  departmentName = '',
  dimContext?: SceneTagDimContext,
): Promise<string[]> {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  if (!transportIsHttp) {
    const store = readTagStore();
    store[bindingKey(sceneKey, departmentName)] = normalized;
    persistTagStore(store);
    notifyHarnessConfigurationChanged('scene', departmentName);
    return [...normalized];
  }

  const response = await skillBaseService.saveSceneTags({
    ...(dimContext ?? {}),
    firstScene: sceneKey,
    tags: normalized,
  });
  return normalizeSceneTags(response).map((tag) => tag.name);
}

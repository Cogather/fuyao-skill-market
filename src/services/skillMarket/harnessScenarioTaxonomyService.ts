import { listActivities } from './activityManagementService';
import { notifyHarnessConfigurationChanged } from './harnessConfigurationSyncService';
import { listScenes, replaceScenesForDepartment, type SceneRecord } from './sceneManagementService';
import { getSceneTags, listSceneTags, saveSceneTags, type SceneTag } from './sceneTagService';
import { skillBaseService, type RefreshTaxonomyItem } from './skillBaseService';
import { httpDimContext } from './skillPlanningService';

export type TaxonomyRecord = SceneRecord & { tags?: string[] };
export type { SceneTag } from './sceneTagService';

export interface TaxonomyScope {
  departmentName: string;
  deptCode: string;
  userId: string;
  offeringId: string;
  offeringName: string;
}

type TaxonomyKind = 'scene' | 'activity';

interface NormalizedTaxonomyRow {
  primary: string;
  secondary: string;
  primaryServerId: string;
  secondaryServerId: string;
  tags: string[];
  sort: number;
  referenceCount: number;
  sourceIndex: number;
}

interface TaxonomyIdentityScope {
  primary: Record<string, string>;
  secondary: Record<string, string>;
}

type TaxonomyIdentityStore = Record<string, TaxonomyIdentityScope>;

const HTTP_IDENTITY_STORAGE_KEY = 'skill-market-harness-taxonomy-identities-v1';
const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';

let memoryIdentityStore: TaxonomyIdentityStore | null = null;
const loadedScenarioRecords = new Map<string, TaxonomyRecord[]>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readText(record[key]);
    if (value) return value;
  }
  return '';
}

function normalizeTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item === 'string' || typeof item === 'number') return readText(item);
          return firstText(asRecord(item), ['tagName', 'name', 'label', 'tag']);
        })
        .filter(Boolean),
    ),
  ];
}

function assertSuccessfulEnvelope(response: unknown, fallbackMessage: string): unknown {
  const envelope = asRecord(response);
  const meta = asRecord(envelope.meta);
  if (meta.success !== true) {
    throw new Error(readText(meta.message) || fallbackMessage);
  }
  return envelope.data;
}

function envelopeRows(response: unknown, fallbackMessage: string): unknown[] {
  const data = assertSuccessfulEnvelope(response, fallbackMessage);
  if (Array.isArray(data)) return data;
  const dataRecord = asRecord(data);
  return (
    ['list', 'records', 'items', 'rows']
      .map((key) => dataRecord[key])
      .find((value): value is unknown[] => Array.isArray(value)) ?? []
  );
}

function toHttpDimContext(scope: TaxonomyScope): {
  userId: string;
  dimType: string;
  dimCode: string;
  dimName: string;
} {
  const departmentName = scope.departmentName.trim();
  const deptCode = scope.deptCode.trim();
  const offeringId = scope.offeringId.trim();
  const offeringName = scope.offeringName.trim();
  const hasProductScope = Boolean(offeringId || offeringName);

  return httpDimContext(
    departmentName,
    scope.userId.trim(),
    {
      level: hasProductScope ? '产品级' : '部门级',
      offeringId,
      offeringName,
    },
    [{ name: departmentName, deptCode }],
  );
}

function readIdentityStore(): TaxonomyIdentityStore {
  if (memoryIdentityStore) return memoryIdentityStore;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(HTTP_IDENTITY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        memoryIdentityStore = parsed as TaxonomyIdentityStore;
        return memoryIdentityStore;
      }
    } catch {
      // Invalid or unavailable browser storage falls back to this module's memory store.
    }
  }
  memoryIdentityStore = {};
  return memoryIdentityStore;
}

function persistIdentityStore(): void {
  if (typeof window === 'undefined' || !memoryIdentityStore) return;
  try {
    window.localStorage.setItem(HTTP_IDENTITY_STORAGE_KEY, JSON.stringify(memoryIdentityStore));
  } catch {
    // Taxonomy data remains usable when browser storage is unavailable.
  }
}

function identityScopeKey(kind: TaxonomyKind, scope: TaxonomyScope): string {
  const context = toHttpDimContext(scope);
  return JSON.stringify([kind, context.dimType, context.dimCode, context.dimName]);
}

function scenarioCacheKey(scope: TaxonomyScope): string {
  if (!transportIsHttp) return JSON.stringify(['mock', scope.departmentName.trim()]);
  return JSON.stringify([
    'http',
    scope.departmentName.trim(),
    scope.deptCode.trim(),
    scope.offeringId.trim(),
    scope.offeringName.trim(),
  ]);
}

function cloneRecords(records: TaxonomyRecord[]): TaxonomyRecord[] {
  return records.map((record) => ({
    ...record,
    ...(record.tags ? { tags: [...record.tags] } : {}),
  }));
}

function rememberScenarioRecords(scope: TaxonomyScope, records: TaxonomyRecord[]): void {
  loadedScenarioRecords.set(scenarioCacheKey(scope), cloneRecords(records));
}

function validateScenarioRecords(scope: TaxonomyScope, records: TaxonomyRecord[]): void {
  if (records.some((record) => !record.id.trim() || !record.name.trim())) {
    throw new Error('场景名称不能为空');
  }

  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length) throw new Error('场景数据存在重复 ID');

  const siblingNames = new Set<string>();
  records.forEach((record) => {
    if (record.parentId !== null) {
      const parent = byId.get(record.parentId);
      if (!parent || parent.parentId !== null) {
        throw new Error('场景配置最多支持一级场景和二级场景');
      }
    }
    const siblingKey = JSON.stringify([record.parentId, record.name.trim()]);
    if (siblingNames.has(siblingKey)) throw new Error('同一层级下不能存在同名场景');
    siblingNames.add(siblingKey);
  });

  const previous = loadedScenarioRecords.get(scenarioCacheKey(scope));
  if (!previous) return;
  const nextById = new Map(records.map((record) => [record.id, record]));
  const referencedMutation = previous.find((record) => {
    const next = nextById.get(record.id);
    const usageCount =
      record.skillCount +
      (record.parentId === null
        ? previous
            .filter((candidate) => candidate.parentId === record.id)
            .reduce((sum, candidate) => sum + candidate.skillCount, 0)
        : 0);
    return (
      usageCount > 0 &&
      next &&
      (next.name.trim() !== record.name.trim() || next.parentId !== record.parentId)
    );
  });
  if (referencedMutation) {
    throw new Error(`“${referencedMutation.name}”已被引用，不能编辑`);
  }
  const nextIds = new Set(records.map((record) => record.id));
  const referencedDeletion = previous.find(
    (record) => !nextIds.has(record.id) && record.skillCount > 0,
  );
  if (referencedDeletion) {
    throw new Error(`“${referencedDeletion.name}”已被引用，不能删除`);
  }
}

function identityScope(kind: TaxonomyKind, scope: TaxonomyScope): TaxonomyIdentityScope {
  const store = readIdentityStore();
  const key = identityScopeKey(kind, scope);
  const current = store[key];
  if (current && current.primary && current.secondary) return current;
  const created = { primary: {}, secondary: {} };
  store[key] = created;
  return created;
}

function encodedIdentityPart(value: string): string {
  return encodeURIComponent(value.normalize('NFC'));
}

function derivedPrimaryId(kind: TaxonomyKind, primary: string): string {
  return `http-${kind}-primary:${encodedIdentityPart(primary)}`;
}

function derivedSecondaryId(kind: TaxonomyKind, primaryId: string, secondary: string): string {
  return `http-${kind}-secondary:${encodedIdentityPart(primaryId)}:${encodedIdentityPart(secondary)}`;
}

function serverRecordId(kind: TaxonomyKind, level: 'primary' | 'secondary', value: string): string {
  return value ? `http-${kind}-${level}-server:${encodedIdentityPart(value)}` : '';
}

function secondaryIdentityKey(parentId: string, secondary: string): string {
  return JSON.stringify([parentId, secondary.normalize('NFC')]);
}

function normalizeHttpRows(
  response: unknown,
  kind: TaxonomyKind,
  fallbackMessage: string,
): NormalizedTaxonomyRow[] {
  const primaryKey = kind === 'scene' ? 'firstScene' : 'activityNodeName';
  const secondaryKey = kind === 'scene' ? 'secondScene' : 'subActivityNodeName';
  const primaryIdKeys =
    kind === 'scene'
      ? ['firstSceneId', 'firstSceneCode', 'primarySceneId', 'primarySceneCode', 'primaryId']
      : ['activityNodeId', 'activityNodeCode', 'primaryActivityId', 'primaryId'];
  const secondaryIdKeys =
    kind === 'scene'
      ? [
          'secondSceneId',
          'secondSceneCode',
          'secondarySceneId',
          'secondarySceneCode',
          'secondaryId',
        ]
      : ['subActivityNodeId', 'subActivityNodeCode', 'secondaryActivityId', 'secondaryId'];

  return envelopeRows(response, fallbackMessage).flatMap((item, sourceIndex) => {
    const record = asRecord(item);
    const primary = readText(record[primaryKey]);
    if (!primary) return [];
    const secondary = readText(record[secondaryKey]);
    const parsedSort = Number(record.sort);
    const parsedReferenceCount = Number(record.referenceCount);
    return [
      {
        primary,
        secondary,
        primaryServerId: firstText(record, primaryIdKeys),
        secondaryServerId: firstText(record, secondaryIdKeys),
        tags: kind === 'scene' ? normalizeTagNames(record.tags) : [],
        sort: Number.isFinite(parsedSort) ? parsedSort : sourceIndex + 1,
        referenceCount:
          Number.isFinite(parsedReferenceCount) && parsedReferenceCount > 0
            ? parsedReferenceCount
            : 0,
        sourceIndex,
      },
    ];
  });
}

function mapHttpRowsToRecords(
  rows: NormalizedTaxonomyRow[],
  kind: TaxonomyKind,
  scope: TaxonomyScope,
): TaxonomyRecord[] {
  const identities = identityScope(kind, scope);
  const groups = new Map<string, NormalizedTaxonomyRow[]>();
  rows.forEach((row) => {
    const group = groups.get(row.primary) ?? [];
    group.push(row);
    groups.set(row.primary, group);
  });

  const orderedGroups = [...groups.entries()].sort((left, right) => {
    const leftFirst = [...left[1]].sort(
      (a, b) => a.sort - b.sort || a.sourceIndex - b.sourceIndex,
    )[0]!;
    const rightFirst = [...right[1]].sort(
      (a, b) => a.sort - b.sort || a.sourceIndex - b.sourceIndex,
    )[0]!;
    return leftFirst.sort - rightFirst.sort || leftFirst.sourceIndex - rightFirst.sourceIndex;
  });

  const records: TaxonomyRecord[] = [];
  orderedGroups.forEach(([primary, groupRows], primaryIndex) => {
    const primaryServerId = groupRows.map((row) => row.primaryServerId).find(Boolean) ?? '';
    const parentId =
      identities.primary[primary] ||
      serverRecordId(kind, 'primary', primaryServerId) ||
      derivedPrimaryId(kind, primary);
    identities.primary[primary] = parentId;

    records.push({
      id: parentId,
      parentId: null,
      name: primary,
      tags: [...new Set(groupRows.flatMap((row) => row.tags))],
      sort: primaryIndex + 1,
      status: 'enabled',
      skillCount: groupRows.reduce((sum, row) => sum + (row.secondary ? 0 : row.referenceCount), 0),
    });

    const seenChildren = new Set<string>();
    groupRows
      .sort((left, right) => left.sort - right.sort || left.sourceIndex - right.sourceIndex)
      .forEach((row) => {
        if (!row.secondary || seenChildren.has(row.secondary)) return;
        seenChildren.add(row.secondary);
        const identityKey = secondaryIdentityKey(parentId, row.secondary);
        const childId =
          identities.secondary[identityKey] ||
          serverRecordId(kind, 'secondary', row.secondaryServerId) ||
          derivedSecondaryId(kind, parentId, row.secondary);
        identities.secondary[identityKey] = childId;
        records.push({
          id: childId,
          parentId,
          name: row.secondary,
          sort: seenChildren.size,
          status: 'enabled',
          skillCount: row.referenceCount,
        });
      });
  });

  persistIdentityStore();
  return records;
}

function commitIdentityRecords(
  kind: TaxonomyKind,
  scope: TaxonomyScope,
  records: TaxonomyRecord[],
): void {
  const next: TaxonomyIdentityScope = { primary: {}, secondary: {} };
  records
    .filter((record) => record.parentId === null)
    .forEach((record) => {
      next.primary[record.name.trim()] = record.id;
    });
  records
    .filter((record) => record.parentId !== null)
    .forEach((record) => {
      next.secondary[secondaryIdentityKey(record.parentId ?? '', record.name.trim())] = record.id;
    });

  const store = readIdentityStore();
  store[identityScopeKey(kind, scope)] = next;
  persistIdentityStore();
}

function toSceneItems(records: TaxonomyRecord[]): RefreshTaxonomyItem[] {
  const rows: RefreshTaxonomyItem[] = [];
  let sort = 0;
  records
    .filter((record) => record.parentId === null)
    .sort((left, right) => left.sort - right.sort)
    .forEach((parent) => {
      const children = records
        .filter((record) => record.parentId === parent.id)
        .sort((left, right) => left.sort - right.sort);
      (children.length ? children : [null]).forEach((child) => {
        rows.push({
          firstScene: parent.name.trim(),
          secondScene: child?.name.trim() ?? '',
          sort: sort++,
        });
      });
    });
  return rows;
}

async function loadHttpTaxonomyRecords(
  kind: TaxonomyKind,
  scope: TaxonomyScope,
): Promise<TaxonomyRecord[]> {
  const context = toHttpDimContext(scope);
  const response =
    kind === 'scene'
      ? await skillBaseService.getSceneOptionGroups(context)
      : await skillBaseService.getActivityOptionGroups(context);
  const fallbackMessage = kind === 'scene' ? '场景列表加载失败' : '活动列表加载失败';
  return mapHttpRowsToRecords(normalizeHttpRows(response, kind, fallbackMessage), kind, scope);
}

async function withMockSceneTags(
  scope: TaxonomyScope,
  records: TaxonomyRecord[],
): Promise<TaxonomyRecord[]> {
  const tagsById = new Map(
    await Promise.all(
      records
        .filter((record) => record.parentId === null)
        .map(
          async (record) =>
            [record.id, await getSceneTags(record.id, scope.departmentName)] as const,
        ),
    ),
  );
  return records.map((record) =>
    record.parentId === null ? { ...record, tags: tagsById.get(record.id) ?? [] } : record,
  );
}

export async function loadScenarioRecords(scope: TaxonomyScope): Promise<TaxonomyRecord[]> {
  const records = !transportIsHttp
    ? await withMockSceneTags(scope, listScenes(scope.departmentName))
    : await loadHttpTaxonomyRecords('scene', scope);
  rememberScenarioRecords(scope, records);
  return records;
}

export async function saveScenarioRecords(
  scope: TaxonomyScope,
  records: TaxonomyRecord[],
): Promise<TaxonomyRecord[]> {
  validateScenarioRecords(scope, records);
  if (!transportIsHttp) {
    const nextIds = new Set(records.map((record) => record.id));
    const deletedRootIds = (loadedScenarioRecords.get(scenarioCacheKey(scope)) ?? [])
      .filter((record) => record.parentId === null && !nextIds.has(record.id))
      .map((record) => record.id);
    const canonicalRecords: SceneRecord[] = records.map((record) => ({
      id: record.id,
      parentId: record.parentId,
      name: record.name,
      sort: record.sort,
      status: record.status,
      skillCount: record.skillCount,
    }));
    const replacedRecords = replaceScenesForDepartment(scope.departmentName, canonicalRecords);
    await Promise.all(
      deletedRootIds.map((sceneId) => saveSceneTags(sceneId, [], scope.departmentName)),
    );
    const savedRecords = await withMockSceneTags(scope, replacedRecords);
    rememberScenarioRecords(scope, savedRecords);
    return savedRecords;
  }

  const response = await skillBaseService.refreshSceneOptionGroups(
    { scenes: toSceneItems(records) },
    toHttpDimContext(scope),
  );
  assertSuccessfulEnvelope(response, '场景配置保存失败');

  // The write is already committed when the refresh endpoint succeeds, so a failed readback
  // must not roll back the identity aliases needed to reconnect existing workflows.
  commitIdentityRecords('scene', scope, records);
  try {
    const savedRecords = await loadHttpTaxonomyRecords('scene', scope);
    rememberScenarioRecords(scope, savedRecords);
    notifyHarnessConfigurationChanged('scene', scope.departmentName);
    return savedRecords;
  } catch (error) {
    notifyHarnessConfigurationChanged('scene', scope.departmentName);
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`场景已保存，但刷新最新配置失败：${message}`);
  }
}

export async function listScenarioTags(): Promise<SceneTag[]> {
  return listSceneTags();
}

export async function saveScenarioTagBindings(
  scope: TaxonomyScope,
  record: TaxonomyRecord,
  tags: string[],
): Promise<string[]> {
  if (record.parentId !== null) throw new Error('标签只能绑定到一级场景');
  const sceneKey = transportIsHttp ? record.name.trim() : record.id;
  if (!sceneKey) throw new Error('请选择有效的一级场景');
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  if (!transportIsHttp) {
    const savedTags = await saveSceneTags(sceneKey, normalizedTags, scope.departmentName);
    const remembered = loadedScenarioRecords.get(scenarioCacheKey(scope));
    const target = remembered?.find((item) => item.id === record.id);
    if (target) target.tags = [...savedTags];
    return savedTags;
  }

  const { dimName: _dimName, ...context } = toHttpDimContext(scope);
  const response = await skillBaseService.saveSceneTags(
    { bindings: [{ firstScene: sceneKey, tags: normalizedTags }] },
    context,
  );
  assertSuccessfulEnvelope(response, '场景标签保存失败');
  const remembered = loadedScenarioRecords.get(scenarioCacheKey(scope));
  const target = remembered?.find((item) => item.id === record.id);
  if (target) target.tags = [...normalizedTags];
  notifyHarnessConfigurationChanged('scene', scope.departmentName);
  return normalizedTags;
}

export async function loadLegacyActivityRecords(scope: TaxonomyScope): Promise<TaxonomyRecord[]> {
  if (!transportIsHttp) return listActivities(scope.departmentName);
  return loadHttpTaxonomyRecords('activity', scope);
}

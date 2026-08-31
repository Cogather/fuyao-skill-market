<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  getActivityOptionGroups,
  getDefaultActivityRecords,
  listActivities,
  replaceActivitiesForDepartment,
  type ActivityRecord,
} from '../../services/skillMarket/activityManagementService';
import {
  getDefaultSceneRecords,
  getSceneOptionGroups,
  listScenes,
  replaceScenesForDepartment,
  type SceneRecord,
} from '../../services/skillMarket/sceneManagementService';
import {
  getSceneTags,
  listSceneTags,
  saveSceneTags,
  type SceneTag,
  type SceneTagDimContext,
} from '../../services/skillMarket/sceneTagService';
import { notifyHarnessConfigurationChanged } from '../../services/skillMarket/harnessConfigurationSyncService';
import {
  skillBaseService,
  type RefreshTaxonomyItem,
} from '../../services/skillMarket/skillBaseService';
import {
  getProductPlanning,
  httpDimContext,
  type ProductPlanningOption,
} from '../../services/skillMarket/skillPlanningService';
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
import { getDepartmentNodeCode } from '../../services/skillMarket/marketDeptTreeFromApi';
import type { HarnessAuthorizedDepartment } from '../../services/skillMarket/harnessDepartmentPermission';
import MarketDeptCascader from './MarketDeptCascader.vue';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';

type TaxonomyKind = 'scene' | 'activity';
type TaxonomyRecord = SceneRecord | ActivityRecord;
type ConfigurationLevel = '产品级' | '部门级';

interface DepartmentTreeNode {
  id?: string;
  deptCode?: string;
  levelNo?: number;
  name: string;
  children?: DepartmentTreeNode[];
}

interface DepartmentOption {
  deptCode: string;
  name: string;
  path: string[];
}

const props = withDefaults(
  defineProps<{
    kind: TaxonomyKind;
    departmentTree?: DepartmentTreeNode[];
    userId?: string;
    departmentPermissionPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
    manageableDepartments?: HarnessAuthorizedDepartment[];
    departmentPermissionsLoading?: boolean;
    departmentPermissionsError?: string;
    initialScope?: HarnessScopeSnapshot;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    departmentPermissionPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
    manageableDepartments: () => [],
    departmentPermissionsLoading: false,
    departmentPermissionsError: '',
    initialScope: undefined,
  },
);

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const useHttpTaxonomySource = transportIsHttp;

const emit = defineEmits<{
  changed: [groups: SkillPlanningOptionGroup[], departmentName: string];
  'scope-change': [snapshot: HarnessScopeSnapshot];
}>();

const labels = computed(() =>
  props.kind === 'scene'
    ? {
        eyebrow: 'DEPARTMENT SCENE TAXONOMY',
        title: '部门场景配置',
        description:
          '在当前用户有管理权限的部门下维护场景树，保存后自动同步至各项规划能力的关联与筛选。',
        primary: '一级场景',
        secondary: '二级场景',
        item: '场景',
        importKey: 'scenes',
      }
    : {
        eyebrow: 'DEPARTMENT ACTIVITY TAXONOMY',
        title: '部门活动配置',
        description:
          '在当前用户有管理权限的部门下维护活动树，保存后自动同步至各项规划能力的关联与筛选。',
        primary: '归属活动',
        secondary: '归属子活动',
        item: '活动',
        importKey: 'activities',
      },
);

function normalizeDepartmentCode(value: unknown): string {
  const code = String(value ?? '').trim();
  return code && code !== 'undefined' && code !== 'null' ? code : '';
}

function flattenDepartments(nodes: DepartmentTreeNode[]): DepartmentOption[] {
  const rows: DepartmentOption[] = [];
  const walk = (items: DepartmentTreeNode[], path: string[]): void => {
    items.forEach((item) => {
      const nextPath = [...path, item.name];
      rows.push({
        deptCode: getDepartmentNodeCode(item),
        name: item.name,
        path: nextPath,
      });
      if (item.children?.length) walk(item.children, nextPath);
    });
  };
  walk(nodes, []);

  const seen = new Set<string>();
  return rows.filter((item) => {
    const key = item.deptCode ? `code:${item.deptCode}` : `path:${item.path.join('/')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function departmentTreeDepth(nodes: DepartmentTreeNode[]): number {
  return nodes.reduce(
    (maxDepth, node) => Math.max(maxDepth, 1 + departmentTreeDepth(node.children ?? [])),
    0,
  );
}

const normalizedDepartmentPermissionPath = computed(() =>
  normalizeDepartmentPath(props.departmentPermissionPath),
);
const normalizedLegacyAllowedPaths = computed(() =>
  (props.allowedDepartmentPaths ?? [])
    .map(normalizeDepartmentPath)
    .filter((path) => path.length > 0),
);
const manageableDepartmentCodes = computed(
  () =>
    new Set(
      props.manageableDepartments
        .map((department) =>
          normalizeDepartmentCode(
            department.deptCode || [...department.codePath].reverse().find(Boolean),
          ),
        )
        .filter(Boolean),
    ),
);
const allDepartmentOptions = computed(() => flattenDepartments(props.departmentTree));
const manageableDepartmentRootOptions = computed(() => {
  const options = allDepartmentOptions.value;
  if (!props.restrictToAllowedDepartments) return options;

  if (transportIsHttp || props.manageableDepartments.length > 0) {
    const codes = manageableDepartmentCodes.value;
    return options.filter((department) => codes.has(normalizeDepartmentCode(department.deptCode)));
  }

  const allowedPaths = normalizedLegacyAllowedPaths.value;
  if (allowedPaths.length > 0) {
    return options.filter((department) =>
      allowedPaths.some((path) => sameDepartmentPath(department.path, path)),
    );
  }

  const allowedNames = new Set(
    props.allowedDepartmentNames.map((item) => item.trim()).filter(Boolean),
  );
  return options.filter((department) => allowedNames.has(department.name));
});
const departmentOptions = computed(() => {
  const options = allDepartmentOptions.value;
  if (!props.restrictToAllowedDepartments) return options;

  const manageableRoots = manageableDepartmentRootOptions.value;
  return options.filter((department) =>
    manageableRoots.some((root) => departmentPathStartsWith(department.path, root.path)),
  );
});
const departmentCascadeMaxLevel = computed(() =>
  Math.max(1, departmentTreeDepth(props.departmentTree)),
);
const configurationLevelOptions: ConfigurationLevel[] = ['产品级'];
const scopeForm = reactive({
  level: '产品级' as ConfigurationLevel,
  offeringId: '',
  offeringName: '',
});
const selectedDepartment = ref('');
const selectedDepartmentPath = ref<string[]>([]);
const scopeDepartmentCommitted = ref(false);
const productOptions = ref<ProductPlanningOption[]>([]);
const productsLoading = ref(false);
const configurableDepartmentPaths = computed(() =>
  manageableDepartmentRootOptions.value.map((department) => [...department.path]),
);
const systemDefaultDepartmentPath = computed(() => {
  const configuredDefault = normalizedDepartmentPermissionPath.value;
  if (configuredDefault.length > 0) return [...configuredDefault];
  return [...(configurableDepartmentPaths.value[0] ?? [])];
});
const defaultDepartmentPath = computed(() => {
  const defaultDepartment = departmentOptions.value.find((department) =>
    sameDepartmentPath(department.path, systemDefaultDepartmentPath.value),
  );
  return [...(defaultDepartment?.path ?? [])];
});
const selectedProduct = computed(
  () => productOptions.value.find((item) => item.offeringName === scopeForm.offeringName) ?? null,
);
const scopeErrorMessage = computed(() => {
  if (props.departmentPermissionsLoading) return DEPARTMENT_PERMISSION_LOADING_MESSAGE;
  if (props.departmentPermissionsError)
    return props.departmentPermissionsError.trim() || DEPARTMENT_PERMISSION_LOAD_FAILED_MESSAGE;
  if (!departmentOptions.value.length) return '当前账号暂无可配置部门';
  if (!scopeDepartmentCommitted.value || !selectedDepartment.value) {
    return scopeForm.level === '产品级'
      ? '请选择产品所属部门并点击完成'
      : '请选择归属部门并点击完成';
  }
  if (scopeForm.level === '产品级' && !scopeForm.offeringName) return '请选择产品';
  return '';
});
const hasCompleteScope = computed(() => !scopeErrorMessage.value);
const scopeEmptyMessage = computed(() => scopeErrorMessage.value || '请选择配置范围');
const draftRecords = ref<TaxonomyRecord[]>([]);
const savedSnapshot = ref('[]');
const selectedPrimaryId = ref('');
const collapsedPrimaryIds = ref(new Set<string>());
const notice = ref('');
const toast = ref('');
const loading = ref(false);
let departmentLoadSequence = 0;
let productLoadSequence = 0;
let toastTimer: ReturnType<typeof window.setTimeout> | null = null;
const importInput = ref<HTMLInputElement | null>(null);
const draggedId = ref('');

// 一级场景标签（仅 kind === 'scene' 时启用）
const sceneTagBindings = ref<Record<string, string[]>>({});
const tagDialogOpen = ref(false);
const tagDialogSceneId = ref('');
const tagDialogSceneName = ref('');
const tagOptions = ref<SceneTag[]>([]);
const tagSelected = ref<string[]>([]);
const tagLoading = ref(false);
const tagSaving = ref(false);
const tagError = ref('');

const DEPARTMENT_PERMISSION_MESSAGE =
  '\u8bf7\u9009\u62e9\u60a8\u6709\u7ba1\u7406\u6743\u9650\u7684\u90e8\u95e8\u3002';
const DEPARTMENT_PERMISSION_LOADING_MESSAGE =
  '\u6b63\u5728\u52a0\u8f7d\u90e8\u95e8\u6743\u9650\uff0c\u8bf7\u7a0d\u5019\u3002';
const DEPARTMENT_PERMISSION_LOAD_FAILED_MESSAGE =
  '\u6743\u9650\u4fe1\u606f\u83b7\u53d6\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
const DEFAULT_DEPARTMENT_PERMISSION_MESSAGE =
  '\u9ed8\u8ba4\u90e8\u95e8\u4e0d\u5728\u5f53\u524d\u7528\u6237\u7ba1\u7406\u6743\u9650\u8303\u56f4\u5185\uff0c\u65e0\u6cd5\u6062\u590d\u3002';

function showToast(message: string, ms = 3000): void {
  toast.value = message;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, ms);
}

function normalizeDepartmentPath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function sameDepartmentPath(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeDepartmentPath(left);
  const normalizedRight = normalizeDepartmentPath(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((segment, index) => segment === normalizedRight[index])
  );
}

function departmentPathStartsWith(path: string[], requiredPrefix: string[]): boolean {
  const normalizedPath = normalizeDepartmentPath(path);
  const normalizedPrefix = normalizeDepartmentPath(requiredPrefix);
  return (
    normalizedPrefix.length > 0 &&
    normalizedPath.length >= normalizedPrefix.length &&
    normalizedPrefix.every((segment, index) => normalizedPath[index] === segment)
  );
}

function departmentByPath(path: string[]): DepartmentOption | undefined {
  return departmentOptions.value.find((department) => sameDepartmentPath(department.path, path));
}

const primaryRecords = computed(() =>
  draftRecords.value
    .filter((item) => item.parentId === null)
    .sort((left, right) => left.sort - right.sort),
);

const secondaryRecords = computed(() =>
  draftRecords.value
    .filter((item) => item.parentId === selectedPrimaryId.value)
    .sort((left, right) => left.sort - right.sort),
);

const selectedPrimary = computed(
  () => primaryRecords.value.find((item) => item.id === selectedPrimaryId.value) ?? null,
);

const dirty = computed(() => JSON.stringify(draftRecords.value) !== savedSnapshot.value);
const incompletePrimaryRecords = computed(() =>
  primaryRecords.value.filter(
    (primary) => !draftRecords.value.some((record) => record.parentId === primary.id),
  ),
);
const hasIncompletePrimaryDraft = computed(
  () => dirty.value && incompletePrimaryRecords.value.length > 0,
);
const incompleteDraftMessage = computed(() => {
  const names = incompletePrimaryRecords.value.map((record) => `“${record.name}”`).join('、');
  return `请先为${labels.value.primary}${names ? ` ${names}` : ''}添加${labels.value.secondary}，仅有第一层的配置不会更新。`;
});
const totalSkillCount = computed(() =>
  draftRecords.value.reduce((sum, item) => sum + item.skillCount, 0),
);

function cloneRecords(records: TaxonomyRecord[]): TaxonomyRecord[] {
  return records.map((item) => ({ ...item }));
}

function normalizeSort(parentId: string | null): void {
  draftRecords.value
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.sort - right.sort)
    .forEach((item, index) => {
      item.sort = index + 1;
    });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

interface HttpTaxonomyRow {
  deptCode: string;
  deptName: string;
  primary: string;
  secondary: string;
  sort: number;
  referenceCount: number;
}

function assertHttpSuccess(response: unknown, fallbackMessage: string): void {
  if (!response?.meta?.success) {
    throw new Error(readText(response?.meta?.message) || fallbackMessage);
  }
}

function responseRows(response: unknown): unknown[] {
  const responseRecord = asRecord(response);
  const data = responseRecord.data ?? response;
  const dataRecord = asRecord(data);
  return Array.isArray(data)
    ? data
    : (['list', 'records', 'items', 'rows']
        .map((key) => dataRecord[key])
        .find((value): value is unknown[] => Array.isArray(value)) ?? []);
}

function normalizeHttpTaxonomyRows(response: unknown): HttpTaxonomyRow[] {
  assertHttpSuccess(response, labels.value.item + '列表加载失败');
  const primaryKey = props.kind === 'scene' ? 'firstScene' : 'activityNodeName';
  const secondaryKey = props.kind === 'scene' ? 'secondScene' : 'subActivityNodeName';

  return responseRows(response).flatMap((item, index) => {
    const record = asRecord(item);
    const primary = readText(record[primaryKey]);
    if (!primary) return [];
    const parsedSort = Number(record.sort);
    const parsedReferenceCount = Number(record.referenceCount);
    return [
      {
        deptCode: readText(record.deptCode),
        deptName: readText(record.deptName),
        primary,
        secondary: readText(record[secondaryKey]),
        sort: Number.isFinite(parsedSort) ? parsedSort : index + 1,
        referenceCount:
          Number.isFinite(parsedReferenceCount) && parsedReferenceCount > 0
            ? parsedReferenceCount
            : 0,
      },
    ];
  });
}

function mapHttpTaxonomyRowsToRecords(rows: HttpTaxonomyRow[]): TaxonomyRecord[] {
  const groupedRows = new Map<string, Array<{ row: HttpTaxonomyRow; sourceIndex: number }>>();

  rows.forEach((row, sourceIndex) => {
    const group = groupedRows.get(row.primary) ?? [];
    group.push({ row, sourceIndex });
    groupedRows.set(row.primary, group);
  });

  const prefix = props.kind === 'scene' ? 'http-scene' : 'http-activity';
  const records: TaxonomyRecord[] = [];
  Array.from(groupedRows).forEach(([primary, children], primaryIndex) => {
    const parentId = prefix + '-primary-' + (primaryIndex + 1);
    const directReferenceCount = children.reduce(
      (sum, { row }) => sum + (row.secondary ? 0 : row.referenceCount),
      0,
    );
    records.push({
      id: parentId,
      parentId: null,
      name: primary,
      sort: primaryIndex + 1,
      status: 'enabled',
      skillCount: directReferenceCount,
    });

    const seenChildren = new Set<string>();
    children
      .sort((left, right) => left.row.sort - right.row.sort || left.sourceIndex - right.sourceIndex)
      .forEach(({ row }, childIndex) => {
        if (!row.secondary || seenChildren.has(row.secondary)) return;
        seenChildren.add(row.secondary);
        records.push({
          id: parentId + '-child-' + (childIndex + 1),
          parentId,
          name: row.secondary,
          sort: row.sort,
          status: 'enabled',
          skillCount: row.referenceCount,
        });
      });
  });

  return records;
}

async function fetchHttpTaxonomyRecords(departmentName: string): Promise<TaxonomyRecord[]> {
  const params = httpDimContext(departmentName, props.userId, scopeForm, departmentOptions.value);
  const response =
    props.kind === 'scene'
      ? await skillBaseService.getSceneOptionGroups(params)
      : await skillBaseService.getActivityOptionGroups(params);
  return mapHttpTaxonomyRowsToRecords(normalizeHttpTaxonomyRows(response));
}

function toHttpTaxonomyItems(records: TaxonomyRecord[]): RefreshTaxonomyItem[] {
  const rows: RefreshTaxonomyItem[] = [];
  let sort = 0;
  records
    .filter((record) => record.parentId === null)
    .sort((left, right) => left.sort - right.sort)
    .forEach((parent) => {
      const children = records
        .filter((record) => record.parentId === parent.id)
        .sort((left, right) => left.sort - right.sort);
      const values = children.length > 0 ? children : [null];
      values.forEach((child) => {
        const itemSort = sort++;
        rows.push(
          props.kind === 'scene'
            ? {
                firstScene: parent.name,
                secondScene: child?.name ?? '',
                sort: itemSort,
              }
            : {
                activityNodeName: parent.name,
                subActivityNodeName: child?.name ?? '',
                sort: itemSort,
              },
        );
      });
    });
  return rows;
}

function recordsToOptionGroups(records: TaxonomyRecord[]): SkillPlanningOptionGroup[] {
  return records
    .filter((record) => record.parentId === null)
    .sort((left, right) => left.sort - right.sort)
    .map((parent) => ({
      value: parent.name,
      children: records
        .filter((record) => record.parentId === parent.id && Boolean(record.name))
        .sort((left, right) => left.sort - right.sort)
        .map((record) => record.name),
    }));
}

async function saveHttpTaxonomyRecords(departmentName: string): Promise<TaxonomyRecord[]> {
  const context = httpDimContext(departmentName, props.userId, scopeForm, departmentOptions.value);
  const items = toHttpTaxonomyItems(draftRecords.value);
  const response =
    props.kind === 'scene'
      ? await skillBaseService.refreshSceneOptionGroups(
          {
            scenes: items,
          },
          context,
        )
      : await skillBaseService.refreshActivityOptionGroups(
          {
            activities: items,
          },
          context,
        );
  assertHttpSuccess(response, labels.value.item + '配置保存失败');
  return fetchHttpTaxonomyRecords(departmentName);
}

async function loadDepartment(departmentName: string): Promise<void> {
  const requestSequence = ++departmentLoadSequence;
  loading.value = true;
  notice.value = '';

  try {
    const records = useHttpTaxonomySource
      ? await fetchHttpTaxonomyRecords(departmentName)
      : props.kind === 'scene'
        ? listScenes(departmentName)
        : listActivities(departmentName);
    if (requestSequence !== departmentLoadSequence) return;

    draftRecords.value = cloneRecords(records);
    savedSnapshot.value = JSON.stringify(draftRecords.value);
    selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
    collapsedPrimaryIds.value = new Set<string>();
    await refreshSceneTagBindings();
    if (requestSequence !== departmentLoadSequence) return;
  } catch (error) {
    if (requestSequence !== departmentLoadSequence) return;
    draftRecords.value = [];
    savedSnapshot.value = '[]';
    selectedPrimaryId.value = '';
    notice.value = error instanceof Error ? error.message : labels.value.item + '列表加载失败';
  } finally {
    if (requestSequence === departmentLoadSequence) {
      loading.value = false;
    }
  }
}

function resetProductScope(): void {
  scopeForm.offeringId = '';
  scopeForm.offeringName = '';
  productOptions.value = [];
}

function setSelectedDepartment(path: string[], committed: boolean): DepartmentOption | undefined {
  const nextPath = normalizeDepartmentPath(path);
  const nextDepartment = departmentByPath(nextPath);
  selectedDepartmentPath.value = [...(nextDepartment?.path ?? nextPath)];
  selectedDepartment.value = nextDepartment?.name ?? '';
  scopeDepartmentCommitted.value = committed && Boolean(nextDepartment);
  return nextDepartment;
}

function applyDefaultScopeSelection(): void {
  scopeForm.level = '产品级';
  resetProductScope();
  setSelectedDepartment(defaultDepartmentPath.value, true);
}

async function loadProducts(preferredScope?: HarnessScopeSnapshot): Promise<void> {
  const requestSequence = ++productLoadSequence;
  resetProductScope();
  productsLoading.value = false;
  const departmentName = selectedDepartment.value.trim();
  if (scopeForm.level !== '产品级' || !scopeDepartmentCommitted.value || !departmentName) return;

  productsLoading.value = true;
  try {
    const department = departmentByPath(selectedDepartmentPath.value);
    const options = await getProductPlanning('', departmentName, department?.deptCode ?? '');
    if (requestSequence !== productLoadSequence) return;
    productOptions.value = options;
    const restoredOption = preferredScope
      ? (options.find(
          (item) =>
            Boolean(preferredScope.offeringId) && item.offeringId === preferredScope.offeringId,
        ) ?? options.find((item) => item.offeringName === preferredScope.offeringName))
      : undefined;
    const firstOption = restoredOption ?? options[0];
    if (firstOption) {
      scopeForm.offeringName = firstOption.offeringName;
      scopeForm.offeringId = firstOption.offeringId;
      if (hasCompleteScope.value && selectedDepartment.value) {
        await loadDepartment(selectedDepartment.value);
      }
    }
  } catch (error) {
    if (requestSequence !== productLoadSequence) return;
    productOptions.value = [];
    const message = error instanceof Error ? error.message : '产品列表加载失败';
    notice.value = message;
    showToast(message);
  } finally {
    if (requestSequence === productLoadSequence) {
      productsLoading.value = false;
    }
  }
}

function emitScopeSnapshot(): void {
  if (!scopeDepartmentCommitted.value || !selectedDepartment.value) return;
  const product = selectedProduct.value;
  emit('scope-change', {
    level: scopeForm.level,
    departmentPath: [...selectedDepartmentPath.value],
    offeringId: scopeForm.level === '产品级' ? (product?.offeringId ?? '') : '',
    offeringName: scopeForm.level === '产品级' ? scopeForm.offeringName : '',
  });
}

function restoreScopeSnapshot(): HarnessScopeSnapshot | undefined {
  const snapshot = props.initialScope;
  const department = snapshot ? departmentByPath(snapshot.departmentPath) : undefined;
  if (!snapshot || !department || !configurationLevelOptions.includes(snapshot.level)) {
    return undefined;
  }
  scopeForm.level = snapshot.level;
  setSelectedDepartment(department.path, true);
  return { ...snapshot, departmentPath: [...department.path] };
}

async function onScopeLevelChange(): Promise<void> {
  const nextLevel = scopeForm.level;
  const fallbackLevel: ConfigurationLevel = nextLevel === '产品级' ? '部门级' : '产品级';
  const nextPath = defaultDepartmentPath.value.length
    ? defaultDepartmentPath.value
    : selectedDepartmentPath.value;
  if (
    !sameDepartmentPath(nextPath, selectedDepartmentPath.value) &&
    !guardDepartmentChange(nextPath)
  ) {
    scopeForm.level = fallbackLevel;
    return;
  }

  const nextDepartment = setSelectedDepartment(nextPath, true);
  resetProductScope();
  await loadProducts();
  if (nextDepartment && hasCompleteScope.value) {
    await loadDepartment(nextDepartment.name);
  }
  emitScopeSnapshot();
}

async function onProductChange(): Promise<void> {
  const product = selectedProduct.value;
  scopeForm.offeringId = product?.offeringId ?? '';
  scopeForm.offeringName = product?.offeringName ?? scopeForm.offeringName;
  if (product && hasCompleteScope.value && selectedDepartment.value) {
    await loadDepartment(selectedDepartment.value);
  }
  emitScopeSnapshot();
}

watch(
  departmentOptions,
  (options) => {
    if (!options.length) {
      departmentLoadSequence += 1;
      productLoadSequence += 1;
      loading.value = false;
      selectedDepartment.value = '';
      selectedDepartmentPath.value = [];
      scopeDepartmentCommitted.value = false;
      resetProductScope();
      draftRecords.value = [];
      savedSnapshot.value = '[]';
      selectedPrimaryId.value = '';
      return;
    }
    const currentDepartment = departmentByPath(selectedDepartmentPath.value);
    if (!currentDepartment) {
      const restoredScope = restoreScopeSnapshot();
      if (!restoredScope) applyDefaultScopeSelection();
      if (selectedDepartment.value) {
        void loadProducts(restoredScope).then(emitScopeSnapshot);
        void loadDepartment(selectedDepartment.value);
      }
    } else if (
      currentDepartment.name !== selectedDepartment.value ||
      !scopeDepartmentCommitted.value
    ) {
      selectedDepartmentPath.value = [...currentDepartment.path];
      selectedDepartment.value = currentDepartment.name;
      scopeDepartmentCommitted.value = true;
      void loadProducts().then(emitScopeSnapshot);
      void loadDepartment(currentDepartment.name);
    }
  },
  { immediate: true },
);

watch(
  () => props.userId,
  () => {
    if (useHttpTaxonomySource && hasCompleteScope.value && selectedDepartment.value) {
      void loadDepartment(selectedDepartment.value);
    }
  },
);

function guardDepartmentChange(path: string[]): boolean {
  if (props.departmentPermissionsLoading) {
    showToast(DEPARTMENT_PERMISSION_LOADING_MESSAGE);
    return false;
  }
  if (props.departmentPermissionsError) {
    const message =
      props.departmentPermissionsError.trim() || DEPARTMENT_PERMISSION_LOAD_FAILED_MESSAGE;
    notice.value = message;
    showToast(message);
    return false;
  }

  const nextDepartment = departmentByPath(path);
  if (!nextDepartment) {
    showToast(DEPARTMENT_PERMISSION_MESSAGE);
    notice.value = DEPARTMENT_PERMISSION_MESSAGE;
    return false;
  }

  if (sameDepartmentPath(path, selectedDepartmentPath.value)) return true;
  if (!validateBeforeLeave()) return false;
  return !dirty.value || window.confirm('当前部门有未保存修改，切换部门将丢失这些修改，是否继续？');
}

function guardDefaultDepartmentRestore(): boolean {
  if (defaultDepartmentPath.value.length === 0) {
    notice.value = DEFAULT_DEPARTMENT_PERMISSION_MESSAGE;
    showToast(DEFAULT_DEPARTMENT_PERMISSION_MESSAGE);
    return false;
  }
  return guardDepartmentChange(defaultDepartmentPath.value);
}

function validateBeforeLeave(): boolean {
  if (!hasIncompletePrimaryDraft.value) return true;
  showToast(incompleteDraftMessage.value, 5000);
  return false;
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasIncompletePrimaryDraft.value) return;
  event.preventDefault();
  event.returnValue = incompleteDraftMessage.value;
}

defineExpose({ validateBeforeLeave });

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
});

function onDepartmentChange(path: string[]): void {
  const nextPath = normalizeDepartmentPath(path);
  const nextDepartment = departmentByPath(nextPath);
  selectedDepartmentPath.value = [...(nextDepartment?.path ?? nextPath)];
  selectedDepartment.value = nextDepartment?.name ?? '';
  scopeDepartmentCommitted.value = false;
  productLoadSequence += 1;
  resetProductScope();
}

async function changeDepartment(path: string[]): Promise<void> {
  const nextDepartment = departmentByPath(path);
  if (!nextDepartment) return;

  const shouldLoadDepartment =
    !scopeDepartmentCommitted.value ||
    !sameDepartmentPath(path, selectedDepartmentPath.value) ||
    nextDepartment.name !== selectedDepartment.value;
  selectedDepartmentPath.value = [...nextDepartment.path];
  selectedDepartment.value = nextDepartment.name;
  scopeDepartmentCommitted.value = true;
  resetProductScope();
  await loadProducts();
  if (shouldLoadDepartment && hasCompleteScope.value) {
    await loadDepartment(nextDepartment.name);
  }
  emitScopeSnapshot();
}

function clearDepartment(path: string[]): void {
  void changeDepartment(path);
}

function childRecords(parentId: string): TaxonomyRecord[] {
  return draftRecords.value
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.sort - right.sort);
}

function usageCount(record: TaxonomyRecord): number {
  return (
    record.skillCount +
    draftRecords.value
      .filter((item) => item.parentId === record.id)
      .reduce((sum, item) => sum + item.skillCount, 0)
  );
}

function blockReferencedAction(record: TaxonomyRecord, action: '编辑' | '删除'): boolean {
  const referenceCount = usageCount(record);
  if (referenceCount <= 0) return false;

  const levelLabel = record.parentId === null ? labels.value.primary : labels.value.secondary;
  showToast(
    `${levelLabel}“${record.name}”已关联 ${referenceCount} 个规划项，请先解除关联后再${action}。`,
  );
  return true;
}

function toggleCollapse(id: string): void {
  const next = new Set(collapsedPrimaryIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedPrimaryIds.value = next;
}

const editorOpen = ref(false);
const editorId = ref('');
const editorParentId = ref<string | null>(null);
const editorName = ref('');
const editorError = ref('');

function openEditor(parentId: string | null, record?: TaxonomyRecord): void {
  if (record && blockReferencedAction(record, '编辑')) return;

  editorId.value = record?.id ?? '';
  editorParentId.value = parentId;
  editorName.value = record?.name ?? '';
  editorError.value = '';
  editorOpen.value = true;
}

async function saveEditor(): Promise<void> {
  const name = editorName.value.trim();
  if (!name) {
    editorError.value = '请输入' + labels.value.item + '名称';
    return;
  }
  const duplicate = draftRecords.value.some(
    (item) =>
      item.id !== editorId.value && item.parentId === editorParentId.value && item.name === name,
  );
  if (duplicate) {
    editorError.value = '同一层级下已存在同名' + labels.value.item;
    return;
  }

  const editedId = editorId.value;
  const editedParentId = editorParentId.value;
  if (editedId) {
    const record = draftRecords.value.find((item) => item.id === editedId);
    if (record) {
      record.name = name;
    }
  } else {
    const prefix = props.kind === 'scene' ? 'scene' : 'activity';
    const id = prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    draftRecords.value.push({
      id,
      parentId: editorParentId.value,
      name,
      sort: draftRecords.value.filter((item) => item.parentId === editorParentId.value).length + 1,
      status: 'enabled',
      skillCount: 0,
    });
    if (editorParentId.value === null) selectedPrimaryId.value = id;
  }
  editorOpen.value = false;
  const involvesSecondary =
    editedParentId !== null || (Boolean(editedId) && childRecords(editedId).length > 0);
  if (involvesSecondary) {
    await autoSaveCompleteDraft();
  } else {
    notice.value = `请继续添加${labels.value.secondary}，结构完整后将自动更新。`;
  }
}

async function moveRecord(id: string, direction: -1 | 1): Promise<void> {
  const record = draftRecords.value.find((item) => item.id === id);
  if (!record) return;
  const siblings = draftRecords.value
    .filter((item) => item.parentId === record.parentId)
    .sort((left, right) => left.sort - right.sort);
  const index = siblings.findIndex((item) => item.id === id);
  const target = siblings[index + direction];
  if (!target) return;
  [record.sort, target.sort] = [target.sort, record.sort];
  await autoSaveCompleteDraft();
}

async function dropRecord(targetId: string): Promise<void> {
  const sourceId = draggedId.value;
  draggedId.value = '';
  const source = draftRecords.value.find((item) => item.id === sourceId);
  const target = draftRecords.value.find((item) => item.id === targetId);
  if (!source || !target || source.id === target.id || source.parentId !== target.parentId) return;
  const siblings = draftRecords.value
    .filter((item) => item.parentId === source.parentId)
    .sort((left, right) => left.sort - right.sort);
  const fromIndex = siblings.findIndex((item) => item.id === source.id);
  const toIndex = siblings.findIndex((item) => item.id === target.id);
  const [moved] = siblings.splice(fromIndex, 1);
  siblings.splice(toIndex, 0, moved);
  siblings.forEach((item, index) => {
    item.sort = index + 1;
  });
  await autoSaveCompleteDraft();
}

// ===== 一级场景标签（仅场景模式） =====
function sceneTagKey(record: TaxonomyRecord): string {
  return useHttpTaxonomySource ? record.name : record.id;
}

function tagsOf(record: TaxonomyRecord): string[] {
  return sceneTagBindings.value[record.id] ?? [];
}

const tagDisplayLimit = 4;
const expandedTagSceneIds = ref(new Set<string>());

function shownTagsOf(record: TaxonomyRecord): string[] {
  const tags = tagsOf(record);
  return expandedTagSceneIds.value.has(record.id) ? tags : tags.slice(0, tagDisplayLimit);
}

function hiddenTagsOf(record: TaxonomyRecord): string[] {
  return tagsOf(record).slice(tagDisplayLimit);
}

function toggleTagExpand(id: string): void {
  const next = new Set(expandedTagSceneIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedTagSceneIds.value = next;
}

async function refreshSceneTagBindings(): Promise<void> {
  if (props.kind !== 'scene') return;
  expandedTagSceneIds.value = new Set<string>();
  const next: Record<string, string[]> = {};
  await Promise.all(
    primaryRecords.value.map(async (primary) => {
      next[primary.id] = await getSceneTags(sceneTagKey(primary), selectedDepartment.value);
    }),
  );
  sceneTagBindings.value = next;
}

async function openTagDialog(record: TaxonomyRecord): Promise<void> {
  tagDialogSceneId.value = record.id;
  tagDialogSceneName.value = record.name;
  tagSelected.value = [...tagsOf(record)];
  tagError.value = '';
  tagLoading.value = true;
  tagDialogOpen.value = true;
  try {
    tagOptions.value = await listSceneTags();
  } catch (error) {
    tagError.value = error instanceof Error ? error.message : '标签列表加载失败';
    tagOptions.value = [];
  } finally {
    tagLoading.value = false;
  }
}

function closeTagDialog(): void {
  tagDialogOpen.value = false;
  tagDialogSceneId.value = '';
  tagDialogSceneName.value = '';
  tagSelected.value = [];
  tagError.value = '';
}

function selectAllTags(): void {
  tagSelected.value = tagOptions.value.map((tag) => tag.name);
}

function clearSelectedTags(): void {
  tagSelected.value = [];
}

async function confirmTagDialog(): Promise<void> {
  const record = primaryRecords.value.find((item) => item.id === tagDialogSceneId.value);
  if (!record || tagSaving.value) return;
  tagSaving.value = true;
  tagError.value = '';
  try {
    let dimContext: SceneTagDimContext | undefined = useHttpTaxonomySource
      ? httpDimContext(selectedDepartment.value, props.userId, scopeForm, departmentOptions.value)
      : undefined;
    delete dimContext?.dimName;
    await saveSceneTags(
      sceneTagKey(record),
      tagSelected.value,
      selectedDepartment.value,
      dimContext,
    );
    sceneTagBindings.value = {
      ...sceneTagBindings.value,
      [record.id]: [...tagSelected.value],
    };
    tagDialogOpen.value = false;
    showToast(`已为“${record.name}”更新标签`);
  } catch (error) {
    tagError.value = error instanceof Error ? error.message : '标签保存失败';
  } finally {
    tagSaving.value = false;
  }
}

const deleteOpen = ref(false);
const deleteTargetId = ref('');

const deleteTarget = computed(
  () => draftRecords.value.find((item) => item.id === deleteTargetId.value) ?? null,
);

function openDelete(record: TaxonomyRecord): void {
  if (blockReferencedAction(record, '删除')) return;

  deleteTargetId.value = record.id;
  deleteOpen.value = true;
}

async function removeDraftRecord(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) return;
  if (blockReferencedAction(target, '删除')) {
    deleteOpen.value = false;
    return;
  }

  if (target.parentId === null) {
    const childIds = new Set(childRecords(target.id).map((item) => item.id));
    draftRecords.value = draftRecords.value.filter(
      (item) => item.id !== target.id && !childIds.has(item.id),
    );
    normalizeSort(null);
    selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
  } else {
    draftRecords.value = draftRecords.value.filter((item) => item.id !== target.id);
    normalizeSort(target.parentId);
  }
  deleteOpen.value = false;
  await autoSaveCompleteDraft();
}

async function resetToDefault(): Promise<void> {
  if (dirty.value && !window.confirm('将用系统默认配置覆盖当前草稿，是否继续？')) return;
  const records = props.kind === 'scene' ? getDefaultSceneRecords() : getDefaultActivityRecords();
  draftRecords.value = cloneRecords(records);
  selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
  await autoSaveCompleteDraft();
}

async function saveAll(): Promise<boolean> {
  if (!hasCompleteScope.value || !selectedDepartment.value || loading.value) {
    if (scopeErrorMessage.value) showToast(scopeErrorMessage.value);
    return false;
  }
  const selectedPrimaryName = selectedPrimary.value?.name ?? '';
  loading.value = true;
  notice.value = '';
  try {
    const records = useHttpTaxonomySource
      ? await saveHttpTaxonomyRecords(selectedDepartment.value)
      : props.kind === 'scene'
        ? replaceScenesForDepartment(selectedDepartment.value, draftRecords.value as SceneRecord[])
        : replaceActivitiesForDepartment(
            selectedDepartment.value,
            draftRecords.value as ActivityRecord[],
          );
    draftRecords.value = cloneRecords(records);
    savedSnapshot.value = JSON.stringify(draftRecords.value);
    selectedPrimaryId.value =
      primaryRecords.value.find((record) => record.name === selectedPrimaryName)?.id ??
      primaryRecords.value[0]?.id ??
      '';
    const groups = useHttpTaxonomySource
      ? recordsToOptionGroups(records)
      : props.kind === 'scene'
        ? getSceneOptionGroups(selectedDepartment.value)
        : getActivityOptionGroups(selectedDepartment.value);
    if (useHttpTaxonomySource) {
      notifyHarnessConfigurationChanged(props.kind, selectedDepartment.value);
    }
    emit('changed', groups, selectedDepartment.value);
    notice.value = selectedDepartment.value + '的配置已自动更新。';
    showToast(notice.value);
    return true;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '保存失败，请检查配置';
    showToast(notice.value, 5000);
    return false;
  } finally {
    loading.value = false;
  }
}

async function autoSaveCompleteDraft(): Promise<void> {
  if (!dirty.value) return;
  if (hasIncompletePrimaryDraft.value) {
    notice.value = incompleteDraftMessage.value;
    showToast(notice.value, 5000);
    return;
  }
  await saveAll();
}

function triggerImport(): void {
  importInput.value?.click();
}

async function importRecords(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown> | TaxonomyRecord[];
    const rawRecords = Array.isArray(parsed)
      ? parsed
      : ((parsed[labels.value.importKey] ?? parsed.records) as unknown);
    if (!Array.isArray(rawRecords)) throw new Error('导入文件中未找到有效的配置列表');
    const next = rawRecords.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error('第 ' + (index + 1) + ' 条数据格式错误');
      }
      const record = item as Partial<TaxonomyRecord>;
      return {
        id: String(record.id || props.kind + '-' + Date.now() + '-' + index),
        parentId: record.parentId === null ? null : String(record.parentId || ''),
        name: String(record.name || '').trim(),
        sort: Number(record.sort) || index + 1,
        status: 'enabled',
        skillCount: Math.max(0, Number(record.skillCount) || 0),
      } satisfies TaxonomyRecord;
    });
    const ids = new Set(next.map((item) => item.id));
    if (next.some((item) => !item.name)) throw new Error('导入数据存在空名称');
    if (next.some((item) => item.parentId !== null && !ids.has(item.parentId))) {
      throw new Error('导入数据存在未归属的' + labels.value.secondary);
    }
    draftRecords.value = next;
    normalizeSort(null);
    primaryRecords.value.forEach((item) => normalizeSort(item.id));
    selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
    await autoSaveCompleteDraft();
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导入失败';
  }
}

function exportRecords(): void {
  const payload = {
    kind: props.kind,
    level: scopeForm.level,
    departmentName: selectedDepartment.value,
    offeringId: scopeForm.offeringId,
    offeringName: scopeForm.offeringName,
    exportedAt: new Date().toISOString(),
    records: draftRecords.value,
    [labels.value.importKey]: draftRecords.value,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = (selectedDepartment.value || 'department') + '-' + props.kind + '-taxonomy.json';
  link.click();
  URL.revokeObjectURL(url);
}
</script>
<template>
  <section class="taxonomy-workspace" :aria-busy="loading || departmentPermissionsLoading">
    <header class="toolbar-card">
      <div class="toolbar-controls">
        <div
          class="configuration-scope-grid"
          :class="{ 'is-department-level': scopeForm.level === '部门级' }"
        >
          <label v-if="false" class="configuration-field configuration-field--level">
            <span>层级 <em>*</em></span>
            <div
              v-if="
                configurationLevelOptions.length === 1 && configurationLevelOptions[0] === '产品级'
              "
              class="single-level-value"
              aria-label="当前层级：产品级"
            >
              产品级
            </div>
            <select
              v-else
              v-model="scopeForm.level"
              :disabled="loading"
              @change="onScopeLevelChange"
            >
              <option v-for="level in configurationLevelOptions" :key="level" :value="level">
                {{ level }}
              </option>
            </select>
          </label>
          <div class="configuration-field configuration-field--dept">
            <span>{{ scopeForm.level === '产品级' ? '产品所属部门' : '归属部门' }} <em>*</em></span>
            <MarketDeptCascader
              :model-value="selectedDepartmentPath"
              class="configuration-dept-cascader"
              :tree="departmentTree"
              :max-level="departmentCascadeMaxLevel"
              :allowed-paths="configurableDepartmentPaths"
              :disabled="
                loading ||
                departmentPermissionsLoading ||
                Boolean(departmentPermissionsError) ||
                !departmentOptions.length
              "
              :all-label="departmentOptions.length ? '请选择部门' : '暂无可配置部门'"
              empty-text="暂无可配置部门"
              clear-text="恢复默认选择"
              clear-behavior="reset"
              :clear-value="defaultDepartmentPath"
              selection-mode="confirm"
              aria-label="配置范围部门级联选择"
              :before-clear="guardDefaultDepartmentRestore"
              :before-done="guardDepartmentChange"
              @change="onDepartmentChange"
              @clear="clearDepartment"
              @done="changeDepartment"
            />
          </div>
          <label v-if="scopeForm.level === '产品级'" class="configuration-field">
            <span>产品 <em>*</em></span>
            <select
              v-model="scopeForm.offeringName"
              :disabled="loading || productsLoading || !scopeDepartmentCommitted"
              @change="onProductChange"
            >
              <option value="">
                {{
                  !scopeDepartmentCommitted
                    ? '请先选择部门'
                    : productsLoading
                      ? '产品加载中...'
                      : '请选择产品'
                }}
              </option>
              <option
                v-for="product in productOptions"
                :key="product.offeringId || product.offeringName"
                :value="product.offeringName"
              >
                {{ product.offeringName }}
              </option>
            </select>
          </label>
        </div>
        <input
          ref="importInput"
          class="file-input"
          type="file"
          accept="application/json,.json"
          @change="importRecords"
        />
      </div>
    </header>

    <div class="summary-strip">
      <div class="summary-metrics">
        <div>
          <strong>{{ primaryRecords.length }}</strong
          ><span>{{ labels.primary }}</span>
        </div>
        <div>
          <strong>{{ draftRecords.length - primaryRecords.length }}</strong>
          <span>{{ labels.secondary }}</span>
        </div>
        <div>
          <strong>{{ totalSkillCount }}</strong
          ><span>关联规划项</span>
        </div>
      </div>
    </div>
    <div v-if="loading" class="empty-department">
      {{ '\u6b63\u5728\u52a0\u8f7d\u573a\u666f\u914d\u7f6e\u2026' }}
    </div>
    <div v-else-if="hasCompleteScope" class="taxonomy-grid">
      <aside class="tree-panel">
        <div class="panel-heading">
          <div>
            <span class="step-badge">01</span>
            <h3>{{ labels.primary }}</h3>
            <p>支持折叠与拖拽排序</p>
          </div>
          <button class="add-button" type="button" @click="openEditor(null)">＋ 新增</button>
        </div>

        <div v-if="primaryRecords.length" class="primary-tree">
          <article
            v-for="primary in primaryRecords"
            :key="primary.id"
            class="primary-node"
            :class="{ active: primary.id === selectedPrimaryId }"
            draggable="true"
            @dragstart="draggedId = primary.id"
            @dragover.prevent
            @drop="dropRecord(primary.id)"
          >
            <div class="primary-row">
              <span class="drag-handle" title="拖拽排序">⠿</span>
              <button class="collapse-button" type="button" @click="toggleCollapse(primary.id)">
                {{ collapsedPrimaryIds.has(primary.id) ? '›' : '⌄' }}
              </button>
              <button class="node-main" type="button" @click="selectedPrimaryId = primary.id">
                <strong>{{ primary.name }}</strong>
                <small>
                  {{ childRecords(primary.id).length }} 个{{ labels.secondary }} ·
                  {{ usageCount(primary) }} 个规划项
                </small>
              </button>
              <button
                class="icon-action"
                type="button"
                title="编辑"
                @click="openEditor(null, primary)"
              >
                ✎
              </button>
              <button
                class="icon-action danger"
                type="button"
                title="删除"
                @click="openDelete(primary)"
              >
                ×
              </button>
            </div>
            <div v-if="kind === 'scene'" class="primary-tags-row">
              <button class="tag-add" type="button" @click="openTagDialog(primary)">
                ＋ 添加标签
              </button>
              <template v-if="tagsOf(primary).length">
                <span
                  v-for="tag in shownTagsOf(primary)"
                  :key="tag"
                  class="scene-tag-pill"
                  :title="tag"
                >
                  <span class="scene-tag-pill__text">{{ tag }}</span>
                </span>
                <button
                  v-if="tagsOf(primary).length > tagDisplayLimit"
                  class="tag-more"
                  type="button"
                  :title="hiddenTagsOf(primary).join('、')"
                  @click="toggleTagExpand(primary.id)"
                >
                  {{
                    expandedTagSceneIds.has(primary.id)
                      ? '收起'
                      : '＋' + (tagsOf(primary).length - tagDisplayLimit)
                  }}
                </button>
              </template>
            </div>
            <div v-if="!collapsedPrimaryIds.has(primary.id)" class="tree-children">
              <button
                v-for="child in childRecords(primary.id)"
                :key="child.id"
                type="button"
                @click="selectedPrimaryId = primary.id"
              >
                {{ child.name }}
              </button>
              <span v-if="!childRecords(primary.id).length" class="empty-child">
                暂无{{ labels.secondary }}
              </span>
            </div>
          </article>
        </div>
        <div v-else class="empty-panel">当前部门暂无{{ labels.primary }}</div>
      </aside>

      <section class="list-panel">
        <div class="panel-heading">
          <div>
            <span class="step-badge">02</span>
            <h3>{{ labels.secondary }}</h3>
            <p v-if="selectedPrimary">
              当前归属：<strong>{{ selectedPrimary.name }}</strong> ·
              {{ secondaryRecords.length }} 项
            </p>
            <p v-else>请先选择或新增{{ labels.primary }}</p>
          </div>
          <button
            class="add-button dark"
            type="button"
            :disabled="!selectedPrimary"
            @click="openEditor(selectedPrimaryId)"
          >
            ＋ 新增{{ labels.secondary }}
          </button>
        </div>

        <div v-if="selectedPrimary" class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排序</th>
                <th>{{ labels.secondary }}</th>
                <th>关联规划项</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(secondary, index) in secondaryRecords"
                :key="secondary.id"
                draggable="true"
                @dragstart="draggedId = secondary.id"
                @dragover.prevent
                @drop="dropRecord(secondary.id)"
              >
                <td>
                  <span class="drag-handle">⠿</span>
                  <span class="sort-number">{{ index + 1 }}</span>
                </td>
                <td>
                  <strong>{{ secondary.name }}</strong>
                </td>
                <td>
                  <span class="count-pill">{{ secondary.skillCount }}</span>
                </td>
                <td class="row-actions">
                  <button
                    type="button"
                    :disabled="index === 0"
                    @click="moveRecord(secondary.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    :disabled="index === secondaryRecords.length - 1"
                    @click="moveRecord(secondary.id, 1)"
                  >
                    ↓
                  </button>
                  <button type="button" @click="openEditor(selectedPrimaryId, secondary)">
                    编辑
                  </button>
                  <button class="danger" type="button" @click="openDelete(secondary)">删除</button>
                </td>
              </tr>
              <tr v-if="!secondaryRecords.length">
                <td colspan="4" class="empty-table">暂无{{ labels.secondary }}，可从右上角新增</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-panel large">选择左侧{{ labels.primary }}后查看明细</div>
      </section>
    </div>

    <div v-else class="empty-department">{{ scopeEmptyMessage }}</div>

    <div v-if="editorOpen" class="modal-backdrop" @click.self="editorOpen = false">
      <form class="modal-card" @submit.prevent="saveEditor">
        <h3>
          {{ editorId ? '编辑' : '新增'
          }}{{ editorParentId === null ? labels.primary : labels.secondary }}
        </h3>
        <label><span>名称</span><input v-model="editorName" maxlength="40" autofocus /></label>
        <p v-if="editorError" class="form-error">{{ editorError }}</p>
        <div class="modal-actions">
          <button type="button" @click="editorOpen = false">取消</button>
          <button class="primary-button" type="submit">
            {{
              editorParentId !== null || (editorId && childRecords(editorId).length > 0)
                ? '保存并更新'
                : '保存'
            }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="deleteOpen && deleteTarget" class="modal-backdrop" @click.self="deleteOpen = false">
      <div class="modal-card delete-card">
        <h3>删除{{ labels.item }}“{{ deleteTarget.name }}”</h3>
        <p>该项暂无关联规划，确认后将自动更新配置。</p>
        <div class="modal-actions">
          <button type="button" @click="deleteOpen = false">取消</button>
          <button class="danger-button" type="button" @click="removeDraftRecord">确认删除</button>
        </div>
      </div>
    </div>

    <div v-if="tagDialogOpen" class="modal-backdrop" @click.self="closeTagDialog">
      <div class="modal-card tag-dialog">
        <header class="tag-dialog-header">
          <div>
            <span class="tag-dialog-eyebrow">SCENE TAG</span>
            <h3>添加标签</h3>
          </div>
          <button class="tag-dialog-close" type="button" aria-label="关闭" @click="closeTagDialog">
            ×
          </button>
        </header>
        <p class="tag-dialog-desc">
          为一级场景<strong>“{{ tagDialogSceneName }}”</strong>选择标签，可多选。
        </p>

        <div v-if="tagLoading" class="tag-loading">标签加载中…</div>
        <div v-else-if="tagError" class="form-error">{{ tagError }}</div>
        <div v-else class="tag-options-wrap">
          <div class="tag-options-meta">
            <span>共 {{ tagOptions.length }} 个标签</span>
            <span class="tag-options-actions">
              <button type="button" @click="selectAllTags">全选</button>
              <button type="button" @click="clearSelectedTags">清空</button>
            </span>
          </div>
          <div class="tag-options">
            <label
              v-for="tag in tagOptions"
              :key="tag.id"
              class="tag-option"
              :class="{ 'is-checked': tagSelected.includes(tag.name) }"
            >
              <input v-model="tagSelected" type="checkbox" :value="tag.name" />
              <span>{{ tag.name }}</span>
            </label>
            <p v-if="!tagOptions.length" class="tag-empty">暂无可选标签</p>
          </div>
        </div>

        <div class="modal-actions">
          <span class="tag-selected-count">已选 {{ tagSelected.length }} 项</span>
          <button type="button" :disabled="tagSaving" @click="closeTagDialog">取消</button>
          <button
            class="primary-button"
            type="button"
            :disabled="tagSaving || tagLoading"
            @click="confirmTagDialog"
          >
            {{ tagSaving ? '保存中…' : '保存标签' }}
          </button>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="toast" class="configuration-toast" data-app-toast role="status" aria-live="polite">
        {{ toast }}
      </div>
    </Teleport>
  </section>
</template>
<style scoped>
.configuration-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 3000;
  min-width: 240px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 13px 16px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.94);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.5;
}

.taxonomy-workspace {
  display: grid;
  gap: 22px;
  color: #13213b;
}

.toolbar-card,
.summary-metrics,
.tree-panel,
.list-panel,
.empty-department {
  border: 1px solid #dce5f3;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 38px rgba(42, 65, 105, 0.08);
}

.toolbar-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(300px, 0.8fr) minmax(860px, 1.4fr);
  gap: 24px;
  align-items: center;
  padding: 28px 34px;
  border-radius: 18px;
  overflow: hidden;
}

.toolbar-card::after {
  content: '';
  position: absolute;
  inset: 0 0 0 auto;
  width: 42%;
  background: radial-gradient(circle at 50% 40%, rgba(105, 98, 255, 0.16), transparent 65%);
  pointer-events: none;
}

.toolbar-copy,
.toolbar-controls {
  position: relative;
  z-index: 1;
}

.eyebrow {
  display: block;
  margin-bottom: 9px;
  color: #5b67e8;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

h2,
h3,
p {
  margin: 0;
}

.toolbar-copy h2 {
  font-size: 25px;
}

.toolbar-copy p,
.panel-heading p {
  margin-top: 7px;
  color: #70809a;
  font-size: 14px;
}

.toolbar-controls {
  display: grid;
  gap: 14px;
  align-items: end;
  justify-items: stretch;
}

.configuration-scope-grid {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(260px, 1.4fr) minmax(180px, 0.9fr);
  gap: 14px;
  align-items: end;
  min-width: 0;
}

.configuration-scope-grid.is-department-level {
  grid-template-columns: minmax(120px, 0.65fr) minmax(360px, 1.75fr);
}

.configuration-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.toolbar-controls button,
.add-button,
.modal-actions button {
  min-height: 40px;
  padding: 0 15px;
  border: 1px solid #d5dfef;
  border-radius: 9px;
  background: #fff;
  color: #273955;
  font-weight: 700;
  cursor: pointer;
}

.toolbar-controls button:disabled,
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.configuration-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.configuration-field span,
.modal-card label span {
  color: #52647d;
  font-size: 12px;
  font-weight: 800;
}

.configuration-field em {
  color: #dc2626;
  font-style: normal;
}

select,
input {
  height: 42px;
  border: 1px solid #ced9eb;
  border-radius: 9px;
  background: #fff;
  padding: 0 12px;
  color: #1f304c;
  outline: none;
}

select:focus,
input:focus {
  border-color: #6475f4;
  box-shadow: 0 0 0 3px rgba(100, 117, 244, 0.12);
}

.configuration-field select {
  width: 100%;
  min-width: 0;
  height: 38px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  background: #fff;
  color: #253857;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  box-sizing: border-box;
  padding: 0 11px;
  outline: none;
}

.configuration-field select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.configuration-field select:disabled {
  background: #f7faff;
  color: #94a3b8;
}

.single-level-value {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 2px;
  color: #111827;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: 0.01em;
  line-height: 1;
}

.configuration-dept-cascader {
  width: 100%;
  min-width: 0;
}

.primary-button {
  border-color: #5268f2 !important;
  background: linear-gradient(135deg, #3478f6, #6358ee) !important;
  color: #fff !important;
}

.file-input {
  display: none;
}

.summary-strip {
  display: block;
  width: 100%;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
  border-radius: 16px;
  overflow: hidden;
}

.summary-metrics > div {
  display: grid;
  gap: 3px;
  justify-items: center;
  padding: 18px;
  border-right: 1px solid #e6ebf4;
}

.summary-strip strong {
  font-size: 25px;
}

.summary-strip span {
  color: #7988a0;
  font-size: 12px;
  font-weight: 700;
}
.taxonomy-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.78fr) minmax(650px, 1.45fr);
  gap: 20px;
  align-items: start;
}

.tree-panel,
.list-panel {
  border-radius: 17px;
  overflow: hidden;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 94px;
  padding: 20px 22px;
  border-bottom: 1px solid #e5ebf5;
}

.panel-heading > div {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 11px;
  align-items: center;
}

.panel-heading p {
  grid-column: 2;
}

.step-badge {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  grid-row: 1 / 3;
  border-radius: 10px;
  background: #eef0ff;
  color: #5b69e9;
  font-weight: 800;
}

.add-button {
  border-color: #cfd7ff;
  color: #5264df;
}

.add-button.dark {
  background: #15243f;
  border-color: #15243f;
  color: #fff;
}

.primary-tree {
  display: grid;
  gap: 9px;
  padding: 13px;
  max-height: 665px;
  overflow: auto;
}

.primary-node {
  border: 1px solid transparent;
  border-radius: 12px;
  background: #f8faff;
  overflow: hidden;
}

.primary-node.active {
  border-color: #aab7ff;
  background: #f6f7ff;
}

.primary-row {
  display: flex;
  align-items: center;
  min-height: 68px;
  padding: 8px 10px;
}

.drag-handle {
  color: #a1aec1;
  cursor: grab;
  font-size: 19px;
}

.collapse-button,
.icon-action {
  width: 27px;
  border: 0;
  background: transparent;
  color: #7787a1;
  cursor: pointer;
}

.node-main {
  display: grid;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.node-main strong {
  color: #1e2f4a;
  font-size: 15px;
}

.node-main small {
  color: #8290a6;
}

.danger,
.icon-action.danger {
  color: #dc4051 !important;
}

.tree-children {
  display: grid;
  gap: 2px;
  margin: 0 12px 10px 67px;
  padding-left: 12px;
  border-left: 1px solid #dce4f2;
}

.tree-children button {
  border: 0;
  background: transparent;
  padding: 5px 2px;
  text-align: left;
  color: #5d6c83;
  cursor: pointer;
}

.empty-child {
  padding: 6px 0;
  color: #9ba7b9;
  font-size: 12px;
}

.primary-tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 12px 10px 67px;
}

.tag-add {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border: 1px dashed #b9c6ff;
  border-radius: 999px;
  background: #f3f5ff;
  color: #5367df;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.tag-add:hover {
  border-color: #6f7ff2;
  background: #e9ecff;
  color: #3b4fd0;
}

.scene-tag-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  max-width: 150px;
  padding: 0 9px;
  border: 1px solid #dbe4ff;
  border-radius: 999px;
  background: #ffffff;
  color: #4557a6;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  box-sizing: border-box;
}

.scene-tag-pill__text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tag-more {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border: 1px dashed #b9c6ff;
  border-radius: 999px;
  background: #f6f7ff;
  color: #5367df;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.tag-more:hover {
  border-color: #6f7ff2;
  background: #e9ecff;
  color: #3b4fd0;
}

.modal-card.tag-dialog {
  width: min(520px, 100%);
}

.tag-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.modal-card .tag-dialog-header h3 {
  margin: 0;
  font-size: 20px;
}

.tag-dialog-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: #5b67e8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.tag-dialog-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: #f1f4fa;
  color: #7c8aa0;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.tag-dialog-close:hover {
  background: #e7ecf6;
  color: #33415e;
}

.tag-dialog-desc {
  margin-bottom: 16px;
  font-size: 13px;
}

.tag-dialog-desc strong {
  color: #1e2f4a;
}

.tag-loading,
.tag-empty {
  padding: 30px 0;
  text-align: center;
  color: #8b98ac;
  font-size: 13px;
}

.tag-options-wrap {
  min-width: 0;
}

.tag-options-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: #8b98ac;
  font-size: 12px;
  font-weight: 700;
}

.tag-options-actions {
  display: inline-flex;
  gap: 4px;
}

.tag-options-actions button {
  min-height: 0;
  padding: 3px 8px;
  border: 0;
  border-radius: 7px;
  background: #f1f4fa;
  color: #5367df;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.tag-options-actions button:hover {
  background: #e7ecf6;
  color: #3b4fd0;
}

.tag-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 300px;
  padding: 6px 2px 4px;
  overflow: auto;
}

.tag-options::-webkit-scrollbar {
  width: 6px;
}

.tag-options::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #c9d3e8;
}

.tag-options::-webkit-scrollbar-thumb:hover {
  background: #aebadb;
}

.tag-options::-webkit-scrollbar-track {
  background: transparent;
}

.tag-dialog .tag-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  margin-top: 0;
  padding: 10px 12px;
  border: 1px solid #e2e8f4;
  border-radius: 10px;
  background: #fbfcff;
  box-sizing: border-box;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.tag-dialog .tag-option:hover {
  border-color: #c3cdf5;
  background: #f6f8ff;
}

.tag-dialog .tag-option.is-checked {
  border-color: #a9b6f7;
  background: #eef1ff;
  box-shadow: inset 0 0 0 1px rgba(83, 103, 223, 0.14);
}

.tag-dialog .tag-option input {
  appearance: none;
  -webkit-appearance: none;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: 1.5px solid #c6d0e4;
  border-radius: 6px;
  background: #ffffff;
  position: relative;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.tag-dialog .tag-option input:hover {
  border-color: #8f9ef0;
}

.tag-dialog .tag-option input:checked {
  border-color: #5367df;
  background: linear-gradient(135deg, #3b7df6, #6358ee);
}

.tag-dialog .tag-option input:checked::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 46%;
  width: 4px;
  height: 8px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: translate(-50%, -50%) rotate(45deg);
}

.tag-dialog .tag-option input:focus-visible {
  outline: 2px solid #8f9ef0;
  outline-offset: 2px;
}

.tag-dialog .tag-option span {
  color: #33415e;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.tag-selected-count {
  margin-right: auto;
  align-self: center;
  color: #7c8aa0;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 560px) {
  .tag-options {
    grid-template-columns: 1fr;
  }
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 710px;
}

th {
  padding: 15px 18px;
  background: #f7f9fd;
  color: #6f7f98;
  font-size: 12px;
  text-align: left;
}

td {
  padding: 20px 18px;
  border-top: 1px solid #e8edf5;
  color: #42536d;
}

.sort-number,
.count-pill {
  display: inline-grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  margin-left: 9px;
  border-radius: 9px;
  background: #f0f3f8;
  color: #667791;
  font-weight: 800;
}

.count-pill {
  margin: 0;
  border-radius: 99px;
}

.row-actions {
  white-space: nowrap;
}

.row-actions button {
  border: 0;
  background: transparent;
  color: #596b87;
  cursor: pointer;
}

.row-actions button:disabled {
  color: #c1c8d4;
}

.empty-panel,
.empty-table,
.empty-department {
  padding: 54px 22px;
  text-align: center;
  color: #8b98ac;
}

.empty-panel.large {
  min-height: 260px;
  display: grid;
  place-items: center;
}

.empty-department {
  border-radius: 16px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(13, 25, 47, 0.46);
}

.modal-card {
  width: min(460px, 100%);
  padding: 25px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 65px rgba(15, 28, 51, 0.25);
}

.modal-card h3 {
  margin-bottom: 22px;
  font-size: 20px;
}

.modal-card label {
  display: grid;
  gap: 7px;
  margin-top: 15px;
}

.modal-card p {
  color: #66758d;
  line-height: 1.7;
}

.warning-copy {
  padding: 12px;
  border-radius: 9px;
  background: #fff4e7;
  color: #9b5f18 !important;
}

.form-error {
  margin-top: 12px;
  color: #d73e50 !important;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.danger-button {
  border-color: #ef6977 !important;
  background: #ef4f61 !important;
  color: #fff !important;
}

/* 场景与活动共用的紧凑字号体系 */
.taxonomy-workspace {
  gap: 16px;
}

.toolbar-card {
  gap: 20px;
  padding: 20px 26px;
}

.eyebrow {
  margin-bottom: 7px;
  font-size: 10px;
}

.toolbar-copy h2 {
  font-size: 18px;
  line-height: 1.35;
}

.toolbar-copy p,
.panel-heading p {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.5;
}

.toolbar-controls button,
.add-button {
  min-height: 36px;
  padding: 0 11px;
  font-size: 11px;
}

:deep(.configuration-dept-cascader .market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  border-color: #d8e2f0;
  border-radius: 6px;
  background: #fff;
  box-shadow: none;
  color: #253857;
  font-size: 13px;
  font-weight: 700;
  padding: 0 30px 0 11px;
}

:deep(.configuration-dept-cascader .market-dept-cascader-trigger:hover),
:deep(.configuration-dept-cascader .market-dept-cascader-trigger:focus-visible) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

:deep(.configuration-dept-cascader .market-dept-cascader-trigger[aria-disabled='true']) {
  background: #f7faff;
  color: #94a3b8;
}

.configuration-field span {
  font-size: 12px;
}

.configuration-field select {
  height: 38px;
  font-size: 13px;
}

.summary-metrics > div {
  padding: 12px;
}

.summary-strip strong {
  font-size: 19px;
  line-height: 1.2;
}

.summary-strip span {
  font-size: 10px;
}

.panel-heading {
  min-height: 70px;
  padding: 14px 16px;
}

.panel-heading h3 {
  font-size: 15px;
  line-height: 1.3;
}

.panel-heading p {
  margin-top: 4px;
  font-size: 10px;
}

.step-badge {
  width: 31px;
  height: 31px;
  font-size: 12px;
}

.add-button {
  font-size: 10px;
}

.primary-tree {
  gap: 7px;
  padding: 9px;
}

.primary-row {
  min-height: 50px;
  padding: 6px 8px;
}

.drag-handle {
  font-size: 14px;
}

.node-main {
  gap: 3px;
  padding: 3px 6px;
}

.node-main strong {
  font-size: 12px;
}

.node-main small {
  font-size: 10px;
}

.tree-children {
  margin: 0 9px 7px 56px;
}

.tree-children button {
  padding: 4px 2px;
  font-size: 10px;
}

.empty-child {
  font-size: 10px;
}

table {
  min-width: 660px;
}

th {
  padding: 10px 12px;
  font-size: 10px;
}

td {
  padding: 9px 12px;
  font-size: 10px;
  line-height: 1.35;
}

td strong {
  font-size: 11px;
  font-weight: 650;
}

.sort-number,
.count-pill {
  min-width: 23px;
  height: 23px;
  margin-left: 7px;
  border-radius: 8px;
  font-size: 10px;
}

.count-pill {
  margin-left: 0;
}

.row-actions button {
  padding: 2px 3px;
  font-size: 10px;
}
@media (max-width: 1320px) {
  .toolbar-card {
    grid-template-columns: 1fr;
  }

  .configuration-scope-grid,
  .configuration-scope-grid.is-department-level {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .configuration-actions {
    justify-content: flex-start;
  }

  .taxonomy-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .toolbar-card {
    padding: 22px;
  }

  .toolbar-controls {
    align-items: stretch;
  }

  .configuration-scope-grid,
  .configuration-scope-grid.is-department-level {
    grid-template-columns: 1fr;
  }

  .configuration-actions {
    justify-content: flex-start;
  }

  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Responsive list typography for wide screens */
@media (min-width: 1440px) {
  .panel-heading h3 {
    font-size: clamp(15px, 0.9vw, 18px);
  }

  .panel-heading p,
  .node-main small,
  .tree-children button,
  .empty-child,
  th,
  td,
  .row-actions button {
    font-size: clamp(10px, 0.625vw, 13px);
  }

  .node-main strong,
  td strong {
    font-size: clamp(12px, 0.72vw, 15px);
  }

  .sort-number,
  .count-pill {
    font-size: clamp(10px, 0.625vw, 12px);
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
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
import { notifyHarnessConfigurationChanged } from '../../services/skillMarket/harnessConfigurationSyncService';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import {
  getProductPlanning,
  type ProductPlanningOption,
} from '../../services/skillMarket/skillPlanningService';
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
import MarketDeptCascader from './MarketDeptCascader.vue';

type TaxonomyKind = 'scene' | 'activity';
type TaxonomyRecord = SceneRecord | ActivityRecord;
type ConfigurationLevel = '产品级' | '部门级';

interface DepartmentTreeNode {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentTreeNode[];
}

interface DepartmentOption {
  deptCode: string;
  name: string;
  level: number;
  path: string[];
  hasChildren: boolean;
}

const props = withDefaults(
  defineProps<{
    kind: TaxonomyKind;
    departmentTree?: DepartmentTreeNode[];
    userId?: string;
    isSuperAdmin?: boolean;
    departmentPermissionPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    isSuperAdmin: false,
    departmentPermissionPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
  },
);

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const useHttpTaxonomySource = transportIsHttp;

const emit = defineEmits<{
  changed: [groups: SkillPlanningOptionGroup[], departmentName: string];
}>();

const labels = computed(() =>
  props.kind === 'scene'
    ? {
        eyebrow: 'DEPARTMENT SCENE TAXONOMY',
        title: '部门场景配置',
        description:
          '五级、六级部门分别维护自己的场景树，保存后自动同步至各项规划能力的关联与筛选。',
        primary: '一级场景',
        secondary: '二级场景',
        item: '场景',
        importKey: 'scenes',
      }
    : {
        eyebrow: 'DEPARTMENT ACTIVITY TAXONOMY',
        title: '部门活动配置',
        description:
          '五级、六级部门分别维护自己的活动树，保存后自动同步至各项规划能力的关联与筛选。',
        primary: '归属活动',
        secondary: '归属子活动',
        item: '活动',
        importKey: 'activities',
      },
);

function flattenDepartments(nodes: DepartmentTreeNode[]): DepartmentOption[] {
  const rows: DepartmentOption[] = [];
  const walk = (items: DepartmentTreeNode[], depth: number, path: string[]): void => {
    items.forEach((item) => {
      const nextPath = [...path, item.name];
      rows.push({
        deptCode: String(item.deptCode ?? item.id ?? '').trim(),
        name: item.name,
        level: depth,
        path: nextPath,
        hasChildren: Boolean(item.children?.length),
      });
      if (item.children?.length) walk(item.children, depth + 1, nextPath);
    });
  };
  walk(nodes, 1, []);

  let candidates = rows.filter((item) => item.level === 5 || item.level === 6);
  if (!candidates.length) {
    candidates = rows.filter((item) => !item.hasChildren);
  }

  const allowedPaths = (props.allowedDepartmentPaths ?? [])
    .map(normalizeDepartmentPath)
    .filter((path) => path.length > 0);
  const allowed = new Set(props.allowedDepartmentNames.map((item) => item.trim()).filter(Boolean));
  if (props.restrictToAllowedDepartments) {
    candidates = candidates.filter((item) =>
      allowedPaths.length > 0
        ? allowedPaths.some((path) => departmentPathStartsWith(item.path, path))
        : item.path.some((name) => allowed.has(name)),
    );
    if (!candidates.length && allowed.size) {
      candidates = [...allowed].map((name) => ({
        deptCode: '',
        name,
        level: 5,
        path: [name],
        hasChildren: false,
      }));
    }
  }

  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

const normalizedDepartmentPermissionPath = computed(() =>
  normalizeDepartmentPath(props.departmentPermissionPath),
);
const departmentOptions = computed(() => {
  const options = flattenDepartments(props.departmentTree);
  const permissionPath = normalizedDepartmentPermissionPath.value;
  return permissionPath.length > 0
    ? options.filter((department) => departmentPathStartsWith(department.path, permissionPath))
    : options;
});
const configurationLevelOptions: ConfigurationLevel[] = ['产品级', '部门级'];
const scopeForm = reactive({
  level: '部门级' as ConfigurationLevel,
  offeringId: '',
  offeringName: '',
});
const selectedDepartment = ref('');
const selectedDepartmentPath = ref<string[]>([]);
const scopeDepartmentCommitted = ref(false);
const productOptions = ref<ProductPlanningOption[]>([]);
const productsLoading = ref(false);
const configurableDepartmentPaths = computed(() =>
  departmentOptions.value.map((department) => [...department.path]),
);
const defaultDepartmentPath = computed(() => {
  const permissionPath = normalizedDepartmentPermissionPath.value;
  const defaultDepartment =
    departmentOptions.value.find((department) =>
      sameDepartmentPath(department.path, permissionPath),
    ) ?? departmentOptions.value[0];
  return [...(defaultDepartment?.path ?? [])];
});
const selectedProduct = computed(
  () => productOptions.value.find((item) => item.offeringName === scopeForm.offeringName) ?? null,
);
const scopeErrorMessage = computed(() => {
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

const DEPARTMENT_PERMISSION_MESSAGE =
  '\u8bf7\u9009\u62e9\u60a8\u6240\u5c5e\u7684\u6700\u7ec6\u7c92\u5ea6\u90e8\u95e8\u3002';

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

function departmentPathIsBeforePermissionDepartment(path: string[]): boolean {
  const normalizedPath = normalizeDepartmentPath(path);
  const permissionPath = normalizedDepartmentPermissionPath.value;
  return (
    normalizedPath.length > 0 &&
    normalizedPath.length < permissionPath.length &&
    normalizedPath.every((segment, index) => segment === permissionPath[index])
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
const enabledPrimaryCount = computed(
  () => primaryRecords.value.filter((item) => item.status === 'enabled').length,
);
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
    return [
      {
        deptCode: readText(record.deptCode),
        deptName: readText(record.deptName),
        primary,
        secondary: readText(record[secondaryKey]),
        sort: Number.isFinite(parsedSort) ? parsedSort : index + 1,
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
    records.push({
      id: parentId,
      parentId: null,
      name: primary,
      sort: primaryIndex + 1,
      status: 'enabled',
      skillCount: 0,
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
          skillCount: 0,
        });
      });
  });

  return records;
}

function httpDepartmentContext(departmentName: string): any {
  const userId = props.userId.trim();
  if (!userId) throw new Error('请先获取当前用户工号');
  const department = departmentOptions.value.find((item) => item.name === departmentName);
  const deptCode = department?.deptCode.trim() || departmentName.trim();
  return !deptCode ? { userId } : { userId, deptCode };
}

async function fetchHttpTaxonomyRecords(departmentName: string): Promise<TaxonomyRecord[]> {
  const params = httpDepartmentContext(departmentName);
  const response =
    props.kind === 'scene'
      ? await skillBaseService.getSceneOptionGroups(params)
      : await skillBaseService.getActivityOptionGroups(params);
  return mapHttpTaxonomyRowsToRecords(normalizeHttpTaxonomyRows(response));
}

function toHttpTaxonomyItems(records: TaxonomyRecord[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  let sort = 1;
  records
    .filter((record) => record.parentId === null)
    .sort((left, right) => left.sort - right.sort)
    .forEach((parent) => {
      const children = records
        .filter((record) => record.parentId === parent.id)
        .sort((left, right) => left.sort - right.sort);
      const values = children.length > 0 ? children : [null];
      values.forEach((child) => {
        rows.push(
          props.kind === 'scene'
            ? { firstScene: parent.name, secondScene: child?.name ?? '', sort: sort++ }
            : {
                activityNodeName: parent.name,
                subActivityNodeName: child?.name ?? '',
                sort: sort++,
              },
        );
      });
    });
  return rows;
}

function recordsToOptionGroups(records: TaxonomyRecord[]): SkillPlanningOptionGroup[] {
  return records
    .filter((record) => record.parentId === null && record.status === 'enabled')
    .sort((left, right) => left.sort - right.sort)
    .map((parent) => ({
      value: parent.name,
      children: records
        .filter(
          (record) =>
            record.parentId === parent.id && record.status === 'enabled' && Boolean(record.name),
        )
        .sort((left, right) => left.sort - right.sort)
        .map((record) => record.name),
    }));
}

async function saveHttpTaxonomyRecords(departmentName: string): Promise<TaxonomyRecord[]> {
  const context = httpDepartmentContext(departmentName);
  const items = toHttpTaxonomyItems(draftRecords.value);
  const response =
    props.kind === 'scene'
      ? await skillBaseService.refreshSceneOptionGroups(
          { deptCode: context.deptCode, scenes: items },
          props.userId,
        )
      : await skillBaseService.refreshActivityOptionGroups(
          { deptCode: context.deptCode, activities: items },
          props.userId,
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
  const nextPath = normalizeDepartmentPath(path).slice(0, 6);
  const nextDepartment = departmentByPath(nextPath);
  selectedDepartmentPath.value = [...(nextDepartment?.path ?? nextPath)];
  selectedDepartment.value = nextDepartment?.name ?? '';
  scopeDepartmentCommitted.value = committed && Boolean(nextDepartment);
  return nextDepartment;
}

function applyDefaultScopeSelection(): void {
  scopeForm.level = '部门级';
  resetProductScope();
  setSelectedDepartment(defaultDepartmentPath.value, true);
}

async function loadProducts(): Promise<void> {
  const requestSequence = ++productLoadSequence;
  resetProductScope();
  productsLoading.value = false;
  const departmentName = selectedDepartment.value.trim();
  if (scopeForm.level !== '产品级' || !scopeDepartmentCommitted.value || !departmentName) return;

  productsLoading.value = true;
  try {
    const department = departmentOptions.value.find((item) => item.name === departmentName);
    const options = await getProductPlanning('', departmentName, department?.deptCode ?? '');
    if (requestSequence !== productLoadSequence) return;
    productOptions.value = options;
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

  const previousDepartment = selectedDepartment.value;
  const nextDepartment = setSelectedDepartment(nextPath, true);
  resetProductScope();
  await loadProducts();
  if (nextDepartment && nextDepartment.name !== previousDepartment) {
    await loadDepartment(nextDepartment.name);
  }
}

function onProductChange(): void {
  const product = selectedProduct.value;
  scopeForm.offeringId = product?.offeringId ?? '';
  scopeForm.offeringName = product?.offeringName ?? scopeForm.offeringName;
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
      applyDefaultScopeSelection();
      if (selectedDepartment.value) {
        void loadProducts();
        void loadDepartment(selectedDepartment.value);
      }
    } else if (
      currentDepartment.name !== selectedDepartment.value ||
      !scopeDepartmentCommitted.value
    ) {
      selectedDepartmentPath.value = [...currentDepartment.path];
      selectedDepartment.value = currentDepartment.name;
      scopeDepartmentCommitted.value = true;
      void loadProducts();
      void loadDepartment(currentDepartment.name);
    }
  },
  { immediate: true },
);

watch([() => props.userId, () => props.isSuperAdmin], () => {
  if (useHttpTaxonomySource && hasCompleteScope.value && selectedDepartment.value) {
    void loadDepartment(selectedDepartment.value);
  }
});

function guardDepartmentChange(path: string[]): boolean {
  if (departmentPathIsBeforePermissionDepartment(path)) {
    notice.value = DEPARTMENT_PERMISSION_MESSAGE;
    showToast(DEPARTMENT_PERMISSION_MESSAGE);
    return false;
  }

  const nextDepartment = departmentByPath(path);
  if (!nextDepartment) {
    showToast(
      '\u8bf7\u9009\u62e9\u53ef\u914d\u7f6e\u7684\u4e94\u7ea7\u6216\u516d\u7ea7\u90e8\u95e8\u3002',
    );
    notice.value = '请选择可配置的五级或六级部门。';
    return false;
  }

  return (
    sameDepartmentPath(path, selectedDepartmentPath.value) ||
    !dirty.value ||
    window.confirm('当前部门有未保存修改，切换部门将丢失这些修改，是否继续？')
  );
}

onBeforeUnmount(() => {
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
});

function onDepartmentChange(path: string[]): void {
  const nextPath = normalizeDepartmentPath(path).slice(0, 6);
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
  if (shouldLoadDepartment) {
    await loadDepartment(nextDepartment.name);
  }
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

function toggleCollapse(id: string): void {
  const next = new Set(collapsedPrimaryIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedPrimaryIds.value = next;
}

function toggleStatus(id: string): void {
  const record = draftRecords.value.find((item) => item.id === id);
  if (!record) return;
  record.status = record.status === 'enabled' ? 'disabled' : 'enabled';
}

const editorOpen = ref(false);
const editorId = ref('');
const editorParentId = ref<string | null>(null);
const editorName = ref('');
const editorStatus = ref<'enabled' | 'disabled'>('enabled');
const editorError = ref('');

function openEditor(parentId: string | null, record?: TaxonomyRecord): void {
  editorId.value = record?.id ?? '';
  editorParentId.value = parentId;
  editorName.value = record?.name ?? '';
  editorStatus.value = record?.status ?? 'enabled';
  editorError.value = '';
  editorOpen.value = true;
}

function saveEditor(): void {
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

  if (editorId.value) {
    const record = draftRecords.value.find((item) => item.id === editorId.value);
    if (record) {
      record.name = name;
      record.status = editorStatus.value;
    }
  } else {
    const prefix = props.kind === 'scene' ? 'scene' : 'activity';
    const id = prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    draftRecords.value.push({
      id,
      parentId: editorParentId.value,
      name,
      sort: draftRecords.value.filter((item) => item.parentId === editorParentId.value).length + 1,
      status: editorStatus.value,
      skillCount: 0,
    });
    if (editorParentId.value === null) selectedPrimaryId.value = id;
  }
  editorOpen.value = false;
}

function moveRecord(id: string, direction: -1 | 1): void {
  const record = draftRecords.value.find((item) => item.id === id);
  if (!record) return;
  const siblings = draftRecords.value
    .filter((item) => item.parentId === record.parentId)
    .sort((left, right) => left.sort - right.sort);
  const index = siblings.findIndex((item) => item.id === id);
  const target = siblings[index + direction];
  if (!target) return;
  [record.sort, target.sort] = [target.sort, record.sort];
}

function dropRecord(targetId: string): void {
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
}

const deleteOpen = ref(false);
const deleteTargetId = ref('');
const migrationTargetId = ref('');
const deleteError = ref('');

const deleteTarget = computed(
  () => draftRecords.value.find((item) => item.id === deleteTargetId.value) ?? null,
);

const migrationCandidates = computed(() => {
  if (!deleteTarget.value) return [];
  return draftRecords.value
    .filter(
      (item) =>
        item.id !== deleteTarget.value?.id && item.parentId === deleteTarget.value?.parentId,
    )
    .sort((left, right) => left.sort - right.sort);
});

function openDelete(record: TaxonomyRecord): void {
  deleteTargetId.value = record.id;
  migrationTargetId.value = '';
  deleteError.value = '';
  deleteOpen.value = true;
}

function removeDraftRecord(mode: 'force' | 'migrate'): void {
  const target = deleteTarget.value;
  if (!target) return;
  const migrationTarget = draftRecords.value.find((item) => item.id === migrationTargetId.value);
  if (mode === 'migrate' && !migrationTarget) {
    deleteError.value = '请选择迁移到的' + labels.value.item;
    return;
  }

  if (target.parentId === null) {
    const children = childRecords(target.id);
    const mergedChildIds = new Set<string>();
    if (mode === 'migrate' && migrationTarget) {
      migrationTarget.skillCount += target.skillCount;
      children.forEach((child) => {
        const duplicate = draftRecords.value.find(
          (item) => item.parentId === migrationTarget.id && item.name === child.name,
        );
        if (duplicate) {
          duplicate.skillCount += child.skillCount;
          mergedChildIds.add(child.id);
        } else {
          child.parentId = migrationTarget.id;
        }
      });
      normalizeSort(migrationTarget.id);
    }
    const childIds = new Set(children.map((item) => item.id));
    draftRecords.value = draftRecords.value.filter(
      (item) =>
        item.id !== target.id &&
        !mergedChildIds.has(item.id) &&
        !(mode === 'force' && childIds.has(item.id)),
    );
    normalizeSort(null);
    selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
  } else {
    if (mode === 'migrate' && migrationTarget) migrationTarget.skillCount += target.skillCount;
    draftRecords.value = draftRecords.value.filter((item) => item.id !== target.id);
    normalizeSort(target.parentId);
  }
  deleteOpen.value = false;
}

function resetToDefault(): void {
  if (dirty.value && !window.confirm('将用系统默认配置覆盖当前草稿，是否继续？')) return;
  const records = props.kind === 'scene' ? getDefaultSceneRecords() : getDefaultActivityRecords();
  draftRecords.value = cloneRecords(records);
  selectedPrimaryId.value = primaryRecords.value[0]?.id ?? '';
  notice.value = '已恢复为默认草稿，点击“确认更新”后生效。';
}

async function saveAll(): Promise<void> {
  if (!hasCompleteScope.value || !selectedDepartment.value || loading.value) {
    if (scopeErrorMessage.value) showToast(scopeErrorMessage.value);
    return;
  }
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
    const groups = useHttpTaxonomySource
      ? recordsToOptionGroups(records)
      : props.kind === 'scene'
        ? getSceneOptionGroups(selectedDepartment.value)
        : getActivityOptionGroups(selectedDepartment.value);
    if (useHttpTaxonomySource) {
      notifyHarnessConfigurationChanged(props.kind, selectedDepartment.value);
    }
    emit('changed', groups, selectedDepartment.value);
    notice.value = selectedDepartment.value + '的配置已全量保存。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '保存失败，请检查配置';
  } finally {
    loading.value = false;
  }
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
        status: record.status === 'disabled' ? 'disabled' : 'enabled',
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
    notice.value = '导入成功，当前仅为草稿，请点击“确认更新”。';
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
  <section class="taxonomy-workspace" :aria-busy="loading">
    <header class="toolbar-card">
      <div class="toolbar-controls">
        <div
          class="configuration-scope-grid"
          :class="{ 'is-department-level': scopeForm.level === '部门级' }"
        >
          <label class="configuration-field configuration-field--level">
            <span>层级 <em>*</em></span>
            <select v-model="scopeForm.level" :disabled="loading" @change="onScopeLevelChange">
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
              :max-level="6"
              :allowed-paths="configurableDepartmentPaths"
              permission-mode="review-center"
              :permission-path="normalizedDepartmentPermissionPath"
              :disabled="loading || !departmentOptions.length"
              :all-label="departmentOptions.length ? '请选择部门' : '暂无可配置部门'"
              empty-text="暂无可配置部门"
              clear-text="恢复默认选择"
              clear-behavior="reset"
              :clear-value="defaultDepartmentPath"
              selection-mode="confirm"
              searchable
              aria-label="配置范围部门级联选择"
              :before-clear="() => guardDepartmentChange(defaultDepartmentPath)"
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
      <div v-if="dirty || notice" class="save-state" :class="{ dirty }">
        <span>{{ dirty ? '有未保存修改' : '已保存' }}</span>
        <span v-if="notice">{{ notice }}</span>
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
          <strong>{{ enabledPrimaryCount }}</strong
          ><span>启用一级项</span>
        </div>
        <div>
          <strong>{{ totalSkillCount }}</strong
          ><span>关联规划项</span>
        </div>
      </div>
      <div class="summary-update">
        <button
          class="primary-button summary-confirm-button"
          type="button"
          :disabled="loading || !dirty || !hasCompleteScope"
          @click="saveAll"
        >
          确认更新
        </button>
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
                class="status-dot"
                :class="primary.status"
                type="button"
                @click="toggleStatus(primary.id)"
              >
                {{ primary.status === 'enabled' ? '启用' : '停用' }}
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
            <div v-if="!collapsedPrimaryIds.has(primary.id)" class="tree-children">
              <button
                v-for="child in childRecords(primary.id)"
                :key="child.id"
                type="button"
                @click="selectedPrimaryId = primary.id"
              >
                <span :class="['child-dot', child.status]"></span>{{ child.name }}
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
                <th>状态</th>
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
                <td>
                  <button
                    class="status-switch"
                    :class="secondary.status"
                    type="button"
                    @click="toggleStatus(secondary.id)"
                  >
                    <span></span>{{ secondary.status === 'enabled' ? '启用' : '停用' }}
                  </button>
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
                <td colspan="5" class="empty-table">暂无{{ labels.secondary }}，可从右上角新增</td>
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
        <label>
          <span>状态</span>
          <select v-model="editorStatus">
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <p v-if="editorError" class="form-error">{{ editorError }}</p>
        <div class="modal-actions">
          <button type="button" @click="editorOpen = false">取消</button>
          <button class="primary-button" type="submit">保存到草稿</button>
        </div>
      </form>
    </div>

    <div v-if="deleteOpen && deleteTarget" class="modal-backdrop" @click.self="deleteOpen = false">
      <div class="modal-card delete-card">
        <h3>删除{{ labels.item }}“{{ deleteTarget.name }}”</h3>
        <p v-if="usageCount(deleteTarget) > 0" class="warning-copy">
          当前{{ labels.item }}已被 {{ usageCount(deleteTarget) }} 个规划项使用，删除后这些规划项
          将失去归属。可先批量迁移，或强制删除。
        </p>
        <p v-else>该项暂无关联规划，删除将在确认更新后生效。</p>
        <label v-if="migrationCandidates.length">
          <span>批量迁移到</span>
          <select v-model="migrationTargetId">
            <option value="">请选择</option>
            <option
              v-for="candidate in migrationCandidates"
              :key="candidate.id"
              :value="candidate.id"
            >
              {{ candidate.name }}
            </option>
          </select>
        </label>
        <p v-if="deleteError" class="form-error">{{ deleteError }}</p>
        <div class="modal-actions">
          <button type="button" @click="deleteOpen = false">取消</button>
          <button
            v-if="migrationCandidates.length"
            type="button"
            @click="removeDraftRecord('migrate')"
          >
            迁移并删除
          </button>
          <button class="danger-button" type="button" @click="removeDraftRecord('force')">
            强制删除
          </button>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="toast" class="configuration-toast" role="status" aria-live="polite">
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
.toolbar-controls,
.save-state {
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

.save-state {
  grid-column: 1 / -1;
  display: flex;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid #edf1f7;
  color: #6d7d96;
  font-size: 13px;
}

.save-state.dirty span:first-child {
  color: #d77b16;
  font-weight: 800;
}

.summary-strip {
  display: grid;
  grid-template-columns: minmax(0, 0.76fr) minmax(180px, 0.24fr);
  align-items: stretch;
  gap: 18px;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.summary-update {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  background: transparent;
}

.summary-confirm-button {
  min-width: 128px;
  min-height: 42px;
  border-radius: 10px !important;
  box-shadow: 0 12px 24px rgba(76, 92, 238, 0.18);
  font-size: 13px;
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

.status-dot {
  border: 0;
  border-radius: 99px;
  padding: 5px 8px;
  font-size: 11px;
  cursor: pointer;
}

.status-dot.enabled {
  background: #e7faf3;
  color: #15956d;
}

.status-dot.disabled {
  background: #edf0f5;
  color: #78879c;
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

.child-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: #aeb8c7;
}

.child-dot.enabled {
  background: #20b783;
}

.empty-child {
  padding: 6px 0;
  color: #9ba7b9;
  font-size: 12px;
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

.status-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  background: transparent;
  color: #687990;
  cursor: pointer;
}

.status-switch span {
  width: 34px;
  height: 19px;
  border-radius: 99px;
  background: #cbd4e1;
  position: relative;
}

.status-switch span::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transition: 0.2s;
}

.status-switch.enabled {
  color: #15956d;
}

.status-switch.enabled span {
  background: #23bb87;
}

.status-switch.enabled span::after {
  transform: translateX(15px);
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

.save-state {
  padding-top: 10px;
  font-size: 10px;
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

.summary-confirm-button {
  min-height: 38px;
  font-size: 12px;
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

.status-dot {
  padding: 3px 6px;
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

.status-switch {
  gap: 6px;
  font-size: 10px;
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

  .summary-strip {
    grid-template-columns: 1fr;
  }

  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-update {
    justify-content: flex-start;
    padding: 0;
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
  .status-dot,
  .status-switch,
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

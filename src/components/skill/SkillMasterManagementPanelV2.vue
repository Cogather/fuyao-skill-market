<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import MarketDeptCascader from './MarketDeptCascader.vue';
import { listScenes, type SceneRecord } from '../../services/skillMarket/sceneManagementService';
import {
  listActivities,
  type ActivityRecord,
} from '../../services/skillMarket/activityManagementService';
import {
  getSkillMasterAssociation,
  removeSkillMasterAssociation,
  saveSkillMasterAssociation,
  type SkillMasterAssociation,
} from '../../services/skillMarket/skillMasterAssociationService';
import {
  type SkillMasterRecord,
  type SkillMasterStatus,
} from '../../services/skillMarket/skillMasterManagementService';
import {
  getProductPlanning,
  querySkillPlanningUsers,
  type ProductPlanningOption,
  type SkillPlanningUserOption,
} from '../../services/skillMarket/skillPlanningService';
import type {
  CreateSkillMasterManagementBody,
  QuerySkillMasterManagementBody,
  SkillMasterManagementItemDto,
  UpdateSkillMasterManagementBody,
} from '../../services/skillMarket/apiTypes';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

type PlanningLevel = '产品级' | '部门级';
type DepartmentNode = { id?: string; deptCode?: string; name: string; children?: DepartmentNode[] };
type TaxonomyOption = { id: string; label: string };
type PersonPickerState = {
  keyword: string;
  open: boolean;
  loading: boolean;
  options: SkillPlanningUserOption[];
  message: string;
  selected: SkillPlanningUserOption | null;
};

function createPersonPickerState(): PersonPickerState {
  return {
    keyword: '',
    open: false,
    loading: false,
    options: [],
    message: '请输入人员信息',
    selected: null,
  };
}

const props = withDefaults(
  defineProps<{
    departmentTree?: DepartmentNode[];
    userId?: string;
    currentUserDepartmentPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    currentUserDepartmentPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
  },
);
const records = ref<SkillMasterRecord[]>([]);
const masterLoading = ref(false);
const associations = ref<Record<string, SkillMasterAssociation>>({});
const keyword = ref('');
const toast = ref('');
let toastTimer: number | null = null;
function makeTaxonomyOptions(records: Array<SceneRecord | ActivityRecord>): TaxonomyOption[] {
  const parentNames = new Map(records.map((item) => [item.id, item.name]));
  return records
    .filter((item) => item.status === 'enabled')
    .map((item) => ({
      id: item.id,
      label: item.parentId
        ? `${parentNames.get(item.parentId) || '未分类'} / ${item.name}`
        : item.name,
    }));
}
const sceneOptions = ref<TaxonomyOption[]>([]);
const activityOptions = ref<TaxonomyOption[]>([]);
const ownerPicker = reactive(createPersonPickerState());
const developOwnerPicker = reactive(createPersonPickerState());
const personDisplayLabels = ref<Record<string, string>>({});
let ownerSearchTimer: number | null = null;
let developOwnerSearchTimer: number | null = null;
let ownerSearchSequence = 0;
let developOwnerSearchSequence = 0;
let personLabelLoadSequence = 0;

type PersonSubmitValue = {
  label: string;
  name: string;
  id: string;
};

function createEmptyPersonSubmitValue(): PersonSubmitValue {
  return {
    label: '',
    name: '',
    id: '',
  };
}

function parsePersonSubmitValue(value: string): PersonSubmitValue {
  const label = value.trim();
  if (!label) {
    return createEmptyPersonSubmitValue();
  }
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return {
      label,
      name: label,
      id: '',
    };
  }
  const id = parts[parts.length - 1] ?? '';
  const name = parts.slice(0, -1).join(' ');
  return {
    label,
    name,
    id,
  };
}

const editor = reactive({
  open: false,
  mode: 'create' as 'create' | 'edit',
  id: '',
  name: '',
  description: '',
  level: '',
  product: '',
  owner: '',
  department: '',
  developOwner: '',
  developOwnerDepartment: '',
  plannedCompleteDate: '',
  status: '未开始' as SkillMasterStatus,
  error: '',
});
const initialOwnerValue = reactive(createEmptyPersonSubmitValue());
const initialDevelopOwnerValue = reactive(createEmptyPersonSubmitValue());
const associationEditor = reactive({
  open: false,
  skillId: '',
  skillName: '',
  sceneIds: [] as string[],
  activityIds: [] as string[],
  planningDepartments: [] as string[],
});
const departmentPath = ref<string[]>([]);
const deleteDialog = reactive({ open: false, id: '', name: '' });
const editorOverlayPointerStartedOnBackdrop = ref(false);
const submitting = ref(false);
const planningLevelOptions: PlanningLevel[] = ['产品级', '部门级'];
const masterScopeForm = reactive({
  level: '部门级' as PlanningLevel,
  planningDeptName: '',
  offeringId: '',
  offeringName: '',
});
const masterDepartmentSegments = ref<string[]>([]);
const masterScopeDepartmentCommitted = ref(false);
const masterProductOptions = ref<ProductPlanningOption[]>([]);
const masterProductsLoading = ref(false);
const selectedMasterIds = ref<string[]>([]);
const batchDeleteDialog = reactive({ open: false, ids: [] as string[] });
let masterProductLoadSequence = 0;

function normalizeDepartmentPath(segments: string[] | undefined): string[] {
  return (segments ?? []).map((segment) => segment.trim()).filter(Boolean);
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

function filterDepartmentTree(
  nodes: DepartmentNode[],
  allowedNames: Set<string>,
  ancestorAllowed = false,
): DepartmentNode[] {
  return nodes.flatMap((node) => {
    const nodeAllowed = ancestorAllowed || allowedNames.has(node.name.trim());
    const children = filterDepartmentTree(node.children ?? [], allowedNames, nodeAllowed);
    if (!nodeAllowed && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

function filterDepartmentTreeByPaths(
  nodes: DepartmentNode[],
  allowedPaths: string[][],
  parentPath: string[] = [],
): DepartmentNode[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    const relevant = allowedPaths.some(
      (allowedPath) =>
        departmentPathStartsWith(path, allowedPath) ||
        departmentPathStartsWith(allowedPath, path) ||
        sameDepartmentPath(path, allowedPath),
    );
    if (!relevant) return [];
    return [
      {
        ...node,
        children: filterDepartmentTreeByPaths(node.children ?? [], allowedPaths, path),
      },
    ];
  });
}

const normalizedAllowedDepartmentPaths = computed(() =>
  (props.allowedDepartmentPaths ?? [])
    .map(normalizeDepartmentPath)
    .filter((path) => path.length > 0),
);

const masterDepartmentTree = computed(() => {
  const tree = props.departmentTree ?? [];
  if (!props.restrictToAllowedDepartments) return tree;
  if (normalizedAllowedDepartmentPaths.value.length > 0) {
    return filterDepartmentTreeByPaths(tree, normalizedAllowedDepartmentPaths.value);
  }
  return filterDepartmentTree(
    tree,
    new Set(props.allowedDepartmentNames.map((name) => name.trim()).filter(Boolean)),
  );
});
const currentUserMinimumDepartmentPath = computed(() =>
  normalizeDepartmentPath(props.currentUserDepartmentPath),
);
const defaultMasterDepartmentPath = computed(() =>
  normalizeDepartmentPath(
    normalizedAllowedDepartmentPaths.value[0] ?? currentUserMinimumDepartmentPath.value,
  ),
);
const legacyMasterPermissionPath = computed(() =>
  normalizedAllowedDepartmentPaths.value.length > 0 ? [] : currentUserMinimumDepartmentPath.value,
);

function findMasterDepartmentNode(
  segments: string[],
  nodes = masterDepartmentTree.value,
): DepartmentNode | undefined {
  const [current, ...rest] = normalizeDepartmentPath(segments);
  if (!current) return undefined;
  const node = nodes.find((item) => item.name === current);
  if (!node || rest.length === 0) return node;
  return findMasterDepartmentNode(rest, node.children ?? []);
}
const selectedMasterProduct = computed(() =>
  masterProductOptions.value.find(
    (item) =>
      item.offeringName === masterScopeForm.offeringName &&
      (!item.planningDeptName || item.planningDeptName === masterScopeForm.planningDeptName),
  ),
);
const currentProductName = computed(() =>
  masterScopeForm.level === '产品级' ? masterScopeForm.offeringName.trim() : '',
);
const requiredSkillNamePrefix = computed(() => {
  const productName = currentProductName.value;
  if (!productName) {
    return '';
  }
  return productName.endsWith('-') ? productName : productName + '-';
});
const masterScopeErrorMessage = computed(() => {
  if (!planningLevelOptions.includes(masterScopeForm.level as PlanningLevel)) {
    return '请先选择层级';
  }
  if (!masterScopeDepartmentCommitted.value || !masterScopeForm.planningDeptName.trim()) {
    return masterScopeForm.level === '产品级'
      ? '请选择产品所属部门并点击完成'
      : '请选择归属部门并点击完成';
  }
  if (masterScopeForm.level === '产品级' && !masterScopeForm.offeringName.trim()) {
    return '请选择产品';
  }
  return '';
});
const hasCompleteMasterScope = computed(() => !masterScopeErrorMessage.value);

function syncMasterDepartment(segments = masterDepartmentSegments.value): void {
  const nextSegments = normalizeDepartmentPath(segments).slice(0, 6);
  masterDepartmentSegments.value = nextSegments;
  masterScopeForm.planningDeptName = nextSegments[nextSegments.length - 1] ?? '';
}

function isMasterDepartmentSelectionAllowed(segments: string[]): boolean {
  if (props.restrictToAllowedDepartments && normalizedAllowedDepartmentPaths.value.length > 0) {
    return normalizedAllowedDepartmentPaths.value.some((allowedPath) =>
      departmentPathStartsWith(segments, allowedPath),
    );
  }
  const requiredPath = currentUserMinimumDepartmentPath.value;
  return requiredPath.length === 0 || departmentPathStartsWith(segments, requiredPath);
}

function guardMasterDepartmentSelection(segments: string[]): boolean {
  if (isMasterDepartmentSelectionAllowed(segments)) return true;
  showToast('请选择您所属的最细粒度部门或其下级部门。');
  return false;
}

function ensureMasterScopeSelection(notify = false): boolean {
  const message = masterScopeErrorMessage.value;
  if (!message) return true;
  if (notify) showToast(message);
  return false;
}

function clearMasterList(): void {
  records.value = [];
  associations.value = {};
}

function resolveCurrentDimCode(): string {
  if (masterScopeForm.level === '产品级') {
    return String(
      selectedMasterProduct.value?.offeringId || masterScopeForm.offeringId || '',
    ).trim();
  }
  const node = findMasterDepartmentNode(masterDepartmentSegments.value);
  return String(node?.deptCode ?? node?.id ?? '').trim();
}

function buildManagementQueryBody(): QuerySkillMasterManagementBody {
  const body: QuerySkillMasterManagementBody = {
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNum: 1,
    pageSize: 100,
  };
  const nextKeyword = keyword.value.trim();
  if (nextKeyword) {
    body.keyword = nextKeyword;
  }
  if (masterScopeForm.level) {
    body.dimType = masterScopeForm.level;
  }
  const dimCode = resolveCurrentDimCode();
  if (dimCode) {
    body.dimCode = dimCode;
  }
  return body;
}

function mapManagementItemToRecord(item: SkillMasterManagementItemDto): SkillMasterRecord {
  const skillName = String(item.skillName ?? '').trim();
  const ownerName = String(item.ownerName ?? '').trim();
  const ownerId = String(item.ownerId ?? '').trim();
  const developOwnerName = String(item.developOwnerName ?? '').trim();
  const developOwnerId = String(item.developOwnerId ?? '').trim();
  const dimType = String(item.dimType ?? '').trim();
  const dimName = String(item.dimName ?? '').trim();
  const statusText = String(item.status ?? '').trim() || '未开始';
  const now = new Date().toISOString();
  const id = String(item.id ?? '').trim() || skillName;
  return {
    id,
    name: skillName,
    description: String(item.skillDescription ?? '').trim(),
    level: dimType,
    product: dimType === '产品级' ? dimName : '',
    owner: `${ownerName} ${ownerId}`.trim(),
    department: dimType === '部门级' ? dimName : '',
    developOwner: `${developOwnerName} ${developOwnerId}`.trim(),
    developOwnerDepartment: '',
    plannedCompleteDate: String(item.planFinishDate ?? '').trim(),
    status: statusText as SkillMasterStatus,
    createdAt: now,
    updatedAt: now,
  };
}

function applyDefaultMasterScopeSelection(): boolean {
  const defaultPath = defaultMasterDepartmentPath.value;
  const changed =
    masterScopeForm.level !== '部门级' ||
    !sameDepartmentPath(masterDepartmentSegments.value, defaultPath) ||
    masterScopeDepartmentCommitted.value !== defaultPath.length > 0;

  masterScopeForm.level = '部门级';
  masterScopeForm.offeringId = '';
  masterScopeForm.offeringName = '';
  masterDepartmentSegments.value = [...defaultPath];
  syncMasterDepartment(defaultPath);
  masterScopeDepartmentCommitted.value = defaultPath.length > 0;
  return changed;
}

async function loadMasterProducts(): Promise<void> {
  const requestSeq = ++masterProductLoadSequence;
  masterScopeForm.offeringId = '';
  masterScopeForm.offeringName = '';
  masterProductOptions.value = [];
  masterProductsLoading.value = false;
  const departmentName = masterScopeForm.planningDeptName.trim();
  if (masterScopeForm.level !== '产品级' || !departmentName) return;

  masterProductsLoading.value = true;
  try {
    const departmentNode = findMasterDepartmentNode(masterDepartmentSegments.value);
    const deptCode = String(departmentNode?.deptCode ?? departmentNode?.id ?? '').trim();
    const options = await getProductPlanning('', departmentName, deptCode);
    if (requestSeq !== masterProductLoadSequence) return;
    masterProductOptions.value = options;
  } catch (error) {
    if (requestSeq !== masterProductLoadSequence) return;
    showToast(error instanceof Error ? error.message : '产品加载失败，请稍后重试');
  } finally {
    if (requestSeq === masterProductLoadSequence) {
      masterProductsLoading.value = false;
    }
  }
}
const filteredRecords = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return records.value.filter((record) => {
    if (!text) return true;
    return [record.name, record.description, record.owner, record.department, record.developOwner]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
});
const selectedMasterRecords = computed(() =>
  records.value.filter((record) => selectedMasterIds.value.includes(record.id)),
);
const hasSelectedMasterRows = computed(() => selectedMasterRecords.value.length > 0);
const allFilteredMasterRowsSelected = computed(
  () =>
    filteredRecords.value.length > 0 &&
    filteredRecords.value.every((record) => selectedMasterIds.value.includes(record.id)),
);
const metrics = computed(() => ({
  total: records.value.length,
  building: records.value.filter((record) => ['开发中', '联调中'].includes(record.status)).length,
  complete: records.value.filter((record) => record.status === '已完成').length,
}));

function associationFor(skillId: string): SkillMasterAssociation {
  return (
    associations.value[skillId] ?? {
      skillId,
      sceneIds: [],
      activityIds: [],
      planningDepartments: [],
      updatedAt: '',
    }
  );
}
function looksLikePersonLabel(value: string): boolean {
  return /\s+\S+$/.test(value.trim());
}

function personDisplayLabel(value: string): string {
  const normalized = value.trim();
  return personDisplayLabels.value[normalized] || normalized || '待认领';
}

function matchingPersonOption(
  options: SkillPlanningUserOption[],
  value: string,
): SkillPlanningUserOption | undefined {
  const normalized = value.trim();
  return options.find(
    (item) => item.label === normalized || item.id === normalized || item.chName === normalized,
  );
}

async function hydratePersonDisplayLabels(sourceRecords: SkillMasterRecord[]): Promise<void> {
  const sequence = ++personLabelLoadSequence;
  const values = [
    ...new Set(
      sourceRecords
        .flatMap((record) => [record.owner, record.developOwner])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const entries = await Promise.all(
    values.map(async (value) => {
      if (looksLikePersonLabel(value)) return [value, value] as const;
      try {
        const options = await querySkillPlanningUsers(value);
        return [value, matchingPersonOption(options, value)?.label || value] as const;
      } catch {
        return [value, value] as const;
      }
    }),
  );
  if (sequence === personLabelLoadSequence) {
    personDisplayLabels.value = Object.fromEntries(entries);
  }
}

async function reload(options: { notifyOnMissingScope?: boolean } = {}): Promise<void> {
  if (!ensureMasterScopeSelection(Boolean(options.notifyOnMissingScope))) {
    clearMasterList();
    masterLoading.value = false;
    return;
  }
  masterLoading.value = true;
  try {
    const response = await skillBaseService.querySkillMasterManagement(buildManagementQueryBody());
    if (response?.meta?.success !== true) {
      throw new Error(
        String(response?.meta?.message || response?.message || 'Skill 查询失败，请稍后重试'),
      );
    }
    const rows = Array.isArray(response?.data) ? response.data : [];
    const nextRecords = rows.map((item: SkillMasterManagementItemDto) =>
      mapManagementItemToRecord(item),
    );
    records.value = nextRecords;
    const nextRecordIds = new Set(nextRecords.map((record) => record.id));
    selectedMasterIds.value = selectedMasterIds.value.filter((id) => nextRecordIds.has(id));
    associations.value = Object.fromEntries(
      records.value.map((record) => [record.id, getSkillMasterAssociation(record.id)]),
    );
    void hydratePersonDisplayLabels(records.value);
  } catch (error) {
    clearMasterList();
    showToast(error instanceof Error ? error.message : 'Skill 查询失败，请稍后重试');
  } finally {
    masterLoading.value = false;
  }
}
function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2400);
}
function resetPersonPicker(picker: PersonPickerState): void {
  if (picker === ownerPicker) {
    clearOwnerSearchTimer();
    ownerSearchSequence += 1;
  } else if (picker === developOwnerPicker) {
    clearDevelopOwnerSearchTimer();
    developOwnerSearchSequence += 1;
  }
  Object.assign(picker, createPersonPickerState());
}

function resetEditor(): void {
  Object.assign(editor, {
    id: '',
    name: '',
    description: '',
    level: '',
    product: '',
    owner: '',
    department: '',
    developOwner: '',
    developOwnerDepartment: '',
    plannedCompleteDate: '',
    status: '未开始',
    error: '',
  });
  Object.assign(initialOwnerValue, createEmptyPersonSubmitValue());
  Object.assign(initialDevelopOwnerValue, createEmptyPersonSubmitValue());
  resetPersonPicker(ownerPicker);
  resetPersonPicker(developOwnerPicker);
}

function applyCurrentScopeToEditor(): void {
  editor.level = masterScopeForm.level;
  editor.product = masterScopeForm.level === '产品级' ? masterScopeForm.offeringName.trim() : '';
}

function ensureProductSkillNamePrefix(): boolean {
  const prefix = requiredSkillNamePrefix.value;
  if (!prefix) {
    return true;
  }
  const name = editor.name.trim();
  if (!name.startsWith(prefix)) {
    editor.error = '产品级 Skill 名称需以“' + prefix + '”开头';
    return false;
  }
  if (name.length === prefix.length) {
    editor.error = '请在“' + prefix + '”后补充 Skill 名称';
    return false;
  }
  return true;
}

function resolveDimFields(): { dimType: string; dimCode: string; dimName: string } | null {
  if (!ensureMasterScopeSelection(true)) {
    return null;
  }
  const dimType = masterScopeForm.level;
  if (dimType === '产品级') {
    const dimCode = String(
      selectedMasterProduct.value?.offeringId || masterScopeForm.offeringId || '',
    ).trim();
    const dimName = masterScopeForm.offeringName.trim();
    if (!dimCode || !dimName) {
      editor.error = '请选择有效产品（需包含产品编码）';
      return null;
    }
    return {
      dimType,
      dimCode,
      dimName,
    };
  }
  const node = findMasterDepartmentNode(masterDepartmentSegments.value);
  const dimCode = String(node?.deptCode ?? node?.id ?? '').trim();
  const dimName = masterScopeForm.planningDeptName.trim();
  if (!dimCode || !dimName) {
    editor.error = '请选择有效归属部门（需包含部门编码）';
    return null;
  }
  return {
    dimType,
    dimCode,
    dimName,
  };
}

function clearOwnerSearchTimer(): void {
  if (ownerSearchTimer !== null) {
    window.clearTimeout(ownerSearchTimer);
    ownerSearchTimer = null;
  }
}

function clearDevelopOwnerSearchTimer(): void {
  if (developOwnerSearchTimer !== null) {
    window.clearTimeout(developOwnerSearchTimer);
    developOwnerSearchTimer = null;
  }
}

function closeOwnerPersonSearch(): void {
  ownerPicker.open = false;
  clearOwnerSearchTimer();
  ownerSearchSequence += 1;
  ownerPicker.loading = false;
}

function closeDevelopOwnerPersonSearch(): void {
  developOwnerPicker.open = false;
  clearDevelopOwnerSearchTimer();
  developOwnerSearchSequence += 1;
  developOwnerPicker.loading = false;
}

function applyOwnerSelection(option: SkillPlanningUserOption): void {
  ownerPicker.selected = option;
  ownerPicker.keyword = option.label;
  closeOwnerPersonSearch();
  editor.owner = option.label;
  editor.department = option.deptName;
}

function applyDevelopOwnerSelection(option: SkillPlanningUserOption): void {
  developOwnerPicker.selected = option;
  developOwnerPicker.keyword = option.label;
  closeDevelopOwnerPersonSearch();
  editor.developOwner = option.label;
  editor.developOwnerDepartment = option.deptName;
}

function selectOwner(option: SkillPlanningUserOption): void {
  applyOwnerSelection(option);
}

function selectDevelopOwner(option: SkillPlanningUserOption): void {
  applyDevelopOwnerSelection(option);
}

async function searchOwnerUsers(keyword = ownerPicker.keyword): Promise<void> {
  const text = keyword.trim();
  ownerPicker.open = true;
  ownerPicker.message = '';
  if (!text) {
    ownerSearchSequence += 1;
    ownerPicker.loading = false;
    ownerPicker.options = [];
    ownerPicker.message = '请输入人员信息';
    return;
  }

  const requestSeq = ++ownerSearchSequence;
  ownerPicker.loading = true;
  try {
    const options = await querySkillPlanningUsers(text);
    if (requestSeq !== ownerSearchSequence) {
      return;
    }
    ownerPicker.options = options;
    ownerPicker.message = options.length > 0 ? '' : '暂无匹配人员';
  } catch (error) {
    if (requestSeq !== ownerSearchSequence) {
      return;
    }
    ownerPicker.options = [];
    ownerPicker.message = error instanceof Error ? error.message : '人员查询失败，请稍后重试';
  } finally {
    if (requestSeq === ownerSearchSequence) {
      ownerPicker.loading = false;
    }
  }
}

async function searchDevelopOwnerUsers(keyword = developOwnerPicker.keyword): Promise<void> {
  const text = keyword.trim();
  developOwnerPicker.open = true;
  developOwnerPicker.message = '';
  if (!text) {
    developOwnerSearchSequence += 1;
    developOwnerPicker.loading = false;
    developOwnerPicker.options = [];
    developOwnerPicker.message = '请输入人员信息';
    return;
  }

  const requestSeq = ++developOwnerSearchSequence;
  developOwnerPicker.loading = true;
  try {
    const options = await querySkillPlanningUsers(text);
    if (requestSeq !== developOwnerSearchSequence) {
      return;
    }
    developOwnerPicker.options = options;
    developOwnerPicker.message = options.length > 0 ? '' : '暂无匹配人员';
  } catch (error) {
    if (requestSeq !== developOwnerSearchSequence) {
      return;
    }
    developOwnerPicker.options = [];
    developOwnerPicker.message =
      error instanceof Error ? error.message : '人员查询失败，请稍后重试';
  } finally {
    if (requestSeq === developOwnerSearchSequence) {
      developOwnerPicker.loading = false;
    }
  }
}

function onOwnerPickerFocus(): void {
  ownerPicker.open = true;
  if (ownerPicker.keyword.trim()) {
    void searchOwnerUsers();
  } else {
    ownerSearchSequence += 1;
    ownerPicker.loading = false;
    ownerPicker.options = [];
    ownerPicker.message = '请输入人员信息';
  }
}

function onDevelopOwnerPickerFocus(): void {
  developOwnerPicker.open = true;
  if (developOwnerPicker.keyword.trim()) {
    void searchDevelopOwnerUsers();
  } else {
    developOwnerSearchSequence += 1;
    developOwnerPicker.loading = false;
    developOwnerPicker.options = [];
    developOwnerPicker.message = '请输入人员信息';
  }
}

function onOwnerPickerInput(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const nextKeyword = target?.value ?? '';
  ownerPicker.keyword = nextKeyword;
  ownerPicker.open = true;
  if (!ownerPicker.selected || ownerPicker.selected.label !== nextKeyword) {
    ownerPicker.selected = null;
    editor.owner = nextKeyword;
    editor.department = '';
  }
  clearOwnerSearchTimer();
  ownerSearchTimer = window.setTimeout(() => {
    void searchOwnerUsers();
  }, 250);
}

function onDevelopOwnerPickerInput(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const nextKeyword = target?.value ?? '';
  developOwnerPicker.keyword = nextKeyword;
  developOwnerPicker.open = true;
  if (!developOwnerPicker.selected || developOwnerPicker.selected.label !== nextKeyword) {
    developOwnerPicker.selected = null;
    editor.developOwner = nextKeyword;
    editor.developOwnerDepartment = '';
  }
  clearDevelopOwnerSearchTimer();
  developOwnerSearchTimer = window.setTimeout(() => {
    void searchDevelopOwnerUsers();
  }, 250);
}

function ensureOwnerSelection(): boolean {
  if (ownerPicker.selected) {
    applyOwnerSelection(ownerPicker.selected);
    return true;
  }
  if (editor.mode === 'create') {
    return false;
  }
  return Boolean(editor.owner.trim() && editor.department.trim());
}

function ensureDevelopOwnerSelection(): boolean {
  if (developOwnerPicker.selected) {
    applyDevelopOwnerSelection(developOwnerPicker.selected);
    return true;
  }
  if (editor.mode === 'create') {
    return false;
  }
  if (!editor.developOwner.trim()) {
    editor.developOwnerDepartment = '';
    return true;
  }
  return Boolean(editor.developOwnerDepartment.trim());
}

function hydratePickerFromValue(
  picker: PersonPickerState,
  value: string,
  department = '',
): void {
  resetPersonPicker(picker);
  const label = value.trim();
  if (!label) {
    return;
  }
  picker.keyword = label;
  const parsed = parsePersonSubmitValue(label);
  if (looksLikePersonLabel(label) && parsed.id) {
    picker.selected = {
      id: parsed.id,
      chName: parsed.name,
      label,
      deptName: department.trim(),
      raw: {},
    };
  }
}

function resolvePersonForSubmit(
  picker: PersonPickerState,
  initialValue: PersonSubmitValue,
  role: 'owner' | 'developOwner',
): PersonSubmitValue | null {
  if (picker.selected) {
    return {
      label: picker.selected.label,
      name: picker.selected.chName || picker.selected.label,
      id: picker.selected.id,
    };
  }
  const currentLabel = picker.keyword.trim();
  if (
    editor.mode === 'edit' &&
    currentLabel &&
    currentLabel === initialValue.label &&
    initialValue.id
  ) {
    return {
      label: initialValue.label,
      name: initialValue.name,
      id: initialValue.id,
    };
  }
  if (editor.mode === 'edit' && role === 'developOwner' && !currentLabel && !initialValue.label) {
    return createEmptyPersonSubmitValue();
  }
  return null;
}

function openCreate(): void {
  if (!ensureMasterScopeSelection(true)) {
    return;
  }
  resetEditor();
  editor.mode = 'create';
  applyCurrentScopeToEditor();
  editor.name = requiredSkillNamePrefix.value;
  editor.open = true;
}

function openEdit(record: SkillMasterRecord): void {
  const ownerLabel = personDisplayLabel(record.owner);
  const developOwnerLabel = personDisplayLabel(record.developOwner);
  const nextOwnerLabel = ownerLabel === '待认领' ? '' : ownerLabel;
  const nextDevelopOwnerLabel = developOwnerLabel === '待认领' ? '' : developOwnerLabel;
  Object.assign(editor, {
    open: true,
    mode: 'edit',
    id: record.id,
    name: record.name,
    description: record.description,
    level: record.level,
    product: record.product,
    owner: nextOwnerLabel,
    department: record.department,
    developOwner: nextDevelopOwnerLabel,
    developOwnerDepartment: record.developOwnerDepartment || '',
    plannedCompleteDate: record.plannedCompleteDate,
    status: record.status,
    error: '',
  });
  Object.assign(initialOwnerValue, parsePersonSubmitValue(nextOwnerLabel));
  Object.assign(initialDevelopOwnerValue, parsePersonSubmitValue(nextDevelopOwnerLabel));
  hydratePickerFromValue(ownerPicker, nextOwnerLabel, editor.department);
  hydratePickerFromValue(
    developOwnerPicker,
    nextDevelopOwnerLabel,
    editor.developOwnerDepartment,
  );
  applyCurrentScopeToEditor();
}

function closeEditor(): void {
  editor.open = false;
  editor.error = '';
  editorOverlayPointerStartedOnBackdrop.value = false;
  Object.assign(initialOwnerValue, createEmptyPersonSubmitValue());
  Object.assign(initialDevelopOwnerValue, createEmptyPersonSubmitValue());
  resetPersonPicker(ownerPicker);
  resetPersonPicker(developOwnerPicker);
}

function onEditorOverlayPointerDown(event: PointerEvent): void {
  editorOverlayPointerStartedOnBackdrop.value = event.target === event.currentTarget;
}

function onEditorOverlayPointerUp(event: PointerEvent): void {
  const endedOnBackdrop = event.target === event.currentTarget;
  if (editorOverlayPointerStartedOnBackdrop.value && endedOnBackdrop) {
    closeEditor();
  }
  editorOverlayPointerStartedOnBackdrop.value = false;
}

async function submitEditor(): Promise<void> {
  if (submitting.value) {
    return;
  }
  applyCurrentScopeToEditor();
  editor.error = '';

  if (editor.mode === 'create') {
    const dim = resolveDimFields();
    if (!dim) {
      return;
    }
    if (!editor.name.trim()) {
      editor.error = '请填写 Skill 名称';
      return;
    }
    if (!ensureProductSkillNamePrefix()) {
      return;
    }
    if (!editor.description.trim()) {
      editor.error = '请填写 Skill 说明';
      return;
    }
    if (!ownerPicker.selected) {
      editor.error = '请从搜索结果中点选责任 Owner，禁止自由文本直接提交';
      return;
    }
    if (!developOwnerPicker.selected) {
      editor.error = '请从搜索结果中点选开发责任人，禁止自由文本直接提交';
      return;
    }
    if (!editor.plannedCompleteDate) {
      editor.error = '请选择计划完成时间';
      return;
    }

    const body: CreateSkillMasterManagementBody = {
      skillName: editor.name.trim(),
      skillDescription: editor.description.trim(),
      dimType: dim.dimType,
      dimCode: dim.dimCode,
      dimName: dim.dimName,
      ownerName: ownerPicker.selected.chName || ownerPicker.selected.label,
      ownerId: ownerPicker.selected.id,
      developOwnerName:
        developOwnerPicker.selected.chName || developOwnerPicker.selected.label,
      developOwnerId: developOwnerPicker.selected.id,
      planFinishDate: editor.plannedCompleteDate,
    };

    submitting.value = true;
    try {
      const response = await skillBaseService.createSkillMasterManagement(body);
      if (response?.meta?.success !== true) {
        throw new Error(
          String(response?.meta?.message || response?.message || '新增失败，请稍后重试'),
        );
      }
      closeEditor();
      await reload();
      showToast('Skill 已添加，可前往 Skill 规划复用');
    } catch (error) {
      editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
    } finally {
      submitting.value = false;
    }
    return;
  }

  const dim = resolveDimFields();
  if (!dim) {
    return;
  }
  if (!editor.id.trim()) {
    editor.error = '缺少 Skill id，请刷新列表后重试';
    return;
  }
  if (!editor.name.trim()) {
    editor.error = '请填写 Skill 名称';
    return;
  }
  if (!ensureProductSkillNamePrefix()) {
    return;
  }
  if (!editor.description.trim()) {
    editor.error = '请填写 Skill 说明';
    return;
  }
  const ownerValue = resolvePersonForSubmit(ownerPicker, initialOwnerValue, 'owner');
  if (!ownerValue || !ownerValue.id) {
    editor.error = '请从搜索结果中点选责任 Owner，禁止自由文本直接提交';
    return;
  }
  const developOwnerValue = resolvePersonForSubmit(
    developOwnerPicker,
    initialDevelopOwnerValue,
    'developOwner',
  );
  if (!developOwnerValue || !developOwnerValue.id) {
    editor.error = '请从搜索结果中点选开发责任人，禁止自由文本直接提交';
    return;
  }
  if (!editor.plannedCompleteDate) {
    editor.error = '请选择计划完成时间';
    return;
  }

  const updateBody: UpdateSkillMasterManagementBody = {
    id: editor.id,
    skillName: editor.name.trim(),
    skillDescription: editor.description.trim(),
    dimType: dim.dimType,
    dimCode: dim.dimCode,
    dimName: dim.dimName,
    ownerName: ownerValue.name,
    ownerId: ownerValue.id,
    developOwnerName: developOwnerValue.name,
    developOwnerId: developOwnerValue.id,
    planFinishDate: editor.plannedCompleteDate,
  };

  submitting.value = true;
  try {
    const response = await skillBaseService.updateSkillMasterManagement(updateBody);
    if (response?.meta?.success !== true) {
      throw new Error(
        String(response?.meta?.message || response?.message || '更新失败，请稍后重试'),
      );
    }
    closeEditor();
    await reload();
    showToast('Skill 主体信息已更新');
  } catch (error) {
    editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
function openAssociation(record: SkillMasterRecord): void {
  const association = getSkillMasterAssociation(record.id);
  Object.assign(associationEditor, {
    open: true,
    skillId: record.id,
    skillName: record.name,
    sceneIds: [...association.sceneIds],
    activityIds: [...association.activityIds],
    planningDepartments: [...association.planningDepartments],
  });
  departmentPath.value = [];
  sceneOptions.value = makeTaxonomyOptions(listScenes());
  activityOptions.value = makeTaxonomyOptions(listActivities());
}
function closeAssociation(): void {
  associationEditor.open = false;
  departmentPath.value = [];
}
function addPlanningDepartment(path: string[]): void {
  const name = path[path.length - 1]?.trim();
  if (name && !associationEditor.planningDepartments.includes(name)) {
    associationEditor.planningDepartments.push(name);
  }
  departmentPath.value = [];
}
function removePlanningDepartment(name: string): void {
  associationEditor.planningDepartments = associationEditor.planningDepartments.filter(
    (item) => item !== name,
  );
}
function saveAssociation(): void {
  const saved = saveSkillMasterAssociation({
    skillId: associationEditor.skillId,
    sceneIds: associationEditor.sceneIds,
    activityIds: associationEditor.activityIds,
    planningDepartments: associationEditor.planningDepartments,
  });
  associations.value = { ...associations.value, [saved.skillId]: saved };
  closeAssociation();
  showToast('Skill 关联范围已更新');
}
function requestDelete(record: SkillMasterRecord): void {
  Object.assign(deleteDialog, { open: true, id: record.id, name: record.name });
}
async function confirmDelete(): Promise<void> {
  const id = String(deleteDialog.id ?? '').trim();
  if (!id) {
    showToast('缺少 Skill id，请刷新后重试');
    deleteDialog.open = false;
    return;
  }
  try {
    const response = await skillBaseService.deleteSkillMasterManagement(id);
    if (response?.meta?.success !== true) {
      throw new Error(
        String(response?.meta?.message || response?.message || '删除失败，请稍后重试'),
      );
    }
    removeSkillMasterAssociation(id);
    selectedMasterIds.value = selectedMasterIds.value.filter((item) => item !== id);
    deleteDialog.open = false;
    await reload();
    showToast('Skill 已删除');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败，请稍后重试');
  }
}

function toggleMasterSelection(id: string): void {
  selectedMasterIds.value = selectedMasterIds.value.includes(id)
    ? selectedMasterIds.value.filter((item) => item !== id)
    : [...selectedMasterIds.value, id];
}

function toggleAllMasterSelection(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  const visibleIds = filteredRecords.value.map((record) => record.id);
  if (checked) {
    selectedMasterIds.value = Array.from(new Set([...selectedMasterIds.value, ...visibleIds]));
    return;
  }
  selectedMasterIds.value = selectedMasterIds.value.filter((id) => !visibleIds.includes(id));
}

function triggerMasterImport(): void {
  showToast('Skill 清单导入能力待接入');
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportCurrentMasterData(): void {
  const rows = filteredRecords.value;
  if (rows.length === 0) {
    showToast('暂无可导出的 Skill 清单');
    return;
  }
  const headers = ['Skill', '描述', '责任 Owner', '归属部门', '开发责任人', '计划完成', '当前进展'];
  const lines = rows.map((record) =>
    [
      record.name,
      record.description,
      personDisplayLabel(record.owner),
      record.department,
      personDisplayLabel(record.developOwner),
      record.plannedCompleteDate,
      record.status,
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob([`\ufeff${headers.map(csvCell).join(',')}\n${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Skill清单.csv';
  link.click();
  URL.revokeObjectURL(url);
  showToast('已导出 Skill 清单');
}

function openBatchMasterEditDialog(): void {
  if (!hasSelectedMasterRows.value) {
    showToast('请先勾选至少一条需要批量修改的数据');
    return;
  }
  showToast('Skill 清单批量修改能力待接入');
}

function requestBatchMasterDelete(): void {
  if (!hasSelectedMasterRows.value) {
    showToast('请先勾选需要批量删除的数据');
    return;
  }
  Object.assign(batchDeleteDialog, { open: true, ids: [...selectedMasterIds.value] });
}

async function confirmBatchMasterDelete(): Promise<void> {
  const ids = [...batchDeleteDialog.ids].map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    showToast('请先勾选需要批量删除的数据');
    return;
  }
  try {
    const response = await skillBaseService.batchDeleteSkillMasterManagement(ids);
    if (response?.meta?.success !== true) {
      throw new Error(
        String(response?.meta?.message || response?.message || '批量删除失败，请稍后重试'),
      );
    }
    ids.forEach((id) => {
      removeSkillMasterAssociation(id);
    });
    batchDeleteDialog.open = false;
    selectedMasterIds.value = selectedMasterIds.value.filter((id) => !ids.includes(id));
    await reload();
    showToast(`已删除 ${ids.length} 条 Skill`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '批量删除失败，请稍后重试');
  }
}
async function onMasterScopeLevelChange(): Promise<void> {
  const defaultPath = defaultMasterDepartmentPath.value;
  masterScopeDepartmentCommitted.value = defaultPath.length > 0;
  masterDepartmentSegments.value = [...defaultPath];
  syncMasterDepartment(defaultPath);
  await loadMasterProducts();
  await reload();
}

function onMasterDepartmentChange(segments: string[]): void {
  masterScopeDepartmentCommitted.value = false;
  syncMasterDepartment(segments);
}

async function applyMasterDepartmentQuery(segments: string[]): Promise<void> {
  masterDepartmentSegments.value = normalizeDepartmentPath(segments).slice(0, 6);
  syncMasterDepartment(masterDepartmentSegments.value);
  masterScopeDepartmentCommitted.value = masterDepartmentSegments.value.length > 0;
  await loadMasterProducts();
  await reload();
}

async function onMasterDepartmentDone(segments: string[]): Promise<void> {
  await applyMasterDepartmentQuery(segments);
}

async function onMasterDepartmentClear(segments: string[] = []): Promise<void> {
  await applyMasterDepartmentQuery(segments);
}

async function onMasterProductChange(): Promise<void> {
  masterScopeForm.offeringId = selectedMasterProduct.value?.offeringId ?? '';
  await reload();
}

async function applyMasterQuery(): Promise<void> {
  await reload({ notifyOnMissingScope: true });
}

async function resetMasterQuery(): Promise<void> {
  keyword.value = '';
  applyDefaultMasterScopeSelection();
  await loadMasterProducts();
  await reload();
}

watch(
  () => [props.currentUserDepartmentPath, props.allowedDepartmentPaths],
  () => {
    applyDefaultMasterScopeSelection();
    void loadMasterProducts().then(() => reload());
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  clearOwnerSearchTimer();
  clearDevelopOwnerSearchTimer();
});
</script>

<template>
  <section class="master-panel" aria-label="Skill 管理">
    <section class="master-filter-card" aria-label="Skill 清单查询">
      <div
        class="master-scope-controls"
        :class="{ 'is-department-level': masterScopeForm.level === '部门级' }"
      >
        <label class="master-scope-field master-scope-field--level">
          <span>层级 <em>*</em></span>
          <select v-model="masterScopeForm.level" @change="onMasterScopeLevelChange">
            <option
              v-for="item in planningLevelOptions"
              :key="`master-level-${item}`"
              :value="item"
            >
              {{ item }}
            </option>
          </select>
        </label>
        <div class="master-scope-field master-scope-field--dept">
          <span>{{ masterScopeForm.level === '产品级' ? '产品所属部门 *' : '归属部门 *' }}</span>
          <MarketDeptCascader
            v-model="masterDepartmentSegments"
            class="master-dept-cascader"
            :tree="masterDepartmentTree"
            :max-level="6"
            :disabled="!masterScopeForm.level"
            :all-label="masterScopeForm.level ? '请选择部门' : '请先选择层级'"
            clear-behavior="reset"
            :clear-value="defaultMasterDepartmentPath"
            clear-text="恢复默认选择"
            selection-mode="confirm"
            permission-mode="review-center"
            :permission-path="legacyMasterPermissionPath"
            :before-done="guardMasterDepartmentSelection"
            searchable
            aria-label="按部门筛选 Skill 清单"
            @change="onMasterDepartmentChange"
            @clear="onMasterDepartmentClear"
            @done="onMasterDepartmentDone"
          />
        </div>
        <label v-if="masterScopeForm.level === '产品级'" class="master-scope-field">
          <span>产品 <em>*</em></span>
          <select
            v-model="masterScopeForm.offeringName"
            :disabled="!masterScopeForm.planningDeptName || masterProductsLoading"
            @change="onMasterProductChange"
          >
            <option value="">
              {{
                !masterScopeForm.planningDeptName
                  ? '请先选择部门'
                  : masterProductsLoading
                    ? '产品加载中...'
                    : '请选择产品'
              }}
            </option>
            <option
              v-for="item in masterProductOptions"
              :key="item.offeringId || item.offeringName"
              :value="item.offeringName"
            >
              {{ item.offeringName }}
            </option>
          </select>
        </label>
        <label class="master-scope-field master-scope-field--keyword">
          <span>关键词</span>
          <input
            v-model.trim="keyword"
            type="search"
            placeholder="搜索 Skill 或 Owner"
            @keydown.enter.prevent="applyMasterQuery"
          />
        </label>
        <div class="master-scope-actions">
          <button class="master-btn master-btn--primary" type="button" @click="applyMasterQuery">
            查询
          </button>
          <button class="master-btn master-btn--ghost" type="button" @click="resetMasterQuery">
            重置
          </button>
        </div>
      </div>
    </section>

    <div class="master-board">
      <header class="master-toolbar">
        <div class="master-toolbar__title">
          <strong>Skill 原子清单</strong>
          <small
            >已选 {{ selectedMasterIds.length }} 条 / 共 {{ filteredRecords.length }} 条 ·
            可被不同部门的规划复用</small
          >
        </div>
        <div class="toolbar-actions">
          <button
            class="master-btn master-btn--primary"
            type="button"
            :disabled="!hasCompleteMasterScope"
            :title="masterScopeErrorMessage || '新增 Skill'"
            @click="openCreate"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增
          </button>
          <button class="master-btn master-btn--soft" type="button" @click="triggerMasterImport">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10m0-10 4 4m-4-4-4 4M5 17v2h14v-2" />
            </svg>
            导入
          </button>
          <button
            class="master-btn master-btn--soft"
            type="button"
            @click="exportCurrentMasterData"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20V10m0 10 4-4m-4 4-4-4M5 7V5h14v2" />
            </svg>
            导出
          </button>
          <button
            v-if="false"
            class="master-btn master-btn--soft"
            type="button"
            @click="openBatchMasterEditDialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 16 1 4 4-1L18.5 9.5a2.1 2.1 0 0 0-3-3L6 16Z" />
              <path d="m13.5 7.5 3 3" />
            </svg>
            批量修改
          </button>
          <button
            class="master-btn master-btn--danger-soft"
            type="button"
            @click="requestBatchMasterDelete"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
            </svg>
            批量删除
          </button>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <colgroup>
            <col class="selection-column" />
            <col class="skill-column" />
            <col class="description-column" />
            <col class="owner-column" />
            <col class="develop-owner-column" />
            <col class="date-column" />
            <col class="status-column" />
            <col class="action-column" />
          </colgroup>
          <thead>
            <tr>
              <th class="selection-cell">
                <input
                  type="checkbox"
                  :checked="allFilteredMasterRowsSelected"
                  :disabled="filteredRecords.length === 0 || masterLoading"
                  aria-label="全选 Skill 清单"
                  @change="toggleAllMasterSelection"
                />
              </th>
              <th>Skill</th>
              <th>描述</th>
              <!-- <th>层级</th> -->
              <!-- <th>产品 / 服务</th> -->
              <th>责任 Owner</th>
              <!-- <th title="随责任 Owner 自动变化">Owner 所在部门</th> -->
              <!-- <th>关联范围</th> -->
              <th>开发责任人</th>
              <th>计划完成</th>
              <th>当前进展</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="masterLoading">
              <td colspan="8" class="empty">正在加载 Skill 清单...</td>
            </tr>
            <tr v-for="record in masterLoading ? [] : filteredRecords" :key="record.id">
              <td class="selection-cell">
                <input
                  type="checkbox"
                  :checked="selectedMasterIds.includes(record.id)"
                  :aria-label="`选择 ${record.name}`"
                  @change="toggleMasterSelection(record.id)"
                />
              </td>
              <td>
                <div class="name-cell">
                  <i>{{ record.name.slice(0, 1) }}</i
                  ><span
                    ><strong>{{ record.name }}</strong></span
                  >
                </div>
              </td>
              <td>{{ record.description || '无' }}</td>
              <!-- <td>
                <span class="badge level">{{ record.level }}</span>
              </td> -->
              <!-- <td>{{ record.product || '待明确' }}</td> -->
              <td class="person-column">{{ personDisplayLabel(record.owner) }}</td>
              <!-- <td>{{ record.department || '随 Owner 自动带出' }}</td> -->
              <!-- <td>
                <div class="association-summary">
                  <span>场景 {{ associationFor(record.id).sceneIds.length }}</span
                  ><span>活动 {{ associationFor(record.id).activityIds.length }}</span
                  ><span>规划部门 {{ associationFor(record.id).planningDepartments.length }}</span>
                </div>
              </td> -->
              <td class="person-column">{{ personDisplayLabel(record.developOwner) }}</td>
              <td>{{ record.plannedCompleteDate || '无' }}</td>
              <td>
                <span class="badge status" :class="'is-' + record.status">{{ record.status }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <button type="button" @click="openEdit(record)">编辑</button
                  ><button class="danger" type="button" @click="requestDelete(record)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!masterLoading && filteredRecords.length === 0">
              <td colspan="8" class="empty">
                {{ hasCompleteMasterScope ? '暂无符合条件的 Skill' : masterScopeErrorMessage }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="editor.open"
        class="overlay"
        @pointerdown="onEditorOverlayPointerDown"
        @pointerup="onEditorOverlayPointerUp"
      >
        <form
          class="dialog"
          @click.stop
          @pointerdown.stop
          @pointerup.stop
          @submit.prevent="submitEditor"
        >
          <header>
            <div>
              <small>SKILL MASTER</small
              ><strong>{{ editor.mode === 'create' ? '添加 Skill' : '编辑 Skill' }}</strong>
              <p>
                这里只维护可复用的原子 Skill；场景、活动、层级和部门/产品请在 Skill 规划中配置。
              </p>
            </div>
            <button type="button" @click="closeEditor">×</button>
          </header>
          <div class="note">
            <b>部门语义</b><span>Owner 所在部门是人员属性，不作为 Skill 的规划归属。</span>
          </div>
          <div class="form-grid">
            <label class="wide"
              ><span>Skill 名称 *</span
              ><input
                v-model.trim="editor.name"
                maxlength="60"
                :placeholder="requiredSkillNamePrefix || '请输入 Skill 名称'"
              /><small v-if="requiredSkillNamePrefix" class="field-hint"
                >需以“{{ requiredSkillNamePrefix }}”开头</small
              ></label
            >
            <label class="wide"
              ><span>Skill 说明 *</span
              ><textarea v-model.trim="editor.description" maxlength="300" rows="4"></textarea>
            </label>
            <label class="owner-picker person-search" @keydown.esc="closeOwnerPersonSearch">
              <span>责任 Owner *</span>
              <input
                :value="ownerPicker.keyword"
                type="text"
                autocomplete="off"
                placeholder="输入姓名或工号后选择"
                @focus="onOwnerPickerFocus"
                @input="onOwnerPickerInput"
              />
              <div v-if="ownerPicker.open" class="person-search__panel" @mousedown.stop>
                <span v-if="ownerPicker.loading" class="person-search__empty">查询中...</span>
                <template v-else>
                  <button
                    v-for="option in ownerPicker.options"
                    :key="option.id || option.label"
                    type="button"
                    @click="selectOwner(option)"
                  >
                    <span
                      ><strong>{{ option.chName || option.label }}</strong
                      ><small>{{ option.id }}</small></span
                    >
                    <em>{{ option.deptName || '部门信息待补充' }}</em>
                  </button>
                  <span v-if="ownerPicker.message" class="person-search__empty">{{
                    ownerPicker.message
                  }}</span>
                </template>
              </div>
            </label>
            <!-- <label
              ><span>Owner 所在部门</span
              ><input v-model.trim="editor.department" placeholder="由 Owner 资料自动带出" readonly
            /></label> -->
            <label
              class="develop-owner-picker person-search"
              @keydown.esc="closeDevelopOwnerPersonSearch"
            >
              <span>开发责任人 *</span>
              <input
                :value="developOwnerPicker.keyword"
                type="text"
                autocomplete="off"
                placeholder="输入姓名或工号后选择"
                @focus="onDevelopOwnerPickerFocus"
                @input="onDevelopOwnerPickerInput"
              />
              <div v-if="developOwnerPicker.open" class="person-search__panel" @mousedown.stop>
                <span v-if="developOwnerPicker.loading" class="person-search__empty"
                  >查询中...</span
                >
                <template v-else>
                  <button
                    v-for="option in developOwnerPicker.options"
                    :key="option.id || option.label"
                    type="button"
                    @click="selectDevelopOwner(option)"
                  >
                    <span
                      ><strong>{{ option.chName || option.label }}</strong
                      ><small>{{ option.id }}</small></span
                    >
                    <em>{{ option.deptName || '部门信息待补充' }}</em>
                  </button>
                  <span v-if="developOwnerPicker.message" class="person-search__empty">{{
                    developOwnerPicker.message
                  }}</span>
                </template>
              </div>
            </label>
            <label
              ><span>计划完成时间 *</span
              ><input v-model="editor.plannedCompleteDate" type="date"
            /></label>
          </div>
          <p v-if="editor.error" class="error">{{ editor.error }}</p>
          <footer>
            <button type="button" @click="closeEditor">取消</button
            ><button class="primary" type="submit" :disabled="submitting">保存</button>
          </footer>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="associationEditor.open" class="overlay" @click.self="closeAssociation">
        <div class="dialog association-dialog">
          <header>
            <div>
              <small>SKILL RELATIONS</small
              ><strong>关联范围 · {{ associationEditor.skillName }}</strong>
              <p>可同时关联多个场景、活动和规划部门。</p>
            </div>
            <button type="button" @click="closeAssociation">×</button>
          </header>
          <div class="association-grid">
            <section>
              <header>
                <strong>场景</strong><span>已选 {{ associationEditor.sceneIds.length }}</span>
              </header>
              <div class="option-list">
                <label v-for="item in sceneOptions" :key="item.id"
                  ><input
                    v-model="associationEditor.sceneIds"
                    type="checkbox"
                    :value="item.id"
                  /><span>{{ item.label }}</span></label
                >
              </div>
            </section>
            <section>
              <header>
                <strong>活动</strong><span>已选 {{ associationEditor.activityIds.length }}</span>
              </header>
              <div class="option-list">
                <label v-for="item in activityOptions" :key="item.id"
                  ><input
                    v-model="associationEditor.activityIds"
                    type="checkbox"
                    :value="item.id"
                  /><span>{{ item.label }}</span></label
                >
              </div>
            </section>
            <section class="department-section">
              <header>
                <strong>规划部门</strong
                ><span>已选 {{ associationEditor.planningDepartments.length }}</span>
              </header>
              <MarketDeptCascader
                v-model="departmentPath"
                :tree="props.departmentTree"
                selection-mode="confirm"
                all-label="选择要关联的规划部门"
                done-text="添加部门"
                @done="addPlanningDepartment"
              />
              <div class="department-tags">
                <span v-for="item in associationEditor.planningDepartments" :key="item"
                  >{{ item
                  }}<button
                    type="button"
                    :aria-label="'移除' + item"
                    @click="removePlanningDepartment(item)"
                  >
                    ×
                  </button></span
                ><small v-if="associationEditor.planningDepartments.length === 0"
                  >暂未关联规划部门</small
                >
              </div>
            </section>
          </div>
          <footer>
            <button type="button" @click="closeAssociation">取消</button
            ><button class="primary" type="button" @click="saveAssociation">保存关联</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="deleteDialog.open" class="overlay" @click.self="deleteDialog.open = false">
        <div class="dialog delete-dialog" role="dialog" aria-modal="true">
          <i class="delete-dialog__icon" aria-hidden="true">!</i>
          <strong>删除“{{ deleteDialog.name }}”？</strong>
          <p>删除后将不能用于新规划，已有规划仍保留历史快照。</p>
          <footer>
            <button type="button" @click="deleteDialog.open = false">取消</button
            ><button class="danger-btn" type="button" @click="confirmDelete">确认删除</button>
          </footer>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="batchDeleteDialog.open"
        class="overlay"
        @click.self="batchDeleteDialog.open = false"
      >
        <div class="dialog delete-dialog" role="dialog" aria-modal="true">
          <i class="delete-dialog__icon" aria-hidden="true">!</i>
          <strong>批量删除 Skill？</strong>
          <p>
            确认删除已勾选的 {{ batchDeleteDialog.ids.length }} 条 Skill
            吗？删除后将不能用于新规划。
          </p>
          <footer>
            <button type="button" @click="batchDeleteDialog.open = false">取消</button
            ><button class="danger-btn" type="button" @click="confirmBatchMasterDelete">
              批量删除
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </section>
</template>

<style scoped lang="scss">
.master-panel {
  display: grid;
  gap: 18px;
  color: #17233d;
}
.master-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  border: 1px solid #dce7f3;
  border-radius: 12px;
  background:
    radial-gradient(circle at 82% 15%, rgba(65, 118, 239, 0.15), transparent 30%),
    linear-gradient(110deg, #fff, #f6f9ff);
  box-shadow: 0 12px 34px rgba(45, 58, 92, 0.07);
}
.master-hero > div:first-child > span,
.dialog > header small {
  color: #3766d7;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}
.master-hero h3 {
  margin: 5px 0 6px;
  font-size: 22px;
}
.master-hero p,
.dialog > header p {
  margin: 0;
  color: #66748b;
  font-size: 12px;
}
.master-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(92px, 1fr));
  min-width: 330px;
  border: 1px solid #dae4f4;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
}
.master-metrics div {
  display: grid;
  min-height: 76px;
  place-content: center;
  text-align: center;
}
.master-metrics div + div {
  border-left: 1px solid #e4eaf4;
}
.master-metrics strong {
  font-size: 22px;
}
.master-metrics span {
  color: #7c879a;
  font-size: 10px;
  font-weight: 700;
}
.relation-map {
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) 165px minmax(500px, 1.6fr);
  align-items: stretch;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e0e7f2;
  border-radius: 12px;
  background: #fff;
}
.relation-map > div,
.relation-map section > div {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border: 1px solid #e2e7ef;
  border-radius: 9px;
  background: #fafbfc;
}
.relation-map > div {
  border-color: #bfcff5;
  background: #f2f6ff;
}
.relation-map > b {
  display: grid;
  place-items: center;
  color: #78859a;
  font-size: 10px;
}
.relation-map section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.relation-map small {
  color: #76849a;
  font-size: 9px;
  font-weight: 800;
}
.relation-map span {
  color: #7c889b;
  font-size: 10px;
}
.master-filter-card,
.master-board {
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.06);
}
.master-filter-card {
  padding: 18px;
}
.master-board {
  min-height: clamp(500px, calc(100vh - 410px), 820px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.master-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #edf2f7;
}
.master-toolbar__title {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.master-toolbar__title strong {
  color: #101828;
  font-size: 17px;
  font-weight: 900;
}
.master-toolbar small {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.master-scope-controls {
  display: grid;
  grid-template-columns:
    minmax(120px, 0.65fr) minmax(260px, 1.4fr) minmax(180px, 0.9fr)
    minmax(320px, 2fr) auto;
  align-items: end;
  gap: 14px;
  min-width: 0;
}
.master-scope-controls.is-department-level {
  grid-template-columns: minmax(120px, 0.65fr) minmax(360px, 1.75fr) minmax(320px, 2fr) auto;
}
.master-scope-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.master-scope-field > span {
  color: #52647d;
  font-size: 12px;
  font-weight: 800;
}
.master-scope-field em {
  color: #dc2626;
  font-style: normal;
}
.master-scope-field input,
.master-scope-field select {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.master-scope-field input:focus,
.master-scope-field select:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}
.master-dept-cascader {
  min-width: 0;
}
.master-dept-cascader :deep(.market-dept-cascader-trigger) {
  min-height: 38px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
}
.master-dept-cascader :deep(.market-dept-cascader-trigger:hover) {
  border-color: #c0ccdc;
  background: #f8fbff;
}
.master-dept-cascader :deep(.market-dept-cascader-trigger.is-open),
.master-dept-cascader :deep(.market-dept-cascader-trigger:focus) {
  border-color: #5b8ff9;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}
.master-scope-actions,
.toolbar-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.master-scope-actions,
.toolbar-actions {
  flex-wrap: wrap;
}
.toolbar-actions {
  justify-content: flex-end;
}
.master-btn {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}
.master-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.master-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.master-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.master-btn--primary {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(47, 125, 246, 0.18);
}
.master-btn--soft,
.master-btn--ghost {
  border-color: #dbe5f2;
  background: #ffffff;
  color: #253857;
}
.master-btn--soft:hover,
.master-btn--ghost:hover {
  border-color: #b9ccff;
  background: #f6f9ff;
}
.master-btn--danger-soft {
  border-color: #ffd7d7;
  background: #fff7f7;
  color: #dc2626;
}
.primary {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #3569e8 !important;
  border-radius: 8px;
  background: #3569e8 !important;
  color: #fff !important;
  font-weight: 800;
  cursor: pointer;
}
.primary:disabled {
  border-color: #aebcf3 !important;
  background: #aebcf3 !important;
  cursor: not-allowed;
}
.table-wrap {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: auto;
}
.table-wrap table {
  width: 100%;
  min-width: 1320px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.table-wrap col.selection-column {
  width: 48px;
}
.table-wrap col.skill-column {
  width: 220px;
}
.table-wrap col.description-column {
  width: 330px;
}
.table-wrap col.owner-column,
.table-wrap col.develop-owner-column {
  width: 170px;
}
.table-wrap col.date-column {
  width: 140px;
}
.table-wrap col.status-column {
  width: 130px;
}
.table-wrap col.action-column {
  width: 140px;
}
.table-wrap th,
.table-wrap td {
  padding: 13px 12px;
  border-bottom: 1px solid #edf2f7;
  color: #334155;
  font-size: 13px;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}
.table-wrap th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
}
.table-wrap td {
  height: 78px;
  background: #ffffff;
}
.table-wrap tbody tr:hover td {
  background: #f8fbff;
}
.table-wrap .selection-cell {
  text-align: center;
}
.selection-cell input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #2563eb;
}
.table-wrap td.person-column {
  overflow: hidden;
  font-weight: 650;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.name-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  min-width: 0;
}
.name-cell i {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #edf3ff;
  color: #3b68d4;
  font-style: normal;
  font-weight: 900;
}
.name-cell span {
  display: grid;
  min-width: 0;
}
.name-cell strong,
.name-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell small {
  color: #8a95a5;
}
.badge {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 8px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 800;
}
.level {
  background: #eef3ff;
  color: #4c69af;
}
.status {
  background: #f1f3f7;
  color: #66758c;
}
.status.is-开发中,
.status.is-联调中,
.status.is-进行中 {
  background: #fff3df;
  color: #aa6415;
}
.status.is-已完成 {
  background: #eaf8f1;
  color: #27815d;
}
.association-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.association-summary span,
.department-tags > span {
  padding: 4px 7px;
  border-radius: 99px;
  background: #eef3ff;
  color: #4b67aa;
  font-size: 9px;
  font-weight: 800;
}
.row-actions {
  justify-content: flex-start;
  white-space: nowrap;
}
.row-actions__muted {
  color: #94a0b4;
  font-size: 12px;
}
.row-actions button {
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #526b9d;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.row-actions button:hover {
  background: #eef3ff;
  color: #3569e8;
}
.row-actions .associate {
  background: #eef3ff;
  color: #3569e8;
}
.danger {
  color: #d94a54 !important;
}
.empty {
  height: 140px !important;
  text-align: center;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 970;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}
.dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}
.dialog > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.dialog > header > div {
  display: grid;
  gap: 4px;
}
.dialog > header strong {
  font-size: 20px;
}
.dialog > header > button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f2f4f8;
  font-size: 20px;
  cursor: pointer;
}
.note {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #dce7fb;
  border-radius: 8px;
  background: #f5f8ff;
  color: #58709e;
  font-size: 11px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 13px;
}
.form-grid label {
  display: grid;
  gap: 7px;
}
.form-grid .wide {
  grid-column: 1/-1;
}
.form-grid label > span {
  font-size: 11px;
  font-weight: 800;
}
.field-hint {
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
}
.form-grid input,
.form-grid select,
.form-grid textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0 11px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
}
.form-grid input,
.form-grid select {
  height: 40px;
}
.form-grid textarea {
  padding-top: 10px;
}
.person-search {
  position: relative;
  width: 100%;
}
.person-search > input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  outline: 0;
  color: #344159;
  background: #fff;
}
.person-search > input:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}
.person-search__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: 100%;
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #dce3ee;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(39, 51, 80, 0.16);
}
.person-search__panel > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.person-search__panel > button:hover {
  background: #f5f8ff;
}
.person-search__panel > button > span {
  display: grid;
  gap: 2px;
}
.person-search__panel strong {
  color: #2c3950;
  font-size: 11px;
}
.person-search__panel small {
  color: #8c97a8;
  font-size: 9px;
}
.person-search__panel em {
  color: #78869a;
  font-size: 9px;
  font-style: normal;
}
.person-search__empty {
  display: block;
  padding: 16px 10px;
  color: #98a2b1;
  font-size: 10px;
  text-align: center;
}
.error {
  margin: 14px 0 0;
  padding: 9px 11px;
  background: #fff1f2;
  color: #d94851;
  font-size: 12px;
  line-height: 1.45;
}
.dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}
.dialog > footer button {
  height: 36px;
  padding: 0 16px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.association-dialog {
  width: min(980px, calc(100vw - 32px));
}
.association-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.association-grid > section {
  min-width: 0;
  padding: 14px;
  border: 1px solid #e1e7f1;
  border-radius: 10px;
  background: #fafcff;
}
.association-grid > section > header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.association-grid > section > header span {
  color: #7f8b9e;
  font-size: 10px;
}
.option-list {
  display: grid;
  max-height: 250px;
  overflow: auto;
  gap: 6px;
}
.option-list label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border-radius: 7px;
  background: #fff;
  color: #526079;
  font-size: 11px;
}
.department-section {
  grid-column: 1/-1;
}
.department-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.department-tags > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.department-tags button {
  border: 0;
  background: transparent;
  color: #5870aa;
  cursor: pointer;
}
.department-tags small {
  color: #8b96a7;
}
.delete-dialog {
  width: min(430px, calc(100vw - 32px));
  text-align: center;
}
.delete-dialog__icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: #fff0f1;
  color: #dc4651;
  font-size: 24px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
}
.delete-dialog > strong {
  display: block;
  color: #17233d;
  font-size: 16px;
  font-weight: 900;
  line-height: 1.4;
}
.delete-dialog > p {
  margin: 10px 0 0;
  color: #748095;
  font-size: 12px;
  line-height: 1.7;
}
.delete-dialog > footer {
  margin-top: 20px;
}
.delete-dialog > footer button {
  color: #526079;
  font-size: 12px;
  font-weight: 800;
}
.danger-btn {
  border-color: #dc4651 !important;
  background: #dc4651 !important;
  color: #fff !important;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 30px;
  z-index: 990;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 99px;
  background: rgba(25, 34, 51, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
@media (max-width: 1100px) {
  .master-hero {
    align-items: stretch;
    flex-direction: column;
  }
  .master-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .master-scope-controls,
  .master-scope-controls.is-department-level {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
  .master-metrics {
    min-width: 0;
  }
  .toolbar-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .relation-map {
    grid-template-columns: 1fr;
  }
  .association-grid {
    grid-template-columns: 1fr;
  }
  .department-section {
    grid-column: auto;
  }
}
@media (max-width: 680px) {
  .relation-map section,
  .form-grid,
  .master-scope-controls,
  .master-scope-controls.is-department-level {
    grid-template-columns: 1fr;
  }
  .form-grid .wide {
    grid-column: auto;
  }
  .toolbar-actions > * {
    flex: 1 1 150px;
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MarketDeptCascader from '../../components/skill/MarketDeptCascader.vue';
import {
  batchDeleteSkillPlanning,
  batchUpdateSkillPlanning,
  createSkillPlanning,
  deleteSkillPlanning,
  downloadSkillPlanningTemplate,
  exportSkillPlanningToExcel,
  importSkillPlanningFromExcel,
  querySkillPlanningFilterOptions,
  queryAllSkillPlanningList,
  querySkillConfig,
  updateSkillPlanning,
  type SkillPlanningBatchPatch,
  type SkillPlanningFilterOptions,
  type SkillPlanningItem,
  type SkillPlanningPayload,
  type SkillPlanningProgress,
  type SkillPlanningQuery,
  type SkillPlanningSortOrder,
} from '../../services/skillMarket/skillPlanningService';

type PlanningFormMode = 'create' | 'edit';
type PlanningDepartmentTreeNode = {
  name: string;
  children?: PlanningDepartmentTreeNode[];
};
type PlanningHeaderFilterKey =
  | 'firstScene'
  | 'secondScene'
  | 'activityNodeName'
  | 'subActivityNodeName'
  | 'level'
  | 'status';
type PlanningHeaderFilterSelections = Record<PlanningHeaderFilterKey, string[]>;
type PlanningBatchField = keyof SkillPlanningBatchPatch;
type PlanningBatchForm = Record<PlanningBatchField, string>;

const props = withDefaults(
  defineProps<{
    departmentTree?: PlanningDepartmentTreeNode[];
  }>(),
  {
    departmentTree: () => [],
  },
);

const progressOptions = ref<SkillPlanningProgress[]>([
  '未开始',
  '开发中',
  '联调中',
  '已完成',
  '已延期',
]);
const planningHeaderFilterKeys = [
  'firstScene',
  'secondScene',
  'activityNodeName',
  'subActivityNodeName',
  'level',
  'status',
] as const;
const pageSizeOptions = [5, 10, 20, 50];
const batchReadonlyHeaders = [
  '一级场景',
  '二级场景',
  '归属活动',
  '归属子活动',
  'SKILL名称',
  '层级',
] as const;

const emptyFilters = {
  department: '',
  departmentL3: '',
  departmentL4: '',
  departmentL5: '',
  departmentL6: '',
  departmentL7: '',
  departmentL8: '',
  firstScene: '',
  secondScene: '',
  activityNodeName: '',
  subActivityNodeName: '',
  level: '',
  offeringName: '',
  status: '',
  owner: '',
  plannedStartDate: '',
  plannedEndDate: '',
  keyword: '',
};

const filterForm = reactive({ ...emptyFilters });
const appliedFilters = reactive({ ...emptyFilters });
const planningDepartmentTree = computed(() => props.departmentTree ?? []);
const planningDepartmentSegments = ref<string[]>([]);
const departmentL3 = ref('');
const departmentL4 = ref('');
const departmentL5 = ref('');
const departmentL6 = ref('');
const departmentL7 = ref('');
const departmentL8 = ref('');
const planningDepartmentLevelRefs = [
  departmentL3,
  departmentL4,
  departmentL5,
  departmentL6,
  departmentL7,
  departmentL8,
] as const;
const rows = ref<SkillPlanningItem[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const selectedIds = ref<string[]>([]);
const primarySceneOptions = ref<string[]>([]);
const secondarySceneOptions = ref<string[]>([]);
const activityOptions = ref<string[]>([]);
const subActivityOptions = ref<string[]>([]);
const levelOptions = ref<string[]>([]);
const headerFilterOpenKey = ref<PlanningHeaderFilterKey | null>(null);
const headerFilterSelections = reactive<PlanningHeaderFilterSelections>({
  firstScene: [],
  secondScene: [],
  activityNodeName: [],
  subActivityNodeName: [],
  level: [],
  status: [],
});
const plannedFinishSortOrder = ref<SkillPlanningSortOrder | ''>('');
const importInputRef = ref<HTMLInputElement | null>(null);
const importDialogOpen = ref(false);
const importDragging = ref(false);
const importSubmitting = ref(false);
const templateDownloadPending = ref(false);
const selectedImportFile = ref<File | null>(null);
const importError = ref('');
const toast = ref('');
let toastTimer: ReturnType<typeof window.setTimeout> | null = null;

const formDialogOpen = ref(false);
const formMode = ref<PlanningFormMode>('create');
const editingId = ref('');
const inlineCreateActive = ref(false);
const inlineCreateSubmitting = ref(false);
const inlineEditId = ref('');
const inlineEditSubmitting = ref(false);
const formErrors = reactive<Partial<Record<keyof SkillPlanningPayload, string>>>({});
const planningForm = reactive<SkillPlanningPayload>(createEmptyPlanningForm());

const batchDialogOpen = ref(false);
const batchSubmitting = ref(false);
const batchErrors = reactive<Partial<Record<PlanningBatchField, string>>>({});
const batchForm = reactive<PlanningBatchForm>(createEmptyBatchForm());

const confirmDialog = reactive({
  open: false,
  title: '',
  message: '',
  dangerText: '确认',
  action: null as null | (() => Promise<void>),
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageStart = computed(() =>
  total.value === 0 ? 0 : (pageNum.value - 1) * pageSize.value + 1,
);
const pageEnd = computed(() => Math.min(total.value, pageNum.value * pageSize.value));
const allPageSelected = computed(
  () => rows.value.length > 0 && rows.value.every((row) => selectedIds.value.includes(row.id)),
);
const hasSelectedRows = computed(() => selectedIds.value.length > 0);
const selectedImportFileSize = computed(() => {
  if (!selectedImportFile.value) {
    return '';
  }
  const size = selectedImportFile.value.size / 1024;
  return size >= 1024 ? `${(size / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(size))} KB`;
});
const planningHeaderFilterOptions = computed<SkillPlanningFilterOptions>(() => ({
  firstScene: primarySceneOptions.value,
  secondScene: secondarySceneOptions.value,
  activityNodeName: activityOptions.value,
  subActivityNodeName: subActivityOptions.value,
  level: levelOptions.value,
  status: progressOptions.value,
}));
const hasActivePlanningHeaderFilters = computed(() =>
  planningHeaderFilterKeys.some((key) => headerFilterSelections[key].length > 0),
);
const plannedFinishSortLabel = computed(() => {
  if (plannedFinishSortOrder.value === 'asc') {
    return '升序';
  }
  if (plannedFinishSortOrder.value === 'desc') {
    return '降序';
  }
  return '未排序';
});

function createEmptyPlanningForm(): SkillPlanningPayload {
  return {
    firstScene: '',
    secondScene: '',
    activityNodeName: '',
    subActivityNodeName: '',
    skillName: '',
    skillDescription: '',
    level: '',
    offeringName: '',
    owner: '',
    department: '',
    developer: '',
    planedCompleteDate: '',
    status: '未开始',
  };
}

function createEmptyBatchForm(): PlanningBatchForm {
  return {
    skillDescription: '',
    offeringName: '',
    owner: '',
    department: '',
    developer: '',
    planedCompleteDate: '',
    status: '',
  };
}

function showToast(message: string) {
  toast.value = message;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.value = '';
  }, 2400);
}

function syncPlanningHeaderFilterSelections(options: SkillPlanningFilterOptions): void {
  planningHeaderFilterKeys.forEach((key) => {
    const allowed = new Set(options[key]);
    headerFilterSelections[key] = headerFilterSelections[key].filter((item) => allowed.has(item));
  });
}

async function loadPlanningFilterOptions(): Promise<void> {
  const options = await querySkillPlanningFilterOptions();
  primarySceneOptions.value = options.firstScene;
  secondarySceneOptions.value = options.secondScene;
  activityOptions.value = options.activityNodeName;
  subActivityOptions.value = options.subActivityNodeName;
  levelOptions.value = options.level;
  progressOptions.value = options.status as SkillPlanningProgress[];
  syncPlanningHeaderFilterSelections(options);
}

function headerFilterOptionList(key: PlanningHeaderFilterKey): string[] {
  return planningHeaderFilterOptions.value[key];
}

function headerFilterSelectedCount(key: PlanningHeaderFilterKey): number {
  return headerFilterSelections[key].length;
}

function isHeaderFilterOpen(key: PlanningHeaderFilterKey): boolean {
  return headerFilterOpenKey.value === key;
}

function toggleHeaderFilterMenu(key: PlanningHeaderFilterKey): void {
  headerFilterOpenKey.value = headerFilterOpenKey.value === key ? null : key;
}

async function applyPlanningTableFilters(): Promise<void> {
  pageNum.value = 1;
  await reloadList();
}

async function onSearchKeyword() {
  queryFilterObj.keyword = filterForm.keyword;
  queryFilterObj.pageNum = 1;
  await reloadList();
}

async function resetQuery() {
  filterForm.keyword = '';
  await onSearchKeyword();
}

async function toggleHeaderFilterOption(
  key: PlanningHeaderFilterKey,
  option: string,
): Promise<void> {
  const selected = headerFilterSelections[key];
  headerFilterSelections[key] = selected.includes(option)
    ? selected.filter((item) => item !== option)
    : [...selected, option];
  await applyPlanningTableFilters();
}

async function clearHeaderFilter(key: PlanningHeaderFilterKey): Promise<void> {
  if (headerFilterSelections[key].length === 0) {
    return;
  }
  headerFilterSelections[key] = [];
  await applyPlanningTableFilters();
}

async function togglePlannedFinishSort(): Promise<void> {
  if (plannedFinishSortOrder.value === '') {
    plannedFinishSortOrder.value = 'asc';
  } else if (plannedFinishSortOrder.value === 'asc') {
    plannedFinishSortOrder.value = 'desc';
  } else {
    plannedFinishSortOrder.value = '';
  }
  await applyPlanningTableFilters();
}

function handlePlanningHeaderFilterOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest('.planning-th-filter')) {
    return;
  }
  headerFilterOpenKey.value = null;
}

function syncPlanningDepartmentLevels(segments = planningDepartmentSegments.value): void {
  planningDepartmentLevelRefs.forEach((levelRef, index) => {
    levelRef.value = segments[index] ?? '';
    filterForm[`departmentL${index + 3}` as keyof typeof filterForm] = levelRef.value;
  });
  filterForm.department = segments[segments.length - 1] ?? '';
}

function onPlanningDepartmentChange(segments: string[]): void {
  syncPlanningDepartmentLevels(segments);
}

function onPlanningDepartmentDone(segments: string[]): void {
  syncPlanningDepartmentLevels(segments);
}

function onPlanningDepartmentClear(): void {
  planningDepartmentSegments.value = [];
  syncPlanningDepartmentLevels([]);
}

const queryFilterObj = reactive({
  firstScene: [...headerFilterSelections.firstScene],
  secondScene: [...headerFilterSelections.secondScene],
  activityNodeName: [...headerFilterSelections.activityNodeName],
  subActivityNodeName: [...headerFilterSelections.subActivityNodeName],
  level: [...headerFilterSelections.level],
  status: [...headerFilterSelections.status],
  keyword: filterForm.keyword,
  pageNum: pageNum.value,
  pageSize: pageSize.value,
  departmentL3: filterForm.departmentL3,
  departmentL4: filterForm.departmentL4,
  departmentL5: filterForm.departmentL5,
  departmentL6: filterForm.departmentL6,
});

async function reloadList() {
  loading.value = true;
  try {
    const result = await querySkillConfig(queryFilterObj);
    rows.value = result.list;
    total.value = result.total;
    if (pageNum.value > totalPages.value) {
      pageNum.value = totalPages.value;
      const nextResult = await querySkillConfig(queryFilterObj);
      rows.value = nextResult.list;
      total.value = nextResult.total;
    }
    selectedIds.value = selectedIds.value.filter((id) => rows.value.some((row) => row.id === id));
  } finally {
    loading.value = false;
  }
}

function resetPlanningForm() {
  Object.assign(planningForm, createEmptyPlanningForm());
  Object.keys(formErrors).forEach((key) => {
    delete formErrors[key as keyof SkillPlanningPayload];
  });
}

function fillPlanningFormFromRow(row: SkillPlanningItem) {
  Object.assign(planningForm, {
    firstScene: row.firstScene,
    secondScene: row.secondScene,
    activityNodeName: row.activityNodeName,
    subActivityNodeName: row.subActivityNodeName,
    skillName: row.skillName,
    skillDescription: row.skillDescription,
    level: row.level,
    offeringName: row.offeringName,
    owner: row.owner,
    department: row.department,
    developer: row.developer,
    planedCompleteDate: row.planedCompleteDate,
    status: row.status,
  });
}

function startInlineCreate() {
  if (inlineCreateSubmitting.value || inlineEditSubmitting.value) {
    return;
  }
  formMode.value = 'create';
  editingId.value = '';
  inlineEditId.value = '';
  inlineCreateActive.value = true;
  resetPlanningForm();
}

function cancelInlineCreate(force = false) {
  if (inlineCreateSubmitting.value && !force) {
    return;
  }
  inlineCreateActive.value = false;
  editingId.value = '';
  resetPlanningForm();
}

async function confirmInlineCreate() {
  if (inlineCreateSubmitting.value) {
    return;
  }

  if (!validateForm()) {
    showToast('请补充必填信息');
    return;
  }

  try {
    inlineCreateSubmitting.value = true;
    await createSkillPlanning({ ...planningForm });
    showToast('已新增 Skill 规划');
    pageNum.value = 1;
    cancelInlineCreate(true);
    await loadPlanningFilterOptions();
    await reloadList();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '新增 Skill 规划失败，请稍后重试');
  } finally {
    inlineCreateSubmitting.value = false;
  }
}

function startInlineEdit(row: SkillPlanningItem) {
  if (inlineCreateSubmitting.value || inlineEditSubmitting.value) {
    return;
  }
  inlineCreateActive.value = false;
  formMode.value = 'edit';
  editingId.value = row.id;
  inlineEditId.value = row.id;
  resetPlanningForm();
  fillPlanningFormFromRow(row);
}

function cancelInlineEdit(force = false) {
  if (inlineEditSubmitting.value && !force) {
    return;
  }
  inlineEditId.value = '';
  editingId.value = '';
  resetPlanningForm();
}

async function confirmInlineEdit() {
  if (inlineEditSubmitting.value || !editingId.value) {
    return;
  }

  if (!validateForm()) {
    showToast('请补充必填信息');
    return;
  }

  try {
    inlineEditSubmitting.value = true;
    await updateSkillPlanning(editingId.value, { ...planningForm });
    showToast('已保存修改');
    cancelInlineEdit(true);
    await loadPlanningFilterOptions();
    await reloadList();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存 Skill 规划失败，请稍后重试');
  } finally {
    inlineEditSubmitting.value = false;
  }
}

function closeFormDialog() {
  formDialogOpen.value = false;
}

function validateForm(): boolean {
  Object.keys(formErrors).forEach((key) => {
    delete formErrors[key as keyof SkillPlanningPayload];
  });
  const requiredFields: Array<keyof SkillPlanningPayload> = [
    'firstScene',
    'secondScene',
    'activityNodeName',
    'subActivityNodeName',
    'skillName',
    'skillDescription',
    'level',
    'owner',
    'department',
    'developer',
  ];

  requiredFields.forEach((field) => {
    if (!String(planningForm[field] ?? '').trim()) {
      formErrors[field] = '必填';
    }
  });

  if (planningForm.skillDescription.length > 300) {
    formErrors.skillDescription = '最多 300 字';
  }

  return Object.keys(formErrors).length === 0;
}

async function submitPlanningForm() {
  if (!validateForm()) {
    showToast('请补充必填信息');
    return;
  }

  if (formMode.value === 'create') {
    await createSkillPlanning({ ...planningForm });
    showToast('已新增 Skill 规划');
  } else {
    await updateSkillPlanning(editingId.value, { ...planningForm });
    showToast('已保存修改');
  }

  closeFormDialog();
  await loadPlanningFilterOptions();
  await reloadList();
}

function resetBatchErrors() {
  Object.keys(batchErrors).forEach((key) => {
    delete batchErrors[key as PlanningBatchField];
  });
}

function resetBatchForm() {
  Object.assign(batchForm, createEmptyBatchForm());
  resetBatchErrors();
}

function openBatchEditDialog() {
  if (!hasSelectedRows.value) {
    showToast('请先勾选至少一条需要批量修改的数据');
    return;
  }

  resetBatchForm();
  batchDialogOpen.value = true;
}

function closeBatchEditDialog() {
  if (batchSubmitting.value) {
    return;
  }

  batchDialogOpen.value = false;
  resetBatchForm();
}

function validateBatchForm(): boolean {
  resetBatchErrors();

  if (batchForm.skillDescription.trim().length > 300) {
    batchErrors.skillDescription = '最多 300 字';
  }

  return Object.keys(batchErrors).length === 0;
}

function collectBatchPatch(): SkillPlanningBatchPatch {
  const patch: SkillPlanningBatchPatch = {};
  const skillDescription = batchForm.skillDescription.trim();
  const offeringName = batchForm.offeringName.trim();
  const owner = batchForm.owner.trim();
  const department = batchForm.department.trim();
  const developer = batchForm.developer.trim();
  const planedCompleteDate = batchForm.planedCompleteDate.trim();
  const status = batchForm.status.trim();

  if (skillDescription) patch.skillDescription = skillDescription;
  if (offeringName) patch.offeringName = offeringName;
  if (owner) patch.owner = owner;
  if (department) patch.department = department;
  if (developer) patch.developer = developer;
  if (planedCompleteDate) patch.planedCompleteDate = planedCompleteDate;
  if (status) patch.status = status as SkillPlanningProgress;

  return patch;
}

async function submitBatchEdit() {
  if (batchSubmitting.value) {
    return;
  }

  if (!hasSelectedRows.value) {
    showToast('请先勾选至少一条需要批量修改的数据');
    return;
  }

  if (!validateBatchForm()) {
    showToast('请检查批量修改内容');
    return;
  }

  const patch = collectBatchPatch();
  if (Object.keys(patch).length === 0) {
    showToast('请至少填写或选择一个要批量修改的字段');
    return;
  }

  const ids = [...selectedIds.value];
  if (ids.length === 0) {
    showToast('请先勾选至少一条需要批量修改的数据');
    return;
  }

  try {
    batchSubmitting.value = true;
    const count = await batchUpdateSkillPlanning(ids, patch);
    selectedIds.value = [];
    batchDialogOpen.value = false;
    resetBatchForm();
    showToast(`已批量修改 ${count > 0 ? count : ids.length} 条数据`);
    await loadPlanningFilterOptions();
    await reloadList();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '批量修改失败，请稍后重试');
  } finally {
    batchSubmitting.value = false;
  }
}

function triggerImport() {
  importDialogOpen.value = true;
  importDragging.value = false;
  importError.value = '';
  selectedImportFile.value = null;
  if (importInputRef.value) {
    importInputRef.value.value = '';
  }
}

function closeImportDialog() {
  if (importSubmitting.value) {
    return;
  }
  importDialogOpen.value = false;
  importDragging.value = false;
  importError.value = '';
  selectedImportFile.value = null;
}

function openImportFilePicker() {
  importInputRef.value?.click();
}

function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

function selectImportFile(file: File | undefined | null) {
  if (!file) {
    return;
  }

  if (!isExcelFile(file)) {
    selectedImportFile.value = null;
    importError.value = '仅支持 .xlsx 或 .xls 格式的 Excel 文件';
    showToast(importError.value);
    return;
  }

  selectedImportFile.value = file;
  importError.value = '';
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  selectImportFile(input.files?.[0]);
  input.value = '';
}

function handleImportDrop(event: DragEvent) {
  importDragging.value = false;
  selectImportFile(event.dataTransfer?.files?.[0]);
}

async function handleDownloadImportTemplate() {
  if (templateDownloadPending.value) {
    return;
  }

  try {
    templateDownloadPending.value = true;
    const downloadUrl = await downloadSkillPlanningTemplate();
    if (typeof downloadUrl === 'string' && downloadUrl.trim()) {
      const openedWindow = window.open(downloadUrl, '_blank', 'noopener');
      if (!openedWindow) {
        window.location.href = downloadUrl;
      }
    }
    showToast('已开始下载导入模板');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导入模板下载失败，请稍后重试');
  } finally {
    templateDownloadPending.value = false;
  }
}

async function submitImportFile() {
  if (!selectedImportFile.value) {
    importError.value = '请先选择或拖入一个 Excel 文件';
    showToast(importError.value);
    return;
  }

  try {
    importSubmitting.value = true;
    const result = await importSkillPlanningFromExcel(selectedImportFile.value);
    if (result.missingFields.length > 0) {
      importError.value = `导入失败，缺少字段：${result.missingFields.join('、')}`;
      showToast(importError.value);
      return;
    }

    showToast(`已导入 ${result.created} 条 Skill 规划`);
    importSubmitting.value = false;
    closeImportDialog();
    pageNum.value = 1;
    await loadPlanningFilterOptions();
    await reloadList();
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败，请检查文件内容';
    showToast(importError.value);
  } finally {
    importSubmitting.value = false;
  }
}

async function exportCurrentData() {
  queryFilterObj.pageNum = undefined;
  queryFilterObj.pageSize = undefined;
  const exportRows = await queryAllSkillPlanningList(queryFilterObj);
  if (exportRows.length === 0) {
    showToast('当前筛选条件下暂无可导出数据');
    return;
  }
  await exportSkillPlanningToExcel(exportRows);
  showToast('已导出当前筛选结果');
}

function openConfirmDialog(
  title: string,
  message: string,
  dangerText: string,
  action: () => Promise<void>,
) {
  confirmDialog.title = title;
  confirmDialog.message = message;
  confirmDialog.dangerText = dangerText;
  confirmDialog.action = action;
  confirmDialog.open = true;
}

function closeConfirmDialog() {
  confirmDialog.open = false;
  confirmDialog.action = null;
}

async function confirmDialogAction() {
  const action = confirmDialog.action;
  if (!action) {
    return;
  }
  await action();
  closeConfirmDialog();
}

function requestDeleteRow(row: SkillPlanningItem) {
  openConfirmDialog(
    '删除 Skill 规划',
    `确认删除「${row.skillName}」吗？删除后将无法恢复。`,
    '确认删除',
    async () => {
      await deleteSkillPlanning(row.id);
      selectedIds.value = selectedIds.value.filter((id) => id !== row.id);
      showToast('已删除');
      await loadPlanningFilterOptions();
      await reloadList();
    },
  );
}

function requestBatchDelete() {
  if (!hasSelectedRows.value) {
    showToast('请先勾选需要批量删除的数据');
    return;
  }
  openConfirmDialog(
    '批量删除 Skill 规划',
    `确认删除已勾选的 ${selectedIds.value.length} 条数据吗？删除后将无法恢复。`,
    '批量删除',
    async () => {
      const count = await batchDeleteSkillPlanning(selectedIds.value);
      selectedIds.value = [];
      showToast(`已删除 ${count} 条数据`);
      await loadPlanningFilterOptions();
      await reloadList();
    },
  );
}

function toggleRowSelection(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id];
}

function togglePageSelection() {
  const pageIds = rows.value.map((row) => row.id);
  if (allPageSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.includes(id));
    return;
  }
  selectedIds.value = Array.from(new Set([...selectedIds.value, ...pageIds]));
}

async function goPage(nextPage: number) {
  pageNum.value = Math.min(totalPages.value, Math.max(1, nextPage));
  await reloadList();
}

async function changePageSize() {
  pageNum.value = 1;
  await reloadList();
}

function progressClass(status: SkillPlanningProgress): string {
  const classMap: Record<SkillPlanningProgress, string> = {
    未开始: 'status-idle',
    开发中: 'status-dev',
    联调中: 'status-test',
    已完成: 'status-done',
    已延期: 'status-delay',
  };
  return classMap[status];
}

onMounted(() => {
  document.addEventListener('mousedown', handlePlanningHeaderFilterOutsideClick);
  void (async () => {
    await loadPlanningFilterOptions();
    await reloadList();
  })();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePlanningHeaderFilterOutsideClick);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
});
</script>

<template>
  <div class="planning-pageNum">
    <header class="planning-hero">
      <div>
        <h2 class="panel-title">Skill 规划</h2>
        <p class="all-desc">
          用于统一管理各部门规划建设中的 Skill 清单，支持查询、新增、导入、导出和批量维护。
        </p>
      </div>
    </header>

    <section class="planning-filter-card" aria-label="Skill 规划查询">
      <div class="filter-grid">
        <div class="planning-field planning-field--dept">
          <span>归属部门</span>
          <MarketDeptCascader
            v-model="planningDepartmentSegments"
            class="planning-dept-cascader"
            :tree="planningDepartmentTree"
            :max-level="6"
            aria-label="Skill 规划部门级联筛选（DepartmentL1～DepartmentL6）"
            @change="onPlanningDepartmentChange"
            @clear="onPlanningDepartmentClear"
            @done="onPlanningDepartmentDone"
          />
        </div>
        <label v-if="false" class="planning-field">
          <span>产品</span>
          <input
            v-model.trim="filterForm.offeringName"
            type="search"
            placeholder="输入产品关键字搜索"
          />
        </label>
        <label v-if="false" class="planning-field">
          <span>计划开始</span>
          <input v-model="filterForm.plannedStartDate" type="date" />
        </label>
        <label v-if="false" class="planning-field">
          <span>计划结束</span>
          <input v-model="filterForm.plannedEndDate" type="date" />
        </label>
        <label class="planning-field planning-field--keyword">
          <span>关键词</span>
          <input
            v-model.trim="filterForm.keyword"
            type="search"
            placeholder="按 产品、Skill 名称、说明、责任Owner、开发责任人查询"
            @keydown.enter="onSearchKeyword"
            @input="onSearchKeyword"
          />
        </label>
        <div class="filter-actions">
          <button type="button" class="planning-btn planning-btn--primary" @click="onSearchKeyword">
            查询
          </button>
          <button type="button" class="planning-btn planning-btn--ghost" @click="resetQuery">
            重置
          </button>
        </div>
      </div>
    </section>

    <section class="planning-board" aria-label="Skill 规划清单">
      <div class="planning-toolbar">
        <div class="planning-toolbar__summary">
          <strong>Skill 规划清单</strong>
          <span>
            已选 {{ selectedIds.length }} 条 / 共 {{ total }} 条
            <template v-if="hasActivePlanningHeaderFilters || plannedFinishSortOrder">
              ·
              <template v-if="hasActivePlanningHeaderFilters">表头筛选已生效</template>
              <template v-if="hasActivePlanningHeaderFilters && plannedFinishSortOrder">
                ·
              </template>
              <template v-if="plannedFinishSortOrder"
                >完成时间{{ plannedFinishSortLabel }}</template
              >
            </template>
          </span>
        </div>
        <div class="planning-toolbar__actions">
          <button
            type="button"
            class="planning-btn planning-btn--primary"
            :disabled="inlineCreateActive || inlineEditId !== ''"
            @click="startInlineCreate"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增
          </button>
          <button type="button" class="planning-btn planning-btn--soft" @click="triggerImport">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10m0-10 4 4m-4-4-4 4M5 17v2h14v-2" />
            </svg>
            导入
          </button>
          <button type="button" class="planning-btn planning-btn--soft" @click="exportCurrentData">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20V10m0 10 4-4m-4 4-4-4M5 7V5h14v2" />
            </svg>
            导出
          </button>
          <button
            type="button"
            class="planning-btn planning-btn--soft"
            @click="openBatchEditDialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 16 1 4 4-1L18.5 9.5a2.1 2.1 0 0 0-3-3L6 16Z" />
              <path d="m13.5 7.5 3 3" />
            </svg>
            批量修改
          </button>
          <button
            type="button"
            class="planning-btn planning-btn--danger-soft"
            @click="requestBatchDelete"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
            </svg>
            批量删除
          </button>
        </div>
        <input
          ref="importInputRef"
          type="file"
          accept=".xlsx,.xls"
          class="planning-import-input"
          @change="handleImportFile"
        />
      </div>

      <div class="planning-table-wrap">
        <table class="planning-table">
          <thead>
            <tr>
              <th class="select-col">
                <input type="checkbox" :checked="allPageSelected" @change="togglePageSelection" />
              </th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('firstScene'),
                    'is-active': headerFilterSelectedCount('firstScene') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('firstScene')"
                  >
                    <span>一级场景</span>
                    <span
                      v-if="headerFilterSelectedCount('firstScene')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('firstScene') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div v-if="isHeaderFilterOpen('firstScene')" class="planning-th-filter__menu">
                    <div class="planning-th-filter__menu-head">
                      <strong>一级场景</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('firstScene') === 0"
                        @click.stop="clearHeaderFilter('firstScene')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('firstScene').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('firstScene')"
                        :key="`firstScene-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.firstScene.includes(item)"
                          @change="toggleHeaderFilterOption('firstScene', item)"
                        />
                        <span>{{ item.scene }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('secondScene'),
                    'is-active': headerFilterSelectedCount('secondScene') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('secondScene')"
                  >
                    <span>二级场景</span>
                    <span
                      v-if="headerFilterSelectedCount('secondScene')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('secondScene') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div v-if="isHeaderFilterOpen('secondScene')" class="planning-th-filter__menu">
                    <div class="planning-th-filter__menu-head">
                      <strong>二级场景</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('secondScene') === 0"
                        @click.stop="clearHeaderFilter('secondScene')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('secondScene').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('secondScene')"
                        :key="`secondScene-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.secondScene.includes(item)"
                          @change="toggleHeaderFilterOption('secondScene', item)"
                        />
                        <span>{{ item }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('activityNodeName'),
                    'is-active': headerFilterSelectedCount('activityNodeName') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('activityNodeName')"
                  >
                    <span>归属活动</span>
                    <span
                      v-if="headerFilterSelectedCount('activityNodeName')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('activityNodeName') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div
                    v-if="isHeaderFilterOpen('activityNodeName')"
                    class="planning-th-filter__menu"
                  >
                    <div class="planning-th-filter__menu-head">
                      <strong>归属活动</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('activityNodeName') === 0"
                        @click.stop="clearHeaderFilter('activityNodeName')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('activityNodeName').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('activityNodeName')"
                        :key="`activityNodeName-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.activityNodeName.includes(item)"
                          @change="toggleHeaderFilterOption('activityNodeName', item)"
                        />
                        <span>{{ item.activityNodeName }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('subActivityNodeName'),
                    'is-active': headerFilterSelectedCount('subActivityNodeName') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('subActivityNodeName')"
                  >
                    <span>归属子活动</span>
                    <span
                      v-if="headerFilterSelectedCount('subActivityNodeName')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('subActivityNodeName') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div
                    v-if="isHeaderFilterOpen('subActivityNodeName')"
                    class="planning-th-filter__menu"
                  >
                    <div class="planning-th-filter__menu-head">
                      <strong>归属子活动</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('subActivityNodeName') === 0"
                        @click.stop="clearHeaderFilter('subActivityNodeName')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('subActivityNodeName').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('subActivityNodeName')"
                        :key="`subActivityNodeName-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.subActivityNodeName.includes(item)"
                          @change="toggleHeaderFilterOption('subActivityNodeName', item)"
                        />
                        <span>{{ item }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th>Skill 名称</th>
              <th class="desc-col">Skill 说明</th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('level'),
                    'is-active': headerFilterSelectedCount('level') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('level')"
                  >
                    <span>层级</span>
                    <span
                      v-if="headerFilterSelectedCount('level')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('level') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div v-if="isHeaderFilterOpen('level')" class="planning-th-filter__menu">
                    <div class="planning-th-filter__menu-head">
                      <strong>层级</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('level') === 0"
                        @click.stop="clearHeaderFilter('level')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('level').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('level')"
                        :key="`level-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.level.includes(item)"
                          @change="toggleHeaderFilterOption('level', item)"
                        />
                        <span>{{ item }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th>产品</th>
              <th>责任 Owner</th>
              <th>归属部门</th>
              <th>开发责任人</th>
              <th>
                <button
                  type="button"
                  class="planning-th-sort"
                  :class="{
                    'is-active': plannedFinishSortOrder,
                    'is-desc': plannedFinishSortOrder === 'desc',
                  }"
                  :title="`计划完成时间排序：${plannedFinishSortLabel}`"
                  @click="togglePlannedFinishSort"
                >
                  <span>计划完成时间</span>
                  <span v-if="plannedFinishSortOrder" class="planning-th-sort__badge">
                    {{ plannedFinishSortLabel }}
                  </span>
                  <span class="planning-th-sort__caret" aria-hidden="true"></span>
                </button>
              </th>
              <th>
                <div
                  class="planning-th-filter"
                  :class="{
                    'is-open': isHeaderFilterOpen('status'),
                    'is-active': headerFilterSelectedCount('status') > 0,
                  }"
                >
                  <button
                    type="button"
                    class="planning-th-filter__trigger"
                    @click.stop="toggleHeaderFilterMenu('status')"
                  >
                    <span>当前进展</span>
                    <span
                      v-if="headerFilterSelectedCount('status')"
                      class="planning-th-filter__count"
                    >
                      {{ headerFilterSelectedCount('status') }}
                    </span>
                    <span class="planning-th-filter__caret" aria-hidden="true"></span>
                  </button>
                  <div v-if="isHeaderFilterOpen('status')" class="planning-th-filter__menu">
                    <div class="planning-th-filter__menu-head">
                      <strong>当前进展</strong>
                      <button
                        type="button"
                        class="planning-th-filter__clear"
                        :disabled="headerFilterSelectedCount('status') === 0"
                        @click.stop="clearHeaderFilter('status')"
                      >
                        清空
                      </button>
                    </div>
                    <div
                      v-if="headerFilterOptionList('status').length"
                      class="planning-th-filter__options"
                    >
                      <label
                        v-for="item in headerFilterOptionList('status')"
                        :key="`status-${item}`"
                        class="planning-th-filter__option"
                      >
                        <input
                          type="checkbox"
                          :checked="headerFilterSelections.status.includes(item)"
                          @change="toggleHeaderFilterOption('status', item)"
                        />
                        <span>{{ item }}</span>
                      </label>
                    </div>
                    <p v-else class="planning-th-filter__empty">暂无可选项</p>
                  </div>
                </div>
              </th>
              <th class="action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="inlineCreateActive" class="planning-inline-row">
              <td class="select-col" />
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.firstScene"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.firstScene }"
                    placeholder="一级场景"
                  />
                  <small v-if="formErrors.firstScene" class="planning-inline-error">
                    {{ formErrors.firstScene }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.secondScene"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.secondScene }"
                    placeholder="二级场景"
                  />
                  <small v-if="formErrors.secondScene" class="planning-inline-error">
                    {{ formErrors.secondScene }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.activityNodeName"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.activityNodeName }"
                    placeholder="归属活动"
                  />
                  <small v-if="formErrors.activityNodeName" class="planning-inline-error">
                    {{ formErrors.activityNodeName }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.subActivityNodeName"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.subActivityNodeName }"
                    placeholder="归属子活动"
                  />
                  <small v-if="formErrors.subActivityNodeName" class="planning-inline-error">
                    {{ formErrors.subActivityNodeName }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.skillName"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.skillName }"
                    placeholder="Skill 名称"
                  />
                  <small v-if="formErrors.skillName" class="planning-inline-error">
                    {{ formErrors.skillName }}
                  </small>
                </div>
              </td>
              <td class="desc-col">
                <div class="planning-inline-field">
                  <textarea
                    v-model.trim="planningForm.skillDescription"
                    class="planning-inline-control planning-inline-control--textarea"
                    :class="{ 'has-error': formErrors.skillDescription }"
                    maxlength="300"
                    rows="1"
                    placeholder="Skill 说明"
                  />
                  <small v-if="formErrors.skillDescription" class="planning-inline-error">
                    {{ formErrors.skillDescription }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <select
                    v-model="planningForm.level"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.level }"
                  >
                    <option value="">请选择</option>
                    <option v-for="item in levelOptions" :key="item" :value="item">
                      {{ item }}
                    </option>
                  </select>
                  <small v-if="formErrors.level" class="planning-inline-error">
                    {{ formErrors.level }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.offeringName"
                    type="text"
                    class="planning-inline-control"
                    placeholder="产品"
                  />
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.owner"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.owner }"
                    placeholder="责任 Owner"
                  />
                  <small v-if="formErrors.owner" class="planning-inline-error">
                    {{ formErrors.owner }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.department"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.department }"
                    placeholder="归属部门"
                  />
                  <small v-if="formErrors.department" class="planning-inline-error">
                    {{ formErrors.department }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model.trim="planningForm.developer"
                    type="text"
                    class="planning-inline-control"
                    :class="{ 'has-error': formErrors.developer }"
                    placeholder="开发责任人"
                  />
                  <small v-if="formErrors.developer" class="planning-inline-error">
                    {{ formErrors.developer }}
                  </small>
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <input
                    v-model="planningForm.planedCompleteDate"
                    type="date"
                    class="planning-inline-control"
                  />
                </div>
              </td>
              <td>
                <div class="planning-inline-field">
                  <select v-model="planningForm.status" class="planning-inline-control">
                    <option v-for="item in progressOptions" :key="item" :value="item">
                      {{ item }}
                    </option>
                  </select>
                </div>
              </td>
              <td class="action-col">
                <div class="planning-inline-actions">
                  <button
                    type="button"
                    class="icon-btn icon-btn--confirm"
                    title="确认新增"
                    aria-label="确认新增"
                    :disabled="inlineCreateSubmitting"
                    @click="confirmInlineCreate"
                  >
                    √
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--muted"
                    title="取消新增"
                    aria-label="取消新增"
                    :disabled="inlineCreateSubmitting"
                    @click="cancelInlineCreate"
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="15" class="planning-empty">正在加载 Skill 规划数据...</td>
            </tr>
            <tr v-else-if="rows.length === 0 && !inlineCreateActive">
              <td colspan="15" class="planning-empty">暂无符合条件的 Skill 规划</td>
            </tr>
            <template v-else>
              <template v-for="row in rows" :key="row.id">
                <tr v-if="inlineEditId === row.id" class="planning-inline-row">
                  <td class="select-col" />
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.firstScene"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.firstScene }"
                        placeholder="一级场景"
                      />
                      <small v-if="formErrors.firstScene" class="planning-inline-error">
                        {{ formErrors.firstScene }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.secondScene"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.secondScene }"
                        placeholder="二级场景"
                      />
                      <small v-if="formErrors.secondScene" class="planning-inline-error">
                        {{ formErrors.secondScene }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.activityNodeName"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.activityNodeName }"
                        placeholder="归属活动"
                      />
                      <small v-if="formErrors.activityNodeName" class="planning-inline-error">
                        {{ formErrors.activityNodeName }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.subActivityNodeName"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.subActivityNodeName }"
                        placeholder="归属子活动"
                      />
                      <small v-if="formErrors.subActivityNodeName" class="planning-inline-error">
                        {{ formErrors.subActivityNodeName }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.skillName"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.skillName }"
                        placeholder="Skill 名称"
                      />
                      <small v-if="formErrors.skillName" class="planning-inline-error">
                        {{ formErrors.skillName }}
                      </small>
                    </div>
                  </td>
                  <td class="desc-col">
                    <div class="planning-inline-field">
                      <textarea
                        v-model.trim="planningForm.skillDescription"
                        class="planning-inline-control planning-inline-control--textarea"
                        :class="{ 'has-error': formErrors.skillDescription }"
                        maxlength="300"
                        rows="1"
                        placeholder="Skill 说明"
                      />
                      <small v-if="formErrors.skillDescription" class="planning-inline-error">
                        {{ formErrors.skillDescription }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <select
                        v-model="planningForm.level"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.level }"
                      >
                        <option value="">请选择</option>
                        <option v-for="item in levelOptions" :key="item" :value="item">
                          {{ item }}
                        </option>
                      </select>
                      <small v-if="formErrors.level" class="planning-inline-error">
                        {{ formErrors.level }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.offeringName"
                        type="text"
                        class="planning-inline-control"
                        placeholder="产品"
                      />
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.owner"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.owner }"
                        placeholder="责任 Owner"
                      />
                      <small v-if="formErrors.owner" class="planning-inline-error">
                        {{ formErrors.owner }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.department"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.department }"
                        placeholder="归属部门"
                      />
                      <small v-if="formErrors.department" class="planning-inline-error">
                        {{ formErrors.department }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model.trim="planningForm.developer"
                        type="text"
                        class="planning-inline-control"
                        :class="{ 'has-error': formErrors.developer }"
                        placeholder="开发责任人"
                      />
                      <small v-if="formErrors.developer" class="planning-inline-error">
                        {{ formErrors.developer }}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <input
                        v-model="planningForm.planedCompleteDate"
                        type="date"
                        class="planning-inline-control"
                      />
                    </div>
                  </td>
                  <td>
                    <div class="planning-inline-field">
                      <select v-model="planningForm.status" class="planning-inline-control">
                        <option v-for="item in progressOptions" :key="item" :value="item">
                          {{ item }}
                        </option>
                      </select>
                    </div>
                  </td>
                  <td class="action-col">
                    <div class="planning-inline-actions">
                      <button
                        type="button"
                        class="icon-btn icon-btn--confirm"
                        title="确认修改"
                        aria-label="确认修改"
                        :disabled="inlineEditSubmitting"
                        @click="confirmInlineEdit"
                      >
                        √
                      </button>
                      <button
                        type="button"
                        class="icon-btn icon-btn--muted"
                        title="取消修改"
                        aria-label="取消修改"
                        :disabled="inlineEditSubmitting"
                        @click="cancelInlineEdit"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-else>
                  <td class="select-col">
                    <input
                      type="checkbox"
                      :checked="selectedIds.includes(row.id)"
                      @change="toggleRowSelection(row.id)"
                    />
                  </td>
                  <td>{{ row.firstScene }}</td>
                  <td>{{ row.secondScene }}</td>
                  <td>{{ row.activityNodeName }}</td>
                  <td>{{ row.subActivityNodeName }}</td>
                  <td>
                    <strong class="skill-name">{{ row.skillName }}</strong>
                  </td>
                  <td class="desc-col">
                    <span :title="row.skillDescription">{{ row.skillDescription }}</span>
                  </td>
                  <td>{{ row.level }}</td>
                  <td>{{ row.offeringName }}</td>
                  <td>{{ row.owner }}</td>
                  <td>{{ row.department }}</td>
                  <td>{{ row.developer }}</td>
                  <td>{{ row.planedCompleteDate }}</td>
                  <td>
                    <span class="status-pill" :class="progressClass(row.status)">
                      {{ row.status }}
                    </span>
                  </td>
                  <td class="action-col">
                    <button
                      type="button"
                      class="icon-btn"
                      title="编辑"
                      aria-label="编辑"
                      @click="startInlineEdit(row)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                        <path d="m13 7 4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn--danger"
                      title="删除"
                      aria-label="删除"
                      @click="requestDeleteRow(row)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <div class="planning-pagination">
        <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ total }} 条</span>
        <div class="pagination-controls">
          <select v-model.number="pageSize" @change="changePageSize">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} 条/页
            </option>
          </select>
          <button type="button" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">
            上一页
          </button>
          <strong>{{ pageNum }} / {{ totalPages }}</strong>
          <button type="button" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">
            下一页
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="importDialogOpen"
        class="planning-overlay"
        role="presentation"
        @click.self="closeImportDialog"
      >
        <div class="planning-dialog planning-dialog--import" role="dialog" aria-modal="true">
          <div class="planning-dialog__head import-dialog__head">
            <div>
              <strong>导入 Skill 规划</strong>
              <p>上传 Excel 文件后，将按表头字段批量写入 Skill 规划清单。</p>
            </div>
            <button
              type="button"
              class="dialog-close"
              aria-label="关闭"
              :disabled="importSubmitting"
              @click="closeImportDialog"
            >
              ×
            </button>
          </div>

          <div class="import-dialog__body">
            <div
              class="import-dropzone"
              :class="{
                'is-dragging': importDragging,
                'has-file': selectedImportFile,
              }"
              role="button"
              tabindex="0"
              @click="openImportFilePicker"
              @keydown.enter.prevent="openImportFilePicker"
              @keydown.space.prevent="openImportFilePicker"
              @dragenter.prevent="importDragging = true"
              @dragover.prevent="importDragging = true"
              @dragleave.prevent="importDragging = false"
              @drop.prevent="handleImportDrop"
            >
              <div class="import-dropzone__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 15V4m0 0 4.5 4.5M12 4 7.5 8.5" />
                  <path d="M5 14.5V17a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2.5" />
                </svg>
              </div>
              <div class="import-dropzone__copy">
                <strong>{{
                  selectedImportFile ? selectedImportFile.name : '拖拽 Excel 文件到这里'
                }}</strong>
                <span v-if="selectedImportFile">
                  {{ selectedImportFileSize }} · 点击可重新选择文件
                </span>
                <span v-else>或点击选择文件，支持 .xlsx / .xls</span>
              </div>
              <button
                type="button"
                class="import-dropzone__pick"
                @click.stop="openImportFilePicker"
              >
                选择文件
              </button>
            </div>

            <p v-if="importError" class="import-dialog__error">{{ importError }}</p>

            <div class="import-dialog__template">
              <button
                type="button"
                class="import-template-link"
                :disabled="templateDownloadPending"
                @click="handleDownloadImportTemplate"
              >
                <span class="import-template-link__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
                    <path d="M5 18h14" />
                  </svg>
                </span>
                <span>{{ templateDownloadPending ? '下载导入模板中...' : '下载导入模板' }}</span>
              </button>
            </div>
          </div>

          <div class="planning-dialog__actions import-dialog__actions">
            <button
              type="button"
              class="planning-btn planning-btn--ghost"
              :disabled="importSubmitting"
              @click="closeImportDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="planning-btn planning-btn--primary"
              :disabled="!selectedImportFile || importSubmitting"
              @click="submitImportFile"
            >
              {{ importSubmitting ? '导入中...' : '开始导入' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="batchDialogOpen"
        class="planning-overlay"
        role="presentation"
        @click.self="closeBatchEditDialog"
      >
        <div
          class="planning-dialog planning-dialog--wide planning-dialog--batch"
          role="dialog"
          aria-modal="true"
        >
          <div class="planning-dialog__head">
            <div>
              <strong>批量修改 Skill 规划</strong>
              <p>已选 {{ selectedIds.length }} 条，未填写字段将保持原值。</p>
            </div>
            <button
              type="button"
              class="dialog-close"
              aria-label="关闭"
              :disabled="batchSubmitting"
              @click="closeBatchEditDialog"
            >
              ×
            </button>
          </div>
          <div class="batch-form">
            <div class="batch-form__locked" aria-label="不可修改字段">
              <strong>不可修改字段</strong>
              <div class="batch-form__locked-list">
                <span v-for="item in batchReadonlyHeaders" :key="item">{{ item }}</span>
              </div>
            </div>
            <div class="batch-form__grid">
              <label class="planning-field">
                <span>产品</span>
                <input
                  v-model.trim="batchForm.offeringName"
                  type="text"
                  placeholder="不填写则不修改"
                />
              </label>
              <label class="planning-field">
                <span>责任 Owner</span>
                <input v-model.trim="batchForm.owner" type="text" placeholder="不填写则不修改" />
              </label>
              <label class="planning-field">
                <span>归属部门</span>
                <input
                  v-model.trim="batchForm.department"
                  type="text"
                  placeholder="不填写则不修改"
                />
              </label>
              <label class="planning-field">
                <span>开发责任人</span>
                <input
                  v-model.trim="batchForm.developer"
                  type="text"
                  placeholder="不填写则不修改"
                />
              </label>
              <label class="planning-field">
                <span>计划完成时间</span>
                <input v-model="batchForm.planedCompleteDate" type="date" />
              </label>
              <label class="planning-field">
                <span>当前进展</span>
                <select v-model="batchForm.status">
                  <option value="">不修改</option>
                  <option v-for="item in progressOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label class="planning-field planning-field--textarea">
                <span>Skill 说明</span>
                <textarea
                  v-model.trim="batchForm.skillDescription"
                  maxlength="300"
                  placeholder="不填写则不修改，最多 300 字"
                />
                <small v-if="batchErrors.skillDescription">{{
                  batchErrors.skillDescription
                }}</small>
              </label>
            </div>
          </div>
          <div class="planning-dialog__actions">
            <button
              type="button"
              class="planning-btn planning-btn--ghost"
              :disabled="batchSubmitting"
              @click="closeBatchEditDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="planning-btn planning-btn--primary"
              :disabled="batchSubmitting"
              @click="submitBatchEdit"
            >
              {{ batchSubmitting ? '修改中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="formDialogOpen"
        class="planning-overlay"
        role="presentation"
        @click.self="closeFormDialog"
      >
        <div class="planning-dialog planning-dialog--wide" role="dialog" aria-modal="true">
          <div class="planning-dialog__head">
            <div>
              <strong>{{ formMode === 'create' ? '新增 Skill 规划' : '编辑 Skill 规划' }}</strong>
              <p>请按表格字段填写规划建设信息。</p>
            </div>
            <button type="button" class="dialog-close" aria-label="关闭" @click="closeFormDialog">
              ×
            </button>
          </div>
          <div class="planning-form-grid">
            <label class="planning-field">
              <span>一级场景 <em>*</em></span>
              <input v-model.trim="planningForm.firstScene" type="text" />
              <small v-if="formErrors.firstScene">{{ formErrors.firstScene }}</small>
            </label>
            <label class="planning-field">
              <span>二级场景 <em>*</em></span>
              <input v-model.trim="planningForm.secondScene" type="text" />
              <small v-if="formErrors.secondScene">{{ formErrors.secondScene }}</small>
            </label>
            <label class="planning-field">
              <span>归属活动 <em>*</em></span>
              <input v-model.trim="planningForm.activityNodeName" type="text" />
              <small v-if="formErrors.activityNodeName">{{ formErrors.activityNodeName }}</small>
            </label>
            <label class="planning-field">
              <span>归属子活动 <em>*</em></span>
              <input v-model.trim="planningForm.subActivityNodeName" type="text" />
              <small v-if="formErrors.subActivityNodeName">{{
                formErrors.subActivityNodeName
              }}</small>
            </label>
            <label class="planning-field">
              <span>Skill 名称 <em>*</em></span>
              <input v-model.trim="planningForm.skillName" type="text" />
              <small v-if="formErrors.skillName">{{ formErrors.skillName }}</small>
            </label>
            <label class="planning-field">
              <span>层级 <em>*</em></span>
              <select v-model="planningForm.level">
                <option value="">请选择</option>
                <option v-for="item in levelOptions" :key="item" :value="item">{{ item }}</option>
              </select>
              <small v-if="formErrors.level">{{ formErrors.level }}</small>
            </label>
            <label class="planning-field">
              <span>产品</span>
              <input v-model.trim="planningForm.offeringName" type="text" />
            </label>
            <label class="planning-field">
              <span>责任 Owner <em>*</em></span>
              <input v-model.trim="planningForm.owner" type="text" />
              <small v-if="formErrors.owner">{{ formErrors.owner }}</small>
            </label>
            <label class="planning-field">
              <span>归属部门 <em>*</em></span>
              <input v-model.trim="planningForm.department" type="text" />
              <small v-if="formErrors.department">{{ formErrors.department }}</small>
            </label>
            <label class="planning-field">
              <span>开发责任人 <em>*</em></span>
              <input v-model.trim="planningForm.developer" type="text" />
              <small v-if="formErrors.developer">{{ formErrors.developer }}</small>
            </label>
            <label class="planning-field">
              <span>计划完成时间</span>
              <input v-model="planningForm.planedCompleteDate" type="date" />
            </label>
            <label class="planning-field">
              <span>当前进展</span>
              <select v-model="planningForm.status">
                <option v-for="item in progressOptions" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label class="planning-field planning-field--textarea">
              <span>Skill 说明 <em>*</em></span>
              <textarea
                v-model.trim="planningForm.skillDescription"
                maxlength="300"
                placeholder="最多 300 字"
              />
              <small v-if="formErrors.skillDescription">{{ formErrors.skillDescription }}</small>
            </label>
          </div>
          <div class="planning-dialog__actions">
            <button type="button" class="planning-btn planning-btn--ghost" @click="closeFormDialog">
              取消
            </button>
            <button
              type="button"
              class="planning-btn planning-btn--primary"
              @click="submitPlanningForm"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="confirmDialog.open"
        class="planning-overlay"
        role="presentation"
        @click.self="closeConfirmDialog"
      >
        <div class="planning-dialog planning-dialog--confirm" role="dialog" aria-modal="true">
          <div class="confirm-icon" aria-hidden="true">!</div>
          <strong>{{ confirmDialog.title }}</strong>
          <p>{{ confirmDialog.message }}</p>
          <div class="planning-dialog__actions">
            <button
              type="button"
              class="planning-btn planning-btn--ghost"
              @click="closeConfirmDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="planning-btn planning-btn--danger"
              @click="confirmDialogAction"
            >
              {{ confirmDialog.dangerText }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="planning-toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/style/UserMarketShell.scss';
.planning-pageNum {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: #17233d;
}

.planning-hero {
  /* min-height: 154px; */
  display: flex;
  margin-top: 110px;
  padding-bottom: 30px;
  /* align-items: center;
  padding: 34px 40px;
  border: 1px solid rgba(225, 230, 240, 0.92);
  border-radius: 8px;
  background:
    linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.94) 0%,
      rgba(246, 250, 255, 0.92) 58%,
      rgba(248, 243, 255, 0.92) 100%
    ),
    linear-gradient(90deg, rgba(47, 125, 246, 0.08), rgba(117, 82, 255, 0.08));
  box-shadow: 0 18px 48px rgba(35, 52, 84, 0.08); */
}

.planning-hero h2 {
  margin: 0;
  color: #07172f;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.18;
}

.planning-hero p {
  max-width: 820px;
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.planning-filter-card,
.planning-board {
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.06);
}

.planning-filter-card {
  padding: 18px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 14px;
  align-items: end;
}

.planning-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.planning-field span {
  color: #52647d;
  font-size: 12px;
  font-weight: 800;
}

.planning-field em {
  color: #dc2626;
  font-style: normal;
}

.planning-field input,
.planning-field select,
.planning-field textarea {
  width: 100%;
  min-width: 0;
  height: 38px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
}

.planning-field input,
.planning-field select {
  padding: 0 11px;
}

.planning-field input {
  min-width: 50%;
}

.planning-field--dept {
  min-width: 0;
}

.planning-dept-cascader {
  width: 100%;
  min-width: 0;
}

.planning-dept-cascader :deep(.market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  padding: 0 30px 0 11px;
  border-color: #d8e2f0;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}

.planning-dept-cascader :deep(.market-dept-cascader-trigger:hover) {
  border-color: #c0ccdc;
  background: #f8fbff;
}

.planning-dept-cascader :deep(.market-dept-cascader-trigger.is-open),
.planning-dept-cascader :deep(.market-dept-cascader-trigger:focus) {
  border-color: #5b8ff9;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}

.planning-dept-cascader :deep(.market-dept-cascader-caret) {
  right: 10px;
}

.planning-field textarea {
  min-height: 96px;
  padding: 10px 11px;
  line-height: 1.6;
  resize: vertical;
}

.planning-field input:focus,
.planning-field select:focus,
.planning-field textarea:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}

.planning-field small {
  color: #dc2626;
  font-size: 12px;
}

.planning-field--keyword {
  grid-column: span 2;
}

.filter-actions {
  display: flex;
  gap: 10px;
}

.planning-btn {
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

.planning-btn svg,
.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.planning-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.planning-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.planning-btn--primary {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(47, 125, 246, 0.18);
}

.planning-btn--soft,
.planning-btn--ghost {
  border-color: #dbe5f2;
  background: #ffffff;
  color: #253857;
}

.planning-btn--soft:hover,
.planning-btn--ghost:hover {
  border-color: #b9ccff;
  background: #f6f9ff;
}

.planning-btn--danger-soft {
  border-color: #ffd7d7;
  background: #fff7f7;
  color: #dc2626;
}

.planning-btn--danger {
  border-color: #dc2626;
  background: #dc2626;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(220, 38, 38, 0.18);
}

.planning-board {
  overflow: hidden;
}

.planning-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #edf2f7;
}

.planning-toolbar__summary {
  display: grid;
  gap: 4px;
}

.planning-toolbar__summary strong {
  color: #101828;
  font-size: 17px;
  font-weight: 900;
}

.planning-toolbar__summary span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.planning-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.planning-import-input {
  display: none;
}

.planning-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.planning-table {
  width: 100%;
  min-width: 1800px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.planning-table thead {
  position: relative;
  z-index: 20;
}

.planning-table th,
.planning-table td {
  padding: 13px 12px;
  border-bottom: 1px solid #edf2f7;
  color: #334155;
  font-size: 13px;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}

.planning-table th {
  position: sticky;
  top: 0;
  z-index: 21;
  overflow: visible;
  background: #f8fbff;
  color: #52647d;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.planning-th-filter {
  position: relative;
  min-width: 0;
}

.planning-th-filter.is-open {
  z-index: 40;
}

.planning-th-filter__trigger,
.planning-th-sort {
  width: 100%;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color 0.16s ease;
}

.planning-th-filter__trigger:hover,
.planning-th-sort:hover {
  color: #1d4ed8;
}

.planning-th-filter.is-active .planning-th-filter__trigger,
.planning-th-filter.is-open .planning-th-filter__trigger,
.planning-th-sort.is-active {
  color: #1d4ed8;
}

.planning-th-filter__count,
.planning-th-sort__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #eaf2ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.planning-th-filter__caret,
.planning-th-sort__caret {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  opacity: 0.8;
  transform: translateY(-1px) rotate(45deg);
  transition: transform 0.16s ease;
}

.planning-th-filter.is-open .planning-th-filter__caret {
  transform: translateY(1px) rotate(-135deg);
}

.planning-th-sort.is-active .planning-th-sort__caret {
  transform: translateY(1px) rotate(-135deg);
}

.planning-th-sort.is-desc .planning-th-sort__caret {
  transform: translateY(-1px) rotate(45deg);
}

.planning-th-filter__menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 60;
  width: 220px;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbe5f2;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
}

.planning-th-filter__menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.planning-th-filter__menu-head strong {
  color: #253857;
  font-size: 13px;
  font-weight: 900;
}

.planning-th-filter__clear {
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #52647d;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.planning-th-filter__clear:hover:not(:disabled) {
  border-color: #b9ccff;
  background: #f6f9ff;
  color: #1d4ed8;
}

.planning-th-filter__clear:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.planning-th-filter__options {
  max-height: 240px;
  display: grid;
  gap: 6px;
  overflow-y: auto;
}

.planning-th-filter__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.planning-th-filter__option:hover {
  background: #f8fbff;
}

.planning-th-filter__option input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #2563eb;
}

.planning-th-filter__empty {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
}

.planning-table tbody tr:hover td {
  background: #f8fbff;
}

.planning-inline-row td {
  vertical-align: top;
  background: #f8fbff;
}

.planning-inline-field {
  display: grid;
  gap: 4px;
}

.planning-inline-control {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
}

.planning-inline-control--textarea {
  height: auto;
  min-height: 34px;
  padding: 8px 10px;
  line-height: 1.5;
  resize: vertical;
}

.planning-inline-control:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}

.planning-inline-control.has-error {
  border-color: #fca5a5;
  background: #fff7f7;
}

.planning-inline-error {
  color: #dc2626;
  font-size: 11px;
  line-height: 1.4;
}

.planning-inline-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.planning-inline-actions .icon-btn {
  margin-right: 0;
}

.select-col {
  width: 46px;
  text-align: center;
}

.desc-col {
  width: 270px;
}

.action-col {
  width: 98px;
}

.skill-name {
  color: #10243e;
  font-weight: 900;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.status-idle {
  background: #f1f5f9;
  color: #64748b;
}

.status-dev {
  background: #eef6ff;
  color: #2563eb;
}

.status-test {
  background: #ecfeff;
  color: #0891b2;
}

.status-done {
  background: #ecfdf5;
  color: #059669;
}

.status-delay {
  background: #fff1f2;
  color: #e11d48;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #2563eb;
  cursor: pointer;
}

.icon-btn:hover {
  border-color: #b9ccff;
  background: #eff6ff;
}

.icon-btn--danger {
  color: #dc2626;
}

.icon-btn--danger:hover {
  border-color: #fecaca;
  background: #fff1f2;
}

.icon-btn--confirm {
  color: #059669;
}

.icon-btn--confirm:hover {
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.icon-btn--muted {
  color: #64748b;
}

.icon-btn--muted:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.planning-empty {
  height: 108px;
  color: #64748b;
  text-align: center;
}

.planning-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  color: #64748b;
  font-size: 13px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-controls select,
.pagination-controls button {
  height: 32px;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 13px;
}

.pagination-controls select {
  padding: 0 8px;
}

.pagination-controls button {
  padding: 0 10px;
  cursor: pointer;
}

.pagination-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.planning-overlay {
  position: fixed;
  inset: 0;
  z-index: 920;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(10px);
}

.planning-dialog {
  width: min(560px, 100%);
  max-height: min(86vh, 780px);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 28px 70px rgba(22, 34, 51, 0.18);
  overflow: hidden;
}

.planning-dialog--wide {
  width: min(940px, calc(100vw - 40px));
}

.planning-dialog--import {
  width: min(720px, calc(100vw - 40px));
}

.planning-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid #edf2f7;
}

.planning-dialog__head strong {
  color: #101828;
  font-size: 17px;
  font-weight: 900;
}

.planning-dialog__head p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.import-dialog__head {
  background:
    radial-gradient(circle at 10% 0%, rgba(47, 125, 246, 0.1), transparent 34%),
    radial-gradient(circle at 92% 16%, rgba(117, 82, 255, 0.1), transparent 36%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.dialog-close {
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: #f8fafc;
  color: #64748b;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.dialog-close:hover {
  border-color: #dbe5f2;
  background: #ffffff;
}

.import-dialog__body {
  display: grid;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.import-dropzone {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 168px;
  padding: 26px;
  border: 1.5px dashed #b9ccff;
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(47, 125, 246, 0.08) 0%, rgba(117, 82, 255, 0.07) 100%), #f8fbff;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.78),
    0 14px 34px rgba(35, 52, 84, 0.07);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.import-dropzone:hover,
.import-dropzone.is-dragging {
  border-color: #4f7cff;
  background:
    linear-gradient(135deg, rgba(47, 125, 246, 0.13) 0%, rgba(117, 82, 255, 0.12) 100%), #f6f9ff;
  box-shadow:
    0 0 0 4px rgba(79, 124, 255, 0.12),
    0 18px 42px rgba(35, 52, 84, 0.1);
  transform: translateY(-1px);
}

.import-dropzone.has-file {
  border-style: solid;
  border-color: #93c5fd;
  background:
    radial-gradient(circle at 16% 18%, rgba(46, 205, 211, 0.12), transparent 30%),
    linear-gradient(135deg, rgba(47, 125, 246, 0.1) 0%, rgba(117, 82, 255, 0.08) 100%), #ffffff;
}

.import-dropzone__icon {
  width: 62px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #2f7df6 0%, #7552ff 100%);
  color: #ffffff;
  box-shadow: 0 16px 30px rgba(47, 125, 246, 0.26);
}

.import-dropzone__icon svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.import-dropzone__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.import-dropzone__copy strong {
  overflow: hidden;
  color: #10243e;
  font-size: 18px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-dropzone__copy span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.import-dropzone__pick {
  min-width: 92px;
  height: 38px;
  border: 1px solid #bfd5ff;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.08);
}

.import-dropzone__pick:hover {
  border-color: #60a5fa;
  background: #eff6ff;
}

.import-dialog__error {
  margin: -4px 0 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff1f2;
  color: #dc2626;
  font-size: 13px;
  font-weight: 800;
}

.import-dialog__template {
  display: flex;
  align-items: center;
  min-height: 28px;
}

.import-template-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: #1d4ed8;
  font: inherit;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: color 0.18s ease;
}

.import-template-link:hover {
  color: #1e40af;
}

.import-template-link:disabled {
  color: #94a3b8;
  cursor: wait;
}

.import-template-link__icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.import-template-link__icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.import-dialog__actions {
  background: #fbfdff;
}

.planning-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  padding: 18px 20px;
  overflow-y: auto;
}

.planning-field--textarea {
  grid-column: 1 / -1;
}

.batch-form {
  display: grid;
  gap: 16px;
  padding: 18px 20px;
  overflow-y: auto;
}

.batch-form__locked {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #f8fbff;
}

.batch-form__locked strong {
  color: #253857;
  font-size: 13px;
  font-weight: 900;
}

.batch-form__locked-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.batch-form__locked-list span {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid #dbe5f2;
  border-radius: 999px;
  background: #ffffff;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.batch-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.planning-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid #edf2f7;
}

.planning-dialog--confirm {
  align-items: center;
  padding: 26px 24px 22px;
  text-align: center;
}

.planning-dialog--confirm strong {
  margin-top: 12px;
  color: #101828;
  font-size: 18px;
  font-weight: 900;
}

.planning-dialog--confirm p {
  max-width: 420px;
  margin: 8px 0 4px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.7;
}

.planning-dialog--confirm .planning-dialog__actions {
  width: 100%;
  border-top: 0;
  padding: 16px 0 0;
}

.confirm-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #fff1f2;
  color: #dc2626;
  font-size: 24px;
  font-weight: 900;
}

.planning-toast {
  position: fixed;
  left: 50%;
  bottom: 30px;
  z-index: 940;
  transform: translateX(-50%);
  max-width: min(640px, calc(100vw - 32px));
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(29, 29, 31, 0.9);
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 14px 34px rgba(22, 34, 51, 0.16);
}

@media (max-width: 1280px) {
  .filter-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}

@media (max-width: 820px) {
  .planning-hero {
    padding: 26px 22px;
  }

  .planning-hero h1 {
    font-size: 32px;
  }

  .filter-grid,
  .planning-form-grid,
  .batch-form__grid {
    grid-template-columns: 1fr;
  }

  .planning-field--keyword,
  .planning-field--textarea {
    grid-column: auto;
  }

  .planning-toolbar,
  .planning-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .planning-toolbar__actions,
  .filter-actions,
  .pagination-controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .import-dropzone {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 22px 18px;
    text-align: center;
  }

  .import-dropzone__copy strong {
    white-space: normal;
  }
}
</style>

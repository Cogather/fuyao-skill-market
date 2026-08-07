<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import MarketDeptCascader from './MarketDeptCascader.vue';
import {
  getHarnessCapabilityPlanningApi,
  type HarnessCapabilityType,
} from '../../services/skillMarket/harnessCapabilityPlanningService';
import type { SkillTransferParams } from '../../services/skillMarket/apiTypes';
import { getDepartmentNodeCode } from '../../services/skillMarket/marketDeptTreeFromApi';
import {
  querySkillPlanningUsers,
  type SkillPlanningUserOption,
} from '../../services/skillMarket/skillPlanningService';
import type { ProductPlanningOption } from '../../services/skillMarket/skillPlanningShared';
import type {
  SkillMasterPayload,
  SkillMasterRecord,
  SkillMasterStatus,
} from '../../services/skillMarket/skillMasterManagementService';

type DepartmentNode = {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentNode[];
};

type PersonPickerState = {
  keyword: string;
  open: boolean;
  loading: boolean;
  options: SkillPlanningUserOption[];
  message: string;
  selected: SkillPlanningUserOption | null;
};

type CapabilityCatalogEditorPayload = SkillMasterPayload & {
  ownerId: string;
  developOwnerId: string;
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
    capabilityType: Exclude<HarnessCapabilityType, 'skill'>;
    departmentTree?: DepartmentNode[];
    userId?: string;
    currentUserDepartmentPath?: string[];
    defaultDepartmentPath?: string[];
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    currentUserDepartmentPath: () => [],
    defaultDepartmentPath: () => [],
  },
);

const api = computed(() => getHarnessCapabilityPlanningApi(props.capabilityType));
const capabilityLabel = computed(() => api.value.label);
const departmentSegments = ref<string[]>([]);
const filterForm = reactive({
  level: '部门级',
  departmentName: '',
  product: '',
  keyword: '',
});
const productOptions = ref<ProductPlanningOption[]>([]);
const productsLoading = ref(false);
const records = ref<SkillMasterRecord[]>([]);
const loading = ref(false);
const selectedIds = ref<string[]>([]);
const pageNum = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [5, 10, 20, 50];
const toast = ref('');
let toastTimer: number | null = null;
const importInputRef = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const exporting = ref(false);
let productLoadSequence = 0;
const ownerPicker = reactive(createPersonPickerState());
const developOwnerPicker = reactive(createPersonPickerState());
let ownerSearchTimer: number | null = null;
let developOwnerSearchTimer: number | null = null;
let ownerSearchSequence = 0;
let developOwnerSearchSequence = 0;

const editor = reactive({
  open: false,
  mode: 'create' as 'create' | 'edit',
  id: '',
  name: '',
  description: '',
  owner: '',
  department: '',
  developOwner: '',
  developOwnerDepartment: '',
  plannedCompleteDate: '',
  status: '未开始' as SkillMasterStatus,
  error: '',
  submitting: false,
});

const deleteDialog = reactive({
  open: false,
  ids: [] as string[],
  title: '',
  message: '',
  submitting: false,
});

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2600);
}

function normalizePath(path: string[]): string[] {
  return path
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function pathExists(nodes: DepartmentNode[], path: string[]): boolean {
  let current = nodes;
  for (const segment of path) {
    const node = current.find((item) => item.name === segment);
    if (!node) return false;
    current = node.children ?? [];
  }
  return path.length > 0;
}

function firstLeafPath(nodes: DepartmentNode[], parent: string[] = []): string[] {
  for (const node of nodes) {
    const path = [...parent, node.name];
    if (!node.children?.length) return path;
    const nested = firstLeafPath(node.children, path);
    if (nested.length) return nested;
  }
  return [];
}

function findDepartmentNode(path = departmentSegments.value): DepartmentNode | null {
  let nodes = props.departmentTree;
  let matched: DepartmentNode | null = null;
  for (const segment of normalizePath(path)) {
    matched = nodes.find((item) => item.name === segment) ?? null;
    if (!matched) return null;
    nodes = matched.children ?? [];
  }
  return matched;
}

const selectedProduct = computed(() =>
  productOptions.value.find((item) => item.offeringName === filterForm.product),
);

const catalogScopeErrorMessage = computed(() => {
  if (!props.userId.trim()) return '尚未获取当前用户工号';
  if (!filterForm.departmentName.trim()) {
    return filterForm.level === '产品级' ? '请选择产品所属部门' : '请选择归属部门';
  }
  const departmentCode = getDepartmentNodeCode(findDepartmentNode());
  if (!departmentCode) return '所选部门缺少部门编码，请刷新部门数据后重试';
  if (filterForm.level === '产品级') {
    if (!filterForm.product.trim()) return '请选择产品';
    if (!selectedProduct.value?.offeringId) return '所选产品缺少产品编码，请重新选择';
  }
  return '';
});

const currentCatalogScope = computed<SkillTransferParams | null>(() => {
  if (catalogScopeErrorMessage.value) return null;
  if (filterForm.level === '产品级') {
    return {
      userId: props.userId.trim(),
      dimType: '产品级',
      dimCode: selectedProduct.value?.offeringId ?? '',
      dimName: filterForm.product.trim(),
    };
  }
  return {
    userId: props.userId.trim(),
    dimType: '部门级',
    dimCode: getDepartmentNodeCode(findDepartmentNode()),
    dimName: filterForm.departmentName.trim(),
  };
});

function requireCatalogScope(): SkillTransferParams {
  const scope = currentCatalogScope.value;
  if (!scope) throw new Error(catalogScopeErrorMessage.value || '请选择清单范围');
  return scope;
}

async function loadProductOptions(): Promise<void> {
  const requestSequence = ++productLoadSequence;
  productOptions.value = [];
  productsLoading.value = false;
  if (filterForm.level !== '产品级' || !filterForm.departmentName.trim()) return;
  const departmentCode = getDepartmentNodeCode(findDepartmentNode());
  if (!departmentCode) return;
  productsLoading.value = true;
  try {
    const options = await api.value.getProducts(
      '',
      filterForm.departmentName.trim(),
      departmentCode,
    );
    if (requestSequence !== productLoadSequence) return;
    productOptions.value = options;
    if (!options.some((item) => item.offeringName === filterForm.product)) {
      filterForm.product = '';
    }
  } catch (error) {
    if (requestSequence === productLoadSequence) {
      showToast(error instanceof Error ? error.message : '产品列表加载失败');
    }
  } finally {
    if (requestSequence === productLoadSequence) productsLoading.value = false;
  }
}

function applyDefaultDepartment(): void {
  const permissionDefault = normalizePath(props.defaultDepartmentPath);
  const preferred = permissionDefault.length
    ? permissionDefault
    : normalizePath(props.currentUserDepartmentPath);
  const path = pathExists(props.departmentTree, preferred)
    ? preferred
    : firstLeafPath(props.departmentTree);
  departmentSegments.value = path;
  filterForm.departmentName = path.at(-1) ?? '';
}

const total = computed(() => records.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageRecords = computed(() => {
  const start = (pageNum.value - 1) * pageSize.value;
  return records.value.slice(start, start + pageSize.value);
});
const pageStart = computed(() => (total.value ? (pageNum.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(total.value, pageNum.value * pageSize.value));
const allPageSelected = computed(
  () =>
    pageRecords.value.length > 0 &&
    pageRecords.value.every((record) => selectedIds.value.includes(record.id)),
);

async function reload(): Promise<void> {
  const scope = currentCatalogScope.value;
  if (!scope) {
    records.value = [];
    selectedIds.value = [];
    return;
  }
  loading.value = true;
  try {
    records.value = await api.value.queryCatalog({
      ...scope,
      keyword: filterForm.keyword,
      departmentName: filterForm.departmentName,
      level: filterForm.level,
      product: filterForm.product,
    });
    if (pageNum.value > totalPages.value) pageNum.value = totalPages.value;
    selectedIds.value = selectedIds.value.filter((id) =>
      records.value.some((record) => record.id === id),
    );
  } catch (error) {
    records.value = [];
    showToast(error instanceof Error ? error.message : '清单加载失败');
  } finally {
    loading.value = false;
  }
}

async function onDepartmentDone(path: string[] = []): Promise<void> {
  departmentSegments.value = normalizePath(path);
  filterForm.departmentName = departmentSegments.value.at(-1) ?? '';
  filterForm.product = '';
  await loadProductOptions();
  pageNum.value = 1;
  await reload();
}

async function applyQuery(): Promise<void> {
  pageNum.value = 1;
  await reload();
}

async function resetQuery(): Promise<void> {
  filterForm.level = '部门级';
  filterForm.product = '';
  filterForm.keyword = '';
  applyDefaultDepartment();
  await loadProductOptions();
  pageNum.value = 1;
  await reload();
}

async function onLevelChange(): Promise<void> {
  filterForm.product = '';
  pageNum.value = 1;
  await loadProductOptions();
  await reload();
}

async function onProductChange(): Promise<void> {
  pageNum.value = 1;
  await reload();
}

function toggleSelection(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id];
}

function togglePageSelection(): void {
  const ids = pageRecords.value.map((record) => record.id);
  selectedIds.value = allPageSelected.value
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])];
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

function resetPersonPicker(picker: PersonPickerState): void {
  if (picker === ownerPicker) closeOwnerPersonSearch();
  if (picker === developOwnerPicker) closeDevelopOwnerPersonSearch();
  Object.assign(picker, createPersonPickerState());
}

function selectOwner(option: SkillPlanningUserOption): void {
  ownerPicker.selected = option;
  ownerPicker.keyword = option.label;
  editor.owner = option.label;
  editor.department = option.deptName;
  editor.error = '';
  closeOwnerPersonSearch();
}

function selectDevelopOwner(option: SkillPlanningUserOption): void {
  developOwnerPicker.selected = option;
  developOwnerPicker.keyword = option.label;
  editor.developOwner = option.label;
  editor.developOwnerDepartment = option.deptName;
  editor.error = '';
  closeDevelopOwnerPersonSearch();
}

function clearOwnerSelection(): void {
  resetPersonPicker(ownerPicker);
  editor.owner = '';
  editor.department = '';
  editor.error = '';
}

function clearDevelopOwnerSelection(): void {
  resetPersonPicker(developOwnerPicker);
  editor.developOwner = '';
  editor.developOwnerDepartment = '';
  editor.error = '';
}

async function searchOwnerUsers(): Promise<void> {
  const keyword = ownerPicker.keyword.trim();
  ownerPicker.open = true;
  ownerPicker.message = '';
  if (!keyword) {
    ownerSearchSequence += 1;
    ownerPicker.loading = false;
    ownerPicker.options = [];
    ownerPicker.message = '请输入人员信息';
    return;
  }
  const requestSequence = ++ownerSearchSequence;
  ownerPicker.loading = true;
  try {
    const options = await querySkillPlanningUsers(keyword);
    if (requestSequence !== ownerSearchSequence) return;
    ownerPicker.options = options;
    ownerPicker.message = options.length ? '' : '暂无匹配人员';
  } catch (error) {
    if (requestSequence !== ownerSearchSequence) return;
    ownerPicker.options = [];
    ownerPicker.message = error instanceof Error ? error.message : '人员查询失败，请稍后重试';
  } finally {
    if (requestSequence === ownerSearchSequence) ownerPicker.loading = false;
  }
}

async function searchDevelopOwnerUsers(): Promise<void> {
  const keyword = developOwnerPicker.keyword.trim();
  developOwnerPicker.open = true;
  developOwnerPicker.message = '';
  if (!keyword) {
    developOwnerSearchSequence += 1;
    developOwnerPicker.loading = false;
    developOwnerPicker.options = [];
    developOwnerPicker.message = '请输入人员信息';
    return;
  }
  const requestSequence = ++developOwnerSearchSequence;
  developOwnerPicker.loading = true;
  try {
    const options = await querySkillPlanningUsers(keyword);
    if (requestSequence !== developOwnerSearchSequence) return;
    developOwnerPicker.options = options;
    developOwnerPicker.message = options.length ? '' : '暂无匹配人员';
  } catch (error) {
    if (requestSequence !== developOwnerSearchSequence) return;
    developOwnerPicker.options = [];
    developOwnerPicker.message =
      error instanceof Error ? error.message : '人员查询失败，请稍后重试';
  } finally {
    if (requestSequence === developOwnerSearchSequence) developOwnerPicker.loading = false;
  }
}

function onOwnerPickerFocus(): void {
  if (editor.owner.trim()) return;
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
  if (editor.developOwner.trim()) return;
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
  ownerPicker.keyword = event.target instanceof HTMLInputElement ? event.target.value : '';
  ownerPicker.selected = null;
  ownerPicker.open = true;
  clearOwnerSearchTimer();
  ownerSearchTimer = window.setTimeout(() => void searchOwnerUsers(), 250);
}

function onDevelopOwnerPickerInput(event: Event): void {
  developOwnerPicker.keyword = event.target instanceof HTMLInputElement ? event.target.value : '';
  developOwnerPicker.selected = null;
  developOwnerPicker.open = true;
  clearDevelopOwnerSearchTimer();
  developOwnerSearchTimer = window.setTimeout(() => void searchDevelopOwnerUsers(), 250);
}

function hydratePersonPicker(picker: PersonPickerState, label: string, department: string): void {
  resetPersonPicker(picker);
  const normalized = label.trim();
  picker.keyword = normalized;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return;
  const id = parts.at(-1) ?? '';
  picker.selected = {
    id,
    sAMAccountName: id,
    chName: parts.slice(0, -1).join(' '),
    label: normalized,
    deptName: department.trim(),
    raw: {},
  };
}

function resetEditor(): void {
  Object.assign(editor, {
    id: '',
    name: '',
    description: '',
    owner: '',
    department: filterForm.departmentName,
    developOwner: '',
    developOwnerDepartment: '',
    plannedCompleteDate: '',
    status: '未开始' as SkillMasterStatus,
    error: '',
    submitting: false,
  });
  resetPersonPicker(ownerPicker);
  resetPersonPicker(developOwnerPicker);
}

function openCreate(): void {
  resetEditor();
  editor.mode = 'create';
  editor.open = true;
}

function openEdit(record: SkillMasterRecord): void {
  Object.assign(editor, {
    open: true,
    mode: 'edit',
    id: record.id,
    name: record.name,
    description: record.description,
    owner: record.owner,
    department: record.department,
    developOwner: record.developOwner,
    developOwnerDepartment: record.developOwnerDepartment,
    plannedCompleteDate: record.plannedCompleteDate,
    status: record.status,
    error: '',
    submitting: false,
  });
  hydratePersonPicker(ownerPicker, record.owner, record.department);
  hydratePersonPicker(developOwnerPicker, record.developOwner, record.developOwnerDepartment);
}

function closeEditor(): void {
  if (editor.submitting) return;
  editor.open = false;
  editor.error = '';
  resetPersonPicker(ownerPicker);
  resetPersonPicker(developOwnerPicker);
}

function editorPayload(): CapabilityCatalogEditorPayload {
  return {
    name: editor.name,
    description: editor.description,
    level: filterForm.level,
    product: filterForm.level === '产品级' ? filterForm.product : '',
    owner: editor.owner,
    ownerId: ownerPicker.selected?.sAMAccountName.trim() ?? '',
    department: filterForm.departmentName,
    developOwner: editor.developOwner,
    developOwnerId: developOwnerPicker.selected?.sAMAccountName.trim() ?? '',
    developOwnerDepartment: editor.developOwnerDepartment,
    plannedCompleteDate: editor.plannedCompleteDate,
    status: editor.status,
  };
}

async function submitEditor(): Promise<void> {
  editor.error = '';
  if (!editor.name.trim()) {
    editor.error = `请输入 ${capabilityLabel.value} 名称`;
    return;
  }
  if (!editor.description.trim()) {
    editor.error = `请输入 ${capabilityLabel.value} 说明`;
    return;
  }
  if (!ownerPicker.selected || !editor.owner.trim()) {
    editor.error = '请选择责任 Owner，不能只输入文本';
    return;
  }
  if (!developOwnerPicker.selected || !editor.developOwner.trim()) {
    editor.error = '请选择开发责任人，不能只输入文本';
    return;
  }
  if (!editor.plannedCompleteDate) {
    editor.error = '请选择计划完成时间';
    return;
  }
  try {
    editor.submitting = true;
    const scope = requireCatalogScope();
    if (editor.mode === 'create') {
      await api.value.createCatalog(editorPayload(), scope);
      showToast(`已新增 ${capabilityLabel.value}`);
    } else {
      await api.value.updateCatalog(editor.id, editorPayload(), scope);
      showToast('已保存修改');
    }
    editor.open = false;
    await reload();
  } catch (error) {
    editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
  } finally {
    editor.submitting = false;
  }
}

function requestDelete(record: SkillMasterRecord): void {
  Object.assign(deleteDialog, {
    open: true,
    ids: [record.id],
    title: `删除“${record.name}”？`,
    message: '删除后将不能用于新规划，已有规划仍保留历史快照。',
  });
}

function requestBatchDelete(): void {
  if (!selectedIds.value.length) {
    showToast('请先勾选需要批量删除的数据');
    return;
  }
  Object.assign(deleteDialog, {
    open: true,
    ids: [...selectedIds.value],
    title: `批量删除 ${capabilityLabel.value}？`,
    message: `确认删除已勾选的 ${selectedIds.value.length} 条数据吗？删除后将不能用于新规划。`,
  });
}

async function confirmDelete(): Promise<void> {
  try {
    deleteDialog.submitting = true;
    if (deleteDialog.ids.length === 1) {
      await api.value.deleteCatalog(deleteDialog.ids[0]!, props.userId.trim());
      showToast('已删除');
    } else {
      const count = await api.value.batchDeleteCatalog(deleteDialog.ids, props.userId.trim());
      showToast(`已删除 ${count} 条数据`);
    }
    selectedIds.value = selectedIds.value.filter((id) => !deleteDialog.ids.includes(id));
    deleteDialog.open = false;
    await reload();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败');
  } finally {
    deleteDialog.submitting = false;
  }
}

function triggerImport(): void {
  importInputRef.value?.click();
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    importing.value = true;
    const scope = requireCatalogScope();
    const result = await api.value.importCatalog(file, scope);
    const suffix = result.failCount ? `，失败 ${result.failCount} 条` : '';
    showToast(`成功导入 ${result.successCount} 条${suffix}`);
    await reload();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导入失败');
  } finally {
    importing.value = false;
  }
}

async function exportCurrent(): Promise<void> {
  try {
    exporting.value = true;
    const scope = requireCatalogScope();
    await api.value.exportCatalog(records.value, scope);
    showToast(`已开始导出 ${capabilityLabel.value} 清单`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

function goPage(next: number): void {
  pageNum.value = Math.max(1, Math.min(totalPages.value, next));
}

watch(
  () => props.capabilityType,
  async () => {
    selectedIds.value = [];
    pageNum.value = 1;
    await loadProductOptions();
    await reload();
  },
);

watch(
  () => props.userId,
  async () => {
    await reload();
  },
);

watch(
  [
    () => props.departmentTree,
    () => props.currentUserDepartmentPath,
    () => props.defaultDepartmentPath,
  ],
  async () => {
    const defaultPath = normalizePath(props.defaultDepartmentPath);
    const shouldApplyPermissionDefault =
      defaultPath.length > 0 &&
      normalizePath(departmentSegments.value).join('\u0001') !== defaultPath.join('\u0001');
    if (
      shouldApplyPermissionDefault ||
      !pathExists(props.departmentTree, departmentSegments.value)
    ) {
      applyDefaultDepartment();
    }
    await loadProductOptions();
    await reload();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  clearOwnerSearchTimer();
  clearDevelopOwnerSearchTimer();
  ownerSearchSequence += 1;
  developOwnerSearchSequence += 1;
});

onMounted(async () => {
  applyDefaultDepartment();
  await loadProductOptions();
  await reload();
});
</script>

<template>
  <section class="capability-master-panel" :aria-label="`${capabilityLabel} 清单管理`">
    <section
      class="capability-master-filter"
      :class="{ 'is-product-level': filterForm.level === '产品级' }"
      :aria-label="`${capabilityLabel} 清单查询`"
    >
      <label class="capability-master-field capability-master-field--level">
        <span>层级 <em>*</em></span>
        <select v-model="filterForm.level" @change="onLevelChange">
          <option value="部门级">部门级</option>
          <option value="产品级">产品级</option>
        </select>
      </label>
      <div class="capability-master-field capability-master-field--dept">
        <span>{{ filterForm.level === '产品级' ? '产品所属部门' : '归属部门' }} <em>*</em></span>
        <MarketDeptCascader
          v-model="departmentSegments"
          class="capability-master-dept-cascader"
          :tree="props.departmentTree"
          :max-level="6"
          all-label="请选择部门"
          selection-mode="confirm"
          searchable
          @clear="onDepartmentDone"
          @done="onDepartmentDone"
        />
      </div>
      <label
        v-if="filterForm.level === '产品级'"
        class="capability-master-field capability-master-field--product"
      >
        <span>产品 <em>*</em></span>
        <select
          v-model="filterForm.product"
          :disabled="!filterForm.departmentName || productsLoading"
          @change="onProductChange"
        >
          <option value="">
            {{
              productsLoading
                ? '产品加载中...'
                : filterForm.departmentName
                  ? '请选择产品'
                  : '请先选择部门'
            }}
          </option>
          <option
            v-for="product in productOptions"
            :key="product.offeringId"
            :value="product.offeringName"
          >
            {{ product.offeringName }}
          </option>
        </select>
      </label>
      <label class="capability-master-field capability-master-field--keyword">
        <span>关键词</span>
        <input
          v-model.trim="filterForm.keyword"
          type="search"
          :placeholder="`搜索 ${capabilityLabel} 或 Owner`"
          @keydown.enter.prevent="applyQuery"
        />
      </label>
      <div class="capability-master-filter__actions">
        <button
          type="button"
          class="capability-master-btn is-primary"
          :disabled="!currentCatalogScope"
          :title="catalogScopeErrorMessage"
          @click="applyQuery"
        >
          查询
        </button>
        <button type="button" class="capability-master-btn" @click="resetQuery">重置</button>
      </div>
    </section>

    <section class="capability-master-board">
      <header class="capability-master-toolbar">
        <div class="capability-master-toolbar__summary">
          <strong>{{ capabilityLabel }} 原子清单</strong>
          <small
            >已选 {{ selectedIds.length }} 条 / 共 {{ total }} 条 · 可被不同部门的规划复用</small
          >
        </div>
        <div class="capability-master-toolbar__actions">
          <input
            ref="importInputRef"
            hidden
            type="file"
            accept=".xlsx,.xls"
            @change="handleImport"
          />
          <button
            type="button"
            class="capability-master-btn is-primary"
            :disabled="!currentCatalogScope"
            :title="catalogScopeErrorMessage"
            @click="openCreate"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增
          </button>
          <button
            type="button"
            class="capability-master-btn"
            :disabled="importing || !currentCatalogScope"
            :title="catalogScopeErrorMessage"
            @click="triggerImport"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10m0-10 4 4m-4-4-4 4M5 17v2h14v-2" />
            </svg>
            {{ importing ? '导入中...' : '导入' }}
          </button>
          <button
            type="button"
            class="capability-master-btn"
            :disabled="exporting || !currentCatalogScope"
            :title="catalogScopeErrorMessage"
            @click="exportCurrent"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20V10m0 10 4-4m-4 4-4-4M5 7V5h14v2" />
            </svg>
            {{ exporting ? '导出中...' : '导出' }}
          </button>
          <button type="button" class="capability-master-btn is-danger" @click="requestBatchDelete">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
            </svg>
            批量删除
          </button>
        </div>
      </header>

      <div class="capability-master-table-wrap">
        <table class="capability-master-table">
          <thead>
            <tr>
              <th class="is-check">
                <input
                  type="checkbox"
                  :checked="allPageSelected"
                  :disabled="!pageRecords.length"
                  @change="togglePageSelection"
                />
              </th>
              <th>{{ capabilityLabel }}</th>
              <th>描述</th>
              <th>责任 Owner</th>
              <th>开发责任人</th>
              <th>计划完成</th>
              <th>当前进展</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="is-empty">正在加载 {{ capabilityLabel }} 清单...</td>
            </tr>
            <tr v-for="record in loading ? [] : pageRecords" :key="record.id">
              <td class="is-check">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(record.id)"
                  @change="toggleSelection(record.id)"
                />
              </td>
              <td>
                <div class="capability-name-cell">
                  <strong class="capability-name">{{ record.name }}</strong>
                </div>
              </td>
              <td class="is-description">{{ record.description }}</td>
              <td>{{ record.owner }}</td>
              <td>{{ record.developOwner }}</td>
              <td>{{ record.plannedCompleteDate || '—' }}</td>
              <td>
                <span class="capability-status" :class="`is-${record.status}`">{{
                  record.status
                }}</span>
              </td>
              <td class="is-action">
                <div class="capability-row-actions">
                  <button type="button" title="编辑" aria-label="编辑" @click="openEdit(record)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                      <path d="m13 7 4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="is-danger"
                    title="删除"
                    aria-label="删除"
                    @click="requestDelete(record)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !pageRecords.length">
              <td colspan="8" class="is-empty">暂无符合条件的 {{ capabilityLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="capability-master-pagination">
        <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ total }} 条</span>
        <div class="capability-master-pagination__controls">
          <select v-model.number="pageSize" @change="pageNum = 1">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} 条/页
            </option>
          </select>
          <button type="button" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">
            上一页
          </button>
          <span>{{ pageNum }} / {{ totalPages }}</span>
          <button type="button" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">
            下一页
          </button>
        </div>
      </footer>
    </section>

    <Teleport to="body">
      <div v-if="editor.open" class="capability-master-overlay" @click.self="closeEditor">
        <form class="capability-master-dialog" @submit.prevent="submitEditor">
          <header>
            <div>
              <small>{{ capabilityLabel.toUpperCase() }} MASTER</small>
              <strong>{{
                editor.mode === 'create' ? `添加 ${capabilityLabel}` : `编辑 ${capabilityLabel}`
              }}</strong>
              <p>这里只维护可复用的原子能力；场景、活动、层级和部门/产品请在规划页配置。</p>
            </div>
            <button type="button" @click="closeEditor">×</button>
          </header>
          <div class="capability-master-note">
            <b>部门语义</b>
            <span>Owner 所在部门是人员属性，不作为 {{ capabilityLabel }} 的规划归属。</span>
          </div>
          <div class="capability-master-form">
            <label class="is-wide">
              <span>{{ capabilityLabel }} 名称 *</span>
              <input
                v-model.trim="editor.name"
                maxlength="80"
                :placeholder="`请输入 ${capabilityLabel} 名称`"
              />
            </label>
            <label class="is-wide">
              <span>{{ capabilityLabel }} 说明 *</span>
              <textarea v-model.trim="editor.description" rows="4" maxlength="300" />
            </label>
            <label class="person-search" @keydown.esc="closeOwnerPersonSearch">
              <span>责任 Owner *</span>
              <div class="person-search__control">
                <input
                  :value="ownerPicker.keyword"
                  type="text"
                  autocomplete="off"
                  :readonly="Boolean(editor.owner.trim())"
                  placeholder="输入姓名或工号后选择"
                  @focus="onOwnerPickerFocus"
                  @input="onOwnerPickerInput"
                />
                <button
                  v-if="editor.owner.trim()"
                  type="button"
                  class="person-search__clear"
                  title="清除责任 Owner"
                  aria-label="清除责任 Owner"
                  @mousedown.prevent
                  @click.stop="clearOwnerSelection"
                >
                  ×
                </button>
              </div>
              <div v-if="ownerPicker.open" class="person-search__panel" @mousedown.stop>
                <span v-if="ownerPicker.loading" class="person-search__empty">查询中...</span>
                <template v-else>
                  <button
                    v-for="option in ownerPicker.options"
                    :key="option.id || option.label"
                    type="button"
                    @click="selectOwner(option)"
                  >
                    <span>
                      <strong>{{ option.chName || option.label }}</strong>
                      <small>{{ option.id }}</small>
                    </span>
                    <em>{{ option.deptName || '部门信息待补充' }}</em>
                  </button>
                  <span v-if="ownerPicker.message" class="person-search__empty">
                    {{ ownerPicker.message }}
                  </span>
                </template>
              </div>
            </label>
            <label class="person-search" @keydown.esc="closeDevelopOwnerPersonSearch">
              <span>开发责任人 *</span>
              <div class="person-search__control">
                <input
                  :value="developOwnerPicker.keyword"
                  type="text"
                  autocomplete="off"
                  :readonly="Boolean(editor.developOwner.trim())"
                  placeholder="输入姓名或工号后选择"
                  @focus="onDevelopOwnerPickerFocus"
                  @input="onDevelopOwnerPickerInput"
                />
                <button
                  v-if="editor.developOwner.trim()"
                  type="button"
                  class="person-search__clear"
                  title="清除开发责任人"
                  aria-label="清除开发责任人"
                  @mousedown.prevent
                  @click.stop="clearDevelopOwnerSelection"
                >
                  ×
                </button>
              </div>
              <div v-if="developOwnerPicker.open" class="person-search__panel" @mousedown.stop>
                <span v-if="developOwnerPicker.loading" class="person-search__empty">
                  查询中...
                </span>
                <template v-else>
                  <button
                    v-for="option in developOwnerPicker.options"
                    :key="option.id || option.label"
                    type="button"
                    @click="selectDevelopOwner(option)"
                  >
                    <span>
                      <strong>{{ option.chName || option.label }}</strong>
                      <small>{{ option.id }}</small>
                    </span>
                    <em>{{ option.deptName || '部门信息待补充' }}</em>
                  </button>
                  <span v-if="developOwnerPicker.message" class="person-search__empty">
                    {{ developOwnerPicker.message }}
                  </span>
                </template>
              </div>
            </label>
            <label>
              <span>计划完成时间 *</span>
              <input v-model="editor.plannedCompleteDate" type="date" />
            </label>
          </div>
          <p v-if="editor.error" class="capability-master-error">{{ editor.error }}</p>
          <footer>
            <button type="button" @click="closeEditor">取消</button>
            <button type="submit" class="is-primary" :disabled="editor.submitting">
              {{ editor.submitting ? '保存中...' : '保存' }}
            </button>
          </footer>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="deleteDialog.open"
        class="capability-master-overlay"
        @click.self="deleteDialog.open = false"
      >
        <div class="capability-master-dialog is-confirm">
          <i>!</i>
          <strong>{{ deleteDialog.title }}</strong>
          <p>{{ deleteDialog.message }}</p>
          <footer>
            <button type="button" @click="deleteDialog.open = false">取消</button>
            <button
              type="button"
              class="is-danger"
              :disabled="deleteDialog.submitting"
              @click="confirmDelete"
            >
              确认删除
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="toast" class="capability-master-toast" data-app-toast role="status">
        {{ toast }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.capability-master-panel {
  display: grid;
  gap: 16px;
  color: #17233d;
  font-size: 13px;
}
.capability-master-filter {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(360px, 1.75fr) minmax(320px, 2fr) auto;
  gap: 14px;
  align-items: end;
  padding: 18px;
  border: 1px solid #dbe5f3;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 34px rgba(45, 58, 92, 0.06);
}
.capability-master-filter.is-product-level {
  grid-template-columns:
    minmax(110px, 0.55fr) minmax(280px, 1.4fr) minmax(180px, 0.9fr) minmax(260px, 1.5fr)
    auto;
}
.capability-master-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.capability-master-field > span {
  color: #52637d;
  font-size: 12px;
  font-weight: 800;
}
.capability-master-field em {
  color: #ef4444;
  font-style: normal;
}
.capability-master-field input,
.capability-master-field select {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 0 11px;
  border: 1px solid #cfdaea;
  border-radius: 6px;
  outline: none;
  background: #fff;
  color: #233552;
  font: inherit;
  font-size: 13px;
}
.capability-master-dept-cascader :deep(.market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  padding: 0 30px 0 11px;
  border-color: #cfdaea;
  border-radius: 6px;
  background: #fff;
  color: #233552;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}
.capability-master-field input:focus,
.capability-master-field select:focus {
  border-color: #6285f5;
  box-shadow: 0 0 0 3px rgba(75, 103, 241, 0.11);
}
.capability-master-filter__actions {
  display: flex;
  gap: 10px;
}
.capability-master-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #d4dfef;
  border-radius: 6px;
  background: #fff;
  color: #263957;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}
.capability-master-btn svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.capability-master-btn:not(.is-primary):hover:not(:disabled) {
  border-color: #91a9ea;
  background: #f7f9ff;
  transform: translateY(-1px);
}
.capability-master-btn.is-primary {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(47, 125, 246, 0.18);
}
.capability-master-btn.is-primary:hover:not(:disabled) {
  border-color: #245fe1;
  background: linear-gradient(135deg, #256fe9, #5f42df);
  color: #ffffff;
}
.capability-master-btn.is-danger {
  border-color: #ffd7d7;
  background: #fff7f7;
  color: #dc2626;
}
.capability-master-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.capability-master-board {
  height: clamp(520px, calc(100vh - 395px), 880px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.06);
}
.capability-master-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #edf2f7;
}
.capability-master-toolbar__summary {
  display: grid;
  gap: 4px;
}
.capability-master-toolbar__summary strong {
  color: #101828;
  font-size: 17px;
  font-weight: 900;
}
.capability-master-toolbar__summary small {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.capability-master-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.capability-master-table-wrap {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: auto;
}
.capability-master-table {
  width: 100%;
  min-width: 1180px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.capability-master-table thead {
  position: relative;
  z-index: 20;
}
.capability-master-table th,
.capability-master-table td {
  padding: 13px 12px;
  border-bottom: 1px solid #edf2f7;
  color: #334155;
  font-size: 13px;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}
.capability-master-table th {
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
th:nth-child(1) {
  width: 52px;
}
th:nth-child(2) {
  width: 220px;
}
th:nth-child(3) {
  width: 300px;
}
th:nth-child(4),
th:nth-child(5) {
  width: 150px;
}
th:nth-child(6) {
  width: 118px;
}
th:nth-child(7) {
  width: 110px;
}
th:nth-child(8) {
  width: 120px;
}
.capability-master-table tbody tr:hover td {
  background: #f8fbff;
}
td.is-description {
  color: #334155;
}
.is-check {
  text-align: center;
}
.capability-name-cell {
  display: flex;
  align-items: center;
}
.capability-name {
  color: #10243e;
  font-weight: 900;
}
.capability-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
}
.capability-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.capability-row-actions button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #2563eb;
  cursor: pointer;
}
.capability-row-actions button:hover:not(:disabled) {
  border-color: #b9ccff;
  background: #eff6ff;
}
.capability-row-actions button.is-danger {
  color: #dc2626;
}
.capability-row-actions button.is-danger:hover:not(:disabled) {
  border-color: #fecaca;
  background: #fff1f2;
}
.capability-row-actions svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.is-empty {
  height: 108px;
  color: #64748b;
  text-align: center;
}
.capability-master-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  color: #64748b;
  font-size: 13px;
}
.capability-master-pagination__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.capability-master-pagination select,
.capability-master-pagination button {
  height: 32px;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 13px;
}
.capability-master-pagination select {
  padding: 0 8px;
}
.capability-master-pagination button {
  padding: 0 10px;
  cursor: pointer;
}
.capability-master-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.capability-master-overlay {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}
.capability-master-dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}
.capability-master-dialog > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.capability-master-dialog > header div {
  display: grid;
  gap: 5px;
}
.capability-master-dialog > header small {
  color: #4f67e8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}
.capability-master-dialog > header strong {
  font-size: 20px;
}
.capability-master-dialog > header p {
  margin: 0;
  color: #718096;
  font-size: 11px;
}
.capability-master-dialog > header button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f2f4f8;
  color: #7a879b;
  font-size: 20px;
  cursor: pointer;
}
.capability-master-note {
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
.capability-master-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}
.capability-master-form label {
  display: grid;
  gap: 7px;
  color: #40516b;
  font-size: 11px;
  font-weight: 800;
}
.capability-master-form label.is-wide {
  grid-column: 1 / -1;
}
.capability-master-form input,
.capability-master-form textarea,
.capability-master-form select {
  box-sizing: border-box;
  width: 100%;
  padding: 11px 13px;
  border: 1px solid #d1dbea;
  border-radius: 8px;
  outline: none;
  color: #263753;
  font: inherit;
  font-size: 13px;
  resize: vertical;
}
.capability-master-dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 28px 22px;
}
.capability-master-dialog > footer button {
  height: 42px;
  padding: 0 20px;
  border: 1px solid #d5dfed;
  border-radius: 8px;
  background: #fff;
  color: #334763;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.capability-master-dialog > footer button.is-primary {
  border-color: #4c65ea;
  background: linear-gradient(135deg, #2f7df4, #6548ef);
  color: #fff;
}
.capability-master-dialog > footer button.is-danger {
  border-color: #ef4444;
  background: #ef4444;
  color: #fff;
}
.capability-master-error {
  margin: 0 28px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff1f2;
  color: #d92d3e;
  font-size: 13px;
}
.capability-master-form input,
.capability-master-form textarea,
.capability-master-form select {
  padding: 0 11px;
  border-color: #d7dfeb;
  font-size: 11px;
}
.capability-master-form input,
.capability-master-form select {
  height: 40px;
}
.capability-master-form textarea {
  padding-top: 10px;
}
.person-search {
  position: relative;
  width: 100%;
}
.person-search__control {
  position: relative;
}
.person-search__control > input[readonly] {
  padding-right: 38px;
  background: #f8fbff;
  cursor: default;
}
.person-search__control > input:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}
.person-search__clear {
  position: absolute;
  top: 50%;
  right: 9px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  transform: translateY(-50%);
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #eef2f7;
  color: #64748b;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
.person-search__clear:hover {
  background: #e2e8f0;
  color: #334155;
}
.person-search__panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
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
.person-search__panel small,
.person-search__panel em {
  color: #78869a;
  font-size: 9px;
}
.person-search__panel em {
  font-style: normal;
}
.person-search__empty {
  display: block;
  padding: 16px 10px;
  color: #98a2b1;
  font-size: 10px;
  text-align: center;
}
.capability-master-dialog > footer {
  gap: 9px;
  margin-top: 20px;
  padding: 0;
}
.capability-master-dialog > footer button {
  height: 36px;
  padding: 0 16px;
}
.capability-master-dialog > footer button.is-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #256fe9, #5f42df);
  color: #fff;
}
.capability-master-error {
  margin: 14px 0 0;
}
.capability-master-dialog.is-confirm {
  width: min(440px, calc(100vw - 40px));
  padding: 28px;
  text-align: center;
}
.capability-master-dialog.is-confirm > i {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  place-items: center;
  border-radius: 50%;
  background: #fff0f1;
  color: #e13847;
  font-style: normal;
  font-weight: 900;
}
.capability-master-dialog.is-confirm > strong {
  font-size: 19px;
}
.capability-master-dialog.is-confirm > p {
  color: #718096;
}
.capability-master-dialog.is-confirm > footer {
  justify-content: center;
  padding-bottom: 0;
}
.capability-master-toast {
  position: fixed;
  z-index: 1500;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 18px;
  border-radius: 9px;
  background: #17233d;
  color: #fff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.25);
  font-size: 13px;
  font-weight: 700;
}
@media (max-width: 1100px) {
  .capability-master-filter {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .capability-master-filter__actions {
    justify-content: flex-end;
  }
  .capability-master-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

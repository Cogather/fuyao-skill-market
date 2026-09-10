<script setup lang="ts">
import HarnessSelect from '../../components/skill/HarnessSelect.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import HarnessCatalogDetailDialog from '../../components/skill/HarnessCatalogDetailDialog.vue';
import HarnessExtensionDetailContent from '../../components/skill/HarnessExtensionDetailContent.vue';
import HarnessAssetPersonEditDialog from '../../components/skill/HarnessAssetPersonEditDialog.vue';
import HarnessAssetDeleteDialog from '../../components/skill/HarnessAssetDeleteDialog.vue';
import HarnessCatalogImportDialog from '../../components/skill/HarnessCatalogImportDialog.vue';
import HarnessDepartmentPicker from '../../components/skill/HarnessDepartmentPicker.vue';
import HarnessVersionPicker from '../../components/skill/HarnessVersionPicker.vue';
import HarnessCapabilityCatalogPanel from '../../components/skill/HarnessCapabilityCatalogPanel.vue';
import SkillMasterManagementPanel from '../../components/skill/SkillMasterManagementPanelV2.vue';
import ExtensionPublishPage from './ExtensionPublishPage.vue';
import type { ExtensionReleaseContext } from '../../services/skillMarket/extensionPublishHttp';
import {
  getHarnessAssetApi,
  usesHttpHarnessAssetApi,
} from '../../services/skillMarket/assetManagementService';
import {
  harnessAssetStatus,
  hasInProgressCurrentRelease,
  type HarnessAsset,
  type HarnessAssetDetail,
  type HarnessAssetFilter,
  type HarnessAssetPersonField,
  type HarnessAssetProduct,
  type HarnessAssetScope,
  type HarnessAssetType,
  type DeleteHarnessAssetInput,
} from '../../services/skillMarket/assetManagementTypes';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';
import type { SkillPlanningUserOption } from '../../services/skillMarket/skillPlanningShared';
import { mergeUniquePage, shouldLoadNextPage } from '../../utils/infiniteScroll';

type PageView = 'list' | 'detail' | 'publish';
type CatalogAction = 'create' | 'import';
type DepartmentTreeNode = {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentTreeNode[];
};
type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  path: string[];
  hasChildren: boolean;
};

const props = withDefaults(
  defineProps<{
    userId?: string;
    userName?: string;
    departmentTree?: DepartmentTreeNode[];
    currentUserDepartmentPath?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    userId: '',
    userName: '',
    departmentTree: () => [],
    currentUserDepartmentPath: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
  },
);

const TYPE_FILTERS: Array<{ key: HarnessAssetFilter; label: string }> = [
  { key: 'Agent', label: 'Agent' },
  { key: 'Skill', label: 'Skill' },
  { key: 'Command', label: 'Command' },
  { key: 'Extension', label: 'Extension' },
];
const CATALOG_TYPES = ['Agent', 'Skill', 'Command'] as const;
const PERSON_FIELDS = [
  { field: 'owner', label: '责任人' },
  { field: 'developer', label: '开发责任人' },
] as const;
const transportIsHttp = usesHttpHarnessAssetApi();
const ASSET_PAGE_SIZE = transportIsHttp ? 30 : 24;
const ASSET_SCROLL_THRESHOLD = 120;
const MAX_EMPTY_PAGE_PROBES = 10;
const api = getHarnessAssetApi();

const view = ref<PageView>('list');
const filter = ref<HarnessAssetFilter>('Agent');
const selectedDepartmentId = ref('');
const selectedProductId = ref('');
const assets = ref<HarnessAsset[]>([]);
const products = ref<HarnessAssetProduct[]>([]);
const selectedAssetKey = ref('');
const detail = ref<HarnessAssetDetail | null>(null);
const selectedVersion = ref('');
const detailTab = ref<'content' | 'report'>('content');
const deleteTarget = ref<DeleteHarnessAssetInput | null>(null);
const assetListHeading = ref<HTMLElement | null>(null);
const personEditor = ref<{
  asset: HarnessAsset;
  field: HarnessAssetPersonField;
  label: string;
  userId: string;
} | null>(null);
const extensionRelease = ref<{
  context: ExtensionReleaseContext;
  mode: 'publish' | 'history';
} | null>(null);
const extensionReleaseLoading = ref(false);
const extensionReleaseLoadingMode = ref<'publish' | 'history'>('publish');
const extensionReleaseError = ref('');
const extensionReleaseAttempt = ref<{
  asset: HarnessAsset;
  mode: 'publish' | 'history';
} | null>(null);
const extensionReturnView = ref<'list' | 'detail'>('list');
let extensionReturnNeedsDetail = false;
const actionMenu = ref<CatalogAction | null>(null);
const createAssetType = ref<(typeof CATALOG_TYPES)[number] | null>(null);
const importAssetType = ref<(typeof CATALOG_TYPES)[number] | null>(null);
const importScope = ref<HarnessScopeSnapshot>({
  level: '产品级',
  departmentPath: [],
  offeringId: '',
  offeringName: '',
});
const listLoading = ref(false);
const listLoadingMore = ref(false);
const listError = ref('');
const listAppendError = ref('');
const assetPageNum = ref(0);
const hasMoreAssets = ref(false);
const assetBoardElement = ref<HTMLElement | null>(null);
const productError = ref('');
const detailLoading = ref(false);
const detailError = ref('');
const toastMessage = ref('');
let listSequence = 0;
let lastObservedAssetScrollTop = 0;
let pendingAssetScrollPreviousTop = 0;
let pendingAssetScrollTop = 0;
let assetScrollFrame: number | undefined;
let productSequence = 0;
let detailSequence = 0;
let extensionReleaseSequence = 0;
let toastTimer: number | undefined;

function openPersonEditor(field: HarnessAssetPersonField, label: string): void {
  if (!selectedAsset.value || selectedAsset.value.assetType === 'Extension') return;
  personEditor.value = { asset: selectedAsset.value, field, label, userId: props.userId };
}

async function savePerson(person: SkillPlanningUserOption): Promise<string> {
  const editor = personEditor.value;
  if (!editor) throw new Error('请重新打开人员编辑窗口');
  const label = await api.updatePerson({ ...editor, person });
  editor.asset[editor.field] = label;
  if (detail.value?.component && selectedAsset.value === editor.asset) {
    const component = detail.value.component;
    if (editor.field === 'owner') {
      component.ownerName = person.chName.trim();
      component.ownerId = person.id.trim() || person.sAMAccountName.trim();
    } else {
      component.developerName = person.chName.trim();
      component.developerId = person.id.trim() || person.sAMAccountName.trim();
    }
  }
  return label;
}

function onPersonSaved(): void {
  showToast(`${personEditor.value?.label || '人员'}已更新`);
  personEditor.value = null;
}

function requestAssetDelete(): void {
  const asset = selectedAsset.value;
  if (!asset || asset.assetType === 'Extension') return;
  deleteTarget.value = {
    asset: { ...asset },
    userId: props.userId,
  };
}

async function deleteCurrentAsset(): Promise<void> {
  if (!deleteTarget.value) throw new Error('请重新打开删除确认窗口');
  const detailCategory = detailComponent.value?.category?.trim();
  if (detailCategory && detailCategory !== deleteTarget.value.asset.category?.trim()) {
    throw new Error('资产详情与列表归属不一致，请返回列表刷新后重试');
  }
  await api.deleteAsset(deleteTarget.value);
}

async function onAssetDeleted(): Promise<void> {
  deleteTarget.value = null;
  detailSequence += 1;
  detail.value = null;
  selectedAssetKey.value = '';
  view.value = 'list';
  showToast('资产已删除');
  await reloadAssets();
  await nextTick();
  assetListHeading.value?.focus();
}

function normalizePath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

const normalizedAllowedPaths = computed(() =>
  props.allowedDepartmentPaths.map(normalizePath).filter((path) => path.length > 0),
);
const defaultCatalogDepartmentPath = computed(
  () => normalizedAllowedPaths.value[0] ?? normalizePath(props.currentUserDepartmentPath),
);

function filterDepartmentTree(
  nodes: DepartmentTreeNode[],
  parentPath: string[] = [],
): DepartmentTreeNode[] {
  if (!props.restrictToAllowedDepartments) return nodes;
  if (normalizedAllowedPaths.value.length === 0) return [];
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    const visible = normalizedAllowedPaths.value.some(
      (allowed) => pathStartsWith(path, allowed) || pathStartsWith(allowed, path),
    );
    if (!visible) return [];
    return [{ ...node, children: filterDepartmentTree(node.children ?? [], path) }];
  });
}

const manageableDepartmentTree = computed(() => filterDepartmentTree(props.departmentTree));
const allDepartmentRows = computed<DepartmentRow[]>(() => {
  const rows: DepartmentRow[] = [];
  const append = (nodes: DepartmentTreeNode[], parentPath: string[]): void => {
    nodes.forEach((node, index) => {
      const path = [...parentPath, node.name];
      rows.push({
        id: String(node.id || node.deptCode || `${path.join('/')}-${index}`),
        code: String(node.deptCode || node.id || ''),
        name: node.name,
        path,
        hasChildren: Boolean(node.children?.length),
      });
      append(node.children ?? [], path);
    });
  };
  // 列表筛选使用完整部门树；新增与导入使用 manageableDepartmentTree。
  append(props.departmentTree, []);
  return rows;
});

const pickerDepartments = computed(() =>
  allDepartmentRows.value.map((row) => ({
    _id: row.id,
    name: row.name,
    deptCode: row.code,
    parentId: null,
    path: row.path,
  })),
);

const selectedDepartment = computed(
  () => allDepartmentRows.value.find((row) => row.id === selectedDepartmentId.value) ?? null,
);
const selectedProduct = computed(
  () => products.value.find((product) => product.id === selectedProductId.value) ?? undefined,
);
const currentScope = computed<HarnessAssetScope | null>(() => {
  const department = selectedDepartment.value;
  if (!department && !transportIsHttp) return null;
  return {
    userId: props.userId.trim(),
    userName: props.userName.trim(),
    department: {
      id: department?.id ?? '',
      code: department?.code ?? '',
      name: department?.name ?? '',
      path: [...(department?.path ?? [])],
    },
    product: selectedProduct.value
      ? { ...selectedProduct.value, departmentPath: [...selectedProduct.value.departmentPath] }
      : undefined,
    assetType: filter.value,
  };
});
const selectedAsset = computed(
  () =>
    assets.value.find((asset) => `${asset.assetType}:${asset.id}` === selectedAssetKey.value) ??
    null,
);
const filteredAssets = computed(() =>
  transportIsHttp
    ? assets.value
    : assets.value.filter(
        (asset) =>
          (filter.value === 'all' || asset.assetType === filter.value) &&
          (!selectedProductId.value || asset.productId === selectedProductId.value),
      ),
);
const detailVersions = computed(
  () => detail.value?.versions ?? selectedAsset.value?.versions ?? [],
);
const extensionHasNoVersion = computed(
  () => selectedAsset.value?.assetType === 'Extension' && !selectedAsset.value.currentVersion,
);
const detailComponent = computed(() => detail.value?.component);
const detailCategory = computed(
  () => (detailComponent.value?.category ?? selectedAsset.value?.category) || '—',
);
const detailDescription = computed(
  () => (detailComponent.value?.description ?? selectedAsset.value?.description) || '暂无描述',
);
const catalogDetailRecord = computed(() => {
  const asset = selectedAsset.value;
  if (!asset || asset.assetType === 'Extension') return null;
  return {
    name: asset.name,
    versions: detailVersions.value.map((version) => ({ version, uploadedAt: '' })),
  };
});
const catalogCapabilityType = computed(() => {
  if (selectedAsset.value?.assetType === 'Agent') return 'agent';
  if (selectedAsset.value?.assetType === 'Command') return 'command';
  return 'skill';
});

function canPublishAsset(asset: HarnessAsset): boolean {
  if (transportIsHttp) return asset.publishable;
  return Boolean(
    asset.currentVersion &&
    asset.publishable &&
    !hasInProgressCurrentRelease(asset) &&
    statusLabel(asset) !== '已发布',
  );
}

function canViewAssetHistory(asset: HarnessAsset): boolean {
  return ['待发布', '可发布', '已发布', '发布中'].includes(statusLabel(asset));
}

function detailPersonLabel(field: HarnessAssetPersonField): string {
  const component = detailComponent.value;
  if (!component) return selectedAsset.value?.[field] || '—';
  const name = field === 'owner' ? component.ownerName : component.developerName;
  const id = field === 'owner' ? component.ownerId : component.developerId;
  return name && id ? `${name}（${id}）` : name || id || '—';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function showToast(message: string): void {
  toastMessage.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2600);
}

function defaultDepartmentRow(): DepartmentRow | null {
  const preferredPaths = [
    ...normalizedAllowedPaths.value,
    normalizePath(props.currentUserDepartmentPath),
  ].filter((path) => path.length > 0);
  for (const path of preferredPaths) {
    const match = allDepartmentRows.value.find(
      (row) => row.path.join('\u0001') === path.join('\u0001'),
    );
    if (match) return match;
  }
  return (
    [...allDepartmentRows.value].reverse().find((row) => !row.hasChildren) ??
    allDepartmentRows.value[0] ??
    null
  );
}

function resetAssetScrollPosition(): void {
  if (assetScrollFrame !== undefined) window.cancelAnimationFrame(assetScrollFrame);
  assetScrollFrame = undefined;
  lastObservedAssetScrollTop = 0;
  pendingAssetScrollPreviousTop = 0;
  pendingAssetScrollTop = 0;
  if (assetBoardElement.value) assetBoardElement.value.scrollTop = 0;
}

function resetAssetListState(): number {
  const sequence = ++listSequence;
  assets.value = [];
  assetPageNum.value = 0;
  hasMoreAssets.value = false;
  listError.value = '';
  listAppendError.value = '';
  listLoadingMore.value = false;
  resetAssetScrollPosition();
  return sequence;
}

async function reloadAssets(): Promise<void> {
  const scope = currentScope.value;
  const sequence = resetAssetListState();
  if (!scope) {
    listError.value = '暂无可用部门范围';
    listLoading.value = false;
    return;
  }
  listLoading.value = true;
  try {
    const result = await api.queryAssets(scope, { pageNum: 1, pageSize: ASSET_PAGE_SIZE });
    if (sequence !== listSequence) return;
    assets.value = mergeUniquePage([], result.list, assetKey);
    assetPageNum.value = 1;
    hasMoreAssets.value = result.hasMore;
  } catch (error) {
    if (sequence !== listSequence) return;
    listError.value = errorMessage(error, '资产清单加载失败');
  } finally {
    if (sequence === listSequence) {
      listLoading.value = false;
    }
  }
}

function assetKey(asset: HarnessAsset): string {
  return `${asset.assetType}:${asset.id}`;
}

async function loadNextAssetPage(): Promise<void> {
  const scope = currentScope.value;
  if (!scope || listLoading.value || listLoadingMore.value || !hasMoreAssets.value) {
    return;
  }
  const sequence = listSequence;
  listLoadingMore.value = true;
  listAppendError.value = '';
  try {
    let nextPage = assetPageNum.value + 1;
    for (let probe = 0; probe < MAX_EMPTY_PAGE_PROBES; probe += 1) {
      const result = await api.queryAssets(scope, {
        pageNum: nextPage,
        pageSize: ASSET_PAGE_SIZE,
      });
      if (sequence !== listSequence) return;
      const beforeLength = assets.value.length;
      assets.value = mergeUniquePage(assets.value, result.list, assetKey);
      assetPageNum.value = nextPage;
      hasMoreAssets.value = result.hasMore;
      if (assets.value.length > beforeLength || !result.hasMore) break;
      nextPage += 1;
      if (probe === MAX_EMPTY_PAGE_PROBES - 1) {
        listAppendError.value = '连续分页未返回新资产，请重试';
      }
    }
  } catch (error) {
    if (sequence !== listSequence) return;
    listAppendError.value = errorMessage(error, '下一页资产加载失败');
  } finally {
    if (sequence === listSequence) {
      listLoadingMore.value = false;
    }
  }
}

function handleAssetScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement;
  const observedScrollTop = Math.max(0, element.scrollTop);
  if (observedScrollTop === lastObservedAssetScrollTop) return;
  pendingAssetScrollPreviousTop = lastObservedAssetScrollTop;
  pendingAssetScrollTop = observedScrollTop;
  lastObservedAssetScrollTop = observedScrollTop;
  if (assetScrollFrame !== undefined) return;
  assetScrollFrame = window.requestAnimationFrame(() => {
    assetScrollFrame = undefined;
    const shouldLoad = shouldLoadNextPage({
      previousScrollTop: pendingAssetScrollPreviousTop,
      scrollTop: pendingAssetScrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      threshold: ASSET_SCROLL_THRESHOLD,
      loading: listLoading.value || listLoadingMore.value,
      hasMore: hasMoreAssets.value,
    });
    if (shouldLoad) void loadNextAssetPage();
  });
}

function handleAssetWheel(event: WheelEvent): void {
  if (event.deltaY <= 0) return;
  const element = event.currentTarget as HTMLElement;
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  if (remaining > ASSET_SCROLL_THRESHOLD) return;
  void loadNextAssetPage();
}

async function reloadProductsAndAssets(): Promise<void> {
  const sequence = ++productSequence;
  const scope = currentScope.value;
  resetAssetListState();
  products.value = [];
  selectedProductId.value = '';
  productError.value = '';
  if (!scope) {
    await reloadAssets();
    return;
  }
  listLoading.value = true;
  try {
    const nextProducts = await api.queryProducts(scope);
    if (sequence !== productSequence) return;
    products.value = nextProducts;
  } catch (error) {
    if (sequence !== productSequence) return;
    productError.value = errorMessage(error, '产品列表加载失败');
  }
  if (sequence !== productSequence) return;
  await reloadAssets();
}

async function selectDepartment(id: string): Promise<void> {
  const target = allDepartmentRows.value.find((row) => row.id === id);
  if (id && !target) return;
  if (selectedDepartmentId.value === id) return;
  selectedDepartmentId.value = id;
  await reloadProductsAndAssets();
}

async function selectFilter(nextFilter: HarnessAssetFilter): Promise<void> {
  filter.value = nextFilter;
  await reloadAssets();
}

async function loadDetail(): Promise<void> {
  const scope = currentScope.value;
  const asset = selectedAsset.value;
  if (!scope || !asset || extensionHasNoVersion.value) return;
  if (!transportIsHttp && asset.assetType !== 'Extension') return;
  const sequence = ++detailSequence;
  const requestedView = view.value;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const response = await api.queryDetail(scope, asset, selectedVersion.value, {
      includeFiles: asset.assetType === 'Extension',
    });
    if (sequence !== detailSequence || view.value !== requestedView) return;
    detail.value = response;
    if (response.component) {
      asset.owner = detailPersonLabel('owner');
      asset.developer = detailPersonLabel('developer');
    }
    if (response.version !== undefined) selectedVersion.value = response.version;
  } catch (error) {
    if (sequence !== detailSequence || view.value !== requestedView) return;
    detail.value = null;
    detailError.value = errorMessage(error, '资产内容加载失败');
  } finally {
    if (sequence === detailSequence) detailLoading.value = false;
  }
}

async function openDetail(asset: HarnessAsset): Promise<void> {
  detailSequence += 1;
  selectedAssetKey.value = `${asset.assetType}:${asset.id}`;
  selectedVersion.value = transportIsHttp ? '' : asset.currentVersion || asset.versions[0] || '';
  detailTab.value = 'content';
  detail.value = null;
  detailLoading.value = false;
  detailError.value = '';
  view.value = 'detail';
  await loadDetail();
}

async function returnToAssetList(): Promise<void> {
  detailSequence += 1;
  view.value = 'list';
  await nextTick();
  resetAssetScrollPosition();
}

async function changeDetailVersion(): Promise<void> {
  if (detail.value?.component && selectedAsset.value?.assetType !== 'Extension') return;
  await loadDetail();
}

function statusLabel(asset: HarnessAsset): string {
  return transportIsHttp ? (asset.status ?? '') : harnessAssetStatus(asset);
}

async function openExtensionRelease(
  asset: HarnessAsset,
  mode: 'publish' | 'history',
): Promise<void> {
  const scope = currentScope.value;
  if (!scope || asset.assetType !== 'Extension' || extensionReleaseLoading.value) return;
  if (mode === 'publish' && asset.canPublish === false) {
    showToast('当前用户没有发布权限');
    return;
  }
  const sequence = ++extensionReleaseSequence;
  const currentListSequence = listSequence;
  if (view.value !== 'publish') {
    extensionReturnView.value = view.value === 'detail' ? 'detail' : 'list';
    extensionReturnNeedsDetail = view.value === 'detail' && detailLoading.value;
  }
  // 保留点击记录的名称和场景字段，重试时仍查询同一个 Extension。
  const requestAsset = { ...asset };
  extensionReleaseAttempt.value = { asset: requestAsset, mode };
  extensionRelease.value = null;
  extensionReleaseError.value = '';
  extensionReleaseLoadingMode.value = mode;
  extensionReleaseLoading.value = true;
  view.value = 'publish';
  try {
    const context = await api.queryExtensionReleaseContext(scope, requestAsset, mode);
    if (
      sequence !== extensionReleaseSequence ||
      currentListSequence !== listSequence ||
      view.value !== 'publish'
    )
      return;
    extensionRelease.value = { context, mode };
  } catch (error) {
    if (sequence === extensionReleaseSequence)
      extensionReleaseError.value = errorMessage(
        error,
        mode === 'history' ? '发布历史加载失败' : 'Extension 发布信息加载失败',
      );
  } finally {
    if (sequence === extensionReleaseSequence) extensionReleaseLoading.value = false;
  }
}

async function reloadExtensionRelease(): Promise<void> {
  const attempt = extensionReleaseAttempt.value;
  if (attempt) await openExtensionRelease(attempt.asset, attempt.mode);
}

async function onExtensionReleased(): Promise<void> {
  if (transportIsHttp && extensionRelease.value?.mode === 'publish') {
    extensionReturnView.value = 'list';
  }
  await reloadAssets();
}

function returnFromExtensionRelease(): void {
  extensionReleaseSequence += 1;
  extensionReleaseLoading.value = false;
  extensionReleaseError.value = '';
  extensionReleaseAttempt.value = null;
  view.value = extensionReturnView.value === 'detail' && selectedAsset.value ? 'detail' : 'list';
  extensionRelease.value = null;
  if (view.value === 'detail' && (extensionReturnNeedsDetail || !detail.value)) void loadDetail();
  extensionReturnNeedsDetail = false;
}

function statusClass(asset: HarnessAsset): string {
  const status = statusLabel(asset);
  if (status === '已发布') return 'is-success';
  if (status === '待发布' || status === '可发布') return 'is-warning';
  return 'is-info';
}

function openActionMenu(action: CatalogAction): void {
  actionMenu.value = actionMenu.value === action ? null : action;
}

function manageCatalog(assetType: (typeof CATALOG_TYPES)[number], action: CatalogAction): void {
  actionMenu.value = null;
  if (action === 'create') {
    createAssetType.value = assetType;
    return;
  }
  const departmentPath = defaultCatalogDepartmentPath.value;
  const product =
    selectedDepartment.value?.path.join('\u0001') === departmentPath.join('\u0001')
      ? selectedProduct.value
      : null;
  importScope.value = {
    level: selectedProduct.value ? '产品级' : '部门级',
    departmentPath: [...departmentPath],
    offeringId: product?.id ?? '',
    offeringName: product?.name ?? '',
  };
  importAssetType.value = assetType;
}

async function onAssetCreated(): Promise<void> {
  createAssetType.value = null;
  showToast('资产已新增');
  await reloadAssets();
}

onMounted(async () => {
  const row = defaultDepartmentRow();
  if (!row) {
    listError.value = '暂无可用部门范围';
    return;
  }
  selectedDepartmentId.value = row.id;
  await reloadProductsAndAssets();
});

onBeforeUnmount(() => {
  listSequence += 1;
  detailSequence += 1;
  extensionReleaseSequence += 1;
  if (assetScrollFrame !== undefined) window.cancelAnimationFrame(assetScrollFrame);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="asset-page harness-viewport-page">
    <HarnessAssetDeleteDialog
      v-if="deleteTarget"
      :asset-name="deleteTarget.asset.name"
      :asset-type="deleteTarget.asset.assetType"
      :delete-asset="deleteCurrentAsset"
      @close="deleteTarget = null"
      @deleted="onAssetDeleted"
    />
    <HarnessCatalogImportDialog
      v-if="importAssetType"
      :asset-type="importAssetType"
      :user-id="props.userId"
      :department-tree="manageableDepartmentTree"
      :initial-scope="importScope"
      :allowed-department-paths="normalizedAllowedPaths"
      :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
      @close="importAssetType = null"
      @imported="reloadAssets"
    />
    <SkillMasterManagementPanel
      v-if="createAssetType === 'Skill'"
      create-only
      :user-id="props.userId"
      :department-tree="manageableDepartmentTree"
      :current-user-department-path="props.currentUserDepartmentPath"
      :allowed-department-paths="normalizedAllowedPaths"
      :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
      @close="createAssetType = null"
      @created="onAssetCreated"
    />
    <HarnessCapabilityCatalogPanel
      v-else-if="createAssetType"
      :key="createAssetType"
      create-only
      :capability-type="createAssetType === 'Agent' ? 'agent' : 'command'"
      :user-id="props.userId"
      :department-tree="manageableDepartmentTree"
      :current-user-department-path="props.currentUserDepartmentPath"
      :default-department-path="defaultCatalogDepartmentPath"
      :allowed-department-paths="normalizedAllowedPaths"
      @close="createAssetType = null"
      @created="onAssetCreated"
    />
    <template v-if="view === 'list'">
      <header class="asset-page__header harness-page-heading">
        <div>
          <h1 ref="assetListHeading" class="harness-page-title" tabindex="-1">资产清单</h1>
          <p class="harness-page-description">
            集中浏览 Agent、Skill、Command 和 Extension，查看版本内容与 Skill 质量报告，管理
            Extension 发布及历史记录。
          </p>
        </div>
        <div class="asset-page__actions">
          <button
            type="button"
            class="asset-button is-secondary"
            :aria-expanded="actionMenu === 'import'"
            @click="openActionMenu('import')"
          >
            导入
          </button>
          <button
            type="button"
            class="asset-button is-primary"
            :aria-expanded="actionMenu === 'create'"
            @click="openActionMenu('create')"
          >
            + 新建资产
          </button>
          <div v-if="actionMenu" class="asset-action-menu" role="menu">
            <strong>{{ actionMenu === 'create' ? '新建哪类资产' : '导入哪类资产' }}</strong>
            <button
              v-for="assetType in CATALOG_TYPES"
              :key="assetType"
              type="button"
              role="menuitem"
              @click="manageCatalog(assetType, actionMenu)"
            >
              {{ assetType }}
            </button>
            <small>Extension 由场景及绑定能力自动生成</small>
          </div>
        </div>
      </header>

      <section class="asset-scope" aria-label="资产范围筛选">
        <HarnessDepartmentPicker
          class="asset-department"
          :model-value="selectedDepartmentId"
          :departments="pickerDepartments"
          @update:model-value="selectDepartment"
        />

        <HarnessSelect
          v-if="products.length > 0"
          v-model="selectedProductId"
          class="asset-select"
          aria-label="产品筛选"
          @change="reloadAssets"
          :options="[
            { value: '', label: '全部产品' },
            ...products.map((product) => ({ value: product.id, label: product.name })),
          ]"
        />
      </section>
      <p v-if="productError" class="asset-scope-error" role="alert">{{ productError }}</p>

      <nav class="asset-filters" aria-label="资产类型">
        <button
          v-for="item in TYPE_FILTERS"
          :key="item.key"
          type="button"
          :class="{ 'is-active': filter === item.key }"
          :aria-pressed="filter === item.key"
          @click="selectFilter(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>

      <section
        ref="assetBoardElement"
        class="asset-board asset-board--catalog"
        @scroll.passive="handleAssetScroll"
        @wheel.passive="handleAssetWheel"
      >
        <div v-if="listLoading" class="asset-empty" role="status">正在加载资产…</div>
        <div v-else-if="listError" class="asset-empty asset-empty--error" role="alert">
          <span>{{ listError }}</span>
          <button type="button" class="asset-button is-secondary" @click="reloadAssets">
            重新加载
          </button>
        </div>
        <div v-else-if="filteredAssets.length > 0" class="asset-grid">
          <article
            v-for="asset in filteredAssets"
            :key="`${asset.assetType}:${asset.id}`"
            class="asset-card"
            role="button"
            tabindex="0"
            @click="openDetail(asset)"
            @keydown.enter.self.prevent="openDetail(asset)"
            @keydown.space.self.prevent="openDetail(asset)"
          >
            <div class="asset-card__title">
              <h2 :title="asset.name">{{ asset.name }}</h2>
              <span class="asset-badge is-type">{{ asset.assetType }}</span>
            </div>
            <p :title="asset.description || '暂无描述'">{{ asset.description || '暂无描述' }}</p>
            <div class="asset-card__meta">
              <!-- 统计数据尚未接入，暂时隐藏。 -->
              <template v-if="false">
                <span>⭐ {{ asset.marketplace.rating.toFixed(1) }}</span>
                <span>📥 {{ asset.marketplace.downloads }}</span>
                <span>📞 {{ asset.marketplace.calls }}</span>
              </template>
              <span v-if="asset.currentVersion">v{{ asset.currentVersion }}</span>
              <span v-if="statusLabel(asset)" class="asset-badge" :class="statusClass(asset)">
                {{ statusLabel(asset) }}
              </span>
            </div>
            <div v-if="asset.assetType === 'Extension'" class="asset-card__actions">
              <button
                v-if="canPublishAsset(asset)"
                type="button"
                class="asset-button is-primary asset-card__publish"
                :disabled="extensionReleaseLoading || asset.canPublish === false"
                :title="asset.canPublish === false ? '当前用户没有发布权限' : undefined"
                @click.stop="openExtensionRelease(asset, 'publish')"
              >
                发布
              </button>
              <button
                v-if="canViewAssetHistory(asset)"
                type="button"
                class="asset-button is-secondary asset-card__publish"
                :disabled="extensionReleaseLoading"
                @click.stop="openExtensionRelease(asset, 'history')"
              >
                发布历史
              </button>
            </div>
          </article>
        </div>
        <div v-else-if="hasMoreAssets" class="asset-empty" role="status">正在查找更多匹配资产…</div>
        <div v-else class="asset-empty">暂无资产</div>
        <div
          v-if="!listLoading && !listError && (filteredAssets.length > 0 || hasMoreAssets)"
          class="asset-list-footer"
          :class="{
            'is-complete': !listLoadingMore && !listAppendError && !hasMoreAssets,
          }"
          aria-live="polite"
        >
          <span v-if="listLoadingMore" class="asset-list-footer__loading" role="status">
            <i class="asset-loading-spinner" aria-hidden="true" />
            正在加载更多资产…
          </span>
          <span v-else-if="listAppendError" class="asset-list-footer__error" role="alert">
            {{ listAppendError }}
            <button type="button" @click="loadNextAssetPage">重试</button>
          </span>
          <span v-else-if="hasMoreAssets">继续向下滚动加载更多</span>
          <span v-else>已加载全部 {{ filteredAssets.length }} 项</span>
        </div>
      </section>
    </template>

    <template v-else-if="view === 'detail' && selectedAsset">
      <div class="asset-detail-toolbar">
        <button type="button" class="asset-back asset-detail-back" @click="returnToAssetList">
          <span aria-hidden="true">←</span> 返回列表
        </button>
        <button
          v-if="selectedAsset.assetType !== 'Extension'"
          type="button"
          class="asset-delete-button"
          aria-label="删除资产"
          @click="requestAssetDelete"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
          </svg>
          删除
        </button>
      </div>

      <section class="asset-board asset-detail" aria-labelledby="asset-detail-title">
        <header class="asset-detail__header">
          <div class="asset-detail__identity">
            <div class="asset-detail__title">
              <h1 id="asset-detail-title">{{ detailComponent?.name ?? selectedAsset.name }}</h1>
              <div class="asset-detail__badges">
                <span class="asset-badge is-type">{{ selectedAsset.assetType }}</span>
                <span
                  v-if="statusLabel(selectedAsset)"
                  class="asset-badge"
                  :class="statusClass(selectedAsset)"
                >
                  {{ statusLabel(selectedAsset) }}
                </span>
              </div>
            </div>
            <div class="asset-detail__meta">
              <dl class="asset-detail__summary">
                <div class="asset-detail__summary-field is-category">
                  <dt>归属于</dt>
                  <dd :title="detailCategory">{{ detailCategory }}</dd>
                </div>
                <div class="asset-detail__summary-field is-description">
                  <dt>描述</dt>
                  <dd class="asset-detail__description" :title="detailDescription">
                    {{ detailDescription }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div v-if="selectedAsset.assetType === 'Extension'" class="asset-detail__actions">
            <button
              v-if="canPublishAsset(selectedAsset)"
              type="button"
              class="asset-button is-primary asset-detail__publish"
              :disabled="extensionReleaseLoading || selectedAsset.canPublish === false"
              :title="selectedAsset.canPublish === false ? '当前用户没有发布权限' : undefined"
              @click="openExtensionRelease(selectedAsset, 'publish')"
            >
              发布
            </button>
            <button
              v-if="canViewAssetHistory(selectedAsset)"
              type="button"
              class="asset-button is-secondary"
              :disabled="extensionReleaseLoading"
              @click="openExtensionRelease(selectedAsset, 'history')"
            >
              发布历史
            </button>
          </div>
        </header>

        <dl v-if="selectedAsset.assetType !== 'Extension'" class="asset-detail__people">
          <div v-for="{ field, label } in PERSON_FIELDS" :key="field" class="asset-detail__person">
            <dt>{{ label }}</dt>
            <dd>{{ detailPersonLabel(field) }}</dd>
            <button
              type="button"
              class="asset-detail__person-edit"
              :aria-label="`修改${label}`"
              :title="`修改${label}`"
              @click="openPersonEditor(field, label)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-5-5L3 15z" />
              </svg>
            </button>
          </div>
          <div
            v-if="detailComponent?.firstScene || detailComponent?.secondScene"
            class="asset-detail__person"
          >
            <dt>所属场景</dt>
            <dd>
              {{
                [detailComponent.firstScene, detailComponent.secondScene]
                  .filter(Boolean)
                  .join(' / ')
              }}
            </dd>
          </div>
        </dl>

        <div class="asset-detail__version">
          <HarnessVersionPicker
            v-model="selectedVersion"
            :versions="detailVersions"
            :disabled="detailLoading"
            @change="changeDetailVersion"
          />
        </div>

        <nav class="asset-subtabs asset-detail__tabs" role="tablist" aria-label="资产详情分区">
          <button
            id="asset-detail-tab-content"
            type="button"
            role="tab"
            :class="{ 'is-active': detailTab === 'content' }"
            :aria-selected="detailTab === 'content'"
            :aria-controls="catalogDetailRecord ? 'catalog-detail-panel-detail' : undefined"
            @click="detailTab = 'content'"
          >
            内容
          </button>
          <button
            v-if="selectedAsset.assetType === 'Skill'"
            id="asset-detail-tab-report"
            type="button"
            role="tab"
            :class="{ 'is-active': detailTab === 'report' }"
            :aria-selected="detailTab === 'report'"
            aria-controls="catalog-detail-panel-evaluation"
            @click="detailTab = 'report'"
          >
            质量报告
          </button>
        </nav>

        <div v-if="extensionHasNoVersion" class="asset-empty" role="status">
          暂无版本，当前无法查看详情
        </div>
        <div v-else-if="detailLoading" class="asset-empty" role="status">正在加载资产内容…</div>
        <div v-else-if="detailError" class="asset-empty asset-empty--error" role="alert">
          <span>{{ detailError }}</span>
          <button type="button" class="asset-button is-secondary" @click="loadDetail">
            重新加载
          </button>
        </div>
        <HarnessCatalogDetailDialog
          v-else-if="catalogDetailRecord"
          open
          embedded
          :record="catalogDetailRecord"
          :user-id="props.userId"
          :capability-type="catalogCapabilityType"
          :version="selectedVersion"
          :tab="detailTab === 'report' ? 'evaluation' : 'detail'"
        />
        <HarnessExtensionDetailContent
          v-else-if="detail?.capabilities"
          :key="`${selectedAssetKey}:${selectedVersion}`"
          :name="selectedAsset.name"
          :user-id="props.userId"
          :capabilities="detail.capabilities"
        />
        <div v-else class="asset-file-tree">
          <strong>📁 {{ selectedAsset.name }}/</strong>
          <div v-if="detail?.files.length" class="asset-file-tree__branch">
            <template v-for="file in detail.files" :key="`${file.category || 'root'}:${file.path}`">
              <span>📄 {{ file.path }}</span>
              <pre>{{ file.content || '暂无文件内容' }}</pre>
            </template>
          </div>
          <div v-else class="asset-empty">该版本暂无文件</div>
        </div>
      </section>
    </template>

    <ExtensionPublishPage
      v-else-if="view === 'publish' && extensionRelease"
      :release-context="extensionRelease.context"
      :initial-panel="extensionRelease.mode"
      :user-id="props.userId"
      :user-name="props.userName"
      @close="returnFromExtensionRelease"
      @reload="reloadExtensionRelease"
      @released="onExtensionReleased"
      @notify="showToast"
    />

    <template v-else-if="view === 'publish'">
      <button
        type="button"
        class="asset-back asset-detail-back"
        @click="returnFromExtensionRelease"
      >
        <span aria-hidden="true">←</span> 返回
      </button>
      <header class="asset-page__header">
        <div>
          <h2>{{ extensionReleaseLoadingMode === 'history' ? '发布历史' : '发布' }}</h2>
          <p>{{ extensionReleaseAttempt?.asset.name }}</p>
        </div>
      </header>
      <div v-if="extensionReleaseLoading" class="asset-empty" role="status">
        {{
          extensionReleaseLoadingMode === 'history'
            ? '正在加载发布历史…'
            : '正在加载 Extension 发布信息…'
        }}
      </div>
      <div v-else-if="extensionReleaseError" class="asset-empty asset-empty--error" role="alert">
        <span>{{ extensionReleaseError }}</span>
        <button type="button" class="asset-button is-secondary" @click="reloadExtensionRelease">
          重新加载
        </button>
      </div>
    </template>

    <HarnessAssetPersonEditDialog
      v-if="personEditor"
      :label="personEditor.label"
      :current-value="personEditor.asset[personEditor.field]"
      :save-person="savePerson"
      @close="personEditor = null"
      @saved="onPersonSaved"
    />

    <Transition name="asset-toast">
      <div v-if="toastMessage" class="asset-toast" role="status">{{ toastMessage }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.asset-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  line-height: normal;
  letter-spacing: normal;
  font-synthesis: auto;
  text-rendering: auto;
  -webkit-font-smoothing: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

.asset-page :where(*) {
  box-sizing: border-box;
}

.asset-page button,
.asset-page input,
.asset-page :is(select, .harness-select) {
  line-height: normal;
  letter-spacing: normal;
}

.asset-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 16px;
  flex-wrap: wrap;
}

.asset-page__header h1 {
  margin: 0;
  color: #111827;
  font-family: inherit;
  font-size: 22.4px;
  font-weight: 700;
  line-height: normal;
  letter-spacing: normal;
}

.asset-page__header p {
  margin: 3.2px 0 0;
  color: #6b7280;
  font-size: 13.12px;
}

.asset-page__header--detail {
  margin-top: 0;
}

.asset-page__actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6.4px;
}

.asset-action-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(3, minmax(70px, 1fr));
  gap: 6.4px;
  min-width: 282px;
  padding: 9.6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.asset-action-menu strong,
.asset-action-menu small {
  grid-column: 1 / -1;
}

.asset-action-menu strong {
  color: #374151;
  font-size: 12.48px;
}

.asset-action-menu small {
  color: #9ca3af;
  font-size: 10.88px;
}

.asset-action-menu button {
  padding: 5.6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.asset-action-menu button:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.asset-button {
  display: inline-flex;
  align-items: center;
  gap: 4.8px;
  padding: 6.4px 13.6px;
  border: 0;
  border-radius: 6px;
  font-size: 12.48px;
  font-weight: 500;
  cursor: pointer;
}

.asset-button.is-primary {
  background: #2563eb;
  color: #fff;
}

.asset-button.is-primary:hover {
  background: #1e40af;
}

.asset-button.is-secondary {
  background: #e5e7eb;
  color: #1f2937;
}

.asset-button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.asset-scope {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 9.6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.asset-department {
  position: relative;
  flex: 1;
  min-width: 280px;
}

.asset-select,
.asset-field input {
  width: 100%;
  padding: 6.4px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13.12px;
}

.asset-scope > .asset-select {
  width: auto;
  min-width: 140px;
}

.asset-scope-error {
  margin: -8px 0 12px;
  color: #b91c1c;
  font-size: 11.52px;
}

.asset-filters,
.asset-subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6.4px;
}

.asset-filters {
  margin-bottom: 16px;
}

.asset-filters button,
.asset-subtabs button {
  padding: 5.6px 11.2px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.asset-filters button:hover,
.asset-subtabs button:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.asset-filters button.is-active,
.asset-subtabs button.is-active {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.asset-board {
  box-sizing: border-box;
  padding: 16px;
  margin-bottom: 16px;
  border: 0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.asset-page > .asset-board {
  flex: 1 1 auto;
  min-height: 0;
  margin-bottom: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.asset-board--catalog {
  scroll-behavior: smooth;
  overflow-anchor: auto;
  -webkit-overflow-scrolling: touch;
}

.asset-board--catalog::-webkit-scrollbar {
  width: 9px;
}

.asset-board--catalog::-webkit-scrollbar-track {
  background: transparent;
}

.asset-board--catalog::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #cbd5e1;
  background-clip: padding-box;
}

.asset-board--catalog::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
  background-clip: padding-box;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 20px;
  align-items: stretch;
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  min-width: 0;
  min-height: 184px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.asset-card:hover,
.asset-card:focus-visible {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.asset-list-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 14px 12px 4px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.asset-list-footer__loading,
.asset-list-footer__error {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.asset-list-footer__error {
  color: #b45309;
}

.asset-list-footer__error button {
  padding: 3px 9px;
  border: 1px solid #f59e0b;
  border-radius: 5px;
  background: #fff;
  color: #92400e;
  font: inherit;
  cursor: pointer;
}

.asset-loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #dbeafe;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: asset-loading-spin 0.7s linear infinite;
}

@keyframes asset-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .asset-board--catalog {
    scroll-behavior: auto;
  }

  .asset-card,
  .asset-loading-spinner {
    transition: none;
    animation: none;
  }
}

.asset-card__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.asset-card h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: inherit;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card > p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  flex-shrink: 0;
  max-height: 3.2em;
  margin: 0;
  overflow: hidden;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.asset-card__meta {
  display: flex;
  margin-top: auto;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: #6b7280;
  font-size: 12px;
}

.asset-card__actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 32px;
  margin-top: 6.4px;
}

.asset-card__publish {
  min-height: 32px;
}

.asset-badge {
  display: inline-block;
  padding: 2.88px 8.8px;
  border-radius: 9999px;
  font-size: 10.88px;
  font-weight: 600;
}

.asset-card .asset-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.asset-card__title .asset-badge.is-type {
  width: 80px;
}

.asset-badge.is-type,
.asset-badge.is-info {
  background: #dbeafe;
  color: #0c2d6b;
}

.asset-badge.is-success {
  background: #d1fae5;
  color: #065f46;
}

.asset-badge.is-warning {
  background: #fef3c7;
  color: #92400e;
}

.asset-empty {
  padding: 32px;
  color: #9ca3af;
  text-align: center;
}

.asset-empty--error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #b91c1c;
}

.asset-back {
  margin-bottom: 8px;
}

.asset-detail {
  display: block;
}

.asset-detail-back {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  margin-bottom: 14px;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  transition: color 0.15s;
}

.asset-detail-back:hover {
  color: #2563eb;
}

.asset-detail-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.asset-detail-toolbar .asset-detail-back {
  align-self: center;
  margin-bottom: 0;
}
.asset-delete-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 5px 12px;
  border: 1px solid var(--hw-danger, #b42318);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-danger, #b42318);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.asset-delete-button:hover {
  background: #fef3f2;
}

.asset-detail {
  padding: 24px;
  border: 1px solid #eef0f3;
  border-radius: 10px;
}

.asset-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid #f0f1f4;
}

.asset-detail__identity {
  flex: 1 1 280px;
  min-width: 0;
}

.asset-detail__title,
.asset-detail__badges,
.asset-detail__meta,
.asset-detail__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.asset-detail__title {
  gap: 8px 12px;
}

.asset-detail__title h1 {
  min-width: 0;
  margin: 0;
  color: #111827;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.asset-detail__badges {
  gap: 8px;
}

.asset-detail__badges .asset-badge {
  padding: 3px 10px;
  font-size: 11px;
  line-height: 18px;
}

.asset-detail__meta {
  flex-wrap: nowrap;
  gap: 24px;
  margin-top: 6px;
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
}

.asset-detail__actions {
  flex-shrink: 0;
  gap: 8px;
  padding-top: 1px;
}

.asset-detail__actions .asset-button {
  justify-content: center;
  min-height: 32px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

.asset-detail__summary {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 24px;
  min-width: 0;
  margin: 0;
}

.asset-detail__summary-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.asset-detail__summary-field.is-category {
  flex: 0 1 auto;
  gap: 6px;
  max-width: 40%;
  padding: 3px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f1f5f9;
}

.asset-detail__summary-field.is-description {
  flex: 1;
}

.asset-detail__summary-field.is-description dt {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.asset-detail__summary-field dt {
  flex-shrink: 0;
  white-space: nowrap;
}

.asset-detail__summary-field dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #4b5563;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-detail__people {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin: 16px 0 0;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.asset-detail__person {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
}

.asset-detail__person + .asset-detail__person::before {
  content: '';
  flex: 0 0 1px;
  height: 16px;
  margin-right: 17px;
  background: #d1d5db;
}

.asset-detail__person dt {
  flex-shrink: 0;
  color: #6b7280;
}

.asset-detail__person dd {
  min-width: 0;
  margin: 0;
  color: #1f2937;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.asset-detail__person-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: #7d8da8;
  background: transparent;
  cursor: pointer;
}

.asset-detail__person-edit:hover {
  color: #4569ff;
  background: #edf2ff;
}

.asset-detail__person-edit:focus-visible,
.asset-detail-back:focus-visible,
.asset-detail__actions button:focus-visible,
.asset-detail__tabs button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 3px;
}

.asset-detail__version {
  display: flex;
  align-items: center;
  margin-top: 16px;
}

.asset-detail .asset-detail__tabs {
  gap: 4px;
  margin: 16px 0 20px;
  padding: 0;
}

.asset-detail__tabs button {
  margin-bottom: -1px;
  padding: 10px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  line-height: 20px;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.asset-detail__tabs button:hover {
  border-color: transparent;
  color: #2563eb;
}

.asset-detail__tabs button.is-active {
  border-bottom-color: #2563eb;
  background: transparent;
  color: #2563eb;
  font-weight: 600;
}

.asset-field {
  display: block;
  margin-bottom: 12.8px;
}

.asset-field > span {
  display: block;
  margin-bottom: 4.8px;
  color: #374151;
  font-size: 12.48px;
  font-weight: 500;
}

.asset-field--inline .asset-select,
.asset-field--inline input {
  width: auto;
}

.asset-subtabs {
  padding-bottom: 0;
  margin-bottom: 12.8px;
  border-bottom: 1px solid #e5e7eb;
}

.asset-subtabs--outside {
  margin: 0 0 12.8px;
}

.asset-file-tree {
  padding: 14px;
  border-radius: 8px;
  background: #f9fafb;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.9;
}

.asset-file-tree__branch {
  margin-left: 22px;
  padding-left: 10px;
  border-left: 1px dashed #d1d5db;
}

.asset-file-tree__branch > span,
.asset-file-tree__branch > strong,
.asset-file-tree__branch small {
  display: block;
}

.asset-file-tree__branch > span {
  color: #4b5563;
}

.asset-file-tree > span {
  color: #4b5563;
}

.asset-file-tree__branch small {
  margin-left: 22px;
  color: #9ca3af;
  font-size: inherit;
}

.asset-file-tree pre {
  margin: 4px 0 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #1e293b;
  color: #cbd5e1;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.asset-button.asset-card__publish:disabled,
.asset-button.asset-detail__publish:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  opacity: 1;
}

.asset-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 120;
  max-width: min(360px, calc(100vw - 32px));
  padding: 11px 16px;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
  font-size: 13px;
}

.asset-toast-enter-active,
.asset-toast-leave-active {
  transition: 160ms ease;
}

.asset-toast-enter-from,
.asset-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 700px) {
  .asset-detail__meta {
    flex-wrap: wrap;
    gap: 12px;
  }

  .asset-detail__summary {
    flex-basis: 100%;
    gap: 16px;
  }

  .asset-detail__people {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .asset-detail__person + .asset-detail__person::before {
    display: none;
  }

  .asset-detail {
    padding: 18px 16px;
  }

  .asset-detail__title h1 {
    font-size: 20px;
  }

  .asset-page__header,
  .asset-scope {
    align-items: stretch;
    flex-direction: column;
  }

  .asset-page__actions {
    align-self: flex-start;
  }

  .asset-department {
    min-width: 0;
  }

  .asset-select {
    width: 100%;
  }
}
.asset-page__header,
.asset-scope,
.asset-filters,
.asset-subtabs {
  flex-shrink: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .asset-board--catalog {
    padding: 12px;
  }

  .asset-card__actions {
    margin-top: 0;
  }

  .asset-list-footer {
    min-height: 24px;
    padding: 4px 0 0;
  }

  .asset-list-footer.is-complete {
    display: none;
  }
}

@media (max-width: 1100px) {
  .asset-page {
    height: auto;
    min-height: 100%;
    overflow: visible;
  }

  .asset-page > .asset-board {
    flex: 0 0 auto;
    max-height: 70dvh;
  }
}
</style>

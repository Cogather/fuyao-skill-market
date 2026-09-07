<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { getHarnessAssetApi } from '../../services/skillMarket/assetManagementService';
import {
  harnessAssetPublishVersion,
  harnessAssetStatus,
  hasInProgressCurrentRelease,
  hasSuccessfulCurrentRelease,
  type HarnessAsset,
  type HarnessAssetDetail,
  type HarnessAssetFilter,
  type HarnessAssetOrganization,
  type HarnessAssetProduct,
  type HarnessAssetQualityReport,
  type HarnessAssetRelease,
  type HarnessAssetScope,
  type HarnessAssetType,
} from '../../services/skillMarket/assetManagementTypes';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';
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
  depth: number;
  hasChildren: boolean;
  selectable: boolean;
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

const emit = defineEmits<{
  'manage-catalog': [
    payload: {
      assetType: Exclude<HarnessAssetType, 'Extension'>;
      action: CatalogAction;
      scope: HarnessScopeSnapshot;
    },
  ];
}>();

const TYPE_FILTERS: Array<{ key: HarnessAssetFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'Agent', label: 'Agent' },
  { key: 'Skill', label: 'Skill' },
  { key: 'Command', label: 'Command' },
  { key: 'Extension', label: 'Extension' },
];
const CATALOG_TYPES = ['Agent', 'Skill', 'Command'] as const;
const ASSET_PAGE_SIZE = 24;
const ASSET_SCROLL_THRESHOLD = 120;
const MAX_EMPTY_PAGE_PROBES = 10;
const api = getHarnessAssetApi();

const view = ref<PageView>('list');
const filter = ref<HarnessAssetFilter>('all');
const selectedDepartmentId = ref('');
const selectedProductId = ref('');
const assets = ref<HarnessAsset[]>([]);
const products = ref<HarnessAssetProduct[]>([]);
const selectedAssetKey = ref('');
const detail = ref<HarnessAssetDetail | null>(null);
const selectedVersion = ref('');
const qualityReport = ref<HarnessAssetQualityReport | null>(null);
const organizations = ref<HarnessAssetOrganization[]>([]);
const selectedOrganizationId = ref('');
const detailTab = ref<'content' | 'report'>('content');
const publishTab = ref<'publish' | 'history'>('publish');
const departmentOpen = ref(false);
const expandedDepartments = ref(new Set<string>());
const actionMenu = ref<CatalogAction | null>(null);
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
const qualityLoading = ref(false);
const qualityError = ref('');
const organizationLoading = ref(false);
const organizationError = ref('');
const historyLoading = ref(false);
const historyError = ref('');
const publishSubmitting = ref(false);
const toastMessage = ref('');
let listSequence = 0;
let lastObservedAssetScrollTop = 0;
let pendingAssetScrollPreviousTop = 0;
let pendingAssetScrollTop = 0;
let assetScrollFrame: number | undefined;
let productSequence = 0;
let detailSequence = 0;
let qualitySequence = 0;
let historySequence = 0;
let toastTimer: number | undefined;

function normalizePath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

const normalizedAllowedPaths = computed(() =>
  props.allowedDepartmentPaths.map(normalizePath).filter((path) => path.length > 0),
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

const selectableDepartmentTree = computed(() => filterDepartmentTree(props.departmentTree));
const allDepartmentRows = computed<DepartmentRow[]>(() => {
  const rows: DepartmentRow[] = [];
  const append = (nodes: DepartmentTreeNode[], parentPath: string[], depth: number): void => {
    nodes.forEach((node, index) => {
      const path = [...parentPath, node.name];
      rows.push({
        id: String(node.id || node.deptCode || `${path.join('/')}-${index}`),
        code: String(node.deptCode || node.id || ''),
        name: node.name,
        path,
        depth,
        hasChildren: Boolean(node.children?.length),
        selectable:
          !props.restrictToAllowedDepartments ||
          normalizedAllowedPaths.value.some((allowed) => pathStartsWith(path, allowed)),
      });
      append(node.children ?? [], path, depth + 1);
    });
  };
  append(selectableDepartmentTree.value, [], 0);
  return rows;
});

const selectedDepartment = computed(
  () => allDepartmentRows.value.find((row) => row.id === selectedDepartmentId.value) ?? null,
);
const selectedDepartmentLabel = computed(() =>
  selectedDepartment.value ? selectedDepartment.value.path.join(' / ') : '选部门…',
);
const visibleDepartmentRows = computed(() =>
  allDepartmentRows.value.filter((row) =>
    row.path.slice(0, -1).every((_, index) => {
      const parentPath = row.path.slice(0, index + 1);
      const parent = allDepartmentRows.value.find(
        (candidate) => candidate.path.join('\u0001') === parentPath.join('\u0001'),
      );
      return parent ? expandedDepartments.value.has(parent.id) : true;
    }),
  ),
);
const selectedProduct = computed(
  () => products.value.find((product) => product.id === selectedProductId.value) ?? undefined,
);
const currentScope = computed<HarnessAssetScope | null>(() => {
  const department = selectedDepartment.value;
  if (!department) return null;
  return {
    userId: props.userId.trim(),
    userName: props.userName.trim(),
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
      path: [...department.path],
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
  assets.value.filter(
    (asset) =>
      (filter.value === 'all' || asset.assetType === filter.value) &&
      (!selectedProductId.value || asset.productId === selectedProductId.value),
  ),
);
const selectedOrganization = computed(() =>
  organizations.value.find((organization) => organization.id === selectedOrganizationId.value),
);
const detailVersions = computed(() =>
  detail.value?.versions.length ? detail.value.versions : (selectedAsset.value?.versions ?? []),
);
const publishVersion = computed(() =>
  selectedAsset.value && harnessAssetPublishVersion(selectedAsset.value)
    ? `v${harnessAssetPublishVersion(selectedAsset.value)}`
    : '无版本（未开发）',
);

function canPublishAsset(asset: HarnessAsset): boolean {
  return Boolean(asset.currentVersion && asset.publishable && !hasInProgressCurrentRelease(asset));
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

function toggleDepartment(id: string): void {
  const next = new Set(expandedDepartments.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedDepartments.value = next;
}

function expandSelectedAncestors(path: string[]): void {
  const next = new Set(expandedDepartments.value);
  path.slice(0, -1).forEach((_, index) => {
    const parentPath = path.slice(0, index + 1).join('\u0001');
    const parent = allDepartmentRows.value.find((row) => row.path.join('\u0001') === parentPath);
    if (parent) next.add(parent.id);
  });
  expandedDepartments.value = next;
}

function defaultDepartmentRow(): DepartmentRow | null {
  const preferredPaths = [
    ...normalizedAllowedPaths.value,
    normalizePath(props.currentUserDepartmentPath),
  ].filter((path) => path.length > 0);
  for (const path of preferredPaths) {
    const match = allDepartmentRows.value.find(
      (row) => row.selectable && row.path.join('\u0001') === path.join('\u0001'),
    );
    if (match) return match;
  }
  return (
    [...allDepartmentRows.value].reverse().find((row) => row.selectable && !row.hasChildren) ??
    allDepartmentRows.value.find((row) => row.selectable) ??
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
  if (!target?.selectable) return;
  selectedDepartmentId.value = id;
  departmentOpen.value = false;
  const row = selectedDepartment.value;
  if (row) expandSelectedAncestors(row.path);
  await reloadProductsAndAssets();
}

async function selectFilter(nextFilter: HarnessAssetFilter): Promise<void> {
  filter.value = nextFilter;
  await reloadAssets();
}

async function loadDetail(): Promise<void> {
  const scope = currentScope.value;
  const asset = selectedAsset.value;
  if (!scope || !asset) return;
  const sequence = ++detailSequence;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const response = await api.queryDetail(scope, asset, selectedVersion.value);
    if (sequence !== detailSequence) return;
    detail.value = response;
  } catch (error) {
    if (sequence !== detailSequence) return;
    detail.value = null;
    detailError.value = errorMessage(error, '资产内容加载失败');
  } finally {
    if (sequence === detailSequence) detailLoading.value = false;
  }
}

async function openDetail(asset: HarnessAsset): Promise<void> {
  qualitySequence += 1;
  historySequence += 1;
  selectedAssetKey.value = `${asset.assetType}:${asset.id}`;
  selectedVersion.value = asset.currentVersion || asset.versions[0] || '';
  detailTab.value = 'content';
  qualityReport.value = null;
  qualityLoading.value = false;
  qualityError.value = '';
  view.value = 'detail';
  await loadDetail();
}

async function returnToAssetList(): Promise<void> {
  view.value = 'list';
  await nextTick();
  resetAssetScrollPosition();
}

async function changeDetailVersion(): Promise<void> {
  qualitySequence += 1;
  qualityReport.value = null;
  qualityLoading.value = false;
  qualityError.value = '';
  await loadDetail();
  if (detailTab.value === 'report') await loadQualityReport();
}

async function loadQualityReport(): Promise<void> {
  const scope = currentScope.value;
  const asset = selectedAsset.value;
  if (!scope || !asset || asset.assetType !== 'Skill' || !selectedVersion.value) return;
  const sequence = ++qualitySequence;
  const assetKey = `${asset.assetType}:${asset.id}`;
  const version = selectedVersion.value;
  qualityLoading.value = true;
  qualityError.value = '';
  try {
    const response = await api.queryQualityReport(scope, asset, version);
    if (
      sequence !== qualitySequence ||
      selectedAssetKey.value !== assetKey ||
      selectedVersion.value !== version
    ) {
      return;
    }
    qualityReport.value = response;
  } catch (error) {
    if (sequence !== qualitySequence || selectedAssetKey.value !== assetKey) return;
    qualityReport.value = null;
    qualityError.value = errorMessage(error, '质量报告加载失败');
  } finally {
    if (sequence === qualitySequence) qualityLoading.value = false;
  }
}

async function selectDetailTab(tab: 'content' | 'report'): Promise<void> {
  detailTab.value = tab;
  if (tab === 'report' && !qualityReport.value) await loadQualityReport();
}

function replaceAssetReleases(assetKey: string, releases: HarnessAssetRelease[]): void {
  const asset = assets.value.find(
    (candidate) => `${candidate.assetType}:${candidate.id}` === assetKey,
  );
  if (!asset) return;
  asset.releases = releases.map((release) => ({
    ...release,
    organization: { ...release.organization },
  }));
}

async function loadHistory(): Promise<void> {
  const scope = currentScope.value;
  const asset = selectedAsset.value;
  if (!scope || !asset) return;
  const sequence = ++historySequence;
  const assetKey = `${asset.assetType}:${asset.id}`;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const releases = await api.queryReleases(scope, asset);
    if (sequence !== historySequence || selectedAssetKey.value !== assetKey) return;
    replaceAssetReleases(assetKey, releases);
  } catch (error) {
    if (sequence !== historySequence || selectedAssetKey.value !== assetKey) return;
    historyError.value = errorMessage(error, '发布历史加载失败');
  } finally {
    if (sequence === historySequence) historyLoading.value = false;
  }
}

async function openPublish(asset: HarnessAsset): Promise<void> {
  if (hasInProgressCurrentRelease(asset)) {
    showToast('该版本正在发布中，请勿重复提交');
    return;
  }
  if (!asset.currentVersion || !asset.publishable) {
    showToast('该资产尚未生成可发布版本');
    return;
  }
  selectedAssetKey.value = `${asset.assetType}:${asset.id}`;
  selectedVersion.value = harnessAssetPublishVersion(asset);
  detail.value = null;
  detailError.value = '';
  qualitySequence += 1;
  qualityReport.value = null;
  qualityLoading.value = false;
  selectedOrganizationId.value = '';
  publishTab.value = 'publish';
  organizationError.value = '';
  historyError.value = '';
  view.value = 'publish';
  const scope = currentScope.value;
  if (!scope) return;
  organizationLoading.value = true;
  try {
    const [nextOrganizations] = await Promise.all([
      api.queryOrganizations(scope, asset),
      loadHistory(),
      loadDetail(),
    ]);
    organizations.value = nextOrganizations;
    selectedOrganizationId.value = nextOrganizations[0]?.id ?? '';
    if (!nextOrganizations.length) organizationError.value = '当前用户暂无可发布组织';
  } catch (error) {
    organizations.value = [];
    organizationError.value = errorMessage(error, '可发布组织加载失败');
  } finally {
    organizationLoading.value = false;
  }
}

async function selectPublishTab(tab: 'publish' | 'history'): Promise<void> {
  publishTab.value = tab;
  if (tab === 'history') await loadHistory();
}

async function confirmPublish(): Promise<void> {
  const scope = currentScope.value;
  const asset = selectedAsset.value;
  const organization = selectedOrganization.value;
  if (!scope || !asset) return;
  if (hasInProgressCurrentRelease(asset)) {
    organizationError.value = '该版本正在发布中，请勿重复提交';
    return;
  }
  if (!organization) {
    organizationError.value = '请先选择目标组织';
    return;
  }
  publishSubmitting.value = true;
  organizationError.value = '';
  try {
    await api.publish({ scope, asset, organization, channel: 'product' });
    await loadHistory();
    publishTab.value = 'history';
    showToast('发布已提交');
  } catch (error) {
    organizationError.value = errorMessage(error, '发布失败，请稍后重试');
  } finally {
    publishSubmitting.value = false;
  }
}

function statusLabel(asset: HarnessAsset): string {
  return harnessAssetStatus(asset);
}

function statusClass(asset: HarnessAsset): string {
  const status = harnessAssetStatus(asset);
  if (status === '已发布') return 'is-success';
  if (status === '待发布') return 'is-warning';
  return 'is-info';
}

function releaseStatusClass(release: HarnessAssetRelease): string {
  if (release.status === '成功') return 'is-success';
  if (release.status === '失败') return 'is-warning';
  return 'is-info';
}

function formatReleaseDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function openActionMenu(action: CatalogAction): void {
  actionMenu.value = actionMenu.value === action ? null : action;
}

function manageCatalog(assetType: (typeof CATALOG_TYPES)[number], action: CatalogAction): void {
  actionMenu.value = null;
  const department = selectedDepartment.value;
  const product = selectedProduct.value;
  if (!department) {
    showToast('请先选择部门');
    return;
  }
  emit('manage-catalog', {
    assetType,
    action,
    scope: {
      level: product ? '产品级' : '部门级',
      departmentPath: [...department.path],
      offeringId: product?.id ?? '',
      offeringName: product?.name ?? '',
    },
  });
}

onMounted(async () => {
  const row = defaultDepartmentRow();
  if (!row) {
    listError.value = '暂无可用部门范围';
    return;
  }
  selectedDepartmentId.value = row.id;
  expandSelectedAncestors(row.path);
  await reloadProductsAndAssets();
});

onBeforeUnmount(() => {
  listSequence += 1;
  if (assetScrollFrame !== undefined) window.cancelAnimationFrame(assetScrollFrame);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="asset-page harness-viewport-page" @keydown.esc="departmentOpen = false">
    <template v-if="view === 'list'">
      <header class="asset-page__header harness-page-heading">
        <div>
          <h1 class="harness-page-title">资产清单</h1>
          <p class="harness-page-description">Extension 基于场景自动生成。</p>
        </div>
        <div class="asset-page__actions">
          <button
            type="button"
            class="asset-button is-secondary"
            :aria-expanded="actionMenu === 'import'"
            @click="openActionMenu('import')"
          >
            批量导入
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
        <div class="asset-department">
          <button
            type="button"
            class="asset-department__trigger"
            :class="{ 'is-open': departmentOpen }"
            :aria-expanded="departmentOpen"
            @click="departmentOpen = !departmentOpen"
          >
            <span :title="selectedDepartmentLabel">{{ selectedDepartmentLabel }}</span>
            <span aria-hidden="true">▾</span>
          </button>
          <button
            v-if="departmentOpen"
            type="button"
            class="asset-department__backdrop"
            aria-label="关闭部门选择"
            @click="departmentOpen = false"
          />
          <div v-if="departmentOpen" class="asset-department__panel">
            <div
              v-for="department in visibleDepartmentRows"
              :key="department.id"
              class="asset-department__row"
              :style="{ paddingLeft: `${4 + department.depth * 14}px` }"
            >
              <button
                type="button"
                class="asset-department__toggle"
                :disabled="!department.hasChildren"
                :aria-label="`${expandedDepartments.has(department.id) ? '收起' : '展开'}${department.path.join(' / ')}`"
                @click="toggleDepartment(department.id)"
              >
                {{
                  department.hasChildren ? (expandedDepartments.has(department.id) ? '▾' : '▸') : ''
                }}
              </button>
              <button
                type="button"
                class="asset-department__name"
                :class="{ 'is-selected': selectedDepartmentId === department.id }"
                :aria-label="department.path.join(' / ')"
                :disabled="!department.selectable"
                :title="department.selectable ? '' : '仅用于展开授权范围，不能按该部门查询'"
                @click="selectDepartment(department.id)"
              >
                {{ department.name }}
              </button>
            </div>
          </div>
        </div>

        <select
          v-if="products.length > 0"
          v-model="selectedProductId"
          class="asset-select"
          aria-label="产品筛选"
          @change="reloadAssets"
        >
          <option value="">全部产品</option>
          <option v-for="product in products" :key="product.id" :value="product.id">
            {{ product.name }}
          </option>
        </select>
      </section>
      <p v-if="productError" class="asset-scope-error" role="alert">{{ productError }}</p>

      <nav class="asset-filters" aria-label="资产类型">
        <button
          v-for="item in TYPE_FILTERS"
          :key="item.key"
          type="button"
          :class="{ 'is-active': filter === item.key }"
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
            @keydown.enter.prevent="openDetail(asset)"
            @keydown.space.prevent="openDetail(asset)"
          >
            <div class="asset-card__title">
              <h2>{{ asset.name }}</h2>
              <span class="asset-badge is-type">{{ asset.assetType }}</span>
            </div>
            <p>{{ asset.description || '暂无描述' }}</p>
            <div class="asset-card__meta">
              <span>⭐ {{ asset.marketplace.rating.toFixed(1) }}</span>
              <span>📥 {{ asset.marketplace.downloads }}</span>
              <span>📞 {{ asset.marketplace.calls }}</span>
              <span>{{ asset.currentVersion ? `v${asset.currentVersion}` : '未开发' }}</span>
              <span class="asset-badge" :class="statusClass(asset)">{{ statusLabel(asset) }}</span>
            </div>
            <button
              v-if="canPublishAsset(asset)"
              type="button"
              class="asset-button is-primary asset-card__publish"
              @click.stop="openPublish(asset)"
            >
              {{ hasSuccessfulCurrentRelease(asset) ? '继续发布' : '发布' }}
            </button>
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
      <button type="button" class="asset-button is-secondary asset-back" @click="returnToAssetList">
        ← 返回
      </button>
      <header class="asset-page__header asset-page__header--detail">
        <h1>{{ selectedAsset.name }}</h1>
        <div class="asset-page__tags">
          <span class="asset-badge is-type">{{ selectedAsset.assetType }}</span>
          <span v-if="selectedAsset.auto" class="asset-badge is-type">自动生成</span>
        </div>
      </header>

      <section class="asset-board asset-detail">
        <label class="asset-field asset-field--inline">
          <span>版本</span>
          <select v-model="selectedVersion" class="asset-select" @change="changeDetailVersion">
            <option v-if="detailVersions.length === 0" value="">无可用版本</option>
            <option v-for="version in detailVersions" :key="version" :value="version">
              v{{ version }}
            </option>
          </select>
        </label>

        <nav class="asset-subtabs" aria-label="资产详情分区">
          <button
            type="button"
            :class="{ 'is-active': detailTab === 'content' }"
            @click="selectDetailTab('content')"
          >
            内容
          </button>
          <button
            v-if="selectedAsset.assetType === 'Skill'"
            type="button"
            :class="{ 'is-active': detailTab === 'report' }"
            @click="selectDetailTab('report')"
          >
            质量报告
          </button>
        </nav>

        <div v-if="detailTab === 'content' && detailLoading" class="asset-empty" role="status">
          正在加载资产内容…
        </div>
        <div
          v-else-if="detailTab === 'content' && detailError"
          class="asset-empty asset-empty--error"
          role="alert"
        >
          <span>{{ detailError }}</span>
          <button type="button" class="asset-button is-secondary" @click="loadDetail">
            重新加载
          </button>
        </div>
        <div v-else-if="detailTab === 'content'" class="asset-file-tree">
          <strong>📁 {{ selectedAsset.name }}/</strong>
          <div v-if="detail?.files.length" class="asset-file-tree__branch">
            <template v-for="file in detail.files" :key="`${file.category || 'root'}:${file.path}`">
              <span>📄 {{ file.path }}</span>
              <pre>{{ file.content || '暂无文件内容' }}</pre>
            </template>
          </div>
          <div v-else class="asset-empty">该版本暂无文件</div>
        </div>

        <div v-else-if="qualityLoading" class="asset-empty" role="status">正在加载质量报告…</div>
        <div v-else-if="qualityError" class="asset-empty asset-empty--error" role="alert">
          <span>{{ qualityError }}</span>
          <button type="button" class="asset-button is-secondary" @click="loadQualityReport">
            重新加载
          </button>
        </div>
        <div v-else-if="qualityReport" class="asset-report">
          <div class="asset-report__summary">
            <span>整体评分</span>
            <strong>{{ qualityReport.overallScore }}</strong>
            <small>{{ qualityReport.summary }}</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>结果</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in qualityReport.items" :key="item.name">
                <td>{{ item.name }}</td>
                <td>{{ item.value }}</td>
                <td>
                  <span class="asset-badge" :class="item.pass ? 'is-success' : 'is-warning'">
                    {{ item.pass ? '通过' : '未通过' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="asset-empty">该版本暂无质量报告</div>

        <button
          v-if="canPublishAsset(selectedAsset)"
          type="button"
          class="asset-button is-primary asset-detail__publish"
          @click="openPublish(selectedAsset)"
        >
          {{ hasSuccessfulCurrentRelease(selectedAsset) ? '继续发布' : '发布' }}
        </button>
      </section>
    </template>

    <template v-else-if="view === 'publish' && selectedAsset">
      <button type="button" class="asset-button is-secondary asset-back" @click="view = 'detail'">
        ← 返回
      </button>
      <header class="asset-page__header asset-page__header--detail">
        <h1>发布 · {{ selectedAsset.name }}</h1>
        <span class="asset-badge is-type">{{ selectedAsset.assetType }}</span>
      </header>

      <nav class="asset-subtabs asset-subtabs--outside" aria-label="发布分区">
        <button
          type="button"
          :class="{ 'is-active': publishTab === 'publish' }"
          @click="selectPublishTab('publish')"
        >
          发布
        </button>
        <button
          type="button"
          :class="{ 'is-active': publishTab === 'history' }"
          @click="selectPublishTab('history')"
        >
          发布历史
        </button>
      </nav>

      <section v-if="publishTab === 'publish'" class="asset-board asset-publish">
        <label class="asset-field asset-field--inline">
          <span>发布版本</span>
          <input :value="publishVersion" disabled />
        </label>

        <div v-if="detailLoading" class="asset-empty" role="status">正在加载发布内容…</div>
        <div v-else-if="detailError" class="asset-empty asset-empty--error" role="alert">
          <span>{{ detailError }}</span>
          <button type="button" class="asset-button is-secondary" @click="loadDetail">
            重新加载
          </button>
        </div>
        <div v-else class="asset-file-tree">
          <strong>📁 {{ selectedAsset.name }}/</strong>
          <div v-if="detail?.files.length" class="asset-file-tree__branch">
            <template v-for="file in detail.files" :key="`${file.category || 'root'}:${file.path}`">
              <span>📄 {{ file.path }}</span>
              <pre>{{ file.content || '暂无文件内容' }}</pre>
            </template>
          </div>
          <div v-else class="asset-empty">发布时将使用当前版本产物</div>
        </div>

        <label class="asset-field asset-field--inline asset-publish__organization">
          <span>目标组织</span>
          <select
            v-model="selectedOrganizationId"
            class="asset-select"
            aria-label="目标组织"
            :disabled="organizationLoading"
          >
            <option value="">选组织…</option>
            <option
              v-for="organization in organizations"
              :key="organization.id"
              :value="organization.id"
            >
              {{ organization.name }}
            </option>
          </select>
        </label>
        <p v-if="organizationError" class="asset-form-error" role="alert">
          {{ organizationError }}
        </p>
        <button
          type="button"
          class="asset-button is-primary"
          :disabled="publishSubmitting || organizationLoading"
          @click="confirmPublish"
        >
          {{ publishSubmitting ? '发布中…' : '确认发布' }}
        </button>
      </section>

      <section v-else class="asset-board asset-history">
        <div v-if="historyLoading" class="asset-empty" role="status">正在加载发布历史…</div>
        <div v-else-if="historyError" class="asset-empty asset-empty--error" role="alert">
          <span>{{ historyError }}</span>
          <button type="button" class="asset-button is-secondary" @click="loadHistory">
            重新加载
          </button>
        </div>
        <div v-else-if="selectedAsset.releases.length === 0" class="asset-empty">暂无发布记录</div>
        <article
          v-for="release in selectedAsset.releases"
          v-else
          :key="
            release.id || `${release.version}-${release.publishedAt}-${release.organization.id}`
          "
          class="asset-history__item"
        >
          <div>
            <strong>{{ release.extensionName || selectedAsset.name }}</strong>
            <code>v{{ release.version }}</code>
            <span class="asset-badge" :class="releaseStatusClass(release)">
              {{ release.status }}
            </span>
            <time>{{ formatReleaseDate(release.publishedAt) }}</time>
          </div>
          <p>
            发布人：{{ release.publisher || '—' }} · 组织：{{ release.organization.name || '—' }}
          </p>
        </article>
      </section>
    </template>

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
.asset-page select {
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

.asset-page__tags {
  display: flex;
  align-items: center;
  gap: 4px;
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

.asset-department__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6.4px 9.6px;
  overflow: hidden;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 13.12px;
  cursor: pointer;
}

.asset-department__trigger > span:first-child {
  flex: 1;
  padding-right: 4.8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-department__trigger > span:last-child {
  color: #9ca3af;
}

.asset-department__backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  border: 0;
  background: transparent;
}

.asset-department__panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 21;
  max-height: 280px;
  padding: 3.2px 0;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.asset-department__row {
  display: flex;
  align-items: center;
  gap: 4.8px;
  padding: 4px 6.4px;
}

.asset-department__row:hover {
  background: #f9fafb;
}

.asset-department__toggle,
.asset-department__name {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.asset-department__toggle {
  flex: 0 0 12px;
  width: 12px;
  padding: 0;
  color: #9ca3af;
  font-family: inherit;
  font-size: 14px;
  text-align: center;
  user-select: none;
}

.asset-department__toggle:disabled {
  cursor: default;
}

.asset-department__name {
  flex: 1;
  padding: 0;
  color: #374151;
  font-family: inherit;
  font-size: 12.48px;
  text-align: left;
  user-select: none;
}

.asset-department__name.is-selected {
  color: #2563eb;
  font-weight: 600;
}

.asset-department__name:disabled {
  color: #9ca3af;
  cursor: not-allowed;
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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-items: stretch;
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 6.4px;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: auto 170px;
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
  justify-content: space-between;
}

.asset-card h2 {
  margin: 0;
  color: inherit;
  font-family: inherit;
  font-size: 14.08px;
  font-weight: 700;
  line-height: normal;
  letter-spacing: normal;
}

.asset-card > p {
  flex: 1;
  margin: 0;
  color: #4b5563;
  font-size: 12.48px;
}

.asset-card__meta {
  display: flex;
  gap: 9.6px;
  flex-wrap: wrap;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-card__publish {
  align-self: flex-start;
  margin-top: 6.4px;
}

.asset-badge {
  display: inline-block;
  padding: 2.88px 8.8px;
  border-radius: 9999px;
  font-size: 10.88px;
  font-weight: 600;
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

.asset-detail,
.asset-publish {
  display: block;
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

.asset-report__summary {
  margin-bottom: 12.8px;
  padding: 16px;
  border-left: 4px solid #10b981;
  border-radius: 8px;
  background: #f9fafb;
}

.asset-report__summary span {
  display: block;
  color: #6b7280;
  font-size: 12.48px;
}

.asset-report__summary strong {
  display: block;
  font-size: 32px;
  font-weight: 700;
}

.asset-report__summary small {
  display: block;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-report table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.48px;
}

.asset-report th,
.asset-report td {
  padding: 6.4px;
  text-align: left;
}

.asset-report td {
  border-bottom: 1px solid #e5e7eb;
}

.asset-report th {
  background: #f3f4f6;
}

.asset-detail__publish {
  margin-top: 16px;
}

.asset-publish__organization {
  margin-top: 16px;
}

.asset-form-error {
  margin: -4px 0 10px;
  color: #b91c1c;
  font-size: 11.52px;
}

.asset-history {
  display: block;
}

.asset-history__item {
  padding: 11.2px 12.8px;
  margin-bottom: 9.6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.asset-history__item > div {
  display: flex;
  align-items: center;
  gap: 6.4px;
  flex-wrap: wrap;
  margin-bottom: 4.8px;
}

.asset-history__item code {
  display: inline-block;
  padding: 1.6px 6.4px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #6b7280;
  font-family: monospace;
  font-size: 11.52px;
  line-height: normal;
}

.asset-history__item time {
  margin-left: auto;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-history__item p {
  margin: 0;
  color: #6b7280;
  font-size: 11.52px;
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

  .asset-history__item time {
    width: 100%;
    margin-left: 0;
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

  .asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }

  .asset-card {
    padding: 12px;
  }

  .asset-card h2,
  .asset-card > p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }

  .asset-card__publish {
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

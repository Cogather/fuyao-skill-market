import { computed, ref } from 'vue';

import {
  harnessAssetStatus,
  type HarnessAsset,
  type HarnessAssetApi,
  type HarnessAssetFilter,
  type HarnessAssetProduct,
  type HarnessAssetScope,
} from '../../services/skillMarket/assetManagementTypes';
import { mergeUniquePage, shouldLoadNextPage } from '../../utils/infiniteScroll';

export type AssetStatusFilter = 'all' | 'developing' | 'pending' | 'published';

export type DepartmentTreeNode = {
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

export type HarnessAssetCatalogListProps = {
  userId: string;
  userName: string;
  departmentTree: DepartmentTreeNode[];
  currentUserDepartmentPath: string[];
  allowedDepartmentPaths: string[][];
  restrictToAllowedDepartments: boolean;
};

export const TYPE_FILTERS: Array<{ key: HarnessAssetFilter; label: string }> = [
  { key: 'Agent', label: 'Agent' },
  { key: 'Skill', label: 'Skill' },
  { key: 'Command', label: 'Command' },
  { key: 'Extension', label: 'Extension' },
];

export const STATUS_FILTERS: Array<{ key: AssetStatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'developing', label: '开发中' },
  { key: 'pending', label: '待发布' },
  { key: 'published', label: '已发布' },
];

const STATUS_QUERY_VALUES: Record<
  Exclude<AssetStatusFilter, 'all'>,
  '开发中' | '待发布' | '已发布'
> = {
  developing: '开发中',
  pending: '待发布',
  published: '已发布',
};

export const CATALOG_TYPES = ['Agent', 'Skill', 'Command'] as const;

const ASSET_SCROLL_THRESHOLD = 120;
const MAX_EMPTY_PAGE_PROBES = 10;

function normalizePath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useHarnessAssetCatalogList(
  props: HarnessAssetCatalogListProps,
  options: { api: HarnessAssetApi; transportIsHttp: boolean },
) {
  const { api, transportIsHttp } = options;
  const assetPageSize = transportIsHttp ? 30 : 24;

  const filter = ref<HarnessAssetFilter>('Agent');
  const assetSearchQuery = ref('');
  const appliedAssetSearchKeyword = ref('');
  const assetStatusFilter = ref<AssetStatusFilter>('all');
  const selectedDepartmentId = ref('');
  const selectedProductId = ref('');
  const assets = ref<HarnessAsset[]>([]);
  const assetTotal = ref(0);
  const products = ref<HarnessAssetProduct[]>([]);
  const selectedAssetKey = ref('');
  const listLoading = ref(false);
  const listLoadingMore = ref(false);
  const listError = ref('');
  const listAppendError = ref('');
  const assetPageNum = ref(0);
  const hasMoreAssets = ref(false);
  const assetBoardElement = ref<HTMLElement | null>(null);
  const productError = ref('');
  const assetsNeedRefresh = ref(false);
  const listSequence = ref(0);

  let lastObservedAssetScrollTop = 0;
  let pendingAssetScrollPreviousTop = 0;
  let pendingAssetScrollTop = 0;
  let assetScrollFrame: number | undefined;
  let assetSearchTimer: number | undefined;
  let productSequence = 0;

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
  const selectedCatalogType = computed<(typeof CATALOG_TYPES)[number] | null>(
    () => CATALOG_TYPES.find((assetType) => assetType === filter.value) ?? null,
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
    () => assets.value.find((asset) => assetKey(asset) === selectedAssetKey.value) ?? null,
  );
  const filteredAssets = computed(() => {
    const query = transportIsHttp ? '' : assetSearchQuery.value.trim().toLocaleLowerCase('zh-CN');
    const candidates = transportIsHttp
      ? assets.value
      : assets.value.filter(
          (asset) =>
            (filter.value === 'all' || asset.assetType === filter.value) &&
            (!selectedProductId.value || asset.productId === selectedProductId.value),
        );
    return candidates.filter((asset) => {
      const status = statusLabel(asset);
      const matchesStatus =
        transportIsHttp ||
        assetStatusFilter.value === 'all' ||
        (assetStatusFilter.value === 'developing' && ['未开发', '开发中'].includes(status)) ||
        (assetStatusFilter.value === 'pending' &&
          ['待发布', '可发布', '发布中'].includes(status)) ||
        (assetStatusFilter.value === 'published' && status === '已发布');
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        asset.name,
        asset.description,
        asset.owner,
        asset.developer,
        asset.productName,
        asset.departmentName,
      ]
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(query);
    });
  });

  function assetKey(asset: HarnessAsset): string {
    return `${asset.assetType}:${asset.id}`;
  }

  function statusLabel(asset: HarnessAsset): string {
    return transportIsHttp ? (asset.status ?? '') : harnessAssetStatus(asset);
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
    const sequence = ++listSequence.value;
    assets.value = [];
    assetTotal.value = 0;
    assetPageNum.value = 0;
    hasMoreAssets.value = false;
    listError.value = '';
    listAppendError.value = '';
    listLoadingMore.value = false;
    resetAssetScrollPosition();
    return sequence;
  }

  function assetPageQuery(pageNum: number) {
    const status =
      assetStatusFilter.value === 'all' ? undefined : STATUS_QUERY_VALUES[assetStatusFilter.value];
    return {
      pageNum,
      pageSize: assetPageSize,
      ...(appliedAssetSearchKeyword.value ? { keyword: appliedAssetSearchKeyword.value } : {}),
      ...(transportIsHttp && status ? { status } : {}),
    };
  }

  function scheduleAssetSearch(event: Event): void {
    assetSearchQuery.value = (event.target as HTMLInputElement).value;
    if (assetSearchTimer !== undefined) window.clearTimeout(assetSearchTimer);
    assetSearchTimer = window.setTimeout(() => {
      assetSearchTimer = undefined;
      appliedAssetSearchKeyword.value = assetSearchQuery.value.trim();
      void reloadAssets();
    }, 250);
  }

  async function reloadAssets(): Promise<void> {
    assetsNeedRefresh.value = false;
    const scope = currentScope.value;
    const sequence = resetAssetListState();
    if (!scope) {
      listError.value = '暂无可用部门范围';
      listLoading.value = false;
      return;
    }
    listLoading.value = true;
    try {
      const result = await api.queryAssets(scope, assetPageQuery(1));
      if (sequence !== listSequence.value) return;
      assets.value = mergeUniquePage([], result.list, assetKey);
      assetTotal.value = result.total;
      assetPageNum.value = 1;
      hasMoreAssets.value = result.hasMore;
    } catch (error) {
      if (sequence !== listSequence.value) return;
      listError.value = errorMessage(error, '资产清单加载失败');
    } finally {
      if (sequence === listSequence.value) listLoading.value = false;
    }
  }

  async function loadNextAssetPage(): Promise<void> {
    const scope = currentScope.value;
    if (!scope || listLoading.value || listLoadingMore.value || !hasMoreAssets.value) return;
    const sequence = listSequence.value;
    listLoadingMore.value = true;
    listAppendError.value = '';
    try {
      let nextPage = assetPageNum.value + 1;
      for (let probe = 0; probe < MAX_EMPTY_PAGE_PROBES; probe += 1) {
        const result = await api.queryAssets(scope, assetPageQuery(nextPage));
        if (sequence !== listSequence.value) return;
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
      if (sequence !== listSequence.value) return;
      listAppendError.value = errorMessage(error, '下一页资产加载失败');
    } finally {
      if (sequence === listSequence.value) listLoadingMore.value = false;
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
    assetStatusFilter.value = nextFilter === 'Extension' ? 'published' : 'all';
    await reloadAssets();
  }

  async function selectStatusFilter(nextFilter: AssetStatusFilter): Promise<void> {
    if (assetStatusFilter.value === nextFilter) return;
    assetStatusFilter.value = nextFilter;
    await reloadAssets();
  }

  async function initializeList(): Promise<void> {
    const row = defaultDepartmentRow();
    if (!row) {
      listError.value = '暂无可用部门范围';
      return;
    }
    selectedDepartmentId.value = row.id;
    await reloadProductsAndAssets();
  }

  function disposeList(): void {
    listSequence.value += 1;
    productSequence += 1;
    if (assetScrollFrame !== undefined) window.cancelAnimationFrame(assetScrollFrame);
    if (assetSearchTimer !== undefined) window.clearTimeout(assetSearchTimer);
  }

  return {
    filter,
    assetSearchQuery,
    assetStatusFilter,
    selectedDepartmentId,
    selectedProductId,
    assets,
    assetTotal,
    products,
    selectedAssetKey,
    listLoading,
    listLoadingMore,
    listError,
    listAppendError,
    hasMoreAssets,
    assetBoardElement,
    productError,
    assetsNeedRefresh,
    listSequence,
    normalizedAllowedPaths,
    defaultCatalogDepartmentPath,
    manageableDepartmentTree,
    pickerDepartments,
    selectedDepartment,
    selectedProduct,
    selectedCatalogType,
    currentScope,
    selectedAsset,
    filteredAssets,
    assetKey,
    statusLabel,
    resetAssetScrollPosition,
    scheduleAssetSearch,
    reloadAssets,
    loadNextAssetPage,
    handleAssetScroll,
    handleAssetWheel,
    reloadProductsAndAssets,
    selectDepartment,
    selectFilter,
    selectStatusFilter,
    initializeList,
    disposeList,
  };
}

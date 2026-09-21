<script setup lang="ts">
import HarnessSelect from '../../components/skill/HarnessSelect.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import HarnessCatalogDetailDialog from '../../components/skill/HarnessCatalogDetailDialog.vue';
import HarnessExtensionDetailContent from '../../components/skill/HarnessExtensionDetailContent.vue';
import HarnessAssetDeleteDialog from '../../components/skill/HarnessAssetDeleteDialog.vue';
import HarnessCatalogImportDialog from '../../components/skill/HarnessCatalogImportDialog.vue';
import HarnessCatalogExportDialog from '../../components/skill/HarnessCatalogExportDialog.vue';
import HarnessDepartmentPicker from '../../components/skill/HarnessDepartmentPicker.vue';
import HarnessVersionPicker from '../../components/skill/HarnessVersionPicker.vue';
import HarnessAssetEditDialog from '../../components/skill/HarnessAssetEditDialog.vue';
import HarnessCapabilityCatalogPanel from '../../components/skill/HarnessCapabilityCatalogPanel.vue';
import SkillMasterManagementPanel from '../../components/skill/SkillMasterManagementPanelV2.vue';
import AtomicAssetPublishPage from './AtomicAssetPublishPage.vue';
import ExtensionPublishPage from './ExtensionPublishPage.vue';
import { atomicAssetApiType } from '../../services/skillMarket/atomicAssetPublishHttp';
import type { ExtensionReleaseContext } from '../../services/skillMarket/extensionPublishHttp';
import {
  getHarnessAssetApi,
  usesHttpHarnessAssetApi,
} from '../../services/skillMarket/assetManagementService';
import {
  normalizeHarnessAssetVersion,
  type HarnessAsset,
  type HarnessAssetDetail,
  type HarnessAssetPersonField,
  type DeleteHarnessAssetInput,
} from '../../services/skillMarket/assetManagementTypes';
import type {
  HarnessCatalogAction,
  HarnessCatalogAssetType,
  HarnessCatalogScopeChange,
  HarnessCatalogScopeSnapshots,
  HarnessScopeSnapshot,
} from '../../types/harnessFilterMemory';
import type { SkillPlanningUserOption } from '../../services/skillMarket/skillPlanningShared';
import { firstNonBlankText, formatCompactDateTime } from '../../utils/common';
import { getAssetCatalogItemNamePrefix } from '../../utils/catalogItemName';
import {
  CATALOG_TYPES,
  STATUS_FILTERS,
  TYPE_FILTERS,
  useHarnessAssetCatalogList,
  type DepartmentTreeNode,
} from './useHarnessAssetCatalogList';

type PageView = 'list' | 'detail' | 'publish';

const props = withDefaults(
  defineProps<{
    userId?: string;
    userName?: string;
    departmentTree?: DepartmentTreeNode[];
    currentUserDepartmentPath?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
    scopeSnapshots?: HarnessCatalogScopeSnapshots;
  }>(),
  {
    userId: '',
    userName: '',
    departmentTree: () => [],
    currentUserDepartmentPath: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
    scopeSnapshots: () => ({}),
  },
);
const emit = defineEmits<{
  'scope-change': [change: HarnessCatalogScopeChange];
}>();

const PERSON_FIELDS = [
  { field: 'owner', label: '责任人' },
  { field: 'developer', label: '开发责任人' },
] as const;
const transportIsHttp = usesHttpHarnessAssetApi();
const api = getHarnessAssetApi();

const view = ref<PageView>('list');
const detail = ref<HarnessAssetDetail | null>(null);
const selectedVersion = ref('');
const detailTab = ref<'content' | 'report' | 'history'>('content');
const deleteTarget = ref<DeleteHarnessAssetInput | null>(null);
const assetListHeading = ref<HTMLElement | null>(null);
const atomicPublishAsset = ref<HarnessAsset | null>(null);
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
const extensionHistoryContext = ref<ExtensionReleaseContext | null>(null);
const extensionHistoryLoading = ref(false);
const extensionHistoryError = ref('');
const cardMenuKey = ref('');
const createAssetType = ref<(typeof CATALOG_TYPES)[number] | null>(null);
const importAssetType = ref<(typeof CATALOG_TYPES)[number] | null>(null);
const exportAssetType = ref<(typeof CATALOG_TYPES)[number] | null>(null);
const createScope = ref<HarnessScopeSnapshot>();
const importScope = ref<HarnessScopeSnapshot>({
  level: '产品级',
  departmentPath: [],
  offeringId: '',
  offeringName: '',
});
const exportScope = ref<HarnessScopeSnapshot>({
  level: '产品级',
  departmentPath: [],
  offeringId: '',
  offeringName: '',
});
const detailLoading = ref(false);
const detailError = ref('');
const detailDraft = ref<{
  name: string;
  description: string;
  people: Record<HarnessAssetPersonField, SkillPlanningUserOption | null>;
  changedPeople: Partial<Record<HarnessAssetPersonField, boolean>>;
  plannedCompleteDate: string;
  initialPlannedCompleteDate: string;
} | null>(null);
const detailSaving = ref(false);
const detailEditError = ref('');
const toastMessage = ref('');
let detailSequence = 0;
let extensionReleaseSequence = 0;
let extensionHistorySequence = 0;
let toastTimer: number | undefined;

const {
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
  selectDepartment,
  selectFilter,
  selectStatusFilter,
  initializeList,
  disposeList,
} = useHarnessAssetCatalogList(props, { api, transportIsHttp });

function initialDetailPerson(field: HarnessAssetPersonField): SkillPlanningUserOption | null {
  const component = detailComponent.value;
  const label = selectedAsset.value?.[field] ?? '';
  const parts = label.match(/^(.*?)\s+([^\s]+)$/);
  const name = component
    ? field === 'owner'
      ? component.ownerName
      : component.developerName
    : parts?.[1];
  const id = component
    ? field === 'owner'
      ? component.ownerId
      : component.developerId
    : parts?.[2];
  if (!name || !id) return null;
  return { chName: name, id, sAMAccountName: id, label: `${name} ${id}`, deptName: '', raw: {} };
}

async function beginDetailEdit(): Promise<void> {
  const asset = selectedAsset.value;
  if (!asset || !canEditDetail.value || detailSaving.value) return;
  if (transportIsHttp && !detailComponent.value) return;
  detailEditError.value = '';
  let plannedCompleteDate = '';
  try {
    plannedCompleteDate = await api.fetchPlannedCompleteDate({
      asset: { ...asset },
      userId: props.userId,
    });
  } catch {
    plannedCompleteDate = '';
  }
  if (selectedAsset.value?.id !== asset.id) return;
  detailDraft.value = {
    name: detailComponent.value?.name ?? asset.name,
    description: detailComponent.value?.description ?? asset.description ?? '',
    people: { owner: initialDetailPerson('owner'), developer: initialDetailPerson('developer') },
    changedPeople: {},
    plannedCompleteDate,
    initialPlannedCompleteDate: plannedCompleteDate,
  };
}

function changeDraftPerson(
  field: HarnessAssetPersonField,
  person: SkillPlanningUserOption | null,
): void {
  if (!detailDraft.value || !canEditDetail.value || detailSaving.value) return;
  detailDraft.value.people[field] = person;
  detailDraft.value.changedPeople[field] = true;
}

function cancelDetailEdit(): void {
  if (detailSaving.value) return;
  detailDraft.value = null;
  detailEditError.value = '';
}

async function saveDetailEdits(): Promise<void> {
  const asset = selectedAsset.value;
  const draft = detailDraft.value;
  if (!asset || !draft || detailSaving.value) return;
  if (!canEditDetail.value) {
    detailEditError.value = '当前用户没有编辑权限';
    return;
  }
  const sequence = detailSequence;
  const editView = view.value;
  const originalId = asset.id;
  detailSaving.value = true;
  detailEditError.value = '';
  try {
    if (detailComponent.value?.category && detailComponent.value.category !== asset.category) {
      throw new Error('资产详情与列表归属不一致，请返回列表刷新后重试');
    }
    const plannedCompleteDateChanged =
      draft.plannedCompleteDate !== draft.initialPlannedCompleteDate;
    const saved = await api.updateDetails({
      asset: { ...asset },
      userId: props.userId,
      name: draft.name,
      description: draft.description,
      ...(draft.changedPeople.owner ? { owner: draft.people.owner } : {}),
      ...(draft.changedPeople.developer ? { developer: draft.people.developer } : {}),
      ...(plannedCompleteDateChanged ? { plannedCompleteDate: draft.plannedCompleteDate } : {}),
    });
    if (
      sequence !== detailSequence ||
      view.value !== editView ||
      selectedAsset.value?.id !== originalId
    )
      return;
    Object.assign(asset, saved);
    if (draft.changedPeople.owner && draft.people.owner) {
      asset.ownerId = draft.people.owner.id.trim() || draft.people.owner.sAMAccountName.trim();
    }
    if (transportIsHttp)
      asset.id = JSON.stringify([asset.assetType, asset.category ?? '', asset.name]);
    selectedAssetKey.value = assetKey(asset);
    const component = detail.value?.component;
    if (component) {
      component.name = saved.name;
      component.description = saved.description;
      for (const field of ['owner', 'developer'] as const) {
        const person = draft.people[field];
        if (!draft.changedPeople[field] || !person) continue;
        const id = person.id.trim() || person.sAMAccountName.trim();
        if (field === 'owner') {
          component.ownerName = person.chName.trim();
          component.ownerId = id;
        } else {
          component.developerName = person.chName.trim();
          component.developerId = id;
        }
      }
    }
    detailDraft.value = null;
    showToast('资产信息已保存');
  } catch (error) {
    if (sequence === detailSequence)
      detailEditError.value = errorMessage(error, '资产信息保存失败');
  } finally {
    if (sequence === detailSequence) detailSaving.value = false;
  }
}

function requestAssetDelete(): void {
  const asset = selectedAsset.value;
  if (!asset || !canEditDetail.value || detailSaving.value || detailDraft.value) return;
  deleteTarget.value = {
    asset: { ...asset },
    userId: props.userId,
  };
}

async function deleteCurrentAsset(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) throw new Error('请重新打开删除确认窗口');
  const listAsset = assets.value.find((asset) => assetKey(asset) === assetKey(target.asset));
  if (target.userId !== props.userId || !listAsset || !canAccessAsset(listAsset)) {
    throw new Error('当前用户没有删除权限，请刷新后重试');
  }
  const detailCategory = detailComponent.value?.category?.trim();
  if (
    selectedAsset.value &&
    assetKey(selectedAsset.value) === assetKey(target.asset) &&
    detailCategory &&
    detailCategory !== target.asset.category?.trim()
  ) {
    throw new Error('资产详情与列表归属不一致，请返回列表刷新后重试');
  }
  await api.deleteAsset(target);
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

const detailVersions = computed(
  () => detail.value?.versions ?? selectedAsset.value?.versions ?? [],
);
const extensionHasNoVersion = computed(
  () => selectedAsset.value?.assetType === 'Extension' && !selectedAsset.value.currentVersion,
);
const isExtensionHistoryTab = computed(
  () => selectedAsset.value?.assetType === 'Extension' && detailTab.value === 'history',
);
const isAtomicHistoryTab = computed(
  () => selectedAsset.value?.assetType !== 'Extension' && detailTab.value === 'history',
);
const isHistoryTab = computed(() => isExtensionHistoryTab.value || isAtomicHistoryTab.value);
const detailComponent = computed(() => detail.value?.component);
const detailRequiredNamePrefix = computed(() =>
  selectedAsset.value ? getAssetCatalogItemNamePrefix(selectedAsset.value) : '',
);
const detailPermissionsReady = computed(
  () =>
    Boolean(selectedAsset.value && props.userId.trim()) &&
    selectedAsset.value?.assetType !== 'Extension' &&
    !detailLoading.value &&
    !detailError.value &&
    (!transportIsHttp || Boolean(detailComponent.value)),
);
const canEditDetail = computed(() => {
  if (!detailPermissionsReady.value) return false;
  const permission = detailComponent.value?.canEdit;
  // An explicit detail denial (including null) must not fall back to list permission.
  return (permission === undefined ? selectedAsset.value?.canEdit : permission) === true;
});
const detailDim = computed(
  () =>
    firstNonBlankText([
      detailComponent.value?.category,
      selectedAsset.value?.category,
      selectedAsset.value?.dimName,
      selectedAsset.value?.productName,
      selectedAsset.value?.departmentName,
    ]) || '—',
);
const detailDimLabel = computed(() => {
  const dimType = firstNonBlankText([
    selectedAsset.value?.dimType,
    detailComponent.value?.category?.split('/')[0],
    selectedAsset.value?.category?.split('/')[0],
  ]);
  if (dimType === '产品级') return '归属产品';
  if (dimType === '部门级') return '归属部门';
  return '归属范围';
});
const extensionDim = computed(
  () =>
    firstNonBlankText([
      selectedAsset.value?.dimName,
      selectedAsset.value?.productName,
      detailComponent.value?.category?.split('/').slice(1).join('/'),
      selectedAsset.value?.category?.split('/').slice(1).join('/'),
      selectedAsset.value?.departmentName,
    ]) || '—',
);
const extensionSourceScene = computed(
  () =>
    firstNonBlankText([
      detailComponent.value?.secondScene,
      selectedAsset.value?.secondScene,
      detailComponent.value?.firstScene,
      selectedAsset.value?.firstScene,
    ]) || '—',
);
const selectedVersionDetail = computed(() => {
  const version = normalizeHarnessAssetVersion(selectedVersion.value);
  const versionDetails =
    detailComponent.value?.versions ?? selectedAsset.value?.versionDetails ?? [];
  return versionDetails.find((item) => normalizeHarnessAssetVersion(item.version) === version);
});
const selectedVersionUploadedAt = computed(() => {
  return formatCompactDateTime(selectedVersionDetail.value?.uploadedAt);
});
const selectedVersionPublisher = computed(
  () => firstNonBlankText([selectedAsset.value?.publisher]) || '—',
);
function detailVersionStatus(versionValue: string): string {
  const asset = selectedAsset.value;
  if (!asset) return '';
  const version = normalizeHarnessAssetVersion(versionValue);
  const status = asset.versionDetails?.find(
    (item) => normalizeHarnessAssetVersion(item.version) === version,
  )?.status;
  if (status) return status;
  return statusLabel(asset);
}
const detailVersionStatuses = computed<Record<string, string>>(() =>
  Object.fromEntries(
    detailVersions.value.map((version) => [version, detailVersionStatus(version)]),
  ),
);
const selectedVersionStatus = computed(() => detailVersionStatus(selectedVersion.value));
const selectedVersionReleaseType = computed(() => {
  if (selectedAsset.value?.assetType !== 'Extension') return '';
  if (
    normalizeHarnessAssetVersion(detail.value?.version ?? '') !==
    normalizeHarnessAssetVersion(selectedVersion.value)
  ) {
    return '';
  }
  return detail.value?.releaseType?.trim() ?? '';
});
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

function canAccessAsset(asset: HarnessAsset): boolean {
  return asset.canEdit === true;
}

function canViewAssetHistory(asset: HarnessAsset): boolean {
  return ['待发布', '可发布', '已发布', '发布中'].includes(statusLabel(asset));
}

function detailPersonLabel(field: HarnessAssetPersonField): string {
  const component = detailComponent.value;
  const fallback = selectedAsset.value?.[field] || '—';
  if (!component) return fallback;
  const name = field === 'owner' ? component.ownerName : component.developerName;
  const id = field === 'owner' ? component.ownerId : component.developerId;
  return name && id ? `${name}（${id}）` : name || id || fallback;
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

function toggleCardMenu(asset: HarnessAsset): void {
  const key = assetKey(asset);
  cardMenuKey.value = cardMenuKey.value === key ? '' : key;
}

function closeCardMenu(): void {
  cardMenuKey.value = '';
}

function handleCardMenuPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.asset-card__more, .asset-card__menu')) return;
  closeCardMenu();
}

function handleCardMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeCardMenu();
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
  closeCardMenu();
  cancelDetailEdit();
  detailSequence += 1;
  extensionHistorySequence += 1;
  extensionHistoryLoading.value = false;
  extensionHistoryError.value = '';
  extensionHistoryContext.value = null;
  selectedAssetKey.value = `${asset.assetType}:${asset.id}`;
  selectedVersion.value = transportIsHttp ? '' : asset.currentVersion || asset.versions[0] || '';
  detailTab.value = 'content';
  detail.value = null;
  detailLoading.value = false;
  detailError.value = '';
  view.value = 'detail';
  await loadDetail();
}

async function editCardAsset(asset: HarnessAsset): Promise<void> {
  closeCardMenu();
  if (!canAccessAsset(asset)) {
    showToast('当前用户没有编辑权限');
    return;
  }
  cancelDetailEdit();
  detailSequence += 1;
  selectedAssetKey.value = `${asset.assetType}:${asset.id}`;
  selectedVersion.value = transportIsHttp ? '' : asset.currentVersion || asset.versions[0] || '';
  detail.value = null;
  detailLoading.value = false;
  detailError.value = '';
  await loadDetail();
  if (detailError.value) {
    showToast(detailError.value);
    return;
  }
  if (!canEditDetail.value) {
    showToast('当前用户没有编辑权限');
    return;
  }
  beginDetailEdit();
}

function deleteCardAsset(asset: HarnessAsset): void {
  closeCardMenu();
  if (!canAccessAsset(asset)) {
    showToast('当前用户没有删除权限');
    return;
  }
  deleteTarget.value = {
    asset: { ...asset },
    userId: props.userId,
  };
}

function openAtomicPublish(asset: HarnessAsset): void {
  closeCardMenu();
  if (asset.assetType === 'Extension' || asset.canPublish !== true) return;
  try {
    atomicAssetApiType(asset);
  } catch (error) {
    showToast(errorMessage(error, '资产类型无效，请刷新列表后重试'));
    return;
  }
  selectedAssetKey.value = assetKey(asset);
  // 发布页使用用户点击时 components/query 返回的卡片快照，避免列表刷新或详情
  // 请求覆盖发布身份。name / assetType / latestVersion / dim* 均由该记录透传。
  atomicPublishAsset.value = {
    ...asset,
    name: asset.name,
    assetType: asset.assetType,
    type: asset.type,
    latestVersion: asset.latestVersion,
    dimType: asset.dimType,
    dimCode: asset.dimCode,
    dimName: asset.dimName,
  };
  view.value = 'publish';
}

async function returnFromAtomicPublish(): Promise<void> {
  atomicPublishAsset.value = null;
  view.value = 'list';
  await nextTick();
  resetAssetScrollPosition();
  if (assetsNeedRefresh.value) {
    assetsNeedRefresh.value = false;
    await reloadAssets();
  }
}

function onAtomicPublished(): void {
  assetsNeedRefresh.value = true;
}

async function returnToAssetList(): Promise<void> {
  if (detailSaving.value) return;
  cancelDetailEdit();
  detailSequence += 1;
  view.value = 'list';
  await nextTick();
  resetAssetScrollPosition();
  if (assetsNeedRefresh.value) await reloadAssets();
}

async function changeDetailVersion(): Promise<void> {
  if (detail.value?.component && selectedAsset.value?.assetType !== 'Extension') return;
  await loadDetail();
}

function assetPersonName(value: string | undefined, placeholder = '未指定'): string {
  const person = value?.trim() ?? '';
  if (!person) return placeholder;
  return person;
}

function assetPublisher(asset: HarnessAsset): string {
  return asset.publisher?.trim() ?? '';
}

function assetScopeLabel(asset: HarnessAsset): string {
  return asset.productName || asset.dimName || asset.departmentName || '未指定范围';
}

async function openExtensionRelease(
  asset: HarnessAsset,
  mode: 'publish' | 'history',
): Promise<void> {
  closeCardMenu();
  const scope = currentScope.value;
  if (!scope || asset.assetType !== 'Extension' || extensionReleaseLoading.value) return;
  if (mode === 'publish' && asset.canPublish === false) {
    showToast('当前用户没有发布权限');
    return;
  }
  const sequence = ++extensionReleaseSequence;
  const currentListSequence = listSequence.value;
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
      currentListSequence !== listSequence.value ||
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

function openExtensionHistoryTab(): void {
  detailTab.value = 'history';
  void loadExtensionHistory();
}

async function loadExtensionHistory(): Promise<void> {
  const asset = selectedAsset.value;
  const scope = currentScope.value;
  if (!scope || !asset || asset.assetType !== 'Extension' || extensionHistoryLoading.value) return;
  const sequence = ++extensionHistorySequence;
  const requestedAssetKey = selectedAssetKey.value;
  extensionHistoryError.value = '';
  extensionHistoryLoading.value = true;
  try {
    const context = await api.queryExtensionReleaseContext(scope, asset, 'history');
    if (
      sequence !== extensionHistorySequence ||
      view.value !== 'detail' ||
      detailTab.value !== 'history' ||
      selectedAssetKey.value !== requestedAssetKey
    )
      return;
    extensionHistoryContext.value = context;
  } catch (error) {
    if (sequence === extensionHistorySequence)
      extensionHistoryError.value = errorMessage(error, '发布历史加载失败');
  } finally {
    if (sequence === extensionHistorySequence) extensionHistoryLoading.value = false;
  }
}

async function onExtensionReleased(): Promise<void> {
  if (transportIsHttp && extensionRelease.value?.mode === 'publish') {
    extensionReturnView.value = 'list';
  }
  if (view.value === 'detail') {
    assetsNeedRefresh.value = true;
    return;
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

function statusClassForLabel(status: string): string {
  if (status === '已发布') return 'is-success';
  if (status === '待发布' || status === '可发布') return 'is-warning';
  return 'is-info';
}

function statusClass(asset: HarnessAsset): string {
  return statusClassForLabel(statusLabel(asset));
}

function openCurrentCatalogCreate(): void {
  const assetType = selectedCatalogType.value;
  if (!assetType) return;
  createScope.value = rememberedCatalogScope(assetType, 'create');
  createAssetType.value = assetType;
}

function currentTransferScope(): HarnessScopeSnapshot {
  const departmentPath = defaultCatalogDepartmentPath.value;
  const product =
    selectedDepartment.value?.path.join('\u0001') === departmentPath.join('\u0001')
      ? selectedProduct.value
      : null;
  return {
    level: selectedProduct.value ? '产品级' : '部门级',
    departmentPath: [...departmentPath],
    offeringId: product?.id ?? '',
    offeringName: product?.name ?? '',
  };
}

function cloneScopeSnapshot(snapshot: HarnessScopeSnapshot): HarnessScopeSnapshot {
  return {
    ...snapshot,
    departmentPath: [...snapshot.departmentPath],
  };
}

function scopeDepartmentExists(path: string[]): boolean {
  let nodes = manageableDepartmentTree.value;
  for (const segment of path) {
    const node = nodes.find((item) => item.name === segment);
    if (!node) return false;
    nodes = node.children ?? [];
  }
  return path.length > 0;
}

function rememberedCatalogScope(
  assetType: HarnessCatalogAssetType,
  action: HarnessCatalogAction,
): HarnessScopeSnapshot | undefined {
  const remembered = props.scopeSnapshots[assetType]?.[action];
  return remembered && scopeDepartmentExists(remembered.departmentPath)
    ? cloneScopeSnapshot(remembered)
    : undefined;
}

function rememberCatalogScope(
  assetType: HarnessCatalogAssetType,
  action: HarnessCatalogAction,
  snapshot: HarnessScopeSnapshot,
): void {
  emit('scope-change', {
    assetType,
    action,
    snapshot: cloneScopeSnapshot(snapshot),
  });
}

function openCatalogTransfer(action: 'import' | 'export'): void {
  const assetType = selectedCatalogType.value;
  if (!assetType) return;
  const scope = rememberedCatalogScope(assetType, action) ?? currentTransferScope();
  if (action === 'import') {
    importScope.value = scope;
    importAssetType.value = assetType;
    return;
  }
  exportScope.value = scope;
  exportAssetType.value = assetType;
}

async function onAssetCreated(): Promise<void> {
  await reloadAssets();
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleCardMenuPointerDown);
  document.addEventListener('keydown', handleCardMenuKeydown);
  await initializeList();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleCardMenuPointerDown);
  document.removeEventListener('keydown', handleCardMenuKeydown);
  disposeList();
  detailSequence += 1;
  extensionReleaseSequence += 1;
  extensionHistorySequence += 1;
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
    <HarnessAssetEditDialog
      v-if="detailDraft && selectedAsset && selectedAsset.assetType !== 'Extension'"
      :asset-type="selectedAsset.assetType"
      :name="detailDraft.name"
      :description="detailDraft.description"
      :people="detailDraft.people"
      :planned-complete-date="detailDraft.plannedCompleteDate"
      :submitting="detailSaving"
      :error="detailEditError"
      :required-name-prefix="detailRequiredNamePrefix"
      @update:name="detailDraft.name = $event"
      @update:description="detailDraft.description = $event"
      @update:planned-complete-date="detailDraft.plannedCompleteDate = $event"
      @update-person="changeDraftPerson"
      @close="cancelDetailEdit"
      @save="saveDetailEdits"
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
      @scope-change="rememberCatalogScope(importAssetType, 'import', $event)"
    />
    <HarnessCatalogExportDialog
      v-if="exportAssetType"
      :asset-type="exportAssetType"
      :user-id="props.userId"
      :department-tree="manageableDepartmentTree"
      :initial-scope="exportScope"
      :allowed-department-paths="normalizedAllowedPaths"
      :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
      @close="exportAssetType = null"
      @scope-change="rememberCatalogScope(exportAssetType, 'export', $event)"
    />
    <SkillMasterManagementPanel
      v-if="createAssetType === 'Skill'"
      create-only
      :user-id="props.userId"
      :department-tree="manageableDepartmentTree"
      :current-user-department-path="props.currentUserDepartmentPath"
      :allowed-department-paths="normalizedAllowedPaths"
      :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
      :initial-scope="createScope"
      @close="createAssetType = null"
      @created="onAssetCreated"
      @scope-change="rememberCatalogScope('Skill', 'create', $event)"
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
      :initial-scope="createScope"
      :allowed-department-paths="normalizedAllowedPaths"
      @close="createAssetType = null"
      @created="onAssetCreated"
      @scope-change="rememberCatalogScope(createAssetType, 'create', $event)"
    />
    <template v-if="view === 'list'">
      <header class="asset-page__header harness-page-heading">
        <div>
          <h1 ref="assetListHeading" class="harness-page-title" tabindex="-1">资产清单</h1>
          <p class="harness-page-description">
            集中浏览 Agent、Skill、Command 和 Extension，查看版本内容与 Skill 质量报告。
          </p>
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

      <div class="asset-toolbar">
        <nav class="asset-filters" aria-label="资产类型">
          <button
            v-for="item in TYPE_FILTERS"
            :key="item.key"
            type="button"
            :class="{ 'is-active': filter === item.key }"
            :aria-pressed="filter === item.key"
            @click="selectFilter(item.key)"
          >
            <span
              class="asset-filter__dot"
              :class="`is-${item.key.toLocaleLowerCase()}`"
              aria-hidden="true"
            />
            {{ item.label }}
          </button>
        </nav>

        <label class="asset-search">
          <span class="asset-search__icon" aria-hidden="true" />
          <input
            :value="assetSearchQuery"
            type="search"
            aria-label="搜索资产"
            placeholder="搜索名称 / 描述 / 责任人…"
            @input="scheduleAssetSearch"
          />
        </label>

        <div class="asset-page__actions">
          <button
            type="button"
            class="asset-button is-secondary"
            :disabled="!selectedCatalogType"
            :title="
              selectedCatalogType
                ? `新增 ${selectedCatalogType}`
                : 'Extension 由场景及绑定能力自动生成'
            "
            @click="openCurrentCatalogCreate"
          >
            ＋ 新增
          </button>
          <button
            type="button"
            class="asset-button is-secondary"
            :disabled="!selectedCatalogType"
            :title="selectedCatalogType ? `导入 ${selectedCatalogType}` : 'Extension 不支持导入'"
            @click="openCatalogTransfer('import')"
          >
            导入
          </button>
          <button
            type="button"
            class="asset-button is-secondary"
            :disabled="!selectedCatalogType"
            :title="selectedCatalogType ? `导出 ${selectedCatalogType}` : 'Extension 不支持导出'"
            @click="openCatalogTransfer('export')"
          >
            导出
          </button>
        </div>
      </div>

      <div class="asset-subbar">
        <nav class="asset-status-filters" aria-label="资产状态">
          <button
            v-for="item in filter === 'Extension' ? STATUS_FILTERS.slice(-1) : STATUS_FILTERS"
            :key="item.key"
            type="button"
            :class="{ 'is-active': assetStatusFilter === item.key }"
            :aria-pressed="assetStatusFilter === item.key"
            @click="selectStatusFilter(item.key)"
          >
            {{ item.label }}
          </button>
        </nav>
        <span class="asset-result-count">
          共 {{ transportIsHttp ? assetTotal : filteredAssets.length }} 个资产
        </span>
      </div>

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
            :class="{ 'is-menu-open': cardMenuKey === assetKey(asset) }"
            role="button"
            :tabindex="0"
            @click="openDetail(asset)"
            @keydown.enter.self.prevent="openDetail(asset)"
            @keydown.space.self.prevent="openDetail(asset)"
          >
            <div class="asset-card__head">
              <span
                class="asset-card__icon"
                :class="`is-${asset.assetType.toLocaleLowerCase()}`"
                aria-hidden="true"
              >
                {{ asset.assetType.charAt(0) }}
              </span>
              <div class="asset-card__title">
                <h2 :title="asset.name">{{ asset.name }}</h2>
                <span class="asset-badge is-type">{{ asset.assetType }}</span>
              </div>
              <div class="asset-card__meta">
                <span v-if="statusLabel(asset)" class="asset-badge" :class="statusClass(asset)">
                  {{ statusLabel(asset) }}
                </span>
              </div>
            </div>
            <p :title="asset.description || '暂无描述'">{{ asset.description || '暂无描述' }}</p>
            <div class="asset-card__footer">
              <span
                v-if="asset.assetType === 'Extension'"
                class="asset-card__publisher"
                :title="assetPersonName(assetPublisher(asset), '未指定发布人')"
              >
                {{ assetPersonName(assetPublisher(asset)) }}
              </span>
              <span
                v-else
                class="asset-card__developer"
                :title="assetPersonName(asset.developer, '未指定开发责任人')"
              >
                {{ assetPersonName(asset.developer) }}
              </span>
              <span class="asset-card__scope" :title="assetScopeLabel(asset)">
                {{ assetScopeLabel(asset) }}
              </span>
              <span v-if="asset.currentVersion" class="asset-card__version">
                v{{ asset.currentVersion }}
              </span>
              <button
                type="button"
                class="asset-card__more"
                :aria-label="`更多操作：${asset.name}`"
                :aria-expanded="cardMenuKey === assetKey(asset)"
                aria-haspopup="menu"
                @click.stop="toggleCardMenu(asset)"
              >
                <span aria-hidden="true">…</span>
              </button>
            </div>
            <div
              v-if="cardMenuKey === assetKey(asset)"
              class="asset-card__menu"
              role="menu"
              :aria-label="`${asset.name} 操作`"
              @click.stop
            >
              <button type="button" role="menuitem" @click="openDetail(asset)">查看详情</button>
              <button
                v-if="asset.assetType !== 'Extension' && canAccessAsset(asset)"
                type="button"
                role="menuitem"
                @click="editCardAsset(asset)"
              >
                编辑信息
              </button>
              <button
                v-if="asset.assetType !== 'Extension' && asset.canPublish === true"
                type="button"
                role="menuitem"
                @click="openAtomicPublish(asset)"
              >
                发布
              </button>
              <button
                v-if="asset.assetType !== 'Extension' && canAccessAsset(asset)"
                type="button"
                class="is-danger"
                role="menuitem"
                @click="deleteCardAsset(asset)"
              >
                删除
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
        <button
          type="button"
          class="asset-back asset-detail-back"
          :disabled="detailSaving"
          @click="returnToAssetList"
        >
          <span aria-hidden="true">←</span> 返回列表
        </button>
        <div v-if="selectedAsset.assetType !== 'Extension'" class="asset-detail-toolbar__actions">
          <button
            v-if="false"
            type="button"
            class="asset-button is-primary asset-detail__edit"
            :disabled="detailSaving || !canEditDetail"
            :title="detailPermissionsReady && !canEditDetail ? '当前用户没有编辑权限' : undefined"
            @click="beginDetailEdit"
          >
            编辑
          </button>
          <button
            v-if="false"
            type="button"
            class="asset-delete-button"
            aria-label="删除资产"
            :disabled="!canEditDetail || detailSaving || Boolean(detailDraft)"
            :title="detailPermissionsReady && !canEditDetail ? '当前用户没有删除权限' : undefined"
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
      </div>

      <section class="asset-board asset-detail" aria-labelledby="asset-detail-title">
        <header class="asset-detail__header asset-detail__hero">
          <span
            class="asset-detail__type-icon"
            :class="`is-${selectedAsset.assetType.toLocaleLowerCase()}`"
            aria-hidden="true"
          >
            {{ selectedAsset.assetType.charAt(0) }}
          </span>
          <div class="asset-detail__identity">
            <div class="asset-detail__title">
              <h1 id="asset-detail-title">
                {{ detailComponent?.name ?? selectedAsset.name }}
              </h1>
              <div class="asset-detail__badges">
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
                <div class="asset-detail__summary-field is-description">
                  <dt>描述</dt>
                  <dd class="asset-detail__description" :title="detailDescription">
                    {{ detailDescription }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <div v-if="selectedAsset.assetType !== 'Extension'" class="asset-detail__facts">
          <dl class="asset-detail__people">
            <div
              v-for="{ field, label } in PERSON_FIELDS"
              :key="field"
              class="asset-detail__person asset-detail__fact"
            >
              <dt>{{ label }}</dt>
              <dd>{{ detailPersonLabel(field) }}</dd>
            </div>
          </dl>
          <dl class="asset-detail__scope">
            <div class="asset-detail__fact">
              <dt>{{ detailDimLabel }}</dt>
              <dd :title="detailDim">{{ detailDim }}</dd>
            </div>
          </dl>
          <dl
            v-if="detailComponent?.firstScene || detailComponent?.secondScene"
            class="asset-detail__scope"
          >
            <div class="asset-detail__fact">
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
        </div>

        <div
          v-if="selectedAsset.assetType === 'Extension'"
          class="asset-detail__facts is-extension"
        >
          <dl class="asset-detail__people">
            <div class="asset-detail__person asset-detail__fact">
              <dt>发布人</dt>
              <dd>{{ selectedVersionPublisher }}</dd>
            </div>
          </dl>
          <dl class="asset-detail__scope">
            <div class="asset-detail__fact">
              <dt>{{ detailDimLabel }}</dt>
              <dd :title="extensionDim">{{ extensionDim }}</dd>
            </div>
          </dl>
          <dl class="asset-detail__scope">
            <div class="asset-detail__fact">
              <dt>来源场景</dt>
              <dd :title="extensionSourceScene">{{ extensionSourceScene }}</dd>
            </div>
          </dl>
        </div>

        <nav
          class="asset-subtabs asset-detail__tabs"
          :class="{ 'has-version-panel': !isHistoryTab }"
          :role="selectedAsset.assetType === 'Extension' ? undefined : 'tablist'"
          aria-label="资产详情分区"
        >
          <button
            id="asset-detail-tab-content"
            type="button"
            :role="selectedAsset.assetType === 'Extension' ? undefined : 'tab'"
            :class="{ 'is-active': detailTab === 'content' }"
            :aria-selected="
              selectedAsset.assetType === 'Extension' ? undefined : detailTab === 'content'
            "
            :aria-controls="catalogDetailRecord ? 'catalog-detail-panel-detail' : undefined"
            @click="detailTab = 'content'"
          >
            {{ selectedAsset.assetType === 'Extension' ? '版本内容' : '内容' }}
          </button>
          <button
            v-if="selectedAsset.assetType === 'Extension' && canViewAssetHistory(selectedAsset)"
            id="asset-detail-tab-history"
            type="button"
            :class="{ 'is-active': detailTab === 'history' }"
            :disabled="extensionHistoryLoading"
            @click="openExtensionHistoryTab"
          >
            发布记录
          </button>
          <button
            v-if="selectedAsset.assetType !== 'Extension'"
            id="asset-detail-tab-history"
            type="button"
            role="tab"
            :class="{ 'is-active': detailTab === 'history' }"
            :aria-selected="detailTab === 'history'"
            aria-controls="atomic-asset-history-panel"
            @click="detailTab = 'history'"
          >
            发布记录
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
            评估报告
          </button>
        </nav>

        <div class="asset-detail__content-scroll">
          <section
            v-if="!isHistoryTab"
            class="asset-detail__version-panel"
            :class="{ 'is-extension': selectedAsset.assetType === 'Extension' }"
            aria-label="版本信息"
          >
            <div class="asset-detail__version-row">
              <span v-if="selectedVersionReleaseType" class="asset-detail__release-type">
                {{ selectedVersionReleaseType }}
              </span>
              <span class="asset-detail__version-label">版本</span>
              <HarnessVersionPicker
                v-model="selectedVersion"
                :versions="detailVersions"
                :statuses="detailVersionStatuses"
                :disabled="detailLoading || detailSaving"
                @change="changeDetailVersion"
              />
            </div>
            <p v-if="selectedAsset.assetType === 'Extension'" class="asset-detail__hint">
              Extension
              由场景编排生成并发布，新版本发布请前往工作流页面的对应场景操作；本页面仅展示已发布的产物。
            </p>
            <div class="asset-detail__version-meta">
              <span
                v-if="selectedVersionStatus"
                class="asset-badge"
                :class="statusClassForLabel(selectedVersionStatus)"
              >
                {{ selectedVersionStatus }}
              </span>
              <span class="asset-detail__uploaded-at">
                上传时间：<strong>{{ selectedVersionUploadedAt }}</strong>
              </span>
            </div>
          </section>

          <div v-if="extensionHasNoVersion" class="asset-empty" role="status">
            暂无版本，当前无法查看详情
          </div>
          <template v-else-if="isExtensionHistoryTab">
            <div v-if="extensionHistoryLoading" class="asset-empty" role="status">
              正在加载发布历史…
            </div>
            <div
              v-else-if="extensionHistoryError"
              class="asset-empty asset-empty--error"
              role="alert"
            >
              <span>{{ extensionHistoryError }}</span>
              <button type="button" class="asset-button is-secondary" @click="loadExtensionHistory">
                重新加载
              </button>
            </div>
            <ExtensionPublishPage
              v-else-if="extensionHistoryContext"
              :release-context="extensionHistoryContext"
              :initial-panel="'history'"
              :release-chrome="false"
              :user-id="props.userId"
              :user-name="props.userName"
              @close="detailTab = 'content'"
              @released="onExtensionReleased"
              @notify="showToast"
            />
            <div v-else class="asset-empty">
              <span>发布记录暂未加载</span>
              <button type="button" class="asset-button is-secondary" @click="loadExtensionHistory">
                重新加载
              </button>
            </div>
          </template>
          <AtomicAssetPublishPage
            v-else-if="isAtomicHistoryTab"
            id="atomic-asset-history-panel"
            :asset="selectedAsset"
            :user-id="props.userId"
            :user-name="props.userName"
            initial-panel="history"
            :release-chrome="false"
            @close="detailTab = 'content'"
            @notify="showToast"
            @published="onAtomicPublished"
          />
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
            :user-id="props.userId"
            :capabilities="detail.capabilities"
          />
          <div v-else class="asset-file-tree">
            <strong>📁 {{ selectedAsset.name }}/</strong>
            <div v-if="detail?.files.length" class="asset-file-tree__branch">
              <template
                v-for="file in detail.files"
                :key="`${file.category || 'root'}:${file.path}`"
              >
                <span>📄 {{ file.path }}</span>
                <pre>{{ file.content || '暂无文件内容' }}</pre>
              </template>
            </div>
            <div v-else class="asset-empty">该版本暂无文件</div>
          </div>
        </div>
      </section>
    </template>

    <AtomicAssetPublishPage
      v-else-if="view === 'publish' && atomicPublishAsset"
      :asset="atomicPublishAsset"
      :user-id="props.userId"
      :user-name="props.userName"
      @close="returnFromAtomicPublish"
      @notify="showToast"
      @published="onAtomicPublished"
    />

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

.asset-page__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.asset-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #dde1ea;
  border-radius: 8px;
  background: #fff;
  color: #3c4457;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
}

.asset-button.is-primary {
  border-color: #2456e6;
  background: #2456e6;
  color: #fff;
}

.asset-button.is-primary:hover {
  background: #1d48c7;
}

.asset-button.is-secondary {
  border-color: #dde1ea;
  background: #fff;
  color: #3c4457;
}

.asset-button.is-secondary:hover {
  border-color: #b9c2d4;
  background: #f7f8fb;
}

.asset-button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.asset-scope {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 0;
  border: 0;
  background: transparent;
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

.asset-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.asset-filters {
  display: flex;
  flex: 0 0 auto;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  background: #e9ecf3;
}

.asset-filters button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 18px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #5a6478;
  font-size: 13.5px;
  font-weight: 400;
  cursor: pointer;
}

.asset-filters button:hover {
  color: #1f2329;
}

.asset-filters button.is-active {
  background: #fff;
  color: #1f2329;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.asset-filter__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.asset-filter__dot.is-agent {
  background: #7c5cf0;
}

.asset-filter__dot.is-skill {
  background: #2f7df6;
}

.asset-filter__dot.is-command {
  background: #18a66a;
}

.asset-filter__dot.is-extension {
  background: #f0732c;
}

.asset-search {
  position: relative;
  display: flex;
  flex: 1 1 260px;
  max-width: 420px;
  min-width: 220px;
}

.asset-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 34px;
  border: 1px solid #dde1ea;
  border-radius: 9px;
  outline: none;
  background: #fff;
  color: #1f2329;
  font: inherit;
  font-size: 13.5px;
}

.asset-search input:focus {
  border-color: #2456e6;
  box-shadow: 0 0 0 3px rgba(36, 86, 230, 0.1);
}

.asset-search__icon {
  position: absolute;
  top: 11px;
  left: 12px;
  z-index: 1;
  width: 12px;
  height: 12px;
  border: 1.5px solid #a6aebf;
  border-radius: 50%;
  pointer-events: none;
}

.asset-search__icon::after {
  content: '';
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 5px;
  height: 1.5px;
  border-radius: 999px;
  background: #a6aebf;
  transform: rotate(45deg);
  transform-origin: left center;
}

.asset-subbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-bottom: 16px;
}

.asset-status-filters {
  display: flex;
  gap: 6px;
}

.asset-status-filters button {
  min-height: 28px;
  padding: 5px 13px;
  border: 1px solid #dde1ea;
  border-radius: 16px;
  background: #fff;
  color: #5a6478;
  font-size: 12.5px;
  cursor: pointer;
}

.asset-status-filters button:hover {
  border-color: #b9c2d4;
}

.asset-status-filters button.is-active {
  border-color: #1f2329;
  background: #1f2329;
  color: #fff;
}

.asset-result-count {
  color: #8a93a6;
  font-size: 12.5px;
}

.asset-board {
  box-sizing: border-box;
  padding: 0;
  margin-bottom: 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
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
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  gap: 14px;
  align-items: stretch;
}

.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  min-width: 0;
  min-height: 168px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.asset-card:hover,
.asset-card:focus-visible {
  border-color: #c3d2f7;
  outline: none;
  box-shadow: 0 6px 18px rgba(31, 58, 138, 0.09);
  transform: translateY(-2px);
}

.asset-card.is-menu-open {
  z-index: 2;
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

.asset-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.asset-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 10px;
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: 700;
}

.asset-card__icon.is-agent {
  background: linear-gradient(135deg, #7c5cf0, #9d7bfa);
}

.asset-card__icon.is-skill {
  background: linear-gradient(135deg, #2f7df6, #5fa2ff);
}

.asset-card__icon.is-command {
  background: linear-gradient(135deg, #18a66a, #3fc88e);
}

.asset-card__icon.is-extension {
  background: linear-gradient(135deg, #f0732c, #ffa25c);
}

.asset-card__title {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}

.asset-card h2 {
  min-width: 0;
  margin: 0;
  color: #1f2329;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.45;
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
  height: 40px;
  max-height: 40px;
  margin: 0;
  overflow: hidden;
  color: #5a6478;
  font-size: 12.8px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.asset-card__meta {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-left: auto;
}

.asset-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #f0f2f7;
  color: #6b7488;
  font-size: 12px;
}

.asset-card__developer,
.asset-card__publisher,
.asset-card__scope,
.asset-card__version {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}

.asset-card__scope {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-card__version {
  flex: 0 0 auto;
  color: #8a93a6;
}

.asset-card__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  margin: -4px 0 -4px auto;
  padding: 0;
  border: 1px solid #d9deea;
  border-radius: 8px;
  background: #fff;
  color: #667085;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.asset-card__more:hover,
.asset-card__more[aria-expanded='true'] {
  border-color: #b9c8ee;
  background: #f6f8ff;
  color: #245eea;
}

.asset-card__more:focus-visible {
  outline: 2px solid rgba(47, 105, 255, 0.25);
  outline-offset: 2px;
}

.asset-card__menu {
  position: absolute;
  z-index: 10;
  right: 12px;
  top: 58px;
  display: grid;
  min-width: 154px;
  padding: 5px;
  border: 1px solid #e1e5ee;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(20, 32, 61, 0.16);
}

.asset-card__menu button {
  width: 100%;
  min-height: 36px;
  padding: 7px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #25324b;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.asset-card__menu button:hover,
.asset-card__menu button:focus-visible {
  outline: none;
  background: #f1f4fa;
}

.asset-card__menu button:disabled {
  background: #e5e7eb;
  color: #adb4c2;
  cursor: not-allowed;
}

.asset-card__menu button.is-danger {
  margin-top: 3px;
  border-top: 1px solid #f0f2f7;
  border-radius: 0 0 7px 7px;
  color: #ef4444;
}

.asset-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
}

.asset-card .asset-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  height: auto;
  min-height: 20px;
  padding: 2px 9px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.asset-card__title .asset-badge.is-type {
  width: auto;
  min-height: 18px;
  margin-top: 2px;
  padding: 1px 7px;
  border-radius: 5px;
  background: #f2f4f9;
  color: #5a6478;
  font-size: 10.5px;
}

.asset-badge.is-type {
  background: #dbeafe;
  color: #0c2d6b;
}

.asset-badge.is-info {
  background: #f2f4f9;
  color: #5a6478;
}

.asset-badge.is-success {
  background: #e6f7ef;
  color: #149455;
}

.asset-badge.is-warning {
  background: #fff2e3;
  color: #c76a10;
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

.asset-detail-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
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
.asset-delete-button:hover:not(:disabled) {
  background: #fef3f2;
}

.asset-delete-button:disabled {
  border-color: #d1d5db;
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}

.asset-detail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 24px;
  padding-bottom: 0;
  border: 1px solid #eef0f3;
  border-radius: 10px;
  background: #fff;
}

.asset-page > .asset-detail {
  overflow: hidden;
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

.asset-detail__header.asset-detail__hero {
  justify-content: flex-start;
  gap: 14px;
  padding-bottom: 0;
  border-bottom: 0;
}

.asset-detail__type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border-radius: 10px;
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 700;
}

.asset-detail__type-icon.is-agent {
  background: linear-gradient(135deg, #7c5cf0, #9d7bfa);
}

.asset-detail__type-icon.is-skill {
  background: linear-gradient(135deg, #2f7df6, #5fa2ff);
}

.asset-detail__type-icon.is-command {
  background: linear-gradient(135deg, #18a66a, #3fc88e);
}

.asset-detail__type-icon.is-extension {
  background: linear-gradient(135deg, #f0732c, #ffa25c);
}

.asset-detail__identity {
  flex: 1 1 280px;
  min-width: 0;
}

.asset-detail__title,
.asset-detail__badges,
.asset-detail__meta {
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

.asset-detail__hero .asset-detail__title h1 {
  font-size: 20px;
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

.asset-detail__summary-field.is-description {
  flex: 1;
}

.asset-detail__description {
  flex: 1;
  overflow: visible;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
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

.asset-detail__facts {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0 0;
}

.asset-detail__people,
.asset-detail__scope {
  display: flex;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
  margin: 0;
  padding: 0;
}

.asset-detail__fact {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 97px;
  min-height: 58px;
  max-width: 238px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  text-align: center;
}

.asset-detail__person {
  font-size: 12px;
  line-height: 17px;
}

.asset-detail__fact dt {
  order: 2;
  margin-top: 2px;
  color: #667085;
  font-size: 10px;
  font-weight: 400;
  line-height: 14px;
}

.asset-detail__fact dd {
  order: 1;
  min-width: 0;
  margin: 0;
  color: #1f2329;
  font-size: 12px;
  font-weight: 700;
  line-height: 17px;
  overflow-wrap: anywhere;
}

.asset-detail__scope .asset-detail__fact {
  min-width: 133px;
}

.asset-detail__scope .asset-detail__fact dd {
  font-size: 11.5px;
}

.asset-detail-back:focus-visible,
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

.asset-detail .asset-detail__tabs.has-version-panel {
  margin-bottom: 0;
}

.asset-detail__content-scroll {
  min-height: 0;
  flex: 1 1 auto;
  margin: 0;
  padding: 0 0 24px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.asset-detail__content-scroll::-webkit-scrollbar {
  width: 9px;
}

.asset-detail__content-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.asset-detail__content-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #cbd5e1;
  background-clip: padding-box;
}

.asset-detail__content-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
  background-clip: padding-box;
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

.asset-detail__version-panel {
  box-sizing: border-box;
  margin: 0 0 18px;
  padding: 16px 24px 18px;
  background: #f3f6fb;
}

.asset-detail__version-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.asset-detail__version-label {
  flex-shrink: 0;
  color: #5a6478;
  font-size: 13px;
  line-height: 20px;
}

.asset-detail__release-type {
  display: inline-flex;
  min-height: 24px;
  flex-shrink: 0;
  align-items: center;
  padding: 0 9px;
  border: 1px solid #c7d7f5;
  border-radius: 999px;
  background: #eef4ff;
  color: #315ea8;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
}

.asset-detail__version-row :deep(.harness-version-picker__trigger) {
  min-width: 200px;
  min-height: 40px;
  border-color: #d7dee9;
  border-radius: 10px;
  background: #fff;
}

.asset-detail__hint {
  box-sizing: border-box;
  margin: 0 0 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #eaf4ff;
  color: #0b63ce;
  font-size: 13px;
  line-height: 20px;
}

.asset-detail__version-meta {
  display: flex;
  align-items: center;
  gap: 18px;
  box-sizing: border-box;
  min-height: 54px;
  padding: 12px 18px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  color: #5a6478;
  font-size: 13px;
  line-height: 20px;
}

.asset-detail__uploaded-at strong {
  color: #1f2329;
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

.asset-button.asset-detail__edit:disabled {
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

  .asset-detail__facts,
  .asset-detail__people {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .asset-detail__people,
  .asset-detail__scope,
  .asset-detail__fact {
    width: 100%;
    max-width: none;
  }

  .asset-detail {
    padding: 18px 16px 0;
  }

  .asset-detail__content-scroll {
    padding-bottom: 18px;
  }

  .asset-detail__version-panel {
    padding-right: 16px;
    padding-left: 16px;
  }

  .asset-detail__version-row,
  .asset-detail__version-meta {
    align-items: stretch;
    flex-direction: column;
  }

  .asset-detail__version-row :deep(.harness-version-picker__trigger) {
    width: 100%;
    min-width: 0;
  }

  .asset-detail__title h1 {
    font-size: 20px;
  }

  .asset-page__header,
  .asset-scope,
  .asset-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .asset-page__actions {
    align-self: flex-start;
    margin-left: 0;
  }

  .asset-search {
    width: 100%;
    max-width: none;
  }

  .asset-subbar {
    align-items: flex-start;
    flex-direction: column;
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
.asset-toolbar,
.asset-subbar,
.asset-filters,
.asset-subtabs {
  flex-shrink: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .asset-board--catalog {
    padding: 0;
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

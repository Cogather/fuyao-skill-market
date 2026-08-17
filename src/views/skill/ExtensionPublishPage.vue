<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import MarketDeptCascader from '../../components/skill/MarketDeptCascader.vue';
import { getDepartmentNodeCode } from '../../services/skillMarket/marketDeptTreeFromApi';
import {
  publishHttpExtension,
  queryHttpExtensionBindings,
  queryHttpExtensionProducts,
  queryHttpExtensionScenes,
  queryHttpPlanningItemContent,
  queryHttpPlanningItemFiles,
  queryHttpPublishableOrganizations,
  retryHttpExtension,
  type ExtensionPublishChannel,
  type ExtensionScope,
  type PublishableOrganization,
} from '../../services/skillMarket/extensionPublishHttp';
import {
  MOCK_EXTENSION_PRODUCTS,
  createMockExtensionScenes,
  type ExtensionCapability,
  type ExtensionCapabilityType,
  type ExtensionProduct,
  type ExtensionRelease,
  type ExtensionReleaseItem,
  type ExtensionScene,
} from '../../services/skillMarket/extensionPublishMock';
import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';

type DepartmentTreeNode = {
  id?: string;
  deptCode?: string;
  name: string;
  levelNo?: number;
  children?: DepartmentTreeNode[];
};

type ExtensionFilterLevel = '产品级' | '部门级';
type ExtensionModal = 'publish' | 'history' | null;

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

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const scenes = ref<ExtensionScene[]>(transportIsHttp ? [] : createMockExtensionScenes());
const products = ref<ExtensionProduct[]>(transportIsHttp ? [] : MOCK_EXTENSION_PRODUCTS);
const filterLevelOptions: ExtensionFilterLevel[] = ['产品级'];
const organizations = ref<PublishableOrganization[]>(
  transportIsHttp
    ? []
    : [
        { id: 'org-fuyao', name: '扶摇组织', deptId: '', deptName: '' },
        { id: 'org-yunshan', name: '云山组织', deptId: '', deptName: '' },
        { id: 'org-haichuan', name: '海川组织', deptId: '', deptName: '' },
      ],
);
const extensionAssetBase = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}extension/`;
const extensionIconRevision = '20260814-1';
const capabilityTypeMeta: Record<ExtensionCapabilityType, { label: string; iconSrc: string }> = {
  skill: {
    label: 'Skill',
    iconSrc: `${extensionAssetBase}skillIcon.png?v=${extensionIconRevision}`,
  },
  command: {
    label: 'Command',
    iconSrc: `${extensionAssetBase}commandIcon.png?v=${extensionIconRevision}`,
  },
  agent: {
    label: 'Agent',
    iconSrc: `${extensionAssetBase}agentIcon.png?v=${extensionIconRevision}`,
  },
};

const capabilitySections: Array<{
  type: ExtensionCapabilityType;
  folder: string;
  label: string;
  iconSrc: string;
}> = [
  { type: 'skill', folder: 'skills', ...capabilityTypeMeta.skill },
  { type: 'command', folder: 'commands', ...capabilityTypeMeta.command },
  { type: 'agent', folder: 'agents', ...capabilityTypeMeta.agent },
];

function normalizedPath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function filterDepartmentTreeByPaths(
  nodes: DepartmentTreeNode[],
  allowedPaths: string[][],
  parentPath: string[] = [],
): DepartmentTreeNode[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    const relevant = allowedPaths.some(
      (allowedPath) => pathStartsWith(path, allowedPath) || pathStartsWith(allowedPath, path),
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

function productMatchesDepartment(product: ExtensionProduct, departmentPath: string[]): boolean {
  const normalizedDepartmentPath = normalizedPath(departmentPath);
  if (normalizedDepartmentPath.length === 0) return true;
  return (
    pathStartsWith(product.departmentPath, normalizedDepartmentPath) ||
    pathStartsWith(normalizedDepartmentPath, product.departmentPath)
  );
}

function resolveDefaultProduct(departmentPath: string[]): ExtensionProduct {
  const byCurrentDepartment = MOCK_EXTENSION_PRODUCTS.find((product) =>
    productMatchesDepartment(product, departmentPath),
  );
  return (
    byCurrentDepartment ??
    MOCK_EXTENSION_PRODUCTS[0] ?? {
      id: '',
      name: '',
      departmentPath: [],
    }
  );
}

function findDepartmentNode(path: string[]): DepartmentTreeNode | null {
  let nodes = selectableDepartmentTree.value;
  let current: DepartmentTreeNode | null = null;
  for (const segment of normalizedPath(path)) {
    current = nodes.find((node) => node.name === segment) ?? null;
    if (!current) return null;
    nodes = current.children ?? [];
  }
  return current;
}

const normalizedAllowedDepartmentPaths = computed(() =>
  props.allowedDepartmentPaths.map(normalizedPath).filter((path) => path.length > 0),
);
const selectableDepartmentTree = computed(() => {
  if (!props.restrictToAllowedDepartments || !normalizedAllowedDepartmentPaths.value.length) {
    return props.departmentTree;
  }
  return filterDepartmentTreeByPaths(props.departmentTree, normalizedAllowedDepartmentPaths.value);
});
const defaultDepartmentPath = computed(() => {
  const permissionDefault = normalizedAllowedDepartmentPaths.value[0];
  const currentUserDefault = normalizedPath(props.currentUserDepartmentPath);
  if (permissionDefault?.length) return permissionDefault;
  if (currentUserDefault.length) return currentUserDefault;
  return transportIsHttp ? [] : normalizedPath(MOCK_EXTENSION_PRODUCTS[0]?.departmentPath ?? []);
});
const defaultProduct = resolveDefaultProduct(defaultDepartmentPath.value);
const draftLevel = ref<ExtensionFilterLevel>('产品级');
const draftDepartmentPath = ref<string[]>([...defaultDepartmentPath.value]);
const draftProductId = ref(transportIsHttp ? '' : defaultProduct.id);
const appliedFilters = reactive<{
  level: ExtensionFilterLevel;
  departmentPath: string[];
  productId: string;
}>({
  level: '产品级',
  departmentPath: [...defaultDepartmentPath.value],
  productId: transportIsHttp ? '' : defaultProduct.id,
});
const appliedHttpScope = ref<ExtensionScope | null>(null);

const availableDraftProducts = computed(() =>
  products.value.filter((product) => productMatchesDepartment(product, draftDepartmentPath.value)),
);
const selectedDraftProduct = computed(
  () => products.value.find((product) => product.id === draftProductId.value) ?? null,
);

const visibleProductIds = computed(() => {
  if (appliedFilters.level === '产品级') {
    return appliedFilters.productId ? [appliedFilters.productId] : [];
  }
  return products.value
    .filter((product) => productMatchesDepartment(product, appliedFilters.departmentPath))
    .map((product) => product.id);
});

const visibleScenes = computed(() => {
  if (transportIsHttp) return scenes.value;
  return scenes.value.filter((scene) => visibleProductIds.value.includes(scene.productId));
});

const sceneGroups = computed(() => {
  const groupNames = [...new Set(visibleScenes.value.map((scene) => scene.primary))];
  return groupNames.map((name) => ({
    name,
    scenes: visibleScenes.value.filter((scene) => scene.primary === name),
  }));
});

const selectedSceneId = ref(visibleScenes.value[0]?.id ?? '');
const currentScene = computed(
  () => visibleScenes.value.find((scene) => scene.id === selectedSceneId.value) ?? null,
);
const currentProduct = computed(
  () => products.value.find((product) => product.id === currentScene.value?.productId) ?? null,
);
const currentScopeLabel = computed(
  () => currentProduct.value?.departmentPath.at(-1) ?? appliedFilters.departmentPath.at(-1) ?? '',
);
const openSceneGroups = reactive<Record<string, boolean>>({});
const expandedFolders = ref<Set<ExtensionCapabilityType>>(
  new Set(capabilitySections.map((section) => section.type)),
);
const expandedCapabilities = ref<Set<string>>(new Set());
const expandedFiles = ref<Set<string>>(new Set());
const loadedCapabilities = ref<Set<string>>(new Set());
const loadingCapabilities = ref<Set<string>>(new Set());
const capabilityErrors = reactive<Record<string, string>>({});
const loadedFiles = ref<Set<string>>(new Set());
const loadingFiles = ref<Set<string>>(new Set());
const fileErrors = reactive<Record<string, string>>({});
const scopeLoading = ref(false);
const productsLoading = ref(false);
const bindingsLoading = ref(false);
const scopeError = ref('');
const organizationLoading = ref(false);
const organizationError = ref('');
let productLoadSequence = 0;
let sceneListLoadSequence = 0;
let bindingLoadSequence = 0;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isDepartmentSelectionAllowed(path: string[]): boolean {
  if (!props.restrictToAllowedDepartments) return true;
  const normalized = normalizedPath(path);
  return normalizedAllowedDepartmentPaths.value.some((allowedPath) =>
    pathStartsWith(normalized, allowedPath),
  );
}

function guardDepartmentSelection(path: string[]): boolean {
  if (isDepartmentSelectionAllowed(path)) return true;
  scopeError.value = '请选择您有权限的部门或其下级部门';
  return false;
}

function withSetValue(source: Set<string>, key: string, included: boolean): Set<string> {
  const next = new Set(source);
  if (included) next.add(key);
  else next.delete(key);
  return next;
}

function clearContentState(): void {
  expandedCapabilities.value = new Set();
  expandedFiles.value = new Set();
  loadedCapabilities.value = new Set();
  loadingCapabilities.value = new Set();
  loadedFiles.value = new Set();
  loadingFiles.value = new Set();
  Object.keys(capabilityErrors).forEach((key) => delete capabilityErrors[key]);
  Object.keys(fileErrors).forEach((key) => delete fileErrors[key]);
}

function isSceneGroupOpen(name: string): boolean {
  return openSceneGroups[name] ?? true;
}

function toggleSceneGroup(name: string): void {
  openSceneGroups[name] = !isSceneGroupOpen(name);
}

function isFolderExpanded(type: ExtensionCapabilityType): boolean {
  return expandedFolders.value.has(type);
}

function toggleFolder(type: ExtensionCapabilityType): void {
  const next = new Set(expandedFolders.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  expandedFolders.value = next;
}

async function selectScene(sceneId: string): Promise<void> {
  selectedSceneId.value = sceneId;
  expandedCapabilities.value = new Set();
  expandedFiles.value = new Set();
  if (!transportIsHttp || !sceneId) return;

  const scope = appliedHttpScope.value;
  const scene = scenes.value.find((item) => item.id === sceneId);
  if (!scope || !scene) return;

  const requestSequence = ++bindingLoadSequence;
  bindingsLoading.value = true;
  scopeError.value = '';
  try {
    const hydratedScene = await queryHttpExtensionBindings(props.userId.trim(), scope, scene);
    if (
      requestSequence !== bindingLoadSequence ||
      appliedHttpScope.value !== scope ||
      selectedSceneId.value !== sceneId
    ) {
      return;
    }
    scenes.value = scenes.value.map((item) =>
      item.id === sceneId ? { ...hydratedScene, id: sceneId } : item,
    );
  } catch (error) {
    if (requestSequence === bindingLoadSequence && selectedSceneId.value === sceneId) {
      scopeError.value = errorMessage(error, '场景绑定规划件加载失败');
    }
  } finally {
    if (requestSequence === bindingLoadSequence) bindingsLoading.value = false;
  }
}

function buildDraftScope(): ExtensionScope {
  const departmentPath = normalizedPath(draftDepartmentPath.value);
  const department = findDepartmentNode(departmentPath);
  const departmentCode = getDepartmentNodeCode(department);
  if (!departmentPath.length) throw new Error('请选择归属部门');
  if (draftLevel.value === '部门级') {
    if (!departmentCode) throw new Error('所选部门缺少部门编码，请重新选择');
    return {
      dimType: '部门级',
      dimCode: departmentCode,
      dimName: department?.name ?? '',
      productId: departmentCode,
      departmentPath,
    };
  }
  const product = selectedDraftProduct.value;
  if (!product) throw new Error('请选择产品');
  return {
    dimType: '产品级',
    dimCode: product.id,
    dimName: product.name,
    productId: product.id,
    departmentPath,
  };
}

async function loadHttpProducts(path: string[]): Promise<boolean> {
  const requestSequence = ++productLoadSequence;
  const departmentPath = normalizedPath(path);
  const department = findDepartmentNode(departmentPath);
  const departmentCode = getDepartmentNodeCode(department);
  if (!departmentPath.length) throw new Error('请选择产品所属部门');
  if (!departmentCode) throw new Error('所选部门缺少部门编码，请重新选择');

  productsLoading.value = true;
  products.value = [];
  draftProductId.value = '';
  try {
    const nextProducts = await queryHttpExtensionProducts(
      departmentCode,
      department?.name ?? '',
      departmentPath,
    );
    if (requestSequence !== productLoadSequence) return false;
    products.value = nextProducts;
    draftProductId.value = nextProducts[0]?.id ?? '';
    return true;
  } catch (error) {
    if (requestSequence !== productLoadSequence) return false;
    throw error;
  } finally {
    if (requestSequence === productLoadSequence) productsLoading.value = false;
  }
}

async function refreshHttpScenes(preferredSceneId = '', showBoardLoading = true): Promise<void> {
  const scope = appliedHttpScope.value;
  if (!scope) return;
  const requestSequence = ++sceneListLoadSequence;
  bindingLoadSequence += 1;
  bindingsLoading.value = false;
  if (showBoardLoading) scopeLoading.value = true;
  scopeError.value = '';
  try {
    const nextScenes = await queryHttpExtensionScenes(props.userId.trim(), scope);
    if (requestSequence !== sceneListLoadSequence || appliedHttpScope.value !== scope) return;
    scenes.value = nextScenes;
    clearContentState();
    const nextSceneId = nextScenes.some((scene) => scene.id === preferredSceneId)
      ? preferredSceneId
      : (nextScenes[0]?.id ?? '');
    selectedSceneId.value = nextSceneId;
    if (nextSceneId) await selectScene(nextSceneId);
  } catch (error) {
    if (requestSequence !== sceneListLoadSequence || appliedHttpScope.value !== scope) return;
    scopeError.value = errorMessage(error, 'Extension 数据加载失败');
    if (showBoardLoading) scenes.value = [];
    throw error;
  } finally {
    if (showBoardLoading && requestSequence === sceneListLoadSequence) {
      scopeLoading.value = false;
    }
  }
}

async function onDepartmentCommitted(path: string[]): Promise<void> {
  draftDepartmentPath.value = normalizedPath(path);
  scopeError.value = '';
  try {
    if (transportIsHttp && draftLevel.value === '产品级') {
      const productsApplied = await loadHttpProducts(draftDepartmentPath.value);
      if (!productsApplied) return;
    }
    const options = availableDraftProducts.value;
    if (!options.some((product) => product.id === draftProductId.value)) {
      draftProductId.value = options[0]?.id ?? '';
    }
    await applyFilters();
  } catch (error) {
    products.value = transportIsHttp ? [] : products.value;
    scenes.value = transportIsHttp ? [] : scenes.value;
    scopeError.value = errorMessage(error, 'Extension 数据加载失败');
  }
}

async function onLevelChanged(): Promise<void> {
  scopeError.value = '';
  try {
    draftDepartmentPath.value = [...defaultDepartmentPath.value];
    if (transportIsHttp && draftLevel.value === '产品级') {
      const productsApplied = await loadHttpProducts(draftDepartmentPath.value);
      if (!productsApplied) return;
    }
    if (draftLevel.value === '产品级' && !draftProductId.value) {
      draftProductId.value = availableDraftProducts.value[0]?.id ?? '';
    }
    await applyFilters();
  } catch (error) {
    scopeError.value = errorMessage(error, 'Extension 数据加载失败');
  }
}

async function applyFilters(): Promise<void> {
  if (transportIsHttp) {
    const scope = buildDraftScope();
    appliedFilters.level = draftLevel.value;
    appliedFilters.departmentPath = [...draftDepartmentPath.value];
    appliedFilters.productId = draftLevel.value === '产品级' ? draftProductId.value : '';
    appliedHttpScope.value = scope;
    await refreshHttpScenes();
    return;
  }
  appliedFilters.level = draftLevel.value;
  appliedFilters.departmentPath = [...draftDepartmentPath.value];
  appliedFilters.productId = draftLevel.value === '产品级' ? draftProductId.value : '';
  const selectedStillVisible = visibleScenes.value.some(
    (scene) => scene.id === selectedSceneId.value,
  );
  if (!selectedStillVisible) void selectScene(visibleScenes.value[0]?.id ?? '');
}

function capabilityKey(scene: ExtensionScene, capability: ExtensionCapability): string {
  return `${scene.id}|${capability.id}`;
}

function fileKey(scene: ExtensionScene, capability: ExtensionCapability, fileName: string): string {
  return `${capabilityKey(scene, capability)}|${fileName}`;
}

async function loadFileContent(
  scene: ExtensionScene,
  capability: ExtensionCapability,
  type: ExtensionCapabilityType,
  fileName: string,
): Promise<void> {
  const key = fileKey(scene, capability, fileName);
  if (!transportIsHttp || loadedFiles.value.has(key) || loadingFiles.value.has(key)) return;
  loadingFiles.value = withSetValue(loadingFiles.value, key, true);
  delete fileErrors[key];
  try {
    const content = await queryHttpPlanningItemContent(
      props.userId.trim(),
      type,
      capability,
      fileName,
    );
    const file = capability.files.find((item) => item.name === fileName);
    if (file) file.content = content;
    loadedFiles.value = withSetValue(loadedFiles.value, key, true);
  } catch (error) {
    fileErrors[key] = errorMessage(error, '文件内容加载失败');
  } finally {
    loadingFiles.value = withSetValue(loadingFiles.value, key, false);
  }
}

async function loadSkillCapabilityFiles(
  scene: ExtensionScene,
  capability: ExtensionCapability,
): Promise<void> {
  const key = capabilityKey(scene, capability);
  if (!transportIsHttp || loadedCapabilities.value.has(key) || loadingCapabilities.value.has(key)) {
    return;
  }
  loadingCapabilities.value = withSetValue(loadingCapabilities.value, key, true);
  delete capabilityErrors[key];
  try {
    const paths = await queryHttpPlanningItemFiles(props.userId.trim(), 'skill', capability);
    capability.files = paths.map((name) => ({ name, content: '' }));
    loadedCapabilities.value = withSetValue(loadedCapabilities.value, key, true);
  } catch (error) {
    capabilityErrors[key] = errorMessage(error, '规划件目录加载失败');
  } finally {
    loadingCapabilities.value = withSetValue(loadingCapabilities.value, key, false);
  }
}

async function loadDirectCapabilityFile(
  scene: ExtensionScene,
  capability: ExtensionCapability,
  type: Exclude<ExtensionCapabilityType, 'skill'>,
): Promise<void> {
  const fileName = capability.files[0]?.name || `${capability.name}.md`;
  if (!capability.files[0]) capability.files = [{ name: fileName, content: '' }];
  await loadFileContent(scene, capability, type, fileName);
}

async function toggleCapability(
  scene: ExtensionScene,
  capability: ExtensionCapability,
  type: ExtensionCapabilityType,
): Promise<void> {
  if (!capability.ready) {
    showToast('该能力暂未开发完成，无内容可查看');
    return;
  }
  const key = capabilityKey(scene, capability);
  const opening = !expandedCapabilities.value.has(key);
  expandedCapabilities.value = withSetValue(expandedCapabilities.value, key, opening);
  if (!opening) return;
  if (type === 'skill') await loadSkillCapabilityFiles(scene, capability);
  else await loadDirectCapabilityFile(scene, capability, type);
}

async function toggleFile(
  scene: ExtensionScene,
  capability: ExtensionCapability,
  type: ExtensionCapabilityType,
  fileName: string,
): Promise<void> {
  const key = fileKey(scene, capability, fileName);
  const opening = !expandedFiles.value.has(key);
  expandedFiles.value = withSetValue(expandedFiles.value, key, opening);
  if (opening) await loadFileContent(scene, capability, type, fileName);
}

function sortedReleases(scene: ExtensionScene): ExtensionRelease[] {
  return [...scene.releases].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

function latestSuccessfulRelease(scene: ExtensionScene): ExtensionRelease | null {
  return sortedReleases(scene).find((release) => release.status === '成功') ?? null;
}

function sceneStatus(scene: ExtensionScene): {
  label: string;
  className: 'publishing' | 'published' | 'ready' | 'incomplete';
} {
  if (scene.publishing) return { label: '发布中', className: 'publishing' };
  if (latestSuccessfulRelease(scene)) return { label: '已发布', className: 'published' };
  if (scene.publishable) return { label: '就绪', className: 'ready' };
  return { label: '不完备', className: 'incomplete' };
}

function treeStatusLabel(scene: ExtensionScene): string {
  if (scene.publishing) return '发布中';
  const latest = latestSuccessfulRelease(scene);
  if (latest?.version) return `v${displayVersion(latest.version)}`;
  return scene.publishable ? '就绪' : '不完备';
}

function displayVersion(version: string): string {
  return version.replace(/^v(?=\d)/i, '') || '—';
}

function releaseStatusClass(status: ExtensionRelease['status']): 'ok' | 'fail' | 'pending' {
  if (status === '成功') return 'ok';
  if (status === '失败') return 'fail';
  return 'pending';
}

function capabilityItems(scene: ExtensionScene): ExtensionReleaseItem[] {
  return capabilitySections.flatMap((section) =>
    scene.capabilities[section.type].map((capability) => ({
      type: section.type,
      name: capability.name,
      version: capability.version,
    })),
  );
}

function nextVersion(scene: ExtensionScene): string {
  const minorVersions = scene.releases
    .map((release) => Number(displayVersion(release.version).split('.')[1]))
    .filter((version) => Number.isFinite(version));
  return `0.${Math.max(0, ...minorVersions) + 1}`;
}

function formatNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const activeModal = ref<ExtensionModal>(null);
const modalSceneId = ref('');
const modalScene = computed(
  () => scenes.value.find((scene) => scene.id === modalSceneId.value) ?? null,
);
const requiredExtensionNamePrefix = computed(() => {
  const scene = modalScene.value;
  if (!scene) return '';
  const originalProductName = products.value.find(
    (product) => product.id === scene.productId,
  )?.name;
  return getProductCatalogItemNamePrefix('产品级', originalProductName ?? '');
});
const publishForm = reactive({
  name: '',
  description: '',
  channel: 'beta' as ExtensionPublishChannel,
  organizationId: organizations.value[0]?.id ?? '',
});
const publishError = ref('');
const publishSubmitting = ref(false);
const historyLoading = ref(false);
const historyError = ref('');
const retryingReleaseId = ref('');
const publishNameLocked = computed(() => Boolean(modalScene.value?.releases.length));
const publishVersion = computed(() => (modalScene.value ? nextVersion(modalScene.value) : '0.1'));
const publishItems = computed(() => (modalScene.value ? capabilityItems(modalScene.value) : []));
const historyLimit = ref(3);
const modalHistory = computed(() => {
  if (!modalScene.value) return [];
  const releases = [
    ...(modalScene.value.publishing ? [modalScene.value.publishing] : []),
    ...modalScene.value.releases,
  ];
  return releases.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
});
const visibleHistory = computed(() => modalHistory.value.slice(0, historyLimit.value));

async function openPublishModal(scene: ExtensionScene): Promise<void> {
  if (!scene.publishable) {
    showToast('场景不完备，无法发布');
    return;
  }
  if (scene.publishing) {
    showToast('当前已有发布进行中');
    return;
  }
  const latest = latestSuccessfulRelease(scene);
  const firstPublish = scene.releases.length === 0;
  const originalProductName = products.value.find(
    (product) => product.id === scene.productId,
  )?.name;
  const requiredPrefix = getProductCatalogItemNamePrefix('产品级', originalProductName ?? '');
  modalSceneId.value = scene.id;
  publishForm.name =
    firstPublish && requiredPrefix
      ? requiredPrefix
      : latest?.extensionName || scene.extension.name || '';
  publishForm.description = scene.extension.description;
  publishForm.channel = 'beta';
  activeModal.value = 'publish';
  if (transportIsHttp) {
    organizations.value = [];
    publishForm.organizationId = '';
    await loadHttpOrganizations();
  }
  publishForm.organizationId = organizations.value[0]?.id ?? '';
  publishError.value = organizationError.value;
}

async function openHistoryModal(scene: ExtensionScene): Promise<void> {
  modalSceneId.value = scene.id;
  historyLimit.value = 3;
  historyError.value = '';
  activeModal.value = 'history';
  if (!transportIsHttp) return;
  historyLoading.value = true;
  try {
    await refreshHttpScenes(scene.id, false);
  } catch (error) {
    historyError.value = errorMessage(error, '发布历史加载失败');
  } finally {
    historyLoading.value = false;
  }
}

function closeModal(): void {
  if (publishSubmitting.value || retryingReleaseId.value) return;
  activeModal.value = null;
  publishError.value = '';
  historyError.value = '';
}

async function confirmPublish(): Promise<void> {
  const scene = modalScene.value;
  if (!scene) return;
  const name = publishForm.name.trim();
  const description = publishForm.description.trim();
  if (!name) {
    publishError.value = '请输入 Extension 名称';
    return;
  }
  if (!isCatalogItemNameValid(name)) {
    publishError.value = 'Extension 名称仅允许小写字母、数字、连字符，最长 64 字符';
    return;
  }
  const requiredPrefix = requiredExtensionNamePrefix.value;
  if (requiredPrefix && !name.startsWith(requiredPrefix)) {
    publishError.value = `Extension 名称需以产品名称的小写形式“${requiredPrefix}”开头`;
    return;
  }
  if (!description) {
    publishError.value = '请输入 Extension 描述';
    return;
  }
  const organization =
    organizations.value.find((item) => item.id === publishForm.organizationId) ??
    organizations.value[0];
  if (!organization) {
    publishError.value = organizationError.value || '当前用户暂无可发布组织';
    return;
  }

  if (transportIsHttp) {
    if (!appliedHttpScope.value) {
      publishError.value = '当前发布范围无效，请重新选择';
      return;
    }
    publishSubmitting.value = true;
    publishError.value = '';
    try {
      await publishHttpExtension({
        userId: props.userId.trim(),
        operatorName: props.userName.trim() || props.userId.trim(),
        scope: appliedHttpScope.value,
        scene,
        extensionName: name,
        description,
        channel: publishForm.channel,
        organization,
      });
      const sceneId = scene.id;
      await refreshHttpScenes(sceneId, false);
      activeModal.value = null;
      showToast(`已提交 ${publishForm.channel} 发布 → ${organization.name}，后台处理中`);
    } catch (error) {
      publishError.value = errorMessage(error, 'Extension 发布失败');
    } finally {
      publishSubmitting.value = false;
    }
    return;
  }

  scene.extension.name = name;
  scene.extension.description = description;
  scene.publishing = {
    version: publishVersion.value,
    extensionName: name,
    description,
    channel: publishForm.channel === 'product' ? 'Product' : 'Beta',
    operator: { no: 'A0123', name: '当前用户' },
    publishedAt: formatNow(),
    status: '进行中',
    organization: organization.name,
    items: publishItems.value,
  };
  activeModal.value = null;
  showToast(
    `已提交 ${scene.publishing.channel} 发布 v${scene.publishing.version} → ${organization.name}，后台处理中`,
  );
}

async function retryRelease(release: ExtensionRelease): Promise<void> {
  const scene = modalScene.value;
  if (!scene || release.status !== '失败') return;
  if (scene.publishing) {
    showToast('已有发布进行中，无法重试');
    return;
  }
  if (transportIsHttp) {
    retryingReleaseId.value = release.id ?? '';
    historyError.value = '';
    try {
      await retryHttpExtension(
        release.id ?? '',
        props.userId.trim(),
        props.userName.trim() || props.userId.trim(),
      );
      await refreshHttpScenes(scene.id, false);
      activeModal.value = null;
      showToast(
        `已重新提交 v${displayVersion(release.version)} → ${release.organization}，后台处理中`,
      );
    } catch (error) {
      historyError.value = errorMessage(error, 'Extension 重试发布失败');
    } finally {
      retryingReleaseId.value = '';
    }
    return;
  }
  scene.publishing = {
    ...release,
    operator: { no: 'A0123', name: '当前用户' },
    publishedAt: formatNow(),
    status: '进行中',
    items: release.items.map((item) => ({ ...item })),
  };
  activeModal.value = null;
  showToast(`已重新提交 v${displayVersion(release.version)} → ${release.organization}，后台处理中`);
}

async function loadHttpOrganizations(): Promise<void> {
  organizationLoading.value = true;
  organizationError.value = '';
  try {
    organizations.value = await queryHttpPublishableOrganizations(props.userId.trim());
    if (!organizations.value.length) organizationError.value = '当前用户暂无可发布组织';
  } catch (error) {
    organizations.value = [];
    organizationError.value = errorMessage(error, '可发布组织加载失败');
  } finally {
    organizationLoading.value = false;
  }
}

async function initializeHttpPage(): Promise<void> {
  scopeLoading.value = true;
  scopeError.value = '';
  try {
    await loadHttpProducts(draftDepartmentPath.value);
    await applyFilters();
  } catch (error) {
    products.value = [];
    scenes.value = [];
    scopeError.value = errorMessage(error, 'Extension 数据加载失败');
  } finally {
    scopeLoading.value = false;
  }
}

watch(
  [() => defaultDepartmentPath.value.join('\u0001'), () => selectableDepartmentTree.value],
  () => {
    if (!transportIsHttp || findDepartmentNode(draftDepartmentPath.value)) return;
    draftDepartmentPath.value = [...defaultDepartmentPath.value];
    void (async () => {
      scopeError.value = '';
      try {
        const productsApplied = await loadHttpProducts(draftDepartmentPath.value);
        if (productsApplied) await applyFilters();
      } catch (error) {
        products.value = [];
        scenes.value = [];
        scopeError.value = errorMessage(error, 'Extension 数据加载失败');
      }
    })();
  },
);

const toastMessage = ref('');
let toastTimer: number | null = null;

function showToast(message: string): void {
  toastMessage.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
    toastTimer = null;
  }, 2600);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeModal.value) closeModal();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  if (transportIsHttp) void initializeHttpPage();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (toastTimer) window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="extension-page">
    <header class="extension-hero">
      <h2>Extension 发布</h2>
      <p>用于统一管理各部门产品场景下的 Extension，支持内容查看、版本发布和历史追踪。</p>
    </header>

    <section class="extension-filter-card" aria-label="Extension 发布查询">
      <div class="filter-grid" :class="{ 'is-department-level': draftLevel === '部门级' }">
        <label class="filter-field filter-field--level">
          <span>层级 <em>*</em></span>
          <select v-model="draftLevel" :disabled="scopeLoading" @change="onLevelChanged">
            <option v-for="level in filterLevelOptions" :key="level" :value="level">
              {{ level }}
            </option>
          </select>
        </label>

        <div class="filter-field filter-field--department">
          <span>{{ draftLevel === '产品级' ? '产品所属部门' : '归属部门' }} <em>*</em></span>
          <MarketDeptCascader
            v-model="draftDepartmentPath"
            class="extension-dept-cascader"
            :tree="selectableDepartmentTree"
            :max-level="6"
            :all-label="'请选择部门'"
            clear-behavior="reset"
            :clear-value="defaultDepartmentPath"
            clear-text="恢复默认选择"
            selection-mode="confirm"
            :permission-mode="restrictToAllowedDepartments ? 'review-center' : 'none'"
            :permission-path="currentUserDepartmentPath"
            :allowed-paths="restrictToAllowedDepartments ? allowedDepartmentPaths : []"
            :before-done="guardDepartmentSelection"
            :disabled="scopeLoading || productsLoading"
            searchable
            aria-label="按部门筛选 Extension"
            @clear="onDepartmentCommitted"
            @done="onDepartmentCommitted"
          />
        </div>

        <label v-if="draftLevel === '产品级'" class="filter-field">
          <span>产品 <em>*</em></span>
          <select
            v-model="draftProductId"
            :disabled="scopeLoading || productsLoading || availableDraftProducts.length === 0"
            @change="applyFilters"
          >
            <option v-if="productsLoading" value="">产品加载中...</option>
            <option v-else-if="availableDraftProducts.length === 0" value="">暂无产品</option>
            <option v-for="product in availableDraftProducts" :key="product.id" :value="product.id">
              {{ product.name }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <div v-if="scopeError" class="extension-load-alert" role="alert">
      <span aria-hidden="true">!</span>{{ scopeError }}
    </div>

    <section
      class="extension-board"
      aria-label="Extension 发布内容"
      :aria-busy="scopeLoading || bindingsLoading"
    >
      <aside class="panel-card scene-tree-card">
        <header class="panel-card__header">
          <h3>场景树</h3>
          <span>{{ visibleScenes.length }} 个二级</span>
        </header>
        <div class="scene-tree-body">
          <div v-for="group in sceneGroups" :key="group.name" class="scene-group">
            <button
              type="button"
              class="scene-group__trigger"
              @click="toggleSceneGroup(group.name)"
            >
              <span class="tree-caret" :class="{ 'is-open': isSceneGroupOpen(group.name) }">›</span>
              <strong>{{ group.name }}</strong>
              <span class="scene-count">{{ group.scenes.length }}</span>
            </button>
            <ul v-show="isSceneGroupOpen(group.name)" class="scene-list">
              <li v-for="scene in group.scenes" :key="scene.id">
                <button
                  type="button"
                  class="scene-button"
                  :class="{ 'is-active': selectedSceneId === scene.id }"
                  :disabled="bindingsLoading && selectedSceneId === scene.id"
                  @click="selectScene(scene.id)"
                >
                  <span class="primary-tag">{{ scene.primary }}</span>
                  <span class="scene-button__name">{{ scene.name }}</span>
                  <span class="tree-status" :class="sceneStatus(scene).className">
                    <i aria-hidden="true"></i>{{ treeStatusLabel(scene) }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
          <div v-if="scopeLoading" class="empty-state empty-state--tree">正在加载场景…</div>
          <div v-else-if="sceneGroups.length === 0" class="empty-state empty-state--tree">
            {{ scopeError ? '场景加载失败' : '暂无符合条件的场景' }}
          </div>
        </div>
      </aside>

      <article class="panel-card detail-card">
        <template v-if="currentScene">
          <header class="scene-header">
            <div class="scene-header__main">
              <div class="scene-title-row">
                <span class="scene-status" :class="sceneStatus(currentScene).className">
                  {{ sceneStatus(currentScene).label }}
                </span>
                <h3>{{ currentScene.primary }} / {{ currentScene.name }}</h3>
                <span v-if="currentScopeLabel" class="department-chip">{{
                  currentScopeLabel
                }}</span>
              </div>
              <div class="extension-meta">
                <template v-if="currentScene.extension.name">
                  <span class="package-mark" aria-hidden="true">◆</span>
                  <span class="extension-identity">
                    <strong class="extension-name">{{ currentScene.extension.name }}</strong>
                    <span v-if="currentScene.extension.description" class="extension-description">{{
                      currentScene.extension.description
                    }}</span>
                  </span>
                </template>
                <span v-else class="extension-undefined">
                  ◆ 未定义 Extension（点击“发布”填写名称与描述）
                </span>
                <template v-if="latestSuccessfulRelease(currentScene)">
                  <span class="meta-divider">·</span>
                  <span class="release-meta-group">
                    <span class="release-meta-label">最新</span>
                    <b class="version-text"
                      >v{{
                        displayVersion(latestSuccessfulRelease(currentScene)?.version ?? '')
                      }}</b
                    >
                    <time>{{ latestSuccessfulRelease(currentScene)?.publishedAt }}</time>
                  </span>
                </template>
                <template v-if="currentScene.publishing">
                  <span class="meta-divider">·</span>
                  <span class="release-meta-group release-meta-group--publishing">
                    <span class="release-meta-label">发布中</span>
                    <b class="publishing-text"
                      >v{{ displayVersion(currentScene.publishing.version) }}</b
                    >
                    <time>{{ currentScene.publishing.publishedAt }}</time>
                  </span>
                </template>
              </div>
            </div>
            <div class="scene-header__actions">
              <button
                type="button"
                class="extension-button extension-button--ghost extension-button--small"
                @click="openHistoryModal(currentScene)"
              >
                发布历史
              </button>
              <button
                type="button"
                class="extension-button extension-button--publish extension-button--small"
                :disabled="!currentScene.publishable || Boolean(currentScene.publishing)"
                @click="openPublishModal(currentScene)"
              >
                {{ currentScene.publishing ? '发布中…' : '发布' }}
              </button>
            </div>
          </header>

          <div v-if="!currentScene.publishable" class="warning-bar">
            <span aria-hidden="true">!</span>
            该场景不完备（部分 Skill 或 Agent 未开发完成），暂不具备发布能力。
          </div>

          <div class="scene-content">
            <section
              v-for="section in capabilitySections"
              :key="section.type"
              class="capability-folder"
            >
              <button
                type="button"
                class="folder-heading"
                :aria-expanded="isFolderExpanded(section.type)"
                @click="toggleFolder(section.type)"
              >
                <span class="folder-caret" :class="{ 'is-open': isFolderExpanded(section.type) }"
                  >›</span
                >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z" />
                </svg>
                <strong>{{ section.folder }}/</strong>
                <span class="folder-count">{{
                  currentScene.capabilities[section.type].length
                }}</span>
              </button>

              <ul
                v-if="currentScene.capabilities[section.type].length"
                v-show="isFolderExpanded(section.type)"
                class="capability-list"
              >
                <li
                  v-for="capability in currentScene.capabilities[section.type]"
                  :key="capability.id"
                  class="capability-item"
                >
                  <button
                    type="button"
                    class="capability-row"
                    :class="{
                      'is-open': expandedCapabilities.has(capabilityKey(currentScene, capability)),
                      'is-disabled': !capability.ready,
                    }"
                    @click="toggleCapability(currentScene, capability, section.type)"
                  >
                    <span class="capability-caret">{{ capability.ready ? '›' : '•' }}</span>
                    <img class="capability-icon" :src="section.iconSrc" :alt="section.label" />
                    <span
                      class="capability-type-tag"
                      :class="`capability-type-tag--${section.type}`"
                    >
                      {{ section.label }}
                    </span>
                    <span class="capability-name">{{ capability.name }}</span>
                    <template v-if="capability.ready">
                      <span class="capability-release-meta">
                        <span class="capability-version"
                          >v{{ displayVersion(capability.version) }}</span
                        >
                        <time v-if="capability.publishDate">{{ capability.publishDate }}</time>
                      </span>
                    </template>
                    <span v-else class="unready-tag">未就绪</span>
                  </button>

                  <ul
                    v-if="
                      capability.ready &&
                      expandedCapabilities.has(capabilityKey(currentScene, capability))
                    "
                    class="file-list"
                  >
                    <li
                      v-if="loadingCapabilities.has(capabilityKey(currentScene, capability))"
                      class="folder-empty"
                    >
                      正在加载目录…
                    </li>
                    <li
                      v-else-if="capabilityErrors[capabilityKey(currentScene, capability)]"
                      class="folder-empty folder-empty--error"
                    >
                      {{ capabilityErrors[capabilityKey(currentScene, capability)] }}
                    </li>
                    <template v-else-if="section.type === 'skill'">
                      <li v-for="file in capability.files" :key="file.name">
                        <button
                          type="button"
                          class="file-row"
                          :class="{
                            'is-open': expandedFiles.has(
                              fileKey(currentScene, capability, file.name),
                            ),
                          }"
                          @click="toggleFile(currentScene, capability, section.type, file.name)"
                        >
                          <span class="file-caret">›</span>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 3.5h8l4 4V20H6V3.5Z" />
                            <path d="M14 3.5v4h4" />
                          </svg>
                          <p style="font-size: 10px">{{ file.name }}</p>
                        </button>
                        <pre
                          v-if="expandedFiles.has(fileKey(currentScene, capability, file.name))"
                          class="file-content"
                          >{{
                            loadingFiles.has(fileKey(currentScene, capability, file.name))
                              ? '正在加载…'
                              : fileErrors[fileKey(currentScene, capability, file.name)] ||
                                file.content ||
                                '(空)'
                          }}</pre
                        >
                      </li>
                      <li v-if="capability.files.length === 0" class="folder-empty">暂无文件</li>
                    </template>
                    <li v-else-if="capability.files[0]">
                      <pre class="file-content file-content--direct">{{
                        loadingFiles.has(
                          fileKey(currentScene, capability, capability.files[0].name),
                        )
                          ? '正在加载…'
                          : fileErrors[
                              fileKey(currentScene, capability, capability.files[0].name)
                            ] ||
                            capability.files[0].content ||
                            '(空)'
                      }}</pre>
                    </li>
                    <li v-else class="folder-empty">暂无文件</li>
                  </ul>
                </li>
              </ul>
              <div v-else v-show="isFolderExpanded(section.type)" class="folder-empty">无</div>
            </section>
          </div>
        </template>
        <div v-else class="empty-state">
          {{ scopeLoading ? '正在加载 Extension 内容…' : '选择左侧二级场景查看关联内容' }}
        </div>
      </article>
    </section>

    <div v-if="activeModal" class="modal-overlay" @mousedown.self="closeModal">
      <section
        v-if="activeModal === 'publish' && modalScene"
        class="extension-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-modal-title"
      >
        <header class="modal-header">
          <h3 id="publish-modal-title">发布 Extension · {{ modalScene.name }}</h3>
          <button
            type="button"
            class="modal-close"
            aria-label="关闭"
            :disabled="publishSubmitting"
            @click="closeModal"
          >
            ×
          </button>
        </header>
        <div class="modal-body">
          <label class="modal-field">
            <span>
              Extension 名称 <em>*</em>
              <small v-if="publishNameLocked" class="lock-tag">已发布，不可修改</small>
            </span>
            <input
              v-model="publishForm.name"
              type="text"
              maxlength="64"
              pattern="[a-z0-9-]{1,64}"
              :readonly="publishNameLocked"
              :disabled="publishSubmitting"
            />
            <small v-if="requiredExtensionNamePrefix" class="field-hint">
              需以产品名称的小写形式“{{ requiredExtensionNamePrefix }}”开头
            </small>
            <small v-if="publishNameLocked" class="field-hint">
              非首次发布，名称沿用历史版本。
            </small>
          </label>
          <label class="modal-field">
            <span>Extension 描述 <em>*</em></span>
            <textarea
              v-model="publishForm.description"
              rows="3"
              placeholder="请输入 Extension 描述"
              :disabled="publishSubmitting"
            />
          </label>
          <label class="modal-field">
            <span>发布通道 <em>*</em></span>
            <select v-model="publishForm.channel" :disabled="publishSubmitting">
              <option value="beta">beta</option>
              <option value="product">product</option>
            </select>
          </label>
          <div class="modal-field">
            <span>版本号（自增）</span>
            <div class="readonly-value">v{{ publishVersion }}</div>
          </div>
          <div class="modal-field">
            <span>包含清单（{{ publishItems.length }} 项）</span>
            <ul class="publish-summary">
              <li v-for="item in publishItems" :key="`${item.type}-${item.name}`">
                <img
                  class="capability-icon"
                  :src="capabilityTypeMeta[item.type].iconSrc"
                  :alt="capabilityTypeMeta[item.type].label"
                />
                <span class="capability-type-tag" :class="`capability-type-tag--${item.type}`">
                  {{ capabilityTypeMeta[item.type].label }}
                </span>
                <strong>{{ item.name }}</strong>
                <span>v{{ displayVersion(item.version) }}</span>
              </li>
            </ul>
          </div>
          <label class="modal-field">
            <span>目标组织 <em>*</em></span>
            <select
              v-model="publishForm.organizationId"
              :disabled="publishSubmitting || organizationLoading || organizations.length === 0"
            >
              <option v-if="organizationLoading" value="">正在加载组织…</option>
              <option v-else-if="organizations.length === 0" value="">暂无可发布组织</option>
              <option
                v-for="organization in organizations"
                :key="organization.id"
                :value="organization.id"
              >
                {{ organization.name }}
              </option>
            </select>
          </label>
          <p v-if="publishError" class="modal-error">{{ publishError }}</p>
        </div>
        <footer class="modal-footer">
          <button
            type="button"
            class="extension-button extension-button--ghost extension-button--modal-action"
            :disabled="publishSubmitting"
            @click="closeModal"
          >
            取消
          </button>
          <button
            type="button"
            class="extension-button extension-button--publish extension-button--modal-action"
            :disabled="publishSubmitting || organizationLoading || organizations.length === 0"
            @click="confirmPublish"
          >
            {{ publishSubmitting ? '发布中…' : '确认发布' }}
          </button>
        </footer>
      </section>

      <section
        v-else-if="activeModal === 'history' && modalScene"
        class="extension-modal extension-modal--history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        <header class="modal-header">
          <h3 id="history-modal-title">
            发布历史 · {{ modalScene.name }}
            <small>共 {{ modalHistory.length }} 条</small>
          </h3>
          <button
            type="button"
            class="modal-close"
            aria-label="关闭"
            :disabled="Boolean(retryingReleaseId)"
            @click="closeModal"
          >
            ×
          </button>
        </header>
        <div class="modal-body history-body">
          <div v-if="historyLoading" class="empty-state empty-state--history">
            正在加载发布历史…
          </div>
          <div v-else-if="historyError" class="modal-error" role="alert">{{ historyError }}</div>
          <div v-else-if="visibleHistory.length" class="timeline">
            <article
              v-for="release in visibleHistory"
              :key="`${release.version}-${release.publishedAt}-${release.status}`"
              class="timeline-item"
              :class="releaseStatusClass(release.status)"
            >
              <i class="timeline-dot" aria-hidden="true"></i>
              <div class="timeline-card">
                <header>
                  <strong>v{{ displayVersion(release.version) }}</strong>
                  <span class="channel-tag" :class="release.channel.toLowerCase()">
                    {{ release.channel }}
                  </span>
                  <b>{{ release.extensionName }}</b>
                  <span class="release-status" :class="releaseStatusClass(release.status)">
                    {{ release.status }}
                  </span>
                </header>
                <div class="timeline-card__body">
                  <p>{{ release.description }}</p>
                  <div
                    v-if="release.status === '失败' && release.failReason"
                    class="failure-reason"
                  >
                    <strong>失败原因</strong>
                    <span>{{ release.failReason }}</span>
                  </div>
                  <div class="history-structure-label">
                    ◆ 内部结构（{{ release.items.length }} 项）
                  </div>
                  <div class="history-structure">
                    <span
                      v-for="item in release.items"
                      :key="`${item.type}-${item.name}-${item.version}`"
                    >
                      <img
                        class="capability-icon"
                        :src="capabilityTypeMeta[item.type].iconSrc"
                        :alt="capabilityTypeMeta[item.type].label"
                      />
                      <span
                        class="capability-type-tag"
                        :class="`capability-type-tag--${item.type}`"
                      >
                        {{ capabilityTypeMeta[item.type].label }}
                      </span>
                      {{ item.name }}
                      <b>v{{ displayVersion(item.version) }}</b>
                    </span>
                  </div>
                  <footer class="release-meta">
                    <span>用户：{{ release.operator.name }}（{{ release.operator.no }}）</span>
                    <span>时间：{{ release.publishedAt }}</span>
                    <span>组织：{{ release.organization }}</span>
                  </footer>
                  <div v-if="release.status === '失败'" class="history-actions">
                    <button
                      type="button"
                      class="extension-button extension-button--ghost extension-button--small"
                      :disabled="Boolean(retryingReleaseId)"
                      @click="retryRelease(release)"
                    >
                      {{ retryingReleaseId === release.id ? '重试中…' : '↻ 重试发布' }}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="empty-state empty-state--history">暂无发布记录</div>
          <div
            v-if="!historyLoading && !historyError && modalHistory.length > historyLimit"
            class="history-more"
          >
            <button
              type="button"
              class="extension-button extension-button--ghost extension-button--small"
              @click="historyLimit = modalHistory.length"
            >
              加载更多（剩余 {{ modalHistory.length - historyLimit }} 条）
            </button>
          </div>
          <p
            v-else-if="!historyLoading && !historyError && modalHistory.length"
            class="history-end"
          >
            已全部加载 · 共 {{ modalHistory.length }} 条
          </p>
        </div>
        <footer class="modal-footer">
          <button
            type="button"
            class="extension-button extension-button--ghost"
            :disabled="Boolean(retryingReleaseId)"
            @click="closeModal"
          >
            关闭
          </button>
        </footer>
      </section>
    </div>

    <Transition name="toast">
      <div v-if="toastMessage" class="extension-toast" role="status">{{ toastMessage }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.extension-page {
  --extension-blue: #2f7df6;
  --extension-indigo: #7552ff;
  --extension-green: #16a34a;
  --extension-text: #17233d;
  --extension-muted: #667085;
  --extension-border: #e0e7f3;
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: var(--extension-text);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
}

.extension-page button,
.extension-page input,
.extension-page select,
.extension-page textarea {
  font: inherit;
}

.extension-hero {
  padding: 28px 0 30px;
}

.extension-hero h2 {
  margin: 0;
  color: #07172f;
  font-size: 42px;
  font-weight: 900;
  line-height: 1.18;
}

.extension-hero p {
  max-width: 820px;
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.extension-filter-card,
.extension-board {
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.06);
}

.extension-filter-card {
  padding: 18px;
}

.filter-grid {
  display: grid;
  grid-template-columns:
    minmax(120px, 0.65fr)
    minmax(260px, 1.4fr)
    minmax(180px, 0.9fr);
  gap: 14px;
  align-items: end;
  min-width: 0;
}

.filter-grid.is-department-level {
  grid-template-columns: minmax(120px, 0.65fr) minmax(360px, 1.75fr);
}

.filter-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.filter-field > span,
.modal-field > span {
  color: #52647d;
  font-size: 12px;
  font-weight: 800;
}

.filter-field em,
.modal-field em {
  color: #dc2626;
  font-style: normal;
}

.filter-field input,
.filter-field select {
  width: 100%;
  min-width: 0;
  height: 38px;
  box-sizing: border-box;
  padding: 0 11px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  outline: 0;
  background: #fff;
  color: #253857;
  font-size: 13px;
}

.filter-field input:focus,
.filter-field select:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.14);
}

.filter-field select:disabled {
  background: #f8fbff;
  color: #64748b;
  cursor: not-allowed;
}

.extension-dept-cascader {
  width: 100%;
  min-width: 0;
}

.extension-dept-cascader :deep(.market-dept-cascader-trigger) {
  min-height: 38px;
  height: 38px;
  padding: 0 30px 0 11px;
  border-color: #d8e2f0;
  border-radius: 6px;
  background: #fff;
  color: #253857;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}

.extension-dept-cascader :deep(.market-dept-cascader-trigger:hover) {
  border-color: #b9ccff;
}

.filter-actions {
  display: flex;
  gap: 10px;
}

.extension-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 6px;
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

.extension-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.extension-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.extension-button--primary {
  border-color: #2563eb;
  background: linear-gradient(135deg, var(--extension-blue), var(--extension-indigo));
  color: #fff;
  box-shadow: 0 12px 24px rgba(47, 125, 246, 0.18);
}

.extension-button--ghost {
  border-color: #dbe5f2;
  background: #fff;
  color: #253857;
}

.extension-button--ghost:hover:not(:disabled) {
  border-color: #b9ccff;
  background: #f6f9ff;
}

.extension-button--publish {
  border-color: #16a34a;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  box-shadow: 0 8px 18px rgba(22, 163, 74, 0.18);
}

.extension-button--small {
  min-height: 32px;
  padding: 0 11px;
  font-size: 12px;
}

.extension-board .extension-button--small {
  font-size: 11px;
}

.extension-board {
  display: grid;
  grid-template-columns: minmax(280px, 0.32fr) minmax(0, 1fr);
  gap: 16px;
  height: clamp(560px, calc(100vh - 382px), 880px);
  min-height: 560px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.panel-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(224, 231, 243, 0.96);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.07);
}

.panel-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid #edf1f6;
  background: linear-gradient(180deg, #fbfcff, #f6f8fb);
}

.panel-card__header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 850;
}

.panel-card__header span {
  color: #98a2b3;
  font-size: 11px;
  font-weight: 700;
}

.scene-tree-body {
  flex: 1;
  min-height: 0;
  padding: 9px;
  overflow: auto;
}

.scene-group + .scene-group {
  margin-top: 3px;
}

.scene-group__trigger {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #101828;
  text-align: left;
  cursor: pointer;
}

.scene-group__trigger:hover {
  background: #f6f9ff;
}

.scene-group__trigger strong {
  font-size: 13px;
  font-weight: 850;
}

.tree-caret,
.capability-caret,
.file-caret {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  color: #98a2b3;
  transition: transform 0.16s ease;
}

.tree-caret {
  width: 12px;
  font-size: 17px;
}

.tree-caret.is-open,
.capability-row.is-open .capability-caret,
.file-row.is-open .file-caret {
  transform: rotate(90deg);
}

.scene-count {
  width: fit-content;
  min-width: 0;
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid #e1e7ef;
  border-radius: 999px;
  background: #fff;
  color: #98a2b3;
  font-size: 9px;
  line-height: 1.2;
  text-align: center;
}

.scene-list,
.capability-list,
.file-list,
.publish-summary {
  margin: 0;
  padding: 0;
  list-style: none;
}

.scene-list {
  margin-left: 17px;
  padding-left: 10px;
  border-left: 1px dashed #dce4ee;
}

.scene-list li + li {
  margin-top: 2px;
}

.scene-button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #17233d;
  text-align: left;
  cursor: pointer;
}

.scene-button:hover {
  border-color: #e0e7f3;
  background: #f7faff;
}

.scene-button.is-active {
  border-color: rgba(47, 125, 246, 0.3);
  background: rgba(47, 125, 246, 0.1);
  color: #2f6fe4;
  font-weight: 800;
}

.primary-tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border: 1px solid #e4d8fb;
  border-radius: 5px;
  background: #f6f2ff;
  color: #7552d6;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.scene-button__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 400;
  line-height: 1.35;
}

.tree-status i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.tree-status.published {
  border-color: #b9e6cd;
  background: #eaf8f1;
  color: #27815d;
}

.tree-status.publishing {
  border-color: #ffe0a3;
  background: #fff3df;
  color: #b06a18;
}

.tree-status.ready {
  border-color: #d6dcff;
  background: #eef2ff;
  color: #4266d5;
}

.tree-status.incomplete {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.scene-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 18px;
  border-bottom: 1px solid #edf1f6;
  background: linear-gradient(180deg, #fff, #f7faff);
}

.scene-header__main {
  min-width: 0;
  flex: 1;
}

.scene-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scene-title-row h3 {
  margin: 0;
  color: #07172f;
  font-size: 19px;
  font-weight: 900;
}

.scene-status {
  padding: 3px 8px;
  border: 1px solid;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.2;
}

.scene-status.published,
.scene-status.ready {
  border-color: #b9e6cd;
  background: #eaf8f1;
  color: #27815d;
}

.scene-status.publishing,
.scene-status.incomplete {
  border-color: #ffe0a3;
  background: #fff3df;
  color: #b06a18;
}

.department-chip {
  padding: 2px 7px;
  border: 1px solid #dfe5ee;
  border-radius: 6px;
  background: #fff;
  color: #475467;
  font-size: 9px;
  font-weight: 750;
  line-height: 1.2;
}

.extension-meta {
  display: flex;
  align-items: center;
  column-gap: 9px;
  row-gap: 6px;
  margin-top: 8px;
  color: #667085;
  font-size: 11px;
  line-height: 1.4;
  flex-wrap: wrap;
}

.extension-identity {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.extension-name {
  color: #17233d;
  font-weight: 650;
  white-space: nowrap;
}

.extension-description {
  max-width: 48ch;
  overflow: hidden;
  padding-left: 8px;
  border-left: 1px solid #dfe5ee;
  color: #667085;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-mark {
  display: grid;
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 2px;
  background: #dd9d12;
  box-shadow: 0 0 0 2px #fff3df;
  color: transparent;
  font-size: 0;
  transform: rotate(45deg);
}

.extension-undefined {
  color: #a6b0bf;
}

.meta-divider {
  display: none;
}

.release-meta-group {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid #dfe8f6;
  border-radius: 5px;
  background: #f7faff;
  color: #667085;
  font-size: 10px;
  line-height: 1.25;
}

.release-meta-label {
  color: #667085;
  font-weight: 500;
  white-space: nowrap;
}

.release-meta-group--publishing {
  border-color: #ffe0a3;
  background: #fffbeb;
}

.version-text,
.publishing-text {
  color: #16a34a;
  font-weight: 650;
}

.publishing-text {
  color: #b06a18;
}

.extension-meta time {
  color: #98a2b3;
  font-size: 9px;
  line-height: 1.25;
  white-space: nowrap;
}

.scene-header__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.extension-load-alert {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff7f7;
  color: #b42318;
  font-size: 12px;
}

.extension-load-alert > span {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 900;
}

.warning-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid #ffe0a3;
  border-radius: 8px;
  background: #fffbeb;
  color: #92611a;
  font-size: 11px;
}

.warning-bar > span {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 900;
}

.scene-content {
  flex: 1;
  min-height: 0;
  padding: 16px 18px 26px;
  overflow: auto;
}

.capability-folder + .capability-folder {
  margin-top: 15px;
}

.folder-heading {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 10px;
  border: 1px solid #e7ebf1;
  border-radius: 9px;
  background: #fafbfc;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.folder-heading:hover {
  border-color: #cedbf0;
  background: #f7faff;
}

.folder-heading:focus-visible {
  outline: 3px solid rgba(47, 125, 246, 0.18);
  outline-offset: 2px;
}

.folder-caret {
  display: inline-grid;
  width: 12px;
  flex: 0 0 auto;
  place-items: center;
  color: #98a2b3;
  font-size: 16px;
  line-height: 1;
  transition: transform 0.16s ease;
}

.folder-caret.is-open {
  transform: rotate(90deg);
}

.folder-heading svg {
  width: 18px;
  height: 18px;
  fill: #f5b526;
  stroke: #dd9d12;
  stroke-width: 1;
}

.folder-heading strong {
  flex: 1;
  color: #17233d;
  font-size: 13px;
}

.folder-count {
  width: fit-content;
  min-width: 0;
  padding: 1px 6px;
  border: 1px solid #e2e7ee;
  border-radius: 999px;
  background: #fff;
  color: #98a2b3;
  font-size: 9px;
  line-height: 1.2;
  text-align: center;
}

.capability-list {
  margin-left: 24px;
  padding: 8px 0 0 17px;
  border-left: 1px dashed #dce4ee;
}

.capability-item + .capability-item {
  margin-top: 3px;
}

.capability-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #17233d;
  text-align: left;
  cursor: pointer;
}

.capability-row:hover:not(.is-disabled) {
  border-color: #e0e7f3;
  background: #f7faff;
}

.capability-row.is-disabled {
  cursor: default;
  opacity: 0.62;
}

.capability-caret {
  width: 14px;
  font-size: 17px;
}

.capability-icon {
  display: block;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: cover;
}

.capability-type-tag {
  display: inline-flex;
  min-height: 18px;
  flex: 0 0 auto;
  align-items: center;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
}

.capability-type-tag--skill {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.capability-type-tag--command {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #15803d;
}

.capability-type-tag--agent {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #7c3aed;
}

.capability-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-version {
  display: inline-block;
  color: #16a34a;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.capability-release-meta {
  display: inline-flex;
  min-height: 18px;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 8px;
  padding-block: 2px;
  line-height: 1.4;
  white-space: nowrap;
}

.capability-release-meta time {
  display: inline-block;
  color: #98a2b3;
  font-size: 10px;
  line-height: 1.4;
}

.unready-tag {
  padding: 2px 7px;
  border: 1px solid #ffe0a3;
  border-radius: 5px;
  background: #fff3df;
  color: #b06a18;
  font-size: 9px;
  font-weight: 750;
}

.file-list {
  margin: 3px 0 7px 24px;
}

.file-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #667085;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.file-row:hover {
  background: #f6f9ff;
  color: #17233d;
}

.file-caret {
  width: 12px;
  font-size: 15px;
}

.file-row svg {
  width: 14px;
  height: 14px;
  fill: #eef2ff;
  stroke: #8f9bbb;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.file-row > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-content {
  max-height: 260px;
  margin: 4px 0 7px 21px;
  padding: 11px 13px;
  overflow: auto;
  border: 1px solid #e0e7f3;
  border-radius: 7px;
  background: #fbfcff;
  color: #17233d;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre;
}

.file-content--direct {
  margin-left: 0;
}

.folder-empty {
  padding: 10px 14px 2px 42px;
  color: #98a2b3;
  font-size: 10px;
}

.folder-empty--error {
  color: #dc2626;
}

.empty-state {
  display: grid;
  min-height: 220px;
  flex: 1;
  place-items: center;
  padding: 40px;
  color: #98a2b3;
  font-size: 12px;
  text-align: center;
}

.empty-state--tree,
.empty-state--history {
  min-height: 140px;
  padding: 24px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
}

.extension-modal {
  display: flex;
  width: min(560px, 100%);
  max-height: 88vh;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(16, 24, 40, 0.24);
}

.extension-modal--history {
  width: min(780px, 100%);
}

.extension-modal--history .modal-header {
  padding: 12px 16px;
}

.extension-modal--history .modal-header h3 {
  font-size: 14px;
}

.extension-modal--history .modal-footer {
  padding: 10px 16px;
}

.extension-modal--history .extension-button {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.extension-modal--history .extension-button--small {
  min-height: 28px;
  padding: 0 9px;
  font-size: 11px;
}

.modal-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #e4e7ec;
}

.modal-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 850;
}

.modal-header h3 small {
  margin-left: 8px;
  color: #98a2b3;
  font-size: 11px;
  font-weight: 650;
}

.modal-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #98a2b3;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.modal-close:hover {
  background: #f1f3f7;
  color: #101828;
}

.modal-body {
  flex: 1;
  padding: 16px 18px;
  overflow: auto;
}

.modal-field {
  display: grid;
  gap: 6px;
  margin-bottom: 13px;
}

.modal-field input,
.modal-field select,
.modal-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfe4ec;
  border-radius: 7px;
  outline: 0;
  background: #fff;
  color: #17233d;
  font-size: 12px;
}

.modal-field input,
.modal-field select {
  height: 34px;
  padding: 0 10px;
}

.modal-field textarea {
  min-height: 70px;
  padding: 9px 10px;
  line-height: 1.55;
  resize: vertical;
}

.modal-field input:focus,
.modal-field select:focus,
.modal-field textarea:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.13);
}

.modal-field input[readonly] {
  background: #f7f8fa;
  color: #667085;
  cursor: not-allowed;
}

.lock-tag {
  margin-left: 5px;
  padding: 2px 6px;
  border: 1px solid #ffe0a3;
  border-radius: 4px;
  background: #fff3df;
  color: #b06a18;
  font-size: 10px;
}

.field-hint {
  color: #98a2b3;
  font-size: 10px;
}

.readonly-value {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f7f8fa;
  color: #17233d;
  font-size: 13px;
}

.publish-summary {
  overflow: hidden;
  border: 1px solid #e1e6ee;
  border-radius: 9px;
  background: #fbfcff;
}

.publish-summary li {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  color: #17233d;
  font-size: 12px;
}

.publish-summary li + li {
  border-top: 1px solid #edf0f4;
}

.publish-summary .capability-icon {
  width: 20px;
  height: 20px;
  border-radius: 5px;
}

.publish-summary strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-summary > li > span:last-child {
  color: #16a34a;
  font-size: 11px;
}

.modal-error {
  margin: 2px 0 0;
  color: #dc2626;
  font-size: 12px;
  font-weight: 700;
}

.modal-footer {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #e4e7ec;
  background: #fafbfd;
}

.modal-footer .extension-button--modal-action {
  min-height: 0;
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.history-body {
  padding: 14px 16px;
}

.timeline {
  position: relative;
  padding-left: 6px;
}

.timeline::before {
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 10px;
  width: 2px;
  border-radius: 99px;
  background: linear-gradient(180deg, #2f7df6, #cbd2dc);
  content: '';
}

.timeline-item {
  position: relative;
  padding-left: 30px;
}

.timeline-item + .timeline-item {
  margin-top: 10px;
}

.timeline-dot {
  position: absolute;
  top: 8px;
  left: -2px;
  z-index: 1;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 3px solid #2f7df6;
  border-radius: 50%;
  background: #fff;
}

.timeline-item.ok .timeline-dot {
  border-color: #16a34a;
  background: #eaf8f1;
}

.timeline-item.fail .timeline-dot {
  border-color: #dc2626;
  background: #fef2f2;
}

.timeline-item.pending .timeline-dot {
  border-color: #f59e0b;
  background: #fff3df;
}

.timeline-card {
  overflow: hidden;
  border: 1px solid #e1e6ee;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 6px rgba(16, 24, 40, 0.06);
}

.timeline-item.fail .timeline-card {
  border-color: #fecaca;
}

.timeline-item.pending .timeline-card {
  border-color: #ffe0a3;
  background: linear-gradient(180deg, #fffbeb, #fff);
}

.timeline-card > header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-bottom: 1px solid #edf0f4;
  background: #f7f8fa;
}

.timeline-card > header > strong {
  color: #101828;
  font-size: 12px;
}

.timeline-card > header > b {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #17233d;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-tag,
.release-status {
  align-self: center;
  flex: 0 0 auto;
  min-height: 0;
  height: auto;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 400;
  line-height: 1.2;
}

.channel-tag.beta {
  border: 1px solid #ffe0a3;
  background: #fff3df;
  color: #b06a18;
}

.channel-tag.product,
.release-status.ok {
  background: #eaf8f1;
  color: #27815d;
}

.release-status.fail {
  background: #fee2e2;
  color: #b91c1c;
}

.release-status.pending {
  background: #fff3df;
  color: #b06a18;
}

.timeline-card__body {
  padding: 9px 10px;
}

.timeline-card__body > p {
  margin: 0 0 8px;
  color: #667085;
  font-size: 10px;
  line-height: 1.55;
}

.failure-reason {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid #fecaca;
  border-left: 3px solid #dc2626;
  border-radius: 6px;
  background: #fef2f2;
  color: #7f1d1d;
  font-size: 10px;
  line-height: 1.5;
}

.failure-reason strong {
  color: #b91c1c;
  font-size: 9px;
}

.history-structure-label {
  margin-bottom: 5px;
  color: #475467;
  font-size: 9px;
  font-weight: 800;
}

.history-structure {
  display: flex;
  gap: 5px;
  margin-bottom: 7px;
  flex-wrap: wrap;
}

.history-structure > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: 1px solid #e1e6ee;
  border-radius: 5px;
  background: #f7f8fa;
  color: #17233d;
  font-size: 9px;
}

.history-structure .capability-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.history-structure .capability-type-tag {
  min-height: 14px;
  padding: 1px 4px;
  font-size: 8px;
}

.history-structure b {
  color: #16a34a;
  font-size: 8px;
}

.release-meta {
  display: flex;
  gap: 10px;
  padding-top: 7px;
  border-top: 1px dashed #e7ebf1;
  color: #98a2b3;
  font-size: 9px;
  flex-wrap: wrap;
}

.history-actions {
  margin-top: 7px;
}

.history-more {
  display: flex;
  justify-content: center;
  padding: 10px 0 0;
}

.history-end {
  margin: 9px 0 0;
  color: #98a2b3;
  font-size: 9px;
  text-align: center;
}

.extension-toast {
  position: fixed;
  top: 84px;
  left: 50%;
  z-index: 320;
  max-width: min(680px, calc(100vw - 40px));
  padding: 9px 17px;
  border-radius: 999px;
  background: #101828;
  color: #fff;
  box-shadow: 0 18px 44px rgba(16, 24, 40, 0.24);
  font-size: 12px;
  transform: translateX(-50%);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

@media (max-width: 1180px) {
  .filter-grid,
  .filter-grid.is-department-level {
    grid-template-columns: minmax(120px, 0.7fr) minmax(260px, 1.5fr) minmax(180px, 1fr);
  }

  .filter-field--keyword {
    grid-column: 1 / 3;
  }

  .filter-actions {
    justify-content: flex-end;
  }

  .extension-board {
    grid-template-columns: minmax(260px, 0.38fr) minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .extension-hero h2 {
    font-size: 34px;
  }

  .filter-grid,
  .filter-grid.is-department-level {
    grid-template-columns: 1fr 1fr;
  }

  .filter-field--department,
  .filter-field--keyword {
    grid-column: 1 / -1;
  }

  .filter-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .extension-board {
    height: auto;
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .scene-tree-card {
    max-height: 360px;
  }

  .detail-card {
    min-height: 580px;
  }
}

@media (max-width: 600px) {
  .extension-hero {
    padding: 20px 0;
  }

  .filter-grid,
  .filter-grid.is-department-level {
    grid-template-columns: 1fr;
  }

  .filter-field--department,
  .filter-field--keyword,
  .filter-actions {
    grid-column: auto;
  }

  .scene-header {
    flex-direction: column;
  }

  .scene-header__actions {
    width: 100%;
  }

  .scene-header__actions .extension-button {
    flex: 1;
  }

  .modal-overlay {
    padding: 12px;
  }
}
</style>

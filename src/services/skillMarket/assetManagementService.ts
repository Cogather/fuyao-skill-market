import {
  publishHttpExtension,
  queryHttpExtensionDetail,
  queryHttpExtensionHistory,
  queryHttpHydratedExtensionScenes,
  queryHttpPublishableOrganizations,
  type ExtensionScope,
  type PublishableOrganization,
} from './extensionPublishHttp';
import {
  MOCK_EXTENSION_ORGANIZATIONS,
  MOCK_EXTENSION_PRODUCTS,
  getSharedMockExtensionScenes,
  type ExtensionCapabilityType,
  type ExtensionProduct,
  type ExtensionRelease,
  type ExtensionScene,
} from './extensionPublishMock';
import { queryHarnessCapabilityCatalogPage } from './harnessCapabilityPlanningService';
import {
  queryPlanningTaskDetailFileContent,
  queryPlanningTaskDetailFilePaths,
} from './planningTaskDetailService';
import { skillBaseService } from './skillBaseService';
import { getProductPlanning } from './skillPlanningService';
import { latestSkillMasterVersion, type SkillMasterRecord } from './skillMasterManagementService';
import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';
import type {
  HarnessAsset,
  HarnessAssetApi,
  HarnessAssetDetail,
  HarnessAssetFile,
  HarnessAssetOrganization,
  HarnessAssetPageQuery,
  HarnessAssetPageResult,
  HarnessAssetProduct,
  HarnessAssetQualityReport,
  HarnessAssetRelease,
  HarnessAssetScope,
  HarnessAssetType,
  HarnessAtomicAssetType,
  PublishHarnessAssetInput,
} from './assetManagementTypes';
import { normalizeHarnessAssetVersion } from './assetManagementTypes';
import { updateHarnessAssetPerson } from './assetPersonManagementService';
import {
  queryHttpHarnessAssetComponentDetail,
  queryHttpHarnessAssetPage,
} from './assetManagementHttp';

type AssetTransport = 'http' | 'mock';

type AtomicAssetQueryLane = {
  kind: 'atomic';
  type: HarnessAtomicAssetType;
  queryScope: HarnessAssetScope;
  batchSize: number;
  nextPageNum: number;
  done: boolean;
  total?: number;
  totalKnown: boolean;
  rawKeys: Set<string>;
  repeatedFullPageCount: number;
};

type ExtensionAssetQueryLane = {
  kind: 'extension';
  batchSize: number;
  offset: number;
  done: boolean;
  assets?: HarnessAsset[];
  total?: number;
  totalKnown: boolean;
};

type AssetQueryLane = AtomicAssetQueryLane | ExtensionAssetQueryLane;

type AssetQueryState = {
  scope: HarnessAssetScope;
  products: HarnessAssetProduct[];
  pageSize: number;
  lanes: AssetQueryLane[];
  assets: HarnessAsset[];
  assetKeys: Set<string>;
  lastRequestedPage: number;
};

const ATOMIC_TYPES: HarnessAtomicAssetType[] = ['Agent', 'Skill', 'Command'];

function normalizedPage(page: HarnessAssetPageQuery): HarnessAssetPageQuery {
  return {
    pageNum: Math.max(1, Math.floor(Number(page.pageNum) || 1)),
    pageSize: Math.max(1, Math.floor(Number(page.pageSize) || 1)),
  };
}

function assetKey(
  asset: Pick<
    HarnessAsset,
    'assetType' | 'id' | 'departmentName' | 'productId' | 'productName' | 'name'
  >,
): string {
  return asset.id
    ? `${asset.assetType}:${asset.id}`
    : [
        asset.assetType,
        asset.departmentName,
        asset.productId || asset.productName,
        asset.name,
      ].join(':');
}

function normalizedPath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function dimensionScope(scope: HarnessAssetScope): ExtensionScope {
  const product = scope.product;
  return {
    dimType: product ? '产品级' : '部门级',
    dimCode: product?.id || scope.department.code || scope.department.id,
    dimName: product?.name || scope.department.name,
    productId: product?.id ?? '',
    departmentPath: [...scope.department.path],
  };
}

function aggregationScopes(
  scope: HarnessAssetScope,
  products: HarnessAssetProduct[],
  transport: AssetTransport,
): HarnessAssetScope[] {
  if (transport === 'mock' || scope.product) return [scope];
  return [
    scope,
    ...products.map((product) => ({
      ...scope,
      product: { ...product, departmentPath: [...product.departmentPath] },
    })),
  ];
}

function atomicQuery(scope: HarnessAssetScope, transport: AssetTransport) {
  if (transport === 'mock') {
    return {
      userId: scope.userId,
      departmentName: scope.department.name,
      ...(scope.product ? { level: '产品级', product: scope.product.name } : {}),
    };
  }
  const dimension = dimensionScope(scope);
  return {
    userId: scope.userId,
    dimType: dimension.dimType,
    dimCode: dimension.dimCode,
    dimName: dimension.dimName,
    departmentName: scope.department.name,
    level: dimension.dimType,
    product: scope.product?.name ?? '',
  };
}

function recordMatchesScope(
  record: SkillMasterRecord,
  scope: HarnessAssetScope,
  products: HarnessAssetProduct[],
): boolean {
  if (scope.product) return record.product === scope.product.name;
  if (record.level === '产品级' && record.product) {
    return products.some((product) => product.name === record.product);
  }
  const path = normalizedPath(scope.department.path);
  return record.department === scope.department.name || path.includes(record.department);
}

function atomicAsset(
  type: HarnessAtomicAssetType,
  record: SkillMasterRecord,
  scope: HarnessAssetScope,
  products: HarnessAssetProduct[],
): HarnessAsset {
  const versions = (record.versions ?? [])
    .map((version) => normalizeHarnessAssetVersion(version.version))
    .filter(Boolean);
  const currentVersion = normalizeHarnessAssetVersion(
    latestSkillMasterVersion(record)?.version ?? '',
  );
  const product = products.find((item) => item.name === record.product);
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    assetType: type,
    currentVersion,
    versions,
    owner: record.owner,
    developer: record.developOwner,
    departmentName: record.department || scope.department.name,
    departmentPath: product ? [...product.departmentPath] : [...scope.department.path],
    productId: product?.id ?? '',
    productName: product?.name ?? record.product,
    auto: false,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    // 原子能力由 Extension 打包发布，规划服务没有独立的发布或历史接口。
    releases: [],
    publishable: false,
  };
}

function releaseTimeDescending(left: ExtensionRelease, right: ExtensionRelease): number {
  return right.publishedAt.localeCompare(left.publishedAt);
}

function mapExtensionRelease(release: ExtensionRelease): HarnessAssetRelease {
  return {
    id: release.id,
    version: normalizeHarnessAssetVersion(release.version),
    publishedAt: release.publishedAt,
    organization: { id: release.organization, name: release.organization },
    notes: release.description,
    publisher: `${release.operator.name}${release.operator.no ? ` ${release.operator.no}` : ''}`,
    status: release.status,
    extensionName: release.extensionName,
  };
}

function sceneReleases(scene: ExtensionScene): ExtensionRelease[] {
  return [...(scene.publishing ? [scene.publishing] : []), ...scene.releases].sort(
    releaseTimeDescending,
  );
}

function nextExtensionVersion(scene: ExtensionScene): string {
  if (scene.publishing?.version) return normalizeHarnessAssetVersion(scene.publishing.version);
  const minorVersions = scene.releases
    .map((release) => Number(normalizeHarnessAssetVersion(release.version).split('.')[1]))
    .filter((version) => Number.isFinite(version));
  return `0.${Math.max(0, ...minorVersions) + 1}`;
}

function mockProductName(sceneProductId: string): string {
  return MOCK_EXTENSION_PRODUCTS.find((product) => product.id === sceneProductId)?.name ?? '';
}

function productForScene(
  scene: ExtensionScene,
  products: HarnessAssetProduct[],
  scope: HarnessAssetScope,
  transport: AssetTransport,
): HarnessAssetProduct | undefined {
  const direct = products.find((product) => product.id === scene.productId);
  if (direct) return direct;
  if (transport === 'mock') {
    const name = mockProductName(scene.productId);
    if (name) return products.find((product) => product.name === name);
  }
  if (!scope.product && scene.productId === (scope.department.code || scope.department.id)) {
    return {
      id: '',
      name: scope.department.name,
      departmentPath: [...scope.department.path],
    };
  }
  return scope.product;
}

function asciiSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function generatedExtensionName(scene: ExtensionScene, product: HarnessAssetProduct): string {
  const productSlug = asciiSlug(product.name);
  const sceneSource = `${scene.primary}-${scene.name}`;
  const sceneSlug = asciiSlug(sceneSource) || `scene-${stableHash(sceneSource)}`;
  const name = [productSlug, sceneSlug, 'extension'].filter(Boolean).join('-');
  return name.slice(0, 64).replace(/-+$/g, '') || `scene-${stableHash(scene.id)}-extension`;
}

function extensionPublishName(asset: HarnessAsset, scene: ExtensionScene): string {
  const requiredPrefix = getProductCatalogItemNamePrefix('产品级', asset.productName);
  if (
    isCatalogItemNameValid(asset.name) &&
    (!requiredPrefix || asset.name.startsWith(requiredPrefix))
  ) {
    return asset.name;
  }
  return generatedExtensionName(scene, {
    id: asset.productId,
    name: asset.productName,
    departmentPath: [...asset.departmentPath],
  });
}

function extensionAsset(scene: ExtensionScene, product: HarnessAssetProduct): HarnessAsset {
  const releases = sceneReleases(scene);
  const latestSuccessfulVersion = releases.find((release) => release.status === '成功')?.version;
  const nextPublishVersion = scene.publishable ? nextExtensionVersion(scene) : '';
  const currentVersion = scene.publishable
    ? normalizeHarnessAssetVersion(
        latestSuccessfulVersion || scene.publishing?.version || nextPublishVersion,
      )
    : '';
  const versions = [
    ...new Set(
      [
        nextPublishVersion,
        currentVersion,
        ...releases.map((release) => normalizeHarnessAssetVersion(release.version)),
      ].filter(Boolean),
    ),
  ];
  return {
    id: scene.id,
    name: scene.extension.name || generatedExtensionName(scene, product),
    description:
      scene.extension.description ||
      `基于场景「${scene.primary} / ${scene.name}」自动生成的 Extension`,
    assetType: 'Extension',
    firstScene: scene.primary,
    secondScene: scene.name,
    currentVersion,
    nextPublishVersion,
    versions,
    owner: '',
    developer: '',
    departmentName: product.departmentPath.at(-1) ?? '',
    departmentPath: [...product.departmentPath],
    productId: product.id,
    productName: product.name,
    auto: true,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    releases: releases.map(mapExtensionRelease),
    publishable: scene.publishable && Boolean(currentVersion),
  };
}

function extensionSceneMatchesScope(
  scene: ExtensionScene,
  scope: HarnessAssetScope,
  products: HarnessAssetProduct[],
  transport: AssetTransport,
): boolean {
  const product = productForScene(scene, products, scope, transport);
  if (!product) return false;
  if (scope.product) return product.id === scope.product.id || product.name === scope.product.name;
  return pathStartsWith(product.departmentPath, normalizedPath(scope.department.path));
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function queryQualityReport(
  asset: HarnessAsset,
  version: string,
): Promise<HarnessAssetQualityReport | null> {
  if (asset.assetType !== 'Skill' || !version) return null;
  const response = await skillBaseService.getSkillEvaluationDetail({
    skillName: asset.name,
    version,
  });
  if (response?.meta?.success !== true || !response.data) {
    throw new Error(String(response?.meta?.message || 'Skill 质量报告加载失败'));
  }
  const report = response.data;
  const calculatedPercent = report.max ? ((report.total ?? 0) / report.max) * 100 : 0;
  const overallScore = Number(report.percent ?? calculatedPercent);
  const normalizedScore = Number.isFinite(overallScore) ? overallScore : 0;
  return {
    overallScore: normalizedScore,
    grade: report.grade,
    summary: `该 Skill 质量评估为 ${report.grade || '未分级'}，综合得分 ${formatScore(
      normalizedScore,
    )} 分。`,
    items: (report.dimensions ?? []).map((dimension) => ({
      name: dimension.name,
      value: `${formatScore(dimension.score)}/${formatScore(dimension.max)}`,
      pass: dimension.max <= 0 || dimension.score / dimension.max >= 0.6,
    })),
  };
}

async function atomicDetail(
  scope: HarnessAssetScope,
  asset: HarnessAsset,
  version: string,
): Promise<HarnessAssetDetail> {
  if (!version) return { versions: [...asset.versions], files: [] };
  const capabilityType = asset.assetType.toLowerCase() as ExtensionCapabilityType;
  const identity = {
    userId: scope.userId,
    capabilityType,
    capabilityName: asset.name,
    version,
  };
  const paths = await queryPlanningTaskDetailFilePaths(identity);
  const files = await Promise.all(
    paths.map(
      async (path): Promise<HarnessAssetFile> => ({
        path,
        content: await queryPlanningTaskDetailFileContent(identity, path),
        category: capabilityType,
      }),
    ),
  );
  return { versions: [...asset.versions], files };
}

async function extensionDetail(
  scope: HarnessAssetScope,
  asset: HarnessAsset,
  scene: ExtensionScene | undefined,
  version: string,
): Promise<HarnessAssetDetail> {
  if (!scene) return { versions: [...asset.versions], files: [] };
  const normalizedVersion = normalizeHarnessAssetVersion(version);
  const release = sceneReleases(scene).find(
    (item) => normalizeHarnessAssetVersion(item.version) === normalizedVersion,
  );
  const capabilityItems = release
    ? release.items
    : (['skill', 'command', 'agent'] as ExtensionCapabilityType[]).flatMap((type) =>
        scene.capabilities[type].map((capability) => ({
          type,
          name: capability.name,
          version: capability.version,
        })),
      );
  const files = await Promise.all(
    capabilityItems.flatMap((capability) => {
      if (!capability.version) return [];
      const category = capability.type;
      const identity = {
        userId: scope.userId,
        capabilityType: category,
        capabilityName: capability.name,
        version: capability.version,
      };
      return [
        (async (): Promise<HarnessAssetFile[]> => {
          const paths = await queryPlanningTaskDetailFilePaths(identity);
          return Promise.all(
            paths.map(async (path) => ({
              path: `${category}s/${capability.name}/${path}`,
              content: await queryPlanningTaskDetailFileContent(identity, path),
              category,
            })),
          );
        })(),
      ];
    }),
  );
  return { versions: [...asset.versions], files: files.flat() };
}

function toHarnessOrganization(organization: PublishableOrganization): HarnessAssetOrganization {
  return { id: organization.id, name: organization.name };
}

function toPublishableOrganization(
  organization: HarnessAssetOrganization,
): PublishableOrganization {
  return { ...organization, deptId: '', deptName: '' };
}

function mockProductsForDepartment(
  products: ExtensionProduct[],
  scope: Omit<HarnessAssetScope, 'product' | 'assetType'>,
): ExtensionProduct[] {
  const path = normalizedPath(scope.department.path);
  return products.filter((product) => pathStartsWith(product.departmentPath, path));
}

function cloneScene(scene: ExtensionScene): ExtensionScene {
  return {
    ...scene,
    extension: { ...scene.extension },
    capabilities: {
      skill: scene.capabilities.skill.map((item) => ({
        ...item,
        files: item.files.map((file) => ({ ...file })),
      })),
      command: scene.capabilities.command.map((item) => ({
        ...item,
        files: item.files.map((file) => ({ ...file })),
      })),
      agent: scene.capabilities.agent.map((item) => ({
        ...item,
        files: item.files.map((file) => ({ ...file })),
      })),
    },
    releases: scene.releases.map((release) => ({
      ...release,
      operator: { ...release.operator },
      items: release.items.map((item) => ({ ...item })),
    })),
    publishing: scene.publishing
      ? {
          ...scene.publishing,
          operator: { ...scene.publishing.operator },
          items: scene.publishing.items.map((item) => ({ ...item })),
        }
      : null,
  };
}

function createHarnessAssetApi(transport: AssetTransport): HarnessAssetApi {
  const sharedMockScenes = transport === 'mock' ? getSharedMockExtensionScenes() : [];
  const sceneByAssetId = new Map<string, ExtensionScene>();
  const scopeByAssetId = new Map<string, HarnessAssetScope>();
  const extensionPageCache = new Map<string, ExtensionScene[]>();
  const productCache = new Map<string, HarnessAssetProduct[]>();
  const productCacheGeneration = new Map<string, number>();
  const assetQueryStates = new Map<string, AssetQueryState>();
  const assetQueryGeneration = new Map<string, number>();
  const extensionLoadGeneration = new Map<string, number>();
  const pendingExtensionAssets = new Map<string, Promise<ExtensionScene | undefined>>();

  function departmentKey(scope: Pick<HarnessAssetScope, 'department'>): string {
    return `${scope.department.code || scope.department.id}:${scope.department.path.join('/')}`;
  }

  async function loadProducts(
    scope: Omit<HarnessAssetScope, 'product' | 'assetType'>,
  ): Promise<HarnessAssetProduct[]> {
    if (transport === 'http' && !scope.department.code.trim()) return [];
    const cacheKey = departmentKey(scope);
    const generation = (productCacheGeneration.get(cacheKey) ?? 0) + 1;
    productCacheGeneration.set(cacheKey, generation);
    const options = await getProductPlanning(
      '',
      scope.department.name,
      scope.department.code || scope.department.id,
      scope.userName,
    );
    const byName = new Map<string, HarnessAssetProduct>();
    options.forEach((option) => {
      if (!option.offeringName) return;
      byName.set(option.offeringName, {
        id: option.offeringId || option.offeringName,
        name: option.offeringName,
        departmentPath: [...scope.department.path],
      });
    });
    if (transport === 'mock') {
      mockProductsForDepartment(MOCK_EXTENSION_PRODUCTS, scope).forEach((product) => {
        if (!byName.has(product.name)) {
          byName.set(product.name, {
            id: product.id,
            name: product.name,
            departmentPath: [...product.departmentPath],
          });
        }
      });
    }
    const nextProducts = [...byName.values()];
    if (productCacheGeneration.get(cacheKey) === generation) {
      productCache.set(cacheKey, nextProducts);
    }
    return nextProducts.map((product) => ({
      ...product,
      departmentPath: [...product.departmentPath],
    }));
  }

  async function productsForScope(scope: HarnessAssetScope): Promise<HarnessAssetProduct[]> {
    const cached = productCache.get(departmentKey(scope));
    if (!cached) return loadProducts(scope);
    return cached.map((product) => ({
      ...product,
      departmentPath: [...product.departmentPath],
    }));
  }

  function extensionCacheKey(scope: HarnessAssetScope, products: HarnessAssetProduct[]): string {
    return JSON.stringify({
      userId: scope.userId,
      department: departmentKey(scope),
      productId: scope.product?.id ?? '',
      products: products.map((product) => product.id),
    });
  }

  async function loadExtensionScenes(
    scope: HarnessAssetScope,
    products: HarnessAssetProduct[],
    refresh = false,
  ): Promise<ExtensionScene[]> {
    const cacheKey = extensionCacheKey(scope, products);
    if (!refresh) {
      const cached = extensionPageCache.get(cacheKey);
      if (cached) return cached;
    }
    const generation = (extensionLoadGeneration.get(cacheKey) ?? 0) + 1;
    extensionLoadGeneration.set(cacheKey, generation);
    const scopedScenes =
      transport === 'http'
        ? await Promise.all(
            aggregationScopes(scope, products, transport).map(async (queryScope) => ({
              scope: queryScope,
              scenes: await queryHttpHydratedExtensionScenes(
                scope.userId,
                dimensionScope(queryScope),
              ),
            })),
          )
        : [{ scope, scenes: sharedMockScenes }];
    const nextScopeByAssetId = new Map<string, HarnessAssetScope>();
    const scenes = scopedScenes.flatMap(({ scope: sceneScope, scenes: batch }) => {
      batch.forEach((scene) => nextScopeByAssetId.set(scene.id, sceneScope));
      return batch;
    });
    const uniqueScenes = [...new Map(scenes.map((scene) => [scene.id, scene])).values()];
    if (extensionLoadGeneration.get(cacheKey) === generation) {
      uniqueScenes.forEach((scene) => {
        sceneByAssetId.set(scene.id, scene);
        const sceneScope = nextScopeByAssetId.get(scene.id);
        if (sceneScope) scopeByAssetId.set(scene.id, sceneScope);
      });
      extensionPageCache.set(cacheKey, uniqueScenes);
    }
    return uniqueScenes;
  }

  function assetQueryStateKey(scope: HarnessAssetScope, pageSize: number): string {
    return JSON.stringify({
      transport,
      userId: scope.userId,
      department: departmentKey(scope),
      productId: scope.product?.id ?? '',
      productName: scope.product?.name ?? '',
      assetType: scope.assetType ?? 'all',
      pageSize,
    });
  }

  async function createAssetQueryState(
    scope: HarnessAssetScope,
    pageSize: number,
  ): Promise<AssetQueryState> {
    const products = await productsForScope(scope);
    const requestedTypes =
      scope.assetType && scope.assetType !== 'all'
        ? [scope.assetType]
        : ([...ATOMIC_TYPES, 'Extension'] as HarnessAssetType[]);
    const atomicTypes = requestedTypes.filter(
      (type): type is HarnessAtomicAssetType => type !== 'Extension',
    );
    const queryScopes = aggregationScopes(scope, products, transport);
    const laneCount =
      atomicTypes.length * queryScopes.length + (requestedTypes.includes('Extension') ? 1 : 0);
    const batchSize = Math.max(1, Math.ceil(pageSize / Math.max(1, laneCount)));
    const lanes: AssetQueryLane[] = atomicTypes.flatMap((type) =>
      queryScopes.map((queryScope) => ({
        kind: 'atomic' as const,
        type,
        queryScope,
        batchSize,
        nextPageNum: 1,
        done: false,
        totalKnown: false,
        rawKeys: new Set<string>(),
        repeatedFullPageCount: 0,
      })),
    );
    if (requestedTypes.includes('Extension')) {
      lanes.push({
        kind: 'extension',
        batchSize,
        offset: 0,
        done: false,
        totalKnown: false,
      });
    }
    return {
      scope,
      products,
      pageSize,
      lanes,
      assets: [],
      assetKeys: new Set<string>(),
      lastRequestedPage: 0,
    };
  }

  function atomicRecordKey(lane: AtomicAssetQueryLane, record: SkillMasterRecord): string {
    return (
      record.id ||
      [lane.type, record.level, record.product, record.department, record.name].join(':')
    );
  }

  async function fetchAssetLane(
    state: AssetQueryState,
    lane: AssetQueryLane,
  ): Promise<HarnessAsset[]> {
    if (lane.done) return [];
    if (lane.kind === 'extension') {
      if (!lane.assets) {
        const scenes = await loadExtensionScenes(state.scope, state.products, true);
        lane.assets = scenes.flatMap((scene) => {
          if (!extensionSceneMatchesScope(scene, state.scope, state.products, transport)) return [];
          const product = productForScene(scene, state.products, state.scope, transport);
          return product ? [extensionAsset(scene, product)] : [];
        });
        lane.total = lane.assets.length;
        lane.totalKnown = true;
      }
      const assets = lane.assets.slice(lane.offset, lane.offset + lane.batchSize);
      lane.offset += assets.length;
      lane.done = lane.offset >= lane.assets.length;
      return assets;
    }

    const pageNum = lane.nextPageNum;
    const result = await queryHarnessCapabilityCatalogPage(
      lane.type.toLowerCase() as 'skill' | 'command' | 'agent',
      {
        ...atomicQuery(lane.queryScope, transport),
        pageNum,
        pageSize: lane.batchSize,
      },
    );
    lane.nextPageNum += 1;
    lane.total = result.total;
    lane.totalKnown = result.totalKnown;

    let newRawKeyCount = 0;
    result.list.forEach((record) => {
      const key = atomicRecordKey(lane, record);
      if (lane.rawKeys.has(key)) return;
      lane.rawKeys.add(key);
      newRawKeyCount += 1;
    });
    if (!result.totalKnown && result.list.length === lane.batchSize && newRawKeyCount === 0) {
      lane.repeatedFullPageCount += 1;
    } else {
      lane.repeatedFullPageCount = 0;
    }
    lane.done = !result.hasMore || lane.repeatedFullPageCount >= 3;

    return result.list
      .filter((record) => recordMatchesScope(record, state.scope, state.products))
      .map((record) => atomicAsset(lane.type, record, state.scope, state.products));
  }

  function appendUniqueAssets(state: AssetQueryState, batches: HarnessAsset[][]): number {
    const before = state.assets.length;
    batches.forEach((batch) => {
      batch.forEach((asset) => {
        const key = assetKey(asset);
        if (state.assetKeys.has(key)) return;
        state.assetKeys.add(key);
        state.assets.push(asset);
      });
    });
    return state.assets.length - before;
  }

  async function ensureAssetPageMaterialized(
    state: AssetQueryState,
    targetEnd: number,
  ): Promise<void> {
    while (state.assets.length < targetEnd) {
      const activeLanes = state.lanes.filter((lane) => !lane.done);
      if (activeLanes.length === 0) return;
      const batches = await Promise.all(activeLanes.map((lane) => fetchAssetLane(state, lane)));
      appendUniqueAssets(state, batches);
    }
  }

  function assetQueryTotal(state: AssetQueryState, hasMore: boolean, pageEnd: number): number {
    if (!hasMore) return state.assets.length;
    const onlyLane = state.lanes.length === 1 ? state.lanes[0] : undefined;
    if (onlyLane?.totalKnown && onlyLane.total !== undefined) return onlyLane.total;
    return Math.max(state.assets.length + 1, pageEnd + 1);
  }

  function assetScope(scope: HarnessAssetScope, asset: HarnessAsset): HarnessAssetScope {
    return asset.assetType === 'Extension' ? (scopeByAssetId.get(asset.id) ?? scope) : scope;
  }

  async function ensureExtensionScene(
    scope: HarnessAssetScope,
    asset: HarnessAsset,
    refresh = false,
  ): Promise<ExtensionScene | undefined> {
    const cached = sceneByAssetId.get(asset.id);
    if (transport !== 'http' || (cached && !refresh)) return cached;
    const pending = pendingExtensionAssets.get(asset.id);
    if (pending) return pending;
    // 卡片详情只查询组件元信息；发布时按 Extension 编码获取当前场景配置。
    const load = (async () => {
      let product: HarnessAssetProduct | undefined;
      if (asset.productName) {
        product = asset.productId
          ? { id: asset.productId, name: asset.productName, departmentPath: asset.departmentPath }
          : (await productsForScope(scope)).find((item) => item.name === asset.productName);
        if (!product) throw new Error('请先选择该 Extension 所属部门和产品后再发布');
      } else if (!scope.department.code || scope.department.name !== asset.departmentName) {
        throw new Error('请先选择该 Extension 所属部门后再发布');
      }
      const queryScope = { ...scope, product };
      const scene = await queryHttpExtensionDetail(scope.userId, dimensionScope(queryScope), {
        extensionName: asset.name,
        firstScene: asset.firstScene ?? undefined,
        secondScene: asset.secondScene ?? undefined,
      });
      sceneByAssetId.set(asset.id, scene);
      scopeByAssetId.set(asset.id, queryScope);
      return scene;
    })();
    pendingExtensionAssets.set(asset.id, load);
    try {
      return await load;
    } finally {
      pendingExtensionAssets.delete(asset.id);
    }
  }

  async function refreshHttpScene(
    scope: HarnessAssetScope,
    scene: ExtensionScene,
  ): Promise<ExtensionScene> {
    if (transport !== 'http') return scene;
    const refreshed = await queryHttpExtensionHistory(dimensionScope(scope), scene);
    if (
      scene.publishing &&
      !refreshed.publishing &&
      !refreshed.releases.some(
        (release) =>
          normalizeHarnessAssetVersion(release.version) ===
          normalizeHarnessAssetVersion(scene.publishing?.version ?? ''),
      )
    ) {
      refreshed.publishing = scene.publishing;
    }
    sceneByAssetId.set(scene.id, refreshed);
    return refreshed;
  }

  function syncExtensionAsset(asset: HarnessAsset, scene: ExtensionScene): HarnessAssetRelease[] {
    const nextAsset = extensionAsset(scene, {
      id: asset.productId,
      name: asset.productName,
      departmentPath: [...asset.departmentPath],
    });
    Object.assign(asset, nextAsset, { id: asset.id, status: undefined });
    return nextAsset.releases;
  }

  return {
    queryProducts: loadProducts,
    updatePerson: (input) => updateHarnessAssetPerson(input, transport),

    async queryAssets(scope, requestedPage): Promise<HarnessAssetPageResult> {
      const page = normalizedPage(requestedPage);
      if (transport === 'http') {
        return queryHttpHarnessAssetPage(scope, page, productCache.get(departmentKey(scope)));
      }
      const stateKey = assetQueryStateKey(scope, page.pageSize);
      let state = assetQueryStates.get(stateKey);
      const needsReset =
        page.pageNum === 1 ||
        !state ||
        page.pageNum < state.lastRequestedPage ||
        page.pageNum > state.lastRequestedPage + 1;
      if (needsReset) {
        const generation = (assetQueryGeneration.get(stateKey) ?? 0) + 1;
        assetQueryGeneration.set(stateKey, generation);
        assetQueryStates.delete(stateKey);
        const nextState = await createAssetQueryState(scope, page.pageSize);
        if (assetQueryGeneration.get(stateKey) !== generation) {
          return { list: [], total: 0, hasMore: false };
        }
        assetQueryStates.set(stateKey, nextState);
        state = nextState;
      }
      if (!state) return { list: [], total: 0, hasMore: false };
      const start = (page.pageNum - 1) * page.pageSize;
      const end = start + page.pageSize;
      try {
        await ensureAssetPageMaterialized(state, end);
      } catch (error) {
        if (assetQueryStates.get(stateKey) === state) {
          assetQueryStates.delete(stateKey);
          assetQueryGeneration.set(stateKey, (assetQueryGeneration.get(stateKey) ?? 0) + 1);
        }
        throw error;
      }
      const hasMore = state.assets.length > end || state.lanes.some((lane) => !lane.done);
      state.lastRequestedPage = page.pageNum;
      return {
        list: state.assets.slice(start, end),
        total: assetQueryTotal(state, hasMore, end),
        hasMore,
      };
    },

    async queryDetail(scope, asset, version, options) {
      if (transport === 'http') {
        const component = await queryHttpHarnessAssetComponentDetail(scope, asset);
        const versions = component.versions.map((item) =>
          normalizeHarnessAssetVersion(item.version),
        );
        const selectedVersion = versions.includes(version ?? '') ? version! : (versions[0] ?? '');
        const content =
          asset.assetType === 'Extension' || options?.includeFiles === false
            ? { files: [] }
            : await atomicDetail(scope, asset, selectedVersion);
        return { component, versions, version: selectedVersion, files: content.files };
      }
      if (asset.assetType !== 'Extension')
        return atomicDetail(scope, asset, version ?? asset.currentVersion);
      return extensionDetail(
        scope,
        asset,
        await ensureExtensionScene(scope, asset),
        version ?? asset.currentVersion,
      );
    },

    async queryPublishDetail(scope, asset) {
      if (asset.canPublish === false) throw new Error('当前用户没有发布权限');
      if (asset.assetType !== 'Extension') return atomicDetail(scope, asset, asset.currentVersion);
      const scene = await ensureExtensionScene(scope, asset, true);
      if (!scene) throw new Error('未找到该 Extension 对应场景');
      if (!scene.publishable) throw new Error('场景未配置或不完备，无法发布');
      // 发布预览使用本次查询到的当前绑定，不以历史发布版本的组件清单覆盖。
      return extensionDetail(scope, asset, scene, '');
    },

    async queryQualityReport(_scope, asset, version) {
      return queryQualityReport(asset, version);
    },

    async queryOrganizations(scope, asset) {
      if (asset.assetType === 'Extension') await ensureExtensionScene(scope, asset);
      const queryScope = assetScope(scope, asset);
      const organizations =
        transport === 'http'
          ? await queryHttpPublishableOrganizations(queryScope.userId, dimensionScope(queryScope))
          : MOCK_EXTENSION_ORGANIZATIONS;
      return organizations.map(toHarnessOrganization);
    },

    async queryReleases(scope, asset) {
      if (asset.assetType !== 'Extension') return [];
      const scene = await ensureExtensionScene(scope, asset);
      if (!scene) return [];
      const refreshed = await refreshHttpScene(assetScope(scope, asset), scene);
      sceneByAssetId.set(asset.id, refreshed);
      return syncExtensionAsset(asset, refreshed);
    },

    async queryExtensionReleaseContext(scope, asset) {
      const scene = await ensureExtensionScene(scope, asset, true);
      if (!scene || asset.assetType !== 'Extension') throw new Error('未找到该 Extension 对应场景');
      const queryScope = assetScope(scope, asset);
      const products = await productsForScope(queryScope);
      const product = productForScene(scene, products, queryScope, transport);
      if (asset.productName && !product?.id)
        throw new Error('未找到该 Extension 所属产品，请刷新后重试');
      // In the all-products view, publish with the card's product rather than the list filter.
      const extensionScope = dimensionScope({
        ...queryScope,
        product: product?.id ? product : undefined,
      });
      return { scene, scope: extensionScope, productName: product?.id ? product.name : '' };
    },

    async publish(input: PublishHarnessAssetInput) {
      const { asset, scope, organization } = input;
      if (asset.canPublish === false) throw new Error('当前用户没有发布权限');
      if (asset.assetType !== 'Extension') {
        throw new Error(
          'Skill、Command、Agent 将随 Extension 一起发布，请从 Extension 资产发起发布',
        );
      }
      const scene = await ensureExtensionScene(scope, asset);
      if (!scene) throw new Error('未找到该 Extension 对应场景');
      if (!scene.publishable) throw new Error('场景不完备，无法发布');
      if (scene.publishing) throw new Error('当前已有 Extension 发布进行中');

      const publishedAt = new Date().toISOString();
      const publishName = extensionPublishName(asset, scene);
      const release: ExtensionRelease = {
        version: nextExtensionVersion(scene),
        extensionName: publishName,
        description: asset.description,
        channel: input.channel === 'beta' ? 'Beta' : 'Product',
        operator: { no: scope.userId, name: scope.userName || '当前用户' },
        publishedAt,
        status: '进行中',
        organization: organization.name,
        items: (['skill', 'command', 'agent'] as ExtensionCapabilityType[]).flatMap((type) =>
          scene.capabilities[type].map((capability) => ({
            type,
            name: capability.name,
            version: capability.version,
          })),
        ),
      };

      if (transport === 'http') {
        const publishScope = assetScope(scope, asset);
        await publishHttpExtension({
          userId: publishScope.userId,
          operatorName: publishScope.userName,
          scope: dimensionScope(publishScope),
          scene,
          extensionName: publishName,
          description: asset.description,
          channel: input.channel ?? 'product',
          organization: toPublishableOrganization(organization),
        });
        sceneByAssetId.set(asset.id, cloneScene({ ...scene, publishing: release }));
      } else {
        scene.extension.name = publishName;
        scene.extension.description = asset.description;
        scene.publishing = release;
      }
      return mapExtensionRelease(release);
    },
  };
}

const transportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';

let api: HarnessAssetApi | null = null;

export function getHarnessAssetApi(): HarnessAssetApi {
  if (!api) api = createHarnessAssetApi(transportIsHttp ? 'http' : 'mock');
  return api;
}

export function usesHttpHarnessAssetApi(): boolean {
  return transportIsHttp;
}

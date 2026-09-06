import { getHarnessCapabilityPlanningApi } from './harnessCapabilityPlanningService';
import { latestSkillMasterVersion, type SkillMasterRecord } from './skillMasterManagementService';
import { getMockMarketDepartmentsTree } from './mock/marketDepartmentsTreeDefault';
import {
  MOCK_EXTENSION_PRODUCTS,
  getSharedMockExtensionScenes,
  type ExtensionRelease,
  type ExtensionScene,
} from './extensionPublishMock';
import { skillBaseService } from './skillBaseService';
import type {
  HarnessAsset,
  HarnessAssetApi,
  HarnessAssetDetail,
  HarnessAssetFile,
  HarnessAssetOrganization,
  HarnessAssetProduct,
  HarnessAssetQualityReport,
  HarnessAssetRelease,
  HarnessAssetScope,
  HarnessAssetType,
  PublishHarnessAssetInput,
} from './assetManagementTypes';
import {
  harnessAssetPublishVersion,
  hasInProgressCurrentRelease,
  normalizeHarnessAssetVersion,
} from './assetManagementTypes';

const MOCK_ORGANIZATIONS: HarnessAssetOrganization[] = [
  { id: 'org-fuyao', name: '扶摇组织' },
  { id: 'org-yunshan', name: '云山组织' },
  { id: 'org-haichuan', name: '海川组织' },
];

const ATOMIC_RELEASE_SEED: Array<{
  type: Exclude<HarnessAssetType, 'Extension'>;
  id: string;
  version: string;
}> = [
  { type: 'Skill', id: '504', version: '1.0.0' },
  { type: 'Command', id: 'command-master-1101', version: '0.1.1' },
  { type: 'Agent', id: 'agent-master-1101', version: '0.1.1' },
];

function releaseKey(type: HarnessAssetType, id: string): string {
  return `${type}:${id}`;
}

function cloneRelease(release: HarnessAssetRelease): HarnessAssetRelease {
  return { ...release, organization: { ...release.organization } };
}

function initialAtomicReleaseStore(): Map<string, HarnessAssetRelease[]> {
  return new Map(
    ATOMIC_RELEASE_SEED.map((seed, index) => [
      releaseKey(seed.type, seed.id),
      [
        {
          id: `mock-release-${index + 1}`,
          version: seed.version,
          publishedAt: `2026-08-${String(20 + index).padStart(2, '0')}T10:00:00.000Z`,
          organization: { id: 'org-fuyao', name: '扶摇组织' },
          notes: 'Mock 中已完成的资产发布记录',
          publisher: '张三',
          status: '成功' as const,
        },
      ],
    ]),
  );
}

function normalizedPath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function productMatchesDepartment(
  product: HarnessAssetProduct,
  departmentPath: string[],
): boolean {
  const path = normalizedPath(departmentPath);
  return path.length === 0 || pathStartsWith(product.departmentPath, path);
}

const MOCK_DEPARTMENT_PATHS = (() => {
  const paths: string[][] = [];
  const visit = (
    nodes: ReturnType<typeof getMockMarketDepartmentsTree>,
    parentPath: string[] = [],
  ): void => {
    nodes.forEach((node) => {
      const path = [...parentPath, node.deptName];
      paths.push(path);
      visit(node.children ?? [], path);
    });
  };
  visit(getMockMarketDepartmentsTree());
  return paths;
})();

function resolveDepartmentPath(name: string, selectedPath: string[]): string[] {
  const candidates = MOCK_DEPARTMENT_PATHS.filter((path) => path.at(-1) === name);
  return (
    candidates.find((path) => pathStartsWith(path, selectedPath)) ??
    candidates.find((path) => pathStartsWith(selectedPath, path)) ??
    candidates[0] ??
    []
  );
}

function recordMatchesScope(
  record: SkillMasterRecord,
  scope: HarnessAssetScope,
  availableProducts: HarnessAssetProduct[],
): boolean {
  if (scope.product) return record.product === scope.product.name;
  if (record.level === '产品级' && record.product) {
    return availableProducts.some((product) => product.name === record.product);
  }
  const selectedPath = normalizedPath(scope.department.path);
  return record.department === scope.department.name || selectedPath.includes(record.department);
}

function atomicAsset(
  type: Exclude<HarnessAssetType, 'Extension'>,
  record: SkillMasterRecord,
  scope: HarnessAssetScope,
  products: HarnessAssetProduct[],
  releases: HarnessAssetRelease[],
): HarnessAsset {
  const versionEntries = record.versions ?? [];
  const versions = versionEntries
    .map((version) => normalizeHarnessAssetVersion(version.version))
    .filter(Boolean);
  const currentVersion = normalizeHarnessAssetVersion(latestSkillMasterVersion(record)?.version ?? '');
  const product = products.find((item) => item.name === record.product);
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    assetType: type,
    currentVersion,
    versions,
    owner: record.owner,
    departmentName: record.department || scope.department.name,
    departmentPath: product ? [...product.departmentPath] : [...scope.department.path],
    productId: product?.id ?? '',
    productName: product?.name ?? record.product,
    auto: false,
    marketplace: {
      rating: type === 'Skill' && record.id === '504' ? 4.8 : 0,
      downloads: type === 'Skill' && record.id === '504' ? 256 : 0,
      calls: type === 'Skill' && record.id === '504' ? 560 : 0,
    },
    releases: releases.map(cloneRelease),
    publishable: Boolean(currentVersion),
  };
}

function mapExtensionRelease(release: ExtensionRelease): HarnessAssetRelease {
  return {
    id: release.id,
    version: normalizeHarnessAssetVersion(release.version),
    publishedAt: release.publishedAt,
    organization: {
      id: release.organization,
      name: release.organization,
    },
    notes: release.description,
    publisher: `${release.operator.name}${release.operator.no ? ` ${release.operator.no}` : ''}`,
    status:
      release.status === '失败' ? '失败' : release.status === '进行中' ? '进行中' : '成功',
    extensionName: release.extensionName,
  };
}

function compareReleaseTime(left: ExtensionRelease, right: ExtensionRelease): number {
  return right.publishedAt.localeCompare(left.publishedAt);
}

function nextExtensionVersion(scene: ExtensionScene): string {
  if (scene.publishing?.version) return normalizeHarnessAssetVersion(scene.publishing.version);
  const minorVersions = scene.releases
    .map((release) => Number(normalizeHarnessAssetVersion(release.version).split('.')[1]))
    .filter((version) => Number.isFinite(version));
  return `0.${Math.max(0, ...minorVersions) + 1}`;
}

function extensionAsset(
  scene: ExtensionScene,
  product: HarnessAssetProduct,
): HarnessAsset {
  const releases = [
    ...(scene.publishing ? [scene.publishing] : []),
    ...scene.releases,
  ].sort(compareReleaseTime);
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
        ...releases.map((item) => normalizeHarnessAssetVersion(item.version)),
      ].filter(Boolean),
    ),
  ];
  const generatedName = `${product.name}-${scene.name}-extension`
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-');
  return {
    id: scene.id,
    name: scene.extension.name || generatedName,
    description: scene.extension.description || `基于场景「${scene.primary} / ${scene.name}」自动生成的 Extension`,
    assetType: 'Extension',
    currentVersion,
    nextPublishVersion,
    versions,
    owner: '',
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

function atomicFileContent(asset: HarnessAsset, version: string): HarnessAssetFile[] {
  const description = asset.description || '暂无描述';
  if (asset.assetType === 'Skill') {
    return [
      {
        path: 'SKILL.md',
        category: 'skill',
        content: `# ${asset.name}\n\n${description}\n\n## 版本\n${version || '未生成版本'}\n\n## 输入\n由能力规划定义。\n\n## 输出\n返回结构化执行结果。`,
      },
      {
        path: 'scripts/run.sh',
        category: 'skill',
        content: `#!/bin/bash\n# ${asset.name} ${version}\nset -euo pipefail\necho "run ${asset.name}"`,
      },
    ];
  }
  return [
    {
      path: `${asset.name}.md`,
      category: asset.assetType === 'Command' ? 'command' : 'agent',
      content: `# ${asset.name}\n\n${description}\n\n当前版本：${version || '未生成版本'}。`,
    },
  ];
}

function extensionFiles(scene: ExtensionScene): HarnessAssetFile[] {
  return (['command', 'agent', 'skill'] as const).flatMap((category) =>
    scene.capabilities[category].flatMap((capability) =>
      capability.files.length > 0
        ? capability.files.map((file) => ({
            path: `${category}s/${capability.name}/${file.name}`,
            content: file.content,
            category,
          }))
        : [
            {
              path: `${category}s/${capability.name}/${capability.name}.md`,
              content: `# ${capability.name}\n\n版本：${capability.version || '未开发'}`,
              category,
            },
          ],
    ),
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function queryMockQualityReport(
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
  return {
    overallScore: Number.isFinite(overallScore) ? overallScore : 0,
    grade: report.grade,
    summary: `该 Skill 质量评估为 ${report.grade || '未分级'}，综合得分 ${formatScore(
      Number.isFinite(overallScore) ? overallScore : 0,
    )} 分。`,
    items: (report.dimensions ?? []).map((dimension) => ({
      name: dimension.name,
      value: `${formatScore(dimension.score)}/${formatScore(dimension.max)}`,
      pass: dimension.max <= 0 || dimension.score / dimension.max >= 0.6,
    })),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

type AtomicCatalogGroup = {
  type: Exclude<HarnessAssetType, 'Extension'>;
  records: SkillMasterRecord[];
};

export function createMockHarnessAssetApi(): HarnessAssetApi {
  const extensionScenes = getSharedMockExtensionScenes();
  const atomicReleases = initialAtomicReleaseStore();
  let releaseSequence = 100;

  async function loadAtomicCatalogs(
    scope: HarnessAssetScope,
    types: Array<Exclude<HarnessAssetType, 'Extension'>> = ['Agent', 'Skill', 'Command'],
  ): Promise<AtomicCatalogGroup[]> {
    return Promise.all(
      types.map(async (type) => ({
        type,
        records: await getHarnessCapabilityPlanningApi(
          type.toLowerCase() as 'skill' | 'command' | 'agent',
        ).queryCatalog({ userId: scope.userId }),
      })),
    );
  }

  async function productsForScope(
    scope: HarnessAssetScope,
    catalogs: AtomicCatalogGroup[],
  ): Promise<HarnessAssetProduct[]> {
    const productsByName = new Map<string, HarnessAssetProduct>();
    const addProduct = (product: HarnessAssetProduct): void => {
      if (!product.name || !productMatchesDepartment(product, scope.department.path)) return;
      if (!productsByName.has(product.name)) {
        productsByName.set(product.name, {
          ...product,
          departmentPath: [...product.departmentPath],
        });
      }
    };

    MOCK_EXTENSION_PRODUCTS.forEach((product) => addProduct(product));

    const optionGroups = await Promise.all(
      catalogs.map(({ type }) =>
        getHarnessCapabilityPlanningApi(
          type.toLowerCase() as 'skill' | 'command' | 'agent',
        ).getProducts('', scope.department.name, scope.department.code || scope.department.id),
      ),
    );
    optionGroups.flat().forEach((option) => {
      const departmentPath =
        resolveDepartmentPath(option.planningDeptName, scope.department.path) ||
        scope.department.path;
      addProduct({
        id: option.offeringId || `catalog-product-${option.offeringName}`,
        name: option.offeringName,
        departmentPath:
          departmentPath.length > 0 ? departmentPath : [...scope.department.path],
      });
    });

    catalogs.flatMap(({ records }) => records).forEach((record) => {
      if (!record.product) return;
      const departmentPath = resolveDepartmentPath(record.department, scope.department.path);
      addProduct({
        id: `catalog-product-${record.product}`,
        name: record.product,
        departmentPath:
          departmentPath.length > 0 ? departmentPath : [...scope.department.path],
      });
    });

    return [...productsByName.values()];
  }

  function findExtension(asset: HarnessAsset): ExtensionScene | undefined {
    return extensionScenes.find((scene) => scene.id === asset.id);
  }

  return {
    async queryProducts(scope) {
      const products = await productsForScope(scope, await loadAtomicCatalogs(scope));
      return products.map((product) => ({
        ...product,
        departmentPath: [...product.departmentPath],
      }));
    },

    async queryAssets(scope) {
      const requestedTypes =
        scope.assetType && scope.assetType !== 'all'
          ? [scope.assetType]
          : (['Agent', 'Skill', 'Command', 'Extension'] as HarnessAssetType[]);
      const atomicTypes = requestedTypes.filter(
        (type): type is Exclude<HarnessAssetType, 'Extension'> => type !== 'Extension',
      );
      const atomicRecords = await loadAtomicCatalogs(scope, atomicTypes);
      const availableProducts = await productsForScope(scope, atomicRecords);
      const list = atomicRecords.flatMap(({ type, records }) =>
        records
          .filter((record) => recordMatchesScope(record, scope, availableProducts))
          .map((record) =>
            atomicAsset(
              type,
              record,
              scope,
              availableProducts,
              atomicReleases.get(releaseKey(type, record.id)) ?? [],
            ),
          ),
      );
      if (requestedTypes.includes('Extension')) {
        const visibleProductIds = new Set(
          scope.product ? [scope.product.id] : availableProducts.map((product) => product.id),
        );
        list.push(
          ...extensionScenes.flatMap((scene) => {
            if (!visibleProductIds.has(scene.productId)) return [];
            const product = availableProducts.find((item) => item.id === scene.productId);
            return product ? [extensionAsset(scene, product)] : [];
          }),
        );
      }
      return { list, total: list.length };
    },

    async queryDetail(_scope, asset, version = asset.currentVersion) {
      const files =
        asset.assetType === 'Extension'
          ? extensionFiles(findExtension(asset) ?? ({ capabilities: { skill: [], command: [], agent: [] } } as unknown as ExtensionScene))
          : atomicFileContent(asset, version);
      return { versions: [...asset.versions], files } satisfies HarnessAssetDetail;
    },

    async queryQualityReport(_scope, asset, version) {
      return queryMockQualityReport(asset, version);
    },

    async queryOrganizations() {
      return MOCK_ORGANIZATIONS.map((organization) => ({ ...organization }));
    },

    async queryReleases(_scope, asset) {
      if (asset.assetType === 'Extension') {
        const scene = findExtension(asset);
        if (!scene) return [];
        return [
          ...(scene.publishing ? [scene.publishing] : []),
          ...scene.releases,
        ]
          .sort(compareReleaseTime)
          .map(mapExtensionRelease);
      }
      return (atomicReleases.get(releaseKey(asset.assetType, asset.id)) ?? []).map(cloneRelease);
    },

    async publish(input: PublishHarnessAssetInput) {
      const { asset, organization, scope } = input;
      if (!asset.currentVersion || !asset.publishable) {
        throw new Error('该资产尚未生成可发布版本');
      }
      if (hasInProgressCurrentRelease(asset)) {
        throw new Error('该版本正在发布中，请勿重复提交');
      }
      if (!organization.id || !organization.name) throw new Error('请选择目标组织');
      const scene = asset.assetType === 'Extension' ? findExtension(asset) : undefined;
      if (asset.assetType === 'Extension' && !scene) {
        throw new Error('未找到该 Extension 对应场景');
      }
      if (scene?.publishing) throw new Error('当前已有 Extension 发布进行中');

      releaseSequence += 1;
      const release: HarnessAssetRelease = {
        id: `mock-release-${releaseSequence}`,
        version: harnessAssetPublishVersion(asset),
        publishedAt: nowIso(),
        organization: { ...organization },
        notes: `发布到组织：${organization.name}`,
        publisher: scope.userName || '当前用户',
        status: asset.assetType === 'Extension' ? '进行中' : '成功',
        extensionName: asset.assetType === 'Extension' ? asset.name : undefined,
      };
      if (scene) {
        scene.extension.name = asset.name;
        scene.publishing = {
          id: release.id,
          version: release.version,
          extensionName: asset.name,
          description: asset.description,
          channel: input.channel === 'beta' ? 'Beta' : 'Product',
          operator: { no: scope.userId, name: scope.userName || '当前用户' },
          publishedAt: release.publishedAt,
          status: '进行中',
          organization: organization.name,
          items: (['skill', 'command', 'agent'] as const).flatMap((type) =>
            scene.capabilities[type].map((capability) => ({
              type,
              name: capability.name,
              version: capability.version,
            })),
          ),
        };
      } else {
        const key = releaseKey(asset.assetType, asset.id);
        const existing = atomicReleases.get(key) ?? [];
        if (
          existing.some(
            (item) =>
              item.status === '进行中' &&
              normalizeHarnessAssetVersion(item.version) ===
                normalizeHarnessAssetVersion(asset.currentVersion),
          )
        ) {
          throw new Error('该版本正在发布中，请勿重复提交');
        }
        atomicReleases.set(key, [release, ...existing]);
      }
      return cloneRelease(release);
    },
  };
}

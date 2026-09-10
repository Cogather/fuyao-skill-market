import type { ExtensionReleaseContext } from './extensionPublishHttp';
import type { SkillPlanningUserOption } from './skillPlanningShared';
import type { HarnessAssetComponentDetailDto } from './apiTypes';
import type { ExtensionScene } from './extensionPublishMock';

export type HarnessAssetType = 'Agent' | 'Skill' | 'Command' | 'Extension';
export type HarnessAssetFilter = 'all' | HarnessAssetType;
export type HarnessAtomicAssetType = Exclude<HarnessAssetType, 'Extension'>;
export type HarnessAssetPersonField = 'owner' | 'developer';

export type DeleteHarnessAssetInput = {
  asset: HarnessAsset;
  userId: string;
};

export type UpdateHarnessAssetPersonInput = {
  asset: HarnessAsset;
  field: HarnessAssetPersonField;
  person: SkillPlanningUserOption;
  userId: string;
};

export type UpdateHarnessAssetDetailsInput = {
  asset: HarnessAsset;
  userId: string;
  name: string;
  description: string;
  /** 未修改的人员字段省略；修改后必须从搜索结果选中有效人员。 */
  owner?: SkillPlanningUserOption | null;
  developer?: SkillPlanningUserOption | null;
};

export type HarnessAssetDetailsUpdate = Pick<HarnessAsset, 'name' | 'description'> &
  Partial<Pick<HarnessAsset, 'owner' | 'developer'>>;

export type HarnessAssetDepartment = {
  id: string;
  code: string;
  name: string;
  path: string[];
};

export type HarnessAssetProduct = {
  id: string;
  name: string;
  departmentPath: string[];
};

export type HarnessAssetOrganization = {
  id: string;
  name: string;
};

export type HarnessAssetReleaseStatus = '成功' | '失败' | '进行中';

export type HarnessAssetRelease = {
  id?: string;
  version: string;
  publishedAt: string;
  organization: HarnessAssetOrganization;
  notes?: string;
  publisher?: string;
  status: HarnessAssetReleaseStatus;
  extensionName?: string;
};

export type HarnessAssetMarketplace = {
  rating: number;
  downloads: number;
  calls: number;
};

export type HarnessAsset = {
  id: string;
  name: string;
  description: string;
  assetType: HarnessAssetType;
  /** 发布查询使用列表记录自身的维度，不从筛选项反推。 */
  dimType?: string | null;
  dimCode?: string | null;
  dimName?: string | null;
  firstScene?: string | null;
  secondScene?: string | null;
  currentVersion: string;
  nextPublishVersion?: string;
  versions: string[];
  owner: string;
  /** Mock 资产提供结构化责任人 ID；HTTP 权限以详情 ownerId 为准。 */
  ownerId?: string;
  developer: string;
  departmentName: string;
  departmentPath: string[];
  productId: string;
  productName: string;
  auto: boolean;
  marketplace: HarnessAssetMarketplace;
  releases: HarnessAssetRelease[];
  publishable: boolean;
  /** 当前用户的发布权限，与资产是否已就绪分别判断。 */
  canPublish?: boolean;
  canEdit?: boolean | null;
  status?: string;
  category?: string;
  updatedAt?: string;
};

export type HarnessAssetFileCategory = 'root' | 'skill' | 'command' | 'agent';

export type HarnessAssetFile = {
  path: string;
  content: string;
  category?: HarnessAssetFileCategory;
};

export type HarnessAssetDetail = {
  versions: string[];
  files: HarnessAssetFile[];
  version?: string;
  component?: HarnessAssetComponentDetailDto;
  /** HTTP Extension 内容只加载组件清单，目录与文件由用户展开时读取。 */
  capabilities?: ExtensionScene['capabilities'];
};

export type HarnessAssetQualityItem = {
  name: string;
  value: string;
  pass: boolean;
};

export type HarnessAssetQualityReport = {
  overallScore: number;
  grade?: string;
  summary: string;
  items: HarnessAssetQualityItem[];
};

export type HarnessAssetScope = {
  userId: string;
  userName: string;
  department: HarnessAssetDepartment;
  product?: HarnessAssetProduct;
  assetType?: HarnessAssetFilter;
};

export type HarnessAssetPageQuery = {
  pageNum: number;
  pageSize: number;
};

export type HarnessAssetPageResult = {
  list: HarnessAsset[];
  total: number;
  hasMore: boolean;
};

export type PublishHarnessAssetInput = {
  scope: HarnessAssetScope;
  asset: HarnessAsset;
  organization: HarnessAssetOrganization;
  channel?: 'beta' | 'product';
};

export interface HarnessAssetApi {
  updateDetails(input: UpdateHarnessAssetDetailsInput): Promise<HarnessAssetDetailsUpdate>;
  deleteAsset(input: DeleteHarnessAssetInput): Promise<void>;
  updatePerson(input: UpdateHarnessAssetPersonInput): Promise<string>;
  queryProducts(
    scope: Omit<HarnessAssetScope, 'product' | 'assetType'>,
  ): Promise<HarnessAssetProduct[]>;
  queryAssets(
    scope: HarnessAssetScope,
    page: HarnessAssetPageQuery,
  ): Promise<HarnessAssetPageResult>;
  queryDetail(
    scope: HarnessAssetScope,
    asset: HarnessAsset,
    version?: string,
    options?: { includeFiles?: boolean },
  ): Promise<HarnessAssetDetail>;
  queryQualityReport(
    scope: HarnessAssetScope,
    asset: HarnessAsset,
    version: string,
  ): Promise<HarnessAssetQualityReport | null>;
  queryPublishDetail(scope: HarnessAssetScope, asset: HarnessAsset): Promise<HarnessAssetDetail>;
  queryOrganizations(
    scope: HarnessAssetScope,
    asset: HarnessAsset,
  ): Promise<HarnessAssetOrganization[]>;
  queryReleases(scope: HarnessAssetScope, asset: HarnessAsset): Promise<HarnessAssetRelease[]>;
  queryExtensionReleaseContext(
    scope: HarnessAssetScope,
    asset: HarnessAsset,
    mode?: 'publish' | 'history',
  ): Promise<ExtensionReleaseContext>;
  publish(input: PublishHarnessAssetInput): Promise<HarnessAssetRelease>;
}

export function normalizeHarnessAssetVersion(version: string): string {
  return String(version ?? '')
    .trim()
    .replace(/^v(?=\d)/i, '');
}

export function harnessAssetPublishVersion(asset: HarnessAsset): string {
  return normalizeHarnessAssetVersion(asset.nextPublishVersion || asset.currentVersion);
}

function hasCurrentReleaseWithStatus(
  asset: HarnessAsset,
  status: HarnessAssetReleaseStatus,
): boolean {
  const currentVersion = normalizeHarnessAssetVersion(asset.currentVersion);
  if (!currentVersion) return false;
  return asset.releases.some(
    (release) =>
      release.status === status && normalizeHarnessAssetVersion(release.version) === currentVersion,
  );
}

export function hasSuccessfulCurrentRelease(asset: HarnessAsset): boolean {
  return hasCurrentReleaseWithStatus(asset, '成功');
}

export function hasInProgressCurrentRelease(asset: HarnessAsset): boolean {
  const publishVersion = harnessAssetPublishVersion(asset);
  if (!publishVersion) return false;
  return asset.releases.some(
    (release) =>
      release.status === '进行中' &&
      normalizeHarnessAssetVersion(release.version) === publishVersion,
  );
}

export function harnessAssetStatus(asset: HarnessAsset): string {
  if (asset.status) return asset.status;
  if (!asset.currentVersion) return '未开发';
  if (hasInProgressCurrentRelease(asset)) return '发布中';
  return hasSuccessfulCurrentRelease(asset) ? '已发布' : '待发布';
}

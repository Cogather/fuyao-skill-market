import type { HarnessAssetComponentDetailDto, QueryHarnessAssetComponentsBody } from './apiTypes';
import type {
  HarnessAsset,
  HarnessAssetPageQuery,
  HarnessAssetPageResult,
  HarnessAssetProduct,
  HarnessAssetScope,
  HarnessAssetType,
} from './assetManagementTypes';
import { normalizeHarnessAssetVersion } from './assetManagementTypes';
import { skillBaseService } from './skillBaseService';

const API_TYPES: Record<HarnessAssetType, QueryHarnessAssetComponentsBody['type']> = {
  Agent: 'AGENT',
  Skill: 'SKILL',
  Command: 'COMMAND',
  Extension: 'EXTENSION',
};

export async function queryHttpHarnessAssetComponentDetail(
  scope: HarnessAssetScope,
  asset: HarnessAsset,
): Promise<HarnessAssetComponentDetailDto> {
  const response = await skillBaseService.queryHarnessAssetComponentDetail({
    userId: scope.userId.trim(),
    type: API_TYPES[asset.assetType],
    name: asset.name,
  });
  if (response?.meta?.success !== true) {
    throw new Error(response?.meta?.message || '组件详情加载失败');
  }
  const data = response.data;
  if (!data?.name || data.type !== API_TYPES[asset.assetType] || !Array.isArray(data.versions)) {
    throw new Error('组件详情响应格式不正确');
  }
  return data;
}

export async function queryHttpHarnessAssetPage(
  scope: HarnessAssetScope,
  page: HarnessAssetPageQuery,
  products: HarnessAssetProduct[] = [],
): Promise<HarnessAssetPageResult> {
  const assetType = scope.assetType && scope.assetType !== 'all' ? scope.assetType : 'Agent';
  const deptCode = scope.department.code.trim();
  const productCode = scope.product?.id.trim();
  const response = await skillBaseService.queryHarnessAssetComponents({
    userId: scope.userId.trim(),
    ...(deptCode ? { deptCode } : {}),
    ...(productCode ? { productCode } : {}),
    type: API_TYPES[assetType],
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    pageNo: page.pageNum,
    pageSize: page.pageSize,
  });
  if (response?.meta?.success !== true) {
    throw new Error(response?.meta?.message || '资产清单加载失败');
  }
  const data = response.data;
  if (
    !Array.isArray(data?.records) ||
    !Number.isInteger(data.total) ||
    data.total < 0 ||
    !Number.isInteger(data.pageNo) ||
    data.pageNo < 1 ||
    !Number.isInteger(data.pageSize) ||
    data.pageSize < 1
  ) {
    throw new Error('资产清单响应格式不正确');
  }
  const list = data.records.map((record): HarnessAsset => {
    const currentVersion = normalizeHarnessAssetVersion(record.latestVersion);
    const category = String(record.category ?? '');
    const [level, ...names] = category.split('/');
    const categoryName = names.join('/');
    const product =
      level === '产品级'
        ? (products.find((item) => item.name === categoryName) ??
          (scope.product?.name === categoryName ? scope.product : undefined))
        : undefined;
    return {
      // 此接口不返回 id；类型、归属和名称在翻页、刷新及版本更新后保持一致。
      id: JSON.stringify([assetType, category, record.name]),
      name: record.name,
      description: record.description,
      assetType,
      dimType: record.dimType ?? null,
      dimCode: record.dimCode ?? null,
      dimName: record.dimName ?? null,
      firstScene: record.firstScene ?? null,
      secondScene: record.secondScene ?? null,
      canPublish: record.canPublish,
      canEdit: record.canEdit,
      currentVersion,
      versions: currentVersion ? [currentVersion] : [],
      owner: record.owner ?? '',
      developer: record.developer ?? '',
      departmentName: level === '部门级' ? categoryName : scope.department.name,
      departmentPath: [...scope.department.path],
      productId: product?.id ?? '',
      productName: level === '产品级' ? categoryName : '',
      auto: assetType === 'Extension',
      marketplace: { rating: 0, downloads: 0, calls: 0 },
      releases: [],
      publishable:
        assetType === 'Extension' &&
        (record.status === '待发布' ||
          (record.status === '可发布' && Boolean(currentVersion)) ||
          (record.status === '已发布' && record.canPublish === true)),
      status: record.status,
      category,
      updatedAt: record.updatedAt,
    };
  });
  return { list, total: data.total, hasMore: data.pageNo * data.pageSize < data.total };
}

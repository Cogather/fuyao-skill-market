export const CATALOG_ITEM_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;
export const CATALOG_PRODUCT_NAME_PATTERN = /^(?=.{1,62}$)[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

export function isCatalogItemNameValid(name: string): boolean {
  return CATALOG_ITEM_NAME_PATTERN.test(name);
}

export function isCatalogProductNameValid(name: string): boolean {
  return CATALOG_PRODUCT_NAME_PATTERN.test(name);
}

/**
 * 产品原名只有在无需清洗且能给连字符和名称后缀留出空间时，才参与清单名称前缀约束。
 */
export function getProductCatalogItemNamePrefix(
  level: string,
  originalProductName: string,
): string {
  if (level !== '产品级' || !isCatalogProductNameValid(originalProductName)) return '';
  return originalProductName.toLowerCase() + '-';
}

export function getAssetCatalogItemNamePrefix(
  asset: { dimType?: unknown; category?: unknown; productName?: unknown },
  fallbackLevel = '',
  fallbackProductName = '',
): string {
  const [categoryLevel = '', ...categoryNames] = String(asset.category ?? '').split('/');
  const assetProductName = String(asset.productName ?? '');
  const level =
    String(asset.dimType ?? '').trim() ||
    categoryLevel.trim() ||
    (assetProductName ? '产品级' : fallbackLevel);
  const productName =
    assetProductName || (level === '产品级' ? categoryNames.join('/') : '') || fallbackProductName;
  return getProductCatalogItemNamePrefix(level, productName);
}

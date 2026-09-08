export const CATALOG_ITEM_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;
export const CATALOG_PRODUCT_NAME_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

export function isCatalogItemNameValid(name: string): boolean {
  return CATALOG_ITEM_NAME_PATTERN.test(name);
}

export function isCatalogProductNameValid(name: string): boolean {
  return CATALOG_PRODUCT_NAME_PATTERN.test(name);
}

/**
 * 产品原名只有在未经 trim、大小写转换等处理时就合法，才参与清单名称前缀约束。
 */
export function getProductCatalogItemNamePrefix(
  level: string,
  originalProductName: string,
): string {
  if (level !== '产品级' || !isCatalogProductNameValid(originalProductName)) return '';
  return originalProductName.toLowerCase() + '-';
}

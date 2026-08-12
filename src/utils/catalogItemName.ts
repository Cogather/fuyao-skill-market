export const CATALOG_ITEM_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

export function isCatalogItemNameValid(name: string): boolean {
  return CATALOG_ITEM_NAME_PATTERN.test(name);
}

export function replaceCatalogItemNamePrefix(
  name: string,
  previousPrefix: string,
  nextPrefix: string,
): string {
  if (!previousPrefix || !name.startsWith(previousPrefix)) return name;
  return `${nextPrefix}${name.slice(previousPrefix.length)}`;
}

export function assertCatalogItemName(
  name: string,
  level: string,
  originalProductName: string,
  label = '清单',
): void {
  const normalizedName = name.trim();
  if (!isCatalogItemNameValid(normalizedName)) {
    throw new Error(`${label} 名称仅允许小写字母、数字、连字符，最长 64 字符`);
  }

  const prefix = getProductCatalogItemNamePrefix(level, originalProductName);
  if (!prefix) return;
  if (!normalizedName.startsWith(prefix)) {
    throw new Error(`产品级 ${label} 名称需以产品名称的小写形式“${prefix}”开头`);
  }
  if (normalizedName.length === prefix.length) {
    throw new Error(`请在“${prefix}”后补充 ${label}名称`);
  }
}

/**
 * 产品原名只有在未经 trim、大小写转换等处理时就合法，才参与清单名称前缀约束。
 */
export function getProductCatalogItemNamePrefix(
  level: string,
  originalProductName: string,
): string {
  if (level !== '产品级' || !isCatalogItemNameValid(originalProductName)) return '';
  return originalProductName.toLowerCase() + '-';
}

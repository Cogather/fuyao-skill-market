export const CATALOG_ITEM_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;
export const CATALOG_PRODUCT_NAME_PATTERN = /^(?=.{1,62}$)[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

export function isCatalogItemNameValid(name: string): boolean {
  return CATALOG_ITEM_NAME_PATTERN.test(name);
}

export function isCatalogProductNameValid(name: string): boolean {
  return CATALOG_PRODUCT_NAME_PATTERN.test(name);
}

const PRODUCT_PREFIX_BASE_MAX_LENGTH = 62;

function productNameHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function limitSuggestedProductPrefixBase(value: string, originalProductName: string): string {
  if (value.length <= PRODUCT_PREFIX_BASE_MAX_LENGTH) return value;
  const hash = productNameHash(originalProductName);
  const availableLength = PRODUCT_PREFIX_BASE_MAX_LENGTH - hash.length - 1;
  const shortened = value.slice(0, Math.max(1, availableLength)).replace(/-+$/g, '');
  return `${shortened}-${hash}`;
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

/**
 * 仅为不符合原始产品名规范的产品生成合法、可识别的前缀建议。
 * 该结果只用于界面提示，不应自动写入名称输入框。
 */
export function getSuggestedProductCatalogItemNamePrefix(originalProductName: string): string {
  const original = originalProductName.trim();
  if (!original || isCatalogProductNameValid(originalProductName)) return '';

  const normalized = original
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/\p{Script=Han}/gu, '')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const fallback = `product-${productNameHash(original)}`;
  return `${limitSuggestedProductPrefixBase(normalized || fallback, original)}-`;
}

export function getAssetCatalogItemNamePrefix(
  asset: { dimType?: unknown; category?: unknown; productName?: unknown },
  fallbackLevel = '',
  fallbackProductName = '',
): string {
  const { level, productName } = getAssetCatalogProductContext(
    asset,
    fallbackLevel,
    fallbackProductName,
  );
  return getProductCatalogItemNamePrefix(level, productName);
}

function getAssetCatalogProductContext(
  asset: { dimType?: unknown; category?: unknown; productName?: unknown },
  fallbackLevel = '',
  fallbackProductName = '',
): { level: string; productName: string } {
  const [categoryLevel = '', ...categoryNames] = String(asset.category ?? '').split('/');
  const assetProductName = String(asset.productName ?? '');
  const level =
    String(asset.dimType ?? '').trim() ||
    categoryLevel.trim() ||
    (assetProductName ? '产品级' : fallbackLevel);
  const productName =
    assetProductName || (level === '产品级' ? categoryNames.join('/') : '') || fallbackProductName;
  return { level, productName };
}

/** 资产编辑时仅提供非法产品名的前缀建议，不改写已有资产名称。 */
export function getSuggestedAssetCatalogItemNamePrefix(
  asset: { dimType?: unknown; category?: unknown; productName?: unknown },
  fallbackLevel = '',
  fallbackProductName = '',
): string {
  const { level, productName } = getAssetCatalogProductContext(
    asset,
    fallbackLevel,
    fallbackProductName,
  );
  if (level !== '产品级') return '';
  return getSuggestedProductCatalogItemNamePrefix(productName);
}

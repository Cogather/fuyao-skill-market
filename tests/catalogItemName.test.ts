import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCatalogItemName,
  getProductCatalogItemNamePrefix,
  replaceCatalogItemNamePrefix,
} from '../src/utils/catalogItemName.ts';

test('returns a lowercase product prefix only for an originally valid product name', () => {
  assert.equal(getProductCatalogItemNamePrefix('产品级', 'test-product'), 'test-product-');
  assert.equal(getProductCatalogItemNamePrefix('产品级', 'TEST-PRODUCT'), '');
  assert.equal(getProductCatalogItemNamePrefix('产品级', 'Test产品_01'), '');
  assert.equal(getProductCatalogItemNamePrefix('产品级', 'test-product '), '');
  assert.equal(getProductCatalogItemNamePrefix('部门级', 'test-product'), '');
});

test('replaces only the previous default prefix when a create product changes', () => {
  assert.equal(
    replaceCatalogItemNamePrefix('old-product-runner', 'old-product-', 'new-product-'),
    'new-product-runner',
  );
  assert.equal(replaceCatalogItemNamePrefix('old-product-', 'old-product-', ''), '');
  assert.equal(
    replaceCatalogItemNamePrefix('custom-name', 'old-product-', 'new-product-'),
    'custom-name',
  );
});

test('validates ordinary names and product prefixes for every capability label', () => {
  for (const label of ['Command', 'Skill', 'Agent']) {
    assert.throws(
      () => assertCatalogItemName('bad name', '产品级', 'test-product', label),
      /名称仅允许小写字母、数字、连字符/,
    );
    assert.throws(
      () => assertCatalogItemName('other-name', '产品级', 'test-product', label),
      /开头/,
    );
    assert.throws(
      () => assertCatalogItemName('test-product-', '产品级', 'test-product', label),
      /补充/,
    );
    assert.doesNotThrow(() =>
      assertCatalogItemName('plain-name', '产品级', 'Test产品_01', label),
    );
    assert.doesNotThrow(() =>
      assertCatalogItemName('plain-name', '部门级', 'test-product', label),
    );
  }
});

test('rejects names longer than 64 characters', () => {
  assert.throws(() => assertCatalogItemName('a'.repeat(65), '部门级', '', '清单'), /最长 64/);
});

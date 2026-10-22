import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });

try {
  const {
    getSuggestedAssetCatalogItemNamePrefix,
    getProductCatalogItemNamePrefix,
    getSuggestedProductCatalogItemNamePrefix,
    isCatalogItemNameValid,
  } = await server.ssrLoadModule('/src/utils/catalogItemName.ts');
  const { validateProductCatalogItemName } = await server.ssrLoadModule(
    '/src/utils/scenarioCreationCode.ts',
  );

  for (const productName of ['harness-pipeline', 'Harness-Pipeline', 'release-tools-2026']) {
    assert.equal(getSuggestedProductCatalogItemNamePrefix(productName), '');
  }
  assert.equal(
    getProductCatalogItemNamePrefix('产品级', 'Harness-Pipeline'),
    'harness-pipeline-',
    '符合规范的大写产品名仍走原有自动前缀逻辑',
  );

  const cases = [
    ['Harness Pipeline', 'harness-pipeline-'],
    ['R&D Platform', 'r-and-d-platform-'],
    ['Harness_Pipeline.v2', 'harness-pipeline-v2-'],
    ['智能交付 Agent 平台', 'agent-'],
    ['api中文gateway', 'apigateway-'],
    ['-Harness--Pipeline-', 'harness-pipeline-'],
    ['Café ＡＰＩ', 'cafe-api-'],
    ['DevOps\n交付🚀Console', 'devops-console-'],
  ];
  for (const [productName, expected] of cases) {
    const suggestion = getSuggestedProductCatalogItemNamePrefix(productName);
    assert.equal(suggestion, expected, productName);
    assert.doesNotMatch(suggestion, /--|^-/, `${productName} 的建议前缀不得包含连续或首部连字符`);
    assert.equal(
      validateProductCatalogItemName(`${suggestion}item1`, productName),
      '',
      `${productName} 的建议前缀后追加简单合法字符后必须是合法名称`,
    );
  }

  const chineseOnly = getSuggestedProductCatalogItemNamePrefix('智能交付平台');
  assert.match(chineseOnly, /^product-[a-z0-9]+-$/);
  assert.equal(
    chineseOnly,
    getSuggestedProductCatalogItemNamePrefix('智能交付平台'),
    '纯中文产品名的合法回退建议应稳定关联同一产品',
  );
  assert.doesNotMatch(chineseOnly, /--|^-/);
  assert.equal(validateProductCatalogItemName(`${chineseOnly}item1`, '智能交付平台'), '');

  const longSuggestion = getSuggestedProductCatalogItemNamePrefix(
    `${'VeryLongProductName'.repeat(6)} & Console`,
  );
  assert.ok(longSuggestion.length <= 63, '建议前缀应为名称后缀至少留出 1 个字符');
  assert.equal(isCatalogItemNameValid(longSuggestion), true);
  assert.doesNotMatch(longSuggestion, /--|^-|[^a-z0-9-]/);
  assert.equal(
    validateProductCatalogItemName(
      `${longSuggestion}x`,
      `${'VeryLongProductName'.repeat(6)} & Console`,
    ),
    '',
  );
  assert.equal(getSuggestedProductCatalogItemNamePrefix(''), '');
  assert.equal(
    getSuggestedAssetCatalogItemNamePrefix({
      dimType: '产品级',
      productName: '智能交付 Agent 平台',
    }),
    'agent-',
    '资产编辑应使用资产本身的非法产品名生成建议',
  );
  assert.equal(
    getSuggestedAssetCatalogItemNamePrefix({ category: '产品级/发布风险分析中心' }),
    'product-e65546-',
    '资产编辑在仅有 category 时也能解析产品名',
  );
  assert.equal(
    getSuggestedAssetCatalogItemNamePrefix({
      dimType: '部门级',
      productName: '智能交付 Agent 平台',
    }),
    '',
    '部门级资产不应显示产品前缀建议',
  );

  console.log(
    'PASS invalid product names receive legal suggestion-only prefixes while valid names keep existing behavior',
  );
} finally {
  await server.close();
}

import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const { default: AgentSkillAssetsPage } = await server.ssrLoadModule(
    '/src/views/skill/AgentSkillAssetsPage.vue',
  );
  const deleteCalls = [];
  getHarnessAssetApi().deleteAsset = async (input) => {
    deleteCalls.push(input);
  };

  let bindings;
  const TestHost = {
    setup() {
      bindings = AgentSkillAssetsPage.setup(
        {
          userId: 'delete-user',
          userName: '删除用户',
          departmentTree: [],
          currentUserDepartmentPath: [],
          allowedDepartmentPaths: [],
          restrictToAllowedDepartments: false,
        },
        { expose() {} },
      );
      return () => h('div');
    },
  };
  await renderToString(createSSRApp(TestHost));

  const asset = {
    id: 'agent-delete-1',
    name: '待删除 Agent',
    description: '卡片页删除测试',
    assetType: 'Agent',
    currentVersion: '0.1.0',
    versions: ['0.1.0'],
    owner: '责任人 u001',
    developer: '开发人 u002',
    departmentName: '持续交付组',
    departmentPath: ['部门 1', '持续交付组'],
    productId: 'product-harness',
    productName: 'harness-pipeline',
    category: '产品级/harness-pipeline',
    auto: false,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    releases: [],
    publishable: false,
    canEdit: true,
  };
  bindings.assets.value = [asset];
  bindings.cardMenuKey.value = 'Agent:agent-delete-1';

  await bindings.deleteCardAsset(asset);

  assert.equal(bindings.view.value, 'list', 'card deletion must keep the asset list visible');
  assert.equal(bindings.cardMenuKey.value, '', 'card action menu closes before confirmation');
  assert.deepEqual(bindings.deleteTarget.value, { asset, userId: 'delete-user' });

  await bindings.deleteCurrentAsset();
  assert.deepEqual(deleteCalls, [{ asset, userId: 'delete-user' }]);
  console.log('PASS card deletion opens confirmation and submits without entering detail view');
} finally {
  await server.close();
}

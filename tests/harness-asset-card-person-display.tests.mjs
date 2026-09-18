import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { default: AgentSkillAssetsPage } = await server.ssrLoadModule(
    '/src/views/skill/AgentSkillAssetsPage.vue',
  );
  let bindings;
  const TestHost = {
    setup() {
      bindings = AgentSkillAssetsPage.setup(
        {
          userId: '',
          userName: '',
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

  assert.equal(bindings.assetPersonName('  周扬 w30000007  '), '周扬 w30000007');
  bindings.assets.value = [
    {
      id: 'extension-1',
      assetType: 'Extension',
      publisher: '周发布 w1004',
    },
  ];
  bindings.selectedAssetKey.value = 'Extension:extension-1';
  bindings.selectedVersion.value = '1.0.0';
  bindings.detail.value = {
    component: {
      versions: [{ version: '1.0.0', uploadedAt: null, uploadedBy: 'w1004' }],
    },
  };
  assert.equal(
    bindings.selectedVersionPublisher.value,
    '周发布 w1004',
    'Extension detail publisher must come from the query record instead of detail uploadedBy',
  );
  console.log('PASS asset cards and Extension detail use the complete query person value');
} finally {
  await server.close();
}

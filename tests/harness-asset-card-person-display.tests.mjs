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
  console.log('PASS asset cards preserve the complete person value returned by the API');
} finally {
  await server.close();
}

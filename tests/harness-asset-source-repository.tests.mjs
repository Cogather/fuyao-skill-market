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

  bindings.assets.value = [{ id: 'skill-1', assetType: 'Skill' }];
  bindings.selectedAssetKey.value = 'Skill:skill-1';
  bindings.selectedVersion.value = '1.2.0';
  bindings.detail.value = {
    component: {
      versions: [
        {
          version: '1.2.0',
          uploadedAt: '2026-09-23 10:00:00',
          uploadedBy: 'u001',
          reportUrl: ' https://git.example.com/team/source?version=1.2.0 ',
          repoUrl: 'https://git.example.com/team/wrong-fallback?version=1.2.0',
        },
        {
          version: '1.1.0',
          uploadedAt: null,
          uploadedBy: 'u001',
          reportUrl: 'javascript:alert(1)',
        },
        {
          version: '1.0.0',
          uploadedAt: null,
          uploadedBy: 'u001',
          repoUrl: ' https://git.example.com/team/source?version=1.0.0 ',
        },
      ],
    },
  };

  assert.equal(
    bindings.selectedVersionReportUrl.value,
    'https://git.example.com/team/source?version=1.2.0',
    'the selected version exposes its HTTP(S) source repository URL',
  );
  bindings.selectedVersion.value = '1.1.0';
  assert.equal(
    bindings.selectedVersionReportUrl.value,
    '',
    'unsafe source repository protocols are not rendered as links',
  );
  bindings.selectedVersion.value = '1.0.0';
  assert.equal(
    bindings.selectedVersionReportUrl.value,
    'https://git.example.com/team/source?version=1.0.0',
    'repoUrl remains compatible when reportUrl is absent',
  );
  console.log('PASS asset detail source repository follows the selected version safely');
} finally {
  await server.close();
}

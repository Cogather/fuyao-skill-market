import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const component = {
    name: 'release-type-extension',
    description: 'release type display fixture',
    category: '产品级/harness-pipeline',
    ownerName: null,
    ownerId: null,
    developerName: null,
    developerId: null,
    type: 'EXTENSION',
    firstScene: '应用开发',
    secondScene: '代码开发',
    versions: [{ version: '1.0.0', uploadedAt: '2026-09-20 10:00:00', uploadedBy: 'u001' }],
  };
  const versionSnapshot = {
    extensionName: component.name,
    version: '1.0.0',
    description: component.description,
    dimType: '产品级',
    dimCode: 'product-1',
    dimName: 'harness-pipeline',
    targetOrgCode: 'org-1',
    targetOrgName: '测试组织',
    operatorName: '测试用户',
    publishStatus: '成功',
    releaseType: 'Product',
    agents: [],
    commands: [],
    skills: [],
  };
  const handleRequest = async (config) => {
    if (config.url.endsWith('/components/detail')) return success(component);
    if (config.url === '/extensions/version-history') return success(versionSnapshot);
    throw new Error(`Unexpected request: ${config.url}`);
  };
  request.api = handleRequest;
  request.harnessApi = handleRequest;

  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const scope = {
    userId: 'u001',
    userName: '测试用户',
    department: { id: 'dept-1', code: 'dept-1', name: '研发部', path: ['研发部'] },
    product: { id: 'product-1', name: 'harness-pipeline', departmentPath: ['研发部'] },
  };
  const asset = {
    id: 'extension-release-type',
    name: component.name,
    description: component.description,
    assetType: 'Extension',
    dimType: '产品级',
    dimCode: 'product-1',
    dimName: 'harness-pipeline',
    currentVersion: '1.0.0',
    versions: ['1.0.0'],
    owner: '',
    developer: '',
    publisher: '',
    departmentName: '研发部',
    departmentPath: ['研发部'],
    productId: 'product-1',
    productName: 'harness-pipeline',
    auto: true,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    releases: [],
    publishable: false,
    status: '已发布',
  };

  const detail = await api.queryDetail(scope, asset);
  assert.equal(
    detail.releaseType,
    'Product',
    'Extension detail exposes releaseType returned by version-history',
  );

  const { default: AgentSkillAssetsPage } = await server.ssrLoadModule(
    '/src/views/skill/AgentSkillAssetsPage.vue',
  );
  const originalSetup = AgentSkillAssetsPage.setup;
  try {
    AgentSkillAssetsPage.setup = (props, context) => {
      const bindings = originalSetup(props, context);
      bindings.assets.value = [asset];
      bindings.selectedAssetKey.value = 'Extension:extension-release-type';
      bindings.selectedVersion.value = '1.0.0';
      bindings.detail.value = {
        ...detail,
        capabilities: { skill: [], command: [], agent: [] },
      };
      bindings.view.value = 'detail';
      return bindings;
    };
    const html = await renderToString(
      createSSRApp(AgentSkillAssetsPage, {
        userId: 'u001',
        userName: '测试用户',
        departmentTree: [],
        currentUserDepartmentPath: [],
        allowedDepartmentPaths: [],
        restrictToAllowedDepartments: false,
      }),
    );
    const releaseTypeElementAt = html.indexOf('class="asset-detail__release-type"');
    const versionLabelElementAt = html.indexOf('class="asset-detail__version-label"');
    const releaseTypeElementEnd = html.indexOf('</span>', releaseTypeElementAt);
    assert.ok(releaseTypeElementAt >= 0, 'Extension detail renders the release type element');
    assert.match(
      html.slice(releaseTypeElementAt, releaseTypeElementEnd),
      /Product/,
      'the release type element renders the value returned by version-history',
    );
    assert.ok(
      versionLabelElementAt > releaseTypeElementAt,
      'the release type element appears before the exact version label element',
    );
  } finally {
    AgentSkillAssetsPage.setup = originalSetup;
  }

  console.log('PASS Extension detail displays version-history releaseType before the version');
} finally {
  await server.close();
}

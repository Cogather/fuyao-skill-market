import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const scope = {
  dimType: '产品级',
  dimCode: '30222',
  dimName: 'Udm产品部',
  productId: '30222',
  departmentPath: ['Udm产品部'],
};
const emptyScene = {
  id: 'scene-1',
  productId: '30222',
  primary: '应用开发',
  name: 'mml代码开发',
  publishable: false,
  extension: { name: '', description: '' },
  capabilities: { skill: [], command: [], agent: [] },
  releases: [],
  publishing: null,
};
const detailData = {
  firstScene: '应用开发',
  secondScene: 'mml代码开发',
  readyStatus: '已就绪',
  publishedExtension: {
    extensionName: 'udm-mml-e2e-extension',
    version: '1.0.0',
    description: '详情接口返回的扩展说明',
    publishStatus: '发布成功',
  },
  components: {
    commands: [{ name: '/udm-e2e-command', version: '1.0.0', uploadedAt: '2026-08-01 10:00:00' }],
    skills: [],
    agents: [{ name: 'udm-coding-agent', version: '2.0.0', uploadedAt: '2026-08-02 11:00:00' }],
  },
};

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const calls = [];
  let detailResponse = success(detailData);
  request.harnessApi = async (config) => {
    calls.push(config);
    assert.equal(config.url, '/extensions/detail');
    return detailResponse;
  };
  let bindingCalls = 0;
  let historyCalls = 0;
  skillBaseService.queryPublishedHistoryList = async () => {
    historyCalls += 1;
    return success([]);
  };
  skillBaseService.querySceneAndBindingPlanningItems = async () => {
    bindingCalls += 1;
    return success([
      {
        firstScene: '应用开发',
        secondScenes: [
          {
            ...detailData,
            readyStatus: '不完备',
            components: { commands: [], skills: [], agents: [] },
          },
        ],
      },
    ]);
  };
  const { queryHttpExtensionBindings, publishHttpExtension } = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionPublishHttp.ts',
  );
  const namedScene = {
    ...emptyScene,
    extension: { name: 'udm-mml-e2e-extension', description: '' },
  };
  const detail = await queryHttpExtensionBindings(' user-001 ', scope, namedScene);
  assert.equal(calls.length, 1, 'known Extension names must load the single-detail endpoint');
  assert.deepEqual(calls[0], {
    url: '/extensions/detail',
    method: 'POST',
    params: { userId: 'user-001' },
    data: {
      dimType: '产品级',
      dimCode: '30222',
      dimName: 'Udm产品部',
      extensionName: 'udm-mml-e2e-extension',
      firstScene: '应用开发',
      secondScene: 'mml代码开发',
    },
  });
  assert.equal(bindingCalls, 0, 'known names do not reload the entire binding tree');
  assert.equal(detail.extension.name, 'udm-mml-e2e-extension');
  assert.equal(detail.extension.description, '详情接口返回的扩展说明');
  assert.equal(
    detail.extension.version,
    '1.0.0',
    'retain the published version from single detail',
  );
  assert.equal(detail.publishable, true);
  assert.equal(detail.capabilities.agent[0].version, '2.0.0');
  assert.equal(detail.capabilities.agent[0].publishDate, '2026-08-02');
  assert.equal(detail.capabilities.command[0].publishDate, '2026-08-01');
  assert.equal(
    detail.releases[0].version,
    '1.0.0',
    'detail summary exposes its published version without history rows',
  );
  assert.equal(detail.releases[0].status, '成功');

  calls.length = 0;
  historyCalls = 0;
  const discovered = await queryHttpExtensionBindings('user-001', scope, emptyScene);
  assert.equal(bindingCalls, 0);
  assert.equal(calls.length, 1, 'scene names directly load single detail without bulk discovery');
  assert.equal(historyCalls, 1, 'initial selection does not request release history twice');
  assert.deepEqual(calls[0].data, {
    dimType: scope.dimType,
    dimCode: scope.dimCode,
    dimName: scope.dimName,
    firstScene: emptyScene.primary,
    secondScene: emptyScene.name,
  });
  assert.equal(discovered.capabilities.agent[0].name, 'udm-coding-agent');

  skillBaseService.queryPublishedHistoryList = async () =>
    success([
      {
        id: 'release-1',
        firstScene: '应用开发',
        secondScene: 'mml代码开发',
        extensionName: 'udm-mml-e2e-extension',
        version: '1.0.0',
        publishStatus: 'processing',
        description: '历史描述',
        operatorName: '原发布人',
        userId: 'publisher-1',
        publishedAt: '2026-08-01 10:00:00',
        targetOrgName: '原目标组织',
        releaseType: 'product',
        agents: [{ name: 'historical-agent', version: '1.0.0' }],
      },
    ]);
  const withHistory = await queryHttpExtensionBindings('user-001', scope, namedScene);
  assert.equal(
    withHistory.publishing,
    null,
    'new detail status supersedes a stale processing status',
  );
  assert.equal(
    withHistory.releases.length,
    1,
    'summary and history of the same version are merged',
  );
  assert.equal(withHistory.releases[0].id, 'release-1');
  assert.equal(withHistory.releases[0].operator.name, '原发布人');
  assert.equal(withHistory.releases[0].organization, '原目标组织');
  assert.equal(withHistory.releases[0].channel, 'Product');
  assert.equal(withHistory.releases[0].items[0].name, 'historical-agent');
  skillBaseService.queryPublishedHistoryList = async () => success([]);

  detailResponse = success({ ...detailData, readyStatus: '不完备', publishedExtension: null });
  const incomplete = await queryHttpExtensionBindings('user-001', scope, namedScene);
  assert.equal(incomplete.publishable, false, 'readyStatus overrides otherwise ready components');
  assert.equal(incomplete.extension.name, 'udm-mml-e2e-extension');
  assert.equal(incomplete.releases.length, 0);

  detailResponse = { meta: { success: false, message: 'SCENE_NOT_FOUND' }, data: null };
  await assert.rejects(
    queryHttpExtensionBindings('user-001', scope, namedScene),
    /SCENE_NOT_FOUND/,
  );

  calls.length = 0;
  detailResponse = success({ ...detailData, publishedExtension: null });
  const unpublished = await queryHttpExtensionBindings('user-001', scope, emptyScene);
  assert.equal(calls.length, 1, 'unpublished scenes also load POST detail by scene names');
  assert.equal(unpublished.capabilities.agent[0].name, 'udm-coding-agent');
  detailResponse = success({ ...detailData, readyStatus: '未配置', publishedExtension: null });
  const unconfigured = await queryHttpExtensionBindings('user-001', scope, emptyScene);
  assert.equal(unconfigured.publishable, false, '未配置 must block publication');

  let publishRequest;
  skillBaseService.saveExtension = async (params, body) => {
    publishRequest = { params, body };
    return success('extension-id');
  };
  await publishHttpExtension({
    userId: 'user-001',
    operatorName: '发布人',
    scope: { ...scope, dimName: 'udm' },
    scene: unpublished,
    extensionName: 'udm-mml-e2e-extension',
    description: '旧发布说明',
    channel: 'beta',
    organization: { id: 'org-1', name: '组织一', deptId: '', deptName: '' },
  });
  assert.deepEqual(publishRequest.params, {
    userId: 'user-001',
    operatorName: '发布人',
    dimType: '产品级',
    dimCode: '30222',
    dimName: 'udm',
  });
  assert.deepEqual(
    publishRequest.body,
    {
      extensionName: 'udm-mml-e2e-extension',
      description: '旧发布说明',
      releaseType: 'beta',
      firstScene: '应用开发',
      secondScene: 'mml代码开发',
      targetOrgCode: 'org-1',
      targetOrgName: '组织一',
      agents: [{ name: 'udm-coding-agent', version: '2.0.0' }],
      skills: [],
      commands: [{ name: '/udm-e2e-command', version: '1.0.0' }],
    },
    'publishing keeps the existing API payload, including extensionName',
  );
  console.log(
    'PASS Extension detail request/mapping, scene-name lookup, readiness, error handling, and legacy publishing',
  );
} finally {
  await server.close();
}

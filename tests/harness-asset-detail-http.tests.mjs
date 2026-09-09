import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const scope = {
  userId: ' user-001 ',
  userName: '测试用户',
  department: { id: 'dept-1', code: 'dept-1', name: '研发部', path: ['研发部'] },
  product: { id: 'product-1', name: 'udm', departmentPath: ['研发部'] },
};
const versions = [
  { version: '1.0.0', uploadedAt: '2026-09-02 12:00:00', uploadedBy: 'u007' },
  { version: '2.0.0', uploadedAt: null, uploadedBy: 'u002' },
];

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  const calls = [];
  let response;
  request.api = async (config) => {
    calls.push(config);
    return response;
  };
  request.harnessApi = async (config) => {
    calls.push(config);
    throw new Error('Unexpected publish detail on card click');
  };
  let fileTreeRequests = 0;
  skillBaseService.queryPlanningItemTree = async () => {
    fileTreeRequests += 1;
    return success(['SKILL.md']);
  };
  skillBaseService.queryPlanningItemContent = async () => success({ content: '# package' });
  skillBaseService.querySceneAndBindingPlanningItems = async () =>
    assert.fail('must not query all scene bindings');
  skillBaseService.queryPublishedHistoryList = async () => success([]);
  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  function asset(assetType) {
    return {
      id: assetType,
      name: `udm-${assetType.toLowerCase()}`,
      description: '旧描述',
      assetType,
      currentVersion: '9.0.0',
      versions: ['9.0.0'],
      owner: '',
      departmentName: '研发部',
      departmentPath: ['研发部'],
      productId: 'product-1',
      productName: 'udm',
      auto: assetType === 'Extension',
      marketplace: { rating: 0, downloads: 0, calls: 0 },
      releases: [],
      publishable: assetType === 'Extension',
    };
  }
  for (const type of ['Skill', 'Agent', 'Command', 'Extension']) {
    calls.length = 0;
    const currentAsset = asset(type);
    const component = {
      name: currentAsset.name,
      description: '接口详情',
      category: '产品级/udm',
      ownerName: '吴九',
      ownerId: 'u007',
      developerName: type === 'Extension' ? null : '李四',
      developerId: type === 'Extension' ? null : 'u002',
      type: type.toUpperCase(),
      firstScene: type === 'Extension' ? '应用开发' : null,
      secondScene: type === 'Extension' ? '代码开发' : null,
      versions,
    };
    response = success(component);
    const detail = await api.queryDetail(scope, currentAsset, undefined, { includeFiles: false });
    assert.deepEqual(calls, [
      {
        url: '/v1/harness/plans/components/detail',
        method: 'get',
        params: { userId: 'user-001', type: type.toUpperCase(), name: currentAsset.name },
      },
    ]);
    assert.deepEqual(detail.component, component);
    assert.deepEqual(
      detail.versions,
      ['1.0.0', '2.0.0'],
      'preserve upload order, not semantic version order',
    );
    assert.equal(detail.version, '1.0.0', 'initial selection comes from fresh detail');
    assert.equal(
      (await api.queryDetail(scope, currentAsset, '2.0.0', { includeFiles: false })).version,
      '2.0.0',
    );
    const previousFileTreeRequests = fileTreeRequests;
    const metadataOnly = await api.queryDetail(scope, currentAsset, '2.0.0', {
      includeFiles: false,
    });
    assert.equal(metadataOnly.version, '2.0.0');
    assert.deepEqual(metadataOnly.component, component);
    assert.deepEqual(metadataOnly.files, []);
    assert.equal(
      fileTreeRequests,
      previousFileTreeRequests,
      'embedded detail keeps file loading in the existing lazy-loading component',
    );
    response = success({ ...component, versions: [] });
    const empty = await api.queryDetail(scope, currentAsset);
    assert.deepEqual(empty.versions, [], 'no stale list version fallback');
    assert.deepEqual(empty.files, []);
    assert.equal(empty.version, '');
  }
  response = { meta: { success: false, message: '组件不存在' }, data: null };
  await assert.rejects(api.queryDetail(scope, asset('Extension')), /组件不存在/);
  console.log(
    'PASS four card types use GET component detail, metadata, ordered versions and empty/error responses',
  );

  const extensionAsset = { ...asset('Extension'), currentVersion: '2.0.0', canPublish: false };
  const fileCalls = [];
  response = success({
    name: extensionAsset.name,
    type: 'EXTENSION',
    description: '文件内容测试',
    versions: [...versions, { version: '0.5.0', uploadedAt: null, uploadedBy: 'u001' }],
  });
  request.harnessApi = async (config) => {
    calls.push(config);
    assert.equal(config.url, '/extensions/detail');
    return success({
      firstScene: '应用开发',
      secondScene: '代码开发',
      readyStatus: '已就绪',
      publishedExtension: null,
      components: {
        skills: [{ name: 'current-skill', version: '3.0.0' }],
        commands: [],
        agents: [],
      },
    });
  };
  skillBaseService.queryPublishedHistoryList = async () =>
    success([
      {
        version: '1.0.0',
        extensionName: extensionAsset.name,
        firstScene: '应用开发',
        secondScene: '代码开发',
        publishStatus: 'success',
        skills: [{ name: 'historical-skill', version: '0.9.0' }],
        commands: [{ name: 'historical-command', version: '0.8.0' }],
      },
    ]);
  skillBaseService.queryPlanningItemTree = async (params) => {
    fileCalls.push({ kind: 'tree', ...params });
    return success(['SKILL.md']);
  };
  skillBaseService.queryPlanningItemContent = async (params) => {
    fileCalls.push({ kind: 'file', ...params });
    return success({ content: `${params.componentName}@${params.componentVersion}` });
  };
  const historicalDetail = await api.queryDetail(scope, extensionAsset, '1.0.0');
  assert.deepEqual(
    historicalDetail.files,
    [
      {
        path: 'skills/historical-skill/SKILL.md',
        category: 'skill',
        content: 'historical-skill@0.9.0',
      },
      {
        path: 'commands/historical-command/historical-command.md',
        category: 'command',
        content: 'historical-command@0.8.0',
      },
    ],
    'Extension content uses the selected release snapshot even without publish permission',
  );
  assert.ok(fileCalls.every((call) => call.componentName !== 'current-skill'));
  const currentDetail = await api.queryDetail(scope, extensionAsset, '2.0.0');
  assert.equal(currentDetail.files[0].content, 'current-skill@3.0.0');
  const beforeMissingSnapshot = fileCalls.length;
  const missingSnapshot = await api.queryDetail(scope, extensionAsset, '0.5.0');
  assert.deepEqual(
    missingSnapshot.files,
    [],
    'unknown historical content must not show current bindings',
  );
  assert.equal(fileCalls.length, beforeMissingSnapshot);
  const previousDetailCalls = calls.filter((call) => call.url === '/extensions/detail').length;
  skillBaseService.queryPublishedHistoryList = async () =>
    success([
      {
        version: '0.5.0',
        extensionName: extensionAsset.name,
        firstScene: '应用开发',
        secondScene: '代码开发',
        publishStatus: 'success',
        skills: [{ name: 'newly-loaded-snapshot-skill', version: '0.4.0' }],
      },
    ]);
  const refreshedSnapshot = await api.queryDetail(scope, extensionAsset, '0.5.0');
  assert.deepEqual(
    refreshedSnapshot.files,
    [
      {
        path: 'skills/newly-loaded-snapshot-skill/SKILL.md',
        category: 'skill',
        content: 'newly-loaded-snapshot-skill@0.4.0',
      },
    ],
    'reselecting a version must use freshly fetched Extension details and release snapshots',
  );
  assert.equal(
    calls.filter((call) => call.url === '/extensions/detail').length,
    previousDetailCalls + 1,
    'version content must refresh the same detail endpoint used by Extension publication',
  );
  skillBaseService.queryPlanningItemContent = async () => {
    throw new Error('文件读取失败');
  };
  await assert.rejects(api.queryDetail(scope, extensionAsset, '0.5.0'), /文件读取失败/);
  skillBaseService.queryPlanningItemContent = async () => success({ content: '# package' });
  skillBaseService.queryPublishedHistoryList = async () => success([]);
  console.log(
    'PASS HTTP Extension content follows release versions, keeps drafts, and surfaces file errors',
  );

  response = success({
    records: ['一', '二'].map((suffix) => ({
      name: `udm-extension-${suffix}`,
      description: `场景${suffix}的扩展`,
      latestVersion: '1.0.0',
      status: '可发布',
      category: '产品级/udm',
      updatedAt: '2026-09-02 12:00:00',
      firstScene: `应用开发${suffix}`,
      secondScene: `代码开发${suffix}`,
      canPublish: suffix === '二',
    })),
    total: 2,
    pageNo: 1,
    pageSize: 30,
  });
  const list = await api.queryAssets(
    { ...scope, assetType: 'Extension' },
    { pageNum: 1, pageSize: 30 },
  );
  const selectedExtension = list.list[1];
  assert.equal(
    list.list[0].canPublish,
    false,
    'retain the permission flag independently of scene readiness',
  );
  assert.equal(selectedExtension.canPublish, true);
  assert.equal(
    list.list[0].publishable,
    true,
    'a permission denial disables rather than hides the ready asset action',
  );
  assert.equal(selectedExtension.firstScene, '应用开发二');
  assert.equal(selectedExtension.secondScene, '代码开发二');
  calls.length = 0;
  request.api = async () => assert.fail('publish must not query card metadata');
  request.harnessApi = async (config) => {
    calls.push(config);
    return success({
      firstScene: config.data.firstScene,
      secondScene: config.data.secondScene,
      readyStatus: '已就绪',
      publishedExtension: null,
      components: { commands: [{ name: '/udm-e2e', version: '1.0.0' }], skills: [], agents: [] },
    });
  };
  await assert.rejects(api.queryPublishDetail(scope, list.list[0]), /没有发布权限/);
  await assert.rejects(
    api.publish({ scope, asset: list.list[0], organization: { id: 'org-1', name: '组织一' } }),
    /没有发布权限/,
  );
  assert.equal(
    calls.length,
    0,
    'denied publication must not make publish preparation or submission requests',
  );
  await api.queryPublishDetail(scope, selectedExtension);
  assert.deepEqual(calls, [
    {
      url: '/extensions/detail',
      method: 'POST',
      params: { userId: 'user-001' },
      data: {
        dimType: '产品级',
        dimCode: 'product-1',
        dimName: 'udm',
        extensionName: 'udm-extension-二',
        firstScene: '应用开发二',
        secondScene: '代码开发二',
      },
    },
  ]);
  console.log(
    'PASS Extension publication carries the selected list item scene names alongside its code',
  );
  await api.queryReleases(scope, selectedExtension);
  await api.queryPublishDetail(scope, selectedExtension);
  assert.deepEqual(
    calls[1].data,
    calls[0].data,
    'scene names survive release refresh and reopening publication',
  );
  selectedExtension.canPublish = false;
  await api.queryReleases(scope, selectedExtension);
  assert.equal(
    selectedExtension.canPublish,
    false,
    'refreshing release history must not reset user permission',
  );
  console.log('PASS publication permission is preserved and denied actions issue no requests');
} finally {
  await server.close();
}

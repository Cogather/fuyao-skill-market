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

  const extensionAsset = {
    ...asset('Extension'),
    currentVersion: '2.0.0',
    canPublish: false,
    dimType: '部门级',
    dimCode: 'record-dept',
    dimName: '卡片部门',
    firstScene: '应用开发',
    secondScene: '代码开发',
  };
  response = success({
    name: extensionAsset.name,
    type: 'EXTENSION',
    description: '文件内容测试',
    firstScene: '不能覆盖卡片一级场景',
    secondScene: '不能覆盖卡片二级场景',
    versions,
  });
  skillBaseService.queryPublishedHistoryList = async () =>
    assert.fail('card content must not query history');
  skillBaseService.queryPlanningItemTree = async () => assert.fail('tree is lazy');
  skillBaseService.queryPlanningItemContent = async () => assert.fail('file content is lazy');
  const bindingCalls = [];
  let failBindings = false;
  let matchingScene = true;
  request.harnessApi = async (config) => {
    calls.push(config);
    bindingCalls.push(config);
    assert.equal(config.url, '/scenes/bindings');
    if (failBindings) return { meta: { success: false, message: '绑定查询失败' }, data: null };
    const components = {
      skills: [
        { name: 'selected-skill', version: config.data.version === '1.0.0' ? '0.9.0' : '3.0.0' },
      ],
      commands: [{ name: 'selected-command', version: '0.8.0', filePath: 'commands/run.md' }],
      agents: [{ name: 'selected-agent', version: '0.7.0' }],
    };
    return success([
      { firstScene: '其他场景', secondScenes: [{ secondScene: '代码开发', components }] },
      {
        firstScene: '应用开发',
        secondScenes: [
          { secondScene: '其他子场景', components },
          ...(matchingScene ? [{ secondScene: '代码开发', components }] : []),
        ],
      },
    ]);
  };
  calls.length = 0;
  const latestDetail = await api.queryDetail(scope, extensionAsset);
  assert.equal(latestDetail.version, '1.0.0', 'select latest upload from fresh component detail');
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/v1/harness/plans/components/detail', '/scenes/bindings'],
  );
  assert.deepEqual(bindingCalls[0], {
    url: '/scenes/bindings',
    method: 'post',
    params: { userId: 'user-001' },
    data: { dimType: '部门级', dimCode: 'record-dept', dimName: '卡片部门', version: '1.0.0' },
  });
  assert.deepEqual(latestDetail.files, [], 'files must not be eagerly fetched');
  assert.deepEqual(
    Object.values(latestDetail.capabilities).map((rows) => rows.length),
    [1, 1, 1],
  );
  assert.equal(latestDetail.capabilities.skill[0].name, 'selected-skill');
  assert.equal(latestDetail.capabilities.skill[0].version, '0.9.0');
  assert.deepEqual(latestDetail.capabilities.command[0].files, [
    { name: 'commands/run.md', content: '' },
  ]);
  assert.deepEqual(latestDetail.capabilities.agent[0].files, [
    { name: 'selected-agent.md', content: '' },
  ]);
  const otherVersion = await api.queryDetail(scope, extensionAsset, '2.0.0');
  assert.equal(bindingCalls.length, 2, 'one bindings request per selected version');
  assert.equal(bindingCalls[1].data.version, '2.0.0');
  assert.equal(otherVersion.capabilities.skill[0].version, '3.0.0');
  matchingScene = false;
  assert.deepEqual((await api.queryDetail(scope, extensionAsset)).capabilities, {
    skill: [],
    command: [],
    agent: [],
  });
  failBindings = true;
  await assert.rejects(api.queryDetail(scope, extensionAsset), /绑定查询失败/);
  const beforeMissingScene = bindingCalls.length;
  await assert.rejects(
    api.queryDetail(scope, { ...extensionAsset, firstScene: '', secondScene: '' }),
    /缺少一级场景/,
  );
  assert.equal(
    bindingCalls.length,
    beforeMissingScene,
    'missing scene must not query unrelated content',
  );
  skillBaseService.queryPlanningItemTree = async () => success(['SKILL.md']);
  skillBaseService.queryPlanningItemContent = async () => success({ content: '# package' });
  skillBaseService.queryPublishedHistoryList = async () => success([]);
  console.log(
    'PASS versioned Extension bindings use record scope, exact scene filtering and lazy files',
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

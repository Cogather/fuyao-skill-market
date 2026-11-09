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
  const {
    batchAssetPublishService,
    createBatchPublishQuery,
    BATCH_PUBLISH_LIMIT,
    batchPublishItem,
  } = await server.ssrLoadModule('/src/services/skillMarket/batchAssetPublishService.ts');
  const department = {
    id: ' dept-a ',
    code: ' code-a ',
    name: ' 研发部 ',
    path: [' 部门1 ', '研发部'],
  };
  assert.equal(BATCH_PUBLISH_LIMIT, 10);
  for (const [type, apiType] of [
    ['Agent', 'AGENT'],
    ['Skill', 'SKILL'],
    ['Command', 'COMMAND'],
  ]) {
    const query = createBatchPublishQuery(type, ' work-123 ', department);
    assert.deepEqual(query, {
      assetType: apiType,
      userId: 'work-123',
      deptCode: 'code-a',
    });
    const options = await batchAssetPublishService.queryOptions(query);
    assert.equal(options.assets.length, 14);
    assert.equal(options.organizations.length, 3);
    assert.ok(
      options.assets.every(
        (asset) =>
          asset.assetType === type && asset.dimCode.includes('code-a') && asset.targetOrgId,
      ),
    );
    assert.equal(options.assets.filter((asset) => asset.targetOrgId === 'org-fuyao').length, 12);
    const other = await batchAssetPublishService.queryOptions({
      ...query,
      deptCode: 'code-b',
    });
    assert.ok(other.assets.every((asset) => asset.dimCode.includes('code-b')));
  }
  const validQuery = createBatchPublishQuery('Agent', 'work-123', department);
  await assert.rejects(
    batchAssetPublishService.queryOptions({ ...validQuery, userId: '' }),
    /工号/,
  );
  await assert.rejects(
    batchAssetPublishService.queryOptions({ ...validQuery, assetType: 'EXTENSION' }),
    /仅支持/,
  );
  await assert.rejects(
    batchAssetPublishService.queryOptions({
      ...validQuery,
      deptCode: '',
    }),
    /选择部门/,
  );
  console.log(
    'PASS batch preparation passes type, employee ID and department; mock data covers all types and the ten-item boundary',
  );

  const pending = await batchAssetPublishService.queryOptions(validQuery);
  assert.equal(new Set(pending.assets.map((asset) => asset.id)).size, pending.assets.length);
  const input = {
    targetOrgId: 'org-fuyao',
    userId: 'work-123',
    userName: '测试用户',
    items: pending.assets.slice(0, 2).map(batchPublishItem),
  };
  const result = await batchAssetPublishService.submit(input);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.ok(result.batchId);
  const partial = await batchAssetPublishService.submit({
    ...input,
    items: [input.items[0], batchPublishItem(pending.assets[2])],
  });
  assert.equal(partial.accepted.length, 1);
  assert.match(partial.rejected[0].reason, /发布中/);
  const remaining = await batchAssetPublishService.queryOptions(validQuery);
  assert.ok(
    remaining.assets.every(
      (asset) => !pending.assets.slice(0, 3).some((selected) => selected.id === asset.id),
    ),
  );
  const wrongOrg = await batchAssetPublishService.submit({
    ...input,
    items: [batchPublishItem(pending.assets[12])],
  });
  assert.equal(wrongOrg.accepted.length, 0);
  assert.match(wrongOrg.rejected[0].reason, /绑定关系/);
  await assert.rejects(batchAssetPublishService.submit({ ...input, items: [] }), /不能为空/);
  await assert.rejects(
    batchAssetPublishService.submit({
      ...input,
      items: pending.assets.slice(0, 11).map(batchPublishItem),
    }),
    /最多发布10/,
  );
  await assert.rejects(
    batchAssetPublishService.submit({ ...input, items: [input.items[0], input.items[0]] }),
    /重复/,
  );
  const originalNow = Date.now;
  let now = originalNow() + 5000;
  Date.now = () => now;
  try {
    const history = await batchAssetPublishService.queryProgress(result.batchId, input.userId);
    assert.deepEqual(
      history.map((row) => row.publishStatus),
      ['发布成功', '发布失败'],
    );
    const failure = history[1];
    const atomic = await server.ssrLoadModule(
      '/src/services/skillMarket/atomicAssetPublishHttp.ts',
    );
    const cardHistory = await atomic.queryAtomicAssetPublishHistory({
      assetType: failure.assetType,
      assetName: failure.assetName,
      operatorId: input.userId,
    });
    assert.equal(
      cardHistory.records[0].id,
      failure.id,
      'batch tasks remain visible in the card publishing history',
    );
    await assert.rejects(batchAssetPublishService.retry(failure.id, 'another-user'), /不可重试/);
    await atomic.retryAtomicAssetPublish(failure.id, input.userId);
    assert.equal(
      (await batchAssetPublishService.queryProgress(result.batchId, input.userId))[1].publishStatus,
      '进行中',
    );
    now += 5000;
    assert.equal(
      (await batchAssetPublishService.queryProgress(result.batchId, input.userId))[1].publishStatus,
      '发布成功',
    );
    const repeat = await batchAssetPublishService.submit(input);
    assert.equal(repeat.accepted.length, 0);
    assert.ok(repeat.rejected.every((row) => row.reason.includes('已发布')));
  } finally {
    Date.now = originalNow;
  }
  console.log(
    'PASS mock submission, partial rejection, pending exclusion, progress, ownership and retry',
  );

  const { default: AssetPage } = await server.ssrLoadModule(
    '/src/views/skill/AgentSkillAssetsPage.vue',
  );
  let bindings;
  const TestHost = {
    setup() {
      bindings = AssetPage.setup(
        {
          userId: 'work-123',
          userName: '测试用户',
          departmentTree: [{ id: 'dept-a', deptCode: 'code-a', name: '研发部' }],
          currentUserDepartmentPath: ['研发部'],
          allowedDepartmentPaths: [],
          restrictToAllowedDepartments: false,
        },
        { expose() {} },
      );
      return () => h('div');
    },
  };
  await renderToString(createSSRApp(TestHost));
  bindings.selectedDepartmentId.value = 'dept-a';
  const requests = [];
  let resolveOptions;
  const options = { organizations: [{ id: 'org-a', name: '组织甲' }], assets: [] };
  batchAssetPublishService.queryOptions = (query) => {
    requests.push(query);
    return new Promise((resolve) => {
      resolveOptions = resolve;
    });
  };
  const opening = bindings.openBatchPublish();
  assert.equal(bindings.batchPublishLoading.value, true);
  assert.equal(
    bindings.batchPublishContext.value,
    null,
    'the window waits for preparation to finish',
  );
  await bindings.openBatchPublish();
  assert.equal(requests.length, 1, 'repeated clicks must not duplicate the query');
  assert.deepEqual(requests[0], {
    assetType: 'AGENT',
    userId: 'work-123',
    deptCode: 'code-a',
  });
  resolveOptions(options);
  await opening;
  assert.deepEqual(bindings.batchPublishContext.value.options, options);
  assert.equal(bindings.batchPublishLoading.value, false);

  bindings.batchPublishContext.value = null;
  const staleOpening = bindings.openBatchPublish();
  bindings.filter.value = 'Command';
  resolveOptions(options);
  await staleOpening;
  assert.equal(
    bindings.batchPublishContext.value,
    null,
    'changing type ignores the previous response',
  );
  batchAssetPublishService.queryOptions = async () => {
    throw new Error('准备失败');
  };
  await bindings.openBatchPublish();
  assert.equal(bindings.batchPublishContext.value, null);
  assert.equal(bindings.batchPublishLoading.value, false);
  assert.equal(bindings.batchPublishError.value, '准备失败');
  batchAssetPublishService.queryOptions = async () => options;
  await bindings.openBatchPublish();
  assert.equal(bindings.batchPublishContext.value.assetType, 'Command');
  assert.equal(bindings.batchPublishError.value, '');
  console.log(
    'PASS window opens only after preparation, rejects stale responses and supports error retry',
  );
} finally {
  await server.close();
}

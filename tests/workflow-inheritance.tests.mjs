import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { effectScope, nextTick, reactive } from 'vue';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true }, data });
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
const source = (index, extra = {}) => ({
  sourceDimType: '\u4ea7\u54c1\u7ea7',
  sourceDimCode: 'source-product',
  sourceDimName: 'Current scene',
  firstScene: 'Research',
  secondScene: `Scene ${index}`,
  sceneExtensionCode: `source-${index}`,
  flowName: `Workflow ${index}`,
  activityCount: 3,
  ...extra,
});
const current = {
  dimType: '\u4ea7\u54c1\u7ea7',
  dimCode: 'target-product',
  firstScene: 'Research',
  secondScene: 'Current scene',
};
const emptyDetail = {
  flowName: '',
  flowDescription: '',
  sceneExtensionCode: '',
  secondSceneDescription: '',
  commands: [],
  assetPool: [],
  stages: [],
  steps: [],
  nextStep: 0,
  allDone: false,
};
try {
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const inheritance = await server.ssrLoadModule(
    '/src/services/skillMarket/workflowInheritanceService.ts',
  );
  const originalRequest = request.harnessApi;

  await test('HTTP inheritance searches scenes with literal keywords and cumulative limits, excluding only the current identity', async () => {
    const requests = [];
    request.harnessApi = async (config) => {
      requests.push(config);
      const list = Array.from({ length: 40 }, (_, index) => source(index));
      list[1] = source(1, {
        sourceDimCode: 'target-product',
        firstScene: 'Research',
        secondScene: 'Current scene',
      });
      list[21] = source(21, {
        sourceDimType: '\u90e8\u95e8\u7ea7',
        sourceDimCode: 'target-product',
        firstScene: 'Research',
        secondScene: 'Current scene',
      });
      return success(
        config.url === '/scenes/search'
          ? list.slice(0, config.params.limit)
          : { total: 40, pageNo: 2, pageSize: 20, list },
      );
    };
    try {
      const first = await inheritance.queryWorkflowInheritancePage(
        { userId: 'parent-user', keyword: 'code % _ ', pageNo: 1, pageSize: 20 },
        current,
      );
      const second = await inheritance.queryWorkflowInheritancePage(
        { userId: 'parent-user', keyword: 'code % _ ', pageNo: 2, pageSize: 20 },
        current,
      );
      assert.deepEqual(
        requests.map(({ url, method, params }) => ({ url, method, params })),
        [
          {
            url: '/scenes/search',
            method: 'GET',
            params: { userId: 'parent-user', keyword: 'code % _ ', limit: 20 },
          },
          {
            url: '/scenes/search',
            method: 'GET',
            params: { userId: 'parent-user', keyword: 'code % _ ', limit: 40 },
          },
        ],
      );
      assert.equal(first.list.length, 19);
      assert.equal(first.excludedCurrent, true);
      assert.equal(first.hasMore, true);
      assert.equal(second.list.length, 39);
      assert.equal(second.list[0].secondScene, 'Scene 0');
      assert.equal(second.list[20].sourceDimType, '\u90e8\u95e8\u7ea7');
      assert.equal(second.list[0].activityCount, 3);
      assert.equal(second.list[0].key, '["\u4ea7\u54c1\u7ea7","source-product","source-0"]');
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('cumulative scene search stops on a short response and at the 100-row ceiling', async () => {
    request.harnessApi = async ({ params }) =>
      success(Array.from({ length: Math.min(params.limit, 45) }, (_, i) => source(i)));
    try {
      const last = await inheritance.queryWorkflowInheritancePage({
        userId: 'parent-user',
        keyword: '',
        pageNo: 3,
        pageSize: 20,
      });
      assert.equal(last.list.length, 45);
      assert.equal(last.hasMore, false);
      request.harnessApi = async ({ params }) => {
        assert.equal(params.limit, 100);
        return success(Array.from({ length: 100 }, (_, i) => source(i)));
      };
      const capped = await inheritance.queryWorkflowInheritancePage({
        userId: 'parent-user',
        keyword: '',
        pageNo: 5,
        pageSize: 20,
      });
      assert.equal(capped.list.length, 100);
      assert.equal(capped.hasMore, false);
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('cumulative scene responses retain newly inserted prefix identities and deduplicate one response', async () => {
    request.harnessApi = async ({ params }) =>
      success(
        params.limit === 20
          ? Array.from({ length: 20 }, (_, i) => source(i + 1))
          : [source('X'), ...Array.from({ length: 39 }, (_, i) => source(i + 1))],
      );
    try {
      const first = await inheritance.queryWorkflowInheritancePage({
        userId: 'u',
        pageNo: 1,
        pageSize: 20,
      });
      const second = await inheritance.queryWorkflowInheritancePage({
        userId: 'u',
        pageNo: 2,
        pageSize: 20,
      });
      const { mergeUniquePage } = await server.ssrLoadModule('/src/utils/infiniteScroll.ts');
      const merged = mergeUniquePage(first.list, second.list, (row) => row.key);
      assert.equal(merged.filter((row) => row.sceneExtensionCode === 'source-X').length, 1);
      assert.equal(merged.length, 40);
      request.harnessApi = async () => success([source(1), source(1), source(2)]);
      const duplicates = await inheritance.queryWorkflowInheritancePage({
        userId: 'u',
        pageNo: 1,
        pageSize: 20,
      });
      assert.equal(duplicates.list.length, 2);
      assert.equal(duplicates.hasMore, false);
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('scene identity survives rename and distinguishes identical names with different scene codes', async () => {
    const renamed = source(1, {
      sourceDimCode: 'target-product',
      secondScene: 'Renamed current',
      sceneExtensionCode: 'current-code',
    });
    const different = source(2, {
      sourceDimCode: 'target-product',
      secondScene: current.secondScene,
      sceneExtensionCode: 'different-code',
    });
    request.harnessApi = async () => success([renamed, different]);
    try {
      const page = await inheritance.queryWorkflowInheritancePage(
        { userId: 'u', pageNo: 1, pageSize: 20 },
        { ...current, sceneExtensionCode: 'current-code' },
      );
      assert.deepEqual(
        page.list.map((row) => row.sceneExtensionCode),
        ['different-code'],
      );
      assert.equal(page.excludedCurrent, true);
      assert.equal(
        inheritance.workflowInheritanceKey(renamed),
        inheritance.workflowInheritanceKey({ ...renamed, secondScene: 'Another rename' }),
      );
      assert.notEqual(
        inheritance.workflowInheritanceKey(renamed),
        inheritance.workflowInheritanceKey({ ...renamed, sceneExtensionCode: 'different-code' }),
      );
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('scene copy posts source dimensions with the current target scene names', async () => {
    const requests = [];
    request.harnessApi = async (config) => {
      requests.push(config);
      return { meta: { isSuccess: true }, data: 'new-scene-code' };
    };
    try {
      const code = await inheritance.copyWorkflowInheritance(source(1), {
        userId: 'parent-user',
        dimType: '\u90e8\u95e8\u7ea7',
        dimCode: 'target-dept',
        firstScene: 'Target parent',
        secondScene: 'Target child',
      });
      assert.equal(code, 'new-scene-code');
      assert.deepEqual(requests, [
        {
          url: '/scene/copy',
          method: 'POST',
          params: { userId: 'parent-user' },
          data: {
            sourceDimType: '\u4ea7\u54c1\u7ea7',
            sourceDimCode: 'source-product',
            sourceFirstScene: 'Research',
            sourceSecondScene: 'Scene 1',
            sourceSceneExtensionCode: 'source-1',
            targetDimType: '\u90e8\u95e8\u7ea7',
            targetDimCode: 'target-dept',
            targetFirstScene: 'Target parent',
            targetSecondScene: 'Target child',
          },
        },
      ]);
      requests.length = 0;
      await assert.rejects(
        inheritance.copyWorkflowInheritance(source(1, { sceneExtensionCode: null }), {
          userId: 'parent-user',
          dimType: '\u90e8\u95e8\u7ea7',
          dimCode: 'target-dept',
          firstScene: 'Target parent',
          secondScene: 'Target child',
        }),
        /\u6765\u6e90 Workflow \u7f3a\u5c11\u573a\u666f\u7f16\u7801/,
      );
      assert.equal(requests.length, 0, 'missing source scene codes must not issue copy requests');
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('search and copy preserve backend errors and reject malformed success payloads', async () => {
    request.harnessApi = async () => ({
      meta: { success: false, message: 'Same-name scene rejected' },
      data: null,
    });
    try {
      await assert.rejects(
        inheritance.queryWorkflowInheritancePage({
          userId: 'parent-user',
          pageNo: 1,
          pageSize: 20,
        }),
        /Same-name scene rejected/,
      );
      await assert.rejects(
        inheritance.copyWorkflowInheritance(source(1), {
          userId: 'parent-user',
          dimType: '\u4ea7\u54c1\u7ea7',
          dimCode: 'target-product',
          firstScene: 'Target parent',
          secondScene: 'Target child',
        }),
        /Same-name scene rejected/,
      );
      request.harnessApi = async () => success({ unexpected: [] });
      await assert.rejects(
        inheritance.queryWorkflowInheritancePage({
          userId: 'parent-user',
          pageNo: 1,
          pageSize: 20,
        }),
        /\u573a\u666f\u641c\u7d22\u54cd\u5e94/,
      );
      await assert.rejects(
        inheritance.copyWorkflowInheritance(source(1), {
          userId: 'parent-user',
          dimType: '\u4ea7\u54c1\u7ea7',
          dimCode: 'target-product',
          firstScene: 'Target parent',
          secondScene: 'Target child',
        }),
        /\u573a\u666f\u7f16\u7801/,
      );
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('HTTP confirmation copies once, reloads the target scope and selects the returned scene without client writes', async () => {
    const { createHarnessScenarioWorkspace } = await server.ssrLoadModule(
      '/src/composables/useHarnessScenarioWorkspace.ts',
    );
    const calls = [];
    let copied = false;
    api.queryProducts = async () =>
      success([{ offeringId: 'target-product', offeringName: 'Current scene' }]);
    api.querySceneList = async (params) => {
      calls.push(['scenes', { ...params }]);
      return success([
        {
          firstScene: 'Research',
          secondScene: 'Current scene',
          firstSceneId: 'root',
          secondSceneId: 'current',
          sceneExtensionCode: 'current-code',
          sort: 0,
        },
        ...(copied
          ? [
              {
                firstScene: 'Research',
                secondScene: 'Scene 1',
                firstSceneId: 'copied-root',
                secondSceneId: 'copied-child',
                sceneExtensionCode: 'new-scene-code',
                sort: 1,
              },
            ]
          : []),
      ]);
    };
    api.queryHarnessWorkflowDetail = async (params) => {
      calls.push(['detail', { ...params }]);
      return success({
        ...emptyDetail,
        flowName: 'Authoritative workflow',
        sceneExtensionCode: params.secondScene === 'Scene 1' ? 'new-scene-code' : 'current-code',
      });
    };
    request.harnessApi = async (config) => {
      calls.push(['http', config]);
      assert.equal(
        config.url,
        '/scene/copy',
        'inheritance must not write metadata, activities or bindings',
      );
      copied = true;
      return success('new-scene-code');
    };
    const scope = effectScope();
    try {
      const context = reactive({
        ready: true,
        userId: 'parent-user',
        departmentTree: [
          { id: 'dept', deptCode: 'dept', name: '\u4ea7\u54c1\u7ea7', children: [] },
        ],
        defaultDepartmentPath: ['\u4ea7\u54c1\u7ea7'],
        allowedDepartmentPaths: [['\u4ea7\u54c1\u7ea7']],
        restrictToAllowedDepartments: true,
      });
      const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
      for (let i = 0; i < 100 && (!workspace.available.value || !workspace.workflows.length); i++) {
        await nextTick();
        await setImmediate();
      }
      assert.equal(workspace.available.value, true);
      const copyRequest = request.harnessApi;
      request.harnessApi = async (config) => {
        assert.equal(config.url, '/scenes/search');
        return success([
          source(1, {
            sourceDimCode: 'target-product',
            secondScene: 'Renamed current',
            sceneExtensionCode: 'current-code',
          }),
          source(2, {
            sourceDimCode: 'target-product',
            secondScene: 'Current scene',
            sceneExtensionCode: 'other-code',
          }),
        ]);
      };
      const candidates = await workspace.queryWorkflowInheritance({
        keyword: '',
        pageNo: 1,
        pageSize: 20,
      });
      assert.deepEqual(
        candidates.list.map((row) => row.sceneExtensionCode),
        ['other-code'],
      );
      request.harnessApi = copyRequest;
      calls.length = 0;
      await workspace.inheritWorkflow(source(1));
      for (let i = 0; i < 10; i++) {
        await nextTick();
        await setImmediate();
      }
      const selected = workspace.scenarios.find(
        (item) => item._id === workspace.selectedScenarioId.value,
      );
      assert.equal(selected?.code, 'new-scene-code');
      assert.equal(selected?.name, 'Scene 1');
      assert.equal(calls[0][0], 'http', 'source detail must not be fetched to clone a draft');
      assert.deepEqual(calls[0][1].data, {
        sourceDimType: '\u4ea7\u54c1\u7ea7',
        sourceDimCode: 'source-product',
        sourceFirstScene: 'Research',
        sourceSecondScene: 'Scene 1',
        sourceSceneExtensionCode: 'source-1',
        targetDimType: '\u4ea7\u54c1\u7ea7',
        targetDimCode: 'target-product',
        targetFirstScene: 'Research',
        targetSecondScene: 'Current scene',
      });
      assert.equal(calls.filter(([kind]) => kind === 'http').length, 1);
      assert.ok(
        calls.some(([kind, params]) => kind === 'scenes' && params.dimCode === 'target-product'),
      );
      assert.equal(
        calls.some(([kind, params]) => kind === 'detail' && params.dimCode === 'source-product'),
        false,
      );
      assert.ok(workspace.scenarios.some((item) => item.code === 'current-code'));
    } finally {
      scope.stop();
      request.harnessApi = originalRequest;
    }
  });

  await test('mock inheritance searches workflow and scene names, excludes the target and paginates', () => {
    const departments = [
      { _id: 'dept-root', name: '研发部', path: ['研发部'], deptCode: 'dept-root' },
      { _id: 'dept-child', name: '平台组', path: ['研发部', '平台组'], deptCode: 'dept-child' },
      { _id: 'dept-other', name: '销售部', path: ['销售部'], deptCode: 'dept-other' },
    ];
    const products = [
      { _id: 'product-root', name: '根产品', code: 'root', departmentId: 'dept-root' },
      { _id: 'product-child', name: '平台产品', code: 'child', departmentId: 'dept-child' },
      { _id: 'product-other', name: '销售产品', code: 'other', departmentId: 'dept-other' },
    ];
    const scenarios = [
      {
        _id: 'parent-target',
        name: '质量保障',
        productId: 'product-root',
        parentId: null,
        level: 1,
      },
      {
        _id: 'target',
        name: '缺陷复盘',
        productId: 'product-root',
        parentId: 'parent-target',
        level: 2,
      },
      {
        _id: 'parent-code',
        name: '研发提效',
        productId: 'product-child',
        parentId: null,
        level: 1,
      },
      {
        _id: 'source-code',
        name: '代码审查',
        productId: 'product-child',
        parentId: 'parent-code',
        level: 2,
      },
      { _id: 'parent-doc', name: '知识管理', productId: 'product-child', parentId: null, level: 1 },
      {
        _id: 'source-doc',
        name: '文档归档',
        productId: 'product-child',
        parentId: 'parent-doc',
        level: 2,
      },
      { _id: 'other-parent', name: '商机', productId: 'product-other', parentId: null, level: 1 },
      {
        _id: 'other-source',
        name: '代码商机',
        productId: 'product-other',
        parentId: 'other-parent',
        level: 2,
      },
    ];
    const workflow = (id, scenarioId, name) => ({
      _id: id,
      scenarioId,
      name,
      description: '',
      status: 'draft',
      releaseCount: 0,
      commands: [],
      assets: [],
      stages: [],
    });
    const workflows = [
      workflow('target-flow', 'target', '当前流程'),
      workflow('code-flow', 'source-code', '自动检查 Workflow'),
      workflow('doc-flow', 'source-doc', '代码文档 Workflow'),
      workflow('other-flow', 'other-source', '代码销售 Workflow'),
    ];

    const firstPage = inheritance.queryLocalWorkflowInheritancePage({
      departments,
      products,
      scenarios,
      workflows,
      selectedDepartmentId: 'dept-root',
      currentScenarioId: 'target',
      keyword: '代码',
      pageNo: 1,
      pageSize: 1,
      userId: 'designer',
    });
    const secondPage = inheritance.queryLocalWorkflowInheritancePage({
      departments,
      products,
      scenarios,
      workflows,
      selectedDepartmentId: 'dept-root',
      currentScenarioId: 'target',
      keyword: '代码',
      pageNo: 2,
      pageSize: 1,
      userId: 'designer',
    });

    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.list[0].flowName, '自动检查 Workflow');
    assert.equal(firstPage.list[0].secondScene, '代码审查');
    assert.equal(secondPage.list[0].flowName, '代码文档 Workflow');
    assert.equal(secondPage.list[0].localWorkflowId, 'doc-flow');
  });

  await test('mock inheritance clones workflow content without replacing target scene identity', () => {
    const source = {
      _id: 'source-flow',
      scenarioId: 'source-scene',
      businessScenario: '代码审查',
      name: '自动检查 Workflow',
      description: '来源说明',
      status: 'active',
      releaseCount: 3,
      commands: [{ id: 'command', commandId: 'command', name: '/review' }],
      assets: [{ assetId: 'skill', type: 'Skill' }],
      stages: [
        {
          id: 'stage',
          name: '检查',
          order: 0,
          steps: [
            { id: 'node', name: '扫描', order: 0, assets: [{ assetId: 'skill', type: 'Skill' }] },
          ],
        },
      ],
    };
    const draft = inheritance.createLocalWorkflowInheritanceDraft(source, {
      scenarioId: 'target-scene',
      scenarioName: '缺陷复盘',
    });

    assert.equal(draft._id, 'workflow:target-scene');
    assert.equal(draft.scenarioId, 'target-scene');
    assert.equal(draft.businessScenario, '缺陷复盘');
    assert.equal(draft.name, '自动检查 Workflow');
    assert.equal(draft.releaseCount, 0);
    assert.equal(draft.status, 'draft');
    assert.notEqual(draft.stages, source.stages);
    draft.stages[0].name = '已修改';
    assert.equal(source.stages[0].name, '检查');
  });
} finally {
  await server.close();
}

if (failures) process.exitCode = 1;

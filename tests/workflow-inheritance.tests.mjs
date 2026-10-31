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

  await test('array data preserves scene search fields and reads the total from the response envelope', async () => {
    const row = {
      sourceDimType: 'xxx',
      sourceDimCode: 'xxx',
      sourceDimName: 'xxx',
      firstScene: 'xxx',
      secondScene: 'xxx',
      sceneExtensionCode: 'xxx',
      flowName: 'xxxx',
      activityCount: 1,
    };
    try {
      for (const envelope of [
        { meta: { success: true, message: 'OK', number: 21 }, data: [row] },
        { meta: { success: true, message: 'OK', number: 21, total: 1 }, total: 1, data: [row] },
        { meta: { success: true, total: 21 }, data: [row] },
        { meta: { success: true }, total: '21', data: [row] },
      ]) {
        request.harnessApi = async () => envelope;
        const page = await inheritance.queryWorkflowInheritancePage({
          userId: 'u',
          pageNo: 1,
          pageSize: 20,
        });
        assert.deepEqual(page.list[0], { ...row, key: inheritance.workflowInheritanceKey(row) });
        assert.equal(page.total, 21);
        assert.equal(page.hasMore, true);
      }
      request.harnessApi = async () => ({
        meta: { success: false, message: '场景搜索暂不可用', number: 0 },
        data: [],
      });
      await assert.rejects(
        inheritance.queryWorkflowInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 }),
        /场景搜索暂不可用/,
      );
      request.harnessApi = async () => ({
        meta: { success: true, message: 'OK', number: 0 },
        data: [],
      });
      const empty = await inheritance.queryWorkflowInheritancePage({
        userId: 'u',
        pageNo: 1,
        pageSize: 20,
      });
      assert.equal(empty.total, 0);
      assert.equal(empty.hasMore, false);
      assert.deepEqual(empty.list, []);
      request.harnessApi = async () => success([row]);
      await assert.rejects(
        inheritance.queryWorkflowInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 }),
        /总数量/,
      );
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('HTTP inheritance searches scenes with pageNum and pageSize, excluding only the current identity', async () => {
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
      const { pageNum, pageSize } = config.params;
      return {
        meta: { success: true, message: 'OK', number: 40 },
        data: list.slice((pageNum - 1) * pageSize, pageNum * pageSize),
      };
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
            params: { userId: 'parent-user', keyword: 'code % _ ', pageNum: 1, pageSize: 20 },
          },
          {
            url: '/scenes/search',
            method: 'GET',
            params: { userId: 'parent-user', keyword: 'code % _ ', pageNum: 2, pageSize: 20 },
          },
        ],
      );
      assert.equal(first.list.length, 19);
      assert.equal(first.excludedCurrent, true);
      assert.equal(first.hasMore, true);
      assert.equal(first.total, 40);
      assert.equal(second.total, 40);
      assert.equal(second.hasMore, false);
      assert.equal(second.list.length, 20);
      assert.equal(second.list[0].secondScene, 'Scene 20');
      assert.equal(second.list[1].sourceDimType, '\u90e8\u95e8\u7ea7');
      assert.equal(second.list[0].activityCount, 3);
      assert.equal(second.list[0].key, '["\u4ea7\u54c1\u7ea7","source-product","source-20"]');
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('scene search uses the backend total and can load beyond 100 rows', async () => {
    request.harnessApi = async ({ params }) =>
      success({ total: 45, list: Array.from({ length: 5 }, (_, i) => source(i + 40)) });
    try {
      const last = await inheritance.queryWorkflowInheritancePage({
        userId: 'parent-user',
        keyword: '',
        pageNo: 3,
        pageSize: 20,
      });
      assert.equal(last.list.length, 5);
      assert.equal(last.total, 45);
      assert.equal(last.hasMore, false);
      request.harnessApi = async ({ params }) => {
        assert.equal(params.pageNum, 6);
        assert.equal(params.pageSize, 20);
        assert.equal('limit' in params, false);
        return success({ total: 140, list: Array.from({ length: 20 }, (_, i) => source(i + 100)) });
      };
      const beyond = await inheritance.queryWorkflowInheritancePage({
        userId: 'parent-user',
        keyword: '',
        pageNo: 6,
        pageSize: 20,
      });
      assert.equal(beyond.list.length, 20);
      assert.equal(beyond.hasMore, true);
    } finally {
      request.harnessApi = originalRequest;
    }
  });

  await test('scene pages deduplicate repeated identities without replacing backend totals', async () => {
    request.harnessApi = async ({ params }) =>
      success({
        total: 40,
        list:
          params.pageNum === 1
            ? Array.from({ length: 20 }, (_, i) => source(i + 1))
            : [source('X'), ...Array.from({ length: 19 }, (_, i) => source(i + 20))],
      });
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
      assert.equal(merged.length, 39);
      assert.equal(second.hasMore, false);
      request.harnessApi = async () =>
        success({ total: 3, list: [source(1), source(1), source(2)] });
      const duplicates = await inheritance.queryWorkflowInheritancePage({
        userId: 'u',
        pageNo: 1,
        pageSize: 20,
      });
      assert.equal(duplicates.list.length, 2);
      assert.equal(duplicates.total, 3);
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
    request.harnessApi = async () => success({ total: 2, list: [renamed, different] });
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
      return config.url === '/scene/copy'
        ? { meta: { isSuccess: true }, data: 'new-scene-code' }
        : { meta: { isSuccess: true }, data: { ...emptyDetail, sceneExtensionCode: 'new-scene-code' } };
    };
    try {
      const result = await inheritance.copyWorkflowInheritance(source(1), {
        userId: 'parent-user',
        dimType: '\u90e8\u95e8\u7ea7',
        dimCode: 'target-dept',
        dimName: 'Target department',
        firstScene: 'Target parent',
        secondScene: 'Target child',
      });
      assert.equal(result.sceneExtensionCode, 'new-scene-code');
      assert.deepEqual(result.detail, { ...emptyDetail, sceneExtensionCode: 'new-scene-code' });
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
        {
          url: '/workflow/detail',
          method: 'GET',
          params: {
            userId: 'parent-user',
            dimCode: 'target-dept',
            firstScene: 'Target parent',
            secondScene: 'Target child',
          },
        },
      ]);
      requests.length = 0;
      await assert.rejects(
        inheritance.copyWorkflowInheritance(source(1, { sceneExtensionCode: null }), {
          userId: 'parent-user',
          dimType: '\u90e8\u95e8\u7ea7',
          dimCode: 'target-dept',
          dimName: 'Target department',
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

  for (const overwriteCurrent of [false, true]) {
    await test(`HTTP inheritance applies the returned detail when ${overwriteCurrent ? 'overwriting the same scene' : 'selecting a new scene'} without another detail request`, async () => {
      const { createHarnessScenarioWorkspace } = await server.ssrLoadModule(
        '/src/composables/useHarnessScenarioWorkspace.ts',
      );
      const calls = [];
      let copied = false;
      const copiedCode = overwriteCurrent ? 'current-code' : 'new-scene-code';
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
          ...(copied && !overwriteCurrent
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
          flowName: copied ? 'Inherited workflow' : 'Original workflow',
          flowDescription: copied ? 'Inherited description' : '',
          sceneExtensionCode: copied ? copiedCode : 'current-code',
          commands: copied
            ? [{ commandName: '/inherited', description: 'Inherited command', version: '2.0' }]
            : [],
          assetPool: copied ? [{ assetType: 'SKILL', assetName: 'Inherited Skill' }] : [],
          stages: copied
            ? [
                {
                  activityNodeName: 'Inherited stage',
                  sort: 0,
                  steps: [
                    {
                      subActivityNodeName: 'Inherited node',
                      sort: 0,
                      boundAssets: [{ assetType: 'SKILL', assetName: 'Inherited Skill' }],
                    },
                  ],
                },
              ]
            : [],
        });
      };
      request.harnessApi = async (config) => {
        calls.push(['http', config]);
        assert.equal(config.url, '/scene/copy');
        copied = true;
        return success(copiedCode);
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
        for (
          let i = 0;
          i < 100 && (!workspace.available.value || !workspace.workflows.length);
          i++
        ) {
          await nextTick();
          await setImmediate();
        }
        assert.equal(workspace.available.value, true);
        const previousScenarioId = workspace.selectedScenarioId.value;
        const copyRequest = request.harnessApi;
        request.harnessApi = async (config) => {
          assert.equal(config.url, '/scenes/search');
          return success({
            total: 2,
            list: [
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
            ],
          });
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
        const inherited = await workspace.inheritWorkflow(source(1));
        for (let i = 0; i < 10; i++) {
          await nextTick();
          await setImmediate();
        }
        const selected = workspace.scenarios.find(
          (item) => item._id === workspace.selectedScenarioId.value,
        );
        assert.equal(selected?.code, copiedCode);
        assert.equal(selected?.name, overwriteCurrent ? 'Current scene' : 'Scene 1');
        assert.equal(selected?._id === previousScenarioId, overwriteCurrent);
        const displayed = workspace.workflows.find((item) => item.scenarioId === selected._id);
        assert.equal(inherited.name, 'Inherited workflow');
        assert.equal(displayed.name, 'Inherited workflow');
        assert.equal(displayed.description, 'Inherited description');
        assert.equal(displayed.commands[0].name, '/inherited');
        assert.equal(displayed.stages[0].name, 'Inherited stage');
        assert.equal(displayed.stages[0].steps[0].name, 'Inherited node');
        assert.equal(displayed.stages[0].steps[0].assets[0].assetId, displayed.assets[0].assetId);
        assert.equal(
          workspace.assets.find((item) => item._id === displayed.assets[0].assetId).name,
          'Inherited Skill',
        );
        assert.equal(workspace.hasLoadedWorkflowDetail(selected._id), true);
        assert.equal(calls.filter(([kind]) => kind === 'detail').length, 1);
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
        assert.deepEqual(calls[1], [
          'detail',
          {
            userId: 'parent-user',
            dimType: '\u4ea7\u54c1\u7ea7',
            dimCode: 'target-product',
            dimName: 'Current scene',
            firstScene: 'Research',
            secondScene: 'Current scene',
          },
        ]);
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
  }

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

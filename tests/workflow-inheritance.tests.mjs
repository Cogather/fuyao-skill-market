import assert from 'node:assert/strict';
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
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

const workflowDetail = {
  flowName: '代码检查 Workflow',
  flowDescription: '复用代码检查编排',
  sceneExtensionCode: 'source-scene-code',
  secondSceneDescription: '来源场景说明',
  commands: [{ commandName: '/source-review', description: '检查入口', version: '1.2.0' }],
  assetPool: [
    { assetType: 'SKILL', assetName: 'review-skill', description: '检查代码', packageReady: true },
  ],
  stages: [
    {
      activityNodeName: '代码检查',
      sort: 0,
      steps: [
        {
          subActivityNodeName: '静态扫描',
          sort: 0,
          boundAssets: [{ assetType: 'SKILL', assetName: 'review-skill' }],
        },
      ],
    },
  ],
  steps: ['scenario', 'workflow', 'command', 'assets'].map((key) => ({
    key,
    label: key,
    state: 'done',
    reason: '',
  })),
  nextStep: 4,
  allDone: true,
};

try {
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const inheritance = await server.ssrLoadModule(
    '/src/services/skillMarket/workflowInheritanceService.ts',
  );

  await test('inheritance search forwards fuzzy keyword and pagination while excluding the current scene', async () => {
    const requests = [];
    api.queryHarnessWorkflowList = async (params) => {
      requests.push(params);
      return success({
        total: 3,
        pageNo: params.pageNo,
        pageSize: params.pageSize,
        list: [
          {
            flowName: '当前 Workflow',
            flowDescription: '不应出现在候选项中',
            firstScene: '质量保障',
            secondScene: '缺陷复盘',
            secondSceneDescription: '',
            sceneExtensionCode: 'current',
            dimType: '产品级',
            dimCode: 'target-product',
            dimName: 'Harness 平台',
            commandCount: 1,
            status: '设计中',
          },
          {
            flowName: '代码检查 Workflow',
            flowDescription: '可继承',
            firstScene: '研发提效',
            secondScene: '代码检查',
            secondSceneDescription: '',
            sceneExtensionCode: 'source',
            dimType: '产品级',
            dimCode: 'source-product',
            dimName: '研发平台',
            commandCount: 2,
            status: '待发布',
          },
          {
            flowName: '同名部门 Workflow',
            flowDescription: '维度不同，不应被当成当前工作流排除',
            firstScene: '质量保障',
            secondScene: '缺陷复盘',
            secondSceneDescription: '',
            sceneExtensionCode: 'department-source',
            dimType: '部门级',
            dimCode: 'target-product',
            dimName: '研发部/平台组',
            commandCount: 1,
            status: '设计中',
          },
        ],
      });
    };

    const page = await inheritance.queryWorkflowInheritancePage(
      {
        userId: 'designer',
        dimName: '研发部/平台组',
        keyword: '代码 检查',
        pageNo: 2,
        pageSize: 20,
      },
      {
        dimType: '产品级',
        dimCode: 'target-product',
        firstScene: '质量保障',
        secondScene: '缺陷复盘',
      },
    );

    assert.deepEqual(requests, [
      {
        userId: 'designer',
        dimName: '研发部/平台组',
        keyword: '代码 检查',
        pageNo: 2,
        pageSize: 20,
      },
    ]);
    assert.equal(page.total, 3);
    assert.equal(page.excludedCurrent, true);
    assert.equal(page.list.length, 2);
    assert.equal(page.list[0].flowName, '代码检查 Workflow');
    assert.equal(page.list[1].flowName, '同名部门 Workflow');
    assert.equal(page.list[0].key, '["产品级","source-product","研发提效","代码检查"]');
  });

  await test('inheritance detail is read from the source identity and remapped into the target scene', async () => {
    const detailRequests = [];
    api.queryHarnessWorkflowDetail = async (params) => {
      detailRequests.push(params);
      return success(workflowDetail);
    };

    const source = {
      key: '["产品级","source-product","研发提效","代码检查"]',
      flowName: '代码检查 Workflow',
      flowDescription: '可继承',
      firstScene: '研发提效',
      secondScene: '代码检查',
      secondSceneDescription: '',
      sceneExtensionCode: 'source',
      dimType: '产品级',
      dimCode: 'source-product',
      dimName: '研发平台',
      commandCount: 2,
      status: '待发布',
    };
    const mapped = await inheritance.loadWorkflowInheritanceDraft(source, {
      context: {
        userId: 'designer',
        dimType: '产品级',
        dimCode: 'target-product',
        dimName: 'Harness 平台',
        firstScene: '质量保障',
        secondScene: '缺陷复盘',
      },
      scenarioId: 'target-scenario',
      productId: 'target-product-id',
    });

    assert.deepEqual(detailRequests, [
      {
        userId: 'designer',
        dimType: '产品级',
        dimCode: 'source-product',
        dimName: '研发平台',
        firstScene: '研发提效',
        secondScene: '代码检查',
      },
    ]);
    assert.equal(mapped.workflow.scenarioId, 'target-scenario');
    assert.equal(mapped.workflow.businessScenario, '缺陷复盘');
    assert.equal(mapped.workflow.name, '代码检查 Workflow');
    assert.equal(mapped.workflow.description, '复用代码检查编排');
    assert.equal(mapped.workflow.commands[0].name, '/source-review');
    assert.ok(mapped.assets[0]._id.includes('target-product'));
    assert.equal(mapped.workflow.stages[0].steps[0].assets[0].assetId, mapped.assets[0]._id);
  });

  await test('a search that does not contain the current workflow keeps the server total unchanged', async () => {
    api.queryHarnessWorkflowList = async () =>
      success({
        total: 1,
        pageNo: 1,
        pageSize: 20,
        list: [
          {
            flowName: '命中的 Workflow',
            flowDescription: '',
            firstScene: '研发提效',
            secondScene: '代码生成',
            secondSceneDescription: '',
            sceneExtensionCode: '',
            dimType: '产品级',
            dimCode: 'source-product',
            dimName: '研发平台',
            commandCount: 0,
            status: '设计中',
          },
        ],
      });
    const page = await inheritance.queryWorkflowInheritancePage(
      { userId: 'designer', dimName: '研发部', keyword: '代码', pageNo: 1, pageSize: 20 },
      {
        dimType: '产品级',
        dimCode: 'target-product',
        firstScene: '质量保障',
        secondScene: '缺陷复盘',
      },
    );
    assert.equal(page.total, 1);
    assert.equal(page.excludedCurrent, false);
    assert.equal(page.list.length, 1);
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

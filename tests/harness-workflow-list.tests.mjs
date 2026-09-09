import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import {
  computed,
  createRenderer,
  h,
  nextTick,
  reactive,
  ref,
  shallowReactive,
  ssrContextKey,
} from 'vue';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const originalDocument = globalThis.document;
globalThis.document = { addEventListener() {}, removeEventListener() {} };
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const renderer = createRenderer({
  createElement: () => ({}),
  insert() {},
  remove() {},
  setElementText() {},
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setComment() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
});
const success = (data) => ({ meta: { success: true }, data });
const row = (flowName, status = '待发布') => ({
  flowName,
  flowDescription: '流程说明',
  firstScene: '研发',
  secondScene: '接口生成',
  secondSceneDescription: '接口说明',
  sceneExtensionCode: 'api-code',
  dimType: '产品级',
  dimCode: 'remote-product',
  dimName: '服务端产品',
  commandCount: 7,
  status,
});
const settle = async () => {
  await nextTick();
  await setImmediate();
  await nextTick();
};
let app;
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (cause) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(cause);
  } finally {
    app?.unmount();
    app = undefined;
    await settle();
  }
}

try {
  const { harnessWorkflowService: api } = await server.ssrLoadModule(
    '/src/services/skillMarket/businessScenarioDesignService.ts',
  );
  const { default: Page } = await server.ssrLoadModule('/src/views/skill/HarnessWorkflowsPage.vue');
  function mount(isHttp = true, active = true) {
    const departments = reactive([
      { _id: 'root', name: '研发部', path: ['研发部'], parentId: null, deptCode: 'dept-root' },
      {
        _id: 'child',
        name: '平台组',
        path: ['研发部', '平台组'],
        parentId: 'root',
        deptCode: 'dept-child',
      },
    ]);
    const selectedDeptId = ref('root');
    const products = reactive([
      { _id: 'product-id', code: 'remote-product', name: '产品选项', departmentId: 'root' },
    ]);
    let inventoryCalls = 0;
    const workspace = {
      isHttp,
      departments,
      products,
      scenarios: reactive([]),
      workflows: reactive([]),
      selectedDeptId,
      inventoryProductOptions: computed(() => products),
      workflowListScope: computed(() => ({
        userId: 'workflow-reader',
        dimName: departments.find((dept) => dept._id === selectedDeptId.value).path.join('/'),
      })),
      ensureInventoryScope: async () => {
        inventoryCalls += 1;
      },
      loading: ref(isHttp),
      available: ref(!isHttp),
      error: ref(isHttp ? '场景列表不可用' : ''),
      deptPath: (id) => departments.find((dept) => dept._id === id).path.join(' / '),
      selectDepartment: (id) => {
        selectedDeptId.value = id;
      },
      reloadScenes: async () => {},
    };
    const props = shallowReactive({ workspace, active });
    let state;
    app = renderer.createApp({
      setup(_, context) {
        state = Page.setup(props, context);
        return () => h('div');
      },
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount({});
    return { state, workspace, props, inventoryCalls: () => inventoryCalls };
  }

  await test('HTTP inventory loads independently of scene failures and uses server rows, totals and page requests', async () => {
    const requests = [];
    api.queryHarnessWorkflowList = async (params) => {
      requests.push(params);
      return success({
        total: 23,
        pageNo: params.pageNo,
        pageSize: 10,
        list: [row(`page-${params.pageNo}`)],
      });
    };
    const { state, inventoryCalls } = mount();
    await settle();
    assert.equal(
      requests.length,
      1,
      'HTTP inventory must request its own list even while scenes are unavailable',
    );
    assert.deepEqual(requests[0], {
      userId: 'workflow-reader',
      dimName: '研发部',
      pageNo: 1,
      pageSize: 10,
    });
    assert.equal(state.totalRows.value, 23);
    assert.equal(state.totalPages.value, 3);
    assert.equal(state.visibleRows.value[0].name, 'page-1');
    assert.equal(state.visibleRows.value[0].productName, '服务端产品');
    assert.equal(state.visibleRows.value[0].departmentName, '');
    assert.equal(state.visibleRows.value[0].commandCount, 7);
    assert.equal(state.visibleRows.value[0].scenarioPath, '研发 / 接口生成');
    assert.equal(state.visibleRows.value[0].status, '待发布');
    assert.equal(inventoryCalls(), 0);
    state.page.value = 2;
    await settle();
    assert.equal(requests.at(-1).pageNo, 2);
    assert.equal(
      state.visibleRows.value.length,
      1,
      'Server pages must not be sliced a second time',
    );
    assert.equal(state.visibleRows.value[0].name, 'page-2');
    state.statusFilter.value = '待发布';
    await settle();
    assert.equal(requests.at(-1).pageNo, 1);
    assert.equal(requests.at(-1).status, '待发布');
    state.productFilter.value = 'product-id';
    await settle();
    assert.equal(requests.at(-1).productCode, 'remote-product');
    state.selectDept('child');
    await settle();
    assert.deepEqual(requests.at(-1), {
      userId: 'workflow-reader',
      dimName: '研发部/平台组',
      pageNo: 1,
      pageSize: 10,
    });
  });

  await test('Page size changes reset HTTP pagination and page jumps stay within the result range', async () => {
    const requests = [];
    api.queryHarnessWorkflowList = async (params) => {
      requests.push(params);
      return success({
        total: 123,
        pageNo: params.pageNo,
        pageSize: params.pageSize,
        list: [row(`page-${params.pageNo}-size-${params.pageSize}`)],
      });
    };
    const { state } = mount();
    await settle();
    state.page.value = 3;
    await settle();
    const beforeResize = requests.length;
    state.setPageSize(20);
    await settle();
    assert.equal(requests.length, beforeResize + 1);
    assert.equal(requests.at(-1).pageNo, 1);
    assert.equal(requests.at(-1).pageSize, 20);
    assert.equal(state.totalPages.value, 7);
    assert.equal(state.visibleRows.value[0].name, 'page-1-size-20');

    state.jumpPage.value = '4';
    state.goToPage();
    await settle();
    assert.equal(requests.at(-1).pageNo, 4);
    assert.equal(requests.at(-1).pageSize, 20);

    for (const [input, expectedPage] of [
      ['999', 7],
      ['0', 1],
      ['-2', 1],
      ['2.5', 2],
    ]) {
      state.jumpPage.value = input;
      state.goToPage();
      await settle();
      assert.equal(state.page.value, expectedPage);
      assert.equal(state.jumpPage.value, String(expectedPage));
    }
    const beforeInvalid = requests.length;
    for (const input of ['', 'invalid']) {
      state.jumpPage.value = input;
      state.goToPage();
      await settle();
      assert.equal(state.page.value, 2);
      assert.equal(state.jumpPage.value, '2');
    }
    assert.equal(requests.length, beforeInvalid);
    state.statusFilter.value = '待发布';
    await settle();
    assert.equal(requests.at(-1).pageNo, 1);
    assert.equal(requests.at(-1).pageSize, 20);
    assert.equal(state.jumpPage.value, '1');
  });

  await test('Latest status selection wins when older HTTP responses finish later', async () => {
    let release;
    api.queryHarnessWorkflowList = async (params) => {
      if (params.status === '已发布')
        await new Promise((resolve) => {
          release = resolve;
        });
      return success({
        total: 1,
        pageNo: 1,
        pageSize: 10,
        list: [row(params.status || 'initial', params.status || '设计中')],
      });
    };
    const { state } = mount();
    await settle();
    state.statusFilter.value = '已发布';
    await settle();
    assert.equal(typeof release, 'function', 'Status selection must send a server query');
    state.statusFilter.value = '设计中';
    await settle();
    assert.equal(state.visibleRows.value[0].name, '设计中');
    release();
    await settle();
    assert.equal(state.visibleRows.value[0].name, '设计中');
    assert.equal(state.inventoryLoading.value, false);
  });

  await test('Hidden HTTP inventory pauses queries and rejects in-flight results, then refreshes the same filters and page on activation', async () => {
    const requests = [];
    let release;
    let holdNext = false;
    let revision = 'initial';
    api.queryHarnessWorkflowList = async (params) => {
      requests.push(params);
      const name = revision;
      if (holdNext) {
        holdNext = false;
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return success({ total: 23, pageNo: params.pageNo, pageSize: 10, list: [row(name)] });
    };
    const { state, props } = mount(true, false);
    await settle();
    assert.equal(requests.length, 0, 'A v-show-hidden tab must not query the HTTP list');
    state.productFilter.value = 'product-id';
    state.statusFilter.value = '待发布';
    await settle();
    state.page.value = 2;
    await settle();
    assert.equal(requests.length, 0, 'Hidden filter changes must not request list data');
    props.active = true;
    await settle();
    assert.deepEqual(requests.at(-1), {
      userId: 'workflow-reader',
      dimName: '研发部',
      productCode: 'remote-product',
      status: '待发布',
      pageNo: 2,
      pageSize: 10,
    });
    assert.equal(state.visibleRows.value[0].name, 'initial');
    holdNext = true;
    state.page.value = 3;
    await settle();
    assert.equal(typeof release, 'function');
    props.active = false;
    await settle();
    release();
    await settle();
    assert.equal(
      state.visibleRows.value.length,
      0,
      'A response finishing after hiding must be ignored',
    );
    assert.equal(state.inventoryLoading.value, false);
    const before = requests.length;
    revision = 'saved-design';
    props.active = true;
    await settle();
    assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).pageNo, 3);
    assert.equal(requests.at(-1).status, '待发布');
    assert.equal(requests.at(-1).productCode, 'remote-product');
    assert.equal(state.visibleRows.value[0].name, 'saved-design');
  });

  await test('HTTP errors clear stale data, support retry, and reject responses without real pagination metadata', async () => {
    let response = { meta: { success: false, message: '工作流查询失败' }, data: null };
    api.queryHarnessWorkflowList = async () => response;
    const { state } = mount();
    await settle();
    assert.equal(state.inventoryError.value, '工作流查询失败');
    assert.equal(state.visibleRows.value.length, 0);
    response = success({ total: 0, pageNo: 1, pageSize: 10, list: [] });
    await state.refreshInventoryScope();
    assert.equal(state.inventoryError.value, '');
    assert.equal(state.totalRows.value, 0);
    response = success({ list: [row('missing-total')] });
    await state.refreshInventoryScope();
    assert.ok(
      state.inventoryError.value,
      'Missing pagination must be an error instead of a guessed total',
    );
    assert.equal(state.visibleRows.value.length, 0);
  });

  await test('A shrinking server result returns from an out-of-range page to the remaining page', async () => {
    const requests = [];
    api.queryHarnessWorkflowList = async (params) => {
      requests.push(params.pageNo);
      return success({
        total: 1,
        pageNo: params.pageNo,
        pageSize: 10,
        list: params.pageNo === 1 ? [row('remaining')] : [],
      });
    };
    const { state } = mount();
    await settle();
    state.page.value = 3;
    await settle();
    assert.equal(state.page.value, 1);
    assert.deepEqual(requests, [1, 3, 1]);
    assert.equal(state.visibleRows.value[0].name, 'remaining');
  });

  await test('Mock inventory keeps local shared workflows, command counts, pagination and release filters', async () => {
    let requests = 0;
    api.queryHarnessWorkflowList = async () => {
      requests += 1;
      throw new Error('Mock must not query HTTP');
    };
    const { state, workspace, inventoryCalls } = mount(false);
    workspace.scenarios.push({
      _id: 'scene',
      name: '本地场景',
      productId: 'product-id',
      parentId: null,
    });
    workspace.workflows.push(
      ...Array.from({ length: 12 }, (_, index) => ({
        _id: `mock-${index}`,
        name: `本地流程${index}`,
        scenarioId: 'scene',
        description: '',
        commands: Array.from({ length: index % 3 }, () => ({})),
        releaseCount: index < 4 ? 1 : 0,
      })),
    );
    await settle();
    assert.equal(requests, 0);
    assert.equal(inventoryCalls(), 1);
    assert.equal(state.totalRows.value, 12);
    assert.equal(state.visibleRows.value.length, 10);
    assert.equal(state.visibleRows.value[0].departmentName, '研发部');
    state.page.value = 2;
    await settle();
    assert.equal(state.visibleRows.value.length, 2);
    assert.equal(state.visibleRows.value[1].commandCount, 2);
    state.setPageSize(20);
    await settle();
    assert.equal(state.page.value, 1);
    assert.equal(state.visibleRows.value.length, 12);
    assert.equal(state.totalPages.value, 1);
    state.setPageSize(10);
    await settle();
    state.jumpPage.value = '2';
    state.goToPage();
    await settle();
    assert.equal(state.visibleRows.value.length, 2);
    assert.equal(state.visibleRows.value[0].name, '本地流程10');
    state.statusFilter.value = '已发布';
    await settle();
    assert.equal(state.page.value, 1);
    assert.equal(state.totalRows.value, 4);
    assert.ok(state.visibleRows.value.every((item) => item.status === '已发布'));
    assert.equal(requests, 0);
  });
} finally {
  app?.unmount();
  await server.close();
  globalThis.document = originalDocument;
}
if (failures) process.exitCode = 1;

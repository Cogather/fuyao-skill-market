import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createRenderer, createSSRApp, h, nextTick, reactive, ssrContextKey } from 'vue';
import { renderToString } from 'vue/server-renderer';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
import { createServer } from 'vite';

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
const settle = async () => {
  await nextTick();
  await setImmediate();
  await nextTick();
};
const source = (key, flowName, secondScene) => ({
  key,
  flowName,
  flowDescription: `${flowName}说明`,
  firstScene: '研发提效',
  secondScene,
  secondSceneDescription: '',
  sceneExtensionCode: key,
  dimType: '产品级',
  dimCode: 'product',
  dimName: '研发平台',
  commandCount: 1,
  status: '待发布',
});

let app;
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  } finally {
    app?.unmount();
    app = undefined;
    await settle();
  }
}

try {
  const { default: Dialog } = await server.ssrLoadModule(
    '/src/components/skill/WorkflowInheritanceDialog.vue',
  );

  function mount(loadPage) {
    const props = reactive({ open: true, busy: false, error: '', loadPage });
    const events = [];
    let state;
    app = renderer.createApp({
      setup(_, context) {
        state = Dialog.setup(props, {
          ...context,
          emit: (name, value) => events.push([name, value]),
        });
        return () => h('div');
      },
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount({});
    return { state, props, events };
  }

  await test('HTTP dialog explains creating a new scene and rejects overwrite expectations', async () => {
    const context = {};
    await renderToString(
      createSSRApp(Dialog, {
        open: true,
        loadPage: async () => ({ total: 0, pageNo: 1, pageSize: 20, list: [] }),
      }),
      context,
    );
    const html = Object.values(context.teleports || {}).join('');
    assert.match(html, /\u5f53\u524d\u4ea7\u54c1\u6216\u90e8\u95e8\u4e0b\u65b0\u5efa\u573a\u666f/);
    assert.match(html, /\u540c\u540d\u573a\u666f.*\u62d2\u7edd/);
    assert.match(html, /\u4e0d\u4f1a\u8986\u76d6/);
    assert.doesNotMatch(html, /\u7ee7\u627f\u4f1a\u8986\u76d6\u5f53\u524d Workflow \u914d\u7f6e/);
  });

  await test('explicit cumulative-search continuation is honored even when filtering empties the reached page', async () => {
    const { state } = mount(async (query) => ({
      total: query.pageNo === 1 ? 0 : 1,
      pageNo: query.pageNo,
      pageSize: 20,
      list: query.pageNo === 1 ? [] : [source('later', 'Later workflow', 'Later scene')],
      hasMore: query.pageNo === 1,
    }));
    await settle();
    assert.equal(state.hasMore.value, true);
    await state.loadNextPage();
    assert.equal(state.rows.value.length, 1);
    assert.equal(state.hasMore.value, false);
  });

  await test('dialog resets search pagination, appends unique lazy pages and confirms one selection', async () => {
    const requests = [];
    const loadPage = async (query) => {
      requests.push({ ...query });
      if (query.keyword === '代码') {
        return query.pageNo === 1
          ? {
              total: 3,
              pageNo: 1,
              pageSize: 2,
              list: [
                source('code-1', '代码检查', '代码审查'),
                source('shared', '共享流程', '共享'),
              ],
            }
          : {
              total: 3,
              pageNo: 2,
              pageSize: 2,
              list: [
                source('shared', '重复共享流程', '共享'),
                source('code-2', '代码生成', '代码生成'),
              ],
            };
      }
      return {
        total: 1,
        pageNo: 1,
        pageSize: 20,
        list: [source('initial', '初始流程', '初始化')],
      };
    };
    const { state, events } = mount(loadPage);
    await settle();
    assert.deepEqual(requests[0], { keyword: '', pageNo: 1, pageSize: 20 });
    assert.equal(state.rows.value[0].flowName, '初始流程');

    state.keyword.value = ' 代码 ';
    await state.runSearch();
    assert.deepEqual(requests.at(-1), { keyword: '代码', pageNo: 1, pageSize: 20 });
    assert.equal(state.rows.value.length, 2);
    assert.equal(state.hasMore.value, true);

    await state.loadNextPage();
    assert.deepEqual(requests.at(-1), { keyword: '代码', pageNo: 2, pageSize: 20 });
    assert.deepEqual(
      state.rows.value.map((row) => row.key),
      ['code-1', 'shared', 'code-2'],
    );
    assert.equal(state.hasMore.value, false);

    state.selectRow(state.rows.value[2]);
    state.confirmSelection();
    assert.equal(events.length, 1);
    assert.equal(events[0][0], 'confirm');
    assert.equal(events[0][1].key, 'code-2');
  });

  await test('dialog deduplicates its first cumulative response and appends an unseen prefix once', async () => {
    const { state } = mount(async (query) => ({
      total: 40,
      pageNo: query.pageNo,
      pageSize: 20,
      hasMore: true,
      list:
        query.pageNo === 1
          ? [
              ...Array.from({ length: 20 }, (_, i) =>
                source(`A${i + 1}`, `Workflow ${i + 1}`, `Scene ${i + 1}`),
              ),
              source('A1', 'Duplicate', 'Scene 1'),
            ]
          : [
              source('X', 'Inserted', 'Inserted'),
              ...Array.from({ length: 39 }, (_, i) =>
                source(`A${i + 1}`, `Workflow ${i + 1}`, `Scene ${i + 1}`),
              ),
            ],
    }));
    await settle();
    assert.equal(state.rows.value.length, 20);
    await state.loadNextPage();
    assert.equal(state.rows.value.length, 40);
    assert.equal(state.rows.value.filter((row) => row.key === 'X').length, 1);
  });

  await test('editing the search clears a destructive selection before the debounce completes', async () => {
    const { state, events } = mount(async () => ({
      total: 1,
      pageNo: 1,
      pageSize: 20,
      list: [source('selected', 'Selected workflow', 'Selected scene')],
    }));
    await settle();

    state.selectRow(state.rows.value[0]);
    assert.equal(state.selected.value?.key, 'selected');

    state.keyword.value = 'different query';
    await nextTick();
    state.confirmSelection();

    assert.equal(state.selected.value, null);
    assert.deepEqual(events, []);
  });

  await test('an excluded current workflow keeps the adjusted total across lazy pages', async () => {
    const requests = [];
    const { state } = mount(async (query) => {
      requests.push({ ...query });
      if (!query.keyword) {
        return { total: 0, pageNo: 1, pageSize: 20, list: [] };
      }
      if (query.pageNo === 1) {
        return {
          total: 3,
          pageNo: 1,
          pageSize: 2,
          excludedCurrent: true,
          list: [source('page-1', 'First candidate', 'First scene')],
        };
      }
      return {
        total: 3,
        pageNo: 2,
        pageSize: 2,
        excludedCurrent: false,
        list: [source('page-2', 'Second candidate', 'Second scene')],
      };
    });
    await settle();

    state.keyword.value = 'paged';
    await state.runSearch();
    assert.equal(state.total.value, 2);
    assert.equal(state.hasMore.value, true);

    await state.loadNextPage();
    assert.equal(state.total.value, 2);
    assert.equal(state.rows.value.length, 2);
    assert.equal(state.hasMore.value, false);

    await state.loadNextPage();
    assert.equal(requests.filter((request) => request.keyword === 'paged').length, 2);
  });

  await test('Tab and Shift+Tab stay inside the dialog', async () => {
    const { state } = mount(async () => ({
      total: 0,
      pageNo: 1,
      pageSize: 20,
      list: [],
    }));
    await settle();

    let focused = '';
    const first = { focus: () => (focused = 'first') };
    const last = { focus: () => (focused = 'last') };
    state.dialogElement.value = {
      contains: (element) => element === first || element === last,
      focus: () => (focused = 'dialog'),
      querySelectorAll: () => [first, last],
    };

    const previousDocument = globalThis.document;
    try {
      let prevented = false;
      globalThis.document = { activeElement: last };
      state.handleKeydown({
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => (prevented = true),
      });
      assert.equal(prevented, true);
      assert.equal(focused, 'first');

      prevented = false;
      globalThis.document.activeElement = first;
      state.handleKeydown({
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => (prevented = true),
      });
      assert.equal(prevented, true);
      assert.equal(focused, 'last');
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });

  await test('dialog keeps the latest search result and preserves errors for retry', async () => {
    let releaseSlow;
    const loadPage = async (query) => {
      if (query.keyword === '慢') {
        await new Promise((resolve) => {
          releaseSlow = resolve;
        });
        return { total: 1, pageNo: 1, pageSize: 20, list: [source('slow', '慢结果', '慢')] };
      }
      if (query.keyword === '失败') throw new Error('候选 Workflow 加载失败');
      return {
        total: 1,
        pageNo: 1,
        pageSize: 20,
        list: [source('fast', query.keyword || '初始', '快')],
      };
    };
    const { state } = mount(loadPage);
    await settle();
    state.keyword.value = '慢';
    const slow = state.runSearch();
    await settle();
    state.keyword.value = '快';
    await state.runSearch();
    assert.equal(state.rows.value[0].flowName, '快');
    releaseSlow();
    await slow;
    assert.equal(state.rows.value[0].flowName, '快');

    state.keyword.value = '失败';
    await state.runSearch();
    assert.equal(state.loadError.value, '候选 Workflow 加载失败');
    assert.equal(state.rows.value.length, 0);
  });
} finally {
  app?.unmount();
  await server.close();
}

if (failures) process.exitCode = 1;

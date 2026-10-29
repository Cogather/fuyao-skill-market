import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { File } from 'node:buffer';
import { after, test } from 'node:test';
import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { createServer } from 'vite';

globalThis.File = File;
globalThis.Document = class Document {};
globalThis.ShadowRoot = class ShadowRoot {};
process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const { skillBaseService } = await server.ssrLoadModule(
  '/src/services/skillMarket/skillBaseService.ts',
);
const adapter = await server.ssrLoadModule('/src/services/skillMarket/extensionBypassService.ts');
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const result = (layoutMode = 'testagent') => ({
  layoutMode,
  acceptedEntries: [{ path: 'docs/guide.md', size: 18 }],
  ignoredEntries: [{ path: 'skills/protected.md', size: 7, reason: 'target protected' }],
});
const tree = (layoutMode = 'standard', suffix = '') => ({
  layoutMode,
  entries: [
    { path: `system${suffix}/`, type: 'dir', size: null, source: 'SYSTEM' },
    { path: 'skills/skill.md', type: 'file', size: 12, source: 'COMPONENT' },
    { path: 'docs/guide.md', type: 'file', size: 18, source: 'FILE' },
  ],
});
const source = (extensionName) => ({
  extensionName,
  description: 'Source description',
  layoutMode: 'testagent',
  hasBypass: true,
  entryCount: 1,
  latestVersion: '1.2.3',
  sourceDimName: 'Product A',
});
const cache = new Map();
async function loadSfc(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const { descriptor } = parse(await readFile(filename, 'utf8'), { filename });
  const compiled = compileScript(descriptor, { id: filename, inlineTemplate: true });
  const dependencies = { vue: Vue };
  for (const imp of compiled.imports ? Object.values(compiled.imports) : []) {
    if (imp.isType || dependencies[imp.source]) continue;
    const dependencyPath = path.resolve(path.dirname(filename), imp.source);
    // The page regression does not operate the unrelated department/select widgets.
    if (/\/(HarnessSelect|MarketDeptCascader)\.vue$/.test(imp.source)) {
      dependencies[imp.source] = { default: { render: () => Vue.h('span') } };
    } else if (imp.source.endsWith('.vue')) {
      dependencies[imp.source] = { default: await loadSfc(dependencyPath) };
    } else {
      dependencies[imp.source] = imp.source.endsWith('extensionBypassService')
        ? adapter
        : await server.ssrLoadModule(
            `/${path.relative(process.cwd(), dependencyPath).replaceAll('\\', '/')}`,
          );
    }
  }
  const content = compiled.content.replaceAll(
    'import.meta.env',
    JSON.stringify({
      VITE_SKILL_MARKET_TRANSPORT: 'http',
      BASE_URL: '/skill-market/',
    }),
  );
  const code = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => dependencies[name], exports);
  cache.set(filename, exports.default);
  return exports.default;
}
const makeNode = (type, text = '') => ({
  type,
  text,
  props: {},
  style: {},
  children: [],
  parent: null,
  focus() {},
  addEventListener() {},
  getRootNode() {
    return {};
  },
  querySelectorAll() {
    return [];
  },
  contains() {
    return false;
  },
});
const renderer = Vue.createRenderer({
  createElement: makeNode,
  createText: (text) => makeNode('#text', text),
  createComment: () => makeNode('#comment'),
  setText(node, text) {
    node.text = text;
  },
  setComment() {},
  setElementText(node, text) {
    node.text = text;
    node.children = [];
  },
  patchProp(node, key, _old, value) {
    node.props[key] = value;
  },
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1],
});
const settle = async () => {
  await Vue.nextTick();
  await setImmediate();
  await Vue.nextTick();
};
const nodes = (node) => [node, ...node.children.flatMap(nodes)];
const text = (node) => node.text + node.children.map(text).join('');
const find = (root, label) => {
  const node = nodes(root).find((n) => n.props['data-testid'] === label);
  assert.ok(node, `visible control ${label} exists`);
  return node;
};
const click = async (node) => {
  assert.ok(!node.props.disabled);
  await node.props.onClick?.({ target: node, currentTarget: node });
  await settle();
};
let calls = [];
let handlers = {};
for (const name of [
  'updateExtensionLayout',
  'uploadExtensionBypass',
  'clearExtensionBypass',
  'queryExtensionStructureTree',
  'getExtensionBypassDownload',
  'inheritExtensionBypass',
  'searchExtensions',
]) {
  skillBaseService[name] = async (...args) => {
    calls.push({ name, args });
    return handlers[name]
      ? handlers[name](...args)
      : success(name === 'queryExtensionStructureTree' ? tree(args[0].layout) : result());
  };
}
const scene = (code = 'scene-target') => ({
  id: code,
  sceneExtensionCode: code,
  layoutMode: 'standard',
  hasBypass: false,
  bypassEntries: [],
  extension: { name: 'published-package', description: '' },
  releases: [],
  publishing: null,
  capabilities: {
    skill: [{ name: 'skill', version: ' 1.0 ', id: 's' }],
    command: [{ name: 'empty-version', version: ' ' }],
    agent: [],
  },
});
async function mount(extra = {}, component = 'ExtensionPackagingPanel') {
  calls = [];
  handlers = {};
  const Component = await loadSfc(path.resolve(`src/components/skill/${component}.vue`));
  const props = Vue.reactive({ userId: 'parent-user', scene: scene(), ...extra });
  const updates = [];
  const root = makeNode('root');
  const app = renderer.createApp({
    setup: () => () =>
      Vue.h(Component, {
        ...props,
        onUpdated: (value) => {
          updates.push(value);
          Object.assign(props.scene, value);
        },
        onClose: () => {
          props.open = false;
        },
      }),
  });
  app.mount(root);
  await settle();
  return { root, props, updates, app };
}
const call = (name) => calls.filter((entry) => entry.name === name);

test('publication lock disables and guards every conflicting packaging request', async () => {
  const ctx = await mount({ publicationLocked: false, scene: { ...scene(), hasBypass: true } });
  try {
    await click(find(ctx.root, 'clear'));
    ctx.props.publicationLocked = true;
    await settle();
    const before = calls.length;
    for (const id of ['layout', 'upload', 'clear', 'download', 'inherit', 'confirm-clear'])
      assert.equal(find(ctx.root, id).props.disabled, true, `${id} respects publication lock`);
    await find(ctx.root, 'layout').props.onChange({ target: { value: 'testagent' } });
    await find(ctx.root, 'upload').props.onChange({
      target: { files: [new File(['zip'], 'pending.zip')], value: '' },
    });
    await find(ctx.root, 'download').props.onClick();
    await find(ctx.root, 'confirm-clear').props.onClick();
    await find(ctx.root, 'inherit').props.onClick();
    const refresh = nodes(ctx.root).find(
      (n) => n.type === 'button' && text(n).trim() === '刷新目录',
    );
    assert.equal(refresh.props.disabled, true);
    await refresh.props.onClick();
    assert.equal(calls.length, before, 'disabled event handlers cannot send requests');
    assert.equal(
      nodes(ctx.root).some((n) => n.props.role === 'dialog'),
      false,
    );
  } finally {
    ctx.app.unmount();
  }
});

test('packaging reports scene-scoped mutation state and releases it on error, scene change and unmount', async () => {
  const events = [];
  const ctx = await mount({ onMutationState: (value) => events.push(value) });
  let resolve;
  try {
    handlers.uploadExtensionBypass = () =>
      new Promise((r) => {
        resolve = r;
      });
    const pending = find(ctx.root, 'upload').props.onChange({
      target: { files: [new File(['zip'], 'pending.zip')], value: '' },
    });
    await settle();
    assert.deepEqual(events.at(-1), {
      userId: 'parent-user',
      sceneExtensionCode: 'scene-target',
      busy: true,
    });
    ctx.props.scene = scene('new-scene');
    await settle();
    assert.equal(events.at(-1).busy, false);
    resolve(success(result()));
    await pending;
    await settle();
    assert.equal(events.at(-1).busy, false, 'stale completion cannot relock a new scene');
    handlers.updateExtensionLayout = () => {
      throw new Error('failed');
    };
    await find(ctx.root, 'layout').props.onChange({ target: { value: 'testagent' } });
    assert.equal(events.at(-1).busy, false);
    const pendingUnmount = find(ctx.root, 'upload').props.onChange({
      target: { files: [new File(['zip'], 'pending.zip')], value: '' },
    });
    await settle();
    ctx.app.unmount();
    assert.equal(events.at(-1).busy, false);
    resolve(success(result()));
    await pendingUnmount;
  } finally {
    resolve?.(success(result()));
    ctx.app.unmount();
  }
});

test('page guards publication during deferred upload and packaging during deferred save', async () => {
  calls = [];
  handlers = {};
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  let resolveUpload, resolveSave;
  let saves = 0;
  request.harnessApi = async ({ url }) => {
    if (url === '/smapi-product-by-dept')
      return success([{ offeringId: 'product-a', offeringName: 'product-a' }]);
    if (url === '/scene-activity/scene')
      return success([{ firstScene: '开发', secondScene: '构建', sort: 0 }]);
    if (url === '/extensions/orgs') return success([{ orgCode: 'org-a', orgName: 'Org A' }]);
    if (url === '/extensions/save') {
      saves += 1;
      return new Promise((r) => {
        resolveSave = r;
      });
    }
    if (url === '/extensions/detail')
      return success({
        firstScene: '开发',
        secondScene: '构建',
        sceneExtensionCode: 'scene-target',
        readyStatus: '已就绪',
        layoutMode: 'standard',
        hasBypass: true,
        bypassEntries: [{ path: 'docs/guide.md', size: 18 }],
        publishedExtension: {
          extensionName: 'product-a-package',
          description: 'Publish description',
        },
        components: { skills: [{ name: 'skill-a', version: '1.0.0' }], commands: [], agents: [] },
      });
    return success([]);
  };
  handlers.uploadExtensionBypass = () =>
    new Promise((r) => {
      resolveUpload = r;
    });
  const Page = await loadSfc(path.resolve('src/views/skill/ExtensionPublishPage.vue'));
  const root = makeNode('root');
  const app = renderer.createApp(Page, {
    userId: 'parent-user',
    userName: 'Parent',
    departmentTree: [{ id: 'dept', deptCode: 'dept', name: '研发部', children: [] }],
    currentUserDepartmentPath: ['研发部'],
    allowedDepartmentPaths: [['研发部']],
    restrictToAllowedDepartments: true,
  });
  const button = (label) =>
    nodes(root).find((n) => n.type === 'button' && text(n).trim() === label);
  app.mount(root);
  let pendingUpload, pendingSave;
  try {
    for (let i = 0; i < 5; i++) await settle();
    await click(button('发布'));
    pendingUpload = find(root, 'upload').props.onChange({
      target: { files: [new File(['zip'], 'pending.zip')], value: '' },
    });
    await settle();
    const confirm = button('确认发布');
    assert.ok(confirm);
    assert.equal(confirm.props.disabled, true);
    await confirm.props.onClick();
    assert.equal(saves, 0);
    resolveUpload(success(result('standard')));
    await pendingUpload;
    await settle();
    assert.equal(confirm.props.disabled, false);
    pendingSave = confirm.props.onClick();
    await settle();
    assert.equal(saves, 1);
    const before = calls.length;
    assert.equal(find(root, 'upload').props.disabled, true);
    await find(root, 'upload').props.onChange({
      target: { files: [new File(['zip'], 'blocked.zip')], value: '' },
    });
    assert.equal(calls.length, before);
    resolveSave({ meta: { success: false, message: 'save denied' }, data: null });
    await pendingSave;
    await settle();
    assert.equal(find(root, 'upload').props.disabled, false);
    assert.match(text(root), /save denied/);
  } finally {
    resolveUpload?.(success(result('standard')));
    resolveSave?.(success('release'));
    await pendingUpload;
    await pendingSave;
    app.unmount();
  }
});

test('page keeps loaded skill directory/file and direct command content after successful packaging detail refresh', async () => {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  let layoutMode = 'standard';
  let detailRequests = 0;
  const contentRequests = [];
  let treeRequests = 0;
  request.harnessApi = async ({ url }) => {
    if (url === '/smapi-product-by-dept')
      return success([{ offeringId: 'product-a', offeringName: 'product-a' }]);
    if (url === '/scene-activity/scene')
      return success([{ firstScene: '开发', secondScene: '构建', sort: 0 }]);
    if (url === '/extensions/detail') {
      detailRequests += 1;
      return success({
        firstScene: '开发',
        secondScene: '构建',
        readyStatus: '已就绪',
        sceneExtensionCode: 'scene-target',
        layoutMode,
        hasBypass: false,
        bypassEntries: [],
        publishedExtension: { extensionName: 'published-package', description: '' },
        components: {
          skills: [{ id: 'skill-a', name: 'cached-skill', version: '1.0.0', ready: true }],
          commands: [{ id: 'command-a', name: 'cached-command', version: '2.0.0', ready: true }],
          agents: [],
        },
      });
    }
    return success([]);
  };
  const originalTree = skillBaseService.queryPlanningItemTree;
  const originalContent = skillBaseService.queryPlanningItemContent;
  skillBaseService.queryPlanningItemTree = async () => {
    treeRequests += 1;
    return success(['SKILL.md']);
  };
  skillBaseService.queryPlanningItemContent = async (params) => {
    contentRequests.push(params);
    return success(params.componentType === 'skill' ? 'Loaded skill body' : 'Loaded command body');
  };
  handlers.updateExtensionLayout = ({ layout }) => {
    layoutMode = layout;
    return success({ layoutMode });
  };
  const Page = await loadSfc(path.resolve('src/views/skill/ExtensionPublishPage.vue'));
  const root = makeNode('root');
  const app = renderer.createApp(Page, {
    userId: 'parent-user',
    userName: 'Parent User',
    departmentTree: [{ id: 'dept-a', deptCode: 'dept-a', name: '研发部', children: [] }],
    currentUserDepartmentPath: ['研发部'],
    allowedDepartmentPaths: [['研发部']],
    restrictToAllowedDepartments: true,
  });
  app.mount(root);
  const button = (label) => {
    const node = nodes(root).find((n) => n.type === 'button' && text(n).includes(label));
    assert.ok(node, `rendered ${label} control exists`);
    return node;
  };
  try {
    for (let i = 0; i < 5; i += 1) await settle();
    assert.equal(detailRequests, 1);
    await click(button('cached-skill'));
    await click(button('SKILL.md'));
    await click(button('cached-command'));
    assert.match(text(root), /Loaded skill body/);
    assert.match(text(root), /Loaded command body/);
    assert.equal(treeRequests, 1);
    assert.equal(contentRequests.length, 2);
    await find(root, 'layout').props.onChange({ target: { value: 'testagent' } });
    await settle();
    assert.equal(
      detailRequests,
      2,
      'successful packaging update performs authoritative detail GET',
    );
    assert.equal(find(root, 'layout').props.value, 'testagent');
    assert.match(
      text(root),
      /Loaded skill body/,
      'expanded unchanged skill content survives refreshed detail',
    );
    assert.match(
      text(root),
      /Loaded command body/,
      'expanded unchanged command content survives refreshed detail',
    );
    await click(button('cached-skill'));
    await click(button('cached-skill'));
    await click(button('cached-command'));
    await click(button('cached-command'));
    assert.match(text(root), /Loaded skill body/);
    assert.match(text(root), /Loaded command body/);
    assert.equal(treeRequests, 1);
    assert.equal(contentRequests.length, 2, 'valid unchanged content cache remains reusable');
  } finally {
    app.unmount();
    skillBaseService.queryPlanningItemTree = originalTree;
    skillBaseService.queryPlanningItemContent = originalContent;
  }
});

test('same component ID with changed name/version reloads content and ignores old in-flight loader completion', async () => {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  let refreshed = false;
  let resolveOldContent;
  const contentRequests = [];
  const treeRequests = [];
  request.harnessApi = async ({ url }) => {
    if (url === '/smapi-product-by-dept')
      return success([{ offeringId: 'product-a', offeringName: 'product-a' }]);
    if (url === '/scene-activity/scene')
      return success([{ firstScene: '开发', secondScene: '构建', sort: 0 }]);
    if (url === '/extensions/detail')
      return success({
        firstScene: '开发',
        secondScene: '构建',
        readyStatus: '已就绪',
        sceneExtensionCode: 'scene-target',
        layoutMode: refreshed ? 'testagent' : 'standard',
        hasBypass: false,
        bypassEntries: [],
        publishedExtension: { extensionName: 'published-package', description: '' },
        components: {
          skills: [
            {
              id: 'same-skill-id',
              name: refreshed ? 'renamed-skill' : 'changing-skill',
              version: '1.0.0',
              ready: true,
            },
          ],
          commands: [
            {
              id: 'same-command-id',
              name: 'changing-command',
              version: refreshed ? '2.0.0' : '1.0.0',
              ready: true,
            },
            {
              id: 'pending-command-id',
              name: 'pending-command',
              version: refreshed ? '2.0.0' : '1.0.0',
              ready: true,
            },
          ],
          agents: [],
        },
      });
    return success([]);
  };
  const originalTree = skillBaseService.queryPlanningItemTree;
  const originalContent = skillBaseService.queryPlanningItemContent;
  skillBaseService.queryPlanningItemTree = async (params) => {
    treeRequests.push(params);
    return success(['SKILL.md']);
  };
  skillBaseService.queryPlanningItemContent = async (params) => {
    contentRequests.push(params);
    if (
      params.componentName === 'pending-command' &&
      params.componentVersion === '1.0.0' &&
      !resolveOldContent
    ) {
      return new Promise((resolve) => {
        resolveOldContent = resolve;
      });
    }
    return success(`body:${params.componentName}@${params.componentVersion}`);
  };
  handlers.updateExtensionLayout = () => {
    refreshed = true;
    return success({ layoutMode: 'testagent' });
  };
  const Page = await loadSfc(path.resolve('src/views/skill/ExtensionPublishPage.vue'));
  const root = makeNode('root');
  const app = renderer.createApp(Page, {
    userId: 'parent-user',
    userName: 'Parent User',
    departmentTree: [{ id: 'dept-a', deptCode: 'dept-a', name: '研发部', children: [] }],
    currentUserDepartmentPath: ['研发部'],
    allowedDepartmentPaths: [['研发部']],
    restrictToAllowedDepartments: true,
  });
  const button = (label) => {
    const node = nodes(root).find((n) => n.type === 'button' && text(n).includes(label));
    assert.ok(node, `rendered ${label} control exists`);
    return node;
  };
  const reopen = async (label) => {
    if (button(label).props.class?.includes('is-open')) await click(button(label));
    await click(button(label));
  };
  let pending;
  app.mount(root);
  try {
    for (let i = 0; i < 5; i += 1) await settle();
    await click(button('changing-skill'));
    await click(button('SKILL.md'));
    await click(button('changing-command'));
    assert.match(text(root), /body:changing-skill@1.0.0/);
    assert.match(text(root), /body:changing-command@1.0.0/);
    const oldButton = button('pending-command');
    pending = oldButton.props.onClick({ target: oldButton, currentTarget: oldButton });
    await settle();
    assert.equal(typeof resolveOldContent, 'function');
    await find(root, 'layout').props.onChange({ target: { value: 'testagent' } });
    await settle();
    await reopen('renamed-skill');
    assert.equal(treeRequests.length, 2, 'renamed same-ID skill reloads its directory');
    await click(button('SKILL.md'));
    await reopen('changing-command');
    await reopen('pending-command');
    assert.match(text(root), /body:renamed-skill@1.0.0/);
    assert.match(text(root), /body:changing-command@2.0.0/);
    assert.match(
      text(root),
      /body:pending-command@2.0.0/,
      'old pending content must not block the new version',
    );
    // Returning to a previously evicted identity must also reload into its new component object.
    handlers.updateExtensionLayout = () => {
      refreshed = false;
      return success({ layoutMode: 'standard' });
    };
    await find(root, 'layout').props.onChange({ target: { value: 'standard' } });
    await settle();
    await reopen('changing-skill');
    assert.equal(
      treeRequests.length,
      3,
      'restored same-ID identity reloads after the old object was evicted',
    );
    await click(button('SKILL.md'));
    await reopen('changing-command');
    await reopen('pending-command');
    assert.match(text(root), /body:changing-skill@1.0.0/);
    assert.match(text(root), /body:pending-command@1.0.0/);
    resolveOldContent(success('old in-flight body'));
    await pending;
    await settle();
    assert.doesNotMatch(text(root), /old in-flight body/);
    await reopen('pending-command');
    assert.match(text(root), /body:pending-command@1.0.0/);
    assert.equal(
      contentRequests.filter(
        (row) => row.componentName === 'pending-command' && row.componentVersion === '2.0.0',
      ).length,
      1,
    );
  } finally {
    resolveOldContent?.(success('old in-flight body'));
    await pending;
    await settle();
    app.unmount();
    skillBaseService.queryPlanningItemTree = originalTree;
    skillBaseService.queryPlanningItemContent = originalContent;
  }
});

test('layout commits only server success, restores failure and refreshes source-colored structure', async () => {
  const ctx = await mount();
  try {
    assert.match(text(ctx.root), /打包与旁路/);
    const select = find(ctx.root, 'layout');
    assert.deepEqual(
      nodes(select)
        .filter((n) => n.type === 'option')
        .map((n) => n.props.value),
      ['standard', 'testagent'],
    );
    assert.equal(call('queryExtensionStructureTree')[0].args[0].extensionName, 'scene-target');
    assert.deepEqual(JSON.parse(call('queryExtensionStructureTree')[0].args[0].components), [
      { componentType: 'skill', componentName: 'skill', componentVersion: '1.0' },
      { componentType: 'command', componentName: 'empty-version' },
    ]);
    for (const sourceName of ['SYSTEM', 'COMPONENT', 'FILE'])
      assert.match(text(ctx.root), new RegExp(sourceName));
    let resolve;
    handlers.updateExtensionLayout = () =>
      new Promise((r) => {
        resolve = r;
      });
    const change = select.props.onChange({ target: { value: 'testagent' } });
    await settle();
    assert.equal(select.props.value, 'standard');
    assert.equal(find(ctx.root, 'upload').props.disabled, true);
    resolve(success({ layoutMode: 'testagent' }));
    await change;
    await settle();
    assert.equal(select.props.value, 'testagent');
    assert.equal(ctx.updates.at(-1).layoutMode, 'testagent');
    assert.equal(call('queryExtensionStructureTree').at(-1).args[0].layout, 'testagent');
    handlers.updateExtensionLayout = () => {
      throw new Error('save failed');
    };
    await select.props.onChange({ target: { value: 'standard' } });
    await settle();
    assert.equal(select.props.value, 'testagent');
    assert.match(text(ctx.root), /save failed/);
  } finally {
    ctx.app.unmount();
  }
});

test('zip upload renders accepted and ignored reasons, downloads lazily, clears with inline confirmation', async () => {
  const ctx = await mount();
  const opened = [];
  globalThis.window = { open: (...args) => opened.push(args) };
  try {
    assert.equal(call('getExtensionBypassDownload').length, 0);
    const input = find(ctx.root, 'upload');
    assert.equal(input.props.accept, '.zip');
    assert.ok(!input.props.multiple);
    await input.props.onChange({
      target: { files: [new File(['zip'], 'bundle.zip')], value: 'bundle.zip' },
    });
    await settle();
    assert.equal(call('uploadExtensionBypass')[0].args[0].get('extensionName'), 'scene-target');
    assert.equal(call('uploadExtensionBypass')[0].args[0].get('layout'), 'standard');
    assert.match(text(find(ctx.root, 'accepted-entries')), /docs\/guide.md/);
    assert.match(text(find(ctx.root, 'ignored-entries')), /target protected/);
    handlers.getExtensionBypassDownload = () =>
      success({ downloadUrl: 'https://example.com/one.zip', expireSeconds: 30 });
    await click(find(ctx.root, 'download'));
    assert.deepEqual(opened[0], ['https://example.com/one.zip', '_blank', 'noopener,noreferrer']);
    handlers.getExtensionBypassDownload = () =>
      success({ downloadUrl: 'https://example.com/fresh.zip', expireSeconds: 30 });
    await click(find(ctx.root, 'download'));
    assert.equal(call('getExtensionBypassDownload').length, 2);
    assert.equal(opened[1][0], 'https://example.com/fresh.zip');
    await click(find(ctx.root, 'clear'));
    assert.equal(call('clearExtensionBypass').length, 0);
    await click(find(ctx.root, 'confirm-clear'));
    assert.equal(call('clearExtensionBypass').length, 1);
    assert.equal(ctx.updates.at(-1).layoutMode, 'testagent');
    assert.equal(ctx.updates.at(-1).hasBypass, false);
    assert.doesNotMatch(text(ctx.root), /target protected/);
    assert.ok(call('queryExtensionStructureTree').length >= 3);
  } finally {
    ctx.app.unmount();
    delete globalThis.window;
  }
});

test('published full package remains downloadable when the scene has no bypass', async () => {
  const publishedScene = scene();
  publishedScene.extension.version = '1.2.0';
  const ctx = await mount({ scene: publishedScene });
  const opened = [];
  globalThis.window = { open: (...args) => opened.push(args) };
  try {
    handlers.getExtensionBypassDownload = () =>
      success({ downloadUrl: 'https://example.com/package.zip', expireSeconds: 3600 });
    const download = find(ctx.root, 'download');
    assert.equal(download.props.disabled, false);
    assert.match(text(download), /下载完整包/);
    await click(download);
    assert.deepEqual(opened[0], [
      'https://example.com/package.zip',
      '_blank',
      'noopener,noreferrer',
    ]);
  } finally {
    ctx.app.unmount();
    delete globalThis.window;
  }
});

test('component changes refresh tree; tree failure stays separate from mutation success and missing user is disabled', async () => {
  const ctx = await mount();
  try {
    ctx.props.scene.capabilities.agent.push({ name: 'agent-a', version: '2.0', id: 'a' });
    await settle();
    assert.deepEqual(
      JSON.parse(call('queryExtensionStructureTree').at(-1).args[0].components).at(-1),
      { componentType: 'agent', componentName: 'agent-a', componentVersion: '2.0' },
    );
    handlers.queryExtensionStructureTree = () => {
      throw new Error('tree unavailable');
    };
    await find(ctx.root, 'layout').props.onChange({ target: { value: 'testagent' } });
    await settle();
    assert.equal(ctx.updates.at(-1).layoutMode, 'testagent');
    assert.match(text(ctx.root), /目录加载失败.*tree unavailable/);
    assert.equal(find(ctx.root, 'layout').props.disabled, false);
    const before = calls.length;
    ctx.props.userId = '';
    await settle();
    assert.equal(calls.length, before);
    assert.equal(find(ctx.root, 'upload').props.disabled, true);
    assert.match(text(ctx.root), /等待当前用户身份/);
  } finally {
    ctx.app.unmount();
  }
});

test('inherit keyword edit invalidates old search and clears selected source before submitting again', async () => {
  const ctx = await mount();
  try {
    handlers.searchExtensions = () => success([source('old-source')]);
    await click(find(ctx.root, 'inherit'));
    await click(find(ctx.root, 'source-old-source'));
    let staleResolve;
    handlers.searchExtensions = () =>
      new Promise((resolve) => {
        staleResolve = resolve;
      });
    find(ctx.root, 'inherit-search').props['onUpdate:modelValue']('pending');
    await Vue.nextTick();
    assert.equal(find(ctx.root, 'confirm-inherit').props.disabled, true);
    const form = nodes(ctx.root).find((node) => node.type === 'form');
    const pending = form.props.onSubmit({ preventDefault() {} });
    await settle();
    handlers.searchExtensions = () => success([source('fresh-source')]);
    find(ctx.root, 'inherit-search').props['onUpdate:modelValue']('fresh');
    await Vue.nextTick();
    await form.props.onSubmit({ preventDefault() {} });
    await settle();
    staleResolve(success([source('stale-source')]));
    await pending;
    await settle();
    assert.match(text(find(ctx.root, 'inherit-results')), /fresh-source/);
    assert.doesNotMatch(text(find(ctx.root, 'inherit-results')), /stale-source|old-source/);
    assert.equal(find(ctx.root, 'confirm-inherit').props.disabled, true);
  } finally {
    ctx.app.unmount();
  }
});

test('inherit searches cumulatively, excludes target, keeps errors open and applies response', async () => {
  const ctx = await mount();
  try {
    handlers.searchExtensions = ({ limit }) =>
      success([
        source('scene-target'),
        ...Array.from({ length: limit - 1 }, (_, i) => source(`source-${i}`)),
      ]);
    await click(find(ctx.root, 'inherit'));
    assert.equal(call('searchExtensions')[0].args[0].limit, 20);
    assert.doesNotMatch(text(find(ctx.root, 'inherit-results')), /scene-target/);
    assert.match(text(ctx.root), /Source description.*Product A.*1.2.3.*testagent/);
    await click(find(ctx.root, 'load-more'));
    assert.equal(call('searchExtensions').at(-1).args[0].limit, 40);
    await click(find(ctx.root, 'source-source-0'));
    handlers.inheritExtensionBypass = () => {
      throw new Error('inherit denied');
    };
    await click(find(ctx.root, 'confirm-inherit'));
    assert.match(text(ctx.root), /inherit denied/);
    handlers.inheritExtensionBypass = () => success(result());
    await click(find(ctx.root, 'confirm-inherit'));
    assert.deepEqual(call('inheritExtensionBypass').at(-1).args, [
      { userId: 'parent-user' },
      { sourceExtensionName: 'source-0', targetExtensionName: 'scene-target' },
    ]);
    assert.equal(
      nodes(ctx.root).some((n) => n.props.role === 'dialog'),
      false,
    );
    assert.match(text(find(ctx.root, 'ignored-entries')), /target protected/);
  } finally {
    ctx.app.unmount();
  }
});

test('inherit dialog merges an inserted cumulative prefix exactly once and removes backend duplicates', async () => {
  const ctx = await mount();
  try {
    handlers.searchExtensions = ({ limit }) =>
      success(
        limit === 20
          ? Array.from({ length: 20 }, (_, i) => source(`A${i + 1}`))
          : [source('X'), ...Array.from({ length: 39 }, (_, i) => source(`A${i + 1}`))],
      );
    await click(find(ctx.root, 'inherit'));
    await click(find(ctx.root, 'load-more'));
    assert.equal(nodes(ctx.root).filter((n) => n.props['data-testid'] === 'source-X').length, 1);
    assert.equal(nodes(ctx.root).filter((n) => n.props.role === 'option').length, 40);
    handlers.searchExtensions = () => success([source('X'), source('X'), source('A1')]);
    find(ctx.root, 'inherit-search').props['onUpdate:modelValue']('duplicates');
    await Vue.nextTick();
    await nodes(ctx.root)
      .find((n) => n.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    await settle();
    assert.equal(nodes(ctx.root).filter((n) => n.props.role === 'option').length, 2);
    assert.equal(nodes(ctx.root).filter((n) => n.props['data-testid'] === 'source-X').length, 1);
  } finally {
    ctx.app.unmount();
  }
});

test('scene changes invalidate old mutations and tree responses; missing identity makes no requests', async () => {
  const ctx = await mount();
  try {
    let resolveMutation;
    let resolveTree;
    handlers.updateExtensionLayout = () =>
      new Promise((r) => {
        resolveMutation = r;
      });
    const pending = find(ctx.root, 'layout').props.onChange({ target: { value: 'testagent' } });
    handlers.queryExtensionStructureTree = () =>
      new Promise((r) => {
        resolveTree = r;
      });
    ctx.props.scene = scene('new-scene');
    await settle();
    const staleTree = resolveTree;
    ctx.props.scene = scene('third-scene');
    await settle();
    resolveTree(success(tree('standard', '-new')));
    await settle();
    staleTree(success(tree('testagent', '-stale')));
    resolveMutation(success({ layoutMode: 'testagent' }));
    await pending;
    await settle();
    assert.equal(ctx.updates.length, 0);
    assert.match(text(ctx.root), /system-new/);
    assert.doesNotMatch(text(ctx.root), /stale/);
    const before = calls.length;
    ctx.props.scene = scene('');
    await settle();
    assert.equal(calls.length, before);
    assert.equal(find(ctx.root, 'layout').props.disabled, true);
    assert.match(text(ctx.root), /场景编码/);
  } finally {
    ctx.app.unmount();
  }
});

test('release assembly keeps inheritance and upload interactive during initial tree loading', async () => {
  const { extensionAssemblyHttp } = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionAssemblyHttp.ts',
  );
  const originalTree = extensionAssemblyHttp.tree;
  const originalUpload = extensionAssemblyHttp.upload;
  let resolveInitialTree;
  let treeCalls = 0;
  let uploadCalls = 0;
  extensionAssemblyHttp.tree = () => {
    treeCalls += 1;
    if (treeCalls === 1)
      return new Promise((resolve) => {
        resolveInitialTree = resolve;
      });
    return Promise.resolve(tree('standard'));
  };
  extensionAssemblyHttp.upload = async () => {
    uploadCalls += 1;
    return result('standard');
  };

  const Component = await loadSfc(
    path.resolve('src/components/skill/ExtensionReleaseAssemblyPanel.vue'),
  );
  const state = Vue.reactive({
    target: 'codeagent',
    inheritanceSourceId: '',
    inheritBypass: true,
    uploadedPackage: null,
  });
  const root = makeNode('root');
  const app = renderer.createApp({
    setup: () => () =>
      Vue.h(Component, {
        enabled: true,
        disabled: true,
        modelValue: state,
        httpContext: {
          userId: 'parent-user',
          extensionName: 'scene-target',
          components: [],
          layoutMode: 'standard',
          hasBypass: false,
          bypassEntries: [],
          hasPublishedPackage: false,
        },
        'onUpdate:modelValue': (value) => Object.assign(state, value),
      }),
  });

  try {
    app.mount(root);
    await settle();
    assert.equal(treeCalls, 1, 'the initial authoritative tree request is still pending');
    const headers = nodes(root).filter(
      (node) => node.type === 'button' && node.props.class === 'assembly-card__header',
    );
    assert.equal(headers.length, 2);
    await click(headers[0]);
    await click(headers[1]);

    const inheritanceActions = nodes(root).find(
      (node) => node.props.class === 'inheritance-actions',
    );
    const inheritButton = nodes(inheritanceActions).find((node) => node.type === 'button');
    const uploadButton = nodes(root).find(
      (node) => node.type === 'button' && node.props.class === 'archive-dropzone',
    );
    const uploadInput = nodes(root).find(
      (node) => node.type === 'input' && node.props.type === 'file',
    );
    assert.equal(inheritButton.props.disabled, false);
    assert.equal(uploadButton.props.disabled, false);
    assert.equal(uploadInput.props.disabled, false);

    await click(inheritButton);
    const dialog = nodes(root).find((node) => node.props.role === 'dialog');
    assert.ok(dialog, 'the inheritance dialog opens while the tree is loading');
    const dialogClose = nodes(dialog).find(
      (node) => node.type === 'button' && node.parent?.type === 'header',
    );
    await click(dialogClose);

    uploadInput.props.onChange({
      target: { files: [new File(['zip'], 'custom.zip')], value: '' },
    });
    await settle();
    assert.equal(uploadCalls, 1, 'upload is not silently rejected by tree loading');
  } finally {
    resolveInitialTree?.(tree('standard'));
    app.unmount();
    extensionAssemblyHttp.tree = originalTree;
    extensionAssemblyHttp.upload = originalUpload;
  }
});

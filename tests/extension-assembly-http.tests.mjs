import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { extensionAssemblyHttp, buildHttpExtensionTree } = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionAssemblyHttp.ts',
  );
  const calls = [];
  let response = { code: 0, data: [] };
  request.harnessApi = async (config) => {
    calls.push(config);
    return response;
  };
  await extensionAssemblyHttp.searchScenes({ userId: 'u1', keyword: '测试%_', limit: 20 });
  assert.deepEqual(calls.pop(), {
    url: '/scenes/search',
    method: 'GET',
    params: { userId: 'u1', keyword: '测试%_', limit: 20 },
  });
  const copy = {
    sourceDimType: '部门级',
    sourceDimCode: 'D1',
    targetDimType: '产品级',
    targetDimCode: 'P1',
    firstScene: '开发',
    secondScene: '测试',
  };
  response = { code: 0, data: 'new-extension' };
  assert.equal(await extensionAssemblyHttp.copyScene('u1', copy), 'new-extension');
  assert.deepEqual(calls.pop(), {
    url: '/scene/copy',
    method: 'POST',
    params: { userId: 'u1' },
    data: copy,
  });
  const identity = { userId: 'u1', extensionName: 'test-extension' };
  const bypass = {
    layoutMode: 'testagent',
    acceptedEntries: [{ path: '.testagent/agents/custom.md', size: 12 }],
    ignoredEntries: [{ path: 'codeagent-extension.json', size: 4, reason: '系统文件，已忽略' }],
  };
  response = { code: 0, data: bypass };
  const file = new File(['zip'], 'custom.zip', { type: 'application/zip' });
  assert.deepEqual(
    await extensionAssemblyHttp.upload({ ...identity, layout: 'testagent', file }),
    bypass,
  );
  const upload = calls.pop();
  assert.equal(upload.url, '/extensions/bypass');
  assert.equal(upload.method, 'POST');
  assert.equal(upload.data.get('file').name, 'custom.zip');
  assert.equal(upload.data.get('extensionName'), 'test-extension');
  assert.equal(upload.data.get('userId'), 'u1');
  assert.equal(upload.data.get('layout'), 'testagent');
  assert.equal(upload.headers, undefined, 'browser must supply multipart boundary');
  await assert.rejects(
    extensionAssemblyHttp.upload({
      ...identity,
      layout: 'standard',
      file: { name: 'large.zip', size: 50 * 1024 * 1024 + 1 },
    }),
    /50/,
  );
  await assert.rejects(
    extensionAssemblyHttp.upload({
      ...identity,
      layout: 'standard',
      file: new File(['x'], 'bad.txt'),
    }),
    /zip/,
  );
  assert.equal(calls.length, 0, 'invalid upload must not request');
  await extensionAssemblyHttp.inherit('u1', {
    sourceExtensionName: 'source',
    targetExtensionName: 'test-extension',
  });
  assert.deepEqual(calls.pop(), {
    url: '/extensions/bypass/inherit',
    method: 'POST',
    params: { userId: 'u1' },
    data: { sourceExtensionName: 'source', targetExtensionName: 'test-extension' },
  });
  response = { code: 0, data: { layoutMode: 'standard' } };
  await extensionAssemblyHttp.setLayout({ ...identity, layout: 'standard' });
  assert.deepEqual(calls.pop(), {
    url: '/extensions/layout',
    method: 'POST',
    params: { ...identity, layout: 'standard' },
  });
  response = { code: 0, data: null };
  await extensionAssemblyHttp.clear(identity);
  assert.deepEqual(calls.pop(), {
    url: '/extensions/bypass/clear',
    method: 'POST',
    params: identity,
  });
  response = {
    code: 0,
    data: { downloadUrl: 'https://example.test/file.zip', expireSeconds: 3600 },
  };
  assert.equal((await extensionAssemblyHttp.download(identity)).expireSeconds, 3600);
  assert.deepEqual(calls.pop(), {
    url: '/extensions/bypass/download',
    method: 'GET',
    params: identity,
  });
  const search = { userId: 'u1', keyword: 'unit', limit: 20 };
  response = {
    code: 0,
    data: [
      {
        extensionName: 'source',
        hasBypass: false,
        entryCount: 0,
        layoutMode: 'testagent',
        description: '',
        sourceDimName: '研发部',
        latestVersion: '',
      },
    ],
  };
  assert.equal((await extensionAssemblyHttp.searchExtensions(search))[0].hasBypass, false);
  assert.deepEqual(calls.pop(), { url: '/extensions/search', method: 'GET', params: search });
  const entries = [
    { path: 'test-extension/codeagent-extension.json', type: 'file', size: null, source: 'SYSTEM' },
    { path: 'test-extension/.cac-plugin/plugin.json', type: 'file', size: null, source: 'SYSTEM' },
    {
      path: 'test-extension/.testagent/agents/review.md',
      type: 'file',
      size: null,
      source: 'COMPONENT',
    },
    { path: 'test-extension/.testagent/agents/custom.md', type: 'file', size: 12, source: 'FILE' },
    { path: 'test-extension/empty/', type: 'dir', size: null, source: 'FILE' },
  ];
  response = { code: 0, data: { layoutMode: 'testagent', entries } };
  const components = [{ componentType: 'agent', componentName: 'review', componentVersion: '1.0' }];
  await extensionAssemblyHttp.tree({ ...identity, layout: 'testagent', components });
  assert.deepEqual(calls.pop(), {
    url: '/extensions/structure/tree',
    method: 'GET',
    params: {
      ...identity,
      layout: 'testagent',
      components: '[{"componentType":"agent","componentName":"review","componentVersion":"1.0"}]',
    },
  });
  const tree = buildHttpExtensionTree('test-extension', entries, true);
  const find = (node, path) =>
    path
      .split('/')
      .reduce((n, part) => n?.children?.find((c) => c.name.replace(/\/$/, '') === part), node);
  assert.equal(tree.name, 'test-extension/');
  assert.equal(find(tree, '.testagent/agents/custom.md').source, 'bypass');
  assert.equal(find(tree, '.testagent/agents/review.md').source, 'component');
  assert.ok(find(tree, '.cac-plugin/plugin.json'));
  assert.equal(find(tree, 'empty').type, 'folder');
  const withoutBypass = buildHttpExtensionTree('test-extension', entries, false);
  assert.equal(find(withoutBypass, '.testagent/agents/custom.md'), undefined);
  assert.equal(find(withoutBypass, 'empty'), undefined);
  assert.ok(find(withoutBypass, '.testagent/agents/review.md'));
  response = { code: 1, message: '保护区结构变化，整包拒绝', data: null };
  await assert.rejects(
    extensionAssemblyHttp.upload({ ...identity, layout: 'standard', file }),
    /保护区结构变化/,
  );
  response = { code: 0, data: null };
  await assert.rejects(
    extensionAssemblyHttp.tree({ ...identity, layout: 'standard', components }),
    /目录/,
  );
  console.log(
    'PASS nine HTTP assembly contracts, upload guards, business failures and authoritative tree',
  );
} finally {
  await server.close();
}

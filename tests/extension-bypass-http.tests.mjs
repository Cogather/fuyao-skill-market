import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { File } from 'node:buffer';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
const { skillBaseService } = await server.ssrLoadModule(
  '/src/services/skillMarket/skillBaseService.ts',
);
const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const identity = { userId: ' user-parent ', extensionName: ' scene-code-001 ' };
const mutation = {
  layoutMode: 'testagent',
  acceptedEntries: [{ path: 'docs/readme.md', size: 18 }],
  ignoredEntries: [{ path: 'skills/blocked.md', size: 5, reason: 'reserved path' }],
};
let response = success(mutation);
let calls = [];
request.harnessApi = async (config) => {
  calls.push(config);
  return response;
};
const adapter = () => server.ssrLoadModule('/src/services/skillMarket/extensionBypassService.ts');
const reset = (data = mutation) => {
  calls = [];
  response = success(data);
};

// Missing/wrong HTTP methods and multipart/query placement must fail at the real transport boundary.
for (const [name, args, expected] of [
  [
    'clearExtensionBypass',
    [{ userId: 'u', extensionName: 'scene' }],
    {
      url: '/extensions/bypass/clear',
      method: 'POST',
      params: { userId: 'u', extensionName: 'scene' },
    },
  ],
  [
    'updateExtensionLayout',
    [{ userId: 'u', extensionName: 'scene', layout: 'standard' }],
    {
      url: '/extensions/layout',
      method: 'POST',
      params: { userId: 'u', extensionName: 'scene', layout: 'standard' },
    },
  ],
  [
    'queryExtensionStructureTree',
    [{ userId: 'u', extensionName: 'scene', layout: 'standard', components: [] }],
    {
      url: '/extensions/structure/tree',
      method: 'POST',
      params: { userId: 'u' },
      headers: { 'Content-Type': 'application/json' },
      data: { extensionName: 'scene', layout: 'standard', components: [] },
    },
  ],
  [
    'getExtensionBypassDownload',
    [{ userId: 'u', extensionName: 'scene' }],
    {
      url: '/extensions/bypass/download',
      method: 'GET',
      params: { userId: 'u', extensionName: 'scene' },
    },
  ],
  [
    'inheritExtensionBypass',
    [{ userId: 'u' }, { sourceExtensionName: 'source', targetExtensionName: 'target' }],
    {
      url: '/extensions/bypass/inherit',
      method: 'POST',
      params: { userId: 'u' },
      data: { sourceExtensionName: 'source', targetExtensionName: 'target' },
    },
  ],
  [
    'searchExtensions',
    [{ userId: 'u', keyword: '%_', pageNum: 2, pageSize: 20 }],
    {
      url: '/extensions/search',
      method: 'GET',
      params: { userId: 'u', keyword: '%_', pageNum: 2, pageSize: 20 },
    },
  ],
]) {
  test(`HTTP ${name} sends its exact contract`, async () => {
    reset();
    assert.equal(typeof skillBaseService[name], 'function', `missing ${name}`);
    await skillBaseService[name](...args);
    assert.deepEqual(calls, [expected]);
  });
}

test('upload sends a single real zip in multipart with parent user and scene code', async () => {
  reset();
  const api = await adapter();
  const result = await api.uploadExtensionBypass({
    ...identity,
    layout: 'testagent',
    file: new File(['zip'], 'bypass.ZIP'),
  });
  assert.deepEqual(result, mutation);
  assert.equal(calls.length, 1);
  const { data, ...config } = calls[0];
  assert.deepEqual(config, { url: '/extensions/bypass', method: 'POST' });
  assert.ok(data instanceof FormData);
  assert.deepEqual([...data.keys()], ['userId', 'extensionName', 'layout', 'file']);
  assert.equal(data.get('userId'), 'user-parent');
  assert.equal(data.get('extensionName'), 'scene-code-001');
  assert.equal(data.get('layout'), 'testagent');
  assert.equal(data.getAll('file').length, 1);
  assert.equal(data.get('file').name, 'bypass.ZIP');
  assert.equal(await data.get('file').text(), 'zip');
});

test('code and top-level success envelopes are accepted, including null clear data', async () => {
  const api = await adapter();
  calls = [];
  response = { code: 0, message: '成功', data: null };
  await api.clearExtensionBypass(identity);
  assert.equal(calls.length, 1);

  calls = [];
  response = { code: 200, message: '成功', data: { layoutMode: 'testagent' } };
  assert.deepEqual(await api.updateExtensionLayout({ ...identity, layout: 'testagent' }), {
    layoutMode: 'testagent',
  });
  assert.equal(calls.length, 1);

  calls = [];
  response = { success: true, data: mutation };
  assert.deepEqual(
    await api.inheritExtensionBypass({
      userId: 'u',
      sourceExtensionName: 'source',
      targetExtensionName: 'target',
    }),
    mutation,
  );
  assert.equal(calls.length, 1);
});

test('upload rejects wrong extension, multiple files, fake files, and over 50 MiB before sending', async () => {
  const api = await adapter();
  const large = new File(['zip'], 'large.zip');
  Object.defineProperty(large, 'size', { value: 50 * 1024 * 1024 + 1 });
  for (const file of [
    new File(['x'], 'bypass.zip.exe'),
    [new File(['x'], 'one.zip')],
    { name: 'fake.zip', size: 1 },
    large,
  ]) {
    reset();
    await assert.rejects(api.uploadExtensionBypass({ ...identity, layout: 'standard', file }));
    assert.deepEqual(calls, []);
  }
  const boundary = new File(['zip'], 'boundary.zip');
  Object.defineProperty(boundary, 'size', { value: 50 * 1024 * 1024 });
  reset();
  await api.uploadExtensionBypass({ ...identity, layout: 'standard', file: boundary });
  assert.equal(calls.length, 1);
});

test('clear accepts null data and layout maps only the returned display mode', async () => {
  const api = await adapter();
  reset(null);
  await api.clearExtensionBypass(identity);
  assert.deepEqual(calls, [
    {
      url: '/extensions/bypass/clear',
      method: 'POST',
      params: { userId: 'user-parent', extensionName: 'scene-code-001' },
    },
  ]);
  reset({ layoutMode: 'testagent' });
  assert.deepEqual(await api.updateExtensionLayout({ ...identity, layout: 'standard' }), {
    layoutMode: 'testagent',
  });
  assert.deepEqual(calls, [
    {
      url: '/extensions/layout',
      method: 'POST',
      params: { userId: 'user-parent', extensionName: 'scene-code-001', layout: 'standard' },
    },
  ]);
  reset({ layoutMode: 'future-layout' });
  assert.deepEqual(await api.updateExtensionLayout({ ...identity, layout: 'standard' }), {
    layoutMode: 'standard',
  });
});

test('structure posts component objects in JSON and preserves typed sources and directory sizes', async () => {
  const api = await adapter();
  reset({
    layoutMode: 'testagent',
    entries: [
      { path: 'skills', type: 'dir', source: 'SYSTEM' },
      { path: 'skills/one.md', type: 'file', size: 12, source: 'COMPONENT' },
      { path: 'docs/readme.md', type: 'file', size: 0, source: 'FILE' },
    ],
  });
  const result = await api.queryExtensionStructureTree({
    ...identity,
    layout: 'testagent',
    components: [
      { componentType: 'skill', componentName: 'one', componentVersion: '1.2.0', extra: 'omit' },
      { componentType: 'command', componentName: '/run' },
    ],
  });
  assert.deepEqual(calls, [
    {
      url: '/extensions/structure/tree',
      method: 'POST',
      params: { userId: 'user-parent' },
      headers: { 'Content-Type': 'application/json' },
      data: {
        extensionName: 'scene-code-001',
        layout: 'testagent',
        components: [
          { componentType: 'skill', componentName: 'one', componentVersion: '1.2.0' },
          { componentType: 'command', componentName: '/run' },
        ],
      },
    },
  ]);
  assert.deepEqual(result, {
    layoutMode: 'testagent',
    entries: [
      { path: 'skills', type: 'dir', size: null, source: 'SYSTEM' },
      { path: 'skills/one.md', type: 'file', size: 12, source: 'COMPONENT' },
      { path: 'docs/readme.md', type: 'file', size: 0, source: 'FILE' },
    ],
  });
});

test('upload and inheritance preserve accepted and ignored response path whitespace', async () => {
  const api = await adapter();
  for (const input of ['upload', 'inherit']) {
    reset({
      layoutMode: 'standard',
      acceptedEntries: [{ path: ' docs/report ', size: 18 }],
      ignoredEntries: [{ path: ' scripts/ignored ', size: 5, reason: 'reserved path' }],
    });
    const result =
      input === 'upload'
        ? await api.uploadExtensionBypass({
            ...identity,
            layout: 'standard',
            file: new File(['zip'], 'bypass.zip'),
          })
        : await api.inheritExtensionBypass({
            userId: 'u',
            sourceExtensionName: 'source',
            targetExtensionName: 'target',
          });
    assert.deepEqual(result, {
      layoutMode: 'standard',
      acceptedEntries: [{ path: ' docs/report ', size: 18 }],
      ignoredEntries: [{ path: ' scripts/ignored ', size: 5, reason: 'reserved path' }],
    });
  }
});

test('structure preserves response file and directory path whitespace', async () => {
  const api = await adapter();
  reset({
    layoutMode: 'standard',
    entries: [
      { path: ' docs ', type: 'dir', source: 'SYSTEM' },
      { path: ' docs/report ', type: 'file', source: 'FILE', size: 18 },
    ],
  });
  assert.deepEqual(
    await api.queryExtensionStructureTree({ ...identity, layout: 'standard', components: [] }),
    {
      layoutMode: 'standard',
      entries: [
        { path: ' docs ', type: 'dir', source: 'SYSTEM', size: null },
        { path: ' docs/report ', type: 'file', source: 'FILE', size: 18 },
      ],
    },
  );
  for (const path of ['', ' \t ', null, 7]) {
    reset({ layoutMode: 'standard', acceptedEntries: [{ path, size: 18 }], ignoredEntries: [] });
    await assert.rejects(
      api.inheritExtensionBypass({
        userId: 'u',
        sourceExtensionName: 'source',
        targetExtensionName: 'target',
      }),
    );
    reset({ layoutMode: 'standard', entries: [{ path, type: 'file', source: 'FILE', size: 18 }] });
    await assert.rejects(
      api.queryExtensionStructureTree({ ...identity, layout: 'standard', components: [] }),
    );
  }
});

test('download accepts absolute HTTP(S) URLs and rejects unsafe URLs or invalid expiry', async () => {
  const api = await adapter();
  for (const downloadUrl of [
    'https://download.example/zip?signature=one',
    'http://download.example/zip',
  ]) {
    reset({ downloadUrl, expireSeconds: 300 });
    assert.deepEqual(await api.getExtensionBypassDownload(identity), {
      downloadUrl,
      expireSeconds: 300,
    });
    assert.deepEqual(calls, [
      {
        url: '/extensions/bypass/download',
        method: 'GET',
        params: { userId: 'user-parent', extensionName: 'scene-code-001' },
      },
    ]);
  }
  for (const downloadUrl of [
    '',
    '/relative.zip',
    '//example.com/zip',
    'javascript:alert(1)',
    'data:text/plain,zip',
    'file:///local.zip',
    'https://',
  ]) {
    reset({ downloadUrl, expireSeconds: 300 });
    await assert.rejects(api.getExtensionBypassDownload(identity));
  }
  reset({ downloadUrl: 'https://download.example/zip', expireSeconds: -1 });
  await assert.rejects(api.getExtensionBypassDownload(identity));
});

test('inherit puts user in query and source/target scene identities in JSON', async () => {
  const api = await adapter();
  reset();
  assert.deepEqual(
    await api.inheritExtensionBypass({
      userId: ' user-parent ',
      sourceExtensionName: ' source-scene ',
      targetExtensionName: ' target-scene ',
    }),
    mutation,
  );
  assert.deepEqual(calls, [
    {
      url: '/extensions/bypass/inherit',
      method: 'POST',
      params: { userId: 'user-parent' },
      data: { sourceExtensionName: 'source-scene', targetExtensionName: 'target-scene' },
    },
  ]);
});

test('search uses pageNum/pageSize, literal trimmed keywords and backend totals without a 100-row cap', async () => {
  const api = await adapter();
  const rows = Array.from({ length: 100 }, (_, i) => ({
    extensionName: `scene-${i + 1}`,
    description: 'description',
    layoutMode: 'testagent',
    hasBypass: true,
    entryCount: 2,
    latestVersion: '1.0',
    sourceDimName: 'Product',
  }));
  reset({ list: rows.slice(20, 40), total: 140 });
  const page = await api.queryExtensionInheritancePage({
    userId: ' user-parent ',
    keyword: ' %_ ',
    pageNo: 2,
    pageSize: 20,
  });
  assert.deepEqual(calls, [
    {
      url: '/extensions/search',
      method: 'GET',
      params: { userId: 'user-parent', keyword: '%_', pageNum: 2, pageSize: 20 },
    },
  ]);
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 140);
  assert.equal(page.list.length, 20);
  assert.deepEqual(page.list[0], {
    extensionName: 'scene-21',
    description: 'description',
    layoutMode: 'testagent',
    hasBypass: true,
    entryCount: 2,
    latestVersion: '1.0',
    sourceDimName: 'Product',
  });
  reset({ list: rows.slice(20, 23), total: 23 });
  const short = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 2, pageSize: 20 });
  assert.equal(short.hasMore, false);
  assert.deepEqual(
    short.list.map((row) => row.extensionName),
    rows.slice(20, 23).map((row) => row.extensionName),
  );
  reset({ list: rows.slice(0, 20), total: 140 });
  const beyond = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 6, pageSize: 20 });
  assert.equal(calls[0].params.pageNum, 6);
  assert.equal('limit' in calls[0].params, false);
  assert.equal(beyond.hasMore, true);
  assert.equal(beyond.list.length, 20);
  reset({ list: [{ ...rows[0], layoutMode: 'future-layout' }], total: 1 });
  assert.equal(
    (await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 })).list[0]
      .layoutMode,
    'standard',
  );
});

test('Extension pages deduplicate identities while preserving the backend total', async () => {
  const api = await adapter();
  const row = (extensionName) => ({
    extensionName,
    description: '',
    layoutMode: 'standard',
    hasBypass: true,
    entryCount: 1,
    latestVersion: '1.0',
    sourceDimName: 'Product',
  });
  reset({ list: Array.from({ length: 20 }, (_, i) => row(`A${i + 1}`)), total: 40 });
  const first = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 });
  reset({
    list: [row('X'), ...Array.from({ length: 19 }, (_, i) => row(`A${i + 20}`))],
    total: 40,
  });
  const second = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 2, pageSize: 20 });
  const { mergeUniquePage } = await server.ssrLoadModule('/src/utils/infiniteScroll.ts');
  const merged = mergeUniquePage(first.list, second.list, (item) => item.extensionName);
  assert.equal(merged.filter((item) => item.extensionName === 'X').length, 1);
  assert.equal(merged.length, 39);
  assert.equal(second.hasMore, false);
  reset({ list: [row('X'), row('X'), row('A1')], total: 3 });
  const duplicates = await api.queryExtensionInheritancePage({
    userId: 'u',
    pageNo: 1,
    pageSize: 20,
  });
  assert.equal(duplicates.list.length, 2);
  assert.equal(duplicates.total, 3);
  assert.equal(duplicates.hasMore, false);
});

test('Extension search accepts array data with an envelope total', async () => {
  const api = await adapter();
  const row = {
    extensionName: 'source-scene',
    description: '',
    layoutMode: 'standard',
    hasBypass: false,
    entryCount: 0,
    latestVersion: '',
    sourceDimName: 'Product',
  };
  reset();
  response = { meta: { success: true, number: 41 }, data: [row] };
  const page = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 2, pageSize: 20 });
  assert.deepEqual(page.list, [row]);
  assert.equal(page.total, 41);
  assert.equal(page.hasMore, true);
  response = { meta: { success: true, number: 0 }, data: [] };
  const empty = await api.queryExtensionInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 });
  assert.equal(empty.hasMore, false);
  assert.deepEqual(empty.list, []);
});

test('every adapter rejects missing parent user or scene identity without transport fallback', async () => {
  const api = await adapter();
  for (const badIdentity of [
    { userId: '', extensionName: 'scene' },
    { userId: 'u', extensionName: '  ' },
    { userId: 123, extensionName: 'scene' },
  ]) {
    for (const [method, input] of [
      [
        'uploadExtensionBypass',
        { ...badIdentity, layout: 'standard', file: new File(['x'], 'one.zip') },
      ],
      ['clearExtensionBypass', badIdentity],
      ['updateExtensionLayout', { ...badIdentity, layout: 'standard' }],
      ['queryExtensionStructureTree', { ...badIdentity, layout: 'standard', components: [] }],
      ['getExtensionBypassDownload', badIdentity],
    ]) {
      reset();
      await assert.rejects(api[method](input));
      assert.deepEqual(calls, []);
    }
  }
  for (const input of [
    { userId: '', sourceExtensionName: 's', targetExtensionName: 't' },
    { userId: 'u', sourceExtensionName: '', targetExtensionName: 't' },
    { userId: 'u', sourceExtensionName: 's', targetExtensionName: '' },
  ]) {
    reset();
    await assert.rejects(api.inheritExtensionBypass(input));
    assert.deepEqual(calls, []);
  }
  reset();
  await assert.rejects(api.queryExtensionInheritancePage({ userId: '', pageNo: 1, pageSize: 20 }));
  assert.deepEqual(calls, []);
});

test('unknown request layouts, invalid components and invalid pagination never send', async () => {
  const api = await adapter();
  for (const input of [
    { ...identity, layout: 'legacy', components: [] },
    {
      ...identity,
      layout: 'standard',
      components: [{ componentType: 'skill', componentName: '' }],
    },
    {
      ...identity,
      layout: 'standard',
      components: [{ componentType: 'OTHER', componentName: 'name' }],
    },
  ]) {
    reset();
    await assert.rejects(api.queryExtensionStructureTree(input));
    assert.deepEqual(calls, []);
  }
  reset();
  await assert.rejects(api.updateExtensionLayout({ ...identity, layout: 'legacy' }));
  await assert.rejects(
    api.uploadExtensionBypass({ ...identity, layout: 'legacy', file: new File(['x'], 'one.zip') }),
  );
  for (const [pageNo, pageSize] of [
    [NaN, 20],
    [1, Infinity],
    [0, 20],
    [1, 0],
    [1.5, 20],
  ]) {
    await assert.rejects(api.queryExtensionInheritancePage({ userId: 'u', pageNo, pageSize }));
  }
  assert.deepEqual(calls, []);
});

test('malformed mutation, tree and search rows are rejected instead of invented', async () => {
  const api = await adapter();
  for (const data of [
    null,
    {},
    { ...mutation, acceptedEntries: null },
    { ...mutation, acceptedEntries: [{ path: '', size: 1 }] },
    { ...mutation, ignoredEntries: [{ path: 'file', size: -1 }] },
    { ...mutation, acceptedEntries: [{ path: 'file', size: 1.5 }] },
  ]) {
    reset(data);
    await assert.rejects(
      api.inheritExtensionBypass({
        userId: 'u',
        sourceExtensionName: 's',
        targetExtensionName: 't',
      }),
    );
  }
  for (const entry of [
    { path: '', type: 'file', source: 'FILE', size: 1 },
    { path: 'x', type: 'link', source: 'FILE', size: 1 },
    { path: 'x', type: 'file', source: 'OTHER', size: 1 },
    { path: 'x', type: 'file', source: 'FILE' },
    { path: 'x', type: 'file', source: 'FILE', size: Infinity },
    { path: 'x', type: 'dir', source: 'FILE', size: -1 },
  ]) {
    reset({ layoutMode: 'standard', entries: [entry] });
    await assert.rejects(
      api.queryExtensionStructureTree({ ...identity, layout: 'standard', components: [] }),
    );
  }
  const row = {
    extensionName: 'scene',
    description: '',
    layoutMode: 'standard',
    hasBypass: false,
    entryCount: 0,
    latestVersion: '',
    sourceDimName: '',
  };
  for (const data of [
    null,
    {},
    { list: [row] },
    { list: [row], total: -1 },
    { list: [row], total: 1.5 },
    { list: [{ ...row, extensionName: '' }], total: 1 },
    { list: [{ ...row, hasBypass: 'false' }], total: 1 },
    { list: [{ ...row, entryCount: -1 }], total: 1 },
    { list: [{ ...row, entryCount: 1.5 }], total: 1 },
  ]) {
    reset(data);
    await assert.rejects(
      api.queryExtensionInheritancePage({ userId: 'u', pageNo: 1, pageSize: 20 }),
    );
  }
});

test('backend errors and malformed envelopes remain errors with no second request', async () => {
  const api = await adapter();
  for (const value of [
    undefined,
    {},
    { meta: { success: false, message: 'server red line' }, data: mutation },
  ]) {
    reset();
    response = value;
    await assert.rejects(api.clearExtensionBypass(identity));
    assert.equal(calls.length, 1);
  }
  reset();
  response = { meta: { success: false, message: 'server red line' }, data: mutation };
  await assert.rejects(
    api.uploadExtensionBypass({
      ...identity,
      layout: 'standard',
      file: new File(['x'], 'one.zip'),
    }),
    /server red line/,
  );
  assert.equal(calls.length, 1);

  for (const value of [
    { code: 500, message: 'code red line', data: null },
    { success: false, message: 'success red line', data: null },
  ]) {
    calls = [];
    response = value;
    await assert.rejects(api.clearExtensionBypass(identity), /red line/);
    assert.equal(calls.length, 1);
  }
});

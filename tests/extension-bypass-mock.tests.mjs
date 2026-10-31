import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import PizZip from 'pizzip';
import { createServer } from 'vite';

globalThis.File = File;
process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

function zipFile(name, entries) {
  const zip = new PizZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const bytes = zip.generate({ type: 'uint8array' });
  return new File([bytes], name);
}

async function readDownload(result) {
  assert.match(result.downloadUrl, /^blob:/);
  try {
    const response = await fetch(result.downloadUrl);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    return new PizZip(await response.arrayBuffer());
  } finally {
    URL.revokeObjectURL(result.downloadUrl);
  }
}

try {
  const mock = await server.ssrLoadModule('/src/services/skillMarket/extensionBypassMock.ts');
  const service = await server.ssrLoadModule('/src/services/skillMarket/extensionBypassService.ts');
  const publish = await server.ssrLoadModule('/src/services/skillMarket/extensionPublishMock.ts');
  const scenes = publish.getSharedMockExtensionScenes();
  assert.ok(scenes.length > 2);
  assert.ok(
    scenes.every(
      (scene) =>
        scene.sceneExtensionCode &&
        ['standard', 'testagent'].includes(scene.layoutMode) &&
        typeof scene.hasBypass === 'boolean' &&
        Array.isArray(scene.bypassEntries),
    ),
    'every Mock scene has a stable identity and complete bypass defaults',
  );
  const seeded = scenes.find((scene) => scene.layoutMode === 'testagent' && scene.hasBypass);
  assert.ok(seeded, 'at least one Mock scene demonstrates TestAgent bypass rendering');

  const userId = 'mock-user';
  const source = scenes[0];
  const target = scenes.find((scene) => scene.releases.length === 0 && scene.id !== source.id);
  assert.ok(target, 'a draft target scene is available');
  const sourceName = source.sceneExtensionCode;
  const targetName = target.sceneExtensionCode;

  const layout = await service.updateExtensionLayout({
    userId,
    extensionName: sourceName,
    layout: 'testagent',
  });
  assert.deepEqual(layout, { layoutMode: 'testagent' });
  assert.equal(source.layoutMode, 'testagent', 'layout persists in shared scene state');

  const uploaded = await mock.uploadExtensionBypassMock({
    userId,
    extensionName: sourceName,
    layout: 'testagent',
    file: zipFile('custom.zip', {
      'docs/readme.md': 'hello',
      '.testagent/agents/custom-prompt.md': 'custom',
      'codeagent-extension.json': '{"tampered":true}',
    }),
  });
  assert.deepEqual(uploaded.acceptedEntries, [
    { path: 'docs/readme.md', size: 5 },
    { path: '.testagent/agents/custom-prompt.md', size: 6 },
  ]);
  assert.equal(uploaded.ignoredEntries.length, 1);
  assert.equal(uploaded.ignoredEntries[0].path, 'codeagent-extension.json');
  assert.match(uploaded.ignoredEntries[0].reason, /已忽略/);
  assert.equal(source.hasBypass, true);
  assert.deepEqual(source.bypassEntries, uploaded.acceptedEntries);
  await assert.rejects(
    mock.uploadExtensionBypassMock({
      userId,
      extensionName: sourceName,
      layout: 'testagent',
      file: zipFile('protected.zip', { '.testagent/skills/new-skill/NEW.md': 'blocked' }),
    }),
    /保护区目录结构/,
  );
  assert.deepEqual(source.bypassEntries, uploaded.acceptedEntries, 'rejected upload is atomic');
  const uploadedPackage = await readDownload(
    await service.getExtensionBypassDownload({ userId, extensionName: sourceName }),
  );
  assert.equal(uploadedPackage.file(`${sourceName}/docs/readme.md`).asText(), 'hello');
  assert.equal(
    uploadedPackage.file(`${sourceName}/.testagent/agents/custom-prompt.md`).asText(),
    'custom',
  );
  assert.ok(uploadedPackage.file(`${sourceName}/.cac-plugin/plugin.json`));
  assert.equal(
    JSON.parse(uploadedPackage.file(`${sourceName}/codeagent-extension.json`).asText()).tampered,
    undefined,
  );
  await mock.inheritExtensionBypassMock({
    userId,
    sourceExtensionName: sourceName,
    targetExtensionName: targetName,
  });
  const inheritedPackage = await readDownload(
    await service.getExtensionBypassDownload({ userId, extensionName: targetName }),
  );
  assert.equal(inheritedPackage.file(`${targetName}/docs/readme.md`).asText(), 'hello');

  const tree = await mock.queryExtensionStructureTreeMock({
    userId,
    extensionName: sourceName,
    layout: 'testagent',
    components: [
      { componentType: 'agent', componentName: 'code-review', componentVersion: '1.0.0' },
      { componentType: 'skill', componentName: 'unit-test', componentVersion: '2.1.0' },
    ],
  });
  assert.equal(tree.layoutMode, 'testagent');
  assert.ok(
    tree.entries.some(
      (entry) =>
        entry.path === `${sourceName}/.cac-plugin/plugin.json` && entry.source === 'SYSTEM',
    ),
  );
  assert.ok(
    tree.entries.some(
      (entry) =>
        entry.path === `${sourceName}/.testagent/agents/code-review.md` &&
        entry.source === 'COMPONENT',
    ),
  );
  assert.ok(
    tree.entries.some(
      (entry) => entry.path === `${sourceName}/docs/readme.md` && entry.source === 'FILE',
    ),
  );
  assert.ok(
    tree.entries.some(
      (entry) =>
        entry.path === `${sourceName}/.testagent/agents/custom-prompt.md` &&
        entry.source === 'FILE',
    ),
  );

  await mock.clearExtensionBypassMock({ userId, extensionName: sourceName });
  assert.equal(source.layoutMode, 'testagent', 'clear retains persisted layout');
  assert.equal(source.hasBypass, false);
  assert.deepEqual(source.bypassEntries, []);

  target.layoutMode = 'standard';
  target.hasBypass = true;
  target.bypassEntries = [{ path: 'old/local.txt', size: 1 }];
  let inherited = await mock.inheritExtensionBypassMock({
    userId,
    sourceExtensionName: sourceName,
    targetExtensionName: targetName,
  });
  assert.equal(inherited.layoutMode, 'testagent');
  assert.deepEqual(inherited.acceptedEntries, []);
  assert.equal(target.hasBypass, false, 'a source without bypass still inherits its layout');

  source.hasBypass = true;
  target.capabilities.agent.push({
    id: 'target-conflict',
    name: 'conflict',
    version: '1.0.0',
    publishDate: '2026-10-29',
    ready: true,
    files: [],
  });
  source.bypassEntries = [
    { path: 'docs/copied.md', size: 21 },
    { path: '.testagent/agents/conflict.md', size: 9 },
  ];
  inherited = await mock.inheritExtensionBypassMock({
    userId,
    sourceExtensionName: sourceName,
    targetExtensionName: targetName,
  });
  assert.deepEqual(inherited.acceptedEntries, [{ path: 'docs/copied.md', size: 21 }]);
  assert.equal(inherited.ignoredEntries.length, 1);
  assert.match(inherited.ignoredEntries[0].reason, /已剥离/);
  source.bypassEntries[0].path = 'changed-after-copy.md';
  assert.equal(target.bypassEntries[0].path, 'docs/copied.md', 'inheritance stores a deep copy');

  const bypassDownload = await mock.getExtensionBypassDownloadMock({
    userId,
    extensionName: targetName,
  });
  const draftPackage = await readDownload(bypassDownload);
  assert.ok(draftPackage.file(`${targetName}/docs/copied.md`));
  assert.ok(draftPackage.file(`${targetName}/codeagent-extension.json`));
  assert.equal(bypassDownload.expireSeconds, 3600);
  const packageDownload = await mock.getExtensionBypassDownloadMock({
    userId,
    extensionName: sourceName,
  });
  const publishedPackage = await readDownload(packageDownload);
  assert.ok(publishedPackage.file(`${sourceName}/codeagent-extension.json`));
  await mock.clearExtensionBypassMock({ userId, extensionName: targetName });
  const clearedPackage = await readDownload(
    await service.getExtensionBypassDownload({ userId, extensionName: targetName }),
  );
  assert.equal(clearedPackage.file(`${targetName}/docs/copied.md`), null);
  assert.ok(clearedPackage.file(`${targetName}/.cac-plugin/plugin.json`));
  const components = Object.entries(target.capabilities).flatMap(([componentType, values]) =>
    values.map((item) => ({
      componentType,
      componentName: item.name,
      componentVersion: item.version,
    })),
  );
  const clearedTree = await service.queryExtensionStructureTree({
    userId,
    extensionName: targetName,
    layout: target.layoutMode,
    components,
  });
  assert.deepEqual(
    Object.values(clearedPackage.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
      .sort(),
    clearedTree.entries
      .filter((entry) => entry.type === 'file')
      .map((entry) => entry.path)
      .sort(),
    'the complete archive still matches the directory preview after bypass removal',
  );

  const noBypassScene = scenes.find((scene) => !scene.hasBypass && scene.name);
  const search = await mock.queryExtensionInheritancePageMock({
    userId,
    keyword: noBypassScene.name,
    pageNo: 1,
    pageSize: 2,
  });
  assert.ok(
    search.list.some((item) => item.extensionName === noBypassScene.sceneExtensionCode),
    'search includes sources without bypass and matches scene names',
  );
  assert.ok(search.list.every((item) => ['standard', 'testagent'].includes(item.layoutMode)));
  const literalWildcard = await mock.queryExtensionInheritancePageMock({
    userId,
    keyword: '%_',
    pageNo: 1,
    pageSize: 20,
  });
  assert.deepEqual(literalWildcard.list, [], 'wildcards are matched literally');

  console.log('PASS Extension bypass Mock persistence, tree, download, inheritance and search');
} finally {
  await server.close();
}

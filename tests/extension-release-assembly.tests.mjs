import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

const capabilities = {
  skill: [
    {
      id: 'skill-log',
      name: '日志采集 Skill',
      version: '1.0.0',
      publishDate: '2026-10-23',
      ready: true,
      files: [
        { name: 'SKILL.md', content: '# log' },
        { name: 'scripts/run.sh', content: '#!/bin/sh' },
      ],
    },
  ],
  command: [
    {
      id: 'command-build',
      name: '构建 Command',
      version: '2.0.0',
      publishDate: '2026-10-23',
      ready: true,
      files: [{ name: 'build.md', content: '# build' }],
    },
  ],
  agent: [
    {
      id: 'agent-review',
      name: '评审 Agent',
      version: '3.0.0',
      publishDate: '2026-10-23',
      ready: true,
      files: [{ name: 'review.md', content: '# review' }],
    },
  ],
};

function findNode(nodes, path) {
  let current = nodes;
  let hit;
  for (const segment of path.split('/').filter(Boolean)) {
    hit = current.find((node) => node.name.replace(/\/$/, '') === segment);
    if (!hit) return undefined;
    current = hit.children ?? [];
  }
  return hit;
}

try {
  const assembly = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionReleaseAssembly.ts',
  );

  const sources = assembly.createMockInheritanceSources({
    extensionName: 'harness-pipeline-log',
    previousVersion: '0.2',
    organization: '扶摇组织',
  });
  const initial = assembly.createAssemblyState(sources);
  assert.equal(initial.target, 'codeagent');
  assert.equal(initial.inheritanceSourceId, 'previous');

  const withUpload = {
    ...initial,
    convertAfterPublish: true,
    uploadedPackage: {
      name: 'custom.zip',
      size: 128,
      files: [{ path: 'config/shared.yaml', size: 12 }],
      rejectedPaths: [],
    },
  };
  const testAgent = assembly.switchAssemblyTarget(withUpload, 'testagent', sources);
  assert.equal(testAgent.target, 'testagent');
  assert.equal(testAgent.inheritanceSourceId, 'previous');
  assert.equal(testAgent.uploadedPackage.name, 'custom.zip');
  assert.equal(testAgent.convertAfterPublish, false);
  const codeAgentAgain = assembly.switchAssemblyTarget(testAgent, 'codeagent', sources);
  assert.equal(codeAgentAgain.uploadedPackage.name, 'custom.zip');

  const filtered = assembly.filterExtensionArchivePaths([
    'skills/injected/SKILL.md',
    './Commands/unsafe.md',
    'folder/../agents/unsafe.md',
    'PLUGIN.JSON',
    'codeagent-extension.json',
    'config/shared.yaml',
    'docs/readme.md',
  ]);
  assert.deepEqual(
    filtered.accepted,
    ['config/shared.yaml', 'docs/readme.md'],
    'only sidecar files survive protected-path filtering',
  );
  assert.deepEqual(filtered.rejected, [
    'skills/injected/SKILL.md',
    './Commands/unsafe.md',
    'folder/../agents/unsafe.md',
    'PLUGIN.JSON',
    'codeagent-extension.json',
  ]);

  const inherited = sources.find((source) => source.id === 'previous');
  const codeTree = assembly.buildExtensionPackageTree({
    extensionName: 'harness-pipeline-log',
    target: 'codeagent',
    capabilities,
    inheritedFiles: inherited.files,
    uploadedFiles: [
      { path: 'config/shared.yaml', size: 12 },
      { path: 'docs/readme.md', size: 7 },
    ],
  });
  assert.deepEqual(
    codeTree.children.filter((node) => node.source === 'system').map((node) => node.name),
    ['skills/', 'commands/', 'agents/', 'plugin.json', 'codeagent-extension.json'],
    'system entries keep the package order shown in the release prototype',
  );
  assert.ok(findNode(codeTree.children, 'skills/日志采集 Skill/SKILL.md'));
  assert.ok(findNode(codeTree.children, 'commands/构建 Command/build.md'));
  assert.ok(findNode(codeTree.children, 'agents/评审 Agent/review.md'));
  assert.equal(findNode(codeTree.children, 'plugin.json').source, 'system');
  assert.equal(
    findNode(codeTree.children, 'config/shared.yaml').source,
    'uploaded',
    'upload wins over an inherited file at the same path',
  );

  const testTree = assembly.buildExtensionPackageTree({
    extensionName: 'harness-pipeline-log',
    target: 'testagent',
    capabilities,
    inheritedFiles: inherited.files,
    uploadedFiles: [],
  });
  assert.ok(findNode(testTree.children, '.testagent/skills/日志采集 Skill/SKILL.md'));
  assert.ok(findNode(testTree.children, '.testagent/config/shared.yaml'));
  assert.equal(findNode(testTree.children, 'plugin.json').source, 'system');

  const zip = new PizZip();
  zip.file('docs/readme.md', 'hello');
  zip.file('skills/blocked/SKILL.md', 'blocked');
  const zipBytes = zip.generate({ type: 'uint8array' });
  const archive = assembly.readExtensionArchive(zipBytes, 'custom.zip');
  assert.deepEqual(archive.files.map((file) => file.path), ['docs/readme.md']);
  assert.deepEqual(archive.rejectedPaths, ['skills/blocked/SKILL.md']);

  const submitted = await assembly.submitExtensionAssemblyMock({
    extensionName: 'harness-pipeline-log',
    target: testAgent.target,
    inheritanceSourceId: testAgent.inheritanceSourceId,
    uploadedFiles: testAgent.uploadedPackage.files,
    convertAfterPublish: testAgent.convertAfterPublish,
  });
  assert.equal(submitted.target, 'testagent');
  assert.equal(submitted.convertTaskCreated, false);
  assert.match(submitted.taskId, /^mock-extension-assembly-/);

  console.log('PASS Extension release assembly target, merge, ZIP, and mock submission behavior');
} finally {
  await server.close();
}


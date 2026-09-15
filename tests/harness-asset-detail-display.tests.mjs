import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'mock';

const storage = new Map();
const previousWindow = globalThis.window;
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const common = await server.ssrLoadModule('/src/utils/common.ts');

  assert.equal(typeof common.firstNonBlankText, 'function');
  assert.equal(
    common.firstNonBlankText(['', '  ', ' harness-pipeline ', 'fallback']),
    'harness-pipeline',
  );
  assert.equal(common.firstNonBlankText([null, undefined, '']), '');
  console.log('PASS detail dim skips blank values and trims the first useful label');

  assert.equal(typeof common.formatCompactDateTime, 'function');
  assert.equal(common.formatCompactDateTime('2026-09-02T12:00:00.000Z'), '2026-09-02 12:00:00');
  assert.equal(common.formatCompactDateTime(' 2026-09-02 12:00:00 '), '2026-09-02 12:00:00');
  assert.equal(common.formatCompactDateTime(null), '—');
  console.log(
    'PASS upload timestamps use the compact reference format with a missing-value fallback',
  );

  const { getHarnessAssetApi } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementService.ts',
  );
  const api = getHarnessAssetApi();
  const scope = {
    userId: 'detail-display-tester',
    userName: 'Detail Display Tester',
    department: {
      id: 'dept-continuous-delivery',
      code: 'D001',
      name: '持续交付组',
      path: ['持续交付组'],
    },
    product: {
      id: 'offering-harness-pipeline-valid',
      name: 'harness-pipeline',
      departmentPath: ['持续交付组'],
    },
    assetType: 'Skill',
  };
  const result = await api.queryAssets(scope, { pageNum: 1, pageSize: 24 });
  const asset = result.list.find((item) => item.id === '504');

  assert.ok(asset, 'mock fixture must expose a versioned Skill asset');
  assert.deepEqual(
    asset.versionDetails,
    [
      { version: '1.0.0', uploadedAt: '2026-08-18 18:00:00' },
      { version: '0.9.0', uploadedAt: '2026-08-10 10:00:00' },
    ],
    'mock detail cards must retain per-version upload timestamps',
  );
  console.log('PASS mock assets retain upload metadata for every displayed version');

  const extensionResult = await api.queryAssets(
    { ...scope, assetType: 'Extension' },
    { pageNum: 1, pageSize: 24 },
  );
  const extension = extensionResult.list.find((item) => item.id === 'scene-pipeline-mml');
  const releasedVersion = extension?.versionDetails?.find((item) => item.version === '0.2.1');

  assert.ok(extension, 'mock fixture must expose the versioned Extension');
  assert.deepEqual(
    extension.versions,
    ['0.2.1', '0.2', '0.1'],
    'Extension detail must exclude in-progress and failed releases',
  );
  assert.deepEqual(
    releasedVersion,
    {
      version: '0.2.1',
      uploadedAt: '2026-08-02 14:00',
      uploadedBy: '李扶摇 A0123',
      status: '已发布',
    },
    'Extension upload metadata must follow the matching release instead of the current date',
  );
  console.log('PASS Extension versions retain their matching release upload metadata');
} finally {
  await server.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

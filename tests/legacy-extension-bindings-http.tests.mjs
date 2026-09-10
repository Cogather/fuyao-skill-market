import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const success = (data) => ({ meta: { success: true }, data });
const scope = {
  dimType: '产品级',
  dimCode: 'product-1',
  dimName: 'udm',
  productId: 'product-1',
  departmentPath: ['研发部'],
};
const scene = {
  id: 'scene-1',
  productId: 'product-1',
  primary: '开发',
  name: '代码开发',
  publishable: false,
  extension: { name: '', description: '' },
  capabilities: { skill: [], command: [], agent: [] },
  releases: [],
  publishing: null,
};

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { queryHttpExtensionBindings } = await server.ssrLoadModule(
    '/src/services/skillMarket/legacyExtensionPublishHttp.ts',
  );
  const calls = [];
  let bindings = success([
    {
      firstScene: '开发',
      secondScenes: [
        {
          secondScene: '代码开发',
          ready: true,
          components: {
            skills: [{ name: 'udm-skill', version: '2.0.0', uploadAt: '2026-08-01 10:00:00' }],
            commands: [{ name: 'udm-command', version: '1.0.0' }],
            agents: [],
          },
        },
      ],
    },
  ]);
  const release = (id, secondScene, version, publishStatus, publishedAt) => ({
    id,
    firstScene: '开发',
    secondScene,
    version,
    publishStatus,
    publishedAt,
    extensionName: 'udm-extension',
    description: '旧发布历史说明',
  });
  const history = success([
    release('other', '其他场景', '99.0', '发布成功', '2026-09-10'),
    release('running', '代码开发', '0.3', '发布中', '2026-09-09'),
    release('failed', '代码开发', '0.2', '发布失败', '2026-09-08'),
    release('success', '代码开发', '0.1', '发布成功', '2026-09-07'),
  ]);
  request.harnessApi = async (config) => {
    calls.push(config);
    if (config.url === '/scenes/bindings') return bindings;
    if (config.url === '/extensions/history') return history;
    assert.fail(`旧资产页不应调用 ${config.url}`);
  };
  for (const source of [
    scene,
    { ...scene, extension: { name: 'udm-extension', description: '' } },
  ]) {
    calls.length = 0;
    const result = await queryHttpExtensionBindings(' user-1 ', scope, source);
    assert.deepEqual(calls.map((call) => call.url).sort(), [
      '/extensions/history',
      '/scenes/bindings',
    ]);
    assert.deepEqual(
      calls.find((call) => call.url === '/scenes/bindings'),
      {
        url: '/scenes/bindings',
        method: 'post',
        params: { userId: 'user-1' },
        data: { dimType: '产品级', dimCode: 'product-1', dimName: 'udm' },
      },
    );
    assert.equal(result.publishable, true);
    assert.equal(result.capabilities.skill[0].name, 'udm-skill');
    assert.equal(result.capabilities.skill[0].publishDate, '2026-08-01');
    assert.equal(result.extension.description, '旧发布历史说明');
    assert.equal(result.publishing.version, '0.3');
    assert.deepEqual(
      result.releases.map((item) => [item.version, item.status]),
      [
        ['0.2', '失败'],
        ['0.1', '成功'],
      ],
    );
  }
  bindings = success([]);
  assert.deepEqual(await queryHttpExtensionBindings('user-1', scope, scene), scene);
  bindings = { meta: { success: false, message: '旧绑定接口失败' }, data: null };
  await assert.rejects(queryHttpExtensionBindings('user-1', scope, scene), /旧绑定接口失败/);
  console.log('Legacy Extension bindings and release history passed.');
} finally {
  await server.close();
}

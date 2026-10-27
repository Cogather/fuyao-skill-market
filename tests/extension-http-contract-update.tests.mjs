import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { queryHttpExtensionDetail, publishHttpExtension } = await server.ssrLoadModule(
    '/src/services/skillMarket/extensionPublishHttp.ts',
  );
  const calls = [];
  let data = {
    firstScene: '开发',
    secondScene: '测试',
    readyStatus: '已就绪',
    publishedExtension: { extensionName: 'demo-test', description: '测试' },
    components: { agents: [], commands: [], skills: [] },
    layoutMode: 'testagent',
    hasBypass: true,
    bypassEntries: [{ path: '.testagent/agents/custom.md', size: 1024 }],
  };
  request.harnessApi = async (config) => {
    calls.push(config);
    return { code: 0, data };
  };
  const scope = {
    dimType: '产品级',
    dimCode: 'P1',
    dimName: 'demo',
    productId: 'P1',
    departmentPath: [],
  };
  const scene = await queryHttpExtensionDetail('user', scope, {
    extensionName: 'demo-test',
    firstScene: '开发',
    secondScene: '测试',
  });
  assert.deepEqual(calls.pop(), {
    url: '/extensions/detail',
    method: 'GET',
    params: {
      userId: 'user',
      dimType: '产品级',
      dimCode: 'P1',
      dimName: 'demo',
      extensionName: 'demo-test',
      firstScene: '开发',
      secondScene: '测试',
    },
  });
  assert.equal(scene.layoutMode, 'testagent');
  assert.equal(scene.hasBypass, true);
  assert.deepEqual(scene.bypassEntries, [{ path: '.testagent/agents/custom.md', size: 1024 }]);
  data = { ...data, layoutMode: undefined, hasBypass: undefined, bypassEntries: undefined };
  const oldDetail = await queryHttpExtensionDetail('user', scope, { extensionName: 'demo-test' });
  assert.equal(oldDetail.layoutMode, 'standard');
  assert.equal(oldDetail.hasBypass, false);
  assert.deepEqual(oldDetail.bypassEntries, []);
  const input = {
    userId: 'user',
    operatorName: '测试用户',
    scope,
    scene,
    extensionName: 'demo-test',
    description: '说明',
    channel: 'beta',
    organization: { id: 'org1', name: '组织', deptId: '', deptName: '' },
  };
  await publishHttpExtension({ ...input, inheritBypass: false });
  const save = calls.pop();
  assert.equal(save.url, '/extensions/save');
  assert.equal(save.data.inheritBypass, false);
  assert.equal(save.data.layout, undefined);
  assert.equal(save.data.layoutMode, undefined);
  assert.equal(save.params.operatorName, '测试用户');
  await publishHttpExtension(input);
  assert.equal(
    Object.hasOwn(calls.pop().data, 'inheritBypass'),
    false,
    'legacy caller keeps backend true default',
  );
  request.harnessApi = async () => ({ code: 1, message: '发布被拒绝', data: null });
  await assert.rejects(publishHttpExtension(input), /发布被拒绝/);
  const { publishHttpExtension: publishLegacyExtension } = await server.ssrLoadModule(
    '/src/services/skillMarket/legacyExtensionPublishHttp.ts',
  );
  await assert.rejects(publishLegacyExtension(input), /发布被拒绝/);
  console.log('PASS GET detail assembly fields and save inheritBypass contract');
} finally {
  await server.close();
}

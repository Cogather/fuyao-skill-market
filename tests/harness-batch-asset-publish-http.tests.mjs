import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';
const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const ok = (data) => ({ meta: { success: true, message: 'OK' }, data });
const item = { assetType: 'SKILL', assetName: '日志分析', assetVersion: 'v01.2.0' };
const other = { assetType: 'SKILL', assetName: '数据质量', assetVersion: '0.9.1' };
const query = { userId: 'work-123', deptCode: '031562', assetType: 'SKILL' };
const input = { targetOrgId: 'ORG001', userId: 'work-123', userName: '张三', items: [item, other] };
let response = ok([]);
const calls = [];

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { batchAssetPublishService: service, batchPublishItem } = await server.ssrLoadModule(
    '/src/services/skillMarket/batchAssetPublishService.ts',
  );
  const handle = async (config) => {
    calls.push(config);
    if (response instanceof Error) throw response;
    return response;
  };
  request.api = handle;
  request.harnessApi = handle;
  response = ok([
    {
      orgCode: 'ORG001',
      orgName: '云核网络智能组织',
      deptCode: '031562',
      deptName: '云核软件部',
      assets: [
        {
          ...item,
          dimType: '部门级',
          dimCode: '031562',
          dimName: '云核软件部',
          developOwnerId: 'l00000001',
        },
        other,
      ],
    },
    {
      orgCode: 'ORG002',
      orgName: '云核数据智能组织',
      deptCode: '031563',
      deptName: '云核数据部',
      assets: [
        {
          ...other,
          assetName: '产品质量',
          dimType: '产品级',
          dimCode: 'PROD001',
          dimName: '数据智能产品',
        },
      ],
    },
  ]);
  const options = await service.queryOptions(query);
  assert.equal(options.assets.length, 3);
  assert.deepEqual(options.organizations[1], {
    id: 'ORG002',
    name: '云核数据智能组织',
    deptCode: '031563',
    deptName: '云核数据部',
  });
  assert.equal(options.assets[2].targetOrgId, 'ORG002');
  assert.equal(options.assets[2].dimCode, 'PROD001');
  assert.deepEqual(
    batchPublishItem(options.assets[0]),
    item,
    'preserve the exact version for submission',
  );
  assert.deepEqual(calls.at(-1), {
    url: '/v1/harness/assets/publish/batch/pending-list',
    method: 'get',
    params: query,
    withCredentials: true,
  });
  response = ok([]);
  assert.deepEqual(await service.queryOptions(query), { organizations: [], assets: [] });
  response = { meta: { success: false, message: '用户工号不能为空' }, data: null };
  await assert.rejects(service.queryOptions(query), /用户工号不能为空/);
  response = ok([
    { orgCode: 'a', orgName: 'A', assets: [item] },
    { orgCode: 'b', orgName: 'B', assets: [item] },
  ]);
  await assert.rejects(service.queryOptions(query), /多个组织/);

  response = {
    meta: { success: false, message: '部分资产未受理，请查看明细' },
    data: {
      batchId: 'batch/1',
      accepted: [{ ...item, taskId: 'task/1' }],
      rejected: [{ ...other, reason: '该版本已发布，无需重复发布' }],
    },
  };
  const partial = await service.submit(input);
  assert.equal(partial.accepted.length, 1);
  assert.match(partial.rejected[0].reason, /已发布/);
  assert.equal(partial.message, '部分资产未受理，请查看明细');
  assert.deepEqual(calls.at(-1), {
    url: '/v1/harness/assets/publish/batch',
    method: 'post',
    data: input,
    withCredentials: true,
  });
  response = {
    meta: { success: false, message: '全部未受理' },
    data: {
      batchId: '',
      accepted: [],
      rejected: input.items.map((item) => ({ ...item, reason: '该资产正在发布中，请稍候' })),
    },
  };
  assert.equal((await service.submit(input)).rejected.length, 2);
  response = ok({
    batchId: 'batch/2',
    accepted: input.items.map((item, index) => ({ ...item, taskId: `task-${index}` })),
    rejected: [],
  });
  assert.equal((await service.submit(input)).accepted.length, 2);
  response = { meta: { success: false, message: '您不是目标组织的管理员，无法发布' }, data: null };
  await assert.rejects(service.submit(input), /不是目标组织/);
  response = Object.assign(new Error('HTTP 403'), {
    response: { data: { meta: { success: false, message: '用户未登录' } } },
  });
  await assert.rejects(service.submit(input), /用户未登录/);
  response = ok({ batchId: 'batch/1', accepted: [], rejected: [] });
  await assert.rejects(service.submit(input), /不完整/);
  const callsBeforeValidation = calls.length;
  await assert.rejects(
    service.submit({
      ...input,
      items: Array.from({ length: 11 }, (_, index) => ({ ...item, assetName: `item-${index}` })),
    }),
    /最多发布10/,
  );
  await assert.rejects(service.submit({ ...input, userName: '' }), /姓名/);
  await assert.rejects(
    service.submit({ ...input, items: [item, { ...other, assetType: 'AGENT' }] }),
    /同一种/,
  );
  assert.equal(calls.length, callsBeforeValidation);

  response = ok({
    records: [
      {
        ...item,
        id: 'task/1',
        publishStatus: '发布失败',
        operatorId: 'work-123',
        errorMessage: '签名失败',
      },
    ],
  });
  assert.equal((await service.queryProgress('batch/1', 'work-123'))[0].errorMessage, '签名失败');
  assert.deepEqual(calls.at(-1), {
    url: '/assets/publish/history',
    method: 'post',
    data: { batchId: 'batch/1', operatorId: 'work-123', pageNum: 1, pageSize: 10 },
    withCredentials: true,
  });
  response = ok(null);
  await service.retry('task/1', 'work-123');
  assert.deepEqual(calls.at(-1), {
    url: '/assets/publish/task%2F1/retry',
    method: 'post',
    params: { userId: 'work-123' },
    withCredentials: true,
  });
  console.log(
    'PASS HTTP batch query, grouping, exact payloads, credentials, partial/all rejections, progress and retry contracts',
  );
} finally {
  await server.close();
}

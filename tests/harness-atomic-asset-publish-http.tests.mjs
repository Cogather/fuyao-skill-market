import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

const success = (data) => ({ meta: { success: true, message: 'OK' }, data });
const requests = [];
let rejectPublish = false;

try {
  const { default: request } = await server.ssrLoadModule('/src/services/skillMarket/request.ts');
  const { queryHttpHarnessAssetPage } = await server.ssrLoadModule(
    '/src/services/skillMarket/assetManagementHttp.ts',
  );
  const atomicPublish = await server.ssrLoadModule(
    '/src/services/skillMarket/atomicAssetPublishHttp.ts',
  );

  const handleRequest = async (config) => {
    requests.push(config);
    if (config.url === '/v1/harness/plans/components/query') {
      return success({
        records: [
          {
            name: 'incident-review',
            description: '事故复盘 Skill',
            latestVersion: 'v1.2.3',
            status: '待发布',
            category: '产品级/交付平台',
            dimType: '产品级',
            dimCode: 'product-delivery',
            dimName: '交付平台',
            updatedAt: '2026-09-18 09:00:00',
            canPublish: true,
            canEdit: true,
          },
        ],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      });
    }
    if (config.url === '/extensions/orgs') {
      return success([
        { orgCode: 'org-a', orgName: '研发一部' },
        { orgCode: 'org-b', orgName: '研发二部' },
      ]);
    }
    if (config.url === '/assets/publish') {
      if (rejectPublish) {
        return { meta: { success: false, message: '发布服务不可用' }, data: null };
      }
      return success({
        batchId: 'batch-1',
        accepted: [
          {
            assetType: 'SKILL',
            assetName: 'incident-review',
            assetVersion: 'v1.2.3',
            taskId: 'task/1',
          },
        ],
        rejected: [
          {
            assetType: 'SKILL',
            assetName: 'invalid-skill',
            assetVersion: 'v0.1.0',
            reason: '无版本包',
          },
        ],
      });
    }
    if (config.url === '/assets/publish/history') {
      return success({
        records: [
          {
            id: 'task/1',
            publishStatus: '发布失败',
            errorMessage: '签名失败',
            source: '独立发布',
            targetOrgName: '研发一部',
            targetOrgCode: 'org-a',
            operatorName: '发布测试用户',
            operatorId: 'publish-user',
            assetType: 'SKILL',
            assetName: 'incident-review',
            assetVersion: 'v1.2.3',
            createdAt: '2026-09-18 10:00:00',
            updatedAt: '2026-09-18 10:01:00',
          },
        ],
        total: 1,
        pageNum: 1,
        pageSize: 20,
      });
    }
    if (config.url === '/assets/publish/task%2F1/retry') return success('retry-accepted');
    throw new Error(`Unexpected request: ${config.url}`);
  };
  request.api = handleRequest;
  request.harnessApi = handleRequest;

  const scope = {
    userId: 'publish-user',
    userName: '发布测试用户',
    department: { id: 'dept-1', code: 'dept-1', name: '研发部', path: ['研发部'] },
    product: { id: 'wrong-current-filter', name: '其他产品', departmentPath: ['研发部'] },
    assetType: 'Skill',
  };
  const page = await queryHttpHarnessAssetPage(scope, { pageNum: 1, pageSize: 30 });
  const asset = page.list[0];
  assert.equal(asset.latestVersion, 'v1.2.3', 'the publish version must preserve the API value');
  assert.equal(asset.currentVersion, '1.2.3', 'display versions may stay normalized');

  const organizations = await atomicPublish.queryAtomicPublishOrganizations(asset, 'publish-user');
  assert.deepEqual(organizations, [
    { id: 'org-a', name: '研发一部' },
    { id: 'org-b', name: '研发二部' },
  ]);
  const orgRequest = requests.find((item) => item.url === '/extensions/orgs');
  assert.deepEqual(orgRequest.params, {
    userId: 'publish-user',
    dimType: '产品级',
    dimCode: 'product-delivery',
  });

  const result = await atomicPublish.publishAtomicAsset({
    asset,
    organizationCode: 'org-a',
    userId: 'publish-user',
    userName: '发布测试用户',
  });
  assert.equal(result.batchId, 'batch-1');
  assert.equal(result.accepted[0].taskId, 'task/1');
  assert.equal(result.rejected[0].reason, '无版本包');
  const publishRequest = requests.find((item) => item.url === '/assets/publish');
  assert.deepEqual(publishRequest.params, {
    userId: 'publish-user',
    userName: '发布测试用户',
  });
  assert.deepEqual(publishRequest.data, {
    items: [
      {
        assetType: 'SKILL',
        assetName: 'incident-review',
        assetVersion: 'v1.2.3',
      },
    ],
    orgCode: 'org-a',
  });

  const history = await atomicPublish.queryAtomicAssetPublishHistory({
    assetType: 'SKILL',
    assetName: asset.name,
    operatorId: 'publish-user',
  });
  assert.equal(history.records[0].errorMessage, '签名失败');
  assert.equal(history.total, 1);
  const historyRequest = requests.find((item) => item.url === '/assets/publish/history');
  assert.deepEqual(historyRequest.data, {
    assetType: 'SKILL',
    assetName: asset.name,
    operatorId: 'publish-user',
    pageNum: 1,
    pageSize: 20,
  });

  await atomicPublish.retryAtomicAssetPublish('task/1', 'publish-user');
  const retryRequest = requests.find((item) => item.url.includes('/retry'));
  assert.equal(retryRequest.url, '/assets/publish/task%2F1/retry');
  assert.deepEqual(retryRequest.params, { userId: 'publish-user' });

  rejectPublish = true;
  await assert.rejects(
    atomicPublish.publishAtomicAsset({
      asset,
      organizationCode: 'org-a',
      userId: 'publish-user',
      userName: '发布测试用户',
    }),
    /发布服务不可用/,
  );

  console.log(
    'PASS atomic asset publish keeps latestVersion and isolates org, publish, history and retry contracts',
  );
} finally {
  await server.close();
}

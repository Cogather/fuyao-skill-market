import assert from 'node:assert/strict';
import { createServer } from 'vite';

process.env.VITE_SKILL_MARKET_TRANSPORT = 'http';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});
const requests = { Command: [], Agent: [], Skill: [] };
const scope = {
  userId: 'workflow-user',
  productCode: 'product-current',
  productName: 'current-product',
  departmentName: 'current-department',
};
let failNext = false;
let omitTotal = false;

function respond(type, body) {
  requests[type].push({ ...body });
  if (failNext) {
    failNext = false;
    return { meta: { success: false, message: 'Search unavailable' }, data: [] };
  }
  const prefix = type.toLowerCase();
  const keyword = body.keyword;
  const pageNum = Number(body.pageNum);
  const count = pageNum === 1 ? 20 : 1;
  return {
    meta: { success: true, ...(omitTotal ? {} : { number: 21 }) },
    data: Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${(pageNum - 1) * 20 + index + 1}`,
      [`${prefix}Name`]: type === 'Command' ? '///external-command' : `external-${prefix}`,
      [`${prefix}Description`]: `${type} description`,
      dimType: '产品级',
      dimCode: keyword ? 'product-external' : scope.productCode,
      dimName: keyword ? 'external-product' : scope.productName,
      ownerName: 'Owner',
      ownerId: 'owner-id',
      developOwnerName: 'Developer',
      developOwnerId: 'developer-id',
      planFinishDate: '2026-10-01',
      status: '已完成',
      versions:
        index === 1
          ? []
          : [
              { version: '1.0.0', uploadedAt: '2026-08-01T00:00:00Z' },
              { version: '2.0.0', uploadedAt: '2026-09-01T00:00:00Z' },
            ],
    })),
  };
}

try {
  const { skillBaseService } = await server.ssrLoadModule(
    '/src/services/skillMarket/skillBaseService.ts',
  );
  skillBaseService.queryCommandMasterManagement = async (body) => respond('Command', body);
  skillBaseService.queryAgentMasterManagement = async (body) => respond('Agent', body);
  skillBaseService.querySkillMasterManagement = async (body) => respond('Skill', body);

  const { queryWorkflowCapabilityOptions } = await server.ssrLoadModule(
    '/src/services/skillMarket/workflowCapabilitySearchService.ts',
  );
  for (const type of ['Command', 'Agent', 'Skill']) {
    const first = await queryWorkflowCapabilityOptions(type, scope, '  external  ');
    const body = requests[type].at(-1);
    assert.equal(body.keyword, 'external');
    assert.equal(body.userId, scope.userId);
    assert.equal(body.pageNum, 1);
    assert.equal(body.pageSize, 20);
    for (const key of ['dimType', 'dimCode', 'dimName', 'product', 'departmentName', 'level']) {
      assert.equal(key in body, false, `${type} keyword search must omit ${key}`);
    }
    assert.equal(first.list.length, 20);
    assert.equal(first.hasMore, true);
    const option = first.list[0];
    assert.equal(option._id, `catalog:${type}:${type.toLowerCase()}-1`);
    assert.equal(option.sourceId, `${type.toLowerCase()}-1`);
    assert.equal(
      option.name,
      type === 'Command' ? '/external-command' : `external-${type.toLowerCase()}`,
    );
    assert.equal(option.type, type);
    assert.equal(option.description, `${type} description`);
    assert.equal(option.owner, 'Owner owner-id');
    assert.equal(option.developer, 'Developer developer-id');
    assert.equal(option.productName, 'external-product');
    assert.equal(option.version, '2.0.0');
    assert.equal(first.list[1].version, null);
    assert.equal(option.dueDate, '2026-10-01');
    assert.equal(option.status, '已完成');

    const second = await queryWorkflowCapabilityOptions(type, scope, 'external', 2);
    assert.equal(requests[type].at(-1).pageNum, 2);
    assert.equal(second.list.length, 1);
    assert.equal(second.hasMore, false);

    const defaults = await queryWorkflowCapabilityOptions(type, scope, '   ');
    const defaultBody = requests[type].at(-1);
    assert.equal('keyword' in defaultBody, false);
    assert.equal(defaultBody.dimType, '产品级');
    assert.equal(defaultBody.dimCode, scope.productCode);
    assert.equal(defaultBody.dimName, scope.productName);
    assert.equal(defaults.list[0].productName, scope.productName);

    omitTotal = true;
    assert.equal((await queryWorkflowCapabilityOptions(type, scope, 'external')).hasMore, true);
    assert.equal((await queryWorkflowCapabilityOptions(type, scope, 'external', 2)).hasMore, false);
    omitTotal = false;

    failNext = true;
    await assert.rejects(
      queryWorkflowCapabilityOptions(type, scope, 'external'),
      /Search unavailable/,
    );
  }
  console.log(
    'Workflow capability search: all three HTTP query contracts, mapping, paging, and errors passed',
  );
} finally {
  await server.close();
}

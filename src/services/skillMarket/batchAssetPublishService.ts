import type { HarnessAssetDepartment, HarnessAtomicAssetType } from './assetManagementTypes';
import type {
  HarnessAtomicAssetApiType,
  HarnessAtomicPublishHistoryRecord,
  HarnessAtomicPublishItem,
} from './atomicAssetPublishHttp';
import { skillBaseService } from './skillBaseService';
import { batchAssetPublishMock } from './batchAssetPublishMock';
import {
  BATCH_ASSET_API_TYPES,
  BATCH_PUBLISH_LIMIT,
  batchPublishItemKey,
  type HarnessBatchPublishInput,
  type HarnessBatchPublishOptions,
  type HarnessBatchPublishQuery,
  type HarnessBatchPublishResult,
} from './batchAssetPublishTypes';

export * from './batchAssetPublishTypes';

const transportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function required(value: unknown, message: string): string {
  const result = text(value);
  if (!result) throw new Error(message);
  return result;
}
function apiType(value: unknown): HarnessAtomicAssetApiType {
  const result = text(value);
  if (!Object.values(BATCH_ASSET_API_TYPES).includes(result as HarnessAtomicAssetApiType))
    throw new Error('资产类型仅支持 SKILL / COMMAND / AGENT');
  return result as HarnessAtomicAssetApiType;
}
function item(value: unknown): HarnessAtomicPublishItem {
  const row = record(value);
  return {
    assetType: apiType(row.assetType),
    assetName: required(row.assetName, '资产名称不能为空'),
    assetVersion: required(row.assetVersion, '资产版本不能为空'),
  };
}
function message(response: unknown, fallback: string): string {
  return text(record(record(response).meta).message) || fallback;
}
function successfulData(response: unknown, fallback: string): unknown {
  const envelope = record(response);
  if (record(envelope.meta).success !== true) throw new Error(message(response, fallback));
  return envelope.data;
}
async function request(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    const response = record(record(error).response);
    throw new Error(
      message(response.data, error instanceof Error ? error.message : '请求失败，请重试'),
    );
  }
}

export function createBatchPublishQuery(
  assetType: HarnessAtomicAssetType,
  userId: string,
  department: HarnessAssetDepartment,
): HarnessBatchPublishQuery {
  return {
    assetType: BATCH_ASSET_API_TYPES[assetType],
    userId: userId.trim(),
    deptCode: department.code.trim(),
  };
}

function mapOptions(
  response: unknown,
  query: HarnessBatchPublishQuery,
): HarnessBatchPublishOptions {
  const data = successfulData(response, '待发布资产加载失败');
  if (!Array.isArray(data)) throw new Error('待发布资产响应格式不正确');
  const options: HarnessBatchPublishOptions = { organizations: [], assets: [] };
  const orgIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const value of data) {
    const group = record(value);
    const id = required(group.orgCode, '目标组织缺少编码');
    if (orgIds.has(id) || !Array.isArray(group.assets)) throw new Error('目标组织分组数据不正确');
    orgIds.add(id);
    options.organizations.push({
      id,
      name: required(group.orgName, '目标组织缺少名称'),
      deptCode: text(group.deptCode),
      deptName: text(group.deptName),
    });
    for (const value of group.assets) {
      const row = record(value);
      const identity = item(row);
      if (identity.assetType !== query.assetType) throw new Error('待发布资产类型与查询不一致');
      const assetId = batchPublishItemKey(identity);
      if (assetIds.has(assetId)) throw new Error('待发布资产重复或属于多个组织，请刷新后重试');
      assetIds.add(assetId);
      const assetType = Object.keys(BATCH_ASSET_API_TYPES).find(
        (type) => BATCH_ASSET_API_TYPES[type as HarnessAtomicAssetType] === identity.assetType,
      ) as HarnessAtomicAssetType;
      options.assets.push({
        id: assetId,
        assetType,
        name: identity.assetName,
        latestVersion: identity.assetVersion,
        description: text(row.description),
        targetOrgId: id,
        dimType: text(row.dimType),
        dimCode: text(row.dimCode),
        dimName: text(row.dimName),
        developOwnerName: text(row.developOwnerName),
        developOwnerId: text(row.developOwnerId),
        updatedAt: text(row.updatedAt),
      });
    }
  }
  return options;
}

function normalizeInput(input: HarnessBatchPublishInput): HarnessBatchPublishInput {
  const userId = required(input.userId, '尚未获取当前用户工号');
  const userName = required(input.userName, '尚未获取当前用户姓名');
  const targetOrgId = required(input.targetOrgId, '请选择目标组织');
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('发布项不能为空');
  if (input.items.length > BATCH_PUBLISH_LIMIT) throw new Error('单次最多发布10个资产');
  const items = input.items.map(item);
  if (new Set(items.map(batchPublishItemKey)).size !== items.length)
    throw new Error('不能重复选择同一资产版本');
  if (new Set(items.map((value) => value.assetType)).size !== 1)
    throw new Error('每次只能发布同一种资产类型');
  return { targetOrgId, userId, userName, items };
}

function mapResult(response: unknown, input: HarnessBatchPublishInput): HarnessBatchPublishResult {
  const data = record(record(response).data);
  // 部分受理/全部逐项拒绝也返回 success=false，必须先读取逐项结果。
  if (!Array.isArray(data.accepted) || !Array.isArray(data.rejected))
    throw new Error(
      record(record(response).meta).success === false
        ? message(response, '发布请求未受理')
        : '发布受理结果不正确，请刷新清单确认后重试',
    );
  const accepted = data.accepted.map((value) => ({
    ...item(value),
    taskId: required(record(value).taskId, '受理结果缺少任务 ID'),
  }));
  const rejected = data.rejected.map((value) => ({
    ...item(value),
    reason: required(record(value).reason, '拒绝结果缺少原因'),
  }));
  const pending = new Set(input.items.map(batchPublishItemKey));
  for (const result of [...accepted, ...rejected]) {
    if (!pending.delete(batchPublishItemKey(result)))
      throw new Error('发布受理结果与提交资产不一致，请刷新清单确认状态');
  }
  if (pending.size) throw new Error('发布受理结果不完整，请刷新清单确认状态');
  return {
    batchId: accepted.length
      ? required(data.batchId, '受理结果缺少批次 ID，请刷新清单确认状态')
      : text(data.batchId),
    accepted,
    rejected,
    message: message(response, accepted.length ? '发布请求已受理' : '发布请求未受理'),
  };
}

export const batchAssetPublishService = {
  async queryOptions(query: HarnessBatchPublishQuery): Promise<HarnessBatchPublishOptions> {
    const params = {
      assetType: apiType(query.assetType),
      userId: required(query.userId, '尚未获取当前用户工号'),
      deptCode: required(query.deptCode, '请先选择部门，再进行批量发布'),
    };
    const response = transportIsHttp
      ? await request(() => skillBaseService.queryHarnessBatchPublishPending(params))
      : await batchAssetPublishMock.queryPending(params);
    return mapOptions(response, params);
  },
  async submit(input: HarnessBatchPublishInput): Promise<HarnessBatchPublishResult> {
    const body = normalizeInput(input);
    const response = transportIsHttp
      ? await request(() => skillBaseService.publishHarnessAssetBatch(body))
      : await batchAssetPublishMock.submit(body);
    return mapResult(response, body);
  },
  async queryProgress(
    batchId: string,
    userId: string,
  ): Promise<HarnessAtomicPublishHistoryRecord[]> {
    const body = {
      batchId: required(batchId, '缺少批次 ID'),
      operatorId: required(userId, '尚未获取当前用户工号'),
      pageNum: 1,
      pageSize: BATCH_PUBLISH_LIMIT,
    };
    const response = transportIsHttp
      ? await request(() => skillBaseService.queryHarnessAssetPublishHistory(body))
      : await batchAssetPublishMock.queryHistory(body.batchId, body.operatorId);
    const data = successfulData(response, '发布进度加载失败');
    const rows = Array.isArray(data) ? data : record(data).records;
    if (!Array.isArray(rows)) throw new Error('发布进度响应格式不正确');
    return rows.map((value) => {
      const row = record(value);
      return {
        ...item(row),
        id: required(row.id, '发布进度缺少任务 ID'),
        publishStatus: required(row.publishStatus, '发布进度缺少状态'),
        errorMessage: text(row.errorMessage),
        source: text(row.source),
        targetOrgName: text(row.targetOrgName),
        targetOrgCode: text(row.targetOrgCode),
        operatorId: text(row.operatorId),
        operatorName: text(row.operatorName),
        createdAt: text(row.createdAt),
        updatedAt: text(row.updatedAt),
      };
    });
  },
  async retry(taskId: string, userId: string): Promise<void> {
    const id = required(taskId, '缺少发布任务 ID');
    const operatorId = required(userId, '尚未获取当前用户工号');
    const response = transportIsHttp
      ? await request(() => skillBaseService.retryHarnessAssetPublish(id, { userId: operatorId }))
      : await batchAssetPublishMock.retry(id, operatorId);
    successfulData(response, '发布任务重试失败');
  },
};

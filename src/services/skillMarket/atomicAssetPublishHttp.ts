import type {
  HarnessAsset,
  HarnessAssetOrganization,
  HarnessAtomicAssetType,
} from './assetManagementTypes';
import { queryHttpPublishableOrganizations } from './extensionPublishHttp';
import { skillBaseService } from './skillBaseService';

export type HarnessAtomicAssetApiType = 'AGENT' | 'SKILL' | 'COMMAND';

export type HarnessAtomicPublishItem = {
  assetType: HarnessAtomicAssetApiType;
  assetName: string;
  assetVersion: string;
};

export type HarnessAtomicPublishAccepted = HarnessAtomicPublishItem & {
  taskId: string;
};

export type HarnessAtomicPublishRejected = HarnessAtomicPublishItem & {
  reason: string;
};

export type HarnessAtomicPublishResult = {
  batchId: string;
  accepted: HarnessAtomicPublishAccepted[];
  rejected: HarnessAtomicPublishRejected[];
};

export type HarnessAtomicPublishHistoryRecord = HarnessAtomicPublishItem & {
  id: string;
  publishStatus: string;
  errorMessage: string;
  source: string;
  targetOrgName: string;
  targetOrgCode: string;
  operatorName: string;
  operatorId: string;
  createdAt: string;
  updatedAt: string;
};

export type HarnessAtomicPublishHistoryQuery = {
  batchId?: string;
  assetType?: HarnessAtomicAssetApiType;
  assetName?: string;
  operatorId?: string;
  pageNum?: number;
  pageSize?: number;
};

export type HarnessAtomicPublishHistoryPage = {
  records: HarnessAtomicPublishHistoryRecord[];
  total: number;
  pageNum: number;
  pageSize: number;
};

type RecordValue = Record<string, unknown>;

const API_TYPES: Record<HarnessAtomicAssetType, HarnessAtomicAssetApiType> = {
  Agent: 'AGENT',
  Skill: 'SKILL',
  Command: 'COMMAND',
};

const transportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';
const MOCK_ORGANIZATIONS: HarnessAssetOrganization[] = [
  { id: 'org-fuyao', name: '扶摇组织' },
  { id: 'org-yunshan', name: '云山组织' },
  { id: 'org-haichuan', name: '海川组织' },
];
let mockTaskSequence = 0;

function nextMockId(prefix: string): string {
  mockTaskSequence += 1;
  return `mock-${prefix}-${Date.now()}-${mockTaskSequence}`;
}

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

function text(value: unknown): string {
  const result = String(value ?? '').trim();
  return /^(undefined|null)$/i.test(result) ? '' : result;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function responseMessage(response: unknown, fallback: string): string {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  return text(meta.message ?? meta.msg ?? record.message ?? record.msg) || fallback;
}

function assertSuccess(response: unknown, fallback: string): void {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  const code = Number(record.code ?? 0);
  if (
    meta.success === false ||
    record.success === false ||
    (Number.isFinite(code) && code >= 400)
  ) {
    throw new Error(responseMessage(response, fallback));
  }
}

function responseData(response: unknown): unknown {
  let value = response;
  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(value);
    const next = record.data ?? record.result;
    if (next === undefined || next === value) break;
    value = next;
  }
  return value;
}

function requiredText(value: unknown, message: string): string {
  const result = text(value);
  if (!result) throw new Error(message);
  return result;
}

export function atomicAssetApiType(
  assetType: HarnessAsset['assetType'],
): HarnessAtomicAssetApiType {
  if (assetType === 'Extension') throw new Error('Extension 不支持独立资产发布接口');
  return API_TYPES[assetType];
}

export function atomicAssetLatestVersion(asset: HarnessAsset): string {
  return requiredText(asset.latestVersion, '该资产没有可发布的最新版本');
}

function mapPublishItem(value: unknown): HarnessAtomicPublishItem {
  const record = asRecord(value);
  const assetType = requiredText(record.assetType, '发布结果缺少资产类型');
  if (!['AGENT', 'SKILL', 'COMMAND'].includes(assetType)) {
    throw new Error('发布结果包含不支持的资产类型');
  }
  return {
    assetType: assetType as HarnessAtomicAssetApiType,
    assetName: requiredText(record.assetName, '发布结果缺少资产名称'),
    assetVersion: requiredText(record.assetVersion, '发布结果缺少资产版本'),
  };
}

function mapHistoryRecord(value: unknown): HarnessAtomicPublishHistoryRecord {
  const record = asRecord(value);
  return {
    ...mapPublishItem(record),
    id: requiredText(record.id, '发布历史缺少记录 ID'),
    publishStatus: requiredText(record.publishStatus, '发布历史缺少状态'),
    errorMessage: text(record.errorMessage),
    source: text(record.source),
    targetOrgName: text(record.targetOrgName),
    targetOrgCode: text(record.targetOrgCode),
    operatorName: text(record.operatorName),
    operatorId: text(record.operatorId),
    createdAt: text(record.createdAt),
    updatedAt: text(record.updatedAt),
  };
}

export async function queryAtomicPublishOrganizations(
  asset: HarnessAsset,
  userId: string,
): Promise<HarnessAssetOrganization[]> {
  atomicAssetApiType(asset.assetType);
  const dimType = requiredText(asset.dimType, '资产缺少维度类型，无法查询目标组织');
  if (dimType !== '产品级' && dimType !== '部门级') {
    throw new Error('资产维度类型无效，无法查询目标组织');
  }
  const requiredUserId = requiredText(userId, '尚未获取当前用户工号');
  const dimCode = requiredText(asset.dimCode, '资产缺少维度编码，无法查询目标组织');
  if (!transportIsHttp) return MOCK_ORGANIZATIONS.map((organization) => ({ ...organization }));
  const organizations = await queryHttpPublishableOrganizations(requiredUserId, {
    dimType,
    dimCode,
  });
  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
  }));
}

export async function publishAtomicAsset(input: {
  asset: HarnessAsset;
  organizationCode: string;
  userId: string;
  userName: string;
}): Promise<HarnessAtomicPublishResult> {
  const userId = requiredText(input.userId, '尚未获取当前用户工号');
  const userName = requiredText(input.userName, '尚未获取当前用户姓名');
  const organizationCode = requiredText(input.organizationCode, '请选择目标组织');
  const item: HarnessAtomicPublishItem = {
    assetType: atomicAssetApiType(input.asset.assetType),
    assetName: requiredText(input.asset.name, '资产名称不能为空'),
    assetVersion: atomicAssetLatestVersion(input.asset),
  };
  if (!transportIsHttp) {
    const organization = MOCK_ORGANIZATIONS.find((value) => value.id === organizationCode);
    if (!organization) throw new Error('目标组织不存在');
    const batchId = nextMockId('batch');
    const taskId = nextMockId('task');
    return { batchId, accepted: [{ ...item, taskId }], rejected: [] };
  }
  const response = await skillBaseService.publishHarnessAssets(
    {
      userId,
      userName,
    },
    {
      items: [item],
      orgCode: organizationCode,
    },
  );
  assertSuccess(response, '发布任务提交失败');
  const data = asRecord(responseData(response));
  if (!Array.isArray(data.accepted) || !Array.isArray(data.rejected)) {
    throw new Error('发布任务响应格式不正确');
  }
  return {
    batchId: text(data.batchId),
    accepted: data.accepted.map((value) => {
      const record = asRecord(value);
      return {
        ...mapPublishItem(record),
        taskId: requiredText(record.taskId, '受理结果缺少任务 ID'),
      };
    }),
    rejected: data.rejected.map((value) => {
      const record = asRecord(value);
      return {
        ...mapPublishItem(record),
        reason: requiredText(record.reason, '拒绝结果缺少失败原因'),
      };
    }),
  };
}

export async function queryAtomicAssetPublishHistory(
  query: HarnessAtomicPublishHistoryQuery,
): Promise<HarnessAtomicPublishHistoryPage> {
  // 发布历史由后端统一维护；即使页面其余功能运行在 mock 模式，也不能回退到本地记录。
  const pageNum = positiveInteger(query.pageNum, 1);
  const pageSize = positiveInteger(query.pageSize, 20);
  const body = {
    ...(text(query.batchId) ? { batchId: text(query.batchId) } : {}),
    ...(text(query.assetType) ? { assetType: query.assetType } : {}),
    ...(text(query.assetName) ? { assetName: text(query.assetName) } : {}),
    ...(text(query.operatorId) ? { operatorId: text(query.operatorId) } : {}),
    pageNum,
    pageSize,
  };
  const response = await skillBaseService.queryHarnessAssetPublishHistory(body);
  assertSuccess(response, '发布历史加载失败');
  const data = responseData(response);
  const record = asRecord(data);
  const rows = Array.isArray(data) ? data : record.records;
  if (!Array.isArray(rows)) throw new Error('发布历史响应格式不正确');
  const records = rows.map(mapHistoryRecord);
  const totalValue = Number(record.total);
  return {
    records,
    total: Number.isInteger(totalValue) && totalValue >= 0 ? totalValue : records.length,
    pageNum: positiveInteger(record.pageNum ?? record.pageNo, pageNum),
    pageSize: positiveInteger(record.pageSize, pageSize),
  };
}

export function canRetryAtomicPublish(record: HarnessAtomicPublishHistoryRecord): boolean {
  return record.publishStatus === '发布失败' && record.source === '独立发布';
}

export async function retryAtomicAssetPublish(taskId: string, userId: string): Promise<void> {
  // 重试是后端任务的原地续跑，必须使用历史记录 id 调用真实接口。
  const requiredTaskId = requiredText(taskId, '发布记录缺少任务 ID');
  const requiredUserId = requiredText(userId, '尚未获取当前用户工号');
  const response = await skillBaseService.retryHarnessAssetPublish(requiredTaskId, {
    userId: requiredUserId,
  });
  assertSuccess(response, '发布任务重试失败');
}

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
type MockHistoryRecord = HarnessAtomicPublishHistoryRecord & { batchId?: string };

const mockHistory: MockHistoryRecord[] = [];
let mockTaskSequence = 0;

function mockTimestamp(offsetMinutes = 0): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

function nextMockId(prefix: string): string {
  mockTaskSequence += 1;
  return `mock-${prefix}-${Date.now()}-${mockTaskSequence}`;
}

function seedMockHistory(query: HarnessAtomicPublishHistoryQuery): void {
  if (!query.assetType || !text(query.assetName) || text(query.batchId)) return;
  const assetName = text(query.assetName);
  if (
    mockHistory.some(
      (record) => record.assetType === query.assetType && record.assetName === assetName,
    )
  ) {
    return;
  }
  mockHistory.push(
    {
      id: nextMockId('failed'),
      assetType: query.assetType,
      assetName,
      assetVersion: 'v0.1.0',
      publishStatus: '发布失败',
      errorMessage: 'Mock 演示：目标组织校验失败',
      source: '独立发布',
      targetOrgName: MOCK_ORGANIZATIONS[1].name,
      targetOrgCode: MOCK_ORGANIZATIONS[1].id,
      operatorName: 'Mock 发布人',
      operatorId: 'mock-user',
      createdAt: mockTimestamp(-35),
      updatedAt: mockTimestamp(-34),
    },
    {
      id: nextMockId('success'),
      assetType: query.assetType,
      assetName,
      assetVersion: 'v0.0.9',
      publishStatus: '发布成功',
      errorMessage: '',
      source: '独立发布',
      targetOrgName: MOCK_ORGANIZATIONS[0].name,
      targetOrgCode: MOCK_ORGANIZATIONS[0].id,
      operatorName: 'Mock 发布人',
      operatorId: 'mock-user',
      createdAt: mockTimestamp(-80),
      updatedAt: mockTimestamp(-78),
    },
  );
}

function queryMockHistory(
  query: HarnessAtomicPublishHistoryQuery,
): HarnessAtomicPublishHistoryPage {
  seedMockHistory(query);
  const pageNum = positiveInteger(query.pageNum, 1);
  const pageSize = positiveInteger(query.pageSize, 20);
  const rows = mockHistory.filter(
    (record) =>
      (!text(query.batchId) || record.batchId === text(query.batchId)) &&
      (!query.assetType || record.assetType === query.assetType) &&
      (!text(query.assetName) || record.assetName === text(query.assetName)) &&
      (!text(query.operatorId) || record.operatorId === text(query.operatorId)),
  );
  const start = (pageNum - 1) * pageSize;
  return {
    records: rows.slice(start, start + pageSize).map((record) => ({ ...record })),
    total: rows.length,
    pageNum,
    pageSize,
  };
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
    const timestamp = mockTimestamp();
    mockHistory.unshift({
      ...item,
      id: taskId,
      publishStatus: '进行中',
      errorMessage: '',
      source: '独立发布',
      targetOrgName: organization.name,
      targetOrgCode: organization.id,
      operatorName: userName,
      operatorId: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      batchId,
    });
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
  if (!transportIsHttp) return queryMockHistory(query);
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
  const requiredTaskId = requiredText(taskId, '发布记录缺少任务 ID');
  requiredText(userId, '尚未获取当前用户工号');
  if (!transportIsHttp) {
    const record = mockHistory.find((item) => item.id === requiredTaskId);
    if (!record) throw new Error('发布记录不存在');
    if (!canRetryAtomicPublish(record)) throw new Error('该发布记录不可重试');
    record.publishStatus = '进行中';
    record.errorMessage = '';
    record.updatedAt = mockTimestamp();
    return;
  }
  const response = await skillBaseService.retryHarnessAssetPublish(requiredTaskId, { userId });
  assertSuccess(response, '发布任务重试失败');
}

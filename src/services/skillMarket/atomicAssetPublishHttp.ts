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
  assetType: HarnessAtomicAssetApiType;
  assetName: string;
  operatorId: string;
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
const mockHistoryByAsset = new Map<string, HarnessAtomicPublishHistoryRecord[]>();
let mockTaskSequence = 0;

function nextMockId(prefix: string): string {
  mockTaskSequence += 1;
  return `mock-${prefix}-${Date.now()}-${mockTaskSequence}`;
}

function mockHistoryKey(
  assetType: HarnessAtomicAssetApiType,
  assetName: string,
  operatorId: string,
): string {
  return `${assetType}\u0000${assetName}\u0000${operatorId}`;
}

function mockDateTime(daysAgo = 0, hour = 10, minute = 0): string {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setHours(hour, minute, 0, 0);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function createMockHistoryRecords(
  assetType: HarnessAtomicAssetApiType,
  assetName: string,
  operatorId: string,
  operatorName = 'Mock 用户',
): HarnessAtomicPublishHistoryRecord[] {
  const templates = [
    {
      publishStatus: '发布成功',
      errorMessage: '',
      source: '独立发布',
      organization: MOCK_ORGANIZATIONS[0]!,
      assetVersion: 'v1.1.0',
      daysAgo: 1,
      hour: 16,
    },
    {
      publishStatus: '进行中',
      errorMessage: '',
      source: '独立发布',
      organization: MOCK_ORGANIZATIONS[1]!,
      assetVersion: 'v1.0.1',
      daysAgo: 2,
      hour: 11,
    },
    {
      publishStatus: '发布失败',
      errorMessage: '目标组织凭据校验失败，请更新配置后重试',
      source: '独立发布',
      organization: MOCK_ORGANIZATIONS[2]!,
      assetVersion: 'v1.0.0',
      daysAgo: 4,
      hour: 15,
    },
    {
      publishStatus: '发布失败',
      errorMessage: 'Extension 依赖包构建失败',
      source: 'Extension发布',
      organization: MOCK_ORGANIZATIONS[0]!,
      assetVersion: 'v0.9.0',
      daysAgo: 7,
      hour: 9,
    },
  ];
  return templates.map((template, index) => {
    const createdAt = mockDateTime(template.daysAgo, template.hour, 20 + index * 5);
    return {
      id: nextMockId(`history-${assetType.toLowerCase()}`),
      assetType,
      assetName,
      assetVersion: template.assetVersion,
      publishStatus: template.publishStatus,
      errorMessage: template.errorMessage,
      source: template.source,
      targetOrgName: template.organization.name,
      targetOrgCode: template.organization.id,
      operatorName,
      operatorId,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function getMockHistoryRecords(
  assetType: HarnessAtomicAssetApiType,
  assetName: string,
  operatorId: string,
  operatorName?: string,
): HarnessAtomicPublishHistoryRecord[] {
  const key = mockHistoryKey(assetType, assetName, operatorId);
  const existing = mockHistoryByAsset.get(key);
  if (existing) return existing;
  const records = createMockHistoryRecords(assetType, assetName, operatorId, operatorName);
  mockHistoryByAsset.set(key, records);
  return records;
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

export function atomicAssetApiType(asset: HarnessAsset): HarnessAtomicAssetApiType {
  if (asset.assetType === 'Extension') throw new Error('Extension 不支持独立资产发布接口');
  const expectedType = API_TYPES[asset.assetType];
  const queryType = text(asset.type);
  if (queryType && queryType !== expectedType) {
    throw new Error('资产查询记录的类型与当前卡片不一致，请刷新列表后重试');
  }
  return (queryType || expectedType) as HarnessAtomicAssetApiType;
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
  atomicAssetApiType(asset);
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
    assetType: atomicAssetApiType(input.asset),
    assetName: requiredText(input.asset.name, '资产名称不能为空'),
    assetVersion: atomicAssetLatestVersion(input.asset),
  };
  if (!transportIsHttp) {
    const organization = MOCK_ORGANIZATIONS.find((value) => value.id === organizationCode);
    if (!organization) throw new Error('目标组织不存在');
    const batchId = nextMockId('batch');
    const taskId = nextMockId('task');
    const createdAt = mockDateTime(0, new Date().getHours(), new Date().getMinutes());
    getMockHistoryRecords(item.assetType, item.assetName, userId, userName).unshift({
      ...item,
      id: taskId,
      publishStatus: '进行中',
      errorMessage: '',
      source: '独立发布',
      targetOrgName: organization.name,
      targetOrgCode: organization.id,
      operatorName: userName,
      operatorId: userId,
      createdAt,
      updatedAt: createdAt,
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
  const pageNum = positiveInteger(query.pageNum, 1);
  const pageSize = positiveInteger(query.pageSize, 20);
  const assetType = requiredText(query.assetType, '资产类型不能为空');
  if (!Object.values(API_TYPES).includes(assetType as HarnessAtomicAssetApiType)) {
    throw new Error('资产类型无效，无法查询发布历史');
  }
  const normalizedAssetType = assetType as HarnessAtomicAssetApiType;
  const assetName = requiredText(query.assetName, '资产名称不能为空');
  const operatorId = requiredText(query.operatorId, '尚未获取当前用户工号');
  if (!transportIsHttp) {
    const allRecords = getMockHistoryRecords(normalizedAssetType, assetName, operatorId);
    const start = (pageNum - 1) * pageSize;
    return {
      records: allRecords.slice(start, start + pageSize).map((record) => ({ ...record })),
      total: allRecords.length,
      pageNum,
      pageSize,
    };
  }
  const body = {
    assetType: normalizedAssetType,
    assetName,
    operatorId,
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
  const requiredUserId = requiredText(userId, '尚未获取当前用户工号');
  if (!transportIsHttp) {
    for (const records of mockHistoryByAsset.values()) {
      const record = records.find(
        (item) => item.id === requiredTaskId && item.operatorId === requiredUserId,
      );
      if (!record) continue;
      record.publishStatus = '进行中';
      record.errorMessage = '';
      record.updatedAt = mockDateTime(0, new Date().getHours(), new Date().getMinutes());
      return;
    }
    throw new Error('未找到对应的发布记录，请刷新后重试');
  }
  const response = await skillBaseService.retryHarnessAssetPublish(requiredTaskId, {
    userId: requiredUserId,
  });
  assertSuccess(response, '发布任务重试失败');
}

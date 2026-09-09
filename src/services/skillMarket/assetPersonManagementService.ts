import type {
  QuerySkillMasterManagementBody,
  UpdateSkillMasterManagementBody,
  UpdateSkillMasterManagementParams,
} from './apiTypes';
import type {
  HarnessAsset,
  HarnessAtomicAssetType,
  UpdateHarnessAssetPersonInput,
} from './assetManagementTypes';
import { skillBaseService } from './skillBaseService';
import { updateSkillMasterPerson } from './skillMasterManagementService';
import { updateMockCapabilityCatalogPerson } from './harnessCapabilityPlanningMock';

const clients = {
  Skill: {
    query: (body: QuerySkillMasterManagementBody) =>
      skillBaseService.querySkillMasterManagement(body),
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateSkillMasterManagement(body, params),
  },
  Agent: {
    query: (body: QuerySkillMasterManagementBody) =>
      skillBaseService.queryAgentMasterManagement(body),
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateAgentMasterManagement(body, params),
  },
  Command: {
    query: (body: QuerySkillMasterManagementBody) =>
      skillBaseService.queryCommandMasterManagement(body),
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateCommandMasterManagement(body, params),
  },
};

type MasterRecord = Record<string, unknown>;
const text = (value: unknown): string => String(value ?? '').trim();

async function resolveMasterRecord(
  asset: HarnessAsset,
  type: HarnessAtomicAssetType,
  userId: string,
): Promise<MasterRecord> {
  const [dimType = '', ...names] = text(asset.category).split('/');
  const dimName = names.join('/');
  if (!['产品级', '部门级'].includes(dimType) || !dimName) {
    throw new Error('缺少资产归属，请刷新后重试');
  }
  const pageSize = 200;
  const seenIds = new Set<string>();
  const matches = new Map<string, MasterRecord>();
  for (let pageNum = 1; ; pageNum += 1) {
    const response = await clients[type].query({
      userId,
      keyword: asset.name,
      dimType,
      dimName,
      pageNum,
      pageSize,
    });
    if (response?.meta?.success !== true)
      throw new Error(response?.meta?.message || '资产信息查询失败');
    const data = response.data;
    const rows: MasterRecord[] = Array.isArray(data)
      ? data
      : (data?.records ?? data?.list ?? data?.items ?? data?.rows ?? data?.content);
    if (!Array.isArray(rows)) throw new Error('资产信息响应格式不正确');
    const previousCount = seenIds.size;
    for (const record of rows) {
      const id = text(record.id);
      if (id) seenIds.add(id);
      if (
        id &&
        text(record[`${type.toLowerCase()}Name`] ?? record.name) === asset.name &&
        text(record.dimType) === dimType &&
        text(record.dimName) === dimName
      )
        matches.set(id, record);
    }
    if (matches.size > 1) throw new Error('该归属下存在多个同名资产，无法确定修改对象');
    const rawTotal = data?.total ?? response.meta?.total;
    const total = rawTotal == null || rawTotal === '' ? undefined : Number(rawTotal);
    const hasMore =
      total !== undefined && Number.isFinite(total)
        ? pageNum * pageSize < total
        : rows.length === pageSize;
    if (!hasMore) break;
    if (seenIds.size === previousCount) throw new Error('资产清单分页异常，请刷新后重试');
  }
  const record = matches.values().next().value;
  if (!record) throw new Error('未找到对应资产，请刷新后重试');
  if (!text(record.dimCode)) throw new Error('资产缺少归属编码，无法保存');
  return record;
}

export async function updateHarnessAssetPerson(
  input: UpdateHarnessAssetPersonInput,
  transport: 'http' | 'mock',
): Promise<string> {
  const { asset, field, person } = input;
  if (asset.assetType === 'Extension') throw new Error('Extension 暂不支持修改人员');
  const name = text(person.chName);
  const id = text(person.id) || text(person.sAMAccountName);
  if (!name || !id) throw new Error('请搜索并选择有效人员');
  const label = text(person.label) || `${name} ${id}`;
  if (transport === 'mock') {
    const recordField = field === 'owner' ? 'owner' : 'developOwner';
    if (asset.assetType === 'Skill') updateSkillMasterPerson(asset.id, recordField, label);
    else
      updateMockCapabilityCatalogPerson(
        asset.assetType === 'Agent' ? 'agent' : 'command',
        asset.id,
        recordField,
        label,
      );
    return label;
  }
  const userId = text(input.userId);
  if (!userId) throw new Error('缺少当前用户信息，请重新进入页面');
  const record = await resolveMasterRecord(asset, asset.assetType, userId);
  const body: UpdateSkillMasterManagementBody = {
    id: record.id as string | number,
    ...(field === 'owner'
      ? { ownerName: name, ownerId: id }
      : { developOwnerName: name, developOwnerId: id }),
  };
  const response = await clients[asset.assetType].update(body, {
    userId,
    dimType: text(record.dimType),
    dimCode: text(record.dimCode),
    dimName: text(record.dimName),
  });
  if (response?.meta?.success !== true)
    throw new Error(response?.meta?.message || '人员保存失败，请稍后重试');
  return label;
}

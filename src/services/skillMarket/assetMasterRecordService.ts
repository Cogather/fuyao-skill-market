import type { QuerySkillMasterManagementBody } from './apiTypes';
import type { HarnessAsset, HarnessAtomicAssetType } from './assetManagementTypes';
import { skillBaseService } from './skillBaseService';

const queries = {
  Skill: (body: QuerySkillMasterManagementBody) =>
    skillBaseService.querySkillMasterManagement(body),
  Agent: (body: QuerySkillMasterManagementBody) =>
    skillBaseService.queryAgentMasterManagement(body),
  Command: (body: QuerySkillMasterManagementBody) =>
    skillBaseService.queryCommandMasterManagement(body),
};
type MasterRecord = Record<string, unknown>;
const text = (value: unknown): string => String(value ?? '').trim();

// Component list IDs are not master-data IDs. Resolve an exact name and scope
// across all pages before performing a mutation; never fall back to asset.id.
export async function resolveHarnessAssetMasterRecord(
  asset: HarnessAsset,
  type: HarnessAtomicAssetType,
  userId: string,
): Promise<MasterRecord> {
  const [dimType = '', ...names] = text(asset.category).split('/');
  const dimName = names.join('/');
  const dimCode = text(asset.dimCode);
  if (!['产品级', '部门级'].includes(dimType) || !dimName) {
    throw new Error('缺少资产归属，请刷新后重试');
  }
  const pageSize = 200;
  const seenIds = new Set<string>();
  const matches = new Map<string, MasterRecord>();
  for (let pageNum = 1; ; pageNum += 1) {
    const response = await queries[type]({
      userId,
      keyword: asset.name,
      dimType,
      dimName,
      ...(dimCode ? { dimCode } : {}),
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
        text(record.dimName) === dimName &&
        (!dimCode || text(record.dimCode) === dimCode)
      )
        matches.set(id, record);
    }
    if (matches.size > 1) throw new Error('该归属下存在多个同名资产，无法确定操作对象');
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
  return record;
}

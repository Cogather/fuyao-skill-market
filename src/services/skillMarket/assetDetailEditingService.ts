import type { UpdateSkillMasterManagementBody } from './apiTypes';
import type {
  FetchHarnessAssetPlannedCompleteDateInput,
  HarnessAssetDetailsUpdate,
  UpdateHarnessAssetDetailsInput,
} from './assetManagementTypes';
import { resolveHarnessAssetMasterRecord } from './assetMasterRecordService';
import { skillBaseService } from './skillBaseService';
import {
  getMockSkillMasterManagementRecord,
  updateMockSkillMasterManagementDetails,
} from './skillBaseServiceMock';
import {
  queryMockCapabilityCatalog,
  updateMockCapabilityCatalogDetails,
} from './harnessCapabilityPlanningMock';
import {
  getAssetCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';

const text = (value: unknown): string => String(value ?? '').trim();

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateNameChange(
  type: string,
  name: string,
  previousName: string,
  asset: UpdateHarnessAssetDetailsInput['asset'],
  fallbackLevel: string,
  fallbackProduct: string,
  source?: unknown,
): void {
  // Historical names and imported Skills keep the existing catalog exceptions.
  if (name === previousName || (type === 'Skill' && ['引用', 'imported'].includes(text(source))))
    return;
  if (!isCatalogItemNameValid(name))
    throw new Error(`${type} 名称仅允许小写字母、数字、连字符，最长 64 字符`);
  const prefix = getAssetCatalogItemNamePrefix(asset, fallbackLevel, fallbackProduct);
  if (!prefix) return;
  if (!name.startsWith(prefix))
    throw new Error(`产品级 ${type} 名称需以产品名称的小写形式“${prefix}”开头`);
  if (name.length === prefix.length) throw new Error(`请在“${prefix}”后补充 ${type} 名称`);
}

export async function updateHarnessAssetDetails(
  input: UpdateHarnessAssetDetailsInput,
  transport: 'http' | 'mock',
): Promise<HarnessAssetDetailsUpdate> {
  const { asset } = input;
  if (asset.assetType === 'Extension') throw new Error('Extension 暂不支持编辑资产信息');
  const name = text(input.name);
  const description = text(input.description);
  if (!name) throw new Error('请输入名称');
  if (!description) throw new Error('请输入描述');
  const result: HarnessAssetDetailsUpdate = { name, description };
  const people: Omit<UpdateSkillMasterManagementBody, 'id'> = {};
  for (const field of ['owner', 'developer'] as const) {
    const person = input[field];
    if (person === undefined) continue;
    const personName = text(person?.chName);
    const id = text(person?.id) || text(person?.sAMAccountName);
    if (!personName || !id)
      throw new Error(`请搜索并选择有效的${field === 'owner' ? '责任人' : '开发责任人'}`);
    result[field] = `${personName} ${id}`;
    Object.assign(
      people,
      field === 'owner'
        ? { ownerName: personName, ownerId: id }
        : { developOwnerName: personName, developOwnerId: id },
    );
  }
  const plannedCompleteDate = text(input.plannedCompleteDate);
  if (input.plannedCompleteDate !== undefined) {
    if (!plannedCompleteDate) throw new Error('请选择计划完成时间');
    if (plannedCompleteDate < currentLocalDate())
      throw new Error('计划完成时间不能早于当前日期');
    result.plannedCompleteDate = plannedCompleteDate;
  }
  if (transport === 'mock') {
    if (asset.assetType === 'Skill') {
      const record = getMockSkillMasterManagementRecord(asset.id);
      if (!record) throw new Error('未找到对应资产，请刷新后重试');
      validateNameChange(
        'Skill',
        name,
        record.skillName,
        asset,
        record.dimType,
        record.dimName,
        record.skillSource,
      );
      updateMockSkillMasterManagementDetails(asset.id, {
        skillName: name,
        skillDescription: description,
        ...people,
        ...(plannedCompleteDate ? { planFinishDate: plannedCompleteDate } : {}),
      });
      return result;
    }
    const records = await queryMockCapabilityCatalog(
      asset.assetType === 'Agent' ? 'agent' : 'command',
    );
    const record = records.find((item) => item.id === asset.id);
    if (!record) throw new Error('未找到对应资产，请刷新后重试');
    validateNameChange(
      asset.assetType,
      name,
      record.name,
      asset,
      record.level,
      record.product,
      record.skillSource,
    );
    const patch = {
      name,
      description,
      ...(result.owner === undefined ? {} : { owner: result.owner }),
      ...(result.developer === undefined ? {} : { developOwner: result.developer }),
      ...(plannedCompleteDate ? { plannedCompleteDate } : {}),
    };
    updateMockCapabilityCatalogDetails(
      asset.assetType === 'Agent' ? 'agent' : 'command',
      asset.id,
      patch,
    );
    return result;
  }
  const userId = text(input.userId);
  if (!userId) throw new Error('缺少当前用户信息，请重新进入页面');
  const record = await resolveHarnessAssetMasterRecord(asset, asset.assetType, userId);
  validateNameChange(
    asset.assetType,
    name,
    asset.name,
    asset,
    text(record.dimType),
    String(record.dimName ?? ''),
    record.skillSource,
  );
  const dimCode = text(record.dimCode);
  if (!dimCode) throw new Error('资产缺少归属编码，无法保存');
  if (text(asset.dimCode) && text(asset.dimCode) !== dimCode)
    throw new Error('资产归属编码不一致，请刷新后重试');
  const params = { userId, dimType: text(record.dimType), dimCode, dimName: text(record.dimName) };
  const body = {
    id: record.id as string | number,
    ...people,
    ...(plannedCompleteDate ? { planFinishDate: plannedCompleteDate } : {}),
  };
  const response =
    asset.assetType === 'Skill'
      ? await skillBaseService.updateSkillMasterManagement(
          { ...body, skillName: name, skillDescription: description },
          params,
        )
      : asset.assetType === 'Agent'
        ? await skillBaseService.updateAgentMasterManagement(
            { ...body, agentName: name, agentDescription: description },
            params,
          )
        : await skillBaseService.updateCommandMasterManagement(
            { ...body, commandName: name, commandDescription: description },
            params,
          );
  if (response?.meta?.success !== true)
    throw new Error(response?.meta?.message || '资产信息保存失败，请稍后重试');
  return result;
}

export async function fetchHarnessAssetPlannedCompleteDate(
  input: FetchHarnessAssetPlannedCompleteDateInput,
  transport: 'http' | 'mock',
): Promise<string> {
  const { asset } = input;
  if (asset.assetType === 'Extension') return '';
  if (transport === 'mock') {
    if (asset.assetType === 'Skill') {
      const record = getMockSkillMasterManagementRecord(asset.id);
      return text(record?.planFinishDate);
    }
    const records = await queryMockCapabilityCatalog(
      asset.assetType === 'Agent' ? 'agent' : 'command',
    );
    const record = records.find((item) => item.id === asset.id);
    return text(record?.plannedCompleteDate);
  }
  const userId = text(input.userId);
  if (!userId) return '';
  const record = await resolveHarnessAssetMasterRecord(asset, asset.assetType, userId);
  return text(record.planFinishDate ?? record.plannedCompleteDate);
}

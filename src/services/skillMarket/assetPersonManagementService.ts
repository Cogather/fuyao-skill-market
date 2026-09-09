import type {
  UpdateSkillMasterManagementBody,
  UpdateSkillMasterManagementParams,
} from './apiTypes';
import type { UpdateHarnessAssetPersonInput } from './assetManagementTypes';
import { skillBaseService } from './skillBaseService';
import { updateSkillMasterPerson } from './skillMasterManagementService';
import { updateMockCapabilityCatalogPerson } from './harnessCapabilityPlanningMock';
import { resolveHarnessAssetMasterRecord } from './assetMasterRecordService';

const clients = {
  Skill: {
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateSkillMasterManagement(body, params),
  },
  Agent: {
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateAgentMasterManagement(body, params),
  },
  Command: {
    update: (body: UpdateSkillMasterManagementBody, params: UpdateSkillMasterManagementParams) =>
      skillBaseService.updateCommandMasterManagement(body, params),
  },
};

const text = (value: unknown): string => String(value ?? '').trim();

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
  const record = await resolveHarnessAssetMasterRecord(asset, asset.assetType, userId);
  if (!text(record.dimCode)) throw new Error('资产缺少归属编码，无法保存');
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

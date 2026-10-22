import type { DeleteHarnessAssetInput } from './assetManagementTypes';
import { resolveHarnessAssetMasterRecord } from './assetMasterRecordService';
import { skillBaseService } from './skillBaseService';
import { deleteMockCapabilityCatalogRecord } from './harnessCapabilityPlanningMock';
import { deleteSkillMasterRecord } from './skillMasterManagementService';
import { removeSkillMasterAssociation } from './skillMasterAssociationService';

const deleteClients = {
  Agent: (id: string, userId: string) => skillBaseService.deleteAgentMasterManagement(id, userId),
  Command: (id: string, userId: string) =>
    skillBaseService.deleteCommandMasterManagement(id, userId),
  Skill: (id: string, userId: string) => skillBaseService.deleteSkillMasterManagement(id, userId),
};

export async function deleteHarnessAsset(
  { asset, userId: rawUserId }: DeleteHarnessAssetInput,
  transport: 'http' | 'mock',
): Promise<void> {
  if (asset.assetType === 'Extension') throw new Error('Extension 暂不支持删除');
  if (transport === 'mock') {
    if (!asset.id.trim()) throw new Error('缺少资产 ID，请刷新后重试');
    if (asset.assetType === 'Skill') {
      const { exportAllSkillPlanningList } = await import('./skillPlanningMockService');
      const planning = await exportAllSkillPlanningList();
      if (planning.some((item) => item.skillId === asset.id)) {
        throw new Error('Skill 已被规划引用，不能删除');
      }
      deleteSkillMasterRecord(asset.id);
      removeSkillMasterAssociation(asset.id);
    } else {
      await deleteMockCapabilityCatalogRecord(
        asset.assetType === 'Agent' ? 'agent' : 'command',
        asset.id,
      );
    }
    return;
  }
  const userId = rawUserId.trim();
  if (!userId) throw new Error('缺少当前用户信息，请重新进入页面');
  const record = await resolveHarnessAssetMasterRecord(asset, asset.assetType, userId);
  const id = String(record.id).trim();
  const response = await deleteClients[asset.assetType](id, userId);
  if (response?.meta?.success !== true) {
    throw new Error(String(response?.meta?.message || response?.message || '删除失败，请稍后重试'));
  }
  if (asset.assetType === 'Skill') removeSkillMasterAssociation(id);
}

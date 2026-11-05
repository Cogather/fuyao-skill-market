import {
  queryHarnessCapabilityCatalogPage,
  type HarnessCapabilityPlanningCatalogQuery,
  type HarnessCapabilityType,
} from './harnessCapabilityPlanningService';
import { latestSkillMasterVersion } from './skillMasterManagementService';

export type WorkflowCapabilityType = 'Command' | 'Agent' | 'Skill';

export interface WorkflowCapabilityOption {
  _id: string;
  sourceId?: string;
  name: string;
  description: string;
  owner: string;
  developer: string;
  version: string | null;
  type: WorkflowCapabilityType;
  productName?: string;
  status?: string;
  dueDate?: string | null;
}

export interface WorkflowCapabilitySearchScope {
  userId: string;
  productCode: string;
  productName: string;
  departmentName: string;
}

const catalogType: Record<WorkflowCapabilityType, HarnessCapabilityType> = {
  Command: 'command',
  Agent: 'agent',
  Skill: 'skill',
};

export async function queryWorkflowCapabilityOptions(
  type: WorkflowCapabilityType,
  scope: WorkflowCapabilitySearchScope,
  keyword: string,
  pageNum = 1,
): Promise<{ list: WorkflowCapabilityOption[]; hasMore: boolean }> {
  const search = keyword.trim();
  const query: HarnessCapabilityPlanningCatalogQuery = {
    userId: scope.userId,
    pageNum,
    pageSize: 20,
    ...(search
      ? { keyword: search }
      : {
          dimType: '产品级',
          dimCode: scope.productCode,
          dimName: scope.productName,
          level: '产品级',
          product: scope.productName,
          departmentName: scope.departmentName,
        }),
  };
  const result = await queryHarnessCapabilityCatalogPage(catalogType[type], query);
  return {
    list: result.list.map((record) => ({
      _id: `catalog:${type}:${record.id}`,
      sourceId: record.id,
      name: type === 'Command' ? `/${record.name.replace(/^\/+/, '')}` : record.name,
      description: record.description,
      owner: record.owner,
      developer: record.developOwner,
      version: latestSkillMasterVersion(record)?.version ?? null,
      type,
      productName: record.product,
      status: record.status,
      dueDate: record.plannedCompleteDate || null,
    })),
    hasMore: result.hasMore,
  };
}

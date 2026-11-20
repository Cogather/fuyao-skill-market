import type { HarnessAtomicAssetType } from './assetManagementTypes';
import type {
  HarnessAtomicAssetApiType,
  HarnessAtomicPublishItem,
  HarnessAtomicPublishResult,
} from './atomicAssetPublishHttp';

export const BATCH_PUBLISH_LIMIT = 10;

export type HarnessBatchPublishQuery = {
  assetType: HarnessAtomicAssetApiType;
  userId: string;
  deptCode: string;
};

export type HarnessBatchPublishOrganization = {
  id: string;
  name: string;
  deptCode: string;
  deptName: string;
};

export type HarnessBatchPublishAsset = {
  id: string;
  assetType: HarnessAtomicAssetType;
  name: string;
  description: string;
  latestVersion: string;
  targetOrgId: string;
  dimType: string;
  dimCode: string;
  dimName: string;
  developOwnerName: string;
  developOwnerId: string;
  updatedAt: string;
};

export type HarnessBatchPublishOptions = {
  organizations: HarnessBatchPublishOrganization[];
  assets: HarnessBatchPublishAsset[];
};

export type HarnessBatchPublishInput = {
  targetOrgId: string;
  userId: string;
  userName: string;
  items: HarnessAtomicPublishItem[];
};

export type HarnessBatchPublishResult = HarnessAtomicPublishResult & { message: string };

export const BATCH_ASSET_API_TYPES: Record<HarnessAtomicAssetType, HarnessAtomicAssetApiType> = {
  Agent: 'AGENT',
  Skill: 'SKILL',
  Command: 'COMMAND',
};

/** 与提交及受理结果一致的身份；版本保留接口原值，显示时才加 v。 */
export function batchPublishItemKey(item: HarnessAtomicPublishItem): string {
  return JSON.stringify([item.assetType, item.assetName, item.assetVersion]);
}

export function batchPublishItem(asset: HarnessBatchPublishAsset): HarnessAtomicPublishItem {
  return {
    assetType: BATCH_ASSET_API_TYPES[asset.assetType],
    assetName: asset.name,
    assetVersion: asset.latestVersion,
  };
}

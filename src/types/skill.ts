/** Skill 一条市场展示记录（聚合了最新版本信息） */
export interface Skill {
  id: string;
  name: string;
  /** 用于卡片左侧图标：emoji 或简短标识 */
  icon: string;
  publisher: string;
  latestPublishTime: string;
  level: string;
  downloads: number;
  rating: number;
  /** 当前对外展示版本号 */
  version: string;
  /** 历史版本（新上传同名 Skill 会追加） */
  versions: SkillVersionEntry[];
  /** 当前登录用户是否曾通过本地上传发布/更新过 */
  ownedByUser?: boolean;
  /** 功能类标签（如：开发、运维、设计、办公） */
  tagFunctional: string;
  /** 组织/范围类标签 */
  tagOrg: string;
}

export interface SkillVersionEntry {
  version: string;
  publishTime: string;
  note?: string;
  packageFileName?: string;
  packageSize?: number;
  packageBlob?: Blob;
}

export type MarketPerspective = 'user' | 'admin';

export type UserInnerTab = 'overview' | 'core' | 'releases' | 'ops';

/** 市场总览 · 快捷入口 */
export type OverviewQuickFilter =
  | 'all'
  | 'personal'
  | 'devDept'
  | 'pdu'
  | 'productLine'
  | 'recent'
  | 'highDl';

export type SkillMarketScope = 'all' | 'personal' | 'devDept' | 'pdu' | 'productLine';

export interface SkillUploadPayload {
  name: string;
  publisher?: string;
  userId?: string;
  note?: string;
  file?: File | null;
  scopeLabel?: string;
  tagFunctional?: string;
}

export interface SkillUploadResponse {
  created: boolean;
  skill: Skill;
}

export interface SkillListQuery {
  keyword?: string;
  page?: number;
  pageSize?: number;
  scope?: SkillMarketScope;
}

export interface SkillListResponse {
  list: Skill[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

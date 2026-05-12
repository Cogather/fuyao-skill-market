/** Skill 一条市场展示记录（聚合了最新版本信息） */
export interface Skill {
  /** Excel 字段：skill_id */
  skill_id: string;
  /** Excel 字段：description */
  description: string;
  /** Excel 字段：publish_name */
  publish_name: string;
  /** Excel 字段：publish_level（个人级 / 组织级 等） */
  publish_level: string;
  /** Excel 字段：owner_list（原表为 JSON/字符串，前端保持 string 兼容） */
  owner_list: string;
  /** Excel 字段：download_count */
  download_count: number;
  /** Excel 字段：dept_name（/ 分隔层级） */
  dept_name: string;

  /**
   * 兼容历史 UI 字段（逐步淘汰）
   * - 仍有页面依赖 SkillCard / 上传 / 版本等旧字段
   */
  id?: string;
  name?: string;
  /** 用于卡片左侧图标：emoji 或简短标识 */
  icon?: string;
  publisher?: string;
  latestPublishTime?: string;
  level?: string;
  downloads?: number;
  rating?: number;
  /** 当前对外展示版本号 */
  version?: string;
  /** 历史版本（新上传同名 Skill 会追加） */
  versions?: SkillVersionEntry[];
  /** 当前登录用户是否曾通过本地上传发布/更新过 */
  ownedByUser?: boolean;
  /** 接口 `status`：个人级、组织级、组织审核中、组织已驳回 等（我的发布展示用） */
  marketStatus?: string;
  /** 功能类标签（如：开发、运维、设计、办公） */
  tagFunctional?: string;
  /** 组织/范围类标签 */
  tagOrg?: string;
  /** 标签集合，用于市场总览左侧标签筛选 */
  tags?: string;
  /** 详情/联调：列表或详情可能带回的目录树（路径数组或换行分隔路径串） */
  fileTree?: string | string[];
  /** 详情/联调：列表或详情可能带回的 SKILL.md 正文 */
  skillMdContent?: string;
}

export interface SkillVersionEntry {
  version: string;
  publishTime: string;
  /** 版本发布人（列表展示） */
  publisher?: string;
  /** 为 true 时表示已下架，仍保留在历史列表中 */
  unpublished?: boolean;
  note?: string;
  packageFileName?: string;
  packageSize?: number;
  packageBlob?: Blob;
}

export type MarketPerspective = 'user' | 'admin';

export type UserInnerTab = 'overview' | 'core' | 'releases' | 'org' | 'approval' | 'ops';

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
  userId?: string;
}

export interface SkillListResponse {
  list: Skill[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

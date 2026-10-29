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
  /** 接口字段：Skill 作者 */
  author?: string;
  /** 接口字段：创建人，Skill 卡片作者位置展示使用 */
  createdBy?: string;
  /** 接口字段：组织名称，组织级 Skill 卡片展示使用 */
  orgName?: string | null;
  /** 接口字段：部门层级，个人级 Skill 卡片展示最小非空层级 */
  departmentL1?: string;
  departmentL2?: string;
  departmentL3?: string;
  departmentL4?: string;
  departmentL5?: string;
  departmentL6?: string;
  publisher?: string;
  latestPublishTime?: string;
  level?: string;
  downloads?: number;
  /** Skill 累计调用量，对应列表接口 `totalAccess` */
  totalAccess?: number;
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
  /** 接口/Mock 可能返回的业务维度展示名 */
  categoryGroupName?: string;
  /** 接口/Mock 可能返回的二级业务分类 */
  category?: string;
  /** 接口/Mock 可能返回的业务维度字段 */
  businessDimension?: string;
  /** 组织/范围类标签 */
  tagOrg?: string;
  /** 标签集合，用于市场总览左侧标签筛选 */
  tags?: string;
  /** 详情/联调：列表或详情可能带回的目录树（路径数组或换行分隔路径串） */
  fileTree?: string | string[];
  /** 详情/联调：列表或详情可能带回的 SKILL.md 正文 */
  skillMdContent?: string;
  /** 质量勋章，市场卡片可用于展示右上角徽章 */
  qualityBadges?: string[] | string;
  /** 质量标记名称 */
  qualityMark?: string | null;
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

export type UserInnerTab =
  'hot' | 'overview' | 'core' | 'releases' | 'org' | 'approval' | 'ops' | 'review';

/** 市场总览 · 快捷入口 */
export type OverviewQuickFilter =
  'all' | 'personal' | 'devDept' | 'pdu' | 'productLine' | 'recent' | 'highDl';

export type SkillMarketScope = 'all' | 'personal' | 'devDept' | 'pdu' | 'productLine';

/** 弹窗发布层级 */
export type SkillPublishScope = 'personal' | 'org';

/** 弹窗可选的目标组织（当前用户有发布权限的组织） */
export interface SkillPublishOrgOption {
  orgId: string;
  orgCode?: string;
  orgName: string;
  /** 组织 owner 名称，仅展示用 */
  owner?: string;
}

/**
 * 组织级发布任务状态（对齐真实接口枚举）：
 * PROCESSING 发布中 / PENDING_APPROVAL 待审批 / SUCCESS 成功 / FAIL 失败 / REJECTED 驳回
 */
export type SkillOrgPublishTaskStatus =
  | 'processing'
  | 'pending_approval'
  | 'success'
  | 'fail'
  | 'rejected';

export interface SkillOrgPublishTask {
  id: string;
  /** Skill 名称（含版本展示用） */
  skillName: string;
  version?: string;
  /** 发布人工号/姓名 */
  publisher?: string;
  publisherName?: string;
  targetOrgId?: string;
  targetOrgName?: string;
  /** 发布日期（提交时间） */
  publishDate: string;
  status: SkillOrgPublishTaskStatus;
  /** status = pending_approval 时后端给出完整审批页链接 */
  approvalUrl?: string;
  /** 审批完成时间 / 驳回时间 */
  finishedDate?: string | null;
  /** 驳回原因 */
  rejectReason?: string | null;
}

export interface SkillUploadPayload {
  name: string;
  publisher?: string;
  userId?: string;
  note?: string;
  file?: File | null;
  scopeLabel?: string;
  /** 发布层级：personal 个人级（默认）；org 组织级（需审批） */
  scope?: SkillPublishScope;
  /** 组织级发布的目标组织 */
  targetOrgId?: string;
  targetOrgName?: string;
  /** 组织级发布任务 ID（提交成功后由后端返回） */
  taskId?: string;
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

/* ==================== Extension → CoreALM-Next 小队转换 ==================== */

/** 目标空间（CoreALM-Next 空间） */
export interface ConvertSpaceOption {
  spaceId: string;
  spaceName: string;
  description?: string;
}

/** 转换任务状态 */
export type ConvertTaskStatus = 'processing' | 'success' | 'fail' | 'canceled';

/** Agent-Skill 关系 */
export interface ConvertAgentSkillRel {
  agentName: string;
  agentPrompt?: string;
  skills: string[];
}

/** 小队成员 */
export interface ConvertSquadMember {
  name: string;
  role: string;
  prompt: string;
}

/** 转换任务详情 */
export interface ConvertTaskDetail {
  taskId: string;
  extensionName: string;
  extensionVersion?: string;
  submitter?: string;
  status: ConvertTaskStatus;
  squadName?: string;
  squadDescription?: string;
  squadInstruction?: string;
  members?: ConvertSquadMember[];
  agentSkillRels?: ConvertAgentSkillRel[];
  targetSpace?: ConvertSpaceOption;
  createdAt?: string;
  finishedAt?: string | null;
  errorMessage?: string | null;
}

/** 转换任务列表行（简化） */
export interface ConvertTaskListItem {
  taskId: string;
  extensionName: string;
  extensionVersion?: string;
  submitter?: string;
  status: ConvertTaskStatus;
  squadName?: string;
  squadDescription?: string;
  targetSpaceName?: string;
  createdAt?: string;
  finishedAt?: string | null;
}

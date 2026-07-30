/**
 * 部门 Skill 评审模块 · Mock 数据与类型定义
 *
 * 该模块面向「skill 组织管理员」：管理员在自己看管的部门下，
 * 浏览全部个人级 Skill、填写评审意见、勾选后一键发布到组织，
 * 并跟踪发布任务的审批进度。
 *
 * 这里先以 Mock 数据落地交互；后续可替换为真实接口。
 */

/** 管理员看管的部门节点（与部门级联树一致） */
export interface ManagedDeptNode {
  id: string;
  /** 部门完整路径，如「IT装备部 / 平台开发部 / 应用一部」 */
  path: string;
  /** 部门短名，如「应用一部」 */
  name: string;
}

/** AI 评审维度得分 */
export interface AiReviewDimensionScore {
  dimensionId: string;
  dimensionName: string;
  score: number;
  reason: string;
}

/** 专家评审维度得分 */
export interface ExpertReviewDimensionScore {
  dimensionId: string;
  dimensionName: string;
  score: number;
  reason: string;
}

/** 部门评审列表中的一条个人级 Skill */
export interface DeptSkillRow {
  id: string;
  name: string;
  /** 最新版本号 */
  version: string;
  description: string;
  author: string;
  /** 作者工号 */
  authorId: string;
  /** 所属部门路径 */
  deptPath: string;
  /** 下载量 */
  downloads: number;
  /** 累计调用量 */
  totalAccess: number;
  /** AI 评审总分（0-100，未评审时为 null） */
  aiScore: number | null;
  /** AI 评审维度明细 */
  aiDimensions: AiReviewDimensionScore[];
  /** 专家评审总分（0-100，未评审时为 null） */
  expertScore: number | null;
  /** 专家评审结论：通过 / 不通过 / 待评审 */
  expertConclusion: '通过' | '不通过' | '待评审' | string;
  /** 专家评审维度明细 */
  expertDimensions: ExpertReviewDimensionScore[];
  /** 勋章结果 */
  badges: string[];
  /** 质量标记名称 */
  qualityMark: string | null;
  /** 关联的发布任务 ID（已发起发布时非空） */
  publishTaskId: string | null;
  /** 该 Skill 的评审意见 / 一键发布申请列表 */
  comments: DeptSkillCommentItem[];
}

/** Skill 评审意见 / 一键发布申请的状态 */
export type DeptCommentStatus = 'processing' | 'closed' | 'rejected';

/** Skill 评审意见 / 一键发布申请条目 */
export interface DeptSkillCommentItem {
  id: string;
  /** review：评审意见；publish：一键发布申请 */
  type: 'review' | 'publish';
  /** 提交人名 */
  submitter: string;
  /** 提交人工号 */
  submitterId: string;
  /** 意见 / 申请内容 */
  content: string;
  status: DeptCommentStatus;
  /** 提交时间 */
  createdAt: string;
  /** 是否为当前管理员提交 */
  isMine: boolean;
  /** 关联的发布任务 ID（publish 类型适用） */
  publishTaskId?: string;
}

/** 发布任务中的单条 Skill 快照 */
export interface PublishTaskSkill {
  id: string;
  name: string;
  version: string;
  author: string;
}

/** 发布任务状态 */
export type PublishTaskStatus =
  | 'pending_owner' // 等待组织 owner 确认
  | 'approved' // owner 已确认，已发布到组织
  | 'rejected'; // owner 已驳回

/** 发布到组织的任务 */
export interface PublishTask {
  id: string;
  /** 任务名称（自动生成） */
  taskName: string;
  /** 目标组织 ID */
  targetOrgId: string;
  /** 目标组织名称 */
  targetOrgName: string;
  /** 组织 owner（用于通知） */
  orgOwner: string;
  /** 任务状态 */
  status: PublishTaskStatus;
  /** 涉及的 Skill 快照列表 */
  skills: PublishTaskSkill[];
  /** 创建时间 */
  createdAt: string;
  /** 完成时间（已确认 / 已驳回时填写） */
  completedAt: string | null;
  /** 发起人 */
  creator: string;
  /** 审批意见（owner 填写） */
  approvalComment: string | null;
}

/** 可见组织（用于发布弹窗选择） */
export interface PublishTargetOrg {
  id: string;
  orgName: string;
  /** 组织 owner 名称 */
  owner: string;
}

/** ============== Mock 数据 ============== */

export const mockManagedDepts: ManagedDeptNode[] = [
  { id: 'd-it-platform-app1', path: 'IT装备部 / 平台开发部 / 应用一部', name: '应用一部' },
  { id: 'd-it-platform-app2', path: 'IT装备部 / 平台开发部 / 应用二部', name: '应用二部' },
  { id: 'd-it-ops', path: 'IT装备部 / 运维部', name: '运维部' },
  { id: 'd-cloud-dev', path: '云业务部 / 研发一部', name: '研发一部' },
];

export const mockPublishTargetOrgs: PublishTargetOrg[] = [
  { id: 'org-fuyao-it', orgName: '扶摇 IT 装备部组织', owner: '张三（zhangsan）' },
  { id: 'org-platform', orgName: '平台开发部组织', owner: '李四（lisi）' },
];

export const mockDeptSkills: DeptSkillRow[] = [
  {
    id: 'sk-1001',
    name: 'PDF 表格抽取 Skill',
    version: 'v1.3.0',
    description: '从 PDF 文件中抽取表格并转为结构化 JSON，支持多页与合并单元格。',
    author: '王小明',
    authorId: 'wxiaoming',
    deptPath: '部门1 / 平台产品线 / DevOps部 / 发布工具组',
    downloads: 1280,
    totalAccess: 8600,
    aiScore: 88,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 90, reason: '结构清晰，命名规范。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 86, reason: 'SKILL.md 覆盖完整，缺少部分示例。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 88, reason: '通用性强，适合多场景复用。' },
    ],
    expertScore: 92,
    expertConclusion: '通过',
    expertDimensions: [
      { dimensionId: 'ex-1', dimensionName: '功能完整性', score: 93, reason: '边界覆盖完整。' },
      { dimensionId: 'ex-2', dimensionName: '工程质量', score: 91, reason: '测试充分。' },
      { dimensionId: 'ex-3', dimensionName: '业务价值', score: 92, reason: '可显著提效。' },
    ],
    badges: ['金牌 Skill', '高复用'],
    qualityMark: '推荐',
    publishTaskId: null,
    comments: [
      {
        id: 'cm-1001-1',
        type: 'review',
        submitter: '当前管理员',
        submitterId: 'admin',
        content: '代码与文档质量较高，建议直接发布到组织。',
        status: 'closed',
        createdAt: '2026-07-12 10:24',
        isMine: true,
      },
      {
        id: 'cm-1001-2',
        type: 'review',
        submitter: '陈刚（chengang）',
        submitterId: 'chengang',
        content: '已在团队内试用，复用价值明显，同意发布。',
        status: 'closed',
        createdAt: '2026-07-13 09:10',
        isMine: false,
      },
    ],
  },
  {
    id: 'sk-1002',
    name: 'Git 提交信息生成器',
    version: 'v0.9.2',
    description: '基于 diff 自动生成符合 Conventional Commits 的提交信息。',
    author: '李华',
    authorId: 'lihua',
    deptPath: '部门1 / 平台产品线 / DevOps部 / 发布工具组',
    downloads: 960,
    totalAccess: 4200,
    aiScore: 76,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 80, reason: '基本规范。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 70, reason: '示例不足。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 78, reason: '场景较通用。' },
    ],
    expertScore: null,
    expertConclusion: '待评审',
    expertDimensions: [],
    badges: [],
    qualityMark: null,
    publishTaskId: null,
    comments: [],
  },
  {
    id: 'sk-1003',
    name: '日志异常聚类分析',
    version: 'v2.1.0',
    description: '对海量日志做异常聚类，输出根因建议与处置脚本。',
    author: '赵敏',
    authorId: 'zhaomin',
    deptPath: '部门1 / SRE产品线 / 平台稳定部 / 日志工具组',
    downloads: 2140,
    totalAccess: 15600,
    aiScore: 91,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 92, reason: '结构清晰。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 90, reason: '文档详尽。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 91, reason: '运维场景高复用。' },
    ],
    expertScore: 95,
    expertConclusion: '通过',
    expertDimensions: [
      { dimensionId: 'ex-1', dimensionName: '功能完整性', score: 96, reason: '聚类准确率高。' },
      { dimensionId: 'ex-2', dimensionName: '工程质量', score: 94, reason: '性能良好。' },
      { dimensionId: 'ex-3', dimensionName: '业务价值', score: 95, reason: '显著降低 MTTR。' },
    ],
    badges: ['金牌 Skill', '标杆案例'],
    qualityMark: '推荐',
    publishTaskId: null,
    comments: [
      {
        id: 'cm-1003-1',
        type: 'review',
        submitter: '陈刚（chengang）',
        submitterId: 'chengang',
        content: '聚类效果不错，建议尽快发布到组织供运维使用。',
        status: 'processing',
        createdAt: '2026-07-15 14:08',
        isMine: false,
      },
    ],
  },
  {
    id: 'sk-1004',
    name: 'SQL 性能诊断助手',
    version: 'v1.0.5',
    description: '解析执行计划并给出索引优化建议。',
    author: '孙强',
    authorId: 'sunqiang',
    deptPath: '部门1 / SRE产品线 / 平台稳定部 / 日志工具组',
    downloads: 530,
    totalAccess: 1800,
    aiScore: 68,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 70, reason: '一般。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 60, reason: '缺少参数说明。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 74, reason: 'DBA 场景可用。' },
    ],
    expertScore: 58,
    expertConclusion: '不通过',
    expertDimensions: [
      { dimensionId: 'ex-1', dimensionName: '功能完整性', score: 60, reason: '边界未覆盖。' },
      { dimensionId: 'ex-2', dimensionName: '工程质量', score: 55, reason: '缺乏测试。' },
      { dimensionId: 'ex-3', dimensionName: '业务价值', score: 59, reason: '价值有限。' },
    ],
    badges: [],
    qualityMark: null,
    publishTaskId: null,
    comments: [
      {
        id: 'cm-1004-1',
        type: 'review',
        submitter: '林娜（linna）',
        submitterId: 'linna',
        content: '边界未覆盖，缺少测试用例，暂不建议发布。',
        status: 'rejected',
        createdAt: '2026-07-16 11:30',
        isMine: false,
      },
    ],
  },
  {
    id: 'sk-1005',
    name: 'K8s 巡检 Skill',
    version: 'v3.0.1',
    description: '一键巡检 Kubernetes 集群健康度并输出报告。',
    author: '周婷',
    authorId: 'zhouting',
    deptPath: '部门1 / 数据产品线 / 数据库运营部 / SQL治理组',
    downloads: 3210,
    totalAccess: 24800,
    aiScore: 94,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 95, reason: '结构清晰。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 93, reason: '文档完整。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 94, reason: '运维必备。' },
    ],
    expertScore: 97,
    expertConclusion: '通过',
    expertDimensions: [
      { dimensionId: 'ex-1', dimensionName: '功能完整性', score: 97, reason: '覆盖全面。' },
      { dimensionId: 'ex-2', dimensionName: '工程质量', score: 96, reason: '健壮性好。' },
      { dimensionId: 'ex-3', dimensionName: '业务价值', score: 98, reason: '巡检提效明显。' },
    ],
    badges: ['金牌 Skill', '标杆案例', '高复用'],
    qualityMark: '强推',
    publishTaskId: 'task-2026-007',
    comments: [
      {
        id: 'cm-1005-1',
        type: 'review',
        submitter: '当前管理员',
        submitterId: 'admin',
        content: '巡检能力强，已发起一键发布到组织。',
        status: 'closed',
        createdAt: '2026-07-18 09:30',
        isMine: true,
      },
      {
        id: 'cm-1005-2',
        type: 'publish',
        submitter: '当前管理员',
        submitterId: 'admin',
        content: '一键发布到组织：扶摇 IT 装备部组织，等待 owner 确认。',
        status: 'processing',
        createdAt: '2026-07-18 09:35',
        isMine: true,
        publishTaskId: 'task-2026-007',
      },
    ],
  },
  {
    id: 'sk-1006',
    name: '会议纪要整理 Skill',
    version: 'v1.2.0',
    description: '从会议录音转写文本生成结构化纪要与待办。',
    author: '吴芳',
    authorId: 'wufang',
    deptPath: '部门1 / 数据产品线 / 数据库运营部 / SQL治理组',
    downloads: 720,
    totalAccess: 3100,
    aiScore: 82,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 84, reason: '规范良好。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 80, reason: '示例可补充。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 82, reason: '办公场景通用。' },
    ],
    expertScore: null,
    expertConclusion: '待评审',
    expertDimensions: [],
    badges: ['高复用'],
    qualityMark: null,
    publishTaskId: null,
    comments: [],
  },
  {
    id: 'sk-1007',
    name: 'API 文档自动生成',
    version: 'v2.4.3',
    description: '解析代码注释生成 OpenAPI 3 文档与 Mock 服务。',
    author: '郑伟',
    authorId: 'zhengwei',
    deptPath: '云核装备经营管理部 / 智能终端产品部 / 云服务组 / SRE团队',
    downloads: 1850,
    totalAccess: 11200,
    aiScore: 89,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 90, reason: '结构清晰。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 88, reason: '文档详尽。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 89, reason: '研发通用。' },
    ],
    expertScore: 90,
    expertConclusion: '通过',
    expertDimensions: [
      { dimensionId: 'ex-1', dimensionName: '功能完整性', score: 91, reason: '覆盖完整。' },
      { dimensionId: 'ex-2', dimensionName: '工程质量', score: 89, reason: '测试充分。' },
      { dimensionId: 'ex-3', dimensionName: '业务价值', score: 90, reason: '研发提效明显。' },
    ],
    badges: ['金牌 Skill'],
    qualityMark: '推荐',
    publishTaskId: null,
    comments: [
      {
        id: 'cm-1007-1',
        type: 'review',
        submitter: '陈刚（chengang）',
        submitterId: 'chengang',
        content: '研发通用性高，已确认纳入组织资产。',
        status: 'closed',
        createdAt: '2026-07-17 15:20',
        isMine: false,
      },
    ],
  },
  {
    id: 'sk-1008',
    name: '漏洞依赖扫描 Skill',
    version: 'v0.8.1',
    description: '扫描项目依赖并匹配 CVE 库给出修复建议。',
    author: '黄磊',
    authorId: 'huanglei',
    deptPath: '云核装备经营管理部 / 智能终端产品部 / 云服务组 / SRE团队',
    downloads: 410,
    totalAccess: 950,
    aiScore: 71,
    aiDimensions: [
      { dimensionId: 'ai-1', dimensionName: '代码规范', score: 72, reason: '一般。' },
      { dimensionId: 'ai-2', dimensionName: '文档完整度', score: 68, reason: '说明不足。' },
      { dimensionId: 'ai-3', dimensionName: '复用价值', score: 73, reason: '安全场景可用。' },
    ],
    expertScore: null,
    expertConclusion: '待评审',
    expertDimensions: [],
    badges: [],
    qualityMark: null,
    publishTaskId: null,
    comments: [],
  },
];

export const mockPublishTasks: PublishTask[] = [
  {
    id: 'task-2026-006',
    taskName: '运维部 · 第 6 批发布到组织',
    targetOrgId: 'org-fuyao-it',
    targetOrgName: '扶摇 IT 装备部组织',
    orgOwner: '张三（zhangsan）',
    status: 'approved',
    skills: [
      { id: 'sk-980', name: '磁盘容量预测 Skill', version: 'v1.4.0', author: '周婷' },
      { id: 'sk-982', name: '告警降噪 Skill', version: 'v2.0.1', author: '赵敏' },
    ],
    createdAt: '2026-07-10 11:20',
    completedAt: '2026-07-11 16:42',
    creator: 'A10023',
    approvalComment: '已确认发布，纳入组织资产。',
  },
  {
    id: 'task-2026-007',
    taskName: '运维部 · 第 7 批发布到组织',
    targetOrgId: 'org-fuyao-it',
    targetOrgName: '扶摇 IT 装备部组织',
    orgOwner: '张三（zhangsan）',
    status: 'pending_owner',
    skills: [
      { id: 'sk-1005', name: 'K8s 巡检 Skill', version: 'v3.0.1', author: '周婷' },
    ],
    createdAt: '2026-07-18 09:35',
    completedAt: null,
    creator: 'A10023',
    approvalComment: null,
  },
  {
    id: 'task-2026-005',
    taskName: '应用二部 · 第 5 批发布到组织',
    targetOrgId: 'org-platform',
    targetOrgName: '平台开发部组织',
    orgOwner: '李四（lisi）',
    status: 'rejected',
    skills: [
      { id: 'sk-970', name: '代码评审助手', version: 'v1.1.0', author: '孙强' },
    ],
    createdAt: '2026-07-05 14:10',
    completedAt: '2026-07-06 10:05',
    creator: 'A10087',
    approvalComment: '该 Skill 缺少测试，请补充后重新发起。',
  },
];

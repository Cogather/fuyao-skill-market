export type ReviewRankingCard = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type ReviewTaskCard = {
  id: string;
  skillId: string;
  name: string;
  owner: string;
  ownerName: string;
  ownerUser: string;
  version?: string;
  team: string;
  departmentL6: string;
  tags: string;
  usage: string;
  downloads: string;
  expertScore: string;
  hasReviewed: boolean;
  overallScore: number | null;
  dimensionId: string;
  dimensionName: string;
  categoryId: string;
  categoryName: string;
};

export type ComputeChannelRow = {
  name: string;
  id: string;
  type: string;
  status: string;
};

export type MedalLeaderboardRow = {
  name: string;
  owner: string;
  count: number;
  medals: string[];
};

export type ReviewDimensionDetail = {
  score: number;
  summary: string;
  checks: string[];
  placeholder: string;
};

export type ReviewHistoryRecord = {
  id: string;
  reviewVersion?: string;
  reviewType?: 'AI评审' | '专家评审';
  reviewer: string;
  reviewedAt: string;
  summary: string;
  medals: string[];
  totalScore?: number;
  scores: {
    dimension: string;
    score: number;
    suggestion: string;
  }[];
};

export const mockReviewRankingCards: ReviewRankingCard[] = [
  {
    title: '季度嘉奖实时榜单',
    columns: ['名称', '作者', '评分', '使用量', '排名'],
    rows: [
      ['会议助手', '张三', '4.9', '18,888', '1'],
      ['接口 Mock 生成', '李四', '4.8', '9,236', '2'],
      ['SQL 巡检', '王五', '4.7', '7,604', '3'],
    ],
  },
  {
    title: '5月榜单 TOP 20',
    columns: ['名称', '作者', 'AI得分', '专家评审得分'],
    rows: [
      ['日志分析 Skill', '赵六', '92', '96'],
      ['需求拆解 Skill', '陈七', '89', '待评'],
      ['日报生成 Skill', '周八', '88', '91'],
    ],
  },
  {
    title: '今日新锐榜',
    columns: ['名称', '作者', 'AI得分', '专家评审得分'],
    rows: [
      ['测试用例评审', '吴九', '91', '94'],
      ['知识库巡检', '郑十', '86', '待评'],
      ['CI/CD 发布检查', '钱一', '84', '90'],
    ],
  },
  {
    title: '实时使用量榜单',
    columns: ['名称', '作者', '使用量', '专家评审得分'],
    rows: [
      ['test2 Skill', '张三', '18,888', '95'],
      ['会议助手', '李四', '12,045', '待评'],
      ['接口 Mock 生成', '王五', '9,236', '92'],
    ],
  },
];

const MOCK_REVIEW_TASK_NAMES = [
  'test2 Skill',
  '测试用例评审 Skill',
  '接口 Mock 生成 Skill',
  '会议助手 Skill',
  '日志分析 Skill',
  '需求拆解 Skill',
  '日报生成 Skill',
  'SQL 巡检 Skill',
  '知识库巡检 Skill',
  'CI/CD 发布检查 Skill',
  '代码审查助手 Skill',
  '缺陷归因分析 Skill',
  '发布回滚预案 Skill',
  '配置漂移检测 Skill',
  '依赖漏洞扫描 Skill',
  '性能压测编排 Skill',
  '文档同步生成 Skill',
  '告警降噪规则 Skill',
  '工单自动分派 Skill',
  '数据脱敏校验 Skill',
];

const MOCK_REVIEW_OWNERS = ['张三', '李四', '王五', '赵六', '陈七', '周八', '吴九', '郑十'];

const MOCK_REVIEW_TEAMS = [
  '平台工具部',
  '质量工具组',
  '联调工具部',
  '研发效能部',
  '数据平台部',
  '运维保障部',
  '安全合规部',
];

const MOCK_REVIEW_BUSINESS_CATEGORIES = [
  {
    dimensionId: 'SYSTEM_DESIGN',
    dimensionName: '系统设计',
    categoryId: 'SYSTEM_DESIGN_REVIEW',
    categoryName: '设计评审',
    tags: ['系统设计', '#review', '#design'],
  },
  {
    dimensionId: 'SYSTEM_DESIGN',
    dimensionName: '系统设计',
    categoryId: 'SYSTEM_DESIGN_INTERFACE',
    categoryName: '接口设计',
    tags: ['系统设计', '#api', '#spec'],
  },
  {
    dimensionId: 'DEVELOPMENT',
    dimensionName: '开发实现',
    categoryId: 'DEVELOPMENT_CODE_REVIEW',
    categoryName: '代码评审',
    tags: ['开发实现', '#review', '#code'],
  },
  {
    dimensionId: 'DEVELOPMENT',
    dimensionName: '开发实现',
    categoryId: 'DEVELOPMENT_API',
    categoryName: '接口开发',
    tags: ['开发实现', '#mock', '#api'],
  },
  {
    dimensionId: 'TEST_VERIFICATION',
    dimensionName: '测试验证',
    categoryId: 'TEST_VERIFICATION_CASE',
    categoryName: '用例生成',
    tags: ['测试验证', '#test', '#case'],
  },
  {
    dimensionId: 'TEST_VERIFICATION',
    dimensionName: '测试验证',
    categoryId: 'TEST_VERIFICATION_REGRESSION',
    categoryName: '回归分析',
    tags: ['测试验证', '#review', '#regression'],
  },
  {
    dimensionId: 'OPS_OPERATION',
    dimensionName: '运维运营',
    categoryId: 'OPS_OPERATION_LOG',
    categoryName: '日志分析',
    tags: ['运维运营', '#log', '#ops'],
  },
  {
    dimensionId: 'OPS_OPERATION',
    dimensionName: '运维运营',
    categoryId: 'OPS_OPERATION_INCIDENT',
    categoryName: '故障复盘',
    tags: ['运维运营', '#incident', '#ops'],
  },
] as const;

export const mockReviewTaskCards: ReviewTaskCard[] = MOCK_REVIEW_TASK_NAMES.map((name, index) => {
  const usage = 12 + ((index * 17) % 180);
  const downloads = 3 + ((index * 11) % 96);
  const hasReviewed = index % 3 !== 1;
  const overallScore = hasReviewed
    ? Math.min(100, Math.round((72 + ((index * 5) % 24) + 6) * 10) / 10)
    : null;
  const owner = MOCK_REVIEW_OWNERS[index % MOCK_REVIEW_OWNERS.length] ?? '未知';
  const team = MOCK_REVIEW_TEAMS[index % MOCK_REVIEW_TEAMS.length] ?? '未知部门';
  const category =
    MOCK_REVIEW_BUSINESS_CATEGORIES[index % MOCK_REVIEW_BUSINESS_CATEGORIES.length] ??
    MOCK_REVIEW_BUSINESS_CATEGORIES[0];
  const skillId = `review-skill-${10002 + index}`;

  return {
    id: `u${10002 + index}`,
    skillId,
    name,
    owner,
    ownerName: owner,
    ownerUser: owner,
    team,
    departmentL6: team,
    tags: category.tags.join(','),
    usage: String(usage),
    downloads: String(downloads),
    hasReviewed,
    overallScore,
    expertScore: hasReviewed && overallScore != null ? String(overallScore) : '待评',
    dimensionId: category.dimensionId,
    dimensionName: category.dimensionName,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
  };
});

export const mockReviewScoreTabs = ['结构详情', '效果评分', '反馈评分', '影响评分', '专家评审'];

export const mockReviewComputeChannels: ComputeChannelRow[] = [
  { name: '张三', id: 'z00123456', type: '标准算力', status: '启用' },
  { name: '李四', id: 'l30012345', type: '无限 token', status: '启用' },
  { name: '王五', id: 'w10088991', type: '低延迟', status: '暂停' },
];

export const mockReviewComputeChannelTypes = ['标准算力', '无限 token'];

export const mockReviewMedalRows: MedalLeaderboardRow[] = [
  { name: '会议助手', owner: '张三', count: 5, medals: ['月度勋章', '专业勋章'] },
  { name: '日志分析 Skill', owner: '李四', count: 4, medals: ['新锐勋章', '专业勋章'] },
  { name: '接口 Mock 生成', owner: '王五', count: 3, medals: ['月度勋章'] },
];

export const mockReviewMedalAwardTypes = ['月度勋章', '专业勋章', '新锐勋章'];

export const mockReviewDimensionDetails: Record<string, ReviewDimensionDetail> = {
  边界覆盖维度: {
    score: 86,
    summary: '检查 Skill 是否覆盖主要业务边界、异常输入和权限限制。',
    checks: ['核心使用场景完整', '异常输入处理明确', '权限与数据范围有说明'],
    placeholder: '填写边界覆盖情况、遗漏场景和需要补充的边界条件',
  },
  指令具体性维度: {
    score: 91,
    summary: '检查 Skill 指令是否清晰、可复现，是否减少执行歧义。',
    checks: ['目标描述具体', '输入输出格式明确', '步骤顺序清晰'],
    placeholder: '填写指令具体性评价、模糊描述和推荐改写建议',
  },
  可执行性维度: {
    score: 83,
    summary: '检查 Skill 是否具备稳定执行所需的依赖、参数和失败兜底。',
    checks: ['依赖说明完整', '参数示例可直接复用', '失败处理路径明确'],
    placeholder: '填写可执行性评价、阻塞点和落地风险',
  },
  场景匹配维度: {
    score: 88,
    summary: '检查 Skill 与目标业务场景、目标用户和交付流程的匹配程度。',
    checks: ['目标人群清楚', '业务流程匹配', '结果能直接用于交付'],
    placeholder: '填写场景匹配评价、适用范围和不适用场景',
  },
  总体评价: {
    score: 90,
    summary: '综合各维度评分、使用数据和专家意见，给出最终评价与授奖建议。',
    checks: ['综合评分达标', '具备复用价值', '可进入月度评优候选'],
    placeholder: '输入总体评价、授奖理由与后续改进建议',
  },
};

export const mockReviewMedalOptions = ['test1', 'test2', 'test3'];

export const mockReviewGreenChannelOptions = [
  '不开通绿色通道',
  '开通算力绿色通道',
  '开通 Token 绿色通道',
];

export const mockOverallReviewDimension = '总体评价';

export const mockReviewHistoryRecords: ReviewHistoryRecord[] = [
  {
    id: 'ai-review-20260519',
    reviewVersion: 'v1.3',
    reviewType: 'AI评审',
    reviewer: 'AI 评审引擎',
    reviewedAt: '2026-05-19 10:20',
    summary: 'TRACE 自动评测显示文档结构、任务边界和异常处理较完整，整体质量达到专家复核门槛。',
    medals: [],
    totalScore: 90.8,
    scores: [
      { dimension: '可信任度', score: 90, suggestion: '补齐中文说明和权限边界。' },
      { dimension: '可靠性', score: 92, suggestion: '继续保持失败恢复路径说明。' },
      { dimension: '适用性', score: 90, suggestion: '增加不适用场景示例。' },
      { dimension: '规范性', score: 88, suggestion: '精简主文档密集段落。' },
      { dimension: '有效性', score: 94, suggestion: '沉淀更多可复用执行样例。' },
    ],
  },
  {
    id: 'review-20260519',
    reviewVersion: 'v1.3',
    reviewType: '专家评审',
    reviewer: '专家 A',
    reviewedAt: '2026-05-19 14:30',
    summary: '整体可复用性较好，边界说明和失败兜底还可以继续补齐。',
    medals: ['test1'],
    totalScore: 85,
    scores: [
      {
        dimension: '边界覆盖维度',
        score: 82,
        suggestion: '补充权限异常、空输入和批量任务超时后的处理说明。',
      },
      {
        dimension: '指令具体性维度',
        score: 88,
        suggestion: '把输入文件格式、输出字段和执行顺序写成固定模板。',
      },
      {
        dimension: '可执行性维度',
        score: 80,
        suggestion: '增加依赖环境、失败重试和回滚步骤的明确描述。',
      },
      {
        dimension: '场景匹配维度',
        score: 86,
        suggestion: '说明适合平台工具场景，不适合强实时链路的限制。',
      },
      {
        dimension: '总体评价',
        score: 85,
        suggestion: '建议完善异常样例后进入月度评优候选。',
      },
    ],
  },
  {
    id: 'ai-review-20260512',
    reviewVersion: 'v1.2',
    reviewType: 'AI评审',
    reviewer: 'AI 评审引擎',
    reviewedAt: '2026-05-12 09:05',
    summary: 'AI 评测认为指令具体性较好，但边界覆盖和场景适配仍存在补充空间。',
    medals: [],
    totalScore: 88.2,
    scores: [
      { dimension: '可信任度', score: 87, suggestion: '补充敏感数据处理边界。' },
      { dimension: '可靠性', score: 89, suggestion: '增加失败重试说明。' },
      { dimension: '适用性', score: 88, suggestion: '限定目标用户和适用流程。' },
      { dimension: '规范性', score: 86, suggestion: '统一目录和示例命名。' },
      { dimension: '有效性', score: 93, suggestion: '保留当前任务拆解方式。' },
    ],
  },
  {
    id: 'review-20260512',
    reviewVersion: 'v1.2',
    reviewType: '专家评审',
    reviewer: '专家 B',
    reviewedAt: '2026-05-12 10:15',
    summary: '指令清晰度提升明显，场景边界仍需要更具体的反例。',
    medals: [],
    totalScore: 83,
    scores: [
      {
        dimension: '边界覆盖维度',
        score: 78,
        suggestion: '补充不支持场景，避免被误用到跨部门敏感数据处理。',
      },
      {
        dimension: '指令具体性维度',
        score: 90,
        suggestion: '保留当前步骤拆解方式，并增加一组最小输入示例。',
      },
      {
        dimension: '可执行性维度',
        score: 84,
        suggestion: '给出本地执行、CI 执行两套参数示例。',
      },
      {
        dimension: '场景匹配维度',
        score: 81,
        suggestion: '把目标用户限定到平台工具研发和测试协同场景。',
      },
      {
        dimension: '总体评价',
        score: 83,
        suggestion: '建议先完成边界补充，再考虑授予个人勋章。',
      },
    ],
  },
];

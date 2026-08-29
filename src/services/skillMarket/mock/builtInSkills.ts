import type { Skill } from '../../../types/skill';

type ExtraMockSkillSeed = {
  name: string;
  description: string;
  publishName: string;
  createdBy: string;
  publishLevel: '个人级' | '组织级';
  deptName: string;
  downloads: number;
  category: string;
  icon: string;
  version: string;
  tags: string[];
  qualityBadges?: string[];
  ownedByUser?: boolean;
  /** 与真实联调一致时可传换行路径串或路径数组；不传则走 mock 默认数组 */
  fileTree?: string | string[];
  /** 与真实联调一致时可传接口原文 SKILL.md；不传则由 mock 用元数据拼装 */
  skillMdContent?: string;
};

const EXTRA_MOCK_SKILL_SEEDS: ExtraMockSkillSeed[] = [
  {
    name: '会议助手',
    description: '会议议程整理与纪要草稿（内置真实接口风格的 fileTree 换行字符串示例）',
    publishName: 'xxx_个人发布商',
    createdBy: 'u10081',
    publishLevel: '个人级',
    deptName: '部门1/办公产品线/协作工具部',
    downloads: 56,
    category: '公共',
    icon: 'MT',
    version: '1.0.0',
    tags: ['meeting', 'notes'],
    ownedByUser: true,
    fileTree: '会议助手/\n会议助手/script/main.py',
    skillMdContent:
      '# 会议助手（Mock 接口原文 skillMdContent）\n\n本段模拟后端直接返回的 SKILL.md 正文，用于确认详情区未再走本地拼装。',
  },
  {
    name: '日志分析 Skill',
    description: '自动解析运行日志并输出异常摘要',
    publishName: 'SRE团队',
    createdBy: 'u10086',
    publishLevel: '组织级',
    deptName: '部门1/SRE产品线/平台稳定部/日志工具组',
    downloads: 128,
    category: '运维',
    icon: 'LA',
    version: '1.0.0',
    tags: ['log', 'ops'],
    ownedByUser: true,
    fileTree:
      'log-analyzer-skill/\nlog-analyzer-skill/SKILL.md\nlog-analyzer-skill/parsers/syslog.py\nlog-analyzer-skill/rules/default.yaml',
    skillMdContent:
      '# 日志分析 Skill（Mock 原文）\n\n- 树：`log-analyzer-skill/…` 多文件\n- 本卡片 SKILL.md 与「会议助手」文案不同，便于肉眼区分字段数据。',
  },
  {
    name: '接口 Mock 生成 Skill',
    description: '根据接口文档生成 Mock 数据和联调样例',
    publishName: 'xxx_个人发布商',
    createdBy: 'u10082',
    publishLevel: '个人级',
    deptName: '部门1/API产品线/联调工具部',
    downloads: 236,
    category: '开发',
    icon: 'MO',
    version: '1.1.0',
    tags: ['mock', 'api'],
    ownedByUser: true,
    fileTree:
      'api-mock-skill/\napi-mock-skill/SKILL.md\napi-mock-skill/openapi/petstore.yaml\napi-mock-skill/fixtures/200.json',
    skillMdContent:
      '# 接口 Mock 生成 Skill（Mock 原文）\n\n说明：目录含 `openapi` 与 `fixtures`，与日志类 Skill 的树形列表明显不同。',
  },
  {
    name: '测试用例评审 Skill',
    description: '检查测试用例覆盖范围并给出评审建议',
    publishName: '质量工具组',
    createdBy: 'u10091',
    publishLevel: '组织级',
    deptName: '部门1/质量产品线/质量工具组/评审小组',
    downloads: 86,
    category: '测试',
    icon: 'QA',
    version: '1.0.2',
    tags: ['review', 'test'],
    fileTree:
      'test-review-skill/\ntest-review-skill/SKILL.md\ntest-review-skill/checklists/coverage.md\ntest-review-skill/rubric/score.csv',
    skillMdContent:
      '# 测试用例评审 Skill（Mock 原文）\n\n侧重用例覆盖与评审清单；`skillMdContent` 独立成段以便列表/详情对照。',
  },
  {
    name: '日报生成 Skill',
    description: '汇总项目进展并生成团队日报',
    publishName: 'xxx_个人发布商',
    createdBy: 'u10083',
    publishLevel: '个人级',
    deptName: '部门1/项目产品线/项目管理部',
    downloads: 64,
    category: '项目管理',
    icon: 'DR',
    version: '0.9.0',
    tags: ['report'],
    ownedByUser: true,
    fileTree:
      'daily-report-skill/\ndaily-report-skill/SKILL.md\ndaily-report-skill/templates/morning.md\ndaily-report-skill/assets/logo.png',
    skillMdContent:
      '# 日报生成 Skill（Mock 原文）\n\n树中含 `templates` 与 `assets`；正文仅作字段样例，不代表真实生成逻辑。',
  },
  {
    name: 'CI/CD 发布检查 Skill',
    description: '发布前检查流水线、镜像和配置项风险',
    publishName: 'DevOps组',
    createdBy: 'u10092',
    publishLevel: '组织级',
    deptName: '部门1/平台产品线/DevOps部/发布工具组',
    downloads: 312,
    category: '运维',
    icon: 'CI',
    version: '1.3.1',
    tags: ['cicd', 'release', 'ops'],
    qualityBadges: ['优秀', '复用', '稳定'],
    ownedByUser: true,
    fileTree:
      'cicd-check-skill/\ncicd-check-skill/SKILL.md\ncicd-check-skill/pipelines/validate.sh\ncicd-check-skill/policy/gates.yaml\ncicd-check-skill/helm/values.yaml',
    skillMdContent:
      '# CI/CD 发布检查 Skill（Mock 原文）\n\n目录强调 `pipelines`、`policy`、`helm`；与日报类目录结构区分。',
  },
  {
    name: '需求拆解 Skill',
    description: '辅助将业务需求拆解为研发任务清单',
    publishName: '业务运营组',
    createdBy: 'u10093',
    publishLevel: '组织级',
    deptName: '部门1/业务产品线/业务运营部/需求分析组',
    downloads: 53,
    category: '研究',
    icon: 'RD',
    version: '1.0.1',
    tags: ['design', 'requirement'],
    fileTree:
      'req-breakdown-skill/\nreq-breakdown-skill/SKILL.md\nreq-breakdown-skill/docs/epic-template.md\nreq-breakdown-skill/tasks/backlog.json',
    skillMdContent:
      '# 需求拆解 Skill（Mock 原文）\n\n`docs` + `tasks` 路径组合；正文标识本 Skill 独立数据源。',
  },
  {
    name: 'SQL 巡检 Skill',
    description: '扫描 SQL 风险并给出优化建议',
    publishName: '数据库运营',
    createdBy: 'u10094',
    publishLevel: '组织级',
    deptName: '部门1/数据产品线/数据库运营部/SQL治理组',
    downloads: 97,
    category: '维护',
    icon: 'SQL',
    version: '2.1.0',
    tags: ['sql', 'ops'],
    qualityBadges: ['优秀', '高分', '推荐'],
    fileTree:
      'sql-audit-skill/\nsql-audit-skill/SKILL.md\nsql-audit-skill/rules/risk-patterns.sql\nsql-audit-skill/samples/slow-query.log',
    skillMdContent:
      '# SQL 巡检 Skill（Mock 原文）\n\n树中含 `rules` 与 `samples`；用于和「需求拆解」等树结构对照。',
  },
  {
    name: '交互文案检查 Skill',
    description: '检查页面文案一致性和可读性',
    publishName: 'xxx_个人发布商',
    createdBy: 'u10084',
    publishLevel: '个人级',
    deptName: '部门1/设计产品线/体验设计部',
    downloads: 41,
    category: '设计',
    icon: 'UX',
    version: '0.8.5',
    tags: ['design'],
    ownedByUser: true,
    fileTree:
      'ux-copy-skill/\nux-copy-skill/SKILL.md\nux-copy-skill/locales/zh-CN/strings.json\nux-copy-skill/locales/en-US/strings.json',
    skillMdContent:
      '# 交互文案检查 Skill（Mock 原文）\n\n多语言 `locales` 目录；SKILL.md 正文与 SQL 类明显不同。',
  },
  {
    name: '变更影响分析 Skill',
    description: '根据变更内容推断影响系统和回归范围',
    publishName: '平台工具组',
    createdBy: 'u10095',
    publishLevel: '组织级',
    deptName: '部门1/平台产品线/平台工具组/变更分析组',
    downloads: 174,
    category: '维护',
    icon: 'CH',
    version: '1.2.3',
    tags: ['impact', 'release'],
    fileTree:
      'change-impact-skill/\nchange-impact-skill/SKILL.md\nchange-impact-skill/graph/services.dot\nchange-impact-skill/reports/blast-radius.md',
    skillMdContent:
      '# 变更影响分析 Skill（Mock 原文）\n\n树中含 `graph` 与 `reports`；验证详情区读取接口 `skillMdContent`。',
  },
  {
    name: '面向多端多场景的智能报表与数据可视化自动化生成及一键导出 Skill',
    description:
      '面向多端多场景的智能报表与数据可视化自动化生成及一键导出 Skill，支持多种数据源接入、动态字段映射、跨端渲染以及一键导出为 Excel/PDF/图片等多种格式的完整解决方案。',
    publishName: '数据可视化平台研发组',
    createdBy: 'u10095',
    publishLevel: '组织级',
    deptName: '部门1/数据产品线/数据可视化平台研发部/报表工具组',
    downloads: 145,
    category: '开发',
    icon: 'RV',
    version: '2.4.3',
    tags: ['report', 'visualization', 'export'],
    qualityBadges: ['优秀', '复用'],
    fileTree:
      'report-viz-skill/\nreport-viz-skill/SKILL.md\nreport-viz-skill/charts/render.py\nreport-viz-skill/export/excel.py',
    skillMdContent: '# 面向多端多场景的智能报表与数据可视化自动化生成及一键导出 Skill（长名称样例）',
  },
  {
    name: '基于大语言模型的代码审查与安全漏洞智能检测及自动修复建议生成 Skill',
    description:
      '基于大语言模型的代码审查与安全漏洞智能检测及自动修复建议生成 Skill，能够自动扫描多种编程语言代码库，识别潜在安全漏洞、代码规范问题和性能瓶颈，并生成详细的修复建议和重构方案。',
    publishName: '安全工程效能工具组',
    createdBy: 'u10096',
    publishLevel: '组织级',
    deptName: '部门1/安全产品线/安全工程效能部/代码审计工具组',
    downloads: 278,
    category: '测试',
    icon: 'CR',
    version: '1.7.0',
    tags: ['security', 'review', 'llm'],
    qualityBadges: ['稳定'],
    fileTree:
      'code-review-skill/\ncode-review-skill/SKILL.md\ncode-review-skill/scanners/sast.py\ncode-review-skill/rules/owasp.yaml',
    skillMdContent: '# 基于大语言模型的代码审查与安全漏洞智能检测及自动修复建议生成 Skill（长名称样例）',
  },
  {
    name: '跨云资源编排与成本优化及容量规划智能调度 Skill',
    description:
      '跨云资源编排与成本优化及容量规划智能调度 Skill，支持 AWS/阿里云/腾讯云多租户资源统一编排，基于历史负载自动预测容量需求并生成最优调度策略，实现降本增效。',
    publishName: '多云平台运营组',
    createdBy: 'u10097',
    publishLevel: '组织级',
    deptName: '部门2/云平台产品线/多云运营部/成本优化组',
    downloads: 92,
    category: '运维',
    icon: 'CO',
    version: '3.0.1',
    tags: ['cloud', 'cost', 'ops'],
    fileTree:
      'cloud-orchestration-skill/\ncloud-orchestration-skill/SKILL.md\ncloud-orchestration-skill/predict/cost.py',
    skillMdContent: '# 跨云资源编排与成本优化及容量规划智能调度 Skill（长名称样例）',
  },
  {
    name: '这是一段非常非常非常非常非常非常非常非常非常非常非常长的Skill名称用来验证名称超出宽度后是否正确显示省略号以及鼠标悬浮时是否提示完整名称内容',
    description:
      '这是一段非常非常非常非常非常非常非常非常非常非常非常长的Skill描述用来验证描述超出宽度后是否正确显示省略号以及鼠标悬浮时是否提示完整描述内容',
    publishName: '前端验证测试组',
    createdBy: 'u10098',
    publishLevel: '组织级',
    deptName: '部门1/测试产品线/前端验证部/超长文本测试组',
    downloads: 10,
    category: '测试',
    icon: 'TT',
    version: '1.0.0',
    tags: ['test', 'long-text'],
    fileTree: 'long-text-skill/\nlong-text-skill/SKILL.md',
    skillMdContent: '# 超长文本验证 Skill',
  },
  {
    name: '基于大语言模型与规则引擎融合的智能代码审查安全漏洞检测及自动修复建议生成一体化平台级Skill工具',
    description:
      '基于大语言模型与规则引擎融合的智能代码审查安全漏洞检测及自动修复建议生成一体化平台级Skill工具，支持多语言多框架全覆盖深度扫描',
    publishName: '安全工程效能组',
    createdBy: 'u10099',
    publishLevel: '组织级',
    deptName: '部门1/安全产品线/安全工程效能部/代码审计组',
    downloads: 33,
    category: '安全',
    icon: 'SE',
    version: '2.3.1',
    tags: ['security', 'llm', 'review'],
    fileTree: 'sec-review-skill/\nsec-review-skill/SKILL.md',
    skillMdContent: '# 安全审查 Skill',
  },
  {
    name: '面向全链路可观测性的日志指标链路追踪聚合分析根因定位及告警降噪智能运维一体化自动化Skill解决方案',
    description:
      '面向全链路可观测性的日志指标链路追踪聚合分析根因定位及告警降噪智能运维一体化自动化Skill解决方案，支持跨云多集群统一接入',
    publishName: 'SRE平台运营组',
    createdBy: 'u10100',
    publishLevel: '组织级',
    deptName: '部门2/SRE产品线/平台稳定部/可观测工具组',
    downloads: 57,
    category: '运维',
    icon: 'OB',
    version: '4.1.0',
    tags: ['observability', 'ops', 'trace'],
    fileTree: 'observability-skill/\nobservability-skill/SKILL.md',
    skillMdContent: '# 可观测性 Skill',
  },
];

function createExtraMockSkill(seed: ExtraMockSkillSeed, index: number): Skill {
  const seq = index + 4;
  const publishTime = `2024-05-${String(20 - index).padStart(2, '0')} ${String(10 + index).padStart(
    2,
    '0',
  )}:30`;
  const skill: Skill = {
    skill_id: `mock${seq}`,
    description: seed.description,
    publish_name: seed.publishName,
    publish_level: seed.publishLevel,
    owner_list: JSON.stringify([{ lastName: seed.publishName, Account: `mock${seq}` }]),
    download_count: seed.downloads,
    dept_name: seed.deptName,
    id: String(seq),
    name: seed.name,
    icon: seed.icon,
    publisher: seed.publishName,
    createdBy: seed.createdBy,
    latestPublishTime: publishTime,
    level: seed.publishLevel,
    downloads: seed.downloads,
    rating: 4.3 + (index % 5) * 0.1,
    version: seed.version,
    versions: [
      {
        version: seed.version,
        publishTime,
        note: '内置演示数据',
        packageFileName: `mock${seq}-v${seed.version}.zip`,
        packageSize: 120000 + index * 18000,
      },
    ],
    ownedByUser: seed.ownedByUser,
    tagFunctional: seed.category,
    tagOrg: seed.publishLevel,
    tags: seed.tags?.join(',') ?? '',
    qualityBadges: seed.qualityBadges,
  };
  if (seed.fileTree != null) {
    skill.fileTree = seed.fileTree;
  }
  if (seed.skillMdContent != null) {
    skill.skillMdContent = seed.skillMdContent;
  }
  return skill;
}

const GENERATED_MOCK_TOTAL = 202;
const BASE_MOCK_SKILL_COUNT = 3 + EXTRA_MOCK_SKILL_SEEDS.length;
const GENERATED_MOCK_SKILL_COUNT = Math.max(0, GENERATED_MOCK_TOTAL - BASE_MOCK_SKILL_COUNT);

const GENERATED_MOCK_NAMES = [
  '接口设计检查',
  '自动化巡检',
  '技术方案评审',
  '数据质量校验',
  '发布风险扫描',
  '日志聚类分析',
  '需求影响评估',
  '测试数据生成',
];

const GENERATED_MOCK_CATEGORIES = [
  '公共',
  '设计',
  '开发',
  '测试',
  '运维',
  '维护',
  '研究',
  '项目管理',
];
const GENERATED_MOCK_TAGS = [
  ['api', 'review', 'security'],
  ['design', 'requirement', 'ux', 'copy', 'flow'],
  ['cicd', 'release', 'ops'],
  ['test', 'sql', 'data', 'quality', 'report'],
  ['ops', 'log', 'alert'],
  ['impact', 'review', 'risk', 'change', 'scope'],
];
const GENERATED_MOCK_ORGS = ['IT装备部', '质量工具组', '平台工具组', '云服务组', 'SRE团队'];
const GENERATED_MOCK_DEPTS = [
  '部门1/API产品线/联调工具部/接口治理组',
  '部门1/质量产品线/质量工具组/评审小组',
  '部门1/平台产品线/平台工具组/自动化组',
  '部门1/SRE产品线/平台稳定部/日志工具组',
  '部门1/数据产品线/数据库运营部/SQL治理组',
  '部门1/项目产品线/项目管理部/交付管理组',
];
function formatGeneratedMockTime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function generatedMockPublishTime(index: number, dayOffset = 0, minuteOffset = 0): string {
  const date = new Date(2024, 5, (index % 28) + 1, 8 + (index % 12), 20, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setMinutes(date.getMinutes() + minuteOffset);
  return formatGeneratedMockTime(date);
}

function semverParts(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}

function createGeneratedVersionEntries(
  index: number,
  skillId: string,
  version: string,
  publisher: string,
  packageSizeBase: number,
): Skill['versions'] {
  const [major, minor, patch] = semverParts(version);
  const lowerLaterVersion =
    minor > 0
      ? `${major}.${minor - 1}.${(patch + 4 + (index % 3)) % 10}`
      : `${Math.max(0, major - 1)}.9.${9 - (index % 4)}`;
  const previousPatchVersion =
    patch > 0
      ? `${major}.${minor}.${patch - 1}`
      : minor > 0
        ? `${major}.${minor - 1}.${7 + (index % 3)}`
        : `${Math.max(0, major - 1)}.8.${index % 7}`;
  const firstVersion =
    minor > 1
      ? `${major}.${minor - 2}.${index % 4}`
      : major > 0
        ? `${major - 1}.8.${index % 4}`
        : `0.1.${index % 4}`;

  const rows = [
    {
      version,
      publishTime: generatedMockPublishTime(index),
      publisher,
      note: '批量 mock 当前版本',
      packageFileName: `${skillId}-v${version}.zip`,
      packageSize: packageSizeBase,
    },
    {
      version: lowerLaterVersion,
      publishTime: generatedMockPublishTime(index, 2, 17),
      publisher,
      note: '批量 mock：低版本号但更新时间更晚',
      packageFileName: `${skillId}-v${lowerLaterVersion}.zip`,
      packageSize: packageSizeBase - 7000,
    },
    {
      version: previousPatchVersion,
      publishTime: generatedMockPublishTime(index, -6, 9),
      publisher,
      note: '批量 mock 历史补丁版本',
      packageFileName: `${skillId}-v${previousPatchVersion}.zip`,
      packageSize: packageSizeBase - 14000,
    },
    {
      version: firstVersion,
      publishTime: generatedMockPublishTime(index, -18, 3),
      publisher,
      note: '批量 mock 首次发布版本',
      packageFileName: `${skillId}-v${firstVersion}.zip`,
      packageSize: packageSizeBase - 28000,
    },
  ];

  return rows.filter(
    (row, rowIndex, all) => all.findIndex((item) => item.version === row.version) === rowIndex,
  );
}

function latestGeneratedVersionTime(versions: NonNullable<Skill['versions']>): string {
  return versions.reduce(
    (latest, row) => (latest < row.publishTime ? row.publishTime : latest),
    versions[0]?.publishTime ?? '',
  );
}

function createGeneratedMockSkill(index: number): Skill {
  const seq = BASE_MOCK_SKILL_COUNT + index + 1;
  const nameBase = GENERATED_MOCK_NAMES[index % GENERATED_MOCK_NAMES.length];
  const category = GENERATED_MOCK_CATEGORIES[index % GENERATED_MOCK_CATEGORIES.length];
  const publishLevel = index % 3 === 0 ? '个人级' : '组织级';
  const publishName =
    publishLevel === '个人级'
      ? 'xxx_个人发布商'
      : GENERATED_MOCK_ORGS[index % GENERATED_MOCK_ORGS.length];
  const version = `1.${index % 8}.${index % 5}`;
  const tags =
    index === 55
      ? ['test', 'data', 'generate', 'fixture', 'mock', 'quality', 'case', 'automation']
      : GENERATED_MOCK_TAGS[index % GENERATED_MOCK_TAGS.length];
  const skillId = `mock-bulk-${String(seq).padStart(3, '0')}`;
  const packageSizeBase = 150000 + index * 1024;
  const versions = createGeneratedVersionEntries(
    index,
    skillId,
    version,
    publishName,
    packageSizeBase,
  );
  const latestPublishTime = latestGeneratedVersionTime(versions ?? []);

  return {
    skill_id: skillId,
    description: `${nameBase.repeat(6)}批量演示数据，用于验证 32/64/96/128/160 等分页节点的滚动懒加载稳定性，名称与描述均做了超长处理以验证省略号与悬浮提示效果`,
    publish_name: publishName,
    publish_level: publishLevel,
    owner_list: JSON.stringify([{ lastName: publishName, Account: `mock${seq}` }]),
    download_count: 20 + ((index * 17) % 380),
    dept_name: GENERATED_MOCK_DEPTS[index % GENERATED_MOCK_DEPTS.length],
    id: String(seq),
    name: `${nameBase.repeat(6)} Skill ${String(index + 1).padStart(3, '0')}`,
    icon: nameBase.slice(0, 2),
    publisher: publishName,
    createdBy: `u${String(20000 + index).padStart(5, '0')}`,
    latestPublishTime,
    level: publishLevel,
    downloads: 20 + ((index * 17) % 380),
    rating: 4.2 + (index % 8) * 0.08,
    version,
    versions,
    ownedByUser: publishLevel === '个人级',
    tagFunctional: category,
    tagOrg: publishLevel,
    tags: tags.join(','),
    fileTree: `${skillId}/\n${skillId}/SKILL.md\n${skillId}/src/main.py\n${skillId}/fixtures/sample.json`,
    skillMdContent: `# ${nameBase} Skill ${String(index + 1).padStart(3, '0')}\n\n批量 mock 数据，用于验证长列表分页加载。`,
  };
}

const BUILT_IN_MOCK_SKILLS: Skill[] = [
  {
    skill_id: 'test1',
    description: '生成测试时使用',
    publish_name: 'xxx_个人发布者',
    publish_level: '个人级',
    owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"x123456\"}]',
    download_count: 2,
    dept_name: '部门1/test2产品线/xxx部门/test5部门/test5部门/12345组',
    id: '1',
    name: 'test1',
    icon: '💡',
    publisher: 'xxx_个人发布者',
    createdBy: 'u10001',
    latestPublishTime: '2024-04-22 14:30',
    level: '个人级',
    downloads: 2,
    rating: 4.8,
    version: '1.2.0',
    versions: [
      {
        version: '1.2.0',
        publishTime: '2024-04-22 14:30',
        note: '初始上架',
        packageFileName: 'test1-v1.2.0.zip',
        packageSize: 164000,
      },
    ],
    tagFunctional: '测试',
    tagOrg: '个人级',
    tags: 'review,report',
    qualityBadges: ['优秀', '高分', '推荐'],
    fileTree:
      'test1-skill/\ntest1-skill/SKILL.md\ntest1-skill/cases/smoke.feature\ntest1-skill/config/env.yaml\ntest1-skill/assets/mock-preview.png',
    skillMdContent:
      '# test1（Mock 接口原文）\n\n内置联调用例包结构；与 test2、test3 的 `fileTree` / 正文均不同。',
  },
  {
    skill_id: 'test2',
    description: '生成个性化使用',
    publish_name: '平台工具部',
    publish_level: '组织级',
    owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"f23442265\"}]',
    download_count: 18888,
    dept_name: '部门1/test3产品线/xxx部门/测试部门/平台一部/平台工具部',
    id: '2',
    name: 'test2',
    icon: '🔧',
    publisher: '平台工具部',
    createdBy: 'u10002',
    latestPublishTime: '2026-04-22 14:30:00',
    level: '组织级',
    downloads: 18888,
    rating: 4.6,
    version: '2.0.1',
    versions: [
      {
        version: '2.0.1',
        publishTime: '2026-04-22 14:30:00',
        publisher: '开发一部',
        packageFileName: 'test2-v2.0.1.zip',
        packageSize: 216000,
      },
      {
        version: '1.2.0',
        publishTime: '2026-04-10 09:16:00',
        publisher: '开发一部',
        packageFileName: 'test2-v1.2.0.zip',
        packageSize: 198000,
      },
      {
        version: '1.1.0',
        publishTime: '2026-03-28 18:40:00',
        publisher: '历史维护人',
        unpublished: true,
        packageFileName: 'test2-v1.1.0.zip',
        packageSize: 175000,
      },
      {
        version: '1.0.0',
        publishTime: '2026-03-12 11:05:00',
        publisher: '历史维护人',
        unpublished: true,
        packageFileName: 'test2-v1.0.0.zip',
        packageSize: 160000,
      },
    ],
    tagFunctional: '开发',
    tagOrg: '组织级',
    tags: 'cicd,log,release,ops,monitor',
    qualityBadges: ['优秀', '复用', '稳定'],
    fileTree:
      'test2-skill/\ntest2-skill/SKILL.md\ntest2-skill/deploy/helm/values.yaml\ntest2-skill/deploy/chart.yaml\ntest2-skill/ci/Jenkinsfile',
    skillMdContent:
      '# test2（Mock 接口原文）\n\n' +
      '多版本历史 + deploy/ci 目录；正文用于与 test1 区分数据源。\n\n' +
      '## 长内容渲染压测\n\n' +
      '这份 SKILL.md 被刻意扩展为较长内容，用于验证右侧文件内容区域在内容溢出时是否出现内部滚动条，页面主滚动是否保持自然，左侧文件树是否保持在同一自适应高度容器内。\n\n' +
      '## 使用场景\n\n' +
      'test2 主要模拟平台工具部发布的组织级 Skill，关注 CI/CD、日志分析、发布检查、运维巡检和监控告警这些高频工程场景。\n\n' +
      '## 输入\n\n| 字段 | 类型 | 是否必填 | 说明 |\n| --- | --- | --- | --- |\n| repository | string | 是 | 仓库名称或仓库地址 |\n| branch | string | 是 | 当前发布分支 |\n| version | string | 是 | 目标发布版本 |\n| deployEnv | string | 否 | dev、test、stage、prod |\n\n' +
      Array.from({ length: 32 }, (_, index) =>
        [
          '## 长内容段落 ' + String(index + 1).padStart(2, '0'),
          '',
          '这是一段用于增加纵向长度的测试内容。它模拟真实 SKILL.md 中的规则说明、排障建议、执行记录和验收观察点。右侧内容区域应该在自身容器内滚动，左侧文件树保持独立滚动能力，页面主滚动只负责整体详情页。',
          '',
          '- 检查 deploy/helm/values.yaml 中的资源限制、探针配置和镜像标签。',
          '- 检查 ci/Jenkinsfile 中的测试、构建、制品上传和部署阶段。',
          '- 输出阻断项、警告项、建议项和可追踪的证据位置。',
          '- 验证长内容换行、内部滚动条和底部贴合表现。',
        ].join('\n'),
      ).join('\n\n') +
      '\n\n## 长路径样例\n\ntest2-skill/deploy/helm/templates/platform/runtime/checkpoints/release-validation/generated/configmap-release-observer.yaml\n\n## 结束\n\n这是 test2 的长内容 mock 结尾。',
  },
  {
    skill_id: 'test3',
    description: 'xxxxxxxxxxxx',
    publish_name: 'xxx_个人发布者',
    publish_level: '个人级',
    owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"xxxxxxxx\"}]',
    download_count: 2,
    dept_name: '部门1/test2产品线/xxx部门/test5部门/小部门',
    id: '3',
    name: 'test3',
    icon: '📋',
    publisher: 'xxx_个人发布者',
    createdBy: 'u10003',
    latestPublishTime: '2024-04-20 09:00',
    level: '个人级',
    downloads: 2,
    rating: 4.9,
    version: '1.0.3',
    versions: [
      {
        version: '1.0.3',
        publishTime: '2024-04-20 09:00',
        packageFileName: 'test3-v1.0.3.zip',
        packageSize: 122000,
      },
    ],
    tagFunctional: '公共',
    tagOrg: '个人级',
    tags: '',
    fileTree:
      'test3-skill/\ntest3-skill/SKILL.md\ntest3-skill/data/sample.xlsx\ntest3-skill/schema/fields.json',
    skillMdContent:
      '# test3（Mock 接口原文）\n\n最小标签 + `data`/`schema` 路径；验证列表项同样携带接口型字段。',
  },
  ...EXTRA_MOCK_SKILL_SEEDS.map(createExtraMockSkill),
  ...Array.from({ length: GENERATED_MOCK_SKILL_COUNT }, (_, index) =>
    createGeneratedMockSkill(index),
  ),
];

/** Mock 服务内置市场 Skill 列表（仅由 Mock 客户端加载，页面不直接引用） */
export function getBuiltInSkills(): Skill[] {
  return BUILT_IN_MOCK_SKILLS.map((s) => ({ ...s, versions: s.versions?.map((v) => ({ ...v })) }));
}

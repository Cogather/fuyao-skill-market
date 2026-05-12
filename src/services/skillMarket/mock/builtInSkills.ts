import type { Skill } from '../../../types/skill';

type ExtraMockSkillSeed = {
  name: string;
  description: string;
  publishName: string;
  publishLevel: '个人级' | '组织级';
  deptName: string;
  downloads: number;
  category: string;
  icon: string;
  version: string;
  tags: string[];
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
    publishLevel: '个人级',
    deptName: '部门1/办公产品线/协作工具部',
    downloads: 56,
    category: '作业类',
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
    publishLevel: '组织级',
    deptName: '部门1/SRE产品线/平台稳定部/日志工具组',
    downloads: 128,
    category: '工具类',
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
    publishLevel: '个人级',
    deptName: '部门1/API产品线/联调工具部',
    downloads: 236,
    category: '作业类',
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
    publishLevel: '组织级',
    deptName: '部门1/质量产品线/质量工具组/评审小组',
    downloads: 86,
    category: '业务类',
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
    publishLevel: '个人级',
    deptName: '部门1/项目产品线/项目管理部',
    downloads: 64,
    category: '作业类',
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
    publishLevel: '组织级',
    deptName: '部门1/平台产品线/DevOps部/发布工具组',
    downloads: 312,
    category: '工具类',
    icon: 'CI',
    version: '1.3.1',
    tags: ['cicd', 'release'],
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
    publishLevel: '组织级',
    deptName: '部门1/业务产品线/业务运营部/需求分析组',
    downloads: 53,
    category: '业务类',
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
    publishLevel: '组织级',
    deptName: '部门1/数据产品线/数据库运营部/SQL治理组',
    downloads: 97,
    category: '工具类',
    icon: 'SQL',
    version: '2.1.0',
    tags: ['sql', 'ops'],
    fileTree:
      'sql-audit-skill/\nsql-audit-skill/SKILL.md\nsql-audit-skill/rules/risk-patterns.sql\nsql-audit-skill/samples/slow-query.log',
    skillMdContent:
      '# SQL 巡检 Skill（Mock 原文）\n\n树中含 `rules` 与 `samples`；用于和「需求拆解」等树结构对照。',
  },
  {
    name: '交互文案检查 Skill',
    description: '检查页面文案一致性和可读性',
    publishName: 'xxx_个人发布商',
    publishLevel: '个人级',
    deptName: '部门1/设计产品线/体验设计部',
    downloads: 41,
    category: '业务类',
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
    publishLevel: '组织级',
    deptName: '部门1/平台产品线/平台工具组/变更分析组',
    downloads: 174,
    category: '作业类',
    icon: 'CH',
    version: '1.2.3',
    tags: ['impact', 'release'],
    fileTree:
      'change-impact-skill/\nchange-impact-skill/SKILL.md\nchange-impact-skill/graph/services.dot\nchange-impact-skill/reports/blast-radius.md',
    skillMdContent:
      '# 变更影响分析 Skill（Mock 原文）\n\n树中含 `graph` 与 `reports`；验证详情区读取接口 `skillMdContent`。',
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
  };
  if (seed.fileTree != null) {
    skill.fileTree = seed.fileTree;
  }
  if (seed.skillMdContent != null) {
    skill.skillMdContent = seed.skillMdContent;
  }
  return skill;
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
    tagFunctional: '作业类',
    tagOrg: '个人级',
    tags: 'review,report',
    fileTree: 'test1-skill/\ntest1-skill/SKILL.md\ntest1-skill/cases/smoke.feature\ntest1-skill/config/env.yaml',
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
    tagFunctional: '工具类',
    tagOrg: '组织级',
    tags: 'cicd,log',
    fileTree:
      'test2-skill/\ntest2-skill/SKILL.md\ntest2-skill/deploy/helm/values.yaml\ntest2-skill/deploy/chart.yaml\ntest2-skill/ci/Jenkinsfile',
    skillMdContent:
      '# test2（Mock 接口原文）\n\n多版本历史 + `deploy`/`ci` 目录；正文用于与 test1 区分数据源。',
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
    tagFunctional: '业务类',
    tagOrg: '个人级',
    tags: '',
    fileTree: 'test3-skill/\ntest3-skill/SKILL.md\ntest3-skill/data/sample.xlsx\ntest3-skill/schema/fields.json',
    skillMdContent:
      '# test3（Mock 接口原文）\n\n最小标签 + `data`/`schema` 路径；验证列表项同样携带接口型字段。',
  },
  ...EXTRA_MOCK_SKILL_SEEDS.map(createExtraMockSkill),
];

/** Mock 服务内置市场 Skill 列表（仅由 Mock 客户端加载，页面不直接引用） */
export function getBuiltInSkills(): Skill[] {
  return BUILT_IN_MOCK_SKILLS.map((s) => ({ ...s, versions: s.versions?.map((v) => ({ ...v })) }));
}

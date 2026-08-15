export type ExtensionCapabilityType = 'skill' | 'command' | 'agent';

export type ExtensionCapabilityFile = {
  name: string;
  content: string;
};

export type ExtensionCapability = {
  id: string;
  name: string;
  version: string;
  publishDate: string;
  ready: boolean;
  files: ExtensionCapabilityFile[];
};

export type ExtensionReleaseItem = {
  type: ExtensionCapabilityType;
  name: string;
  version: string;
};

export type ExtensionRelease = {
  /** 后端发布记录主键；mock 场景可不提供。 */
  id?: string;
  version: string;
  extensionName: string;
  description: string;
  channel: 'Beta' | 'Product';
  operator: { no: string; name: string };
  publishedAt: string;
  status: '成功' | '失败' | '进行中';
  organization: string;
  items: ExtensionReleaseItem[];
  failReason?: string;
};

export type ExtensionScene = {
  id: string;
  productId: string;
  primary: string;
  name: string;
  publishable: boolean;
  extension: { name: string; description: string };
  capabilities: Record<ExtensionCapabilityType, ExtensionCapability[]>;
  releases: ExtensionRelease[];
  publishing: ExtensionRelease | null;
};

export type ExtensionProduct = {
  id: string;
  name: string;
  departmentPath: string[];
};

export const MOCK_EXTENSION_PRODUCTS: ExtensionProduct[] = [
  {
    id: 'harness-pipeline',
    name: 'harness-pipeline',
    departmentPath: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'],
  },
  {
    id: 'release-manager',
    name: 'release-manager',
    departmentPath: ['部门1', '平台产品线', '平台工具组', 'DevOps部', '发布治理组'],
  },
  {
    id: 'quality-observer',
    name: 'quality-observer',
    departmentPath: ['部门1', '质量产品线', '质量工具组', '评审小组'],
  },
];

const scenes: ExtensionScene[] = [
  {
    id: 'scene-pipeline-mml',
    productId: 'harness-pipeline',
    primary: '开发',
    name: 'MML开发',
    publishable: true,
    extension: {
      name: 'MML开发 Extension',
      description: 'MML 工程端到端开发流：编译、语法补全、代码评审。',
    },
    capabilities: {
      skill: [
        {
          id: 'skill-mml-completion',
          name: 'MML语法补全',
          version: '0.9.0',
          publishDate: '2026-07-22',
          ready: true,
          files: [
            {
              name: 'SKILL.md',
              content:
                '# MML语法补全\n\n按 MML 上下文补全命令与参数。\n\n## 调用\n```yaml\ncapability: skill-mml-completion\nversion: 0.9.0\n```',
            },
            {
              name: 'scripts/run.sh',
              content:
                '#!/bin/bash\n# MML语法补全执行脚本\nset -euo pipefail\necho "[MML补全] start"',
            },
            {
              name: 'templates/config.json',
              content: '{\n  "name": "MML语法补全",\n  "version": "0.9.0"\n}',
            },
          ],
        },
        {
          id: 'skill-interface-doc',
          name: '接口文档生成',
          version: '1.0.0',
          publishDate: '2026-07-30',
          ready: true,
          files: [
            {
              name: 'SKILL.md',
              content: '# 接口文档生成\n\n解析 MML 配置与注释生成接口文档。',
            },
            {
              name: 'README.md',
              content: '# 接口文档生成 Skill\n\n## 用法\n调用 generate-doc 工具。',
            },
          ],
        },
      ],
      command: [
        {
          id: 'command-mml-build',
          name: 'MML编译',
          version: '1.0.0',
          publishDate: '2026-07-22',
          ready: true,
          files: [
            {
              name: 'MML编译.md',
              content:
                '# MML编译\n\n编译 MML 工程产出配置产物。\n\n## 参数\n- project: 工程路径\n- mode: debug/release',
            },
          ],
        },
      ],
      agent: [
        {
          id: 'agent-code-review',
          name: '代码评审Agent',
          version: '1.0.0',
          publishDate: '2026-07-22',
          ready: true,
          files: [
            {
              name: '代码评审Agent.md',
              content:
                '# 代码评审Agent\n\n基于变更集执行 MML 代码评审。\n\n## 输入\n- diff: 变更内容\n\n## 输出\n- 评审报告',
            },
          ],
        },
      ],
    },
    releases: [
      {
        version: '0.1',
        extensionName: 'MML开发 Extension',
        description: '初版：编译、补全与评审。',
        channel: 'Product',
        operator: { no: 'A0123', name: '李扶摇' },
        publishedAt: '2026-07-22 10:14',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.0' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
          { type: 'agent', name: '代码评审Agent', version: '1.0.0' },
        ],
      },
      {
        version: '0.1.5',
        extensionName: 'MML开发 Extension',
        description: '紧急 hotfix：修复编译脚本路径。',
        channel: 'Beta',
        operator: { no: 'A0456', name: '王致远' },
        publishedAt: '2026-07-25 16:20',
        status: '失败',
        organization: '云山组织',
        failReason: '编译脚本路径错误：/build/compile.sh 不存在，导致打包阶段中断。',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.1' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
        ],
      },
      {
        version: '0.2',
        extensionName: 'MML开发 Extension',
        description: '增加接口文档生成能力，补全能力升级。',
        channel: 'Product',
        operator: { no: 'A0123', name: '李扶摇' },
        publishedAt: '2026-07-30 09:30',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.0' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
          { type: 'skill', name: '接口文档生成', version: '1.0.0' },
          { type: 'agent', name: '代码评审Agent', version: '1.0.0' },
        ],
      },
      {
        version: '0.2.1',
        extensionName: 'MML开发 Extension',
        description: '小修：补全配置模板。',
        channel: 'Beta',
        operator: { no: 'A0123', name: '李扶摇' },
        publishedAt: '2026-08-02 14:00',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.0' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
          { type: 'skill', name: '接口文档生成', version: '1.0.0' },
          { type: 'agent', name: '代码评审Agent', version: '1.0.0' },
        ],
      },
      {
        version: '0.2.2',
        extensionName: 'MML开发 Extension',
        description: '尝试升级评审 Agent 至 1.1.0。',
        channel: 'Beta',
        operator: { no: 'A0456', name: '王致远' },
        publishedAt: '2026-08-05 11:30',
        status: '失败',
        organization: '云山组织',
        failReason: '代码评审Agent v1.1.0 在目标组织未通过准入校验：签名不匹配。',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.0' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
          { type: 'skill', name: '接口文档生成', version: '1.0.0' },
          { type: 'agent', name: '代码评审Agent', version: '1.1.0' },
        ],
      },
    ],
    publishing: {
      version: '0.3',
      extensionName: 'MML开发 Extension',
      description: '新增接口文档生成并升级评审 Agent。',
      channel: 'Beta',
      operator: { no: 'A0123', name: '李扶摇' },
      publishedAt: '2026-08-13 14:02',
      status: '进行中',
      organization: '扶摇组织',
      items: [
        { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
        { type: 'skill', name: '接口文档生成', version: '1.0.0' },
        { type: 'command', name: 'MML编译', version: '1.0.0' },
        { type: 'agent', name: '代码评审Agent', version: '1.0.0' },
      ],
    },
  },
  {
    id: 'scene-pipeline-patch',
    productId: 'harness-pipeline',
    primary: '开发',
    name: '补丁开发',
    publishable: false,
    extension: { name: '', description: '' },
    capabilities: {
      skill: [
        {
          id: 'skill-patch-generator',
          name: '补丁生成Skill',
          version: '',
          publishDate: '',
          ready: false,
          files: [],
        },
      ],
      command: [],
      agent: [],
    },
    releases: [],
    publishing: null,
  },
  {
    id: 'scene-pipeline-log',
    productId: 'harness-pipeline',
    primary: '问题定位',
    name: '日志获取',
    publishable: true,
    extension: { name: '日志获取 Extension', description: '一键拉取并采集流水线日志。' },
    capabilities: {
      skill: [
        {
          id: 'skill-log-collector',
          name: '日志采集Skill',
          version: '1.0.0',
          publishDate: '2026-08-03',
          ready: true,
          files: [
            {
              name: 'SKILL.md',
              content: '# 日志采集Skill\n\n按流水线、执行批次与时间窗采集运行日志。',
            },
            {
              name: 'scripts/collect.sh',
              content:
                '#!/bin/bash\n# 日志采集\npipeline="$1"\nwindow="$2"\necho "collect $pipeline in $window"',
            },
          ],
        },
      ],
      command: [
        {
          id: 'command-pull-log',
          name: '拉取日志',
          version: '1.0.0',
          publishDate: '2026-08-03',
          ready: true,
          files: [
            {
              name: '拉取日志.md',
              content: '# 拉取日志\n\n从目标流水线执行节点拉取日志文件。',
            },
          ],
        },
      ],
      agent: [],
    },
    releases: [
      {
        version: '0.1',
        extensionName: '日志获取 Extension',
        description: '初版：日志采集与拉取。',
        channel: 'Product',
        operator: { no: 'A0789', name: '赵思齐' },
        publishedAt: '2026-08-03 14:20',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'skill', name: '日志采集Skill', version: '1.0.0' },
          { type: 'command', name: '拉取日志', version: '1.0.0' },
        ],
      },
    ],
    publishing: null,
  },
  {
    id: 'scene-pipeline-analysis',
    productId: 'harness-pipeline',
    primary: '问题定位',
    name: '问题分析',
    publishable: true,
    extension: { name: '问题分析 Extension', description: '异常归因与缺陷定位。' },
    capabilities: {
      skill: [
        {
          id: 'skill-anomaly-analysis',
          name: '异常归因Skill',
          version: '1.2.0',
          publishDate: '2026-08-06',
          ready: true,
          files: [
            {
              name: 'SKILL.md',
              content: '# 异常归因Skill\n\n聚合告警、日志与指标定位异常根因。',
            },
            {
              name: 'scripts/analyze.py',
              content:
                '# 异常归因分析\ndef analyze(alerts):\n    # 汇总告警并输出候选根因\n    return []',
            },
          ],
        },
      ],
      command: [],
      agent: [
        {
          id: 'agent-defect-analysis',
          name: '缺陷归因Agent',
          version: '1.0.0',
          publishDate: '2026-08-06',
          ready: true,
          files: [
            {
              name: '缺陷归因Agent.md',
              content: '# 缺陷归因Agent\n\n对测试缺陷自动归因分析并输出定位报告。',
            },
          ],
        },
      ],
    },
    releases: [
      {
        version: '0.1',
        extensionName: '问题分析 Extension',
        description: '初版：异常归因。',
        channel: 'Beta',
        operator: { no: 'A0123', name: '李扶摇' },
        publishedAt: '2026-08-06 11:00',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'skill', name: '异常归因Skill', version: '1.0.0' },
          { type: 'agent', name: '缺陷归因Agent', version: '1.0.0' },
        ],
      },
      {
        version: '0.2',
        extensionName: '问题分析 Extension',
        description: '归因能力升级至 1.2.0，支持多指标关联。',
        channel: 'Product',
        operator: { no: 'A0123', name: '李扶摇' },
        publishedAt: '2026-08-09 16:30',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'skill', name: '异常归因Skill', version: '1.2.0' },
          { type: 'agent', name: '缺陷归因Agent', version: '1.0.0' },
        ],
      },
    ],
    publishing: null,
  },
  {
    id: 'scene-pipeline-report',
    productId: 'harness-pipeline',
    primary: '问题定位',
    name: '报告输出',
    publishable: false,
    extension: { name: '', description: '' },
    capabilities: {
      skill: [
        {
          id: 'skill-report-generator',
          name: '报告生成Skill',
          version: '',
          publishDate: '',
          ready: false,
          files: [],
        },
      ],
      command: [],
      agent: [],
    },
    releases: [],
    publishing: null,
  },
  {
    id: 'scene-release-mml',
    productId: 'release-manager',
    primary: '开发',
    name: 'MML开发',
    publishable: true,
    extension: { name: 'MML开发 Extension', description: '发布治理侧 MML 编译与补全。' },
    capabilities: {
      skill: [
        {
          id: 'skill-release-mml',
          name: 'MML语法补全',
          version: '0.9.0',
          publishDate: '2026-07-22',
          ready: true,
          files: [
            {
              name: 'SKILL.md',
              content: '# MML语法补全\n\n按发布治理上下文补全命令与参数。',
            },
          ],
        },
      ],
      command: [
        {
          id: 'command-release-mml',
          name: 'MML编译',
          version: '1.0.0',
          publishDate: '2026-07-22',
          ready: true,
          files: [{ name: 'MML编译.md', content: '# MML编译\n\n编译发布治理配置。' }],
        },
      ],
      agent: [],
    },
    releases: [
      {
        version: '0.1',
        extensionName: 'MML开发 Extension',
        description: '初版：编译与补全。',
        channel: 'Product',
        operator: { no: 'A0456', name: '王致远' },
        publishedAt: '2026-07-22 10:14',
        status: '成功',
        organization: '扶摇组织',
        items: [
          { type: 'command', name: 'MML编译', version: '1.0.0' },
          { type: 'skill', name: 'MML语法补全', version: '0.9.0' },
        ],
      },
    ],
    publishing: null,
  },
  {
    id: 'scene-release-analysis',
    productId: 'release-manager',
    primary: '问题定位',
    name: '问题分析',
    publishable: true,
    extension: { name: '问题分析 Extension', description: '变更异常归因与缺陷定位。' },
    capabilities: {
      skill: [
        {
          id: 'skill-release-anomaly',
          name: '异常归因Skill',
          version: '1.0.0',
          publishDate: '2026-08-06',
          ready: true,
          files: [{ name: 'SKILL.md', content: '# 异常归因Skill\n\n定位发布变更异常。' }],
        },
      ],
      command: [],
      agent: [
        {
          id: 'agent-release-defect',
          name: '缺陷归因Agent',
          version: '1.0.0',
          publishDate: '2026-08-06',
          ready: true,
          files: [{ name: '缺陷归因Agent.md', content: '# 缺陷归因Agent\n\n分析发布变更缺陷。' }],
        },
      ],
    },
    releases: [],
    publishing: null,
  },
  {
    id: 'scene-quality-log',
    productId: 'quality-observer',
    primary: '问题定位',
    name: '日志获取',
    publishable: true,
    extension: { name: '日志获取 Extension', description: '质量评审日志采集。' },
    capabilities: {
      skill: [
        {
          id: 'skill-quality-log',
          name: '日志采集Skill',
          version: '1.0.0',
          publishDate: '2026-08-03',
          ready: true,
          files: [{ name: 'SKILL.md', content: '# 日志采集Skill\n\n采集质量评审日志。' }],
        },
      ],
      command: [
        {
          id: 'command-quality-log',
          name: '拉取日志',
          version: '1.0.0',
          publishDate: '2026-08-03',
          ready: true,
          files: [{ name: '拉取日志.md', content: '# 拉取日志\n\n拉取质量评审日志。' }],
        },
      ],
      agent: [],
    },
    releases: [],
    publishing: null,
  },
  {
    id: 'scene-quality-report',
    productId: 'quality-observer',
    primary: '问题定位',
    name: '报告输出',
    publishable: false,
    extension: { name: '', description: '' },
    capabilities: {
      skill: [
        {
          id: 'skill-quality-report',
          name: '报告生成Skill',
          version: '',
          publishDate: '',
          ready: false,
          files: [],
        },
      ],
      command: [],
      agent: [],
    },
    releases: [],
    publishing: null,
  },
];

export function createMockExtensionScenes(): ExtensionScene[] {
  return structuredClone(scenes);
}

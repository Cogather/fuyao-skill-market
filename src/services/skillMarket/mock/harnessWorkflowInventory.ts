import type {
  Asset,
  Command,
  Department,
  Workflow,
} from '../../../composables/useHarnessScenarioWorkspace';
import { listScenes } from '../sceneManagementService';

type WorkflowSample = [sceneId: string, name: string, releaseCount: number, commandCount: number];
type ProductSamples = {
  department: string;
  offeringId: string;
  workflows: WorkflowSample[];
};

// Reuse configured products and scenes; keep harness-pipeline and harness-demo available
// for designing a workflow from scratch. The delivery scope has enough rows for pagination.
const samples: ProductSamples[] = [
  {
    department: '持续交付组',
    offeringId: 'offering-devops-center-v2-valid',
    workflows: [
      ['scene-code-gen', '应用脚手架生成流程', 2, 1],
      ['scene-unit-test', '单元测试补全流程', 0, 0],
      ['scene-code-review', '合并请求自动评审流程', 3, 2],
      ['scene-test-design', '回归测试编排流程', 0, 1],
    ],
  },
  {
    department: '持续交付组',
    offeringId: 'offering-release-tools-2026-valid',
    workflows: [
      ['scene-change', '灰度发布审批流程', 4, 3],
      ['scene-change-analysis', '发布影响分析流程', 0, 2],
      ['scene-inspection', '上线健康巡检流程', 2, 1],
    ],
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline',
    workflows: [
      ['scene-api-dev', '接口持续集成流程', 3, 2],
      ['scene-contract', '接口契约校验流程', 0, 1],
      ['scene-doc', '交付文档归档流程', 0, 0],
    ],
  },
  {
    department: '持续交付组',
    offeringId: 'offering-devops-delivery-console',
    workflows: [
      ['scene-risk-track', '交付风险跟踪流程', 1, 1],
      ['scene-alert', '构建异常诊断流程', 0, 2],
    ],
  },
  {
    department: '流水线平台小组',
    offeringId: 'offering-devops-console',
    workflows: [
      ['scene-code-gen', '流水线模板生成流程', 2, 1],
      ['scene-alert', '构建失败自愈流程', 0, 2],
      ['scene-inspection', '构建资源巡检流程', 1, 3],
    ],
  },
  {
    department: '变更管控小组',
    offeringId: 'offering-release-orchestration',
    workflows: [
      ['scene-change', '生产变更审批流程', 5, 3],
      ['scene-change-analysis', '跨服务变更评估流程', 0, 1],
      ['scene-risk-track', '回滚预案编排流程', 0, 0],
    ],
  },
  {
    department: '联调工具部',
    offeringId: 'offering-api',
    workflows: [
      ['scene-api-dev', '接口联调编排流程', 2, 2],
      ['scene-contract', 'API 契约兼容性检查流程', 1, 1],
      ['scene-doc', '接口文档同步流程', 0, 0],
    ],
  },
  {
    department: '评审小组',
    offeringId: 'offering-quality',
    workflows: [
      ['scene-code-review', '代码质量门禁流程', 4, 2],
      ['scene-test-design', '测试用例评审流程', 0, 1],
      ['scene-defect-review', '线上缺陷复盘流程', 0, 0],
    ],
  },
  {
    department: '日志工具组',
    offeringId: 'offering-sre',
    workflows: [
      ['scene-log', '日志异常聚类流程', 3, 1],
      ['scene-alert', '告警根因定位流程', 2, 3],
      ['scene-inspection', '服务稳定性巡检流程', 0, 2],
    ],
  },
  {
    department: 'SQL治理组',
    offeringId: 'offering-data',
    workflows: [
      ['scene-sql-governance', '高风险 SQL 审核流程', 2, 2],
      ['scene-data-quality', '数据质量校验流程', 0, 1],
    ],
  },
  {
    department: '需求分析组',
    offeringId: 'offering-business',
    workflows: [
      ['scene-requirement-clarify', '需求澄清与验收拆解流程', 1, 1],
      ['scene-search', '业务知识检索流程', 0, 0],
    ],
  },
  {
    department: '体验设计部',
    offeringId: 'offering-design',
    workflows: [
      ['scene-design-review', '交互设计走查流程', 2, 1],
      ['scene-doc', '设计规范沉淀流程', 0, 0],
    ],
  },
  {
    department: '项目管理部',
    offeringId: 'offering-project',
    workflows: [
      ['scene-risk-track', '项目风险预警流程', 2, 2],
      ['scene-doc', '项目周报汇总流程', 0, 1],
    ],
  },
  {
    department: '变更分析组',
    offeringId: 'offering-platform-tools',
    workflows: [
      ['scene-change-analysis', '依赖变更影响分析流程', 3, 2],
      ['scene-risk-track', '变更风险分级流程', 0, 0],
    ],
  },
  {
    department: '发布工具组',
    offeringId: 'offering-devops',
    workflows: [
      ['scene-change', '多环境发布编排流程', 2, 3],
      ['scene-inspection', '发布后验收流程', 0, 1],
    ],
  },
];

/** Append once per authorized department and user; saved edits/deletions survive reloads. */
export function seedMockWorkflowInventory(input: {
  departments: Department[];
  workflows: Workflow[];
  assets: Asset[];
  commands: Command[];
  seededDepartmentIds: string[];
}): void {
  if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http') return;
  const { departments, workflows, assets, commands, seededDepartmentIds } = input;
  for (const department of departments) {
    if (seededDepartmentIds.includes(department._id)) continue;
    const products = samples.filter((sample) => sample.department === department.name);
    if (!products.length) continue;
    const scenes = listScenes(department.name);
    for (const product of products) {
      const productId = JSON.stringify([department._id, product.offeringId]);
      for (const [sceneId, name, releaseCount, commandCount] of product.workflows) {
        const scene = scenes.find((item) => item.id === sceneId && item.parentId);
        if (!scene) continue;
        const scenarioId = JSON.stringify([productId, scene.id]);
        if (workflows.some((item) => item.scenarioId === scenarioId)) continue;
        const id = `mock-workflow-inventory:${scenarioId}`;
        const owner = `${department.name}负责人`;
        const developer = `${department.name}研发团队`;
        const assetRefs = (['Agent', 'Skill'] as const).map((assetType) => {
          const assetId = `mock-workflow-inventory:${department._id}:${assetType}`;
          if (!assets.some((item) => item._id === assetId)) {
            assets.push({
              _id: assetId,
              name: `${department.name}${assetType === 'Agent' ? '流程助手' : '结果校验'}`,
              assetType,
              description: `${department.name}的${assetType === 'Agent' ? '任务分析与流程执行助手' : '执行结果检查与报告生成能力'}。`,
              owner,
              developer,
              version: '1.0.0',
              status: 'active',
            });
          }
          return { assetId, type: assetType, version: '1.0.0' };
        });
        const commandRefs = Array.from({ length: commandCount }, (_, index) => {
          const action = ['run', 'review', 'retry'][index]!;
          const commandId = `${id}:${action}`;
          let command = commands.find((item) => item._id === commandId);
          if (!command) {
            command = {
              _id: commandId,
              name: `/${product.offeringId.replace('offering-', '')}-${scene.id.replace('scene-', '')}-${action}`,
              description: `${name}的${['执行', '复核', '重试'][index]}入口。`,
              owner,
              developer,
              version: releaseCount > 0 ? '1.0.0' : null,
            };
            commands.push(command);
          }
          const { _id, ...metadata } = command;
          return { id: `${id}:command:${index}`, commandId: _id, ...metadata };
        });
        workflows.push({
          _id: id,
          name,
          description: `由${department.name}负责，完成${scene.name}的输入分析、任务执行与结果复核。`,
          businessScenario: scene.name,
          scenarioId,
          status: releaseCount > 0 ? 'active' : 'draft',
          releaseCount,
          stages: ['任务执行', '结果复核'].map((stageName, index) => ({
            id: `${id}:stage:${index}`,
            name: stageName,
            description: `${scene.name}：${stageName}`,
            order: index,
            steps: [
              {
                id: `${id}:node:${index}`,
                name: index === 0 ? scene.name : '检查结果并生成报告',
                description:
                  index === 0
                    ? `分析输入并执行${scene.name}。`
                    : '检查执行结果，汇总异常与后续建议。',
                order: 0,
                assets: [{ ...assetRefs[index]! }],
              },
            ],
          })),
          assets: assetRefs,
          commands: commandRefs,
        });
      }
    }
    seededDepartmentIds.push(department._id);
  }
}

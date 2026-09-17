import type {
  Asset,
  AssetRef,
  Command,
  Department,
  Workflow,
} from '../../../composables/useHarnessScenarioWorkspace';
import { getSharedMockExtensionScenes } from '../extensionPublishMock';
import {
  listScenes,
  replaceScenesForDepartment,
  type SceneRecord,
} from '../sceneManagementService';

type WorkflowSample = [
  sceneId: string,
  name: string,
  releaseCount: number,
  commandCount: number,
  publish?: Pick<Workflow, 'status' | 'canPublish' | 'changed'>,
];
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
      [
        'scene-code-gen',
        '应用脚手架生成流程',
        2,
        1,
        { status: 'active', canPublish: true, changed: true },
      ],
      [
        'scene-unit-test',
        '单元测试补全流程',
        0,
        0,
        { status: 'ready', canPublish: true, changed: false },
      ],
      [
        'scene-code-review',
        '合并请求自动评审流程',
        3,
        2,
        { status: 'active', canPublish: true, changed: true },
      ],
      [
        'scene-test-design',
        '回归测试编排流程',
        0,
        1,
        { status: 'ready', canPublish: true, changed: false },
      ],
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

// 桥接场景记录：与共享 Mock Extension 场景的一级/二级场景名保持一致，
// 让工作流行、发布页展示同一套场景语义。
const extensionBridgeSceneRecords: SceneRecord[] = [
  { id: 'scene-dev', parentId: null, name: '开发', sort: 15, status: 'enabled', skillCount: 0 },
  {
    id: 'scene-issue-locate',
    parentId: null,
    name: '问题定位',
    sort: 16,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-release-governance',
    parentId: null,
    name: '发布治理',
    sort: 17,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-dev-mml',
    parentId: 'scene-dev',
    name: 'MML开发',
    sort: 1,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-dev-patch',
    parentId: 'scene-dev',
    name: '补丁开发',
    sort: 2,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-dev-build-diagnosis',
    parentId: 'scene-dev',
    name: '构建诊断',
    sort: 3,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-issue-locate-log',
    parentId: 'scene-issue-locate',
    name: '日志获取',
    sort: 1,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-issue-locate-analysis',
    parentId: 'scene-issue-locate',
    name: '问题分析',
    sort: 2,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-issue-locate-trace',
    parentId: 'scene-issue-locate',
    name: '链路追踪',
    sort: 3,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-issue-locate-report',
    parentId: 'scene-issue-locate',
    name: '报告输出',
    sort: 4,
    status: 'enabled',
    skillCount: 0,
  },
  {
    id: 'scene-release-governance-risk',
    parentId: 'scene-release-governance',
    name: '发布风险评估',
    sort: 1,
    status: 'enabled',
    skillCount: 0,
  },
];

const EXTENSION_BRIDGE_SCENE_SEED_KEY = 'skill-market-workflow-extension-bridge-v1';
// 前缀版本升级后，已播种过的浏览器会再执行一次桥接（按 _id 去重），用于补充新增的桥接行。
const EXTENSION_BRIDGE_SEED_PREFIX = 'extension-bridge-v2:';

// 桥接工作流：工作流 _id 直接使用共享 Mock Extension 场景 ID，
// 让“Harness 工作流”页的查看/发布能解析到对应场景（方案 A）。
const extensionBridgeSamples: Array<{
  department: string;
  offeringId: string;
  sceneRecordId: string;
  extensionSceneId: string;
}> = [
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-dev-mml',
    extensionSceneId: 'scene-pipeline-mml',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-dev-patch',
    extensionSceneId: 'scene-pipeline-patch',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-dev-build-diagnosis',
    extensionSceneId: 'scene-pipeline-build-diagnosis',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-issue-locate-log',
    extensionSceneId: 'scene-pipeline-log',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-issue-locate-analysis',
    extensionSceneId: 'scene-pipeline-analysis',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-issue-locate-trace',
    extensionSceneId: 'scene-pipeline-trace',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-issue-locate-report',
    extensionSceneId: 'scene-pipeline-report',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-harness-pipeline-valid',
    sceneRecordId: 'scene-release-governance-risk',
    extensionSceneId: 'scene-pipeline-release-risk',
  },
  // release-tools-2026 产品下的补充桥接：覆盖“已发布可查历史”和“待发布可直接发布”两类演示。
  {
    department: '持续交付组',
    offeringId: 'offering-release-tools-2026-valid',
    sceneRecordId: 'scene-dev-mml',
    extensionSceneId: 'scene-release-mml',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-release-tools-2026-valid',
    sceneRecordId: 'scene-issue-locate-analysis',
    extensionSceneId: 'scene-release-analysis',
  },
  {
    department: '持续交付组',
    offeringId: 'offering-release-tools-2026-valid',
    sceneRecordId: 'scene-issue-locate-log',
    extensionSceneId: 'scene-quality-log',
  },
];

function ensureExtensionBridgeScenes(departmentName: string): void {
  if (window.localStorage.getItem(EXTENSION_BRIDGE_SCENE_SEED_KEY)) return;
  const scenes = listScenes(departmentName);
  let changed = false;
  for (const record of extensionBridgeSceneRecords) {
    const exists = scenes.some(
      (item) =>
        item.id === record.id ||
        (item.parentId === record.parentId && item.name === record.name),
    );
    if (exists) continue;
    scenes.push({ ...record });
    changed = true;
  }
  if (changed) replaceScenesForDepartment(departmentName, scenes);
  window.localStorage.setItem(EXTENSION_BRIDGE_SCENE_SEED_KEY, '1');
}

type ScenarioDetailsDraft = {
  code: string;
  description: string;
  releaseCount?: number;
  name?: string;
};

function departmentAssetRefs(
  department: Department,
  assets: Asset[],
): { refs: AssetRef[]; owner: string; developer: string } {
  const owner = `${department.name}负责人`;
  const developer = `${department.name}研发团队`;
  const refs = (['Agent', 'Skill'] as const).map((assetType) => {
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
  return { refs, owner, developer };
}

function workflowStages(id: string, sceneName: string, assetRefs: AssetRef[]): Workflow['stages'] {
  return ['任务执行', '结果复核'].map((stageName, index) => ({
    id: `${id}:stage:${index}`,
    name: stageName,
    description: `${sceneName}：${stageName}`,
    order: index,
    steps: [
      {
        id: `${id}:node:${index}`,
        name: index === 0 ? sceneName : '检查结果并生成报告',
        description:
          index === 0 ? `分析输入并执行${sceneName}。` : '检查执行结果，汇总异常与后续建议。',
        order: 0,
        assets: [{ ...assetRefs[index]! }],
      },
    ],
  }));
}

function seedExtensionBridgeWorkflows(input: {
  departments: Department[];
  workflows: Workflow[];
  assets: Asset[];
  commands: Command[];
  details: Record<string, ScenarioDetailsDraft>;
  seededDepartmentIds: string[];
}): void {
  const sharedScenes = getSharedMockExtensionScenes();
  for (const department of input.departments) {
    const departmentSamples = extensionBridgeSamples.filter(
      (sample) => sample.department === department.name,
    );
    if (!departmentSamples.length) continue;
    ensureExtensionBridgeScenes(department.name);
    const marker = `${EXTENSION_BRIDGE_SEED_PREFIX}${department._id}`;
    const alreadySeeded = input.seededDepartmentIds.includes(marker);
    const scenes = listScenes(department.name);
    for (const sample of departmentSamples) {
      const sceneRecord = scenes.find((item) => item.id === sample.sceneRecordId && item.parentId);
      const extensionScene = sharedScenes.find((item) => item.id === sample.extensionSceneId);
      if (!sceneRecord || !extensionScene) continue;
      const productId = JSON.stringify([department._id, sample.offeringId]);
      const scenarioId = JSON.stringify([productId, sceneRecord.id]);
      const successReleases = extensionScene.releases.filter(
        (release) => release.status === '成功',
      ).length;
      const status =
        successReleases > 0 ? 'active' : extensionScene.publishable ? 'ready' : 'draft';
      const canPublish = extensionScene.publishable;
      const changed =
        extensionScene.publishable && !extensionScene.publishing && successReleases > 0;
      const existing = input.workflows.find((item) => item._id === sample.extensionSceneId);
      if (existing) {
        Object.assign(existing, { status, releaseCount: successReleases, canPublish, changed });
        continue;
      }
      if (alreadySeeded) continue;
      const { refs: assetRefs, owner, developer } = departmentAssetRefs(department, input.assets);
      const extensionCode =
        extensionScene.extension.name.trim() || `${extensionScene.name} Extension`;
      const description =
        extensionScene.extension.description.trim() ||
        `由${department.name}负责，完成${sceneRecord.name}的输入分析、任务执行与结果复核。`;
      input.details[scenarioId] ||= {
        code: extensionCode,
        description,
        releaseCount: successReleases,
      };
      const commandRefs = extensionScene.capabilities.command.map((capability, index) => {
        const commandId = `mock-workflow-bridge:${sample.extensionSceneId}:command:${index}`;
        let command = input.commands.find((item) => item._id === commandId);
        if (!command) {
          command = {
            _id: commandId,
            name: `/${capability.name}`,
            description: `${sceneRecord.name}流程的${capability.name}入口。`,
            owner,
            developer,
            version: capability.version || null,
          };
          input.commands.push(command);
        }
        const { _id, ...metadata } = command;
        return {
          id: `${sample.extensionSceneId}:command-ref:${index}`,
          commandId: _id,
          ...metadata,
        };
      });
      input.workflows.push({
        _id: sample.extensionSceneId,
        name: `${sceneRecord.name}流程`,
        description,
        businessScenario: sceneRecord.name,
        scenarioId,
        status,
        releaseCount: successReleases,
        canPublish,
        changed,
        stages: workflowStages(sample.extensionSceneId, sceneRecord.name, assetRefs),
        assets: assetRefs,
        commands: commandRefs,
      });
    }
    if (!alreadySeeded) input.seededDepartmentIds.push(marker);
  }
}

/** Append once per authorized department and user; saved edits/deletions survive reloads. */
export function seedMockWorkflowInventory(input: {
  departments: Department[];
  workflows: Workflow[];
  assets: Asset[];
  commands: Command[];
  details: Record<string, ScenarioDetailsDraft>;
  seededDepartmentIds: string[];
}): void {
  if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http') return;
  const { departments, workflows, assets, commands, details, seededDepartmentIds } = input;
  for (const department of departments) {
    const alreadySeeded = seededDepartmentIds.includes(department._id);
    const products = samples.filter((sample) => sample.department === department.name);
    if (!products.length) continue;
    const scenes = listScenes(department.name);
    for (const product of products) {
      const productId = JSON.stringify([department._id, product.offeringId]);
      for (const [sceneId, name, releaseCount, commandCount, publish] of product.workflows) {
        const scene = scenes.find((item) => item.id === sceneId && item.parentId);
        if (!scene) continue;
        const scenarioId = JSON.stringify([productId, scene.id]);
        const existing = workflows.find((item) => item.scenarioId === scenarioId);
        if (existing) {
          if (publish) Object.assign(existing, publish);
          continue;
        }
        if (alreadySeeded) continue;
        const id = `mock-workflow-inventory:${scenarioId}`;
        const { refs: assetRefs, owner, developer } = departmentAssetRefs(department, assets);
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
          status: publish?.status ?? (releaseCount > 0 ? 'active' : 'draft'),
          releaseCount,
          canPublish: publish?.canPublish,
          changed: publish?.changed,
          stages: workflowStages(id, scene.name, assetRefs),
          assets: assetRefs,
          commands: commandRefs,
        });
      }
    }
    if (!alreadySeeded) seededDepartmentIds.push(department._id);
  }
  seedExtensionBridgeWorkflows({
    departments,
    workflows,
    assets,
    commands,
    details,
    seededDepartmentIds,
  });
}

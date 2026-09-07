import type { Asset, Command } from '../../../composables/useHarnessScenarioWorkspace';
import {
  listScenes,
  replaceScenesForDepartment,
  type SceneRecord,
} from '../sceneManagementService';
import type { ProductPlanningOption } from '../skillPlanningShared';

export const MOCK_WORKFLOW_EXPERIENCE_PRODUCT: ProductPlanningOption = {
  offeringId: 'offering-harness-demo',
  offeringName: 'harness-demo',
  planningDeptName: '平台工具组',
};

const SCENE_SEED_KEY = 'skill-market-workflow-experience-scenes-v1';
const sampleAssets: Asset[] = [
  {
    _id: 'mock-workflow-experience-api-agent',
    name: 'harness-demo-api-agent',
    assetType: 'Agent',
    description: '整理接口需求，协调代码生成与评审，汇总交付结果。',
    owner: '演示 Owner',
    developer: '演示开发者',
    version: '1.0',
    status: 'active',
  },
  {
    _id: 'mock-workflow-experience-code-generator',
    name: 'harness-demo-code-generator',
    assetType: 'Skill',
    description: '根据接口定义生成实现代码和基础单元测试。',
    owner: '演示 Owner',
    developer: '演示开发者',
    version: '1.0',
    status: 'active',
  },
  {
    _id: 'mock-workflow-experience-code-review',
    name: 'harness-demo-code-review',
    assetType: 'Skill',
    description: '检查代码规范、边界条件和测试覆盖，输出评审结论。',
    owner: '演示 Owner',
    developer: '演示开发者',
    version: '1.0',
    status: 'active',
  },
];

const sampleCommands: Command[] = [
  {
    _id: 'mock-workflow-experience-e2e-api',
    name: '/harness-demo-e2e-api',
    description: '接口开发工作流主入口：从需求分析到代码生成、评审。',
    owner: '演示 Owner',
    developer: '演示开发者',
    version: '1.0',
  },
  {
    _id: 'mock-workflow-experience-review',
    name: '/harness-demo-review',
    description: '对已有接口代码执行评审的辅助入口。',
    owner: '演示 Owner',
    developer: '演示开发者',
    version: '1.0',
  },
];

/** Add practice material to existing mock storage without pre-creating a workflow. */
export function seedMockWorkflowExperience(assets: Asset[], commands: Command[]): void {
  if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http') return;

  for (const sample of sampleAssets) {
    if (
      !assets.some(
        (item) =>
          item._id === sample._id ||
          (item.assetType === sample.assetType && item.name === sample.name),
      )
    ) {
      assets.push({ ...sample });
    }
  }
  for (const sample of sampleCommands) {
    if (!commands.some((item) => item._id === sample._id || item.name === sample.name)) {
      commands.push({ ...sample });
    }
  }

  // Scene settings are shared per department. Seed once so deleted demo scenes stay deleted.
  if (window.localStorage.getItem(SCENE_SEED_KEY)) return;
  const department = MOCK_WORKFLOW_EXPERIENCE_PRODUCT.planningDeptName;
  const scenes = listScenes(department);
  let primary = scenes.find(
    (item) =>
      item.parentId === null &&
      (item.id === 'scene-workflow-experience' || item.name === '工作流体验'),
  );
  if (!primary) {
    primary = {
      id: 'scene-workflow-experience',
      parentId: null,
      name: '工作流体验',
      sort: scenes.filter((item) => item.parentId === null).length + 1,
      status: 'enabled',
      skillCount: 0,
    } satisfies SceneRecord;
    scenes.push(primary);
  }
  if (
    !scenes.some(
      (item) =>
        item.id === 'scene-workflow-experience-api' ||
        (item.parentId === primary.id && item.name === '接口开发体验'),
    )
  ) {
    scenes.push({
      id: 'scene-workflow-experience-api',
      parentId: primary.id,
      name: '接口开发体验',
      sort: scenes.filter((item) => item.parentId === primary.id).length + 1,
      status: 'enabled',
      skillCount: 0,
    });
  }
  replaceScenesForDepartment(department, scenes);
  window.localStorage.setItem(SCENE_SEED_KEY, '1');
}

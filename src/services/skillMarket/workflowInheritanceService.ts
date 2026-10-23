import {
  queryHarnessWorkflowPage,
  type HarnessWorkflowListPage,
  type HarnessWorkflowListQuery,
  type HarnessWorkflowListRow,
} from './harnessWorkflowListService';
import { loadDesignDetail, mapDesignDetail } from './businessScenarioDesignRepository';
import type { WorkflowSceneContext } from './businessScenarioDesignService';
import type {
  Department,
  Product,
  Scenario,
  Workflow,
} from '../../composables/useHarnessScenarioWorkspace';

export interface WorkflowInheritanceSource extends HarnessWorkflowListRow {
  key: string;
  localWorkflowId?: string;
}

export interface WorkflowInheritancePage extends Omit<HarnessWorkflowListPage, 'list'> {
  list: WorkflowInheritanceSource[];
  excludedCurrent?: boolean;
}

export interface WorkflowInheritanceIdentity {
  dimType: string;
  dimCode: string;
  firstScene: string;
  secondScene: string;
}

export type WorkflowInheritanceQuery = HarnessWorkflowListQuery & { keyword?: string };

export function workflowInheritanceKey(
  row: Pick<HarnessWorkflowListRow, 'dimType' | 'dimCode' | 'firstScene' | 'secondScene'>,
): string {
  return JSON.stringify([row.dimType, row.dimCode, row.firstScene, row.secondScene]);
}

function isSameWorkflow(
  row: Pick<HarnessWorkflowListRow, 'dimType' | 'dimCode' | 'firstScene' | 'secondScene'>,
  current: WorkflowInheritanceIdentity,
): boolean {
  return (
    row.dimType === current.dimType &&
    row.dimCode === current.dimCode &&
    row.firstScene === current.firstScene &&
    row.secondScene === current.secondScene
  );
}

export async function queryWorkflowInheritancePage(
  query: WorkflowInheritanceQuery,
  current?: WorkflowInheritanceIdentity,
): Promise<WorkflowInheritancePage> {
  const page = await queryHarnessWorkflowPage(query);
  const currentIncluded = Boolean(current && page.list.some((row) => isSameWorkflow(row, current)));
  return {
    ...page,
    excludedCurrent: currentIncluded,
    list: page.list
      .filter((row) => !current || !isSameWorkflow(row, current))
      .map((row) => ({ ...row, key: workflowInheritanceKey(row) })),
  };
}

export async function loadWorkflowInheritanceDraft(
  source: WorkflowInheritanceSource,
  target: {
    context: WorkflowSceneContext;
    scenarioId: string;
    productId: string;
  },
) {
  const detail = await loadDesignDetail({
    userId: target.context.userId,
    dimType: source.dimType,
    dimCode: source.dimCode,
    dimName: source.dimName,
    firstScene: source.firstScene,
    secondScene: source.secondScene,
  });
  return mapDesignDetail(target.context, detail, target.scenarioId, target.productId);
}

export function queryLocalWorkflowInheritancePage(input: {
  departments: readonly Department[];
  products: readonly Product[];
  scenarios: readonly Scenario[];
  workflows: readonly Workflow[];
  selectedDepartmentId: string;
  currentScenarioId: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
  userId: string;
}): WorkflowInheritancePage {
  const selectedDepartment = input.departments.find(
    (department) => department._id === input.selectedDepartmentId,
  );
  const departmentsById = new Map(
    input.departments.map((department) => [department._id, department]),
  );
  const productsById = new Map(input.products.map((product) => [product._id, product]));
  const scenariosById = new Map(input.scenarios.map((scenario) => [scenario._id, scenario]));
  const departmentIsInScope = (department?: Department) =>
    Boolean(
      selectedDepartment &&
      department &&
      selectedDepartment.path.every((name, index) => department.path[index] === name),
    );
  const keyword = (input.keyword || '').trim().toLocaleLowerCase();
  const rows = input.workflows.flatMap((workflow): WorkflowInheritanceSource[] => {
    if (workflow.scenarioId === input.currentScenarioId) return [];
    const scenario = scenariosById.get(workflow.scenarioId);
    const parent = scenario?.parentId ? scenariosById.get(scenario.parentId) : undefined;
    const product = scenario ? productsById.get(scenario.productId) : undefined;
    const department = product ? departmentsById.get(product.departmentId) : undefined;
    if (
      !scenario ||
      scenario.level !== 2 ||
      !parent ||
      !product ||
      !department ||
      !departmentIsInScope(department)
    ) {
      return [];
    }
    const searchable = [workflow.name, parent.name, scenario.name].join(' ').toLocaleLowerCase();
    if (keyword && !searchable.includes(keyword)) return [];
    const dimType = product.scopeLevel === '部门级' ? '部门级' : '产品级';
    const row: WorkflowInheritanceSource = {
      key: `local:${workflow._id}`,
      localWorkflowId: workflow._id,
      flowName: workflow.name || null,
      flowDescription: workflow.description || null,
      firstScene: parent.name,
      secondScene: scenario.name,
      secondSceneDescription: scenario.description || null,
      sceneExtensionCode: scenario.code || null,
      dimType,
      dimCode: dimType === '部门级' ? department.deptCode : product.code,
      dimName: dimType === '部门级' ? department.path.join('/') : product.name,
      commandCount: workflow.commands.length,
      status: workflow.status,
      canPublish: workflow.canPublish,
      changed: workflow.changed,
    };
    return [row];
  });
  const pageNo = Math.max(1, Math.floor(input.pageNo));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const start = (pageNo - 1) * pageSize;
  return {
    total: rows.length,
    pageNo,
    pageSize,
    list: rows.slice(start, start + pageSize),
  };
}

export function createLocalWorkflowInheritanceDraft(
  source: Workflow,
  target: { scenarioId: string; scenarioName: string },
): Workflow {
  const cloned = JSON.parse(JSON.stringify(source)) as Workflow;
  return {
    ...cloned,
    _id: `workflow:${target.scenarioId}`,
    scenarioId: target.scenarioId,
    businessScenario: target.scenarioName,
    status: 'draft',
    releaseCount: 0,
    canPublish: false,
    changed: true,
    progress: undefined,
  };
}

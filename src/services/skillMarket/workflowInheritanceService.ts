import { designData } from './businessScenarioDesignRepository';
import {
  harnessWorkflowService,
  type WorkflowSceneContext,
  type WorkflowSceneSearchRow,
} from './businessScenarioDesignService';
import type {
  Department,
  Product,
  Scenario,
  Workflow,
} from '../../composables/useHarnessScenarioWorkspace';

export interface WorkflowInheritanceSource extends WorkflowSceneSearchRow {
  key: string;
  localWorkflowId?: string;
  flowDescription?: string | null;
  commandCount?: number | null;
  status?: string;
  canPublish?: boolean | null;
  changed?: boolean | null;
}

export interface WorkflowInheritancePage {
  total: number;
  pageNo: number;
  pageSize: number;
  list: WorkflowInheritanceSource[];
  excludedCurrent?: boolean;
  hasMore?: boolean;
}

export interface WorkflowInheritanceIdentity {
  dimType: string;
  dimCode: string;
  firstScene: string;
  secondScene: string;
  sceneExtensionCode?: string | null;
}

export interface WorkflowInheritanceQuery {
  userId: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
}

export function workflowInheritanceKey(
  row: Pick<
    WorkflowSceneSearchRow,
    'sourceDimType' | 'sourceDimCode' | 'firstScene' | 'secondScene' | 'sceneExtensionCode'
  >,
): string {
  return JSON.stringify([
    row.sourceDimType,
    row.sourceDimCode,
    ...(row.sceneExtensionCode?.trim()
      ? [row.sceneExtensionCode.trim()]
      : [null, row.firstScene, row.secondScene]),
  ]);
}

function isSameWorkflow(
  row: WorkflowSceneSearchRow,
  current: WorkflowInheritanceIdentity,
): boolean {
  return (
    row.sourceDimType === current.dimType &&
    row.sourceDimCode === current.dimCode &&
    (row.sceneExtensionCode?.trim() && current.sceneExtensionCode?.trim()
      ? row.sceneExtensionCode.trim() === current.sceneExtensionCode.trim()
      : row.firstScene === current.firstScene && row.secondScene === current.secondScene)
  );
}

export async function queryWorkflowInheritancePage(
  query: WorkflowInheritanceQuery,
  current?: WorkflowInheritanceIdentity,
): Promise<WorkflowInheritancePage> {
  const pageNo = Math.max(1, Math.floor(query.pageNo));
  const pageSize = Math.max(1, Math.floor(query.pageSize));
  const limit = Math.min(pageNo * pageSize, 100);
  const data = designData<unknown>(
    await harnessWorkflowService.searchScenes({
      userId: query.userId,
      keyword: query.keyword ?? '',
      limit,
    }),
    '场景搜索失败',
  );
  if (!Array.isArray(data)) throw new Error('场景搜索响应缺少有效的场景列表');
  const rows: WorkflowSceneSearchRow[] = data
    .map((value) => {
      if (
        !value ||
        typeof value !== 'object' ||
        !['sourceDimType', 'sourceDimCode', 'firstScene', 'secondScene'].every(
          (key) => typeof value[key] === 'string',
        )
      )
        throw new Error('场景搜索响应缺少有效的场景标识');
      return {
        sourceDimType: value.sourceDimType,
        sourceDimCode: value.sourceDimCode,
        sourceDimName: typeof value.sourceDimName === 'string' ? value.sourceDimName : '',
        firstScene: value.firstScene,
        secondScene: value.secondScene,
        sceneExtensionCode:
          typeof value.sceneExtensionCode === 'string' ? value.sceneExtensionCode : null,
        flowName: typeof value.flowName === 'string' ? value.flowName : null,
        activityCount:
          Number.isSafeInteger(value.activityCount) && value.activityCount >= 0
            ? value.activityCount
            : null,
      };
    })
    .slice(0, limit);
  const hasMore = data.length >= limit && limit < 100;
  const uniqueRows = [...new Map(rows.map((row) => [workflowInheritanceKey(row), row])).values()];
  const currentIncluded = Boolean(
    current && uniqueRows.some((row) => isSameWorkflow(row, current)),
  );
  return {
    total: uniqueRows.length,
    pageNo,
    pageSize,
    hasMore,
    excludedCurrent: currentIncluded,
    list: uniqueRows
      .filter((row) => !current || !isSameWorkflow(row, current))
      .map((row) => ({ ...row, key: workflowInheritanceKey(row) })),
  };
}

export async function copyWorkflowInheritance(
  source: WorkflowInheritanceSource,
  target: Pick<
    WorkflowSceneContext,
    'userId' | 'dimType' | 'dimCode' | 'firstScene' | 'secondScene'
  >,
): Promise<string> {
  const code = designData<unknown>(
    await harnessWorkflowService.copyScene(
      {
        sourceDimType: source.sourceDimType,
        sourceDimCode: source.sourceDimCode,
        targetDimType: target.dimType,
        targetDimCode: target.dimCode,
        firstScene: target.firstScene,
        secondScene: target.secondScene,
      },
      { userId: target.userId },
    ),
    '场景复制失败',
  );
  if (typeof code !== 'string' || !code.trim()) throw new Error('场景复制响应缺少有效的场景编码');
  return code;
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
      sceneExtensionCode: scenario.code || null,
      sourceDimType: dimType,
      sourceDimCode: dimType === '部门级' ? department.deptCode : product.code,
      sourceDimName: dimType === '部门级' ? department.path.join('/') : product.name,
      activityCount: workflow.stages.length,
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

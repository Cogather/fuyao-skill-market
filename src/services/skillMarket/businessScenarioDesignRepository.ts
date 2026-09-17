import {
  harnessWorkflowService as api,
  type WorkflowAssetType,
  type WorkflowComponentType,
  type WorkflowDetail,
  type WorkflowDimension,
  type WorkflowSceneContext,
  type WorkflowSceneKey,
  type WorkflowSceneRow,
  type WorkflowActivityRow,
  type WorkflowPoolItem,
} from './businessScenarioDesignService';
import type {
  Asset,
  Command,
  Scenario,
  Workflow,
} from '../../composables/useHarnessScenarioWorkspace';
import type { ScenarioTaxonomyClient } from './harnessScenarioTaxonomyService';
import {
  normalizeProductPlanningOptions,
  normalizeUserDepartmentOptions,
} from './skillPlanningService';
import type {
  WorkflowCapabilityOption,
  WorkflowCapabilityType,
} from './workflowCapabilitySearchService';

export const businessScenarioTaxonomyClient: ScenarioTaxonomyClient = {
  getSceneOptionGroups: (scope) => api.querySceneList(scope),
  refreshSceneOptionGroups: (body, scope) =>
    api.refreshScene(scope, {
      scenes: body.scenes.map((scene) => ({
        ...scene,
        firstScene: scene.firstScene ?? '',
        secondScene: scene.secondScene ?? '',
      })),
    }),
};
const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
const text = (value: unknown) => (value == null ? '' : String(value).trim());
const commandName = (value: unknown) => {
  const name = text(value).replace(/^\/+/, '');
  return name ? `/${name}` : '';
};
const readCommandName = (value: unknown) => {
  const item = record(value);
  return commandName(text(item.commandName) || item.name);
};
function normalizeCommands(items: unknown[]): WorkflowDetail['commands'] {
  const commands = new Map<string, WorkflowDetail['commands'][number]>();
  for (const value of items) {
    const name = readCommandName(value);
    if (!name) continue;
    const item = record(value);
    commands.set(name, {
      commandName: name,
      description: text(item.description) || text(item.commandDescription),
    });
  }
  return [...commands.values()];
}
export function designData<T>(response: unknown, message = '业务场景设计请求失败'): T {
  const envelope = record(response);
  const meta = record(envelope.meta);
  const success = meta.success ?? meta.isSuccess;
  if (success !== true && !(success == null && meta.message === 'OK')) {
    throw new Error(text(meta.message || envelope.message) || message);
  }
  return envelope.data as T;
}
function rows(response: unknown): Record<string, any>[] {
  const data = designData<unknown>(response);
  return Array.isArray(data) ? data : (record(data).list ?? record(data).records ?? []);
}
function total(response: unknown): number | undefined {
  const source = record(response);
  const value = record(source.data).total ?? source.total ?? record(source.meta).number;
  return value != null && Number.isFinite(Number(value)) ? Number(value) : undefined;
}
const componentType = (type: string): WorkflowAssetType => {
  const value = type.toUpperCase();
  if (value !== 'SKILL' && value !== 'AGENT') throw new Error(`未知资产类型：${type}`);
  return value;
};
const poolKey = (item: Pick<WorkflowPoolItem, 'assetType' | 'assetName'>) =>
  JSON.stringify([componentType(item.assetType), item.assetName]);
const capabilityId = (scope: WorkflowDimension, type: string, name: string) =>
  JSON.stringify([
    'design',
    scope.dimType,
    scope.dimCode,
    type.toUpperCase(),
    type.toUpperCase() === 'COMMAND' ? text(name).replace(/^\/+/, '') : name,
  ]);
const sceneKey = (scope: WorkflowSceneKey) => ({
  firstScene: scope.firstScene,
  secondScene: scope.secondScene,
});
const dimension = ({
  userId,
  dimType,
  dimCode,
  dimName,
}: WorkflowDimension): WorkflowDimension => ({ userId, dimType, dimCode, dimName });

export async function loadDesignDetail(scope: WorkflowSceneContext): Promise<WorkflowDetail> {
  const data = designData<WorkflowDetail>(
    await api.queryHarnessWorkflowDetail(scope),
    'Workflow 详情加载失败',
  );
  if (
    !data ||
    !['commands', 'assetPool', 'stages', 'steps'].every((key) => Array.isArray(record(data)[key]))
  ) {
    throw new Error('Workflow 详情格式不完整，请刷新后重试');
  }
  let commands: unknown[] = data.commands;
  if (commands.some((item) => !readCommandName(item))) {
    // Recover server bindings before diffing; dropping unnamed entries could duplicate a saved Command.
    commands = await sceneBindingRecords(scope, 'COMMAND');
    if (!commands.length || commands.some((item) => !readCommandName(item))) {
      throw new Error(
        'Workflow 详情中的 Command 名称为空，无法从场景绑定记录恢复，请检查接口返回数据',
      );
    }
  }
  return { ...data, commands: normalizeCommands(commands) };
}
export function mapDesignDetail(
  scope: WorkflowSceneContext,
  data: WorkflowDetail,
  scenarioId: string,
  productId: string,
) {
  const assets: Asset[] = data.assetPool.map((item) => ({
    _id: capabilityId(scope, item.assetType, item.assetName),
    sourceId: item.assetName,
    productId,
    name: item.assetName,
    assetType: componentType(item.assetType) === 'SKILL' ? 'Skill' : 'Agent',
    description: item.description || '',
    packageReady: item.packageReady === true,
    owner: '',
    developer: '',
    version: null,
    status: 'active',
  }));
  const commands: Command[] = normalizeCommands(data.commands).map((item) => ({
    _id: capabilityId(scope, 'COMMAND', item.commandName),
    sourceId: item.commandName,
    productId,
    name: item.commandName,
    description: item.description || '',
    owner: '',
    developer: '',
    version: null,
  }));
  const workflow: Workflow = {
    _id: `workflow:${scenarioId}`,
    scenarioId,
    businessScenario: scope.secondScene,
    name: data.flowName || '',
    description: data.flowDescription || '',
    status: data.allDone ? 'active' : 'draft',
    releaseCount: 0,
    commands: commands.map((item) => ({ ...item, id: item._id, commandId: item._id })),
    assets: assets.map((item) => ({ assetId: item._id, type: item.assetType })),
    stages: [...data.stages]
      .sort((a, b) => a.sort - b.sort)
      .map((stage, index) => ({
        id: JSON.stringify([scenarioId, stage.activityNodeName]),
        name: stage.activityNodeName,
        order: index,
        description: '',
        steps: [...stage.steps]
          .sort((a, b) => a.sort - b.sort)
          .map((step, order) => ({
            id: JSON.stringify([scenarioId, stage.activityNodeName, step.subActivityNodeName]),
            name: step.subActivityNodeName,
            description: '',
            order,
            assets: step.boundAssets.map((item) => ({
              assetId: capabilityId(scope, item.assetType, item.assetName),
              type:
                componentType(item.assetType) === 'SKILL' ? ('Skill' as const) : ('Agent' as const),
            })),
          })),
      })),
    progress: { steps: data.steps, nextStep: data.nextStep, allDone: data.allDone },
  };
  return { workflow, assets, commands };
}

export async function saveDesignMetadata(
  scope: WorkflowSceneContext,
  scenario: Scenario,
  workflow: Workflow,
  before: WorkflowDetail,
  onSaved?: (values: Partial<WorkflowSceneRow>) => void,
) {
  const params = dimension(scope);
  if (
    scenario.code !== (before.sceneExtensionCode || '') ||
    scenario.description !== (before.secondSceneDescription || '')
  ) {
    designData(
      await api.updateSecondSceneCode(
        {
          ...sceneKey(scope),
          sceneExtensionCode: scenario.code,
          secondSceneDescription: scenario.description,
        },
        params,
      ),
    );
    onSaved?.({ sceneExtensionCode: scenario.code, secondSceneDescription: scenario.description });
  }
  if (
    workflow.name !== (before.flowName || '') ||
    workflow.description !== (before.flowDescription || '')
  ) {
    designData(
      await api.updateSceneMetadata(
        {
          ...sceneKey(scope),
          flowName: workflow.name,
          flowDescription: workflow.description,
        },
        params,
      ),
    );
  }
  onSaved?.({
    sceneExtensionCode: scenario.code,
    secondSceneDescription: scenario.description,
    flowName: workflow.name,
    flowDescription: workflow.description,
  });
}
function activityRows(scope: WorkflowSceneKey, stages: Workflow['stages']): WorkflowActivityRow[] {
  let sort = 0;
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .flatMap((stage) => {
      const nodes = [...stage.steps].sort((a, b) => a.order - b.order);
      return (nodes.length ? nodes : [null]).map((node) => ({
        ...sceneKey(scope),
        activityNodeName: stage.name,
        subActivityNodeName: node?.name || '',
        sort: sort++,
      }));
    });
}
export async function saveDesignActivities(
  scope: WorkflowSceneContext,
  workflow: Workflow,
  before: WorkflowDetail,
) {
  const desired = activityRows(scope, workflow.stages);
  const previous = activityRows(
    scope,
    mapDesignDetail(scope, before, workflow.scenarioId, '').workflow.stages,
  );
  if (JSON.stringify(desired) === JSON.stringify(previous)) return;
  const params = dimension(scope);
  // refreshActivities replaces the dimension: include every other scene, including when this one is emptied.
  const scenes = designData<WorkflowSceneRow[]>(await api.querySceneList(params));
  const others = [
    ...new Map(
      scenes
        .filter(
          (item) =>
            item.secondScene &&
            (item.firstScene !== scope.firstScene || item.secondScene !== scope.secondScene),
        )
        .map((item) => [JSON.stringify(sceneKey(item)), item]),
    ).values(),
  ];
  const untouched = await Promise.all(
    others.map(async (item) =>
      designData<WorkflowActivityRow[]>(
        await api.queryActivitiesByScene({ ...params, ...sceneKey(item) }),
      ).map((activity) => ({
        ...sceneKey(item),
        activityNodeName: activity.activityNodeName,
        subActivityNodeName: activity.subActivityNodeName || '',
        sort: activity.sort,
      })),
    ),
  );
  designData(
    await api.refreshActivities(params, { activities: [...untouched.flat(), ...desired] }),
  );
}

type Binding = { type: WorkflowComponentType; name: string; stage: string; node: string };
const bindingKey = (item: Binding) =>
  JSON.stringify([
    item.type,
    item.type === 'COMMAND' ? commandName(item.name) : item.name,
    item.stage,
    item.node,
  ]);
function detailBindings(data: WorkflowDetail): Binding[] {
  return data.stages.flatMap((stage) =>
    stage.steps.flatMap((step) =>
      step.boundAssets.map((asset) => ({
        type: componentType(asset.assetType),
        name: asset.assetName,
        stage: stage.activityNodeName,
        node: step.subActivityNodeName,
      })),
    ),
  );
}
async function sceneBindingRecords(scope: WorkflowSceneContext, type: WorkflowComponentType) {
  const matches: Record<string, any>[] = [];
  let pageNum = 1;
  let count = 0;
  const seen = new Set<string>();
  while (true) {
    const response = await api.queryConfigurationBindings(type, {
      ...dimension(scope),
      pageNum,
      pageSize: 200,
    });
    const page = rows(response);
    if (!page.length) break;
    let fresh = 0;
    for (const value of page) {
      const outer = record(value);
      const row = { ...outer, ...record(outer[`${type.toLowerCase()}ConfigEntity`]) };
      const id = text(row.id);
      if (id && !seen.has(id)) {
        fresh++;
        seen.add(id);
      }
      if (row.firstScene !== scope.firstScene || row.secondScene !== scope.secondScene) continue;
      if (row.dimCode != null && text(row.dimCode) !== scope.dimCode) continue;
      if (row.dimType != null && text(row.dimType) !== scope.dimType) continue;
      // Only NULL activity columns denote a scene-level Command; ignore legacy node commands.
      if (type === 'COMMAND' && (row.activityNodeName != null || row.subActivityNodeName != null))
        continue;
      matches.push(row);
    }
    count += page.length;
    const size = total(response);
    if (size !== undefined ? count >= size : page.length < 200) break;
    if (!fresh) throw new Error('绑定列表分页未前进，请刷新后重试');
    pageNum++;
  }
  return matches;
}
async function bindingIds(scope: WorkflowSceneContext, removals: Binding[]) {
  const found = new Map<string, string[]>();
  for (const type of new Set(removals.map((item) => item.type))) {
    for (const row of await sceneBindingRecords(scope, type)) {
      const id = text(row.id);
      const key = bindingKey({
        type,
        name: text(row[`${type.toLowerCase()}Name`] ?? row.name),
        stage: text(row.activityNodeName),
        node: text(row.subActivityNodeName),
      });
      if (id) found.set(key, [...new Set([...(found.get(key) || []), id])]);
    }
  }
  return removals.flatMap((item) => {
    const ids = found.get(bindingKey(item));
    if (!ids?.length) throw new Error(`未找到 ${item.name} 的绑定记录 ID，请刷新后重试`);
    return ids.map((id) => ({ ...item, id }));
  });
}
async function unbind(
  scope: WorkflowSceneContext,
  removals: Awaited<ReturnType<typeof bindingIds>>,
) {
  for (const item of removals) {
    const remove =
      item.type === 'SKILL'
        ? api.skillUnbindScene
        : item.type === 'AGENT'
          ? api.agentUnbindScene
          : api.commandUnbindScene;
    designData(await remove(item.id, dimension(scope)));
  }
}
function activityIdentity(id: string): string[] {
  try {
    const parsed = JSON.parse(id);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
/** Rename/delete exact activity records before refresh can replace them, preserving their bindings. */
export async function prepareDesignActivityChanges(
  scope: WorkflowSceneContext,
  workflow: Workflow,
  before: WorkflowDetail,
): Promise<WorkflowDetail> {
  const previous = activityRows(
    scope,
    mapDesignDetail(scope, before, workflow.scenarioId, '').workflow.stages,
  );
  const desired = activityRows(scope, workflow.stages);
  const key = (row: WorkflowActivityRow) =>
    JSON.stringify([row.activityNodeName, row.subActivityNodeName || '']);
  const desiredKeys = new Set(desired.map(key));
  if (previous.every((row) => desiredKeys.has(key(row)))) return before;

  // A displayed stage may be just a grouping of child rows. Only delete/rename a parent
  // record when the activity query actually contains its NULL child key.
  const actual = designData<WorkflowActivityRow[]>(await api.queryActivitiesByScene(scope));
  const operations = actual.map((row) => {
    const stage =
      workflow.stages.find((item) => activityIdentity(item.id)[1] === row.activityNodeName) ??
      workflow.stages.find((item) => item.name === row.activityNodeName);
    const nodeName = row.subActivityNodeName || '';
    const node =
      nodeName && stage
        ? (stage.steps.find((item) => activityIdentity(item.id)[2] === nodeName) ??
          stage.steps.find((item) => item.name === nodeName))
        : undefined;
    return { row, stage, node, deleted: !stage || Boolean(nodeName && !node) };
  });
  // Delete children first. The parent endpoint explicitly does not cascade to its children.
  operations.sort(
    (a, b) =>
      Number(Boolean(b.row.subActivityNodeName)) - Number(Boolean(a.row.subActivityNodeName)),
  );
  let changed = false;
  for (const { row, stage, node, deleted } of operations) {
    const oldNode = row.subActivityNodeName || null;
    if (deleted) {
      designData(
        await api.deleteActivity({
          ...scope,
          activityNodeName: row.activityNodeName,
          ...(oldNode ? { subActivityNodeName: oldNode } : {}),
        }),
      );
      changed = true;
    } else if (stage!.name !== row.activityNodeName || (node?.name || null) !== oldNode) {
      designData(
        await api.renameActivity(
          {
            ...sceneKey(scope),
            oldActivityNodeName: row.activityNodeName,
            oldSubActivityNodeName: oldNode,
            newActivityNodeName: stage!.name,
            newSubActivityNodeName: node?.name || null,
          },
          dimension(scope),
        ),
      );
      changed = true;
    }
  }
  // Read migrated/deleted bindings back so the following diff does not unbind/rebind them.
  return changed ? loadDesignDetail(scope) : before;
}
export async function attachDesignCapability(
  scope: WorkflowSceneContext,
  type: WorkflowCapabilityType,
  item: Asset | Command,
) {
  if (type === 'Command') {
    const before = await loadDesignDetail(scope);
    const name = commandName(item.name);
    if (!before.commands.some((entry) => commandName(entry.commandName) === name))
      designData(
        await api.commandBindScene({ ...sceneKey(scope), commandName: name }, dimension(scope)),
      );
    return;
  }
  const asset = { assetType: componentType(type), assetName: item.name };
  const pool = designData<WorkflowPoolItem[]>(await api.querySceneAssetPool(scope));
  if (!pool.some((entry) => poolKey(entry) === poolKey(asset))) {
    const { userId, ...poolScope } = scope;
    designData(await api.componentEnterPool({ ...poolScope, ...asset }, { userId }));
  }
}
export async function saveDesignCommands(
  scope: WorkflowSceneContext,
  workflow: Workflow,
  before: WorkflowDetail,
) {
  const names = new Set(workflow.commands.map((item) => commandName(item.name)));
  if (names.has('')) throw new Error('Command 名称不能为空，请重新选择入口');
  const previous = normalizeCommands(before.commands);
  const removals: Binding[] = previous
    .filter((item) => !names.has(item.commandName))
    .map((item) => ({ type: 'COMMAND', name: item.commandName, stage: '', node: '' }));
  await unbind(scope, await bindingIds(scope, removals));
  const existing = new Set(previous.map((item) => item.commandName));
  for (const commandName of names) {
    if (!existing.has(commandName))
      designData(await api.commandBindScene({ ...sceneKey(scope), commandName }, dimension(scope)));
  }
}
export async function saveDesignAssets(
  scope: WorkflowSceneContext,
  workflow: Workflow,
  assets: Asset[],
  before: WorkflowDetail,
) {
  const assetById = new Map(assets.map((asset) => [asset._id, asset]));
  const resolve = (id: string) => {
    const asset = assetById.get(id);
    if (!asset) throw new Error('选中的资产不存在，请刷新后重试');
    return { assetType: componentType(asset.assetType), assetName: asset.name };
  };
  const desiredPool = new Map(
    workflow.assets.map((asset) => {
      const item = resolve(asset.assetId);
      return [poolKey(item), item];
    }),
  );
  const currentPool = designData<WorkflowPoolItem[]>(await api.querySceneAssetPool(scope));
  const existingPool = new Map(currentPool.map((item) => [poolKey(item), item]));
  const desiredBindings = workflow.stages.flatMap((stage) =>
    stage.steps.flatMap((step) =>
      step.assets.map((asset) => {
        const item = resolve(asset.assetId);
        if (!desiredPool.has(poolKey(item)))
          throw new Error(`${item.assetName} 必须先加入当前场景资产池`);
        return { type: item.assetType, name: item.assetName, stage: stage.name, node: step.name };
      }),
    ),
  );
  const desiredKeys = new Set(desiredBindings.map(bindingKey));
  const previous = detailBindings(before);
  // Removing an asset from the pool already unbinds it transactionally on the backend.
  const removals = previous.filter(
    (item) =>
      desiredPool.has(
        poolKey({ assetType: item.type as WorkflowAssetType, assetName: item.name }),
      ) && !desiredKeys.has(bindingKey(item)),
  );
  const ids = await bindingIds(scope, removals);
  const { userId, ...poolScope } = scope;
  for (const [key, item] of desiredPool) {
    if (!existingPool.has(key))
      designData(await api.componentEnterPool({ ...poolScope, ...item }, { userId }));
  }
  await unbind(scope, ids);
  for (const [key, item] of existingPool) {
    if (!desiredPool.has(key))
      designData(
        await api.componentExitPool({
          ...scope,
          assetType: componentType(item.assetType),
          assetName: item.assetName,
        }),
      );
  }
  const existingKeys = new Set(previous.map(bindingKey));
  for (const item of desiredBindings) {
    if (existingKeys.has(bindingKey(item))) continue;
    const body = {
      ...sceneKey(scope),
      activityNodeName: item.stage,
      subActivityNodeName: item.node,
    };
    designData(
      item.type === 'SKILL'
        ? await api.skillBindActivity({ ...body, skillName: item.name }, dimension(scope))
        : await api.agentBindActivity({ ...body, agentName: item.name }, dimension(scope)),
    );
    existingKeys.add(bindingKey(item));
  }
}

export async function loadDesignProducts(deptCode: string) {
  if (!deptCode) throw new Error('产品列表查询缺少部门编码');
  return normalizeProductPlanningOptions(await api.queryProducts({ deptCode }));
}
export async function queryDesignUsers(info: string) {
  return info.trim()
    ? normalizeUserDepartmentOptions(await api.queryUsers({ info: info.trim() }))
    : [];
}
export async function queryDesignCapabilities(
  type: WorkflowCapabilityType,
  scope: WorkflowDimension,
  keyword: string,
  pageNum = 1,
) {
  const response = await api.queryCapabilities(type.toUpperCase() as WorkflowComponentType, {
    userId: scope.userId,
    pageNum,
    pageSize: 20,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    ...(keyword.trim()
      ? { keyword: keyword.trim() }
      : { dimType: scope.dimType, dimCode: scope.dimCode, dimName: scope.dimName }),
  });
  const data = rows(response);
  const list: WorkflowCapabilityOption[] = data.map((item) => {
    const name = text(item[`${type.toLowerCase()}Name`] ?? item.name);
    return {
      _id: capabilityId(scope, type, name),
      sourceId: text(item.id) || name,
      name: type === 'Command' ? `/${name.replace(/^\/+/, '')}` : name,
      type,
      description: text(item[`${type.toLowerCase()}Description`] ?? item.description),
      owner: [item.ownerName, item.ownerId].filter(Boolean).join(' '),
      developer: [item.developOwnerName, item.developOwnerId].filter(Boolean).join(' '),
      version: text(item.version) || null,
      productName: text(item.dimName),
      status: text(item.status),
      dueDate: text(item.planFinishDate) || null,
    };
  });
  const size = total(response);
  return { list, hasMore: size !== undefined ? pageNum * 20 < size : data.length === 20 };
}
export async function createDesignCapability(
  type: WorkflowCapabilityType,
  item: Asset | Command,
  scope: WorkflowDimension,
) {
  const key = type.toLowerCase();
  const name = item.name.replace(/^\/+/, '');
  const response = await api.createCapability(
    type.toUpperCase() as WorkflowComponentType,
    {
      [`${key}Name`]: name,
      [`${key}Description`]: item.description,
      ownerName: item.owner.replace(item.ownerId || '\0', '').trim(),
      ownerId: item.ownerId,
      developOwnerName: item.developer.replace(item.developerId || '\0', '').trim(),
      developOwnerId: item.developerId,
      planFinishDate: item.dueDate,
    },
    scope,
  );
  const data = designData<unknown>(response);
  return {
    ...item,
    _id: capabilityId(scope, type, item.name),
    sourceId: text(
      record(data).id ?? (typeof data === 'string' || typeof data === 'number' ? data : name),
    ),
  };
}

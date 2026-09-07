import { computed, reactive, ref, watch } from 'vue';
import { getProductPlanning } from '../services/skillMarket/skillPlanningService';
import { seedMockWorkflowExperience } from '../services/skillMarket/mock/harnessWorkflowExperience';
import { seedMockWorkflowInventory } from '../services/skillMarket/mock/harnessWorkflowInventory';
import {
  loadScenarioRecords,
  saveScenarioRecords,
  loadLegacyActivityRecords,
  saveScenarioTagBindings,
  type TaxonomyRecord,
  type TaxonomyScope,
} from '../services/skillMarket/harnessScenarioTaxonomyService';
import {
  harnessConfigurationRevision,
  lastHarnessConfigurationChange,
} from '../services/skillMarket/harnessConfigurationSyncService';

export type AssetType = 'Agent' | 'Skill';
export type Department = {
  _id: string;
  name: string;
  parentId: string | null;
  path: string[];
  deptCode: string;
};
export type Product = { _id: string; name: string; code: string; departmentId: string };
export type AssetRef = { assetId: string; type: AssetType; version?: string | null; role?: string };
export type Node = {
  id: string;
  name: string;
  description: string;
  order: number;
  assets: AssetRef[];
  sourceActivityId?: string;
};
export type Stage = {
  id: string;
  name: string;
  description: string;
  order: number;
  steps: Node[];
  sourceActivityId?: string;
};
export type CommandRef = {
  id: string;
  commandId: string;
  name: string;
  description: string;
  owner: string;
  developer: string;
  version: string | null;
};
export type Scenario = {
  _id: string;
  name: string;
  code: string;
  description: string;
  parentId: string | null;
  level: 1 | 2;
  productId: string;
  tags: string[];
  status?: string;
  releaseCount?: number;
  sourceId?: string;
  skillCount?: number;
};
export type Workflow = {
  _id: string;
  name: string;
  description: string;
  businessScenario: string;
  scenarioId: string;
  status: string;
  releaseCount: number;
  stages: Stage[];
  assets: AssetRef[];
  commands: CommandRef[];
};
export type Asset = {
  _id: string;
  name: string;
  assetType: AssetType;
  owner: string;
  developer: string;
  description: string;
  version: string | null;
  status: string;
  dueDate?: string | null;
};
export type Command = {
  _id: string;
  name: string;
  description: string;
  owner: string;
  developer: string;
  version: string | null;
  dueDate?: string | null;
};
type DepartmentTreeNode = {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentTreeNode[];
};
export type ScenarioWorkspaceContext = {
  ready: boolean;
  userId: string;
  departmentTree: DepartmentTreeNode[];
  defaultDepartmentPath: string[];
  allowedDepartmentPaths: string[][];
  restrictToAllowedDepartments: boolean;
};
type ScenarioDetails = Pick<Scenario, 'code' | 'description' | 'releaseCount'>;

function randomUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

const uid = (prefix: string) => `${prefix}-${randomUuid()}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Configuration owns scenes; workflow designs and their scene metadata are browser-local drafts. */
export function createHarnessScenarioWorkspace(context: () => ScenarioWorkspaceContext) {
  const departments = reactive<Department[]>([]);
  const products = reactive<Product[]>([]);
  const scenarios = reactive<Scenario[]>([]);
  const workflows = reactive<Workflow[]>([]);
  const assets = reactive<Asset[]>([]);
  const commands = reactive<Command[]>([]);
  const mockWorkflowSeededDepartments = reactive<string[]>([]);
  const details = reactive<Record<string, ScenarioDetails>>({});
  const selectedDeptId = ref('');
  const productId = ref('');
  const selectedScenarioId = ref('');
  const loading = ref(false);
  const sourceReady = ref(false);
  const saving = ref(false);
  const error = ref('');
  const recordsByProduct = new Map<string, TaxonomyRecord[]>();
  let loadSequence = 0;
  let storageKey = '';
  let loadingStorage = false;
  let ownSave = false;
  let contextUser = '';
  let inventorySequence = 0;
  let productsLoadedFor = '';
  const available = computed(
    () =>
      context().ready &&
      sourceReady.value &&
      !loading.value &&
      departments.some((item) => item._id === selectedDeptId.value),
  );
  let preferredProduct: { offeringId: string; offeringName: string } | null = null;
  const productOptions = computed(() =>
    products.filter((item) => item.departmentId === selectedDeptId.value),
  );
  const inventoryProductOptions = computed(() =>
    products.filter((item) => departmentIsInScope(item.departmentId, selectedDeptId.value)),
  );
  const scopedId = (product: Product, id: string) => JSON.stringify([product._id, id]);

  function scopeFor(product: Product): TaxonomyScope {
    const dept = departments.find((item) => item._id === product.departmentId);
    if (!dept || !context().ready) throw new Error('请选择有管理权限的部门');
    return {
      departmentName: dept.name,
      deptCode: dept.deptCode,
      userId: context().userId,
      offeringId: product.code,
      offeringName: product.name,
    };
  }
  function currentProduct(): Product {
    const product = productOptions.value.find((item) => item._id === productId.value);
    if (!available.value || !product || !recordsByProduct.has(product._id))
      throw new Error('请先选择有管理权限的部门与产品，等待场景成功加载后再编辑');
    return product;
  }
  function persist() {
    if (!storageKey || loadingStorage) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ workflows, assets, commands, details, mockWorkflowSeededDepartments }),
      );
    } catch {
      error.value = '本地草稿保存失败，请检查浏览器存储空间；离开页面可能丢失本次修改。';
    }
  }
  function restore(userId: string) {
    const nextKey =
      'harness-scenario-workspace-v2:' +
      (import.meta.env.VITE_SKILL_MARKET_TRANSPORT || 'mock') +
      ':' +
      userId;
    if (storageKey === nextKey) return;
    loadingStorage = true;
    storageKey = nextKey;
    workflows.splice(0);
    assets.splice(0);
    commands.splice(0);
    mockWorkflowSeededDepartments.splice(0);
    Object.keys(details).forEach((key) => delete details[key]);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      const seen = new Set<string>();
      if (Array.isArray(saved.workflows))
        workflows.push(
          ...saved.workflows.filter((item: Workflow) => {
            if (
              !item?._id ||
              !item.scenarioId ||
              seen.has(item.scenarioId) ||
              !Array.isArray(item.stages) ||
              !Array.isArray(item.assets) ||
              !Array.isArray(item.commands)
            )
              return false;
            seen.add(item.scenarioId);
            return true;
          }),
        );
      if (Array.isArray(saved.assets)) assets.push(...saved.assets);
      if (Array.isArray(saved.commands)) commands.push(...saved.commands);
      if (saved.details && typeof saved.details === 'object') Object.assign(details, saved.details);
      if (Array.isArray(saved.mockWorkflowSeededDepartments))
        mockWorkflowSeededDepartments.push(
          ...saved.mockWorkflowSeededDepartments.filter(
            (item: unknown) => typeof item === 'string',
          ),
        );
      seedMockWorkflowExperience(assets, commands);
    } catch {
      error.value = '无法读取本地工作流草稿，请检查浏览器存储数据。';
    } finally {
      loadingStorage = false;
    }
  }
  watch([workflows, assets, commands, details, mockWorkflowSeededDepartments], persist, {
    deep: true,
  });

  function applyRecords(product: Product, records: TaxonomyRecord[]) {
    const ids = new Set(records.map((item) => scopedId(product, item.id)));
    // Prune only on a successful authoritative response, never on a failed request.
    const belongsToProduct = (id: string) => {
      try {
        return JSON.parse(id)[0] === product._id;
      } catch {
        return false;
      }
    };
    for (let index = workflows.length - 1; index >= 0; index--) {
      const workflow = workflows[index]!;
      if (belongsToProduct(workflow.scenarioId) && !ids.has(workflow.scenarioId))
        workflows.splice(index, 1);
    }
    for (const id of Object.keys(details))
      if (belongsToProduct(id) && !ids.has(id)) delete details[id];
    for (let i = scenarios.length - 1; i >= 0; i--)
      if (scenarios[i]?.productId === product._id) scenarios.splice(i, 1);
    const roots = records.filter((item) => !item.parentId).sort((a, b) => a.sort - b.sort);
    const mapped = roots
      .flatMap((root) => [
        root,
        ...records.filter((item) => item.parentId === root.id).sort((a, b) => a.sort - b.sort),
      ])
      .map((item): Scenario => {
        const id = scopedId(product, item.id);
        return {
          _id: id,
          sourceId: item.id,
          name: item.name,
          parentId: item.parentId ? scopedId(product, item.parentId) : null,
          level: item.parentId ? 2 : 1,
          productId: product._id,
          status: item.status,
          skillCount: item.skillCount,
          tags: [...(item.tags || [])],
          code: details[id]?.code || '',
          description: details[id]?.description || '',
          releaseCount: details[id]?.releaseCount || 0,
        };
      });
    scenarios.push(...mapped);
    for (const item of mapped) {
      const workflow = workflows.find((entry) => entry.scenarioId === item._id);
      if (workflow) workflow.businessScenario = item.name;
    }
    recordsByProduct.set(product._id, clone(records));
    if (
      product._id === productId.value &&
      !mapped.some((item) => item._id === selectedScenarioId.value)
    )
      selectInitialScenario();
  }
  function selectInitialScenario() {
    const current = scenarios.filter((item) => item.productId === productId.value);
    selectedScenarioId.value =
      (
        current.find(
          (item) => item.level === 2 && workflows.some((flow) => flow.scenarioId === item._id),
        ) ||
        current.find((item) => item.level === 2) ||
        current[0]
      )?._id || '';
  }
  async function reloadScenes() {
    if (productsLoadedFor !== selectedDeptId.value) {
      await loadDepartment();
      return;
    }
    const sequence = ++loadSequence;
    loading.value = true;
    sourceReady.value = false;
    error.value = '';
    try {
      const batches = await Promise.all(
        productOptions.value.map(async (product) => ({
          product,
          records: await loadScenarioRecords(scopeFor(product)),
        })),
      );
      if (sequence !== loadSequence) return;
      batches.forEach(({ product, records }) => applyRecords(product, records));
      sourceReady.value = true;
    } catch (cause) {
      if (sequence === loadSequence)
        error.value = cause instanceof Error ? cause.message : '场景加载失败';
    } finally {
      if (sequence === loadSequence) loading.value = false;
    }
  }
  async function loadDepartment() {
    const sequence = ++loadSequence;
    productId.value = '';
    selectedScenarioId.value = '';
    loading.value = true;
    sourceReady.value = false;
    productsLoadedFor = '';
    error.value = '';
    const department = departments.find((item) => item._id === selectedDeptId.value);
    if (!department) {
      loading.value = false;
      return;
    }
    try {
      const options = await getProductPlanning('', department.name, department.deptCode);
      if (sequence !== loadSequence) return;
      for (let i = products.length - 1; i >= 0; i--)
        if (products[i]?.departmentId === department._id) products.splice(i, 1);
      const loaded = options.map((item): Product => ({
        _id: JSON.stringify([department._id, item.offeringId || item.offeringName]),
        name: item.offeringName,
        code: item.offeringId,
        departmentId: department._id,
      }));
      products.push(...loaded);
      productsLoadedFor = department._id;
      productId.value =
        (
          loaded.find(
            (item) =>
              preferredProduct &&
              (item.code === preferredProduct.offeringId ||
                item.name === preferredProduct.offeringName),
          ) || loaded[0]
        )?._id || '';
      preferredProduct = null;
      const batches = await Promise.all(
        loaded.map(async (product) => ({
          product,
          records: await loadScenarioRecords(scopeFor(product)),
        })),
      );
      if (sequence !== loadSequence) return;
      batches.forEach(({ product, records }) => applyRecords(product, records));
      selectInitialScenario();
      sourceReady.value = true;
    } catch (cause) {
      if (sequence === loadSequence)
        error.value = cause instanceof Error ? cause.message : '场景加载失败';
    } finally {
      if (sequence === loadSequence) loading.value = false;
    }
  }
  function selectDepartment(id: string) {
    if (!departments.some((item) => item._id === id) || id === selectedDeptId.value) return;
    selectedDeptId.value = id;
  }
  function selectScope(scope: {
    departmentPath: string[];
    offeringId: string;
    offeringName: string;
  }) {
    const department = departments.find(
      (item) => item.path.join('/') === scope.departmentPath.join('/'),
    );
    if (!department) return;
    if (department._id !== selectedDeptId.value) {
      preferredProduct = scope;
      selectDepartment(department._id);
    } else {
      const product = productOptions.value.find(
        (item) => item.code === scope.offeringId || item.name === scope.offeringName,
      );
      if (product) productId.value = product._id;
    }
  }
  function deptPath(id: string) {
    return departments.find((item) => item._id === id)?.path.join(' / ') || '';
  }
  function departmentIsInScope(id: string, scopeId: string) {
    const path = departments.find((item) => item._id === id)?.path;
    const root = departments.find((item) => item._id === scopeId)?.path;
    return Boolean(path && root && root.every((name, index) => name === path[index]));
  }
  async function ensureInventoryScope() {
    if (!available.value) return;
    const sequence = ++inventorySequence;
    const scopeId = selectedDeptId.value;
    const user = contextUser;
    const neededDepartments = new Set<string>();
    for (const workflow of workflows) {
      try {
        const [productKey] = JSON.parse(workflow.scenarioId);
        const [departmentId] = JSON.parse(productKey);
        if (
          departmentId !== scopeId &&
          departmentIsInScope(departmentId, scopeId) &&
          !recordsByProduct.has(productKey)
        )
          neededDepartments.add(departmentId);
      } catch {
        /* Ignore drafts from unknown identity formats. */
      }
    }
    const results = await Promise.all(
      [...neededDepartments].map(async (id) => {
        const department = departments.find((item) => item._id === id)!;
        const options = await getProductPlanning('', department.name, department.deptCode);
        return Promise.all(
          options.map(async (option) => {
            const product: Product = {
              _id: JSON.stringify([id, option.offeringId || option.offeringName]),
              code: option.offeringId,
              name: option.offeringName,
              departmentId: id,
            };
            return { product, records: await loadScenarioRecords(scopeFor(product)) };
          }),
        );
      }),
    );
    if (
      sequence !== inventorySequence ||
      user !== contextUser ||
      selectedDeptId.value !== scopeId ||
      !available.value
    )
      return;
    for (const { product, records } of results.flat()) {
      if (!products.some((item) => item._id === product._id)) products.push(product);
      applyRecords(product, records);
    }
  }
  watch(selectedDeptId, loadDepartment);
  watch(productId, selectInitialScenario);
  watch(
    context,
    (value) => {
      if (!value.ready) {
        sourceReady.value = false;
        loadSequence += 1;
        selectedDeptId.value = '';
        productId.value = '';
        selectedScenarioId.value = '';
        departments.splice(0);
        products.splice(0);
        scenarios.splice(0);
        recordsByProduct.clear();
        return;
      }
      const userChanged = contextUser !== value.userId;
      contextUser = value.userId;
      if (userChanged) {
        loadSequence += 1;
        selectedDeptId.value = '';
        products.splice(0);
        scenarios.splice(0);
        recordsByProduct.clear();
      }
      restore(value.userId);
      const flattened: Department[] = [];
      function walk(nodes: DepartmentTreeNode[], parentId: string | null, path: string[]) {
        for (const item of nodes) {
          const itemPath = [...path, item.name];
          const id = item.deptCode || item.id || itemPath.join('/');
          flattened.push({
            _id: id,
            name: item.name,
            parentId,
            path: itemPath,
            deptCode: item.deptCode || item.id || '',
          });
          walk(item.children || [], id, itemPath);
        }
      }
      walk(value.departmentTree, null, []);
      const allowed = flattened.filter(
        (item) =>
          !value.restrictToAllowedDepartments ||
          value.allowedDepartmentPaths.some(
            (root) => root.length && root.every((name, i) => name === item.path[i]),
          ),
      );
      departments.splice(0, departments.length, ...allowed);
      seedMockWorkflowInventory({
        departments,
        workflows,
        assets,
        commands,
        seededDepartmentIds: mockWorkflowSeededDepartments,
      });
      if (!allowed.some((item) => item._id === selectedDeptId.value)) {
        selectedDeptId.value =
          (
            allowed.find((item) => item.path.join('/') === value.defaultDepartmentPath.join('/')) ||
            allowed[0]
          )?._id || '';
      }
    },
    { deep: true, immediate: true },
  );
  watch(harnessConfigurationRevision, () => {
    const change = lastHarnessConfigurationChange.value;
    if (!ownSave && change?.kind === 'scene' && productOptions.value.length) void reloadScenes();
  });

  async function commitRecords(product: Product, records: TaxonomyRecord[]) {
    if (saving.value) throw new Error('正在保存场景，请稍候');
    saving.value = true;
    ownSave = true;
    const userAtSave = contextUser;
    try {
      const saved = await saveScenarioRecords(scopeFor(product), records);
      if (contextUser !== userAtSave || !available.value)
        throw new Error('管理范围已切换，请刷新场景配置');
      applyRecords(product, saved);
      if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT !== 'http') {
        for (const other of productOptions.value)
          if (other._id !== product._id) applyRecords(other, saved);
      }
    } finally {
      saving.value = false;
      ownSave = false;
    }
  }
  async function saveScenario(scenario: Scenario): Promise<Scenario> {
    const product = currentProduct();
    if (scenario.productId !== product._id) throw new Error('场景不属于当前产品');
    const records = clone(recordsByProduct.get(product._id) || []);
    const parent = scenario.parentId
      ? scenarios.find((item) => item._id === scenario.parentId && item.productId === product._id)
      : undefined;
    if (scenario.parentId && (!parent || parent.level !== 1))
      throw new Error('场景最多两级，二级场景必须归属一级场景');
    const parentId = parent?.sourceId || null;
    const name = scenario.name.trim();
    if (!name) throw new Error('请填写场景名称');
    if (
      records.some(
        (item) => item.parentId === parentId && item.name === name && item.id !== scenario.sourceId,
      )
    )
      throw new Error('同一层级下已存在同名场景');
    const existing = records.find((item) => item.id === scenario.sourceId);
    if (existing && existing.name !== name && existing.skillCount > 0)
      throw new Error('场景已关联规划项，请先解除关联后再编辑');
    if (existing) existing.name = name;
    else
      records.push({
        id: uid('scene'),
        parentId,
        name,
        sort: records.filter((item) => item.parentId === parentId).length + 1,
        status: 'enabled',
        skillCount: 0,
        tags: scenario.tags,
      });
    await commitRecords(product, records);
    const saved = scenarios.find(
      (item) =>
        item.productId === product._id && item.name === name && item.parentId === scenario.parentId,
    );
    if (!saved) throw new Error('场景保存后未返回，请刷新重试');
    saveScenarioDetails(saved._id, scenario);
    if (saved.level === 1 && scenario.tags.length) {
      try {
        await setScenarioTags(saved._id, scenario.tags);
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '场景已保存，但标签保存失败';
      }
    }
    return saved;
  }
  async function setScenarioTags(id: string, tags: string[]) {
    const product = currentProduct();
    const scenario = scenarios.find((item) => item._id === id && item.productId === product._id);
    const record = recordsByProduct
      .get(product._id)
      ?.find((item) => item.id === scenario?.sourceId);
    if (!scenario || !record || scenario.level !== 1) throw new Error('请选择一级场景');
    if (saving.value) throw new Error('正在保存，请稍候');
    saving.value = true;
    ownSave = true;
    try {
      const saved = await saveScenarioTagBindings(scopeFor(product), record, tags);
      scenario.tags = [...saved];
      record.tags = [...saved];
    } finally {
      saving.value = false;
      ownSave = false;
    }
  }
  function saveScenarioDetails(id: string, values: ScenarioDetails) {
    const scenario = scenarios.find((item) => item._id === id);
    if (!available.value || !scenario || scenario.productId !== productId.value) return;
    Object.assign(scenario, {
      code: values.code,
      description: values.description,
      releaseCount: values.releaseCount || 0,
    });
    details[id] = {
      code: scenario.code,
      description: scenario.description,
      releaseCount: scenario.releaseCount,
    };
  }
  async function removeScenario(scenario: Scenario) {
    const product = currentProduct();
    if (scenario.productId !== product._id) throw new Error('场景不属于当前产品');
    const records = clone(recordsByProduct.get(product._id) || []);
    const source = records.find((item) => item.id === scenario.sourceId);
    if (!source) return;
    if (records.some((item) => item.parentId === source.id))
      throw new Error('请先删除该场景下的二级场景');
    if (source.skillCount > 0)
      throw new Error('场景已关联 ' + source.skillCount + ' 个规划项，请先解除关联后再删除。');
    await commitRecords(
      product,
      records.filter((item) => item.id !== source.id),
    );
  }
  async function moveScenario(scenario: Scenario, direction: number) {
    const product = currentProduct();
    const records = clone(recordsByProduct.get(product._id) || []);
    const source = records.find((item) => item.id === scenario.sourceId);
    if (!source) return;
    const siblings = records
      .filter((item) => item.parentId === source.parentId)
      .sort((a, b) => a.sort - b.sort);
    const target = siblings[siblings.indexOf(source) + direction];
    if (!target) return;
    [source.sort, target.sort] = [target.sort, source.sort];
    await commitRecords(product, records);
  }
  async function reorderScenario(
    sourceId: string,
    targetId: string,
    placement: 'before' | 'after',
  ): Promise<void> {
    const product = currentProduct();
    if (placement !== 'before' && placement !== 'after') throw new Error('请选择有效的排序位置');
    const sourceScenario = scenarios.find(
      (item) => item._id === sourceId && item.productId === product._id,
    );
    const targetScenario = scenarios.find(
      (item) => item._id === targetId && item.productId === product._id,
    );
    if (!sourceScenario || !targetScenario) throw new Error('请选择当前产品下的有效场景');
    const records = clone(recordsByProduct.get(product._id) || []);
    const source = records.find((item) => item.id === sourceScenario.sourceId);
    const target = records.find((item) => item.id === targetScenario.sourceId);
    if (!source || !target) throw new Error('场景不存在，请刷新后重试');
    if (source.parentId !== target.parentId) throw new Error('只能对同一父级下的场景排序');
    if (source.id === target.id) return;
    const siblings = records
      .filter((item) => item.parentId === source.parentId)
      .sort((a, b) => a.sort - b.sort);
    const reordered = siblings.filter((item) => item.id !== source.id);
    const targetIndex = reordered.findIndex((item) => item.id === target.id);
    reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, source);
    if (reordered.every((item, index) => item.id === siblings[index]?.id)) return;
    reordered.forEach((item, index) => (item.sort = index + 1));
    await commitRecords(product, records);
  }
  function ensureWorkflow(scenarioId: string): Workflow {
    const product = currentProduct();
    const scenario = scenarios.find(
      (item) => item._id === scenarioId && item.productId === product._id,
    );
    if (!scenario || scenario.level !== 2) throw new Error('只能在二级场景上创建 Harness 工作流');
    const existing = workflows.find((item) => item.scenarioId === scenarioId);
    if (existing) return existing;
    const workflow = reactive<Workflow>({
      _id: uid('workflow'),
      name: scenario.name + '作业流',
      description: scenario.description,
      businessScenario: scenario.name,
      scenarioId,
      status: 'draft',
      releaseCount: 0,
      stages: [],
      assets: [],
      commands: [],
    });
    workflows.push(workflow);
    return workflow;
  }
  async function loadLegacyActivities() {
    return loadLegacyActivityRecords(scopeFor(currentProduct()));
  }
  async function bindLegacyActivity(activityId: string) {
    const scenarioId = selectedScenarioId.value;
    const selectedProduct = productId.value;
    const legacy = await loadLegacyActivities();
    if (scenarioId !== selectedScenarioId.value || selectedProduct !== productId.value)
      throw new Error('场景范围已切换，请重新选择活动');
    const primary = legacy.find((item) => item.id === activityId && !item.parentId);
    if (!primary) throw new Error('请选择已有归属活动');
    const workflow = ensureWorkflow(scenarioId);
    if (
      workflow.stages.some(
        (item) => item.sourceActivityId === primary.id || item.name === primary.name,
      )
    )
      throw new Error('当前场景已存在该环节');
    workflow.stages.push({
      id: uid('stage'),
      sourceActivityId: primary.id,
      name: primary.name,
      description: '',
      order: workflow.stages.length,
      steps: legacy
        .filter((item) => item.parentId === primary.id)
        .sort((a, b) => a.sort - b.sort)
        .map((item, index) => ({
          id: uid('node'),
          sourceActivityId: item.id,
          name: item.name,
          description: '',
          order: index,
          assets: [],
        })),
    });
  }
  return {
    departments,
    products,
    scenarios,
    workflows,
    assets,
    commands,
    selectedDeptId,
    productId,
    selectedScenarioId,
    productOptions,
    inventoryProductOptions,
    ensureInventoryScope,
    departmentIsInScope,
    deptPath,
    selectDepartment,
    selectScope,
    loading,
    available,
    saving,
    error,
    reloadScenes,
    saveScenario,
    saveScenarioDetails,
    setScenarioTags,
    removeScenario,
    moveScenario,
    reorderScenario,
    ensureWorkflow,
    loadLegacyActivities,
    bindLegacyActivity,
  };
}
export type HarnessScenarioWorkspace = ReturnType<typeof createHarnessScenarioWorkspace>;

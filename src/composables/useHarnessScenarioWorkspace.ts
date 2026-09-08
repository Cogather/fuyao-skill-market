import { computed, reactive, ref, watch } from 'vue';
import {
  harnessWorkflowService,
  type WorkflowProgressStep,
  type WorkflowSceneContext,
  type WorkflowDetail,
} from '../services/skillMarket/businessScenarioDesignService';
import {
  businessScenarioTaxonomyClient,
  designData,
  loadDesignDetail,
  mapDesignDetail,
  saveDesignMetadata,
  saveDesignActivities,
  prepareDesignActivityChanges,
  saveDesignCommands,
  saveDesignAssets,
  loadDesignProducts,
  queryDesignCapabilities,
  queryDesignUsers,
  createDesignCapability,
  attachDesignCapability,
  hasDesignBindings,
} from '../services/skillMarket/businessScenarioDesignRepository';
import { validateWorkflowCapabilityName } from '../utils/workflowCapabilityName';
import {
  queryWorkflowCapabilityOptions,
  type WorkflowCapabilityType,
} from '../services/skillMarket/workflowCapabilitySearchService';
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
export type CapabilityPersonnel = {
  ownerId?: string;
  developerId?: string;
  ownerDepartment?: string;
  developerDepartment?: string;
};
export type CommandRef = CapabilityPersonnel & {
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
  progress?: { steps: WorkflowProgressStep[]; nextStep: number; allDone: boolean };
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
export type Asset = CapabilityPersonnel & {
  packageReady?: boolean;
  _id: string;
  sourceId?: string;
  productId?: string;
  name: string;
  assetType: AssetType;
  owner: string;
  developer: string;
  description: string;
  version: string | null;
  status: string;
  dueDate?: string | null;
};
export type Command = CapabilityPersonnel & {
  _id: string;
  sourceId?: string;
  productId?: string;
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
type ScenarioDetails = Pick<Scenario, 'code' | 'description' | 'releaseCount'> & { name?: string };

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

/** HTTP designs are authoritative on the server; mock mode retains the local demonstration workspace. */
export function createHarnessScenarioWorkspace(context: () => ScenarioWorkspaceContext) {
  const isHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
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
  const workflowLoading = ref(false);
  let workflowLoadSequence = 0;
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
  const workflowListScope = computed(() => {
    const department = departments.find((item) => item._id === selectedDeptId.value);
    if (!context().ready || !context().userId || !department) return null;
    return {
      userId: context().userId,
      dimName: department.path.map((name) => name.trim()).join('/'),
    };
  });
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
  function dimensionFor(product: Product) {
    return {
      userId: context().userId,
      dimType: '产品级',
      dimCode: product.code,
      dimName: product.name,
    };
  }
  function sceneContext(id = selectedScenarioId.value): WorkflowSceneContext {
    const product = currentProduct();
    const scenario = scenarios.find((item) => item._id === id && item.productId === product._id);
    const parent = scenarios.find((item) => item._id === scenario?.parentId);
    if (!scenario || scenario.level !== 2 || !parent) throw new Error('请选择二级场景');
    return { ...dimensionFor(product), firstScene: parent.name, secondScene: scenario.name };
  }
  function applyWorkflowDetail(
    scope: WorkflowSceneContext,
    data: Awaited<ReturnType<typeof loadDesignDetail>>,
    scenarioId: string,
    selectedProductId: string,
  ) {
    const mapped = mapDesignDetail(scope, data, scenarioId, selectedProductId);
    for (const item of mapped.assets) {
      const existing = assets.find((asset) => asset._id === item._id);
      if (existing) Object.assign(existing, item);
      else assets.push(item);
    }
    for (const item of mapped.commands) {
      const existing = commands.find((command) => command._id === item._id);
      if (existing) Object.assign(existing, item);
      else commands.push(item);
    }
    const existing = workflows.find((item) => item.scenarioId === scenarioId);
    if (existing) Object.assign(existing, mapped.workflow);
    else if (
      data.flowName ||
      data.flowDescription ||
      data.stages.length ||
      data.commands.length ||
      data.assetPool.length
    )
      workflows.push(mapped.workflow);
    const scenario = scenarios.find((item) => item._id === scenarioId);
    if (scenario)
      saveScenarioDetails(scenarioId, {
        code: data.sceneExtensionCode || '',
        description: data.secondSceneDescription || '',
        releaseCount: scenario.releaseCount,
      });
    const source = recordsByProduct
      .get(selectedProductId)
      ?.find((item) => item.id === scenario?.sourceId);
    if (source)
      Object.assign(source, { flowName: data.flowName, flowDescription: data.flowDescription });
    return mapped.workflow;
  }
  async function loadSelectedWorkflow() {
    const sequence = ++workflowLoadSequence;
    workflowLoading.value = false;
    if (
      !isHttp ||
      saving.value ||
      !available.value ||
      !scenarios.some((item) => item._id === selectedScenarioId.value && item.level === 2)
    )
      return;
    const id = selectedScenarioId.value;
    const selectedProduct = productId.value;
    const scope = sceneContext(id);
    workflowLoading.value = true;
    try {
      const data = await loadDesignDetail(scope);
      if (
        sequence !== workflowLoadSequence ||
        id !== selectedScenarioId.value ||
        selectedProduct !== productId.value
      )
        return;
      applyWorkflowDetail(scope, data, id, selectedProduct);
      error.value = '';
    } catch (cause) {
      if (sequence === workflowLoadSequence)
        error.value = cause instanceof Error ? cause.message : 'Workflow 详情加载失败';
    } finally {
      if (sequence === workflowLoadSequence) workflowLoading.value = false;
    }
  }
  watch([selectedScenarioId, available], loadSelectedWorkflow);
  async function saveWorkflow(workflow: Workflow, values: ScenarioDetails): Promise<Workflow> {
    if (!isHttp) {
      const scenario = scenarios.find((item) => item._id === workflow.scenarioId);
      if (scenario && values.name?.trim() && scenario.name !== values.name.trim())
        await saveScenario({ ...scenario, ...values, name: values.name.trim() });
      return workflow;
    }
    if (saving.value) throw new Error('正在保存，请稍候');
    const product = currentProduct();
    assertScenarioCode(values.code, product);
    let scope = sceneContext(workflow.scenarioId);
    const selectedProduct = productId.value;
    let scenario = scenarios.find((item) => item._id === workflow.scenarioId)!;
    const draft = clone(workflow);
    const scenarioDraft = {
      ...scenario,
      ...values,
      name: values.name?.trim() ?? scenario.name,
      code: values.code.trim(),
      description: values.description.trim(),
    };
    if (!scenarioDraft.name) throw new Error('请填写场景名称');
    const renamed = scenario.name !== scenarioDraft.name;
    const assertScope = () => {
      if (
        !available.value ||
        scope.userId !== context().userId ||
        selectedProduct !== productId.value ||
        draft.scenarioId !== selectedScenarioId.value
      )
        throw new Error('场景范围已切换，请重新加载设计');
    };
    saving.value = true;
    try {
      let before = await loadDesignDetail(scope);
      assertScope();
      await prepareDesignActivityChanges(scope, draft, before);
      if (renamed) {
        await assertScenarioRenameAllowed(product, scenario, before);
        assertScope();
        const records = clone(recordsByProduct.get(product._id) || []);
        const source = records.find((item) => item.id === scenario.sourceId);
        if (!source) throw new Error('场景不存在，请刷新后重试');
        source.name = scenarioDraft.name;
        // Keep old metadata in the full refresh; write new values only after the new identity exists.
        await commitRecords(product, records, true);
        assertScope();
        scenario = scenarios.find((item) => item._id === draft.scenarioId)!;
        scope = sceneContext(draft.scenarioId);
        before = await loadDesignDetail(scope);
      }
      assertScope();
      await saveDesignMetadata(
        scope,
        scenarioDraft,
        draft,
        before,
        (metadata) => {
          // Each successful write is already committed even if a later endpoint rejects the save.
          const source = recordsByProduct
            .get(selectedProduct)
            ?.find((item) => item.id === scenario.sourceId);
          if (source) Object.assign(source, metadata);
          if (metadata.sceneExtensionCode !== undefined)
            scenario.code = metadata.sceneExtensionCode || '';
          if (metadata.secondSceneDescription !== undefined)
            scenario.description = metadata.secondSceneDescription || '';
        },
        renamed,
      );
      assertScope();
      await saveDesignActivities(scope, draft, before);
      assertScope();
      await saveDesignCommands(scope, draft, before);
      assertScope();
      await saveDesignAssets(scope, draft, assets, before);
      assertScope();
      const saved = await loadDesignDetail(scope);
      assertScope();
      return applyWorkflowDetail(scope, saved, draft.scenarioId, selectedProduct);
    } finally {
      saving.value = false;
    }
  }
  async function attachCapability(type: WorkflowCapabilityType, item: Asset | Command) {
    if (!isHttp) return;
    if (saving.value) throw new Error('正在保存，请稍候');
    const scope = sceneContext();
    saving.value = true;
    try {
      await attachDesignCapability(scope, type, item);
    } finally {
      saving.value = false;
    }
  }
  async function removePoolAsset(item: Asset) {
    if (!isHttp) return;
    if (saving.value) throw new Error('正在保存，请稍候');
    const scope = sceneContext();
    saving.value = true;
    try {
      designData(
        await harnessWorkflowService.componentExitPool({
          ...scope,
          assetType: item.assetType === 'Skill' ? 'SKILL' : 'AGENT',
          assetName: item.name,
        }),
      );
    } finally {
      saving.value = false;
    }
  }
  async function createCapability(
    type: WorkflowCapabilityType,
    item: Asset | Command,
    onCreated?: (saved: Asset | Command) => void,
  ) {
    const product = currentProduct();
    const invalid = validateWorkflowCapabilityName(
      type === 'Command' ? item.name.replace(/^\/+/, '') : item.name,
      product.name,
      product.code,
    );
    if (invalid) throw new Error(`${type} 名称不符合命名规则：${invalid}`);
    if (!isHttp) {
      onCreated?.(item);
      return item;
    }
    if (saving.value) throw new Error('正在保存，请稍候');
    const scope = sceneContext();
    const scenarioId = selectedScenarioId.value;
    saving.value = true;
    try {
      const created = await createDesignCapability(type, item, dimensionFor(product));
      onCreated?.(created);
      try {
        if (
          !available.value ||
          productId.value !== product._id ||
          selectedScenarioId.value !== scenarioId ||
          context().userId !== scope.userId
        )
          throw new Error('场景范围已切换，请回到原场景重新选择');
        await attachDesignCapability(scope, type, created);
      } catch (cause) {
        throw new Error(
          `${type} 已创建，但${type === 'Command' ? '场景绑定' : '入池'}失败：${cause instanceof Error ? cause.message : '请求失败'}。请从资产清单重新选择，无需重复创建`,
        );
      }
      return created;
    } finally {
      saving.value = false;
    }
  }
  async function listDesignTags(): Promise<string[]> {
    if (!isHttp) {
      const { listScenarioTags } =
        await import('../services/skillMarket/harnessScenarioTaxonomyService');
      return (await listScenarioTags()).map((item) => item.name);
    }
    const data = designData<(string | { tagName?: string; name?: string })[]>(
      await harnessWorkflowService.querySceneTags(),
    );
    return data
      .map((item) => (typeof item === 'string' ? item : item.tagName || item.name || ''))
      .filter(Boolean);
  }
  function persist() {
    if (isHttp) return;
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
    if (isHttp) {
      loadingStorage = false;
      return;
    }
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
          code: (isHttp ? item.sceneExtensionCode : details[id]?.code) || '',
          description: (isHttp ? item.secondSceneDescription : details[id]?.description) || '',
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
          records: await loadScenarioRecords(scopeFor(product), businessScenarioTaxonomyClient),
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
      const options = isHttp
        ? await loadDesignProducts(department.deptCode)
        : await getProductPlanning('', department.name, department.deptCode);
      if (sequence !== loadSequence) return;
      for (let i = products.length - 1; i >= 0; i--)
        if (products[i]?.departmentId === department._id) products.splice(i, 1);
      const loaded = options.map(
        (item): Product => ({
          _id: JSON.stringify([department._id, item.offeringId || item.offeringName]),
          name: item.offeringName,
          code: item.offeringId,
          departmentId: department._id,
        }),
      );
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
          records: await loadScenarioRecords(scopeFor(product), businessScenarioTaxonomyClient),
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
    if ((id && !departments.some((item) => item._id === id)) || id === selectedDeptId.value) return;
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
        const options = isHttp
          ? await loadDesignProducts(department.deptCode)
          : await getProductPlanning('', department.name, department.deptCode);
        return Promise.all(
          options.map(async (option) => {
            const product: Product = {
              _id: JSON.stringify([id, option.offeringId || option.offeringName]),
              code: option.offeringId,
              name: option.offeringName,
              departmentId: id,
            };
            return {
              product,
              records: await loadScenarioRecords(scopeFor(product), businessScenarioTaxonomyClient),
            };
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

  async function commitRecords(
    product: Product,
    records: TaxonomyRecord[],
    withinSave = false,
    onCommitted?: () => void,
  ) {
    if (saving.value && !withinSave) throw new Error('正在保存场景，请稍候');
    const wasSaving = saving.value;
    const wasOwnSave = ownSave;
    saving.value = true;
    ownSave = true;
    const userAtSave = contextUser;
    try {
      const saved = await saveScenarioRecords(
        scopeFor(product),
        records,
        businessScenarioTaxonomyClient,
        (committed) => {
          if (contextUser === userAtSave && available.value) {
            applyRecords(product, committed);
            onCommitted?.();
          }
        },
      );
      if (contextUser !== userAtSave || !available.value)
        throw new Error('管理范围已切换，请刷新场景配置');
      applyRecords(product, saved);
      onCommitted?.();
      if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT !== 'http') {
        for (const other of productOptions.value)
          if (other._id !== product._id) applyRecords(other, saved);
      }
    } finally {
      saving.value = wasSaving;
      ownSave = wasOwnSave;
    }
  }
  function assertScenarioCode(code: string, product: Product) {
    if (!code.trim() && isHttp) return;
    const invalid = validateWorkflowCapabilityName(code, product.name, product.code);
    if (invalid) throw new Error(`场景编码不符合命名规则：${invalid}`);
  }
  async function assertScenarioRenameAllowed(
    product: Product,
    scenario: Scenario,
    knownDetail?: WorkflowDetail,
  ) {
    const targets = scenarios.filter(
      (item) =>
        item.productId === product._id &&
        (item._id === scenario._id || item.parentId === scenario._id),
    );
    if (targets.some((item) => (item.skillCount || 0) > 0))
      throw new Error('场景已关联资产，请先解除绑定后再改名');
    for (const target of targets.filter((item) => item.level === 2)) {
      if (isHttp) {
        const data =
          target._id === scenario._id && knownDetail
            ? knownDetail
            : await loadDesignDetail(sceneContext(target._id));
        if (hasDesignBindings(data))
          throw new Error(`场景“${target.name}”已绑定资产，请先解除绑定后再改名`);
      } else {
        const workflow = workflows.find((item) => item.scenarioId === target._id);
        if (
          workflow &&
          (workflow.commands.length ||
            workflow.assets.length ||
            workflow.stages.some((stage) => stage.steps.some((node) => node.assets.length)))
        )
          throw new Error(`场景“${target.name}”已绑定资产，请先解除绑定后再改名`);
      }
    }
  }
  async function saveScenario(scenario: Scenario): Promise<Scenario> {
    if (saving.value) throw new Error('正在保存场景，请稍候');
    saving.value = true;
    try {
      return await saveScenarioDraft(scenario);
    } finally {
      saving.value = false;
    }
  }
  async function saveScenarioDraft(scenario: Scenario): Promise<Scenario> {
    const product = currentProduct();
    if (scenario.productId !== product._id) throw new Error('场景不属于当前产品');
    if (scenario.level === 2) assertScenarioCode(scenario.code, product);
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
    if (existing && existing.name !== name)
      await assertScenarioRenameAllowed(
        product,
        scenarios.find((item) => item.sourceId === existing.id && item.productId === product._id)!,
      );
    if (existing) {
      existing.name = name;
    } else
      records.push({
        id: uid('scene'),
        parentId,
        name,
        sort: records.filter((item) => item.parentId === parentId).length + 1,
        status: 'enabled',
        skillCount: 0,
        tags: scenario.tags,
        ...(isHttp && parentId
          ? {
              sceneExtensionCode: null,
              secondSceneDescription: '',
              flowName: null,
              flowDescription: null,
            }
          : {}),
      });
    if (productId.value !== product._id || !available.value)
      throw new Error('场景范围已切换，请重新加载');
    await commitRecords(product, records, true, () => {
      const committed = scenarios.find(
        (item) =>
          item.productId === product._id &&
          item.name === name &&
          item.parentId === scenario.parentId,
      );
      if (committed) {
        scenario._id = committed._id;
        scenario.sourceId = committed.sourceId;
      }
    });
    const saved = scenarios.find(
      (item) =>
        item.productId === product._id && item.name === name && item.parentId === scenario.parentId,
    );
    if (!saved) throw new Error('场景保存后未返回，请刷新重试');
    // Expose committed identity to the caller even when a following metadata write fails.
    scenario._id = saved._id;
    scenario.sourceId = saved.sourceId;
    if (isHttp && saved.level === 2) {
      try {
        const { firstScene, secondScene } = sceneContext(saved._id);
        designData(
          await harnessWorkflowService.updateSecondSceneCode(
            {
              firstScene,
              secondScene,
              sceneExtensionCode: scenario.code.trim(),
              secondSceneDescription: scenario.description.trim(),
            },
            dimensionFor(product),
          ),
        );
        saveScenarioDetails(saved._id, scenario);
        if (existing && (existing.flowName || existing.flowDescription))
          designData(
            await harnessWorkflowService.updateSceneMetadata(
              {
                firstScene,
                secondScene,
                flowName: existing.flowName || '',
                flowDescription: existing.flowDescription || '',
              },
              dimensionFor(product),
            ),
          );
      } catch (cause) {
        error.value = `场景名称已保存，但编码或描述保存失败：${cause instanceof Error ? cause.message : '请重新设置'}`;
        throw new Error(error.value);
      }
    } else saveScenarioDetails(saved._id, scenario);
    if (saved.level === 1 && scenario.tags.length) {
      try {
        await setScenarioTags(saved._id, scenario.tags, true);
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '场景已保存，但标签保存失败';
      }
    }
    return saved;
  }
  async function setScenarioTags(id: string, tags: string[], withinSave = false) {
    const product = currentProduct();
    const scenario = scenarios.find((item) => item._id === id && item.productId === product._id);
    const record = recordsByProduct
      .get(product._id)
      ?.find((item) => item.id === scenario?.sourceId);
    if (!scenario || !record || scenario.level !== 1) throw new Error('请选择一级场景');
    if (saving.value && !withinSave) throw new Error('正在保存，请稍候');
    const wasSaving = saving.value;
    const wasOwnSave = ownSave;
    saving.value = true;
    ownSave = true;
    try {
      const saved = isHttp
        ? await (async () => {
            const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
            designData(
              await harnessWorkflowService.saveSceneTags(
                { bindings: [{ firstScene: scenario.name, tags: normalized }] },
                dimensionFor(product),
              ),
            );
            return normalized;
          })()
        : await saveScenarioTagBindings(scopeFor(product), record, tags);
      scenario.tags = [...saved];
      record.tags = [...saved];
    } finally {
      saving.value = wasSaving;
      ownSave = wasOwnSave;
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
    if (isHttp) {
      const record = recordsByProduct
        .get(scenario.productId)
        ?.find((item) => item.id === scenario.sourceId);
      if (record)
        Object.assign(record, {
          sceneExtensionCode: scenario.code,
          secondSceneDescription: scenario.description,
        });
    }
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
    if (!isHttp) workflows.push(workflow);
    return workflow;
  }
  async function loadLegacyActivities() {
    if (isHttp) {
      const rows = designData<
        { activityNodeName: string; subActivityNodeName: string; sort: number }[]
      >(await harnessWorkflowService.queryActivitiesByScene(sceneContext()));
      const records: TaxonomyRecord[] = [];
      for (const row of rows) {
        const parentId = JSON.stringify(['activity', row.activityNodeName]);
        if (!records.some((item) => item.id === parentId))
          records.push({
            id: parentId,
            parentId: null,
            name: row.activityNodeName,
            sort: row.sort,
            status: 'enabled',
            skillCount: 0,
          });
        if (row.subActivityNodeName)
          records.push({
            id: JSON.stringify([parentId, row.subActivityNodeName]),
            parentId,
            name: row.subActivityNodeName,
            sort: row.sort,
            status: 'enabled',
            skillCount: 0,
          });
      }
      return records;
    }
    return loadLegacyActivityRecords(scopeFor(currentProduct()));
  }
  function queryCapabilityOptions(type: WorkflowCapabilityType, keyword: string, pageNum = 1) {
    if (isHttp)
      return queryDesignCapabilities(type, dimensionFor(currentProduct()), keyword, pageNum);
    const scope = scopeFor(currentProduct());
    return queryWorkflowCapabilityOptions(
      type,
      {
        userId: scope.userId,
        productCode: scope.offeringId!,
        productName: scope.offeringName!,
        departmentName: scope.departmentName,
      },
      keyword,
      pageNum,
    );
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
    isHttp,
    workflowLoading,
    loadSelectedWorkflow,
    saveWorkflow,
    createCapability,
    attachCapability,
    removePoolAsset,
    listDesignTags,
    queryDesignUsers,
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
    workflowListScope,
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
    queryCapabilityOptions,
  };
}
export type HarnessScenarioWorkspace = ReturnType<typeof createHarnessScenarioWorkspace>;

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import WorkflowCapabilityPicker from '../../components/skill/WorkflowCapabilityPicker.vue';
import WorkflowPersonPicker from '../../components/skill/WorkflowPersonPicker.vue';
import type { SkillPlanningUserOption } from '../../services/skillMarket/skillPlanningService';
import type { WorkflowCapabilityOption } from '../../services/skillMarket/workflowCapabilitySearchService';
import type {
  Asset,
  AssetType,
  Command,
  CommandRef,
  HarnessScenarioWorkspace,
  Scenario,
  Workflow,
} from '../../composables/useHarnessScenarioWorkspace';

const props = defineProps<{ workspace: HarnessScenarioWorkspace }>();
const {
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
  deptPath,
  selectDepartment,
  loading,
  available,
  saving,
  workflowLoading,
  error: workspaceError,
} = props.workspace;
type Wizard = {
  workflow: Workflow;
  step: number;
  maxReached: number;
  form: {
    name: string;
    description: string;
    code: string;
    scenarioName: string;
    scenarioDesc: string;
  };
  nodeAssetsMap: Record<string, string[]>;
  poolIds: string[];
  assetTypeTab: AssetType;
  error: string;
  stageDraft: { id?: string; name: string; description: string } | null;
  nodeDraft: { stageId: string; id?: string; name: string; description: string } | null;
  commandDraft: {
    name: string;
    description: string;
    developer: SkillPlanningUserOption | null;
    owner: SkillPlanningUserOption | null;
    dueDate: string;
  } | null;
  assetDraft: {
    name: string;
    assetType: AssetType;
    description: string;
    developer: SkillPlanningUserOption | null;
    owner: SkillPlanningUserOption | null;
    dueDate: string;
  } | null;
};

const tags = ref<string[]>([]);
const tagSearch = ref('');
const filteredTags = computed(() => {
  const query = tagSearch.value.trim().toLocaleLowerCase();
  return tags.value.filter((tag) => tag.toLocaleLowerCase().includes(query));
});
async function loadTags() {
  try {
    tags.value = await props.workspace.listDesignTags();
  } catch (error) {
    workspaceError.value = error instanceof Error ? error.message : '标签加载失败';
  }
}
const accents = ['#2563eb', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
const scenarioPageRoot = ref<HTMLElement | null>(null);
const scenarioDialogElement = ref<HTMLElement | null>(null);
const tagDialogElement = ref<HTMLElement | null>(null);
const deleteDialogElement = ref<HTMLElement | null>(null);
const wizardDialogElement = ref<HTMLElement | null>(null);
let scenarioDialogOpener: HTMLElement | null = null;
let tagDialogOpener: HTMLElement | null = null;
let deleteDialogOpener: HTMLElement | null = null;
let wizardOpener: HTMLElement | null = null;
const focusableSelector =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const wizardSteps = ['业务场景分析', 'Workflow 规划', 'Command 入口', 'Skill / Agent 集成'];
const collapsed = reactive<Record<string, boolean>>({});
const deptOpen = ref(false);
const scenarioDialog = ref<{ parentId: string | null } | null>(null);
const deleteTarget = ref<Scenario | null>(null);
const tagTarget = ref<Scenario | null>(null);
const wizard = ref<Wizard | null>(null);
const capabilitySaving = ref(false);
const wizardBusy = computed(() => saving.value || capabilitySaving.value);
const draggedScenarioId = ref('');
const scenarioDropTarget = ref<{ id: string; placement: 'before' | 'after' } | null>(null);
const sortingMessage = ref('');
const sortingFailed = ref(false);
const sortingPending = ref(false);
const canSortScenarios = computed(() => available.value && !loading.value && !saving.value);
let sortingScope = 0;
const scenarioError = ref('');
const scenarioForm = reactive({ name: '', code: '', description: '', tags: [] as string[] });
const uid = (prefix: string) => `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const currentProduct = computed(() => products.find((item) => item._id === productId.value));
function isLocalProductOption(item: { sourceId?: string; productId?: string; name: string }) {
  if (item.sourceId) return false;
  if (item.productId) return item.productId === productId.value;
  const prefix = productPrefix();
  return Boolean(prefix && item.name.replace(/^\//, '').startsWith(prefix));
}
const localCommandOptions = computed<WorkflowCapabilityOption[]>(() =>
  commands.filter(isLocalProductOption).map((item) => ({ ...item, type: 'Command' })),
);
const localAssetOptions = computed<WorkflowCapabilityOption[]>(() =>
  assets.filter(isLocalProductOption).map((item) => ({ ...item, type: item.assetType })),
);
function selectCapability(option: WorkflowCapabilityOption) {
  if (option.type === 'Command') {
    if (!commands.some((item) => item._id === option._id)) commands.push({ ...option });
    addCommand(option._id);
  } else {
    if (!assets.some((item) => item._id === option._id)) {
      assets.push({ ...option, assetType: option.type, status: option.status || 'active' });
    }
    if (!wizard.value?.poolIds.includes(option._id)) togglePool(option._id);
  }
}
const currentScenario = computed(() =>
  scenarios.find((item) => item._id === selectedScenarioId.value),
);
const currentWorkflows = computed(() =>
  workflows.filter((item) => item.scenarioId === selectedScenarioId.value),
);
watch([selectedDeptId, productId, selectedScenarioId, available], () => {
  if (
    wizard.value &&
    (!available.value || wizard.value.workflow.scenarioId !== selectedScenarioId.value)
  )
    dismissWizard();
});
watch([selectedDeptId, productId], () => {
  if (scenarioDialog.value) closeScenarioDialog();
  if (deleteTarget.value) closeDeleteDialog();
  if (tagTarget.value) closeTagDialog();
});
watch([selectedDeptId, productId, available], () => {
  sortingScope += 1;
  clearScenarioDrag();
  sortingMessage.value = '';
  sortingFailed.value = false;
});
const productPrefix = (productName = currentProduct.value?.name ?? '') => {
  if (!productName) return '';
  const source = /^[a-z0-9-]+$/i.test(productName)
    ? productName
    : products.find((item) => item.name === productName)?.code || 'product';
  const prefix =
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'product';
  return `${prefix}-`;
};
function validateName(value: string, productName = currentProduct.value?.name ?? '') {
  const name = value.trim();
  const prefix = productPrefix(productName);
  if (!name) return '请填写名称';
  if (name.length > 64) return '名称长度不能超过 64 个字符';
  if (name !== name.toLowerCase()) return '必须全部小写';
  if (!/^[a-z0-9-]+$/.test(name)) return '只能包含小写字母、数字和连字符';
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--'))
    return '连字符不能在开头/结尾，也不能连续出现';
  if (prefix && !name.startsWith(prefix)) return `必须以产品名开头，例如：${prefix}xxx`;
  return '';
}
function scenarioValidationError(
  scenario: Pick<Scenario, 'name' | 'description' | 'code' | 'releaseCount'>,
  productName: string,
): string {
  if (!scenario.name.trim()) return '请填写场景名称';
  if (!scenario.description.trim()) return '请填写场景说明与目标';
  if (!scenario.releaseCount && (!props.workspace.isHttp || scenario.code.trim())) {
    const error = validateName(scenario.code, productName);
    if (error) return `场景编码不符合命名规则：${error}`;
  }
  return '';
}
function workflowPlanningError(workflow: Workflow): string {
  if (!workflow.stages.length) return '请至少定义一个 Workflow 环节';
  if (workflow.stages.some((stage) => !stage.steps.length))
    return '每个 Workflow 环节至少需要一个节点';
  return '';
}
function hasMainEntry(commandsToCheck: CommandRef[], productName: string): boolean {
  const prefix = productPrefix(productName).replace(/-$/, '');
  return commandsToCheck.some((command) => {
    const name = command.name.trim().replace(/^\//, '');
    return /^e2e(-|$)/.test(name) || Boolean(prefix && name.startsWith(`${prefix}-e2e`));
  });
}
function commandValidationError(workflow: Workflow): string {
  if (!workflow.commands.length) return '请至少设计一个 Command 入口';
  return '';
}
function assetIntegrationError(
  workflow: Workflow,
  poolIds = workflow.assets.map((asset) => asset.assetId),
  nodeAssetsMap: Record<string, string[]> = Object.fromEntries(
    workflow.stages.flatMap((stage) =>
      stage.steps.map((node) => [node.id, node.assets.map((asset) => asset.assetId)]),
    ),
  ),
): string {
  const nodes = workflow.stages.flatMap((stage) => stage.steps);
  if (!poolIds.length) return '请至少添加一个 Agent / Skill 到 Workflow 资产池';
  if (!nodes.length) return '请先在 Workflow 规划中定义至少一个节点';
  if (nodes.some((node) => !(nodeAssetsMap[node.id] || []).length)) {
    return '仍有节点未分配 Agent / Skill，请完成分配后再提交';
  }
  return '';
}
function selectDept(id: string) {
  selectDepartment(id);
  deptOpen.value = false;
}
function selectProduct(id: string) {
  productId.value = id;
  const l2wf = scenarios.find(
    (s) => s.productId === id && s.level === 2 && workflows.some((w) => w.scenarioId === s._id),
  );
  const l2 = scenarios.find((s) => s.productId === id && s.level === 2);
  const l1 = scenarios.find((s) => s.productId === id && s.level === 1);
  selectedScenarioId.value = (l2wf || l2 || l1)?._id || '';
}
function tree(parentId: string | null = null): Scenario[] {
  return scenarios.filter((s) => s.productId === productId.value && s.parentId === parentId);
}
function children(id: string) {
  return tree(id);
}
async function moveScenario(item: Scenario, direction: number) {
  await saveScenarioOrder(() => props.workspace.moveScenario(item, direction), item._id);
}
async function saveScenarioOrder(save: () => Promise<void>, sourceId: string) {
  if (!canSortScenarios.value || sortingPending.value) return;
  const scope = sortingScope;
  sortingPending.value = true;
  sortingFailed.value = false;
  sortingMessage.value = '正在保存顺序…';
  try {
    await save();
    if (scope !== sortingScope) return;
    sortingFailed.value = false;
    sortingMessage.value = '顺序已保存';
    await nextTick();
    Array.from(scenarioPageRoot.value?.querySelectorAll<HTMLElement>('[data-scenario-id]') || [])
      .find((element) => element.dataset.scenarioId === sourceId)
      ?.focus({ preventScroll: true });
  } catch (error) {
    if (scope !== sortingScope) return;
    sortingFailed.value = true;
    sortingMessage.value = error instanceof Error ? error.message : '排序保存失败，请重试';
  } finally {
    sortingPending.value = false;
  }
}
function clearScenarioDrag() {
  draggedScenarioId.value = '';
  scenarioDropTarget.value = null;
}
function startScenarioDrag(event: DragEvent, scenario: Scenario) {
  if (!canSortScenarios.value || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedScenarioId.value = scenario._id;
  sortingMessage.value = '';
  sortingFailed.value = false;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', scenario._id);
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('.tree-node');
  if (row) event.dataTransfer.setDragImage(row, 18, row.offsetHeight / 2);
}
function canDropScenario(target: Scenario) {
  const source = scenarios.find((item) => item._id === draggedScenarioId.value);
  return (
    canSortScenarios.value &&
    source &&
    source._id !== target._id &&
    source.productId === productId.value &&
    target.productId === source.productId &&
    target.parentId === source.parentId
  );
}
function previewScenarioDrop(event: DragEvent, target: Scenario) {
  if (!canDropScenario(target)) {
    scenarioDropTarget.value = null;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  scenarioDropTarget.value = {
    id: target._id,
    placement: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
  };
}
function leaveScenarioDrop(event: DragEvent) {
  const row = event.currentTarget as HTMLElement;
  if (!(event.relatedTarget instanceof Node) || !row.contains(event.relatedTarget)) {
    scenarioDropTarget.value = null;
  }
}
async function dropScenario(event: DragEvent, target: Scenario) {
  if (!canDropScenario(target)) {
    clearScenarioDrag();
    return;
  }
  previewScenarioDrop(event, target);
  const sourceId = draggedScenarioId.value;
  const placement = scenarioDropTarget.value!.placement;
  clearScenarioDrag();
  await saveScenarioOrder(
    () => props.workspace.reorderScenario(sourceId, target._id, placement),
    sourceId,
  );
}
function scenarioDragClass(id: string) {
  return {
    'is-dragging': draggedScenarioId.value === id,
    'drop-before':
      scenarioDropTarget.value?.id === id && scenarioDropTarget.value.placement === 'before',
    'drop-after':
      scenarioDropTarget.value?.id === id && scenarioDropTarget.value.placement === 'after',
  };
}
function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
function focusDialog(element: { value: HTMLElement | null }) {
  nextTick(() => element.value?.focus());
}
function restoreDialogFocus(opener: HTMLElement | null) {
  nextTick(() => (opener?.isConnected ? opener : scenarioPageRoot.value)?.focus());
}
function handleModalKeydown(event: KeyboardEvent, dialog: HTMLElement | null, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab' || !dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.getClientRects().length > 0,
  );
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  const active = document.activeElement;
  const atDialogBoundary = active === dialog || !dialog.contains(active);
  if (event.shiftKey && (active === first || atDialogBoundary)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || atDialogBoundary)) {
    event.preventDefault();
    first.focus();
  }
}
function openScenario(parentId: string | null) {
  if (!parentId) void loadTags();
  tagSearch.value = '';
  scenarioDialogOpener = activeElement();
  scenarioForm.name = '';
  scenarioForm.code = '';
  scenarioForm.description = '';
  scenarioForm.tags = [];
  scenarioError.value = '';
  scenarioDialog.value = { parentId };
  focusDialog(scenarioDialogElement);
}
function closeScenarioDialog() {
  scenarioDialog.value = null;
  const opener = scenarioDialogOpener;
  scenarioDialogOpener = null;
  restoreDialogFocus(opener);
}
function handleScenarioDialogKeydown(event: KeyboardEvent) {
  handleModalKeydown(event, scenarioDialogElement.value, closeScenarioDialog);
}
async function saveScenario() {
  scenarioError.value = '';
  if (!scenarioForm.name.trim()) {
    scenarioError.value = '请填写场景名称';
    return;
  }
  const parentId = scenarioDialog.value?.parentId || null;
  if (parentId && (!props.workspace.isHttp || scenarioForm.code.trim())) {
    const error = validateName(scenarioForm.code);
    if (error) {
      scenarioError.value = `场景编码不符合命名规则：${error}`;
      return;
    }
  }
  const scenario: Scenario = {
    _id: uid('s'),
    name: scenarioForm.name.trim(),
    code: scenarioForm.code.trim(),
    description: scenarioForm.description.trim(),
    parentId,
    level: parentId ? 2 : 1,
    productId: productId.value,
    tags: parentId ? [] : [...scenarioForm.tags],
    status: 'draft',
    releaseCount: 0,
  };
  try {
    const saved = await props.workspace.saveScenario(scenario);
    selectedScenarioId.value = saved._id;
    closeScenarioDialog();
  } catch (error) {
    scenarioError.value = error instanceof Error ? error.message : '场景保存失败';
  }
}
function openTagDialog(target: Scenario) {
  void loadTags();
  tagSearch.value = '';
  tagDialogOpener = activeElement();
  tagTarget.value = target;
  focusDialog(tagDialogElement);
}
function closeTagDialog() {
  tagTarget.value = null;
  const opener = tagDialogOpener;
  tagDialogOpener = null;
  restoreDialogFocus(opener);
}
function handleTagDialogKeydown(event: KeyboardEvent) {
  handleModalKeydown(event, tagDialogElement.value, closeTagDialog);
}
async function toggleScenarioTag(tag: string) {
  const target = tagTarget.value;
  if (!target || saving.value) return;
  const next = target.tags.includes(tag)
    ? target.tags.filter((item) => item !== tag)
    : [...target.tags, tag];
  try {
    await props.workspace.setScenarioTags(target._id, next);
  } catch (error) {
    workspaceError.value = error instanceof Error ? error.message : '标签保存失败';
  }
}
function toggleFormTag(tag: string) {
  scenarioForm.tags = scenarioForm.tags.includes(tag)
    ? scenarioForm.tags.filter((item) => item !== tag)
    : [...scenarioForm.tags, tag];
}
function openDeleteDialog(target: Scenario) {
  deleteDialogOpener = activeElement();
  deleteTarget.value = target;
  focusDialog(deleteDialogElement);
}
function closeDeleteDialog() {
  deleteTarget.value = null;
  const opener = deleteDialogOpener;
  deleteDialogOpener = null;
  restoreDialogFocus(opener);
}
function handleDeleteDialogKeydown(event: KeyboardEvent) {
  handleModalKeydown(event, deleteDialogElement.value, closeDeleteDialog);
}
async function deleteScenario() {
  const target = deleteTarget.value;
  if (!target) return;
  if (children(target._id).length) return;
  try {
    await props.workspace.removeScenario(target);
    closeDeleteDialog();
  } catch (error) {
    workspaceError.value = error instanceof Error ? error.message : '场景删除失败';
    closeDeleteDialog();
  }
}
function progress(workflow: Workflow) {
  if (props.workspace.isHttp && workflow.progress) {
    const data = workflow.progress;
    const states = ['scenario', 'workflow', 'command', 'assets'].map(
      (key) => data.steps.find((item) => item.key === key)?.state || 'todo',
    );
    return {
      states,
      next: Math.min(3, Math.max(0, data.nextStep)),
      done: states.filter((state) => state === 'done').length,
      complete: data.allDone,
    };
  }
  const scenario = scenarios.find((s) => s._id === workflow.scenarioId);
  const product = products.find((item) => item._id === scenario?.productId);
  const allNodes = workflow.stages.flatMap((s) => s.steps);
  const emptyStages = workflow.stages.filter((s) => !s.steps.length).length;
  const unbound = allNodes.filter((node) => !node.assets.length).length;
  const states: ('done' | 'partial' | 'todo')[] = [
    scenario && !scenarioValidationError(scenario, product?.name ?? '') ? 'done' : 'todo',
    workflow.stages.length && !emptyStages ? 'done' : workflow.stages.length ? 'partial' : 'todo',
    !commandValidationError(workflow) ? 'done' : 'todo',
    workflow.assets.length && allNodes.length && !unbound
      ? 'done'
      : workflow.assets.length || allNodes.length - unbound
        ? 'partial'
        : 'todo',
  ];
  const next = states.findIndex((state) => state !== 'done');
  return {
    states,
    next: next === -1 ? 3 : next,
    done: states.filter((state) => state === 'done').length,
    complete: next === -1,
  };
}
async function openWizard(workflow?: Workflow, step = 0) {
  const scenario = currentScenario.value;
  if (
    !scenario ||
    scenario.level !== 2 ||
    loading.value ||
    workflowLoading.value ||
    wizardBusy.value
  )
    return;
  wizardOpener = activeElement();
  if (props.workspace.isHttp) {
    await props.workspace.loadSelectedWorkflow();
    if (workspaceError.value || currentScenario.value?._id !== scenario._id) return;
  }
  const source =
    workflows.find((item) => item.scenarioId === scenario._id) ||
    workflow ||
    props.workspace.ensureWorkflow(scenario._id);
  const wf: Workflow = props.workspace.isHttp ? JSON.parse(JSON.stringify(source)) : source;
  const map: Record<string, string[]> = {};
  wf.stages.forEach((stage) =>
    stage.steps.forEach((node) => {
      map[node.id] = node.assets.map((asset) => asset.assetId);
    }),
  );
  wizard.value = {
    workflow: wf,
    step,
    maxReached: step,
    form: {
      name: wf.name,
      description: wf.description,
      code: scenario.code,
      scenarioName: scenario.name,
      scenarioDesc: scenario.description,
    },
    nodeAssetsMap: map,
    poolIds: wf.assets.map((asset) => asset.assetId),
    assetTypeTab: 'Agent',
    error: '',
    stageDraft: null,
    nodeDraft: null,
    commandDraft: null,
    assetDraft: null,
  };
  focusDialog(wizardDialogElement);
}
function syncWizard() {
  const w = wizard.value;
  if (!w || !available.value || w.workflow.scenarioId !== selectedScenarioId.value) return;
  const scenario = scenarios.find((item) => item._id === w.workflow.scenarioId);
  const productName = currentProduct.value?.name ?? '';
  const scenarioDraft = {
    name: w.form.scenarioName,
    description: w.form.scenarioDesc,
    code: w.form.code,
    releaseCount: scenario?.releaseCount,
  };
  if (!props.workspace.isHttp && scenario && !scenarioValidationError(scenarioDraft, productName)) {
    props.workspace.saveScenarioDetails(scenario._id, {
      description: w.form.scenarioDesc,
      code: w.form.code,
      releaseCount: scenario.releaseCount,
    });
  }
  w.workflow.name = w.form.name;
  w.workflow.description = w.form.description;
  w.workflow.businessScenario = scenario?.name ?? w.form.scenarioName;
  w.workflow.assets = w.poolIds.flatMap((id) => {
    const asset = assets.find((item) => item._id === id);
    return asset
      ? [
          {
            assetId: id,
            type: asset.assetType,
            version: asset.version,
            role: 'workflow-resource',
          },
        ]
      : [];
  });
  w.workflow.stages.forEach((stage) =>
    stage.steps.forEach((node) => {
      node.assets = (w.nodeAssetsMap[node.id] || []).flatMap((id) => {
        const asset = assets.find((item) => item._id === id);
        return asset ? [{ assetId: id, type: asset.assetType }] : [];
      });
    }),
  );
}
function wizardStepError(w: Wizard, step: number): string {
  const productName = currentProduct.value?.name ?? '';
  if (step === 0) {
    return scenarioValidationError(
      {
        name: w.form.scenarioName,
        description: w.form.scenarioDesc,
        code: w.form.code,
        releaseCount: currentScenario.value?.releaseCount,
      },
      productName,
    );
  }
  if (step === 1) return workflowPlanningError(w.workflow);
  if (step === 2) return commandValidationError(w.workflow);
  return assetIntegrationError(w.workflow, w.poolIds, w.nodeAssetsMap);
}
function dismissWizard() {
  const workflowId = wizard.value?.workflow._id;
  wizard.value = null;
  const opener = wizardOpener;
  wizardOpener = null;
  nextTick(() => {
    if (opener?.isConnected) {
      opener.focus();
      return;
    }
    const workflowCard = Array.from(
      scenarioPageRoot.value?.querySelectorAll<HTMLElement>('.workflow-card') ?? [],
    ).find((card) => card.dataset.workflowId === workflowId);
    (workflowCard?.querySelector<HTMLElement>('button.primary') ?? scenarioPageRoot.value)?.focus();
  });
}
async function saveWizard(): Promise<boolean> {
  const w = wizard.value;
  if (!w || wizardBusy.value) return false;
  syncWizard();
  if (!props.workspace.isHttp) return true;
  w.error = '';
  try {
    const saved = await props.workspace.saveWorkflow(w.workflow, {
      code: w.form.code,
      description: w.form.scenarioDesc,
      releaseCount: currentScenario.value?.releaseCount,
    });
    if (wizard.value !== w) return false;
    w.workflow = JSON.parse(JSON.stringify(saved));
    w.poolIds = saved.assets.map((item) => item.assetId);
    w.nodeAssetsMap = Object.fromEntries(
      saved.stages.flatMap((stage) =>
        stage.steps.map((node) => [node.id, node.assets.map((asset) => asset.assetId)]),
      ),
    );
    return true;
  } catch (cause) {
    w.error = cause instanceof Error ? cause.message : 'Workflow 保存失败';
    return false;
  }
}
async function closeWizard() {
  if (await saveWizard()) dismissWizard();
}
function handleWizardKeydown(event: KeyboardEvent) {
  handleModalKeydown(event, wizardDialogElement.value, closeWizard);
}
function showWizardPage() {
  nextTick(() => {
    const dialog = wizardDialogElement.value;
    if (!dialog) return;
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>('.wizard-page')?.focus({ preventScroll: true });
  });
}
async function goNext() {
  const w = wizard.value;
  const scenario = currentScenario.value;
  if (!w || !scenario || wizardBusy.value) return;
  w.error = '';
  if (w.step === 0 || w.step === 2) {
    w.error = wizardStepError(w, w.step);
    if (w.error) return;
  }
  if (w.step === 3) {
    for (let index = 0; index < wizardSteps.length; index += 1) {
      const error = wizardStepError(w, index);
      if (!error) continue;
      w.step = index;
      w.maxReached = Math.max(w.maxReached, index);
      w.error = `${wizardSteps[index]}：${error}`;
      showWizardPage();
      return;
    }
  }
  if (!(await saveWizard())) return;
  if (w.step === 3) {
    if (!props.workspace.isHttp) w.workflow.status = 'active';
    dismissWizard();
    return;
  }
  w.step += 1;
  w.maxReached = Math.max(w.maxReached, w.step);
  showWizardPage();
}
async function goStep(step: number) {
  const w = wizard.value;
  if (w && step <= w.maxReached) {
    if (!(await saveWizard())) return;
    w.step = step;
    w.error = '';
    showWizardPage();
  }
}
function saveStage() {
  const w = wizard.value;
  if (!w?.stageDraft?.name.trim()) return;
  const draft = w.stageDraft;
  if (
    w.workflow.stages.some((stage) => stage.id !== draft.id && stage.name === draft.name.trim())
  ) {
    w.error = '当前场景已存在同名环节';
    return;
  }
  draft.name = draft.name.trim();
  const existing = draft.id ? w.workflow.stages.find((stage) => stage.id === draft.id) : undefined;
  if (existing) Object.assign(existing, draft);
  else
    w.workflow.stages.push({
      id: uid('st'),
      name: draft.name,
      description: draft.description,
      order: w.workflow.stages.length,
      steps: [],
    });
  w.stageDraft = null;
  w.error = '';
  syncWizard();
}
function saveNode() {
  const w = wizard.value;
  const draft = w?.nodeDraft;
  if (!w || !draft?.name.trim()) return;
  const stage = w.workflow.stages.find((item) => item.id === draft.stageId);
  if (!stage) return;
  if (stage.steps.some((node) => node.id !== draft.id && node.name === draft.name.trim())) {
    w.error = '当前环节已存在同名节点';
    return;
  }
  draft.name = draft.name.trim();
  const existing = draft.id ? stage.steps.find((node) => node.id === draft.id) : undefined;
  if (existing) Object.assign(existing, draft);
  else
    stage.steps.push({
      id: uid('n'),
      name: draft.name,
      description: draft.description,
      order: stage.steps.length,
      assets: [],
    });
  w.nodeDraft = null;
  w.error = '';
  syncWizard();
}
function deleteStage(stageId: string) {
  const w = wizard.value;
  const stage = w?.workflow.stages.find((item) => item.id === stageId);
  if (!w || !stage || !window.confirm('确认删除该环节？环节下的节点会一并删除。')) return;
  stage.steps.forEach((node) => delete w.nodeAssetsMap[node.id]);
  w.workflow.stages = w.workflow.stages.filter((item) => item.id !== stageId);
  [...w.workflow.stages]
    .sort((a, b) => a.order - b.order)
    .forEach((item, index) => {
      item.order = index;
    });
  w.stageDraft = null;
  w.nodeDraft = null;
  syncWizard();
}
function deleteNode(stageId: string, nodeId: string) {
  const w = wizard.value;
  const stage = w?.workflow.stages.find((item) => item.id === stageId);
  if (!w || !stage) return;
  stage.steps = stage.steps.filter((item) => item.id !== nodeId);
  [...stage.steps]
    .sort((a, b) => a.order - b.order)
    .forEach((item, index) => {
      item.order = index;
    });
  delete w.nodeAssetsMap[nodeId];
  w.nodeDraft = null;
  syncWizard();
}
function move<T extends { order: number }>(
  items: T[],
  id: string,
  direction: number,
  key: keyof T = 'id' as keyof T,
) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((item) => String(item[key]) === id);
  const next = index + direction;
  const currentItem = sorted[index];
  const nextItem = sorted[next];
  if (!currentItem || !nextItem) return;
  [currentItem.order, nextItem.order] = [nextItem.order, currentItem.order];
}
function addCommand(id: string) {
  const w = wizard.value;
  const command = commands.find((item) => item._id === id);
  if (!w || !command || w.workflow.commands.some((item) => item.commandId === id)) return;
  w.workflow.commands.push({
    id: uid('cmd'),
    commandId: id,
    name: command.name,
    description: command.description,
    owner: command.owner,
    developer: command.developer,
    ownerId: command.ownerId,
    developerId: command.developerId,
    ownerDepartment: command.ownerDepartment,
    developerDepartment: command.developerDepartment,
    version: command.version,
  });
  syncWizard();
}
function openCommandDraft() {
  if (!wizard.value) return;
  wizard.value.error = '';
  wizard.value.commandDraft = {
    name: '',
    description: '',
    developer: null,
    owner: null,
    dueDate: '',
  };
}
function openAssetDraft(type: AssetType) {
  const w = wizard.value;
  if (!w) return;
  w.error = '';
  w.assetTypeTab = type;
  w.assetDraft = {
    name: '',
    assetType: type,
    description: '',
    developer: null,
    owner: null,
    dueDate: '',
  };
}
function selectDraftAssetType(type: AssetType) {
  const w = wizard.value;
  if (!w?.assetDraft) return;
  w.assetDraft.assetType = type;
  w.assetTypeTab = type;
  w.error = '';
}
function personnelId(person: SkillPlanningUserOption | null) {
  return person?.sAMAccountName || person?.id || '';
}
function personnelLabel(person: SkillPlanningUserOption) {
  return [person.chName, personnelId(person)].filter(Boolean).join(' ') || person.label;
}
async function createCommand() {
  const w = wizard.value;
  const d = w?.commandDraft;
  if (!w || !d || wizardBusy.value) return;
  w.error = '';
  if (!d.developer || !d.owner || !personnelId(d.developer) || !personnelId(d.owner)) {
    w.error = '请通过姓名或工号查询，并从结果中选择开发责任人和责任人';
    return;
  }
  if (!d.description.trim() || !d.dueDate) {
    w.error = '请完整填写 Command 描述、开发责任人、责任人和完成时间';
    return;
  }
  const error = validateName(d.name.trim().replace(/^\//, ''));
  if (error) {
    w.error = `Command 名称不符合命名规则：${error}`;
    return;
  }
  const command: Command = {
    _id: uid('rc'),
    productId: productId.value,
    ...d,
    owner: personnelLabel(d.owner),
    developer: personnelLabel(d.developer),
    ownerId: personnelId(d.owner),
    developerId: personnelId(d.developer),
    ownerDepartment: d.owner.deptName,
    developerDepartment: d.developer.deptName,
    name: d.name.trim().startsWith('/') ? d.name.trim() : `/${d.name.trim()}`,
    version: null,
  };
  capabilitySaving.value = true;
  try {
    const saved = await props.workspace.createCapability('Command', command);
    if (wizard.value !== w) return;
    commands.push(saved as Command);
    addCommand(saved._id);
    w.commandDraft = null;
  } catch (cause) {
    w.error = cause instanceof Error ? cause.message : 'Command 创建失败';
  } finally {
    capabilitySaving.value = false;
  }
}
function togglePool(id: string) {
  const w = wizard.value;
  if (!w) return;
  if (w.poolIds.includes(id)) {
    w.poolIds = w.poolIds.filter((item) => item !== id);
    Object.keys(w.nodeAssetsMap).forEach((key) => {
      w.nodeAssetsMap[key] = (w.nodeAssetsMap[key] || []).filter((item) => item !== id);
    });
  } else w.poolIds.push(id);
  syncWizard();
}
function toggleNodeAsset(nodeId: string, assetId: string) {
  const w = wizard.value;
  if (!w) return;
  const current = w.nodeAssetsMap[nodeId] || [];
  w.nodeAssetsMap[nodeId] = current.includes(assetId)
    ? current.filter((id) => id !== assetId)
    : [...current, assetId];
  syncWizard();
}
async function createAsset() {
  const w = wizard.value;
  const d = w?.assetDraft;
  if (!w || !d || wizardBusy.value) return;
  w.error = '';
  if (!d.developer || !d.owner || !personnelId(d.developer) || !personnelId(d.owner)) {
    w.error = '请通过姓名或工号查询，并从结果中选择开发责任人和责任人';
    return;
  }
  if (!d.description.trim() || !d.dueDate) {
    w.error = '请完整填写资产描述、开发责任人、责任人和完成时间';
    return;
  }
  const error = validateName(d.name);
  if (error) {
    w.error = `资产名称不符合命名规则：${error}`;
    return;
  }
  const asset: Asset = {
    _id: uid('a'),
    productId: productId.value,
    ...d,
    name: d.name.trim(),
    owner: personnelLabel(d.owner),
    developer: personnelLabel(d.developer),
    ownerId: personnelId(d.owner),
    developerId: personnelId(d.developer),
    ownerDepartment: d.owner.deptName,
    developerDepartment: d.developer.deptName,
    version: null,
    status: 'draft',
  };
  capabilitySaving.value = true;
  try {
    const saved = await props.workspace.createCapability(d.assetType, asset);
    if (wizard.value !== w) return;
    assets.push(saved as Asset);
    w.poolIds.push(saved._id);
    w.assetDraft = null;
    syncWizard();
  } catch (cause) {
    w.error = cause instanceof Error ? cause.message : '资产创建失败';
  } finally {
    capabilitySaving.value = false;
  }
}
</script>

<template>
  <div
    ref="scenarioPageRoot"
    class="scenario-page harness-viewport-page"
    tabindex="-1"
    :inert="scenarioDialog || tagTarget || deleteTarget || wizard ? true : undefined"
    :aria-hidden="scenarioDialog || tagTarget || deleteTarget || wizard ? 'true' : undefined"
  >
    <header class="page-header harness-page-heading">
      <h1 class="harness-page-title">业务场景设计台</h1>
      <p class="harness-page-description">
        复用配置管理的一级、二级场景；每个二级场景可创建一个 Harness
        工作流，环节与节点归属于该工作流。
      </p>
    </header>
    <section class="selector">
      <span class="selector-icon">🏢</span>
      <div class="dept-picker">
        <button
          class="select-trigger"
          type="button"
          aria-label="选择部门"
          :disabled="saving"
          :aria-expanded="deptOpen"
          @click="deptOpen = !deptOpen"
        >
          {{ deptPath(selectedDeptId) || '选部门…' }} <b>▾</b>
        </button>
        <div v-if="deptOpen" class="dropdown-backdrop" @click="deptOpen = false"></div>
        <div v-if="deptOpen" class="dropdown">
          <button
            v-for="dept in departments"
            :key="dept._id"
            :style="{ paddingLeft: `${0.65 + deptPath(dept._id).split(' / ').length * 0.8}rem` }"
            :class="{ selected: selectedDeptId === dept._id }"
            @click="selectDept(dept._id)"
          >
            {{ dept.name }}
          </button>
        </div>
      </div>
      <span v-if="productOptions.length" class="divider">→</span
      ><select
        v-if="productOptions.length"
        v-model="productId"
        aria-label="选择产品"
        :disabled="loading || saving"
        @change="selectProduct(productId)"
      >
        <option value="">选产品…</option>
        <option v-for="product in productOptions" :key="product._id" :value="product._id">
          {{ product.name }}
        </option>
      </select>
    </section>
    <p v-if="workspaceError" class="error" role="alert">
      {{ workspaceError }} <button @click="props.workspace.reloadScenes()">重试加载</button>
    </p>
    <p v-if="loading" role="status">正在加载部门、产品与场景…</p>
    <section
      class="workspace"
      :inert="!available || loading || saving ? true : undefined"
      :aria-busy="loading || saving"
    >
      <aside class="tree-panel">
        <header>
          🗺️ 场景地图
          <button
            :disabled="!productId"
            :title="productId ? '新建一级场景' : '请先选择部门与产品'"
            @click="openScenario(null)"
          >
            +
          </button>
        </header>
        <p
          class="tree-sort-hint"
          :class="{
            'sort-failed': sortingFailed,
            'sort-saved': sortingMessage && !sortingFailed && !sortingPending,
          }"
          :role="sortingFailed ? 'alert' : 'status'"
          aria-live="polite"
        >
          {{
            sortingMessage ||
            (draggedScenarioId ? '拖到同级场景之间，松手保存' : '拖动手柄调整同级顺序，自动保存')
          }}
        </p>
        <div class="tree-body" role="tree" aria-label="业务场景地图" @dragend="clearScenarioDrag">
          <p v-if="!productId" class="tree-empty">👆<br />请先在上方选择部门与产品。</p>
          <p v-else-if="!tree().length" class="tree-empty">
            🌱<br />该产品下暂无业务场景，请先创建一级场景。
          </p>
          <template v-else
            ><div v-for="item in tree()" :key="item._id" class="tree-item">
              <div
                class="tree-node"
                :class="[{ active: selectedScenarioId === item._id }, scenarioDragClass(item._id)]"
                :data-scenario-id="item._id"
                role="treeitem"
                tabindex="0"
                :aria-selected="selectedScenarioId === item._id"
                :aria-expanded="children(item._id).length ? !collapsed[item._id] : undefined"
                @click="selectedScenarioId = item._id"
                @keydown.enter="selectedScenarioId = item._id"
                @keydown.space.prevent="selectedScenarioId = item._id"
                @dragover.stop="previewScenarioDrop($event, item)"
                @dragleave.stop="leaveScenarioDrop"
                @drop.stop="dropScenario($event, item)"
              >
                <span
                  class="scenario-drag-handle"
                  :draggable="canSortScenarios"
                  role="img"
                  :aria-label="`拖动排序${item.name}`"
                  title="拖动调整同级顺序"
                  @click.stop
                  @dragstart.stop="startScenarioDrag($event, item)"
                  @dragend.stop="clearScenarioDrag"
                >
                  <svg aria-hidden="true" viewBox="0 0 12 18" fill="currentColor">
                    <circle cx="3" cy="4" r="1.2" />
                    <circle cx="9" cy="4" r="1.2" />
                    <circle cx="3" cy="9" r="1.2" />
                    <circle cx="9" cy="9" r="1.2" />
                    <circle cx="3" cy="14" r="1.2" />
                    <circle cx="9" cy="14" r="1.2" />
                  </svg>
                </span>
                <button
                  class="toggle"
                  :class="{ hidden: !children(item._id).length, collapsed: collapsed[item._id] }"
                  type="button"
                  :aria-label="`${collapsed[item._id] ? '展开' : '收起'}${item.name}`"
                  @click.stop="collapsed[item._id] = !collapsed[item._id]"
                >
                  ▾</button
                ><b>{{ item.name }}</b
                ><span class="node-actions"
                  ><button
                    :disabled="!canSortScenarios || tree(item.parentId)[0]?._id === item._id"
                    type="button"
                    :aria-label="`上移${item.name}`"
                    :title="`上移${item.name}`"
                    @click.stop="moveScenario(item, -1)"
                  >
                    ↑</button
                  ><button
                    :disabled="!canSortScenarios || tree(item.parentId).at(-1)?._id === item._id"
                    type="button"
                    :aria-label="`下移${item.name}`"
                    :title="`下移${item.name}`"
                    @click.stop="moveScenario(item, 1)"
                  >
                    ↓</button
                  ><button
                    v-if="item.level === 1"
                    type="button"
                    :aria-label="`在${item.name}下新建场景`"
                    :title="`在${item.name}下新建场景`"
                    @click.stop="openScenario(item._id)"
                  >
                    +</button
                  ><button
                    class="danger"
                    type="button"
                    :aria-label="`删除${item.name}`"
                    :title="`删除${item.name}`"
                    @click.stop="openDeleteDialog(item)"
                  >
                    ×
                  </button></span
                >
              </div>
              <div
                v-if="item.level === 1 && !collapsed[item._id]"
                class="tree-children"
                role="group"
              >
                <div
                  v-for="child in children(item._id)"
                  :key="child._id"
                  class="tree-node child"
                  :class="[
                    { active: selectedScenarioId === child._id },
                    scenarioDragClass(child._id),
                  ]"
                  :data-scenario-id="child._id"
                  role="treeitem"
                  tabindex="0"
                  :aria-selected="selectedScenarioId === child._id"
                  @click="selectedScenarioId = child._id"
                  @keydown.enter="selectedScenarioId = child._id"
                  @keydown.space.prevent="selectedScenarioId = child._id"
                  @dragover.stop="previewScenarioDrop($event, child)"
                  @dragleave.stop="leaveScenarioDrop"
                  @drop.stop="dropScenario($event, child)"
                >
                  <span
                    class="scenario-drag-handle"
                    :draggable="canSortScenarios"
                    role="img"
                    :aria-label="`拖动排序${child.name}`"
                    title="拖动调整同级顺序"
                    @click.stop
                    @dragstart.stop="startScenarioDrag($event, child)"
                    @dragend.stop="clearScenarioDrag"
                  >
                    <svg aria-hidden="true" viewBox="0 0 12 18" fill="currentColor">
                      <circle cx="3" cy="4" r="1.2" />
                      <circle cx="9" cy="4" r="1.2" />
                      <circle cx="3" cy="9" r="1.2" />
                      <circle cx="9" cy="9" r="1.2" />
                      <circle cx="3" cy="14" r="1.2" />
                      <circle cx="9" cy="14" r="1.2" />
                    </svg>
                  </span>
                  <i></i><b>{{ child.name }}</b
                  ><span class="node-actions"
                    ><button
                      :disabled="!canSortScenarios || children(item._id)[0]?._id === child._id"
                      type="button"
                      :aria-label="`上移${child.name}`"
                      :title="`上移${child.name}`"
                      @click.stop="moveScenario(child, -1)"
                    >
                      ↑</button
                    ><button
                      :disabled="!canSortScenarios || children(item._id).at(-1)?._id === child._id"
                      type="button"
                      :aria-label="`下移${child.name}`"
                      :title="`下移${child.name}`"
                      @click.stop="moveScenario(child, 1)"
                    >
                      ↓</button
                    ><button
                      class="danger"
                      type="button"
                      :aria-label="`删除${child.name}`"
                      :title="`删除${child.name}`"
                      @click.stop="openDeleteDialog(child)"
                    >
                      ×
                    </button></span
                  >
                </div>
              </div>
            </div></template
          >
        </div>
      </aside>
      <section class="design-panel">
        <div v-if="!currentScenario" class="empty">
          🧭<b>选择或创建业务场景</b><small>例如：需求开发 → 编解码开发</small>
        </div>
        <template v-else
          ><header class="summary">
            <div>
              <span class="level" :class="`level-${currentScenario.level}`">{{
                currentScenario.level === 1 ? '一级场景 · 业务分组' : '二级场景 · 流程设计'
              }}</span>
              <h2>{{ currentScenario.name }}</h2>
              <p v-if="currentScenario.description">{{ currentScenario.description }}</p>
              <div v-if="currentScenario.level === 1" class="tags">
                <span v-for="tag in currentScenario.tags" :key="tag">#{{ tag }}</span
                ><button @click="openTagDialog(currentScenario)">
                  {{ currentScenario.tags.length ? '编辑标签' : '+ 添加标签' }}
                </button>
              </div>
            </div>
            <button
              v-if="currentScenario.level === 2 && !currentWorkflows.length"
              class="primary start-workflow-button"
              :disabled="workflowLoading || wizardBusy"
              @click="openWizard()"
            >
              + 开始设计 Workflow
            </button>
          </header>
          <div v-if="currentScenario.level === 1" class="empty boxed">
            🗂️<b>一级场景为业务分组节点</b
            ><small
              >一级场景不支持直接定义
              Workflow，请在左侧选择或新建下级场景进行流程设计（场景最多两级）。</small
            >
          </div>
          <template v-else
            ><h3>场景 Workflow</h3>
            <div v-if="!currentWorkflows.length" class="empty boxed">
              🛠️<b>该场景尚未开始 Workflow 设计</b
              ><small>点击右上角“开始设计 Workflow”，按向导完成规划、Command 与资产集成。</small>
            </div>
            <article
              v-for="workflow in currentWorkflows"
              :key="workflow._id"
              class="workflow-card"
              :data-workflow-id="workflow._id"
            >
              <header>
                <div>
                  <h3>{{ workflow.name || '未命名 Workflow' }}</h3>
                  <span
                    class="status"
                    :class="progress(workflow).complete ? 'complete' : 'ongoing'"
                    >{{
                      progress(workflow).complete
                        ? '✓ 设计完成'
                        : `进行中 · ${progress(workflow).done}/4`
                    }}</span
                  >
                </div>
                <button
                  class="primary"
                  :disabled="workflowLoading || wizardBusy"
                  @click="openWizard(workflow, progress(workflow).next)"
                >
                  {{ progress(workflow).complete ? '查看设计' : '继续设计' }}
                </button>
              </header>
              <div class="progress">
                <button
                  v-for="(label, i) in wizardSteps"
                  :key="label"
                  :class="progress(workflow).states[i]"
                  @click="openWizard(workflow, i)"
                >
                  <b>{{ i + 1 }}</b>
                  <span>{{ label }}</span>
                </button>
              </div>
              <div class="config-grid">
                <section>
                  <header>
                    🧩 Workflow 资产池 <small>{{ workflow.assets.length }} 个</small>
                  </header>
                  <button
                    v-if="!workflow.assets.length"
                    class="empty-link"
                    @click="openWizard(workflow, 3)"
                  >
                    尚未配置 Agent / Skill 资产池
                  </button>
                  <div v-else class="chips">
                    <span v-for="item in workflow.assets" :key="item.assetId"
                      ><b>{{ item.type }}</b
                      >{{ assets.find((a) => a._id === item.assetId)?.name || '未找到资产' }}</span
                    >
                  </div>
                </section>
                <section>
                  <header>
                    ⌨️ Command 入口 <small>{{ workflow.commands.length }} 个</small>
                  </header>
                  <button
                    v-if="!workflow.commands.length"
                    class="empty-link"
                    @click="openWizard(workflow, 2)"
                  >
                    尚未设计 Command 入口
                  </button>
                  <div v-else class="commands">
                    <div v-for="command in workflow.commands" :key="command.id">
                      <code>{{ command.name }}</code
                      ><span>{{ command.description || '无说明' }}</span>
                    </div>
                  </div>
                </section>
              </div>
              <header class="stage-title">
                🔗 环节与节点 <small>{{ workflow.stages.length }} 个环节</small>
              </header>
              <button
                v-if="!workflow.stages.length"
                class="empty-link"
                @click="openWizard(workflow, 1)"
              >
                尚未编排环节与节点，点击开始
              </button>
              <div v-else class="pipeline">
                <template
                  v-for="(stage, index) in [...workflow.stages].sort((a, b) => a.order - b.order)"
                  :key="stage.id"
                  ><i v-if="index" class="arrow">→</i>
                  <section class="stage" :style="{ '--accent': accents[index % accents.length] }">
                    <h4>{{ stage.name }}</h4>
                    <p>{{ stage.description }}</p>
                    <div
                      v-for="node in [...stage.steps].sort((a, b) => a.order - b.order)"
                      :key="node.id"
                      class="stage-node"
                    >
                      <b>{{ node.name }}</b
                      ><small v-if="!node.assets.length">未关联 Agent / Skill</small
                      ><span v-for="asset in node.assets" :key="asset.assetId"
                        ><b>{{ asset.type }}</b
                        >{{
                          assets.find((a) => a._id === asset.assetId)?.name || '未找到资产'
                        }}</span
                      >
                    </div>
                  </section></template
                >
              </div>
            </article></template
          ></template
        >
      </section>
    </section>
  </div>

  <div v-if="scenarioDialog" class="modal scenario-modal" @click.self="closeScenarioDialog">
    <form
      ref="scenarioDialogElement"
      class="dialog scenario-editor"
      role="dialog"
      aria-modal="true"
      :aria-label="scenarioDialog.parentId ? '新建下级场景' : '新建一级场景'"
      tabindex="-1"
      @submit.prevent="saveScenario"
      @keydown="handleScenarioDialogKeydown"
    >
      <header class="editor-header">
        <span class="editor-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="8" y="3" width="8" height="6" rx="1.5" />
            <path d="M12 9v5M5 17v-3h14v3" />
            <rect x="2" y="17" width="6" height="4" rx="1" />
            <rect x="16" y="17" width="6" height="4" rx="1" />
          </svg>
        </span>
        <div class="editor-heading">
          <h2>{{ scenarioDialog.parentId ? '新建下级场景' : '新建一级场景' }}</h2>
          <p>
            {{
              scenarioDialog.parentId
                ? '细化业务场景，为工作流设计做好准备'
                : '定义业务场景，让团队的工作流有序展开'
            }}
          </p>
        </div>
        <button
          class="editor-close"
          type="button"
          aria-label="关闭新建场景"
          @click="closeScenarioDialog"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div class="editor-body">
        <p v-if="scenarioError" class="form-error" role="alert">{{ scenarioError }}</p>
        <label class="editor-field">
          <span>场景名称 <span class="required-mark" aria-hidden="true">*</span></span>
          <input v-model="scenarioForm.name" required placeholder="例如：需求开发" />
        </label>
        <label v-if="scenarioDialog.parentId" class="editor-field">
          <span>场景编码{{ props.workspace.isHttp ? '' : ' *' }}</span>
          <input
            v-model="scenarioForm.code"
            required
            :placeholder="`例如：${productPrefix()}mml-dev`"
          />
          <small>该编码将作为发布的 Extension 名称：以产品名开头、全部小写、仅用连字符分隔。</small>
        </label>
        <fieldset v-else class="editor-tags">
          <legend>场景标签 <span>可多选</span></legend>
          <div class="tag-picker-meta">
            <span>选择标签，便于分类和查找场景</span>
            <span class="selection-count" role="status"
              >已选 <b>{{ scenarioForm.tags.length }}</b> 项</span
            >
          </div>
          <div class="tag-picker">
            <div class="tag-search">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                v-model="tagSearch"
                type="search"
                aria-label="搜索场景标签"
                placeholder="搜索标签…"
                @keydown.enter.prevent
              />
            </div>
            <div class="tag-choices">
              <button
                v-for="tag in filteredTags"
                :key="tag"
                type="button"
                class="tag-choice"
                :class="{ checked: scenarioForm.tags.includes(tag) }"
                :aria-pressed="scenarioForm.tags.includes(tag)"
                @click="toggleFormTag(tag)"
              >
                <span class="tag-check" aria-hidden="true">{{
                  scenarioForm.tags.includes(tag) ? '✓' : ''
                }}</span>
                <span>{{ tag }}</span>
              </button>
              <p v-if="!filteredTags.length" class="tag-empty">
                {{ tagSearch.trim() ? '未找到匹配的标签' : '暂无可选标签' }}
              </p>
            </div>
          </div>
        </fieldset>
        <label class="editor-field">
          <span>场景说明 <span class="optional-mark">选填</span></span>
          <textarea
            v-model="scenarioForm.description"
            rows="3"
            placeholder="描述场景目标、输入输出和业务边界"
          ></textarea>
        </label>
      </div>
      <footer class="editor-footer">
        <span class="editor-footer-note">创建后可继续完善场景配置</span>
        <button type="button" @click="closeScenarioDialog">取消</button>
        <button class="primary" type="submit" :disabled="saving">创建</button>
      </footer>
    </form>
  </div>
  <div v-if="tagTarget" class="modal scenario-modal" @click.self="closeTagDialog">
    <section
      ref="tagDialogElement"
      class="dialog scenario-editor tag-editor"
      role="dialog"
      aria-modal="true"
      aria-label="场景标签"
      tabindex="-1"
      @keydown="handleTagDialogKeydown"
    >
      <header class="editor-header">
        <span class="editor-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 4h8l10 10-7 7L3 10V4Z" />
            <circle cx="7.5" cy="8" r="1" />
          </svg>
        </span>
        <div class="editor-heading">
          <h2>场景标签</h2>
          <p>{{ tagTarget.name }}</p>
        </div>
        <button
          class="editor-close"
          type="button"
          aria-label="关闭场景标签"
          @click="closeTagDialog"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div class="editor-body">
        <fieldset class="editor-tags">
          <legend>场景标签 <span>可多选</span></legend>
          <div class="tag-picker-meta">
            <span>选择标签，便于分类和查找场景</span>
            <span class="selection-count" role="status"
              >已选 <b>{{ tagTarget.tags.length }}</b> 项</span
            >
          </div>
          <div class="tag-picker">
            <div class="tag-search">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                v-model="tagSearch"
                type="search"
                aria-label="搜索场景标签"
                placeholder="搜索标签…"
              />
            </div>
            <div class="tag-choices">
              <button
                v-for="tag in filteredTags"
                :key="tag"
                type="button"
                class="tag-choice"
                :class="{ checked: tagTarget.tags.includes(tag) }"
                :aria-pressed="tagTarget.tags.includes(tag)"
                :aria-disabled="saving"
                @click="toggleScenarioTag(tag)"
              >
                <span class="tag-check" aria-hidden="true">{{
                  tagTarget.tags.includes(tag) ? '✓' : ''
                }}</span>
                <span>{{ tag }}</span>
              </button>
              <p v-if="!filteredTags.length" class="tag-empty">
                {{ tagSearch.trim() ? '未找到匹配的标签' : '暂无可选标签' }}
              </p>
            </div>
          </div>
        </fieldset>
      </div>
      <footer class="editor-footer">
        <span class="editor-footer-note">{{ saving ? '正在保存…' : '选择后自动保存' }}</span>
        <button class="primary" type="button" @click="closeTagDialog">完成</button>
      </footer>
    </section>
  </div>
  <div v-if="deleteTarget" class="modal" @click.self="closeDeleteDialog">
    <section
      ref="deleteDialogElement"
      class="dialog small center"
      role="dialog"
      aria-modal="true"
      aria-label="删除场景"
      tabindex="-1"
      @keydown="handleDeleteDialogKeydown"
    >
      <template v-if="children(deleteTarget._id).length"
        ><i>🗂️</i>
        <h2>无法删除</h2>
        <p>
          「{{ deleteTarget.name }}」下有
          {{ children(deleteTarget._id).length }} 个下级场景，请先删除下级场景后再删除该场景。
        </p>
        <footer><button @click="closeDeleteDialog">知道了</button></footer></template
      ><template v-else
        ><i>⚠️</i>
        <h2>删除场景</h2>
        <p>
          确认删除场景「<b>{{ deleteTarget.name }}</b
          >」？<template v-if="workflows.some((item) => item.scenarioId === deleteTarget?._id)"
            >关联的 Workflow 也会一并删除，</template
          >该操作不可恢复。
        </p>
        <footer>
          <button class="danger-btn" @click="deleteScenario">确认删除</button
          ><button @click="closeDeleteDialog">取消</button>
        </footer></template
      >
    </section>
  </div>
  <div v-if="wizard" class="modal" @click.self="closeWizard">
    <section
      ref="wizardDialogElement"
      class="dialog wizard"
      role="dialog"
      aria-modal="true"
      aria-label="Workflow 设计"
      :inert="wizardBusy || undefined"
      :aria-busy="wizardBusy"
      tabindex="-1"
      @keydown="handleWizardKeydown"
    >
      <header>
        <h2>Workflow 设计</h2>
        <button class="close" type="button" aria-label="关闭 Workflow 设计" @click="closeWizard">
          ×
        </button>
      </header>
      <nav>
        <template v-for="(label, i) in wizardSteps" :key="label"
          ><i v-if="i" :class="{ reached: i <= wizard.maxReached }"></i
          ><button
            :class="{ current: i === wizard.step, done: i < wizard.step }"
            :aria-current="i === wizard.step ? 'step' : undefined"
            :disabled="wizardBusy || i > wizard.maxReached"
            @click="goStep(i)"
          >
            <b>{{ i + 1 }}</b
            ><span>{{ label }}</span>
          </button></template
        >
      </nav>
      <section v-if="wizard.step === 0" class="wizard-page" aria-label="业务场景分析" tabindex="-1">
        <p class="hint">
          先对齐业务场景：明确场景目标、输入输出与业务边界，后续 Workflow 与资产都围绕它展开。带 *
          为必填项。
        </p>
        <label
          >场景名称<input v-model="wizard.form.scenarioName" readonly /><small
            >与配置管理的二级场景一致，名称在场景管理中统一维护。</small
          ></label
        ><label
          >场景编码{{ props.workspace.isHttp ? '' : ' *'
          }}<input
            v-model="wizard.form.code"
            :readonly="!!currentScenario?.releaseCount"
            :placeholder="`例如：${productPrefix()}mml-dev`"
          /><small v-if="currentScenario?.releaseCount"
            >该场景已发布过版本，编码已锁定不可修改。</small
          ><small v-else
            >该编码将作为发布的 Extension 名称：以产品前缀
            {{ productPrefix() }} 开头、全部小写、仅用连字符分隔。</small
          ></label
        ><label
          >场景说明与目标 *<textarea v-model="wizard.form.scenarioDesc" rows="5"></textarea>
        </label>
      </section>
      <section
        v-else-if="wizard.step === 1"
        class="wizard-page"
        aria-label="Workflow 规划"
        tabindex="-1"
      >
        <p class="hint">
          规划 Workflow 基本信息，并编排「环节 → 节点」：环节是逻辑分组，节点是绑定 Agent / Skill
          的原子执行单元。
        </p>
        <div class="two">
          <label
            >流程名称<input
              v-model="wizard.form.name"
              placeholder="例如：编解码开发作业流程" /></label
          ><label>流程说明<input v-model="wizard.form.description" /></label>
        </div>
        <h4>
          环节与节点
          <small
            >{{ wizard.workflow.stages.length }} 个环节 ·
            {{ wizard.workflow.stages.flatMap((s) => s.steps).length }} 个节点，按顺序执行</small
          >
        </h4>
        <p v-if="!wizard.workflow.stages.length && !wizard.stageDraft" class="hint">
          尚未定义环节，点击下方“添加环节”开始编排。
        </p>
        <div
          v-for="stage in [...wizard.workflow.stages].sort((a, b) => a.order - b.order)"
          :key="stage.id"
          class="edit-stage"
        >
          <header>
            <div class="structure-info">
              <b>{{ stage.name }}</b>
              <small v-if="stage.description">{{ stage.description }}</small>
            </div>
            <span
              ><button @click="move(wizard.workflow.stages, stage.id, -1)">↑</button
              ><button @click="move(wizard.workflow.stages, stage.id, 1)">↓</button
              ><button
                @click="
                  wizard.stageDraft = {
                    id: stage.id,
                    name: stage.name,
                    description: stage.description,
                  };
                  wizard.nodeDraft = null;
                "
              >
                编辑</button
              ><button @click="deleteStage(stage.id)">删除</button></span
            >
          </header>
          <div class="nodes">
            <div
              v-for="node in [...stage.steps].sort((a, b) => a.order - b.order)"
              :key="node.id"
              class="node-item"
            >
              <div class="node-row">
                <div class="structure-info">
                  <b>{{ node.name }}</b>
                  <small v-if="node.description">{{ node.description }}</small>
                </div>
                <span
                  ><button @click="move(stage.steps, node.id, -1)">↑</button
                  ><button @click="move(stage.steps, node.id, 1)">↓</button
                  ><button
                    @click="
                      wizard.nodeDraft = {
                        stageId: stage.id,
                        id: node.id,
                        name: node.name,
                        description: node.description,
                      };
                      wizard.stageDraft = null;
                    "
                  >
                    编辑</button
                  ><button @click="deleteNode(stage.id, node.id)">删除</button></span
                >
              </div>
              <div v-if="wizard.nodeDraft?.id === node.id" class="inline structure-draft">
                <input v-model="wizard.nodeDraft.name" placeholder="节点名称" /><input
                  v-if="!props.workspace.isHttp"
                  v-model="wizard.nodeDraft.description"
                  placeholder="节点说明（可选）"
                />
                <div class="structure-draft-actions">
                  <button class="primary" @click="saveNode">保存节点</button>
                  <button @click="wizard.nodeDraft = null">取消</button>
                </div>
              </div>
            </div>
            <div
              v-if="wizard.nodeDraft?.stageId === stage.id && !wizard.nodeDraft.id"
              class="inline structure-draft"
            >
              <input v-model="wizard.nodeDraft.name" placeholder="节点名称" /><input
                v-if="!props.workspace.isHttp"
                v-model="wizard.nodeDraft.description"
                placeholder="节点说明（可选）"
              />
              <div class="structure-draft-actions">
                <button class="primary" @click="saveNode">添加节点</button>
                <button @click="wizard.nodeDraft = null">取消</button>
              </div>
            </div>
            <button
              v-if="wizard.nodeDraft?.stageId !== stage.id"
              @click="
                wizard.nodeDraft = { stageId: stage.id, name: '', description: '' };
                wizard.stageDraft = null;
              "
            >
              + 添加节点
            </button>
          </div>
          <div v-if="wizard.stageDraft?.id === stage.id" class="inline structure-draft">
            <input
              v-model="wizard.stageDraft.name"
              placeholder="环节名称"
              @keyup.enter="saveStage"
            /><input
              v-if="!props.workspace.isHttp"
              v-model="wizard.stageDraft.description"
              placeholder="环节说明（可选）"
            />
            <div class="structure-draft-actions">
              <button class="primary" @click="saveStage">保存环节</button>
              <button @click="wizard.stageDraft = null">取消</button>
            </div>
          </div>
        </div>
        <div v-if="wizard.stageDraft && !wizard.stageDraft.id" class="inline structure-draft">
          <input v-model="wizard.stageDraft.name" placeholder="环节名称" /><input
            v-if="!props.workspace.isHttp"
            v-model="wizard.stageDraft.description"
            placeholder="环节说明（可选）"
          />
          <div class="structure-draft-actions">
            <button class="primary" @click="saveStage">添加环节</button>
            <button @click="wizard.stageDraft = null">取消</button>
          </div>
        </div>
        <button
          v-if="!wizard.stageDraft"
          class="primary add-stage-trigger"
          @click="
            wizard.stageDraft = { name: '', description: '' };
            wizard.nodeDraft = null;
          "
        >
          + 添加环节
        </button>
      </section>
      <section
        v-else-if="wizard.step === 2"
        class="wizard-page"
        aria-label="Command 入口"
        tabindex="-1"
      >
        <p class="hint">
          Command 在 Agent 中通过 / 触发；从资产清单中选择或新定义，参数与正文由流水线发布后回填。
        </p>
        <p class="main-hint">
          <b>主入口建议：</b>建议选择一个以 <code>e2e</code> 开头的 Command 作为流程主入口，例如
          <code>/{{ productPrefix() }}e2e-codec</code>。
        </p>
        <p
          v-if="
            wizard.workflow.commands.length &&
            !hasMainEntry(wizard.workflow.commands, currentProduct?.name || '')
          "
          class="hint"
          role="status"
        >
          建议添加 e2e 主入口 Command，当前配置仍可继续保存。
        </p>
        <p v-if="!wizard.workflow.commands.length" class="hint">尚未选择 Command 入口。</p>
        <div v-for="command in wizard.workflow.commands" :key="command.id" class="command-row">
          <div class="command-details">
            <code>{{ command.name }}</code>
            <p>{{ command.description }}</p>
          </div>
          <span class="command-owner" :title="`开发者：${command.developer || '未指定'}`">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            >
              <circle cx="10" cy="6" r="3" />
              <path d="M4 17v-1a6 6 0 0 1 12 0v1" />
            </svg>
            <span>{{ command.developer || '未指定' }}</span>
          </span>
          <button
            type="button"
            class="command-remove"
            @click="
              wizard.workflow.commands = wizard.workflow.commands.filter(
                (c) => c.id !== command.id,
              );
              syncWizard();
            "
          >
            删除
          </button>
        </div>
        <h4>从资产清单中选择或新定义</h4>
        <WorkflowCapabilityPicker
          :key="`command-${productId}`"
          :types="['Command']"
          :local-options="localCommandOptions"
          :selected-ids="wizard.workflow.commands.map((item) => item.commandId)"
          :query="props.workspace.queryCapabilityOptions"
          @select="selectCapability"
        />
        <div v-if="wizard.commandDraft" class="inline form capability-create-form">
          <div class="capability-create-heading">自定义 Command</div>
          <div class="capability-create-fields">
            <label>
              Command 名称 *
              <input
                v-model="wizard.commandDraft.name"
                :placeholder="`/${productPrefix()}e2e-codec`"
              />
              <span class="capability-field-hint">
                {{
                  productPrefix() ? `以 ${productPrefix()} 开头，` : ''
                }}仅使用小写字母、数字和连字符。
              </span>
            </label>
            <label>
              描述 *
              <textarea v-model="wizard.commandDraft.description" placeholder="描述 *" rows="3" />
            </label>
            <WorkflowPersonPicker
              :query-users="props.workspace.isHttp ? props.workspace.queryDesignUsers : undefined"
              v-model="wizard.commandDraft.developer"
              label="开发责任人 *"
            />
            <WorkflowPersonPicker
              :query-users="props.workspace.isHttp ? props.workspace.queryDesignUsers : undefined"
              v-model="wizard.commandDraft.owner"
              label="责任人 *"
            />
            <label>
              计划完成时间 *
              <input v-model="wizard.commandDraft.dueDate" type="date" />
            </label>
            <p class="capability-field-hint">参数与正文由流水线发布后回填。</p>
          </div>
          <p v-if="wizard.error" class="capability-create-error" role="alert">{{ wizard.error }}</p>
          <div class="capability-create-actions">
            <button class="primary" @click="createCommand">创建并加入资产清单</button>
            <button
              @click="
                wizard.commandDraft = null;
                wizard.error = '';
              "
            >
              取消
            </button>
          </div>
        </div>
        <button v-else class="create-command-trigger" @click="openCommandDraft">
          + 新定义 Command
        </button>
      </section>
      <section v-else class="wizard-page" aria-label="Skill / Agent 集成" tabindex="-1">
        <p class="hint">
          先圈定该 Workflow 可用的 Agent / Skill 资产池，再逐节点从池中分配执行资产。
        </p>
        <h4>
          Workflow 资产池
          <small>{{ wizard.poolIds.length }} 个已选 · 移出资产池会同时解除相关节点的绑定</small>
        </h4>
        <div class="chips">
          <span v-for="id in wizard.poolIds" :key="id"
            ><b>{{ assets.find((a) => a._id === id)?.assetType }}</b
            >{{ assets.find((a) => a._id === id)?.name
            }}<button @click="togglePool(id)">×</button></span
          >
        </div>
        <WorkflowCapabilityPicker
          :key="`asset-${productId}`"
          :types="['Agent', 'Skill']"
          :local-options="localAssetOptions"
          :selected-ids="wizard.poolIds"
          :query="props.workspace.queryCapabilityOptions"
          @select="selectCapability"
          @type-change="
            (type) => {
              if (type !== 'Command') wizard!.assetTypeTab = type;
            }
          "
        />
        <div v-if="wizard.assetDraft" class="inline form capability-create-form">
          <div class="capability-create-heading">自定义 Agent / Skill</div>
          <div class="capability-create-fields">
            <div class="capability-type-field">
              <span>资产类型</span>
              <div class="capability-type-picker" role="group" aria-label="资产类型">
                <button
                  v-for="type in ['Agent', 'Skill'] as const"
                  :key="type"
                  type="button"
                  :aria-pressed="wizard.assetDraft.assetType === type"
                  @click="selectDraftAssetType(type)"
                >
                  {{ type }}
                </button>
              </div>
            </div>
            <label>
              {{ wizard.assetDraft.assetType }} 名称 *
              <input
                v-model="wizard.assetDraft.name"
                :placeholder="`${productPrefix()}${wizard.assetDraft.assetType === 'Skill' ? 'codec-generator' : 'coding-agent'}`"
              />
              <span class="capability-field-hint">
                {{
                  productPrefix() ? `以 ${productPrefix()} 开头，` : ''
                }}仅使用小写字母、数字和连字符。
              </span>
            </label>
            <label>
              描述 *
              <textarea v-model="wizard.assetDraft.description" placeholder="描述 *" rows="3" />
            </label>
            <WorkflowPersonPicker
              :query-users="props.workspace.isHttp ? props.workspace.queryDesignUsers : undefined"
              :key="`developer-${wizard.assetDraft.assetType}`"
              v-model="wizard.assetDraft.developer"
              label="开发责任人 *"
            />
            <WorkflowPersonPicker
              :query-users="props.workspace.isHttp ? props.workspace.queryDesignUsers : undefined"
              :key="`owner-${wizard.assetDraft.assetType}`"
              v-model="wizard.assetDraft.owner"
              label="责任人 *"
            />
            <label>
              计划完成时间 *
              <input v-model="wizard.assetDraft.dueDate" type="date" />
            </label>
            <p class="capability-field-hint">资产内容由流水线发布后回填。</p>
          </div>
          <p v-if="wizard.error" class="capability-create-error" role="alert">{{ wizard.error }}</p>
          <div class="capability-create-actions">
            <button class="primary" @click="createAsset">创建并加入资产清单</button>
            <button
              @click="
                wizard.assetDraft = null;
                wizard.error = '';
              "
            >
              取消
            </button>
          </div>
        </div>
        <div v-else class="capability-create-entry">
          <button type="button" @click="openAssetDraft('Agent')">+ 自定义 Agent</button>
          <button type="button" @click="openAssetDraft('Skill')">+ 自定义 Skill</button>
        </div>
        <h4>节点资产分配 <small>候选来自上方资产池的勾选结果</small></h4>
        <p v-if="!wizard.workflow.stages.flatMap((s) => s.steps).length" class="hint">
          该 Workflow 尚未定义节点。
        </p>
        <div
          v-for="stage in [...wizard.workflow.stages].sort((a, b) => a.order - b.order)"
          :key="stage.id"
          class="assignment"
        >
          <b>{{ stage.name }}</b>
          <small v-if="stage.description" class="assignment-description">{{
            stage.description
          }}</small>
          <div v-for="node in [...stage.steps].sort((a, b) => a.order - b.order)" :key="node.id">
            <strong>{{ node.name }}</strong>
            <small v-if="node.description" class="assignment-description">{{
              node.description
            }}</small>
            <div class="chips">
              <span v-for="id in wizard.nodeAssetsMap[node.id] || []" :key="id"
                ><b>{{ assets.find((a) => a._id === id)?.assetType }}</b
                >{{ assets.find((a) => a._id === id)?.name
                }}<button @click="toggleNodeAsset(node.id, id)">×</button></span
              >
            </div>
            <select
              :aria-label="`为${node.name}分配资产`"
              v-if="
                wizard.poolIds.some((id) => !(wizard?.nodeAssetsMap[node.id] || []).includes(id))
              "
              @change="
                ($event.target as HTMLSelectElement).value &&
                  toggleNodeAsset(node.id, ($event.target as HTMLSelectElement).value);
                ($event.target as HTMLSelectElement).value = '';
              "
            >
              <option value="">+ 从资产池添加…</option>
              <option
                v-for="id in wizard.poolIds.filter(
                  (id) => !(wizard?.nodeAssetsMap[node.id] || []).includes(id),
                )"
                :key="id"
                :value="id"
              >
                {{ assets.find((a) => a._id === id)?.name }}（{{
                  assets.find((a) => a._id === id)?.assetType
                }}）
              </option></select
            ><small v-else-if="!(wizard.nodeAssetsMap[node.id] || []).length">未分配资产</small>
          </div>
        </div>
      </section>
      <footer class="wizard-footer">
        <button
          v-if="props.workspace.isHttp && wizard.error"
          type="button"
          :disabled="wizardBusy"
          @click="dismissWizard"
        >
          放弃未保存修改
        </button>
        <span class="error">{{
          (wizard.step === 2 && wizard.commandDraft) || (wizard.step === 3 && wizard.assetDraft)
            ? ''
            : wizard.error
        }}</span
        ><span
          ><button :disabled="wizardBusy || wizard.step === 0" @click="goStep(wizard.step - 1)">
            上一步</button
          ><button class="primary" :disabled="wizardBusy" @click="goNext">
            {{ wizardBusy ? '正在保存…' : wizard.step === 3 ? '完成设计' : '下一步' }}
          </button></span
        >
      </footer>
    </section>
  </div>
</template>

<style scoped>
.scenario-page,
.scenario-page *,
.modal,
.modal * {
  box-sizing: border-box;
}
.scenario-page button,
.modal button {
  font: inherit;
}
.scenario-page button:not(:disabled),
.modal button:not(:disabled) {
  cursor: pointer;
}
.scenario-page {
  --blue: #2563eb;
  --line: #e5e7eb;
  --muted: #6b7280;
  color: #111827;
  background: transparent;
  min-height: 100%;
  padding: 0;
  font:
    14px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.page-header {
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0.25rem 0 0.4rem;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.page-header p,
.summary p {
  color: var(--muted);
  margin: 0;
}
.selector,
.tree-panel,
.design-panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 1px 3px #0f172a0d;
}
.selector {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  margin-bottom: 1.25rem;
}
.selector-icon {
  padding: 8px;
  border-radius: 9px;
  background: #eff6ff;
}
.dept-picker {
  position: relative;
  min-width: 320px;
  flex: 1;
}
.selector > select {
  width: auto;
  min-width: 180px;
  flex: 0 0 180px;
}
.select-trigger,
select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  padding: 0.55rem 0.75rem;
  text-align: left;
}
.select-trigger b {
  float: right;
}
.dropdown,
.picker-list {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow: auto;
  padding: 0.25rem;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 12px 32px #0f172a24;
}
.dropdown-backdrop,
.picker-backdrop {
  position: fixed;
  z-index: 4;
  inset: 0;
}
.picker-backdrop {
  z-index: 5;
}
.picker-list {
  z-index: 6;
}
.dropdown button,
.picker-list > button {
  display: block;
  width: 100%;
  padding: 0.5rem;
  text-align: left;
  border: 0;
  background: transparent;
}
.dropdown button:hover,
.dropdown .selected {
  background: #f3f4f6;
  color: var(--blue);
}
.divider {
  color: #9ca3af;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(240px, 290px) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
.tree-panel {
  position: sticky;
  top: 0;
  overflow: hidden;
}
.tree-panel > header {
  display: flex;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid #f3f4f6;
  font-weight: 700;
}
.tree-panel > header button {
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 18px;
  width: 26px;
}
.tree-body {
  max-height: calc(100vh - 296px);
  overflow: auto;
  padding: 6px;
}
.tree-sort-hint {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid #eef1f6;
  background: #fafbfd;
  color: #8a94a5;
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.tree-sort-hint.sort-saved {
  color: #23815a;
}
.tree-sort-hint.sort-failed {
  color: #c44751;
}
.scenario-drag-handle {
  display: inline-flex;
  flex: 0 0 12px;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 22px;
  color: #c4ccd8;
  cursor: grab;
  user-select: none;
}
.scenario-drag-handle svg {
  width: 10px;
  height: 16px;
  pointer-events: none;
}
.scenario-drag-handle[draggable='false'] {
  cursor: default;
  opacity: 0.4;
}
.tree-node:hover .scenario-drag-handle {
  color: #8c9cb5;
}
.scenario-drag-handle:active {
  cursor: grabbing;
}
.tree-node.is-dragging {
  opacity: 0.4;
}
.tree-node.drop-before::after,
.tree-node.drop-after::after {
  position: absolute;
  z-index: 1;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: #4d7efa;
  content: '';
  pointer-events: none;
}
.tree-node.drop-before::after {
  top: -1px;
}
.tree-node.drop-after::after {
  bottom: -1px;
}
.tree-node > b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-empty {
  text-align: center;
  line-height: 1.7;
  color: #9ca3af;
  padding: 30px 8px;
}
.tree-node {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.tree-node::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #3b82f6, #6366f1);
  content: '';
  transform: translateY(-50%);
  transition: height 0.2s ease;
}
.tree-node:hover {
  background: #f9fafb;
}
.tree-node:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.22);
  outline-offset: -2px;
}
.tree-node.active {
  color: var(--blue);
  background: linear-gradient(90deg, #eff6ff, #f5f7ff);
}
.tree-node.active::before {
  height: 62%;
}
.toggle,
.node-actions button {
  border: 0;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.toggle.hidden {
  visibility: hidden;
}
.toggle {
  flex: 0 0 12px;
  padding: 0;
}
.toggle.collapsed {
  transform: rotate(-90deg);
}
.node-actions {
  margin-left: auto;
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  opacity: 0;
}
.tree-node:hover .node-actions,
.tree-node:focus-within .node-actions {
  opacity: 1;
}
.node-actions button:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}
.node-actions .danger {
  color: #ef4444;
}
.child {
  margin-left: 20px;
}
.child i {
  flex: 0 0 12px;
  width: 12px;
}
.design-panel {
  min-height: 620px;
  padding: 26px;
}
.summary {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 20px;
  margin-bottom: 20px;
}
.summary h2 {
  margin: 8px 0;
  font-size: 25px;
}
.level,
.status {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.level-1 {
  background: #ede9fe;
  color: #6d28d9;
}
.level-2 {
  background: #dbeafe;
  color: #1d4ed8;
}
.tags,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.tags span,
.chips span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f3f4f6;
  font-size: 12px;
}
.tags button {
  border: 0;
  background: transparent;
  color: #6b7280;
}
.primary {
  display: inline-flex;
  flex-shrink: 0;
  align-self: center;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 0 !important;
  border-radius: 6px !important;
  background: #2563eb !important;
  color: #fff !important;
  padding: 0 12px !important;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.16s ease,
    transform 0.16s ease;
}
.primary:hover {
  background: #1e40af !important;
  transform: translateY(-1px);
}
.start-workflow-button {
  align-self: flex-start;
  padding: 0 12px !important;
  line-height: 20px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 320px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}
.empty > b {
  color: #374151;
  font-size: 16px;
}
.boxed {
  min-height: 240px;
  border: 2px dashed #d1d5db;
  border-radius: 14px;
}
.workflow-card {
  position: relative;
  overflow: hidden;
  margin-top: 12px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.workflow-card:hover {
  border-color: #dbe3ef;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
  transform: translateY(-2px);
}
.workflow-card:before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
  content: '';
}
.workflow-card > header,
.config-grid section > header,
.stage-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.workflow-card h3 {
  margin: 0 0 6px;
}
.status.complete {
  background: #d1fae5;
  color: #065f46;
}
.status.ongoing {
  background: #eff6ff;
  color: #1d4ed8;
}
.progress {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}
.progress button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 5px 10px 5px 5px;
  background: #f3f4f6;
  color: #6b7280;
  line-height: 18px;
}
.progress b {
  display: inline-grid;
  flex: 0 0 18px;
  place-items: center;
  width: 18px;
  height: 18px;
  margin: 0;
  border-radius: 50%;
  background: #e5e7eb;
  font-size: 10px;
  line-height: 18px;
}
.progress button > span {
  display: inline-flex;
  align-items: center;
  height: 18px;
  line-height: 18px;
}
.progress .done {
  background: #d1fae5;
  color: #065f46;
}
.progress .partial {
  background: #fef3c7;
  color: #92400e;
}
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.config-grid section {
  min-height: 92px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fcfcfd;
}
.config-grid small,
.stage-title small,
h4 small {
  color: #9ca3af;
  font-weight: 400;
}
.empty-link {
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--blue);
  cursor: pointer;
}
.commands {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.commands div {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 7px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 11px;
}
.commands code {
  color: #7dd3fc;
  padding: 0;
  background: transparent;
}
.stage-title {
  border-top: 1px solid #f3f4f6;
  margin-top: 20px;
  padding-top: 16px;
}
.pipeline {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  margin-top: 12px;
}
.arrow {
  align-self: center;
  padding: 0 8px;
  font-style: normal;
  color: #2563eb;
  font-size: 18px;
}
.stage {
  min-width: 240px;
  flex: 1;
  padding: 14px;
  border: 1px solid var(--line);
  border-top: 3px solid var(--accent);
  border-radius: 10px;
}
.stage h4,
.stage p {
  margin: 3px 0;
}
.stage p,
.stage small {
  color: #9ca3af;
  font-size: 12px;
}
.stage-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  padding: 8px;
  border-left: 3px solid var(--accent);
  background: #f9fafb;
}
.stage-node span {
  display: inline-flex;
  gap: 4px;
  padding: 3px 5px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 11px;
}
.modal {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0008;
  backdrop-filter: blur(3px);
}
.dialog {
  width: min(600px, 90vw);
  max-height: 90vh;
  overflow: auto;
  padding: 28px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 60px #0f172a40;
}
.dialog h2 {
  margin: 0 0 18px;
}
.form-error {
  margin: -6px 0 16px;
  padding: 9px 11px;
  border-radius: 6px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 13px;
}
.dialog label {
  display: block;
  margin: 0 0 14px;
  font-weight: 600;
}
.dialog input,
.dialog textarea,
.dialog select {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: inherit;
}
.dialog small {
  display: block;
  margin-top: 5px;
  color: #6b7280;
  font-weight: 400;
}
.dialog fieldset {
  margin: 0 0 14px;
  border: 0;
  padding: 0;
}
.dialog fieldset button {
  margin: 5px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 7px;
}
.dialog fieldset .checked {
  color: #1d4ed8;
  border-color: #2563eb;
  background: #eff6ff;
}
.dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
.dialog footer button,
.dialog > button,
.nodes button,
.edit-stage button,
.picker > button,
.command-row button,
.wizard > section > button,
.inline button,
.capability-create-entry button,
.asset-option button {
  display: inline-flex;
  flex-shrink: 0;
  align-self: center;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  padding: 0 12px;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.small {
  max-width: 440px;
}
.center {
  text-align: center;
}
.center > i {
  font-size: 30px;
  font-style: normal;
}
.danger-btn {
  background: #ef4444 !important;
  color: #fff !important;
}
.wizard {
  width: min(760px, 94vw);
  padding: 24px 32px;
  color: #334155;
  font:
    14px/1.6 -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
  letter-spacing: 0;
}
.wizard > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 20px;
}
.wizard > header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}
.wizard label {
  margin-bottom: 24px;
  font-size: 14px;
  font-weight: 500;
}
.wizard input,
.wizard textarea,
.wizard select {
  margin-top: 8px;
  padding: 7px 10px;
  color: #334155;
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
}
.wizard textarea {
  min-height: 112px;
  resize: vertical;
}
.wizard input:focus-visible,
.wizard textarea:focus-visible,
.wizard select:focus-visible {
  outline: none;
  border-color: #9bbbf5;
  box-shadow: 0 0 0 3px #eff4ff;
}
.wizard input[readonly] {
  background: #f8fafc;
  color: #64748b;
}
.wizard small {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.7;
}
.wizard .hint,
.wizard .main-hint {
  margin: 0 0 24px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.7;
}
.wizard button {
  font-size: 13px;
}
.wizard code {
  font-size: 13px;
}
.wizard .primary {
  padding: 0 12px !important;
  font-size: 13px;
  line-height: 20px;
}
.wizard .close {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 22px;
  line-height: 1;
}
.wizard .two {
  gap: 12px;
}
.wizard .two label {
  min-width: 0;
  margin-bottom: 0;
}
.wizard-page:focus {
  outline: none;
}
.wizard .inline {
  align-items: center;
  gap: 10px;
}
.wizard .inline input,
.wizard .inline select {
  margin-top: 0;
}
.wizard .edit-stage > header button,
.wizard .node-row > span > button,
.wizard .nodes > button {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}
.wizard .edit-stage > header > span,
.wizard .node-row > span {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.wizard .wizard-footer {
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
}
.wizard-footer > span:last-child {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
.wizard .wizard-footer button {
  min-width: 68px;
  height: 32px;
  padding: 0 12px;
  font-weight: 500;
  line-height: 20px;
}
.close {
  border: 0;
  background: transparent;
  color: #9ca3af;
  font-size: 26px;
}
.wizard > nav {
  display: flex;
  align-items: flex-start;
  margin: 20px 0;
}
.wizard > nav i {
  flex: 1;
  height: 2px;
  margin: 14px 8px;
  background: #e5e7eb;
}
.wizard > nav i.reached {
  background: #2563eb;
}
.wizard > nav button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 11px;
}
.wizard > nav button > b {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #f3f4f6;
}
.wizard > nav .current > b {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}
.wizard > nav .current > span {
  color: #2563eb;
  font-weight: 600;
}
.wizard > nav button:disabled {
  opacity: 1;
}
.wizard > nav .done > b {
  background: #d1fae5;
  color: #065f46;
}
.hint,
.main-hint {
  padding: 10px 13px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  color: #4b5563;
  line-height: 1.6;
}
.main-hint {
  border-left: 3px solid #2563eb;
  background: #eff6ff;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.wizard h4 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 24px 0 12px;
}
.wizard h4 small {
  margin-top: 0;
  font-weight: 400;
  text-align: right;
}
.edit-stage,
.assignment {
  margin-bottom: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.edit-stage > header {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f9fafb;
}
.nodes {
  padding: 8px 14px 12px 32px;
}
.node-row {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 6px 0;
}
.structure-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}
.wizard .structure-info small,
.wizard .assignment-description {
  margin: 2px 0 0;
  color: #7b8799;
  font-weight: 400;
}
.wizard .structure-draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
}
.nodes .structure-draft {
  margin: 8px 0;
}
.structure-draft-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.add-stage-trigger {
  margin-top: 10px;
}
.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px;
  padding: 9px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
}
.inline input,
.inline select {
  flex: 1;
  min-width: 130px;
}
.form input {
  min-width: 190px;
}
.wizard .capability-create-form {
  display: block;
  min-width: 0;
  margin: 14px 0 18px;
  padding: 0;
  overflow: hidden;
  border-color: #e3e8f0;
  border-radius: 8px;
  background: #fff;
}
.capability-create-heading {
  padding: 14px 16px;
  border-bottom: 1px solid #edf0f5;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
}
.capability-create-entry {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 18px;
}
.capability-create-entry button {
  color: #475569;
  border-color: #dce3ee;
}
.capability-create-entry button:hover {
  color: #2563eb;
  border-color: #a8c1f9;
  background: #f5f8ff;
}
.capability-type-field {
  display: grid;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
}
.capability-type-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid #e3e8f0;
  border-radius: 7px;
  background: #f5f7fa;
}
.wizard .capability-type-picker button {
  height: 30px;
  border-color: transparent;
  background: transparent;
  color: #64748b;
}
.wizard .capability-type-picker button[aria-pressed='true'] {
  border-color: #d6e2ff;
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 3px #0f172a0d;
  font-weight: 600;
}
.capability-type-picker button:focus-visible,
.capability-create-entry button:focus-visible {
  outline: 2px solid #6397f5;
  outline-offset: 2px;
}
.capability-field-hint {
  margin: 0;
  color: #8a96a8;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.6;
}
.capability-create-error {
  margin: 0 16px 16px;
  padding: 9px 12px;
  border-radius: 6px;
  background: #fff1f2;
  color: #be4354;
  font-size: 12px;
}
.capability-create-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
}
.wizard .capability-create-fields label {
  display: grid;
  gap: 6px;
  min-width: 0;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
}
.wizard .capability-create-fields input,
.wizard .capability-create-fields textarea,
.wizard .capability-create-fields select {
  width: 100%;
  min-width: 0;
  margin: 0;
  background: #fff;
}
.wizard .capability-create-fields textarea {
  min-height: 76px;
}
.capability-create-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #edf0f5;
  background: #f8fafc;
}
.wizard {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.picker {
  position: relative;
  margin: 10px 0;
}
.picker > button,
.wizard .create-command-trigger {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}
.picker-list {
  z-index: 6;
}
.picker-list small {
  display: block;
  color: #6b7280;
}
.wizard .command-picker {
  width: 100%;
  min-width: 0;
  margin: 14px 0 18px;
}
.wizard .command-picker-trigger {
  position: relative;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid #dce2eb;
  border-radius: 8px;
  background: #fff;
  color: #536178;
  line-height: 20px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.command-picker-trigger > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.command-picker-trigger:hover,
.command-picker-trigger[aria-expanded='true'] {
  border-color: #9bbbf5;
  color: #245dc1;
}
.command-picker-trigger[aria-expanded='true'] {
  box-shadow: 0 0 0 3px #eff4ff;
}
.picker-chevron {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  color: #8a96a8;
  transition: transform 0.15s;
}
.command-picker-trigger[aria-expanded='true'] .picker-chevron {
  transform: rotate(180deg);
  color: #3478ed;
}
.wizard .command-picker .picker-list {
  position: relative;
  inset: auto;
  width: 100%;
  max-height: 240px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid #dfe5ee;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(30, 50, 80, 0.06);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cdd5e1 transparent;
}
.wizard .command-picker-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 0;
  border-radius: 7px;
  background: #f8fafc;
  text-align: left;
  transition: background 0.15s;
}
.command-picker-option + .command-picker-option {
  margin-top: 4px;
}
.wizard .command-picker-option:hover,
.wizard .command-picker-option:focus-visible {
  background: #edf4ff;
}
.command-option-icon {
  display: grid;
  flex: 0 0 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #dce8fc;
  border-radius: 8px;
  background: #eff5ff;
  color: #3478ed;
  font:
    500 18px/1 ui-monospace,
    Consolas,
    monospace;
}
.command-option-content {
  flex: 1;
  min-width: 0;
}
.command-option-content code {
  display: block;
  padding: 0;
  background: transparent;
  color: #334764;
  font-weight: 500;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
}
.wizard .command-option-content small {
  margin-top: 4px;
  color: #7b8799;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.command-option-action {
  flex-shrink: 0;
  color: #3478ed;
  font-size: 12px;
  font-weight: 500;
}
.wizard .command-picker button:focus-visible {
  outline: 2px solid #6397f5;
  outline-offset: -2px;
}
.command-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px 40px;
  gap: 16px;
  align-items: center;
  margin: 10px 0;
  padding: 12px 14px;
  border: 1px solid #e3e8f0;
  border-radius: 8px;
  background: #fff;
}
.command-details {
  min-width: 0;
}
.command-details code {
  display: block;
  padding: 0;
  background: transparent;
  color: #334764;
  font-weight: 500;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
}
.command-details p {
  margin: 4px 0 0;
  color: #7b8799;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.command-owner {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 120px;
  color: #8a94a5;
  font-size: 12px;
  line-height: 20px;
}
.command-owner svg {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
}
.command-owner > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wizard .command-remove {
  min-width: 40px;
  height: 28px;
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #a9666e;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
  transition:
    color 0.15s,
    background 0.15s;
}
.wizard .command-remove:hover {
  background: #fff1f2;
  color: #d5485d;
}
.wizard .command-remove:focus-visible {
  outline: 2px solid #6397f5;
  outline-offset: 2px;
}
.tabs {
  display: flex;
  gap: 4px;
}
.tabs button {
  border: 0 !important;
}
.tabs .active {
  color: #2563eb;
  background: #eff6ff;
}
.asset-option {
  display: flex;
  justify-content: space-between;
  padding: 8px;
}
.asset-option small {
  display: block;
}
.chips span button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #9ca3af;
  line-height: 1;
}
.chips span button:hover {
  color: #ef4444;
}
.assignment {
  padding: 12px;
}
.assignment > div {
  margin: 10px 0 0;
  padding: 8px 0 8px 18px;
  border-top: 1px solid #f3f4f6;
  border-left: 2px solid #e5e7eb;
}
.assignment select {
  width: 100%;
  padding: 7px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.wizard-footer {
  justify-content: space-between !important;
  border-top: 1px solid #f3f4f6;
  padding-top: 16px;
}
.error {
  color: #ef4444;
  align-self: center;
}
.scenario-modal {
  padding: 24px;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(4px);
  color: #25324b;
  font:
    14px/1.5 -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
  letter-spacing: 0;
}
.scenario-editor {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: calc(100dvh - 48px);
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 18px;
  box-shadow:
    0 24px 80px rgba(15, 23, 42, 0.2),
    0 4px 16px rgba(15, 23, 42, 0.06);
}
.scenario-editor:focus {
  outline: none;
}
.tag-editor {
  width: min(640px, 100%);
}
.editor-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 14px;
  padding: 24px 28px;
  border-bottom: 1px solid #edf0f5;
}
.editor-icon {
  display: grid;
  flex: 0 0 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #dfeaff;
  border-radius: 12px;
  background: #f0f5ff;
  color: #2563eb;
}
.editor-icon svg {
  width: 23px;
  height: 23px;
}
.editor-heading {
  flex: 1;
  min-width: 0;
}
.editor-heading h2 {
  margin: 0;
  color: #17243b;
  font-size: 21px;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: 0;
}
.editor-heading p {
  margin: 5px 0 0;
  color: #7a8597;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.editor-close {
  display: grid;
  flex: 0 0 32px;
  height: 32px;
  align-self: flex-start;
  place-items: center;
  padding: 7px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #8792a4;
}
.editor-close svg {
  width: 18px;
  height: 18px;
}
.editor-close:hover {
  background: #f1f4f8;
  color: #334155;
}
.editor-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 0;
  padding: 24px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.scenario-editor .editor-field,
.scenario-editor .editor-tags {
  min-width: 0;
  margin: 0;
}
.scenario-editor .editor-field {
  font-weight: 600;
  font-size: 14px;
}
.required-mark {
  color: #ed6464;
  margin-left: 2px;
}
.optional-mark,
.editor-tags legend > span {
  margin-left: 7px;
  color: #8a94a5;
  font-size: 12px;
  font-weight: 400;
}
.scenario-editor .editor-field input,
.scenario-editor .editor-field textarea {
  margin-top: 9px;
  padding: 10px 12px;
  border-color: #dce2eb;
  border-radius: 8px;
  background: #fff;
  color: #25324b;
  font-weight: 400;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.scenario-editor .editor-field textarea {
  min-height: 90px;
  resize: vertical;
}
.scenario-editor input::placeholder,
.scenario-editor textarea::placeholder {
  color: #9aa4b4;
}
.scenario-editor .editor-field input:focus,
.scenario-editor .editor-field textarea:focus {
  outline: none;
  border-color: #7da6fa;
  box-shadow: 0 0 0 3px #edf3ff;
}
.editor-tags legend {
  padding: 0;
  font-size: 14px;
  font-weight: 600;
}
.tag-picker-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 7px 0 12px;
  color: #8a94a5;
  font-size: 12px;
}
.selection-count {
  flex-shrink: 0;
  color: #69768c;
}
.selection-count b {
  color: #2563eb;
  font-weight: 600;
}
.tag-picker {
  overflow: hidden;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #fafbfd;
}
.tag-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-bottom: 1px solid #e9edf4;
  background: #fff;
  color: #9aa4b4;
}
.tag-search svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}
.scenario-editor .tag-search input {
  min-width: 0;
  height: 42px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 400;
  outline: none;
}
.tag-search:focus-within {
  box-shadow: inset 0 -2px #7da6fa;
  color: #2563eb;
}
.tag-choices {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  height: 192px;
  max-height: 192px;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.scenario-editor .tag-choice {
  display: inline-flex;
  align-items: flex-start;
  gap: 7px;
  max-width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid #e1e6ef;
  border-radius: 7px;
  background: #fff;
  color: #536178;
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  overflow-wrap: anywhere;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.scenario-editor .tag-choice:hover {
  border-color: #a9c5fb;
  color: #2563eb;
}
.scenario-editor .tag-choice.checked {
  border-color: #9cbdfb;
  background: #edf4ff;
  color: #245dc1;
}
.tag-check {
  display: grid;
  flex: 0 0 14px;
  height: 14px;
  margin-top: 2px;
  place-items: center;
  border: 1px solid #cbd4e2;
  border-radius: 4px;
  background: #fff;
  color: transparent;
  font-size: 10px;
  line-height: 1;
}
.checked .tag-check {
  border-color: #3478ed;
  background: #3478ed;
  color: #fff;
}
.tag-empty {
  width: 100%;
  margin: 20px 0;
  color: #8a94a5;
  font-size: 13px;
  text-align: center;
}
.scenario-editor .editor-footer {
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 18px 28px;
  border-top: 1px solid #edf0f5;
  background: #fafbfd;
}
.editor-footer-note {
  flex: 1;
  color: #8a94a5;
  font-size: 12px;
}
.scenario-editor .editor-footer button {
  min-width: 68px;
  min-height: 32px;
  padding: 0 12px;
  border-color: #dce2eb;
  border-radius: 6px;
  color: #536178;
  font-size: 13px;
  font-weight: 500;
}
.scenario-editor .editor-footer .primary {
  border-radius: 6px !important;
}
.scenario-editor button:focus-visible {
  outline: 2px solid #6397f5;
  outline-offset: 2px;
}
.scenario-editor button:disabled,
.scenario-editor button[aria-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
}
.scenario-editor .form-error {
  margin: 0;
}
.editor-body,
.tag-choices {
  scrollbar-width: thin;
  scrollbar-color: #cdd5e1 transparent;
}
@media (max-height: 800px) {
  .editor-header {
    padding-top: 20px;
    padding-bottom: 20px;
  }
  .editor-body {
    gap: 18px;
    padding-top: 20px;
    padding-bottom: 20px;
  }
  .tag-choices {
    max-height: 128px;
  }
  .scenario-editor .editor-footer {
    padding-top: 14px;
    padding-bottom: 14px;
  }
}
@media (max-width: 650px) {
  .scenario-modal {
    padding: 12px;
  }
  .scenario-editor {
    max-height: calc(100dvh - 24px);
    border-radius: 14px;
  }
  .editor-header {
    gap: 10px;
    padding: 20px 18px;
  }
  .editor-icon {
    flex-basis: 38px;
    height: 38px;
    border-radius: 10px;
  }
  .editor-heading h2 {
    font-size: 19px;
  }
  .editor-heading p {
    font-size: 12px;
  }
  .editor-body {
    gap: 20px;
    padding: 20px 18px;
  }
  .scenario-editor .editor-footer {
    padding: 16px 18px;
  }
  .editor-footer-note {
    display: none;
  }
  .tag-picker-meta {
    gap: 6px;
  }
}
@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .tree-panel {
    position: static;
  }
  .tree-body {
    max-height: 320px;
  }
  .config-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 650px) {
  .scenario-page {
    padding: 14px;
  }
  .selector {
    flex-wrap: wrap;
  }
  .dept-picker {
    min-width: 100%;
  }
  .selector > select {
    width: 100%;
    flex-basis: 100%;
  }
  .design-panel {
    padding: 16px;
  }
  .summary,
  .workflow-card > header {
    flex-direction: column;
  }
  .two,
  .config-grid {
    grid-template-columns: 1fr;
  }
  .wizard {
    width: 100%;
    min-width: 0;
    padding: 18px;
  }
  .wizard > nav span {
    display: none;
  }
  .wizard .command-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
    padding: 12px;
  }
  .wizard .command-details {
    grid-column: 1 / -1;
  }
  .wizard .command-row > button {
    justify-self: end;
  }
}
.scenario-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.selector {
  flex-shrink: 0;
  margin-bottom: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .workspace {
    flex: 1;
    min-height: 0;
    align-items: stretch;
    gap: 16px;
  }

  .tree-panel {
    position: static;
    display: flex;
    min-height: 0;
    flex-direction: column;
  }

  .tree-panel > header,
  .tree-sort-hint {
    flex-shrink: 0;
  }

  .tree-body {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .design-panel {
    min-height: 0;
    overflow: auto;
  }
}
</style>

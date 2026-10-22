<script setup lang="ts">
import HarnessSelect from '../../components/skill/HarnessSelect.vue';
import WorkflowCommandsDialog from '../../components/skill/WorkflowCommandsDialog.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import HarnessDepartmentPicker from '@/components/skill/HarnessDepartmentPicker.vue';
import ExtensionPublishPage from '@/views/skill/ExtensionPublishPage.vue';
import type { HarnessScenarioWorkspace, Workflow } from '@/composables/useHarnessScenarioWorkspace';
import { getHarnessAssetApi } from '@/services/skillMarket/assetManagementService';
import type { HarnessAsset, HarnessAssetScope } from '@/services/skillMarket/assetManagementTypes';
import {
  queryHarnessWorkflowPage,
  type HarnessWorkflowCommand,
  type HarnessWorkflowListQuery,
  type HarnessWorkflowListRow,
} from '@/services/skillMarket/harnessWorkflowListService';
import type { ExtensionReleaseContext } from '@/services/skillMarket/extensionPublishHttp';

const props = withDefaults(
  defineProps<{ workspace: HarnessScenarioWorkspace; active?: boolean; userName?: string }>(),
  { active: true, userName: '' },
);
const emit = defineEmits<{ (event: 'open-scenarios'): void }>();
const {
  isHttp,
  workflowListScope,
  departments,
  products,
  scenarios,
  workflows,
  selectedDeptId,
  inventoryProductOptions: productOptions,
  ensureInventoryScope,
  loading,
  available,
  error: workspaceError,
  selectDepartment,
} = props.workspace;

const STATUS_OPTIONS = ['全部', '设计中', '待发布', '已发布'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type WorkflowStatus = Exclude<StatusFilter, '全部'>;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type WorkflowPageView = 'list' | 'publish';
type WorkflowDisplayRow = {
  id: string;
  name: string;
  description: string;
  extensionName: string;
  productName: string;
  departmentName: string;
  departmentPath: string[];
  scenarioPath: string;
  firstScene: string;
  secondScene: string;
  scenarioDescription: string;
  dimType: string;
  dimCode: string;
  dimName: string;
  commandCount: number | null;
  status: WorkflowStatus;
  canPublish?: boolean | null;
  changed?: boolean | null;
  targetOrgCode?: string | null;
  targetOrgName?: string | null;
  latestPublishTime?: string | null;
  latestVersion?: string | null;
  commands: HarnessWorkflowCommand[];
};
const view = ref<WorkflowPageView>('list');
const pageSize = ref(10);
const productFilter = ref('');
const statusFilter = ref<StatusFilter>('全部');
const page = ref(1);
const jumpPage = ref<string | number>('1');
const inventoryLoading = ref(false);
const inventoryError = ref('');
const selectedWorkflow = ref<WorkflowDisplayRow | null>(null);
const selectedCommandWorkflow = ref<WorkflowDisplayRow | null>(null);
const workflowRelease = ref<{
  context: ExtensionReleaseContext;
  mode: 'publish' | 'history';
} | null>(null);
const workflowReleaseLoading = ref(false);
const workflowReleaseLoadingMode = ref<'publish' | 'history'>('publish');
const workflowReleaseError = ref('');
let inventoryLoadSequence = 0;
let workflowReleaseSequence = 0;
const assetApi = getHarnessAssetApi();
const httpRows = ref<HarnessWorkflowListRow[]>([]);
const httpTotal = ref(0);
const httpQuery = computed<HarnessWorkflowListQuery | null>(() => {
  if (!isHttp || !props.active || !workflowListScope.value) return null;
  const product = productFilter.value
    ? productOptions.value.find((item) => item._id === productFilter.value)
    : undefined;
  return {
    ...workflowListScope.value,
    ...(product?.code ? { productCode: product.code } : {}),
    ...(statusFilter.value !== '全部' ? { status: statusFilter.value } : {}),
    pageNo: page.value,
    pageSize: pageSize.value,
  };
});
const pageLoading = computed(() =>
  isHttp ? inventoryLoading.value : loading.value || inventoryLoading.value,
);
const pageError = computed(() =>
  isHttp ? inventoryError.value : inventoryError.value || workspaceError.value,
);
const pageAvailable = computed(() => (isHttp ? Boolean(workflowListScope.value) : available.value));

const scenarioById = computed(() => new Map(scenarios.map((scenario) => [scenario._id, scenario])));
const productById = computed(() => new Map(products.map((product) => [product._id, product])));
const departmentById = computed(
  () => new Map(departments.map((department) => [department._id, department])),
);
const scopedProductIds = computed(
  () =>
    new Set(
      productOptions.value
        .filter((product) => !productFilter.value || product._id === productFilter.value)
        .map((product) => product._id),
    ),
);
const scopedWorkflows = computed(() =>
  workflows.filter((workflow) => {
    const scenario = scenarioById.value.get(workflow.scenarioId);
    return scenario && scopedProductIds.value.has(scenario.productId);
  }),
);

function normalizeWorkflowStatus(status: unknown, releaseCount = 0): WorkflowStatus {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  if (releaseCount > 0 || ['已发布', 'published', 'released'].includes(normalized)) {
    return '已发布';
  }
  if (['待发布', '可发布', 'ready', 'active', 'completed', 'complete'].includes(normalized)) {
    return '待发布';
  }
  return '设计中';
}

function statusOf(workflow: Workflow): WorkflowStatus {
  return normalizeWorkflowStatus(workflow.status, workflow.releaseCount);
}
const filteredWorkflows = computed(() =>
  statusFilter.value === '全部'
    ? scopedWorkflows.value
    : scopedWorkflows.value.filter((workflow) => statusOf(workflow) === statusFilter.value),
);
const totalRows = computed(() => (isHttp ? httpTotal.value : filteredWorkflows.value.length));
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize.value)));
const pageNumbers = computed(() =>
  Array.from(
    { length: Math.min(7, totalPages.value) },
    (_, index) => Math.max(1, Math.min(page.value - 3, totalPages.value - 6)) + index,
  ),
);
const visibleRows = computed<WorkflowDisplayRow[]>(() => {
  if (isHttp) {
    return httpRows.value.map((row, index) => ({
      id: JSON.stringify([row.dimType, row.dimCode, row.firstScene, row.secondScene, index]),
      name: row.flowName || '未命名工作流',
      description: row.flowDescription || '',
      extensionName: row.sceneExtensionCode || '',
      productName: row.dimType === '产品级' ? row.dimName || '-' : '-',
      departmentName: '',
      departmentPath: [],
      scenarioPath: [row.firstScene, row.secondScene].filter(Boolean).join(' / ') || '未关联场景',
      firstScene: row.firstScene || '',
      secondScene: row.secondScene || '',
      scenarioDescription: row.secondSceneDescription || '',
      dimType: row.dimType || '',
      dimCode: row.dimCode || '',
      dimName: row.dimName || '',
      commandCount:
        Number.isSafeInteger(row.commandCount) && row.commandCount! >= 0 ? row.commandCount : null,
      status: normalizeWorkflowStatus(row.status || ''),
      canPublish: row.canPublish,
      changed: row.changed,
      targetOrgCode: row.targetOrgCode,
      targetOrgName: row.targetOrgName,
      latestPublishTime: row.latestPublishTime,
      latestVersion: row.latestVersion,
      commands: [],
    }));
  }
  return filteredWorkflows.value
    .slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    .map((workflow) => {
      const scenario = scenarioById.value.get(workflow.scenarioId);
      const parent = scenario?.parentId ? scenarioById.value.get(scenario.parentId) : undefined;
      const product = scenario ? productById.value.get(scenario.productId) : undefined;
      const department = product ? departmentById.value.get(product.departmentId) : undefined;
      return {
        id: workflow._id,
        name: workflow.name || '未命名 Workflow',
        description: workflow.description,
        extensionName: scenario?.code || '',
        commandCount: workflow.commands?.length || 0,
        scenarioDescription: scenario?.description || '',
        productName: product?.name || '-',
        departmentName: department?.name || '-',
        departmentPath: [...(department?.path ?? [])],
        firstScene: parent?.name || '',
        secondScene: scenario?.name || '',
        dimType: '产品级',
        dimCode: product?.code || '',
        dimName: product?.name || '',
        scenarioPath: scenario
          ? parent
            ? `${parent.name} / ${scenario.name}`
            : scenario.name
          : workflow.businessScenario || '未关联场景',
        status: statusOf(workflow),
        canPublish: workflow.canPublish,
        changed: workflow.changed,
        targetOrgCode: null,
        targetOrgName: null,
        latestPublishTime: null,
        latestVersion: null,
        commands: (workflow.commands ?? []).map((command) => ({
          name: command.name,
          description: command.description || '',
          version: command.version?.trim() || null,
        })),
      };
    });
});

function shouldShowPublish(row: (typeof visibleRows.value)[number]): boolean {
  if (row.status === '待发布') return row.canPublish === true;
  return row.status === '已发布' && row.canPublish === true && row.changed === true;
}

function openWorkflowCommands(row: WorkflowDisplayRow): void {
  if ((row.commandCount ?? 0) <= 0) return;
  selectedCommandWorkflow.value = row;
}

function closeWorkflowCommands(): void {
  selectedCommandWorkflow.value = null;
}

function workflowScope(row: WorkflowDisplayRow): HarnessAssetScope {
  const selectedDepartment = departments.find(
    (department) => department._id === selectedDeptId.value,
  );
  const rowPath = row.dimType === '部门级' ? row.dimName.split('/').filter(Boolean) : [];
  const departmentPath =
    rowPath.length > 0 ? rowPath : [...(selectedDepartment?.path ?? row.departmentPath)];
  const departmentName =
    row.dimType === '部门级'
      ? departmentPath.at(-1) || row.dimName
      : selectedDepartment?.name || row.departmentName || row.dimName;
  return {
    userId: workflowListScope.value?.userId ?? '',
    userName: props.userName,
    department: {
      id: row.dimType === '部门级' ? row.dimCode : selectedDepartment?._id || row.dimCode,
      code: row.dimType === '部门级' ? row.dimCode : selectedDepartment?.deptCode || '',
      name: departmentName,
      path: departmentPath.length > 0 ? departmentPath : [departmentName].filter(Boolean),
    },
    ...(row.dimType === '产品级'
      ? {
          product: {
            id: row.dimCode,
            name: row.dimName,
            departmentPath,
          },
        }
      : {}),
    assetType: 'Extension',
  };
}

function workflowAsset(row: WorkflowDisplayRow): HarnessAsset {
  const scope = workflowScope(row);
  const version = row.latestVersion?.trim() ?? '';
  return {
    id: row.id,
    name: row.extensionName,
    description: row.description,
    assetType: 'Extension',
    dimType: row.dimType,
    dimCode: row.dimCode,
    dimName: row.dimName,
    firstScene: row.firstScene,
    secondScene: row.secondScene,
    currentVersion: version,
    versions: version ? [version] : [],
    owner: '',
    developer: '',
    publisher: '',
    departmentName: scope.department.name,
    departmentPath: [...scope.department.path],
    productId: scope.product?.id ?? '',
    productName: scope.product?.name ?? '',
    auto: true,
    marketplace: { rating: 0, downloads: 0, calls: 0 },
    releases: [],
    publishable: row.status !== '设计中',
    canPublish: row.canPublish === true,
    status: row.status,
    updatedAt: row.latestPublishTime ?? undefined,
  };
}

async function openWorkflowRelease(
  row: WorkflowDisplayRow,
  mode: 'publish' | 'history',
): Promise<void> {
  const sequence = ++workflowReleaseSequence;
  selectedWorkflow.value = row;
  workflowRelease.value = null;
  workflowReleaseError.value = '';
  workflowReleaseLoadingMode.value = mode;
  workflowReleaseLoading.value = true;
  view.value = 'publish';
  if (mode === 'publish' && !row.extensionName.trim()) {
    workflowReleaseError.value = '该工作流缺少 Extension 名称，暂时无法发布';
    workflowReleaseLoading.value = false;
    return;
  }
  try {
    const context = await assetApi.queryExtensionReleaseContext(
      workflowScope(row),
      workflowAsset(row),
      mode,
    );
    if (sequence !== workflowReleaseSequence || view.value !== 'publish') return;
    workflowRelease.value = { context, mode };
  } catch (caught) {
    if (sequence !== workflowReleaseSequence || view.value !== 'publish') return;
    workflowReleaseError.value =
      caught instanceof Error && caught.message
        ? caught.message
        : mode === 'history'
          ? '发布历史加载失败'
          : 'Extension 发布信息加载失败';
  } finally {
    if (sequence === workflowReleaseSequence) workflowReleaseLoading.value = false;
  }
}

async function reloadWorkflowRelease(): Promise<void> {
  if (selectedWorkflow.value) {
    await openWorkflowRelease(selectedWorkflow.value, workflowReleaseLoadingMode.value);
  }
}

async function onWorkflowReleased(): Promise<void> {
  await refreshInventoryScope();
}

function returnFromWorkflowRelease(): void {
  workflowReleaseSequence += 1;
  workflowReleaseLoading.value = false;
  workflowReleaseError.value = '';
  workflowRelease.value = null;
  selectedWorkflow.value = null;
  view.value = 'list';
}

function setPageSize(size: number) {
  pageSize.value = size;
  page.value = 1;
  jumpPage.value = '1';
}

function goToPage() {
  const requestedPage = Number(jumpPage.value);
  if (String(jumpPage.value).trim() && Number.isFinite(requestedPage)) {
    page.value = Math.max(1, Math.min(totalPages.value, Math.trunc(requestedPage)));
  }
  jumpPage.value = String(page.value);
}

watch(page, (currentPage) => {
  jumpPage.value = String(currentPage);
});
watch(selectedDeptId, () => {
  productFilter.value = '';
  statusFilter.value = '全部';
  page.value = 1;
});
watch([productFilter, statusFilter], () => {
  page.value = 1;
});
watch(totalPages, (lastPage) => {
  if (!isHttp) page.value = Math.max(1, Math.min(page.value, lastPage));
});
watch(productOptions, (options) => {
  if (productFilter.value && !options.some((product) => product._id === productFilter.value)) {
    productFilter.value = '';
  }
});

async function refreshInventoryScope() {
  const query = httpQuery.value;
  if (isHttp ? !query : loading.value || !available.value) return;
  const requestSequence = ++inventoryLoadSequence;
  inventoryLoading.value = true;
  inventoryError.value = '';
  if (isHttp) httpRows.value = [];
  try {
    if (isHttp && query) {
      const result = await queryHarnessWorkflowPage(query);
      if (requestSequence !== inventoryLoadSequence || httpQuery.value !== query) return;
      httpRows.value = result.list;
      httpTotal.value = result.total;
      pageSize.value = result.pageSize;
      page.value = Math.min(result.pageNo, Math.max(1, Math.ceil(result.total / result.pageSize)));
    } else {
      await ensureInventoryScope();
    }
  } catch (caught) {
    if (requestSequence === inventoryLoadSequence) {
      inventoryError.value = caught instanceof Error ? caught.message : '工作流列表加载失败';
      if (isHttp) httpTotal.value = 0;
    }
  } finally {
    if (requestSequence === inventoryLoadSequence) inventoryLoading.value = false;
  }
}

watch(
  [selectedDeptId, loading, available],
  () => {
    if (isHttp) return;
    inventoryLoadSequence += 1;
    inventoryLoading.value = false;
    inventoryError.value = '';
    if (!loading.value && available.value) void refreshInventoryScope();
  },
  { immediate: true },
);

watch(
  httpQuery,
  (query) => {
    if (!isHttp) return;
    inventoryLoadSequence += 1;
    inventoryLoading.value = false;
    inventoryError.value = '';
    if (query) void refreshInventoryScope();
    else {
      httpRows.value = [];
      httpTotal.value = 0;
    }
  },
  { immediate: true },
);

function selectDept(id: string) {
  selectDepartment(id);
  productFilter.value = '';
  statusFilter.value = '全部';
  page.value = 1;
}

onBeforeUnmount(() => {
  inventoryLoadSequence += 1;
  workflowReleaseSequence += 1;
});
</script>

<template>
  <div class="workflows-page harness-viewport-page">
    <template v-if="view === 'list'">
      <header class="workflows-page-header harness-page-heading">
        <div>
          <h1 class="harness-page-title">Harness 工作流</h1>
          <p class="harness-page-description">
            按部门和产品查看工作流清单，掌握各流程的发布状态、所属业务场景和 Command 入口。
          </p>
        </div>
        <button class="workflow-entry-link" type="button" @click="emit('open-scenarios')">
          前往场景设计 →
        </button>
      </header>

      <section class="dept-product-selector" aria-label="工作流范围筛选">
        <HarnessDepartmentPicker
          class="dept-picker"
          :active="props.active"
          :model-value="selectedDeptId"
          :departments="departments"
          @update:model-value="selectDept"
        />
        <template v-if="productOptions.length">
          <span class="selector-divider" aria-hidden="true">→</span>
          <HarnessSelect
            v-model="productFilter"
            class="product-select"
            aria-label="筛选产品"
            :options="[
              { value: '', label: '全部产品' },
              ...productOptions.map((product) => ({ value: product._id, label: product.name })),
            ]"
          />
        </template>
      </section>

      <p v-if="pageLoading" class="inventory-feedback" role="status">
        {{ isHttp ? '正在加载工作流…' : '正在加载工作流所属场景…' }}
      </p>
      <p v-if="pageError" class="inventory-feedback error" role="alert">
        {{ pageError }}
        <button
          type="button"
          @click="
            !isHttp && workspaceError ? props.workspace.reloadScenes() : refreshInventoryScope()
          "
        >
          重试加载
        </button>
      </p>

      <section v-if="pageAvailable" class="workflows-card" aria-label="工作流清单">
        <div
          v-if="!isHttp && !pageLoading && !scopedWorkflows.length"
          class="empty-state"
          role="status"
        >
          <svg class="empty-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none">
            <path
              d="M7 10h18M7 16h12M7 22h8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <rect
              x="2"
              y="3"
              width="28"
              height="26"
              rx="4"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
          <div class="empty-title">暂无工作流</div>
          <p class="empty-hint">点击右上角“前往场景设计”开始。</p>
        </div>
        <template v-else>
          <div class="workflows-toolbar">
            <div class="workflows-status-filter" role="group" aria-label="筛选工作流状态">
              <button
                v-for="status in STATUS_OPTIONS"
                :key="status"
                class="wf-status-chip"
                :class="{ active: statusFilter === status }"
                type="button"
                :aria-pressed="statusFilter === status"
                @click="statusFilter = status"
              >
                {{ status }}
              </button>
            </div>
          </div>

          <div v-if="!pageLoading && !pageError && !totalRows" class="empty-state" role="status">
            <svg class="empty-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none">
              <circle cx="14" cy="14" r="9" stroke="currentColor" stroke-width="1.5" />
              <path d="m21 21 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <div class="empty-title">
              {{ statusFilter === '全部' ? '暂无工作流' : '该状态下暂无工作流' }}
            </div>
            <p class="empty-hint">
              {{
                statusFilter === '全部'
                  ? '切换范围，或从业务场景开始设计。'
                  : '切换到其他状态看看。'
              }}
            </p>
          </div>
          <template v-else-if="!pageLoading && !pageError && visibleRows.length">
            <div class="table-scroll" role="region" aria-label="工作流列表" tabindex="0">
              <table class="workflows-table">
                <caption class="sr-only">
                  Harness 工作流清单
                </caption>
                <thead>
                  <tr>
                    <th scope="col">名称</th>
                    <th scope="col">产品</th>
                    <th v-if="!isHttp" scope="col">部门</th>
                    <th scope="col">状态</th>
                    <th scope="col">所属业务场景</th>
                    <th scope="col">Command 入口</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in visibleRows" :key="row.id">
                    <td class="wf-name" :title="row.description">{{ row.name }}</td>
                    <td>{{ row.productName }}</td>
                    <td v-if="!isHttp">{{ row.departmentName }}</td>
                    <td>
                      <span
                        class="workflow-status-badge"
                        :class="{
                          published: row.status === '已发布',
                          pending: row.status === '待发布',
                          developing: row.status === '设计中',
                        }"
                      >
                        {{ row.status }}
                      </span>
                    </td>
                    <td :title="row.scenarioDescription">{{ row.scenarioPath }}</td>
                    <td>
                      <div class="wf-command-entry">
                        <span class="wf-count-pill">{{
                          row.commandCount === null ? '-' : `${row.commandCount} 个`
                        }}</span>
                        <button
                          v-if="(row.commandCount ?? 0) > 0"
                          type="button"
                          class="wf-icon-action wf-icon-action--commands"
                          aria-label="查看 Command"
                          title="查看 Command"
                          @click="openWorkflowCommands(row)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                            <path d="m7.5 9 3 3-3 3M13 15h3.5" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td>
                      <div class="wf-actions">
                        <button
                          type="button"
                          class="wf-icon-action wf-icon-action--history"
                          aria-label="查看发布历史"
                          title="查看发布历史"
                          @click="openWorkflowRelease(row, 'history')"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="8.25" />
                            <path d="M12 7.5V12l3.25 2" />
                          </svg>
                        </button>
                        <button
                          v-if="shouldShowPublish(row)"
                          type="button"
                          class="wf-icon-action is-publish"
                          aria-label="发布"
                          title="发布"
                          @click="openWorkflowRelease(row, 'publish')"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m21 3-7.1 18-3.2-7.7L3 10.1 21 3Z" />
                            <path d="m10.7 13.3 4.6-4.6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <nav class="workflows-pagination" aria-label="工作流分页">
              <span class="wf-page-total" aria-live="polite">共 {{ totalRows }} 条</span>
              <div class="wf-page-controls">
                <HarnessSelect
                  class="wf-page-size"
                  aria-label="每页条数"
                  :model-value="pageSize"
                  @change="setPageSize(Number($event))"
                  :searchable="false"
                  :options="[
                    ...PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: size + '条/页' })),
                  ]"
                />
                <div class="wf-page-navigation">
                  <button
                    class="wf-page-btn icon"
                    type="button"
                    aria-label="上一页"
                    title="上一页"
                    :disabled="page === 1"
                    @click="page -= 1"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m14 6-6 6 6 6"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    v-for="pageNumber in pageNumbers"
                    :key="pageNumber"
                    class="wf-page-btn num"
                    :class="{ active: page === pageNumber }"
                    type="button"
                    :aria-label="`第 ${pageNumber} 页`"
                    :aria-current="page === pageNumber ? 'page' : undefined"
                    @click="page = pageNumber"
                  >
                    {{ pageNumber }}
                  </button>
                  <button
                    class="wf-page-btn icon"
                    type="button"
                    aria-label="下一页"
                    title="下一页"
                    :disabled="page === totalPages"
                    @click="page += 1"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m10 6 6 6-6 6"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <label class="wf-page-jump">
                  前往
                  <input
                    v-model="jumpPage"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    :max="totalPages"
                    step="1"
                    aria-label="跳转页码"
                    @keydown.enter.prevent="goToPage"
                    @blur="goToPage"
                  />
                  页
                </label>
              </div>
            </nav>
          </template>
        </template>
      </section>
    </template>

    <ExtensionPublishPage
      v-else-if="view === 'publish' && workflowRelease && selectedWorkflow"
      :release-context="workflowRelease.context"
      :initial-panel="workflowRelease.mode"
      :user-id="workflowListScope?.userId || ''"
      :user-name="props.userName"
      :preferred-organization="{
        id: selectedWorkflow.targetOrgCode,
        name: selectedWorkflow.targetOrgName,
      }"
      @close="returnFromWorkflowRelease"
      @reload="reloadWorkflowRelease"
      @released="onWorkflowReleased"
    />

    <template v-else-if="view === 'publish'">
      <section class="workflow-release-loading" aria-label="工作流发布准备">
        <button type="button" class="workflow-back" @click="returnFromWorkflowRelease">
          <span aria-hidden="true">←</span> 返回工作流列表
        </button>
        <div v-if="workflowReleaseLoading" class="workflow-release-feedback" role="status">
          {{
            workflowReleaseLoadingMode === 'history'
              ? '正在加载发布历史…'
              : '正在加载 Extension 发布信息…'
          }}
        </div>
        <div
          v-else-if="workflowReleaseError"
          class="workflow-release-feedback is-error"
          role="alert"
        >
          <span>{{ workflowReleaseError }}</span>
          <button type="button" @click="reloadWorkflowRelease">重新加载</button>
        </div>
      </section>
    </template>

    <WorkflowCommandsDialog
      v-if="selectedCommandWorkflow"
      :open="true"
      :workflow-name="selectedCommandWorkflow.name"
      :is-http="isHttp"
      :user-id="workflowListScope?.userId || ''"
      :dim-type="selectedCommandWorkflow.dimType"
      :dim-code="selectedCommandWorkflow.dimCode"
      :dim-name="selectedCommandWorkflow.dimName"
      :first-scene="selectedCommandWorkflow.firstScene"
      :second-scene="selectedCommandWorkflow.secondScene"
      :initial-commands="selectedCommandWorkflow.commands"
      @close="closeWorkflowCommands"
    />
  </div>
</template>

<style scoped>
.workflows-page,
.workflows-page * {
  box-sizing: border-box;
}
.workflows-page {
  --blue: #2563eb;
  --line: #e5e7eb;
  --muted: #6b7280;
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  color: #111827;
  background: transparent;
  font:
    14px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.workflows-page button,
.workflows-page :is(select, .harness-select),
.workflows-page input {
  font: inherit;
}
.workflows-page button:not(:disabled),
.workflows-page :is(select, .harness-select) {
  cursor: pointer;
}
.workflows-page button:focus-visible,
.workflows-page :is(select, .harness-select):focus-visible,
.workflows-page input:focus-visible,
.table-scroll:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 3px;
}
.workflows-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.5rem;
}
.workflows-page-header h1 {
  margin: 0.25rem 0 0.4rem;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.workflows-page-header p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
.workflow-entry-link {
  flex-shrink: 0;
  align-self: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--blue);
  border-radius: 6px;
  background: var(--blue);
  color: #fff;
  font-weight: 500;
  line-height: 20px;
}
.workflow-entry-link:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
}
.dept-product-selector,
.workflows-card {
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 1px 3px #0f172a0d;
}
.dept-product-selector {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  margin-bottom: 1.5rem;
}
.dept-picker {
  position: relative;
  flex: 1;
  min-width: 0;
}
.product-select {
  min-height: 36px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  text-align: left;
}
.product-select:hover {
  border-color: var(--blue);
}
.selector-divider {
  flex-shrink: 0;
  color: #d1d5db;
}
.product-select {
  flex: 0 0 180px;
  width: 180px;
}
.workflows-card {
  padding: 0.5rem 1.25rem 1rem;
}
.inventory-feedback {
  color: var(--muted);
  line-height: 1.6;
}
.inventory-feedback.error {
  color: #b91c1c;
}
.inventory-feedback button {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--blue);
}
.workflows-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0 0.25rem;
}
.workflows-status-filter {
  display: inline-flex;
  gap: 6px;
}
.workflows-page .wf-status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 13px;
  border: 1px solid #dde1ea;
  border-radius: 16px;
  background: #fff;
  color: #5a6478;
  font-size: 12.5px;
  font-weight: 400;
}
.workflows-page .wf-status-chip:hover {
  border-color: #b9c2d4;
}
.workflows-page .wf-status-chip.active {
  border-color: #1f2329;
  background: #1f2329;
  color: #fff;
  box-shadow: none;
}
.table-scroll {
  overflow-x: auto;
}
.workflows-table {
  width: 100%;
  min-width: 800px;
  margin-top: 0.5rem;
  border-collapse: collapse;
}
.workflows-table thead {
  border-bottom: 1px solid var(--line);
}
.workflows-table th {
  padding: 0.75rem 0.85rem;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: left;
  white-space: nowrap;
}
.workflows-table td {
  padding: 0.8rem 0.85rem;
  border-bottom: 1px solid #f3f4f6;
  color: #4b5563;
  line-height: 1.5;
}
.workflows-table tbody tr:hover {
  background: #f9fafb;
}
.workflows-table tbody tr:last-child td {
  border-bottom: 0;
}
.workflows-table .wf-name {
  color: #111827;
  font-weight: 600;
}
.workflow-status-badge,
.wf-count-pill {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.workflow-status-badge.published {
  background: #d1fae5;
  color: #065f46;
}
.workflow-status-badge.developing {
  background: #fef3c7;
  color: #92400e;
}
.workflow-status-badge.pending {
  background: #dbeafe;
  color: #1e40af;
}
.wf-count-pill {
  background: #f3f4f6;
  color: var(--muted);
}
.wf-command-entry {
  display: flex;
  align-items: center;
  gap: 10px;
}
.wf-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.workflows-page .wf-actions button {
  min-width: 52px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid #d9deea;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  font-size: 13px;
}
.workflows-page .wf-actions button:hover {
  border-color: #b9c2d4;
  background: #f8fafc;
}
.workflows-page .wf-actions .wf-icon-action {
  display: inline-flex;
  width: 32px;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.workflows-page .wf-command-entry .wf-icon-action {
  display: inline-flex;
  width: 30px;
  min-width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #d9deea;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}
.wf-icon-action svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.workflows-page .wf-actions .wf-icon-action--history:hover {
  border-color: #93b4f8;
  background: #f3f7ff;
  color: var(--blue);
}
.workflows-page .wf-command-entry .wf-icon-action--commands:hover {
  border-color: #9fb4f3;
  background: #f2f6ff;
  color: #315de8;
}
.workflows-page .wf-actions .is-publish {
  border-color: var(--blue);
  background: var(--blue);
  color: #fff;
  font-weight: 600;
}
.workflows-page .wf-actions .is-publish:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
}
.workflows-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.35rem;
  padding-top: 0.85rem;
  border-top: 1px solid #f3f4f6;
}
.wf-page-total {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 12px;
}
.wf-page-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}
.wf-page-navigation {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.wf-page-size,
.wf-page-jump input {
  height: 32px;
  padding: 0 0.5rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
}
.wf-page-size:hover,
.wf-page-jump input:hover {
  border-color: var(--blue);
}
.wf-page-jump {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.wf-page-jump input {
  width: 52px;
  text-align: center;
  appearance: textfield;
}
.wf-page-jump input::-webkit-inner-spin-button,
.wf-page-jump input::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
.workflows-page .wf-page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
}
.wf-page-btn:hover:not(:disabled) {
  border-color: var(--blue);
  color: var(--blue);
}
.wf-page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.wf-page-btn.num {
  padding: 0.3rem 0.4rem;
  text-align: center;
}
.wf-page-btn.icon {
  width: 32px;
  padding: 0;
}
.wf-page-btn.num.active {
  border-color: var(--blue);
  background: var(--blue);
  color: #fff;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--muted);
  text-align: center;
}
.empty-icon {
  margin-bottom: 0.75rem;
  font-size: 40px;
}
.empty-title {
  margin-bottom: 0.25rem;
  color: #374151;
  font-size: 16px;
  font-weight: 600;
}
.empty-hint {
  margin: 0;
  line-height: 1.6;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 760px) {
  .workflows-page-header {
    flex-wrap: wrap;
    gap: 1rem;
  }
  .dept-product-selector {
    flex-wrap: wrap;
  }
  .dept-picker {
    flex-basis: calc(100% - 44px);
  }
  .selector-divider {
    display: none;
  }
  .product-select {
    flex-basis: 100%;
    width: 100%;
  }
  .workflows-card {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }
  .workflows-pagination {
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .wf-page-controls {
    width: 100%;
    justify-content: flex-start;
  }
}
.workflows-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dept-product-selector {
  flex-shrink: 0;
  margin-bottom: 0;
}

.workflows-card {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.workflows-toolbar,
.workflows-pagination {
  flex-shrink: 0;
}

.table-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.workflow-release-loading {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}
.workflow-back {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: #475569;
  font-weight: 600;
}
.workflow-back:hover {
  color: var(--blue);
}
.workflow-detail-board {
  min-height: 0;
  padding: 24px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}
.workflow-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 22px;
  border-bottom: 1px solid #e5e7eb;
}
.workflow-detail-heading {
  min-width: 0;
}
.workflow-detail-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}
.workflow-detail-title-line h1 {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
  line-height: 1.35;
}
.workflow-type-badge,
.workflow-update-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
}
.workflow-type-badge {
  background: #ede9fe;
  color: #6d28d9;
}
.workflow-update-badge {
  background: #fff7ed;
  color: #c2410c;
}
.workflow-detail-scope,
.workflow-detail-description {
  margin: 9px 0 0;
  color: #64748b;
  line-height: 1.6;
}
.workflow-detail-description {
  max-width: 760px;
  color: #475569;
}
.workflow-detail-actions {
  display: flex;
  flex-shrink: 0;
  gap: 10px;
}
.workflow-primary-button,
.workflow-secondary-button,
.workflow-release-feedback button {
  min-height: 36px;
  padding: 7px 14px;
  border-radius: 6px;
  font-weight: 600;
}
.workflow-primary-button {
  border: 1px solid var(--blue);
  background: var(--blue);
  color: #fff;
}
.workflow-secondary-button,
.workflow-release-feedback button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.workflow-detail-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  padding: 20px 0;
  border-bottom: 1px solid #e5e7eb;
}
.workflow-detail-facts > div {
  min-width: 0;
  padding: 0 18px;
  border-left: 1px solid #e5e7eb;
}
.workflow-detail-facts > div:first-child {
  padding-left: 0;
  border-left: 0;
}
.workflow-detail-facts dt {
  margin-bottom: 7px;
  color: #94a3b8;
  font-size: 12px;
}
.workflow-detail-facts dd {
  margin: 0;
  overflow: hidden;
  color: #334155;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workflow-release-feedback {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #64748b;
}
.workflow-release-feedback.is-error {
  color: #b91c1c;
}
.workflow-detail-section {
  padding-top: 24px;
}
.workflow-detail-section + .workflow-detail-section {
  margin-top: 24px;
  border-top: 1px solid #e5e7eb;
}
.workflow-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
}
.workflow-section-title h2 {
  margin: 0;
  color: #1e293b;
  font-size: 17px;
}
.workflow-section-title span {
  color: #94a3b8;
  font-size: 12px;
}
.workflow-progress-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.workflow-progress-list li {
  display: flex;
  min-width: 0;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;
}
.workflow-progress-list li.is-done {
  border-color: #a7f3d0;
  background: #f0fdf4;
}
.workflow-progress-list li.is-partial {
  border-color: #fde68a;
  background: #fffbeb;
}
.workflow-progress-index {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}
.workflow-progress-list .is-done .workflow-progress-index {
  background: #10b981;
  color: #fff;
}
.workflow-progress-list .is-partial .workflow-progress-index {
  background: #f59e0b;
  color: #fff;
}
.workflow-progress-list strong {
  color: #1e293b;
}
.workflow-progress-list p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.workflow-component-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.workflow-component-group {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
}
.workflow-component-group h3,
.workflow-stage-list h3 {
  margin: 0 0 12px;
  color: #334155;
  font-size: 14px;
}
.workflow-component-group ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.workflow-component-group li {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding-top: 9px;
  border-top: 1px solid #f1f5f9;
}
.workflow-component-group li:first-child {
  padding-top: 0;
  border-top: 0;
}
.workflow-component-group strong {
  overflow: hidden;
  color: #1e293b;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workflow-component-group span,
.workflow-component-group small,
.workflow-component-empty,
.workflow-stage-step span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.workflow-component-group small.ready {
  color: #047857;
}
.workflow-component-empty {
  margin: 0;
}
.workflow-stage-list {
  display: grid;
  gap: 12px;
}
.workflow-stage-list article {
  padding: 15px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
}
.workflow-stage-step {
  display: grid;
  grid-template-columns: minmax(160px, 0.35fr) 1fr;
  gap: 16px;
  padding: 8px 0;
  border-top: 1px solid #f1f5f9;
}

@media (max-width: 980px) {
  .workflow-detail-facts,
  .workflow-progress-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .workflow-component-groups {
    grid-template-columns: 1fr;
  }
}
</style>

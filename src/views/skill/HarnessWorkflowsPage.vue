<script setup lang="ts">
import HarnessSelect from '../../components/skill/HarnessSelect.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import HarnessDepartmentPicker from '@/components/skill/HarnessDepartmentPicker.vue';
import type { HarnessScenarioWorkspace, Workflow } from '@/composables/useHarnessScenarioWorkspace';
import {
  queryHarnessWorkflowPage,
  type HarnessWorkflowListQuery,
  type HarnessWorkflowListRow,
} from '@/services/skillMarket/harnessWorkflowListService';

const props = withDefaults(
  defineProps<{ workspace: HarnessScenarioWorkspace; active?: boolean }>(),
  { active: true },
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

const STATUS_OPTIONS = ['全部', '已发布', '待发布', '设计中'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
const statusOptions = computed(() =>
  isHttp ? STATUS_OPTIONS : STATUS_OPTIONS.filter((status) => status !== '待发布'),
);
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const pageSize = ref(10);
const productFilter = ref('');
const statusFilter = ref<StatusFilter>('全部');
const page = ref(1);
const jumpPage = ref<string | number>('1');
const inventoryLoading = ref(false);
const inventoryError = ref('');
let inventoryLoadSequence = 0;
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

function statusOf(workflow: Workflow): Exclude<StatusFilter, '全部'> {
  return workflow.releaseCount > 0 ? '已发布' : '设计中';
}

const statusCounts = computed(() => {
  const total = scopedWorkflows.value.length;
  const published = scopedWorkflows.value.filter(
    (workflow) => statusOf(workflow) === '已发布',
  ).length;
  return { 全部: total, 已发布: published, 待发布: 0, 设计中: total - published };
});
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
const visibleRows = computed(() => {
  if (isHttp) {
    return httpRows.value.map((row, index) => ({
      id: JSON.stringify([row.dimType, row.dimCode, row.firstScene, row.secondScene, index]),
      name: row.flowName || '未命名工作流',
      description: row.flowDescription || '',
      productName: row.dimType === '产品级' ? row.dimName || '-' : '-',
      departmentName: '',
      scenarioPath: [row.firstScene, row.secondScene].filter(Boolean).join(' / ') || '未关联场景',
      scenarioDescription: row.secondSceneDescription || '',
      commandCount:
        Number.isSafeInteger(row.commandCount) && row.commandCount! >= 0 ? row.commandCount : null,
      status: row.status || '-',
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
        commandCount: workflow.commands?.length || 0,
        scenarioDescription: scenario?.description || '',
        productName: product?.name || '-',
        departmentName: department?.name || '-',
        scenarioPath: scenario
          ? parent
            ? `${parent.name} / ${scenario.name}`
            : scenario.name
          : workflow.businessScenario || '未关联场景',
        status: statusOf(workflow),
      };
    });
});

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
});
</script>

<template>
  <div class="workflows-page harness-viewport-page">
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
              v-for="status in statusOptions"
              :key="status"
              class="wf-status-chip"
              :class="{ active: statusFilter === status }"
              type="button"
              :aria-pressed="statusFilter === status"
              @click="statusFilter = status"
            >
              {{ status }}
              <span v-if="!isHttp" class="wf-status-count" aria-hidden="true">{{
                statusCounts[status]
              }}</span>
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
              statusFilter === '全部' ? '切换范围，或从业务场景开始设计。' : '切换到其他状态看看。'
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
                        designing: row.status === '设计中',
                      }"
                    >
                      {{ row.status }}
                    </span>
                  </td>
                  <td :title="row.scenarioDescription">{{ row.scenarioPath }}</td>
                  <td>
                    <span class="wf-count-pill">{{
                      row.commandCount === null ? '-' : `${row.commandCount} 个`
                    }}</span>
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
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 9px;
  background: #f3f4f6;
}
.workflows-page .wf-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
.wf-status-chip.active {
  background: #fff;
  color: var(--blue);
  box-shadow: 0 1px 3px #0f172a1f;
}
.wf-status-count {
  min-width: 1.1rem;
  padding: 0.02rem 0.28rem;
  border-radius: 999px;
  background: #e5e7eb;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.wf-status-chip.active .wf-status-count {
  background: #dbeafe;
  color: #1d4ed8;
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
.workflow-status-badge.designing {
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
</style>

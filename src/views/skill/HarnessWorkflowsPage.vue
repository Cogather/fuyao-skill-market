<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { HarnessScenarioWorkspace, Workflow } from '@/composables/useHarnessScenarioWorkspace';

const props = defineProps<{ workspace: HarnessScenarioWorkspace }>();
const emit = defineEmits<{ (event: 'open-scenarios'): void }>();
const {
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
  deptPath,
  selectDepartment,
} = props.workspace;

const STATUS_OPTIONS = ['全部', '已发布', '设计中'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
const PAGE_SIZE = 10;
const productFilter = ref('');
const statusFilter = ref<StatusFilter>('全部');
const page = ref(1);
const deptOpen = ref(false);
const departmentPicker = ref<HTMLElement | null>(null);
const departmentTrigger = ref<HTMLButtonElement | null>(null);
const departmentDropdown = ref<HTMLElement | null>(null);
const inventoryLoading = ref(false);
const inventoryError = ref('');
let inventoryLoadSequence = 0;

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
  return { 全部: total, 已发布: published, 设计中: total - published };
});
const filteredWorkflows = computed(() =>
  statusFilter.value === '全部'
    ? scopedWorkflows.value
    : scopedWorkflows.value.filter((workflow) => statusOf(workflow) === statusFilter.value),
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredWorkflows.value.length / PAGE_SIZE)),
);
const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, index) => index + 1),
);
const visibleRows = computed(() =>
  filteredWorkflows.value
    .slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
    .map((workflow) => {
      const scenario = scenarioById.value.get(workflow.scenarioId);
      const parent = scenario?.parentId ? scenarioById.value.get(scenario.parentId) : undefined;
      const product = scenario ? productById.value.get(scenario.productId) : undefined;
      const department = product ? departmentById.value.get(product.departmentId) : undefined;
      return {
        workflow,
        productName: product?.name || '-',
        departmentName: department?.name || '-',
        scenarioPath: scenario
          ? parent
            ? `${parent.name} / ${scenario.name}`
            : scenario.name
          : workflow.businessScenario || '未关联场景',
        status: statusOf(workflow),
      };
    }),
);

watch(selectedDeptId, () => {
  productFilter.value = '';
  statusFilter.value = '全部';
  page.value = 1;
  deptOpen.value = false;
});
watch([productFilter, statusFilter], () => {
  page.value = 1;
});
watch(totalPages, (lastPage) => {
  page.value = Math.max(1, Math.min(page.value, lastPage));
});
watch(productOptions, (options) => {
  if (productFilter.value && !options.some((product) => product._id === productFilter.value)) {
    productFilter.value = '';
  }
});

async function refreshInventoryScope() {
  if (loading.value || !available.value) return;
  const requestSequence = ++inventoryLoadSequence;
  inventoryLoading.value = true;
  inventoryError.value = '';
  try {
    await ensureInventoryScope();
  } catch (caught) {
    if (requestSequence === inventoryLoadSequence) {
      inventoryError.value = caught instanceof Error ? caught.message : '工作流范围加载失败';
    }
  } finally {
    if (requestSequence === inventoryLoadSequence) inventoryLoading.value = false;
  }
}

watch(
  [selectedDeptId, loading, available],
  () => {
    inventoryLoadSequence += 1;
    inventoryLoading.value = false;
    inventoryError.value = '';
    if (!loading.value && available.value) void refreshInventoryScope();
  },
  { immediate: true },
);

function closeDepartmentPicker(restoreFocus = false) {
  deptOpen.value = false;
  if (restoreFocus) departmentTrigger.value?.focus();
}

function selectDept(id: string) {
  selectDepartment(id);
  productFilter.value = '';
  statusFilter.value = '全部';
  page.value = 1;
  closeDepartmentPicker(true);
}

async function focusDepartment() {
  deptOpen.value = true;
  await nextTick();
  const options = departmentDropdown.value?.querySelectorAll<HTMLButtonElement>('button');
  const selectedIndex = departments.findIndex(
    (department) => department._id === selectedDeptId.value,
  );
  options?.[Math.max(0, selectedIndex)]?.focus();
}

function handleDepartmentKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const options = Array.from(
    departmentDropdown.value?.querySelectorAll<HTMLButtonElement>('button') || [],
  );
  if (!options.length) return;
  event.preventDefault();
  const currentIndex = options.findIndex((option) => option === document.activeElement);
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[nextIndex]?.focus();
}

function handleOutsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !departmentPicker.value?.contains(event.target)) {
    closeDepartmentPicker();
  }
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointer));
</script>

<template>
  <div
    class="workflows-page harness-viewport-page"
    @keydown.esc.stop.prevent="closeDepartmentPicker(true)"
  >
    <header class="workflows-page-header harness-page-heading">
      <div>
        <h1 class="harness-page-title">Harness 工作流</h1>
        <p class="harness-page-description">
          集中查看各业务场景的 Workflow；流程设计请从业务场景进入。
        </p>
      </div>
      <button class="workflow-entry-link" type="button" @click="emit('open-scenarios')">
        前往场景设计 →
      </button>
    </header>

    <section class="dept-product-selector" aria-label="工作流范围筛选">
      <span class="selector-icon" aria-hidden="true">🏢</span>
      <div ref="departmentPicker" class="dept-picker">
        <button
          ref="departmentTrigger"
          class="select-trigger"
          type="button"
          aria-label="选择部门"
          aria-controls="workflows-department-options"
          :aria-expanded="deptOpen"
          @click="deptOpen = !deptOpen"
          @keydown.down.prevent="focusDepartment"
        >
          <span class="select-label">{{ deptPath(selectedDeptId) || '选部门…' }}</span>
          <span class="select-arrow" aria-hidden="true">▾</span>
        </button>
        <div
          v-if="deptOpen"
          id="workflows-department-options"
          ref="departmentDropdown"
          class="department-dropdown"
          role="group"
          aria-label="部门选项"
          @keydown="handleDepartmentKeydown"
        >
          <button
            v-for="department in departments"
            :key="department._id"
            type="button"
            :style="{
              paddingLeft: `${0.65 + (deptPath(department._id).split(' / ').length - 1) * 0.9}rem`,
            }"
            :class="{ selected: selectedDeptId === department._id }"
            :aria-pressed="selectedDeptId === department._id"
            @click="selectDept(department._id)"
          >
            {{ department.name }}
          </button>
        </div>
      </div>
      <template v-if="productOptions.length">
        <span class="selector-divider" aria-hidden="true">→</span>
        <select v-model="productFilter" class="product-select" aria-label="筛选产品">
          <option value="">全部产品</option>
          <option v-for="product in productOptions" :key="product._id" :value="product._id">
            {{ product.name }}
          </option>
        </select>
      </template>
    </section>

    <p v-if="loading || inventoryLoading" class="inventory-feedback" role="status">
      正在加载工作流所属场景…
    </p>
    <p v-if="inventoryError || workspaceError" class="inventory-feedback error" role="alert">
      {{ inventoryError || workspaceError }}
      <button
        type="button"
        @click="workspaceError ? props.workspace.reloadScenes() : refreshInventoryScope()"
      >
        重试加载
      </button>
    </p>

    <section
      v-if="available && !loading && !inventoryLoading"
      class="workflows-card"
      aria-label="工作流清单"
    >
      <div v-if="!scopedWorkflows.length" class="empty-state" role="status">
        <div class="empty-icon" aria-hidden="true">⚙️</div>
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
              <span class="wf-status-count" aria-hidden="true">{{ statusCounts[status] }}</span>
            </button>
          </div>
        </div>

        <div v-if="!filteredWorkflows.length" class="empty-state" role="status">
          <div class="empty-icon" aria-hidden="true">🔍</div>
          <div class="empty-title">该状态下暂无工作流</div>
          <p class="empty-hint">切换到其他状态看看。</p>
        </div>
        <template v-else>
          <div class="table-scroll" role="region" aria-label="工作流列表" tabindex="0">
            <table class="workflows-table">
              <caption class="sr-only">
                Harness 工作流清单
              </caption>
              <thead>
                <tr>
                  <th scope="col">名称</th>
                  <th scope="col">产品</th>
                  <th scope="col">部门</th>
                  <th scope="col">状态</th>
                  <th scope="col">所属业务场景</th>
                  <th scope="col">Command 入口</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.workflow._id">
                  <td class="wf-name">{{ row.workflow.name }}</td>
                  <td>{{ row.productName }}</td>
                  <td>{{ row.departmentName }}</td>
                  <td>
                    <span
                      class="workflow-status-badge"
                      :class="row.status === '已发布' ? 'published' : 'designing'"
                    >
                      {{ row.status }}
                    </span>
                  </td>
                  <td>{{ row.scenarioPath }}</td>
                  <td>
                    <span class="wf-count-pill">{{ row.workflow.commands?.length || 0 }} 个</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <nav class="workflows-pagination" aria-label="工作流分页">
            <span class="wf-page-total" aria-live="polite"
              >共 {{ filteredWorkflows.length }} 条</span
            >
            <div class="wf-page-controls">
              <button class="wf-page-btn" type="button" :disabled="page === 1" @click="page -= 1">
                <span aria-hidden="true">← </span>上一页
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
                class="wf-page-btn"
                type="button"
                :disabled="page === totalPages"
                @click="page += 1"
              >
                下一页<span aria-hidden="true"> →</span>
              </button>
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
  min-height: 100%;
  padding: 0;
  color: #111827;
  background: transparent;
  font:
    14px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.workflows-page button,
.workflows-page select {
  font: inherit;
}
.workflows-page button:not(:disabled),
.workflows-page select {
  cursor: pointer;
}
.workflows-page button:focus-visible,
.workflows-page select:focus-visible,
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
.selector-icon {
  display: inline-grid;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(135deg, #eff6ff, #e0e7ff);
  font-size: 16px;
}
.dept-picker {
  position: relative;
  flex: 1;
  min-width: 0;
}
.select-trigger,
.product-select {
  min-height: 36px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  text-align: left;
}
.select-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.select-trigger:hover,
.product-select:hover {
  border-color: var(--blue);
}
.select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-arrow {
  color: #9ca3af;
  font-size: 12px;
}
.selector-divider {
  flex-shrink: 0;
  color: #d1d5db;
}
.product-select {
  flex: 0 0 180px;
  width: 180px;
}
.department-dropdown {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  max-height: 320px;
  overflow: auto;
  padding: 0.25rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 32px #0f172a24;
}
.department-dropdown button {
  display: block;
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #374151;
  text-align: left;
}
.department-dropdown button:hover {
  background: #f9fafb;
}
.department-dropdown button.selected {
  background: #eff6ff;
  color: var(--blue);
  font-weight: 600;
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
  gap: 0.3rem;
}
.workflows-page .wf-page-btn {
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
  min-width: 1.9rem;
  padding: 0.3rem 0.4rem;
  text-align: center;
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

@media (min-width: 1101px) and (min-height: 900px) {
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
}
</style>

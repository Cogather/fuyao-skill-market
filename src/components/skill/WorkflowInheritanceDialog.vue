<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { mergeUniquePage, shouldLoadNextPage } from '../../utils/infiniteScroll';
import type {
  WorkflowInheritancePage,
  WorkflowInheritanceConfiguration,
  WorkflowInheritanceSource,
} from '../../services/skillMarket/workflowInheritanceService';

const PAGE_SIZE = 20;
const props = withDefaults(
  defineProps<{
    open: boolean;
    busy?: boolean;
    error?: string;
    targetConfiguration: WorkflowInheritanceConfiguration;
    loadPage: (query: {
      keyword: string;
      pageNo: number;
      pageSize: number;
    }) => Promise<WorkflowInheritancePage>;
  }>(),
  { busy: false, error: '' },
);
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'confirm', source: WorkflowInheritanceSource): void;
}>();

const keyword = ref('');
const createsScene = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const rows = ref<WorkflowInheritanceSource[]>([]);
const selectedKey = ref('');
const pageNo = ref(0);
const total = ref(0);
const excludedCurrent = ref(false);
const continuation = ref<boolean | undefined>();
const loading = ref(false);
const loadError = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
const resultsPanel = ref<HTMLElement | null>(null);
let requestSequence = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let previousScrollTop = 0;

const selected = computed(() => rows.value.find((row) => row.key === selectedKey.value) ?? null);
const hasKeyword = computed(() => Boolean(keyword.value.trim()));
const hasMore = computed(() => continuation.value ?? rows.value.length < total.value);
const canConfirm = computed(() =>
  Boolean(props.open && selected.value && !props.busy && !loading.value),
);
const targetConfigurationSummary = computed(() => {
  const configuration = props.targetConfiguration;
  if (!configuration.stageCount && !configuration.commandCount && !configuration.assetCount)
    return '空，尚未配置';
  return `${configuration.stageCount} 环节 / ${configuration.commandCount} Command / ${configuration.assetCount} 资产`;
});
const selectedWorkflowLabel = computed(() => selected.value?.flowName || '未命名 Workflow');
const inheritanceWarningText = computed(() =>
  selected.value
    ? `确认后，将用「${selectedWorkflowLabel.value}」的完整配置直接覆盖当前内容（被覆盖：${targetConfigurationSummary.value}），将覆盖为全新的配置。`
    : '',
);

function clearSearchTimer() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = undefined;
}

function resetSearch() {
  requestSequence += 1;
  loading.value = false;
  loadError.value = '';
  rows.value = [];
  selectedKey.value = '';
  pageNo.value = 0;
  total.value = 0;
  excludedCurrent.value = false;
  continuation.value = undefined;
  previousScrollTop = 0;
  if (resultsPanel.value) resultsPanel.value.scrollTop = 0;
}

async function loadPageNumber(nextPage: number, replace: boolean) {
  if (!props.open || loading.value) return;
  const sequence = ++requestSequence;
  const queryKeyword = keyword.value.trim();
  loading.value = true;
  loadError.value = '';
  try {
    const result = await props.loadPage({
      keyword: queryKeyword,
      pageNo: nextPage,
      pageSize: PAGE_SIZE,
    });
    if (sequence !== requestSequence || !props.open || keyword.value.trim() !== queryKeyword)
      return;
    if (!queryKeyword) {
      rows.value = [];
      pageNo.value = result.pageNo;
      continuation.value = false;
      total.value = 0;
      return;
    }
    rows.value = mergeUniquePage(replace ? [] : rows.value, result.list, (row) => row.key);
    pageNo.value = result.pageNo;
    continuation.value = result.hasMore;
    excludedCurrent.value = excludedCurrent.value || result.excludedCurrent === true;
    total.value = Math.max(0, result.total - (excludedCurrent.value ? 1 : 0));
  } catch (cause) {
    if (sequence !== requestSequence || !props.open) return;
    const message = cause instanceof Error ? cause.message : '候选 Workflow 加载失败';
    loadError.value = !queryKeyword && message.trim() === 'keyword不能为空' ? '' : message;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

async function loadFirstPage() {
  resetSearch();
  await loadPageNumber(1, true);
}

async function runSearch() {
  clearSearchTimer();
  await loadFirstPage();
}

async function loadNextPage() {
  if (!hasKeyword.value || loading.value || !hasMore.value) return;
  await loadPageNumber(pageNo.value + 1, false);
}

function onResultsScroll(event: Event) {
  const element = event.currentTarget as HTMLElement;
  const currentScrollTop = element.scrollTop;
  const shouldLoad = shouldLoadNextPage({
    previousScrollTop,
    scrollTop: currentScrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    threshold: 72,
    loading: loading.value,
    hasMore: hasMore.value,
  });
  previousScrollTop = currentScrollTop;
  if (shouldLoad) void loadNextPage();
}

function onResultsWheel(event: WheelEvent) {
  if (event.deltaY <= 0) return;
  const element = event.currentTarget as HTMLElement;
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= 72) void loadNextPage();
}

function selectRow(row: WorkflowInheritanceSource) {
  if (!props.busy) selectedKey.value = row.key;
}

function confirmSelection() {
  if (selected.value && canConfirm.value) emit('confirm', selected.value);
}

function requestClose() {
  if (!props.busy) emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key !== 'Tab') return;

  const dialog = dialogElement.value;
  if (!dialog) return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;
  if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (open) => {
    clearSearchTimer();
    requestSequence += 1;
    loading.value = false;
    if (!open) return;
    keyword.value = '';
    clearSearchTimer();
    selectedKey.value = '';
    void loadFirstPage();
    void nextTick(() => searchInput.value?.focus());
  },
  { immediate: true },
);

watch(
  keyword,
  () => {
    if (!props.open) return;
    clearSearchTimer();
    resetSearch();
    searchTimer = setTimeout(() => void loadFirstPage(), 280);
  },
  { flush: 'sync' },
);

onBeforeUnmount(() => {
  clearSearchTimer();
  requestSequence += 1;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="inheritance-overlay" @keydown="handleKeydown">
      <section
        ref="dialogElement"
        class="inheritance-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inheritance-title"
        :aria-describedby="
          selected ? 'inheritance-description inheritance-warning' : 'inheritance-description'
        "
        :aria-busy="busy || (loading && hasKeyword)"
      >
        <header class="dialog-header">
          <div class="title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 4v11a4 4 0 0 0 4 4h8" />
              <path d="m15 16 3 3-3 3M6 8h7a4 4 0 0 1 4 4v1" />
              <circle cx="6" cy="4" r="2" />
            </svg>
          </div>
          <div>
            <h2 id="inheritance-title">继承已有 Workflow</h2>
            <p id="inheritance-description">
              选择已有工作流，在当前场景下复用工作流编排
            </p>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭继承面板"
            :disabled="busy"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <form class="search-bar" role="search" @submit.prevent="runSearch">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            ref="searchInput"
            v-model="keyword"
            type="search"
            autocomplete="off"
            aria-label="搜索场景名称或 Workflow 名称"
            placeholder="搜索场景名称或 Workflow 名称"
            :disabled="busy"
          />
          <kbd>Enter</kbd>
        </form>

        <div class="results-meta">
          <span>{{
            !hasKeyword
              ? '请输入关键字搜索可继承的 Workflow'
              : loading && !rows.length
                ? '正在查找可继承的 Workflow…'
                : `找到 ${total} 个可用 Workflow`
          }}</span>
          <span v-if="selected">已选择 1 个</span>
        </div>

        <div
          ref="resultsPanel"
          class="results-panel"
          role="region"
          aria-label="可继承的 Workflow"
          @scroll.passive="onResultsScroll"
          @wheel.passive="onResultsWheel"
        >
          <template v-if="hasKeyword">
            <button
              v-for="row in rows"
              :key="row.key"
              type="button"
              class="workflow-option"
              :class="{ selected: selectedKey === row.key }"
              :aria-pressed="selectedKey === row.key"
              :disabled="busy"
              @click="selectRow(row)"
            >
              <span class="radio" aria-hidden="true"><i></i></span>
              <span class="option-content">
                <span class="option-heading">
                  <strong>{{ row.flowName || '未命名 Workflow' }}</strong>
                  <span v-if="!createsScene" class="status-chip">{{ row.status || '设计中' }}</span>
                </span>
                <span v-if="row.flowDescription" class="option-description">{{
                  row.flowDescription
                }}</span>
                <span class="option-meta">
                  <span class="scene-path">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    >
                      <path d="M5 5h5v5H5zM14 14h5v5h-5zM10 7h4a3 3 0 0 1 3 3v4" />
                    </svg>
                    {{ [row.firstScene, row.secondScene].filter(Boolean).join(' / ') }}
                  </span>
                  <span>{{ row.sourceDimName || '未标注所属维度' }}</span>
                  <span v-if="createsScene">{{ row.sourceDimType }}</span>
                  <span v-if="createsScene"
                    >场景编码：{{ row.sceneExtensionCode || '未设置' }}</span
                  >
                  <span v-if="createsScene">{{ row.activityCount ?? 0 }} 个活动</span>
                  <span v-else>{{ row.commandCount ?? 0 }} 个 Command</span>
                </span>
              </span>
              <svg
                class="selected-mark"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </button>
          </template>

          <div v-if="loading && hasKeyword" class="result-state" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {{ rows.length ? '正在加载更多…' : '正在加载…' }}
          </div>
          <div v-else-if="!hasKeyword" class="result-state empty-state keyword-empty-state">
            <span>当前未输入任何关键字，未查到任何数据</span>
          </div>
          <div v-else-if="loadError" class="result-state error-state" role="alert">
            <span>{{ loadError }}</span>
            <button type="button" @click="rows.length ? loadNextPage() : runSearch()">重试</button>
          </div>
          <div v-else-if="!rows.length" class="result-state empty-state">
            <span class="empty-icon" aria-hidden="true">⌕</span>
            <strong>没有找到匹配的 Workflow</strong>
            <span>尝试缩短关键词，或改用场景名称搜索。</span>
          </div>
          <div v-else-if="!hasMore" class="result-end">已加载全部结果</div>
        </div>

        <aside v-if="selected" id="inheritance-warning" class="inheritance-warning" role="note">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <rect x="11" y="6.5" width="2" height="7.5" rx="1" fill="#fff" />
            <circle cx="12" cy="17.25" r="1.2" fill="#fff" />
          </svg>
          <div>
            <strong>覆盖式继承，原配置不可恢复</strong>
            <span>{{ inheritanceWarningText }}</span>
          </div>
        </aside>

        <p v-if="error" class="confirm-error" role="alert">{{ error }}</p>

        <footer class="dialog-footer">
          <span class="selection-summary">
            {{ selected ? `将继承「${selectedWorkflowLabel}」` : '请选择一个 Workflow' }}
          </span>
          <div>
            <button class="secondary-button" type="button" :disabled="busy" @click="requestClose">
              取消
            </button>
            <button
              class="confirm-button"
              type="button"
              :disabled="!canConfirm"
              @click="confirmSelection"
            >
              {{ busy ? '正在继承…' : '确认覆盖并继承' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.inheritance-overlay,
.inheritance-overlay * {
  box-sizing: border-box;
}
.inheritance-overlay {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  font:
    14px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.inheritance-dialog {
  display: flex;
  width: min(760px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 18px;
  background: #fff;
  color: #172033;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}
.dialog-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 32px;
  align-items: start;
  gap: 14px;
  padding: 24px 24px 18px;
}
.title-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(145deg, #eaf2ff, #eef2ff);
  color: #315ce8;
}
.title-icon svg {
  width: 23px;
  height: 23px;
}
.dialog-header h2 {
  margin: 0 0 5px;
  font-size: 20px;
  letter-spacing: -0.01em;
}
.dialog-header p {
  margin: 0;
  color: #64748b;
  line-height: 1.55;
}
.icon-button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 24px;
  line-height: 1;
}
.icon-button:not(:disabled):hover {
  background: #f1f5f9;
  color: #0f172a;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 24px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.search-bar:focus-within {
  border-color: #5b7cfa;
  box-shadow: 0 0 0 3px rgba(91, 124, 250, 0.12);
}
.search-bar svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: #64748b;
}
.search-bar input {
  min-width: 0;
  height: 42px;
  flex: 1;
  border: 0;
  outline: 0;
  color: #172033;
  font: inherit;
}
.search-bar input::placeholder {
  color: #94a3b8;
}
.search-bar kbd {
  padding: 2px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #f8fafc;
  color: #94a3b8;
  font: 11px inherit;
}
.results-meta {
  display: flex;
  justify-content: space-between;
  padding: 14px 25px 9px;
  color: #64748b;
  font-size: 12px;
}
.results-meta span:last-child {
  color: #315ce8;
  font-weight: 600;
}
.results-panel {
  min-height: 120px;
  max-height: 360px;
  overflow-y: auto;
  padding: 2px 16px 12px 24px;
  scrollbar-gutter: stable;
}
.workflow-option {
  display: grid;
  width: 100%;
  grid-template-columns: 20px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 12px;
  margin-bottom: 9px;
  padding: 14px 15px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.workflow-option:not(:disabled):hover {
  border-color: #b9c9f8;
  background: #fbfdff;
  box-shadow: 0 5px 16px rgba(49, 92, 232, 0.08);
  transform: translateY(-1px);
}
.workflow-option.selected,
.workflow-option.selected:not(:disabled):hover {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px #2563eb;
}
.radio {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1.5px solid #cbd5e1;
  border-radius: 50%;
  background: #fff;
}
.workflow-option.selected .radio {
  border-color: #315ce8;
}
.workflow-option.selected .radio i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #315ce8;
}
.option-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.option-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}
.option-heading strong {
  overflow: hidden;
  color: #172033;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-chip {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 11px;
  font-weight: 600;
}
.option-description {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.option-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 15px;
  color: #7c8aa0;
  font-size: 12px;
}
.scene-path {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #475569;
}
.scene-path svg {
  width: 14px;
  height: 14px;
  color: #7890c8;
}
.selected-mark {
  width: 20px;
  height: 20px;
  color: transparent;
}
.workflow-option.selected .selected-mark {
  color: #315ce8;
}
.result-state,
.result-end {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
}
.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid #dbeafe;
  border-top-color: #315ce8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.error-state {
  color: #b42318;
}
.error-state button {
  border: 0;
  background: transparent;
  color: #315ce8;
  font: inherit;
  font-weight: 600;
}
.empty-state {
  min-height: 220px;
  flex-direction: column;
}
.empty-state strong {
  color: #334155;
  font-size: 14px;
}
.keyword-empty-state {
  color: #94a3b8;
  font-size: 13px;
}
.empty-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  background: #f1f5f9;
  color: #7890a8;
  font-size: 27px;
}
.inheritance-warning {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  flex-shrink: 0;
  gap: 16px;
  margin: 8px 24px 0;
  padding: 20px;
  border: 1px solid #fecaca;
  border-radius: 14px;
  background: #fff5f5;
  color: #8f2024;
}
.inheritance-warning > svg {
  width: 32px;
  height: 32px;
  color: #dc2626;
}
.inheritance-warning div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.inheritance-warning strong {
  color: #991b1b;
  font-size: 16px;
  line-height: 1.45;
}
.inheritance-warning span {
  line-height: 1.75;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.confirm-error {
  margin: 10px 24px 0;
  padding: 9px 11px;
  border-radius: 7px;
  background: #fef2f2;
  color: #b42318;
  font-size: 12px;
}
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
  padding: 16px 24px 20px;
  border-top: 1px solid #eef2f7;
}
.selection-summary {
  min-width: 0;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-footer > div {
  display: flex;
  flex: 0 0 auto;
  gap: 9px;
}
.dialog-footer button {
  height: 36px;
  border-radius: 8px;
  padding: 0 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}
.secondary-button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #2563eb;
}
.confirm-button {
  border: 1px solid #dc2626;
  background: #dc2626;
  color: #fff;
}
.confirm-button:not(:disabled):hover {
  border-color: #b91c1c;
  background: #b91c1c;
}
button:not(:disabled) {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 640px) {
  .inheritance-overlay {
    padding: 10px;
  }
  .inheritance-dialog {
    width: 100%;
    max-height: calc(100vh - 20px);
  }
  .dialog-header,
  .dialog-footer {
    padding-right: 18px;
    padding-left: 18px;
  }
  .search-bar,
  .inheritance-warning,
  .confirm-error {
    margin-right: 18px;
    margin-left: 18px;
  }
  .results-panel {
    padding-left: 18px;
  }
  .dialog-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .dialog-footer > div {
    justify-content: flex-end;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { mergeUniquePage, shouldLoadNextPage } from '../../utils/infiniteScroll';
import type {
  WorkflowInheritancePage,
  WorkflowInheritanceSource,
} from '../../services/skillMarket/workflowInheritanceService';

const PAGE_SIZE = 20;
const props = withDefaults(
  defineProps<{
    open: boolean;
    busy?: boolean;
    error?: string;
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
const rows = ref<WorkflowInheritanceSource[]>([]);
const selectedKey = ref('');
const pageNo = ref(0);
const total = ref(0);
const excludedCurrent = ref(false);
const loading = ref(false);
const loadError = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
let requestSequence = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let previousScrollTop = 0;

const selected = computed(() => rows.value.find((row) => row.key === selectedKey.value) ?? null);
const hasMore = computed(() => rows.value.length < total.value);

function clearSearchTimer() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = undefined;
}

async function loadPageNumber(nextPage: number, replace: boolean) {
  if (!props.open || loading.value) return;
  const sequence = ++requestSequence;
  const queryKeyword = keyword.value.trim();
  loading.value = true;
  loadError.value = '';
  if (replace) {
    rows.value = [];
    selectedKey.value = '';
    pageNo.value = 0;
    total.value = 0;
    excludedCurrent.value = false;
    previousScrollTop = 0;
  }
  try {
    const result = await props.loadPage({
      keyword: queryKeyword,
      pageNo: nextPage,
      pageSize: PAGE_SIZE,
    });
    if (sequence !== requestSequence || !props.open || keyword.value.trim() !== queryKeyword)
      return;
    rows.value = replace ? result.list : mergeUniquePage(rows.value, result.list, (row) => row.key);
    pageNo.value = result.pageNo;
    excludedCurrent.value = excludedCurrent.value || result.excludedCurrent === true;
    total.value = Math.max(0, result.total - (excludedCurrent.value ? 1 : 0));
  } catch (cause) {
    if (sequence !== requestSequence || !props.open) return;
    loadError.value = cause instanceof Error ? cause.message : '候选 Workflow 加载失败';
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

async function loadFirstPage() {
  requestSequence += 1;
  loading.value = false;
  await loadPageNumber(1, true);
}

async function runSearch() {
  clearSearchTimer();
  await loadFirstPage();
}

async function loadNextPage() {
  if (loading.value || !hasMore.value) return;
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

function selectRow(row: WorkflowInheritanceSource) {
  if (!props.busy) selectedKey.value = row.key;
}

function confirmSelection() {
  if (selected.value && !props.busy && !loading.value) emit('confirm', selected.value);
}

function requestClose() {
  if (!props.busy) emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    requestClose();
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
    selectedKey.value = '';
    void loadFirstPage();
    void nextTick(() => searchInput.value?.focus());
  },
  { immediate: true },
);

watch(keyword, () => {
  if (!props.open) return;
  selectedKey.value = '';
  clearSearchTimer();
  searchTimer = setTimeout(() => void loadFirstPage(), 280);
});

onBeforeUnmount(() => {
  clearSearchTimer();
  requestSequence += 1;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="inheritance-overlay"
      @mousedown.self="requestClose"
      @keydown="handleKeydown"
    >
      <section
        ref="dialogElement"
        class="inheritance-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inheritance-title"
        aria-describedby="inheritance-description inheritance-warning"
        :aria-busy="busy || loading"
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
            <p id="inheritance-description">选择一个成熟工作流，将其流程编排复用到当前场景。</p>
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
            loading && !rows.length ? '正在查找可继承的 Workflow…' : `找到 ${total} 个可用 Workflow`
          }}</span>
          <span v-if="selected">已选择 1 个</span>
        </div>

        <div class="results-panel" @scroll.passive="onResultsScroll">
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
                <span class="status-chip">{{ row.status || '设计中' }}</span>
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
                <span>{{ row.dimName || '未标注所属维度' }}</span>
                <span>{{ row.commandCount ?? 0 }} 个 Command</span>
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

          <div v-if="loading" class="result-state" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {{ rows.length ? '正在加载更多…' : '正在加载…' }}
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

        <aside id="inheritance-warning" class="inheritance-warning" role="note">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="M12 3 2.7 19a1.3 1.3 0 0 0 1.1 2h16.4a1.3 1.3 0 0 0 1.1-2L12 3Z" />
            <path d="M12 9v5M12 17.5v.1" />
          </svg>
          <div>
            <strong>继承会覆盖当前 Workflow 配置</strong>
            <span
              >Workflow
              规划、Command、资产池和节点绑定将替换为所选内容；当前场景名称、编码、说明和标签保持不变。</span
            >
          </div>
        </aside>

        <p v-if="error" class="confirm-error" role="alert">{{ error }}</p>

        <footer class="dialog-footer">
          <span class="selection-summary">
            {{
              selected
                ? `将继承「${selected.flowName || '未命名 Workflow'}」`
                : '请选择一个 Workflow'
            }}
          </span>
          <div>
            <button class="secondary-button" type="button" :disabled="busy" @click="requestClose">
              取消
            </button>
            <button
              class="confirm-button"
              type="button"
              :disabled="!selected || busy || loading"
              @click="confirmSelection"
            >
              {{ busy ? '正在继承…' : '确认继承' }}
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
  min-height: 250px;
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
.workflow-option.selected {
  border-color: #5b7cfa;
  background: #f5f8ff;
  box-shadow: 0 0 0 2px rgba(91, 124, 250, 0.1);
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
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  margin: 2px 24px 0;
  padding: 12px 14px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  background: #fffaf2;
  color: #9a4b0c;
}
.inheritance-warning > svg {
  width: 19px;
  height: 19px;
  margin-top: 1px;
  color: #e87914;
}
.inheritance-warning div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.inheritance-warning strong {
  color: #8a3b08;
  font-size: 13px;
}
.inheritance-warning span {
  line-height: 1.5;
  font-size: 12px;
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
  color: #334155;
}
.confirm-button {
  border: 1px solid #315ce8;
  background: #315ce8;
  color: #fff;
  box-shadow: 0 5px 12px rgba(49, 92, 232, 0.2);
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

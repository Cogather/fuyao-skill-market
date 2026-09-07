<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import type {
  WorkflowCapabilityOption,
  WorkflowCapabilityType,
} from '../../services/skillMarket/workflowCapabilitySearchService';

const props = defineProps<{
  types: WorkflowCapabilityType[];
  localOptions: WorkflowCapabilityOption[];
  selectedIds: string[];
  query: (
    type: WorkflowCapabilityType,
    keyword: string,
    pageNum: number,
  ) => Promise<{
    list: WorkflowCapabilityOption[];
    hasMore: boolean;
  }>;
}>();
const emit = defineEmits<{
  select: [option: WorkflowCapabilityOption];
  typeChange: [type: WorkflowCapabilityType];
}>();
const type = ref<WorkflowCapabilityType>(props.types[0] ?? 'Command');
const open = ref(false);
const keyword = ref('');
const results = ref<WorkflowCapabilityOption[]>([]);
const loading = ref(false);
const error = ref('');
const hasMore = ref(false);
const pageNum = ref(0);
const input = ref<HTMLInputElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const scrollArea = ref<HTMLElement | null>(null);
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let composing = false;
let previousScrollTop = 0;
const isCommand = computed(() => props.types.length === 1 && props.types[0] === 'Command');
const triggerLabel = computed(() =>
  isCommand.value ? '+ 选择一个 Command 加入… ▾' : '+ 从资产库添加 Agent / Skill… ▾',
);
const options = computed(() => {
  const candidates = keyword.value.trim()
    ? results.value
    : [...props.localOptions.filter((option) => option.type === type.value), ...results.value];
  const unique = [...new Map(candidates.map((option) => [option._id, option])).values()];
  return isCommand.value
    ? unique.filter((option) => !props.selectedIds.includes(option._id))
    : unique;
});

function invalidate() {
  clearTimeout(timer);
  timer = undefined;
  sequence += 1;
  loading.value = false;
}
function resetResults() {
  results.value = [];
  pageNum.value = 0;
  hasMore.value = false;
  error.value = '';
  previousScrollTop = 0;
  if (scrollArea.value) scrollArea.value.scrollTop = 0;
}
async function fetchPage(append = false) {
  if (!open.value || (append && (loading.value || !hasMore.value))) return;
  clearTimeout(timer);
  const request = ++sequence;
  const page = append ? pageNum.value + 1 : 1;
  const query = keyword.value.trim();
  loading.value = true;
  error.value = '';
  try {
    const result = await props.query(type.value, query, page);
    if (request !== sequence || !open.value) return;
    results.value = append ? [...results.value, ...result.list] : result.list;
    pageNum.value = page;
    hasMore.value = result.hasMore;
  } catch (cause) {
    if (request !== sequence || !open.value) return;
    error.value = cause instanceof Error ? cause.message : `${type.value} 查询失败，请重试`;
  } finally {
    if (request === sequence) loading.value = false;
  }
}
function close(restoreFocus = false) {
  open.value = false;
  invalidate();
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}
function toggle() {
  if (open.value) return close();
  invalidate();
  open.value = true;
  keyword.value = '';
  composing = false;
  resetResults();
  void fetchPage();
  void nextTick(() => input.value?.focus({ preventScroll: true }));
}
function scheduleSearch(event: Event) {
  keyword.value = (event.target as HTMLInputElement).value;
  invalidate();
  resetResults();
  loading.value = true;
  if (composing || (event instanceof InputEvent && event.isComposing)) return;
  if (!keyword.value.trim()) void fetchPage();
  else timer = setTimeout(() => void fetchPage(), 250);
}
function compositionStart() {
  composing = true;
  invalidate();
  resetResults();
  loading.value = true;
}
function compositionEnd(event: CompositionEvent) {
  composing = false;
  scheduleSearch(event);
}
function clearSearch() {
  keyword.value = '';
  invalidate();
  resetResults();
  void fetchPage();
  input.value?.focus({ preventScroll: true });
}
function searchImmediately() {
  if (composing) return;
  invalidate();
  resetResults();
  void fetchPage();
}
function changeType(next: WorkflowCapabilityType) {
  if (type.value === next) return;
  invalidate();
  type.value = next;
  emit('typeChange', next);
  resetResults();
  void fetchPage();
}
function select(option: WorkflowCapabilityOption) {
  if (props.selectedIds.includes(option._id)) return;
  emit('select', option);
  if (isCommand.value) close(true);
}
function handleEscape(event: KeyboardEvent) {
  if (!open.value) return;
  event.stopPropagation();
  event.preventDefault();
  close(true);
}
function handleScroll(event: Event) {
  const area = event.currentTarget as HTMLElement;
  const down = area.scrollTop > previousScrollTop;
  previousScrollTop = area.scrollTop;
  if (down && area.scrollHeight - area.scrollTop - area.clientHeight < 48 && !error.value) {
    void fetchPage(true);
  }
}
onBeforeUnmount(invalidate);
</script>

<template>
  <div class="workflow-capability-picker" @keydown.esc="handleEscape">
    <button
      ref="trigger"
      type="button"
      class="capability-trigger"
      :aria-label="triggerLabel"
      :aria-expanded="open"
      @click="toggle"
    >
      <span>{{ isCommand ? '+ 选择一个 Command 加入…' : '+ 从资产库添加 Agent / Skill…' }}</span>
      <svg
        :class="{ expanded: open }"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </button>
    <div v-if="open" class="picker-backdrop" @click="close()"></div>
    <div v-if="open" class="picker-list capability-panel">
      <div class="capability-search">
        <div v-if="types.length > 1" class="capability-types" role="group" aria-label="资产类型">
          <button
            v-for="item in types"
            :key="item"
            type="button"
            :aria-pressed="type === item"
            @click="changeType(item)"
          >
            {{ item }}
          </button>
        </div>
        <svg
          class="search-icon"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          ref="input"
          :value="keyword"
          type="search"
          :aria-label="`搜索 ${type}`"
          :placeholder="`搜索 ${type} 名称、描述或人员`"
          autocomplete="off"
          @input="scheduleSearch"
          @compositionstart="compositionStart"
          @compositionend="compositionEnd"
          @keydown.enter.prevent="searchImmediately"
        />
        <button
          v-if="keyword"
          class="clear-search"
          type="button"
          aria-label="清空搜索"
          @click="clearSearch"
        >
          ×
        </button>
      </div>
      <p class="capability-scope">
        {{ keyword.trim() ? '搜索结果 · 不限当前产品' : '当前产品 · 输入关键字可搜索其他产品' }}
      </p>
      <div
        ref="scrollArea"
        class="capability-results"
        :aria-busy="loading"
        @scroll.passive="handleScroll"
      >
        <template v-for="option in options" :key="option._id">
          <button
            v-if="isCommand"
            type="button"
            class="command-picker-option capability-option"
            @click="select(option)"
          >
            <span class="option-symbol" aria-hidden="true">/</span>
            <span class="option-content"
              ><code>{{ option.name }}</code
              ><small>{{ option.description }}</small></span
            >
            <span class="option-action" aria-hidden="true">+ 添加</span>
          </button>
          <div v-else class="asset-option capability-option">
            <span class="option-content"
              ><b>{{ option.name }}</b
              ><small>{{
                [option.developer, option.description].filter(Boolean).join(' · ')
              }}</small></span
            >
            <button
              type="button"
              class="add-option"
              :disabled="selectedIds.includes(option._id)"
              @click="select(option)"
            >
              {{ selectedIds.includes(option._id) ? '已在池中' : '+ 添加' }}
            </button>
          </div>
        </template>
        <p v-if="loading" class="capability-state" role="status">
          <span class="search-spinner" aria-hidden="true"></span>正在查询 {{ type }}…
        </p>
        <p v-else-if="error" class="capability-state is-error" role="alert">
          {{ error }}<button type="button" @click="fetchPage(pageNum > 0)">重试</button>
        </p>
        <p v-else-if="!options.length" class="capability-state" role="status">
          {{
            keyword.trim()
              ? `未找到匹配的 ${type}，请尝试其他关键字`
              : `暂无可添加的 ${type}，可输入关键字搜索`
          }}
        </p>
        <button v-else-if="hasMore" type="button" class="load-more" @click="fetchPage(true)">
          加载更多
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-capability-picker {
  position: relative;
  width: 100%;
  min-width: 0;
  margin: 14px 0 18px;
  font:
    13px/1.5 -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
  color: #334155;
}
.workflow-capability-picker *,
.workflow-capability-picker *::before,
.workflow-capability-picker *::after {
  box-sizing: border-box;
}
.workflow-capability-picker button,
.workflow-capability-picker input {
  font: inherit;
}
.workflow-capability-picker button {
  cursor: pointer;
}
.capability-trigger {
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
  text-align: left;
}
.capability-trigger[aria-expanded='true'] {
  border-color: #9bbbf5;
  box-shadow: 0 0 0 3px #eff4ff;
}
.capability-trigger svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.capability-trigger svg.expanded {
  transform: rotate(180deg);
}
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
}
.capability-panel {
  position: relative;
  z-index: 6;
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #dfe5ee;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 14px #1e32500f;
}
.capability-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 4px 8px;
  border: 1px solid #dce2eb;
  border-radius: 8px;
  background: #fff;
}
.capability-search:focus-within {
  border-color: #87acf0;
  box-shadow: 0 0 0 2px #eff4ff;
}
.capability-types {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: #f1f4f8;
}
.capability-types button {
  height: 26px;
  padding: 2px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  line-height: 20px;
}
.capability-types button[aria-pressed='true'] {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 3px #0f172a14;
}
.search-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #94a3b8;
}
.capability-search input {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  height: 30px;
  margin: 0;
  padding: 4px 0;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
  color: #334155;
  line-height: 22px;
}
.capability-search input::placeholder {
  color: #94a3b8;
}
.capability-search input::-webkit-search-cancel-button {
  display: none;
}
.clear-search {
  flex: 0 0 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  font-size: 18px;
  line-height: 24px;
}
.clear-search:hover {
  background: #f1f5f9;
  color: #475569;
}
.capability-scope {
  margin: 8px 2px;
  font-size: 12px;
  color: #94a3b8;
}
.capability-results {
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cdd5e1 transparent;
}
.capability-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 10px;
  border: 0;
  border-radius: 6px;
  background: #f8fafc;
  text-align: left;
}
.capability-option + .capability-option {
  margin-top: 4px;
}
.capability-option:hover {
  background: #eff5ff;
}
.option-content {
  flex: 1 1 0;
  min-width: 0;
}
.option-content b,
.option-content code {
  display: block;
  margin: 0;
  padding: 0;
  background: transparent;
  color: #334764;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  overflow-wrap: anywhere;
  white-space: normal;
}
.option-content small {
  display: block;
  margin: 3px 0 0;
  color: #7b8799;
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.option-symbol {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  height: 28px;
  border: 1px solid #dce8fc;
  border-radius: 6px;
  background: #eff5ff;
  color: #3478ed;
}
.option-action {
  flex-shrink: 0;
  color: #3478ed;
  font-size: 12px;
}
.capability-option .add-option {
  flex: 0 0 auto;
  align-self: center;
  min-width: 56px;
  height: 28px;
  margin: 0;
  padding: 3px 9px;
  border: 1px solid #dce5f3;
  border-radius: 5px;
  background: #fff;
  color: #3974d2;
  font-size: 12px;
  line-height: 20px;
}
.capability-option .add-option:disabled {
  border-color: transparent;
  background: #edf1f6;
  color: #9aa5b5;
  cursor: default;
}
.capability-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  min-height: 64px;
  padding: 12px;
  color: #8390a3;
  text-align: center;
  font-size: 12px;
}
.capability-state.is-error {
  color: #b45309;
}
.capability-state button,
.load-more {
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #3974d2;
  font-size: 12px;
}
.load-more {
  display: block;
  width: 100%;
  margin-top: 4px;
}
.search-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #dbeafe;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: picker-spin 0.7s linear infinite;
}
.workflow-capability-picker button:focus-visible {
  outline: 2px solid #6397f5;
  outline-offset: 2px;
}
@keyframes picker-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 480px) {
  .capability-search {
    gap: 5px;
    padding-inline: 5px;
  }
  .capability-types button {
    padding-inline: 6px;
  }
  .search-icon {
    display: none;
  }
  .capability-option {
    gap: 8px;
    padding: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .search-spinner {
    animation: none;
  }
  .capability-trigger svg {
    transition: none;
  }
}
</style>

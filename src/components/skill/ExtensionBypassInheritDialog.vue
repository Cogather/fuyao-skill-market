<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  queryExtensionInheritancePage,
  type ExtensionInheritanceSource,
} from '../../services/skillMarket/extensionBypassService';

const props = withDefaults(
  defineProps<{
    open: boolean;
    userId: string;
    targetSceneCode: string;
    busy?: boolean;
    error?: string;
  }>(),
  { busy: false, error: '' },
);
const emit = defineEmits<{ close: []; confirm: [source: ExtensionInheritanceSource] }>();
const keyword = ref('');
const rows = ref<ExtensionInheritanceSource[]>([]);
const selectedName = ref('');
const loading = ref(false);
const loadError = ref('');
const hasMore = ref(false);
const page = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const selected = computed(() => rows.value.find((row) => row.extensionName === selectedName.value));
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let previousFocus: HTMLElement | null = null;
const requestKey = () =>
  JSON.stringify([props.open, props.userId, props.targetSceneCode, keyword.value.trim()]);
async function loadPage(next: number) {
  if (
    !props.open ||
    !props.userId.trim() ||
    !props.targetSceneCode.trim() ||
    loading.value ||
    props.busy
  ) {
    return;
  }
  const current = ++sequence;
  const key = requestKey();
  loading.value = true;
  loadError.value = '';
  try {
    const result = await queryExtensionInheritancePage({
      userId: props.userId,
      keyword: keyword.value.trim(),
      pageNo: next,
      pageSize: 20,
    });
    if (current !== sequence || key !== requestKey()) {
      return;
    }
    const unique = new Map(rows.value.map((row) => [row.extensionName, row]));
    for (const row of result.list) {
      if (row.extensionName !== props.targetSceneCode.trim()) {
        unique.set(row.extensionName, row);
      }
    }
    rows.value = [...unique.values()];
    page.value = result.pageNo;
    hasMore.value = result.hasMore;
  } catch (cause) {
    if (current === sequence) {
      loadError.value = cause instanceof Error ? cause.message : 'Extension 搜索失败';
    }
  } finally {
    if (current === sequence) {
      loading.value = false;
    }
  }
}
function reset() {
  sequence += 1;
  loading.value = false;
  rows.value = [];
  selectedName.value = '';
  page.value = 0;
  hasMore.value = false;
  loadError.value = '';
}
async function search() {
  clearTimeout(timer);
  reset();
  await loadPage(1);
}
function close() {
  if (!props.busy) {
    emit('close');
  }
}
function confirm() {
  if (selected.value && !props.busy && !loading.value) {
    emit('confirm', selected.value);
  }
}
function scroll(event: Event) {
  const element = event.currentTarget as HTMLElement;
  if (element.scrollHeight - element.scrollTop - element.clientHeight < 72 && hasMore.value) {
    void loadPage(page.value + 1);
  }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) {
    return;
  }
  const focusable = [
    ...dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
    ),
  ];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialog.value.focus();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || !dialog.value.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || !dialog.value.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}
watch(
  () => [props.open, props.userId, props.targetSceneCode],
  () => {
    clearTimeout(timer);
    reset();
    if (!props.open) {
      previousFocus?.focus();
      previousFocus = null;
      return;
    }
    if (typeof document !== 'undefined') {
      previousFocus = document.activeElement as HTMLElement | null;
    }
    keyword.value = '';
    void loadPage(1);
    void nextTick(() => searchInput.value?.focus());
  },
  { immediate: true },
);
watch(keyword, () => {
  clearTimeout(timer);
  reset();
  if (props.open) {
    timer = setTimeout(() => {
      void loadPage(1);
    }, 250);
  }
});
onBeforeUnmount(() => {
  sequence += 1;
  clearTimeout(timer);
  previousFocus?.focus();
});
</script>

<template>
  <div v-if="open" class="inherit-overlay" @click.self="close" @keydown="keydown">
    <section
      ref="dialog"
      class="inherit-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extension-inherit-title"
      tabindex="-1"
    >
      <header>
        <div>
          <h3 id="extension-inherit-title">从 Extension 继承旁路</h3>
          <p>搜索可复用的布局与额外文件</p>
        </div>
        <button type="button" aria-label="关闭" :disabled="busy" @click="close">×</button>
      </header>
      <form class="inherit-search" @submit.prevent="search">
        <input
          ref="searchInput"
          v-model="keyword"
          data-testid="inherit-search"
          type="search"
          placeholder="搜索 Extension 名称或描述"
          aria-label="搜索 Extension"
          :disabled="busy"
        /><button type="submit" :disabled="busy || loading">搜索</button>
      </form>
      <p class="inherit-warning" role="alert">
        继承会更新当前 Extension 的目录布局与旁路配置。目标保护冲突产生的忽略文件将在成功后展示。
      </p>
      <div
        data-testid="inherit-results"
        class="inherit-results"
        role="listbox"
        aria-label="可继承的 Extension"
        :aria-busy="loading"
        @scroll="scroll"
      >
        <button
          v-for="row in rows"
          :key="row.extensionName"
          :data-testid="`source-${row.extensionName}`"
          type="button"
          role="option"
          :aria-selected="selectedName === row.extensionName"
          :class="{ selected: selectedName === row.extensionName }"
          :disabled="busy"
          @click="selectedName = row.extensionName"
        >
          <strong>{{ row.extensionName }}</strong>
          <p>{{ row.description || '暂无描述' }}</p>
          <div class="source-meta">
            <span>{{ row.sourceDimName || '未知来源' }}</span
            ><span>{{ row.latestVersion || '暂无版本' }}</span
            ><span>{{ row.layoutMode }}</span
            ><span>{{ row.hasBypass ? `含 ${row.entryCount} 个旁路文件` : '仅继承布局' }}</span>
          </div>
        </button>
        <p v-if="loading" class="empty" role="status">正在搜索…</p>
        <p v-else-if="!rows.length && !loadError" class="empty">未找到可继承的 Extension</p>
        <button
          v-if="hasMore"
          data-testid="load-more"
          class="load-more"
          type="button"
          :disabled="busy || loading"
          @click="loadPage(page + 1)"
        >
          加载更多
        </button>
      </div>
      <p v-if="loadError || error" class="inherit-error" role="alert">{{ error || loadError }}</p>
      <footer>
        <button type="button" :disabled="busy" @click="close">取消</button
        ><button
          data-testid="confirm-inherit"
          class="primary"
          type="button"
          :disabled="!selected || busy || loading"
          @click="confirm"
        >
          {{ busy ? '正在继承…' : '确认继承' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.inherit-overlay {
  position: fixed;
  inset: 0;
  z-index: 2200;
  background: rgba(22, 32, 51, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.inherit-dialog {
  width: min(640px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  box-shadow: 0 22px 70px #17284635;
  padding: 24px;
  color: #26334b;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
h3 {
  margin: 0;
  font-size: 18px;
}
header p {
  font-size: 13px;
  color: #728097;
  margin: 8px 0 0;
}
button,
input {
  font: inherit;
  font-size: 13px;
}
button {
  border: 1px solid #d9e1ee;
  border-radius: 7px;
  padding: 8px 14px;
  background: white;
  color: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
header > button {
  border: 0;
  font-size: 22px;
  padding: 0 5px;
}
.inherit-search {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.inherit-search input {
  width: 100%;
  border: 1px solid #d7dfed;
  border-radius: 8px;
  padding: 11px 12px;
}
.inherit-warning {
  padding: 12px 14px;
  margin: 16px 0;
  border: 1px solid #f1d59e;
  border-radius: 8px;
  background: #fff8eb;
  color: #865817;
  font-size: 12px;
  line-height: 1.6;
}
.inherit-results {
  overflow: auto;
  min-height: 100px;
  max-height: 380px;
  border: 1px solid #e2e8f2;
  border-radius: 8px;
}
.inherit-results > button[role='option'] {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #e8edf5;
  border-radius: 0;
  padding: 16px;
}
.inherit-results > button:hover:not(:disabled) {
  background: #f6f9ff;
}
.inherit-results > button.selected {
  background: #edf4ff;
  box-shadow: inset 3px 0 #4e7dd8;
}
.inherit-results p {
  margin: 7px 0 10px;
  font-size: 12px;
  color: #748097;
}
.source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: #586b88;
  font-size: 11px;
}
.source-meta span {
  padding: 3px 7px;
  background: #f0f3f8;
  border-radius: 4px;
}
.empty {
  padding: 22px;
  text-align: center;
}
.load-more {
  width: 100%;
  border: 0;
  color: #4671c5;
}
.inherit-error {
  background: #fff1f2;
  color: #b12f3e;
  padding: 10px 12px;
  border-radius: 7px;
  font-size: 13px;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
button.primary {
  background: #4274d4;
  border-color: #4274d4;
  color: white;
}
input:focus-visible,
button:focus-visible {
  outline: 2px solid #6589df;
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .inherit-overlay {
    padding: 12px;
  }
  .inherit-dialog {
    padding: 18px;
    max-height: calc(100vh - 24px);
  }
}
</style>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { shouldLoadNextPage } from '../../utils/infiniteScroll';
import {
  useExtensionHttpAssembly,
  type ExtensionHttpAssemblyContext,
} from '../../composables/useExtensionHttpAssembly';
import type { ExtensionAssemblyDetail } from '../../services/skillMarket/extensionAssemblyHttp';

import {
  countPackageFiles,
  readExtensionArchive,
  switchAssemblyTarget,
  type ExtensionAssemblyState,
  type ExtensionInheritanceSource,
  type ExtensionReleaseTarget,
} from '../../services/skillMarket/extensionReleaseAssembly';
import ExtensionPackageTreeNode from './ExtensionPackageTreeNode.vue';

const props = withDefaults(
  defineProps<{
    enabled?: boolean;
    modelValue: ExtensionAssemblyState;
    sources?: ExtensionInheritanceSource[];
    disabled?: boolean;
    publishing?: boolean;
    httpContext?: ExtensionHttpAssemblyContext;
  }>(),
  {
    enabled: false,
    sources: () => [],
    disabled: false,
    publishing: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [state: ExtensionAssemblyState];
  'blocked-change': [blocked: boolean];
  'busy-change': [busy: boolean];
  'snapshot-change': [detail: ExtensionAssemblyDetail];
}>();

const inheritOpen = ref(false);
const treeOpen = ref(true);
const uploadOpen = ref(false);
const sourceDialogOpen = ref(false);
const sourceSearch = ref('');
const sourceResults = ref<HTMLElement | null>(null);
let previousSourceScrollTop = 0;
const pendingSourceId = ref('');
const archiveError = ref('');
const archiveReading = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);
const selectedTreePath = ref('');
const remote = reactive(
  useExtensionHttpAssembly(
    () => props.httpContext,
    () => props.modelValue,
    updateState,
    (detail) => emit('snapshot-change', detail),
  ),
);
const controlsDisabled = computed(
  () =>
    props.publishing ||
    remote.mutating ||
    archiveReading.value ||
    (!props.httpContext && props.disabled),
);
const targetDisabled = computed(() => props.publishing || (!props.httpContext && props.disabled));
const selectedTarget = computed(() =>
  remote.pendingLayout === null
    ? props.modelValue.target
    : remote.pendingLayout === 'testagent'
      ? 'testagent'
      : 'codeagent',
);
watch(
  () => remote.busy || archiveReading.value,
  (busy) => emit('busy-change', busy),
  { immediate: true },
);
watch(
  () => remote.blocked || archiveReading.value,
  (blocked) => emit('blocked-change', blocked),
  { immediate: true },
);
watch(
  [sourceSearch, sourceDialogOpen],
  ([keyword, open]) => {
    if (!props.httpContext) return;
    pendingSourceId.value = '';
    previousSourceScrollTop = 0;
    if (sourceResults.value) sourceResults.value.scrollTop = 0;
    remote.search(open ? keyword : '');
  },
  { flush: 'sync' },
);
watch(
  () => JSON.stringify([props.httpContext?.extensionName, props.httpContext?.userId]),
  () => {
    pendingSourceId.value = '';
    sourceDialogOpen.value = false;
  },
  { flush: 'sync' },
);

function onSourcesScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement;
  const shouldLoad = shouldLoadNextPage({
    previousScrollTop: previousSourceScrollTop,
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    threshold: 72,
    loading: remote.searchLoading || controlsDisabled.value,
    hasMore: remote.searchHasMore,
  });
  previousSourceScrollTop = element.scrollTop;
  if (shouldLoad) void remote.loadMoreSearch();
}

function onSourcesWheel(event: WheelEvent): void {
  if (event.deltaY <= 0 || controlsDisabled.value) return;
  const element = event.currentTarget as HTMLElement;
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= 72)
    void remote.loadMoreSearch();
}

const activeSource = computed(
  () => props.sources.find((source) => source.id === props.modelValue.inheritanceSourceId) ?? null,
);
const filteredSources = computed(() => {
  const keyword = sourceSearch.value.trim().toLowerCase();
  if (!keyword) return props.sources;
  return props.sources.filter((source) =>
    [source.name, source.organization, source.description].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
});
// Directory paths come only from structure/tree; component names and the layout
// selection must never synthesize extra folders or files in this preview.
const packageTree = computed(() => (props.httpContext ? remote.tree : null));
const packageFileCount = computed(() =>
  packageTree.value ? countPackageFiles(packageTree.value) : 0,
);
const targetDescription = computed(() =>
  selectedTarget.value === 'codeagent'
    ? '标准模式：三目录 + 两 JSON，直推 Agent Center'
    : props.httpContext
      ? 'TestAgent 模式：组件置于 .testagent/，合并当前旁路文件后推送'
      : 'TestAgent 模式：.testagent/ 包裹，合并继承与上传文件后推送',
);
const targetLabel = computed(() =>
  selectedTarget.value === 'codeagent' ? 'CodeAgent' : 'TestAgent',
);

function updateState(patch: Partial<ExtensionAssemblyState>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function selectTarget(target: ExtensionReleaseTarget): void {
  if (targetDisabled.value) return;
  if (props.httpContext) {
    void remote.selectTarget(target);
    return;
  }
  emit('update:modelValue', switchAssemblyTarget(props.modelValue, target, props.sources));
}

function clearInheritance(): void {
  updateState({ inheritanceSourceId: '' });
}

function openSourceDialog(): void {
  if (controlsDisabled.value) return;
  remote.error = '';
  pendingSourceId.value = props.modelValue.inheritanceSourceId || props.sources[0]?.id || '';
  sourceSearch.value = '';
  sourceDialogOpen.value = true;
}

async function confirmSource(): Promise<void> {
  if (!pendingSourceId.value || controlsDisabled.value) return;
  if (props.httpContext) {
    if (await remote.inherit(pendingSourceId.value)) sourceDialogOpen.value = false;
    return;
  }
  updateState({ inheritanceSourceId: pendingSourceId.value });
  sourceDialogOpen.value = false;
}

function openUploadPicker(): void {
  if (!controlsDisabled.value) uploadInput.value?.click();
}

async function acceptArchive(file?: File): Promise<void> {
  if (!file || controlsDisabled.value) return;
  archiveError.value = '';
  if (!file.name.toLowerCase().endsWith('.zip')) {
    archiveError.value = '仅支持 .zip 压缩包';
    return;
  }
  archiveReading.value = true;
  try {
    if (props.httpContext) {
      await remote.upload(file);
      return;
    }
    const archive = readExtensionArchive(await file.arrayBuffer(), file.name, file.size);
    if (archive.files.length === 0) {
      archiveError.value = '压缩包中没有可合并的附加文件';
      return;
    }
    updateState({ uploadedPackage: archive });
  } catch (error) {
    archiveError.value = error instanceof Error && error.message ? error.message : '压缩包解析失败';
  } finally {
    archiveReading.value = false;
    if (uploadInput.value) uploadInput.value.value = '';
  }
}

function onUploadChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  void acceptArchive(input.files?.[0]);
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  void acceptArchive(event.dataTransfer?.files?.[0]);
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <slot v-if="!enabled" />
  <section v-else class="release-assembly" role="region" aria-label="Extension 发布组装">
    <div class="release-target-bar">
      <strong>发布目标 <em>*</em></strong>
      <div class="release-target-tabs" role="group" aria-label="发布目标">
        <button
          type="button"
          :class="{ 'is-active': selectedTarget === 'codeagent' }"
          :aria-pressed="selectedTarget === 'codeagent'"
          :disabled="targetDisabled"
          @click="selectTarget('codeagent')"
        >
          CodeAgent（标准）
        </button>
        <button
          type="button"
          :class="{ 'is-active is-testagent': selectedTarget === 'testagent' }"
          :aria-pressed="selectedTarget === 'testagent'"
          :disabled="targetDisabled"
          @click="selectTarget('testagent')"
        >
          TestAgent
        </button>
      </div>
      <span>{{ targetDescription }}</span>
    </div>

    <p
      v-if="httpContext && remote.layoutError"
      class="archive-error release-target-error"
      role="alert"
    >
      {{ remote.layoutError }}
    </p>

    <slot />

    <p
      v-if="httpContext && remote.error && remote.error !== remote.layoutError && !sourceDialogOpen"
      class="archive-error"
      role="alert"
    >
      {{ remote.error }}
    </p>
    <div v-if="httpContext && remote.ignoredEntries.length" class="bypass-warning" role="alert">
      <strong>以下文件已被忽略，不会进入发布包：</strong>
      <ul>
        <li v-for="entry in remote.ignoredEntries" :key="entry.path">
          <code>{{ entry.path }}</code> — {{ entry.reason || '已被服务端忽略' }}
        </li>
      </ul>
    </div>

    <article class="assembly-card">
      <button
        type="button"
        class="assembly-card__header"
        :aria-expanded="inheritOpen"
        @click="inheritOpen = !inheritOpen"
      >
        <span class="assembly-card__caret" :class="{ 'is-open': inheritOpen }">›</span>
        <strong>继承与目录结构</strong>
        <span class="assembly-card__badge" :class="`is-${modelValue.target}`">
          {{
            httpContext
              ? '当前旁路文件'
              : modelValue.target === 'codeagent'
                ? '继承上次发布'
                : 'TestAgent 推荐'
          }}
        </span>
      </button>
      <div v-show="inheritOpen" class="assembly-card__body">
        <div class="assembly-subtitle">继承 Extension</div>
        <template v-if="httpContext">
          <div class="inheritance-summary">
            <div class="inheritance-summary__main">
              <strong>{{
                remote.sourceName ? `继承自 ${remote.sourceName}` : '当前 Extension'
              }}</strong>
              <span>{{
                remote.hasBypass ? `${remote.currentEntries.length} 个旁路文件` : '无旁路文件'
              }}</span>
            </div>
            <div class="inheritance-actions">
              <button type="button" :disabled="controlsDisabled" @click="openSourceDialog">
                {{ remote.hasBypass ? '更换继承' : '选择继承' }}
              </button>
              <button
                v-if="remote.hasBypass"
                type="button"
                :disabled="controlsDisabled"
                @click="remote.clear"
              >
                移除旁路
              </button>
            </div>
          </div>
          <div v-if="remote.hasBypass" class="bypass-current">
            <label
              ><input
                type="checkbox"
                :checked="modelValue.inheritBypass !== false"
                :disabled="controlsDisabled"
                @change="
                  updateState({ inheritBypass: ($event.target as HTMLInputElement).checked })
                "
              />继承当前旁路文件</label
            >
            <p v-if="modelValue.inheritBypass === false">
              本次发布不继承旁路文件；确认发布时将清除当前旁路。
            </p>
          </div>
        </template>
        <div v-else class="inheritance-summary">
          <template v-if="activeSource">
            <div class="inheritance-summary__main">
              <strong>{{ activeSource.name }}</strong>
              <span class="inheritance-kind" :class="`is-${activeSource.kind}`">
                {{ activeSource.kind === 'previous' ? '上次发布' : '部门通用' }}
              </span>
              <span
                >v{{ activeSource.version.replace(/^v/i, '') }} ·
                {{ activeSource.files.length }} 个旁路文件</span
              >
              <small v-if="activeSource.kind === 'previous'">（已自动继承）</small>
            </div>
            <div class="inheritance-actions">
              <button type="button" :disabled="disabled" @click="openSourceDialog">更换继承</button>
              <button type="button" :disabled="disabled" @click="clearInheritance">清除</button>
            </div>
          </template>
          <template v-else>
            <span class="inheritance-empty">无继承</span>
            <button type="button" :disabled="disabled" @click="openSourceDialog">选择继承</button>
          </template>
        </div>

        <div class="assembly-subtitle assembly-subtitle--tree">
          <button
            class="package-tree-toggle"
            type="button"
            :aria-expanded="treeOpen"
            @click="treeOpen = !treeOpen"
          >
            <span class="assembly-card__caret" :class="{ 'is-open': treeOpen }" aria-hidden="true"
              >›</span
            >
            <span>最终目录结构预览</span>
          </button>
          <span class="assembly-card__badge is-neutral">{{ packageFileCount }} 个文件</span>
          <button
            v-if="httpContext && (remote.hasBypass || httpContext.hasPublishedPackage)"
            class="package-download-button"
            type="button"
            :disabled="controlsDisabled"
            @click="remote.download"
          >
            下载完整包
          </button>
        </div>
        <div v-show="treeOpen">
          <p v-if="!httpContext" role="status">缺少场景信息，暂无法加载目录。</p>
          <p v-else-if="remote.treeLoading" role="status">正在加载目录…</p>
          <div v-else-if="httpContext && remote.treeError" class="archive-error" role="alert">
            {{ remote.treeError }}
            <button type="button" :disabled="controlsDisabled" @click="remote.refreshTree">
              重试目录加载
            </button>
          </div>
          <ul v-else-if="packageTree" class="package-tree" aria-label="最终目录结构">
            <ExtensionPackageTreeNode
              :node="packageTree"
              :selected-path="selectedTreePath"
              @select="selectedTreePath = $event"
            />
          </ul>
        </div>
      </div>
    </article>

    <article class="assembly-card">
      <button
        type="button"
        class="assembly-card__header"
        :aria-expanded="uploadOpen"
        @click="uploadOpen = !uploadOpen"
      >
        <span class="assembly-card__caret" :class="{ 'is-open': uploadOpen }">›</span>
        <strong>自定义附加文件</strong>
        <span class="assembly-card__badge is-uploaded">
          {{ modelValue.uploadedPackage?.files.length ?? 0 }} 个文件
        </span>
      </button>
      <div v-show="uploadOpen" class="assembly-card__body">
        <input
          ref="uploadInput"
          class="visually-hidden"
          type="file"
          accept=".zip,application/zip"
          :disabled="controlsDisabled"
          @change="onUploadChange"
        />
        <button
          type="button"
          class="archive-dropzone"
          :disabled="controlsDisabled"
          @click="openUploadPicker"
          @dragover.prevent
          @drop="onDrop"
        >
          <span class="archive-dropzone__icon" aria-hidden="true">⇧</span>
          <span>{{
            archiveReading
              ? httpContext
                ? '正在上传压缩包…'
                : '正在解析压缩包…'
              : '拖拽压缩包到此处，或点击上传'
          }}</span>
          <small
            >仅支持 .zip 压缩包，内含自定义文件与文件夹{{ httpContext ? '，最大 50MB' : '' }}</small
          >
        </button>
        <p v-if="httpContext" class="archive-filter-note">
          保护区目录结构发生增删时将拒绝整包；系统文件或受保护内容的修改会被忽略，并显示具体原因。上传将替换当前旁路文件。
        </p>
        <p v-else class="archive-filter-note">
          上传包中的 skills/、commands/、agents/、plugin.json 和 codeagent-extension.json
          会被过滤；其余文件参与合并，同路径上传文件覆盖继承文件。
        </p>
        <p v-if="archiveError" class="archive-error" role="alert">{{ archiveError }}</p>
        <div v-if="modelValue.uploadedPackage" class="archive-file">
          <span aria-hidden="true">▤</span>
          <strong>{{ modelValue.uploadedPackage.name }}</strong>
          <span>{{ formatSize(modelValue.uploadedPackage.size) }}</span>
          <span>{{ modelValue.uploadedPackage.files.length }} 个可合并文件</span>
          <span
            v-if="modelValue.uploadedPackage.rejectedPaths.length"
            class="archive-file__filtered"
          >
            已过滤 {{ modelValue.uploadedPackage.rejectedPaths.length }} 个受保护文件
          </span>
          <button
            type="button"
            aria-label="移除附加文件"
            :disabled="controlsDisabled"
            @click="httpContext ? remote.clear() : updateState({ uploadedPackage: null })"
          >
            ×
          </button>
        </div>
      </div>
    </article>

    <div class="release-assembly__actions">
      <div class="release-assembly__status">
        <span
          >当前模式：<strong>{{ targetLabel }}</strong></span
        >
      </div>
      <slot name="actions" />
    </div>

    <div v-if="sourceDialogOpen" class="inheritance-overlay" @keydown.esc.stop.prevent>
      <section class="inheritance-dialog" role="dialog" aria-modal="true" aria-label="选择继承源">
        <header>
          <h3>选择继承源</h3>
          <button
            type="button"
            aria-label="关闭选择继承源"
            :disabled="controlsDisabled"
            @click="sourceDialogOpen = false"
          >
            ×
          </button>
        </header>
        <label class="inheritance-search">
          <span class="visually-hidden">搜索 Extension 名称</span>
          <input
            v-model="sourceSearch"
            type="search"
            :disabled="controlsDisabled"
            :placeholder="
              httpContext ? '搜索 Extension、场景或工作流名称...' : '搜索 Extension 名称...'
            "
          />
        </label>
        <p
          v-if="httpContext && (remote.searchError || remote.error)"
          class="archive-error"
          role="alert"
        >
          {{ remote.searchError || remote.error }}
          <button
            v-if="remote.searchError"
            type="button"
            :disabled="remote.searchLoading || controlsDisabled"
            @click="remote.retrySearch()"
          >
            重试
          </button>
        </p>
        <div
          v-if="httpContext"
          ref="sourceResults"
          class="inheritance-options"
          role="region"
          aria-label="可继承的 Extension"
          :aria-busy="remote.searchLoading"
          @scroll.passive="onSourcesScroll"
          @wheel.passive="onSourcesWheel"
        >
          <label
            v-for="source in remote.searchResults"
            :key="source.extensionName"
            class="inheritance-option"
          >
            <input
              v-model="pendingSourceId"
              type="radio"
              :disabled="controlsDisabled"
              :value="source.extensionName"
            />
            <span>
              <strong>{{ source.extensionName }}</strong>
              <span v-if="source.latestVersion"
                >v{{ source.latestVersion.replace(/^v/i, '') }}</span
              >
              <span>{{ source.sourceDimName }}</span>
              <span>{{ source.layoutMode === 'testagent' ? 'TestAgent' : 'CodeAgent' }}</span>
              <small>{{ source.description }}</small>
              <small>{{
                source.hasBypass ? `含 ${source.entryCount} 个旁路文件` : '无旁路文件，仅继承布局'
              }}</small>
            </span>
          </label>
          <p v-if="remote.searchLoading" role="status">
            {{ remote.searchResults.length ? '正在加载更多…' : '正在搜索…' }}
          </p>
          <p
            v-else-if="!remote.searchResults.length && !remote.searchError"
            class="inheritance-empty"
          >
            {{ sourceSearch.trim() ? '未找到匹配的 Extension' : '输入关键字搜索继承来源' }}
          </p>
          <p
            v-else-if="remote.searchResults.length && !remote.searchHasMore && !remote.searchError"
            class="inheritance-empty"
          >
            已加载全部结果
          </p>
        </div>
        <div v-else class="inheritance-options">
          <label v-for="source in filteredSources" :key="source.id" class="inheritance-option">
            <input v-model="pendingSourceId" type="radio" :value="source.id" />
            <span>
              <strong>{{ source.name }}</strong>
              <span>v{{ source.version.replace(/^v/i, '') }}</span>
              <span>{{ source.organization }}</span>
              <small>{{ source.description }}</small>
            </span>
          </label>
          <p v-if="filteredSources.length === 0" class="inheritance-empty">
            未找到匹配的 Extension
          </p>
        </div>
        <footer>
          <button type="button" :disabled="controlsDisabled" @click="sourceDialogOpen = false">
            取消
          </button>
          <button
            type="button"
            class="is-primary"
            :disabled="!pendingSourceId || controlsDisabled || remote.searchLoading"
            @click="confirmSource"
          >
            确认继承
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.bypass-current {
  margin-top: 12px;
  font-size: 12px;
  color: #475467;
}
.bypass-current label {
  display: flex;
  gap: 6px;
  align-items: center;
}
.bypass-warning {
  padding: 12px 16px;
  border: 1px solid #f5cd80;
  border-radius: 8px;
  background: #fff8e8;
  color: #8b570c;
  font-size: 12px;
}
.bypass-warning li {
  margin-top: 6px;
  overflow-wrap: anywhere;
}
.release-assembly {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.release-target-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid #dfe6f2;
  border-radius: 8px;
  background: linear-gradient(135deg, #f8faff, #f1f5ff);
}

.release-target-bar > strong {
  color: #344054;
  font-size: 13px;
}

.release-target-bar em {
  color: #dc2626;
  font-style: normal;
}

.release-target-bar > span {
  min-width: 0;
  margin-left: auto;
  color: #98a2b3;
  font-size: 11px;
  text-align: right;
}

.release-target-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid #d9e2f0;
  border-radius: 7px;
  background: #e9eef6;
}

.release-target-tabs button {
  min-height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #52647d;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.release-target-tabs button.is-active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
}

.release-target-tabs button.is-testagent {
  color: #7c3aed;
}

.release-target-tabs button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.assembly-card {
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  background: #fff;
}

.assembly-card__header {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 0;
  background: #fff;
  color: #17233d;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.assembly-card__header:hover {
  background: #fafbfc;
}

.assembly-card__caret {
  color: #98a2b3;
  font-size: 18px;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

.assembly-card__caret.is-open {
  transform: rotate(90deg);
}

.assembly-card__badge {
  padding: 2px 7px;
  border: 1px solid #dfe6f2;
  border-radius: 999px;
  background: #f5f7fa;
  color: #667085;
  font-size: 10px;
  font-weight: 700;
}

.assembly-card__badge.is-codeagent,
.assembly-card__badge.is-uploaded {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #15803d;
}

.assembly-card__badge.is-testagent {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #7c3aed;
}

.assembly-card__badge.is-neutral {
  margin-left: 4px;
}

.assembly-card__body {
  padding: 0 16px 16px;
  border-top: 1px solid #edf0f5;
}

.assembly-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 8px;
  color: #344054;
  font-size: 12px;
  font-weight: 700;
}

.assembly-subtitle--tree {
  margin-top: 18px;
}

.package-tree-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.inheritance-summary {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 7px;
  background: #fafbfc;
}

.inheritance-summary__main {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: #667085;
  font-size: 11px;
}

.inheritance-summary__main strong {
  color: #17233d;
  font-size: 12px;
}

.inheritance-summary__main small {
  color: #b06a18;
}

.inheritance-kind {
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
}

.inheritance-kind.is-previous {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.inheritance-kind.is-department {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.inheritance-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.inheritance-summary button,
.package-download-button,
.inheritance-dialog button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #d6deea;
  border-radius: 6px;
  background: #fff;
  color: #475467;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.inheritance-summary button:disabled,
.package-download-button:disabled,
.inheritance-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.package-download-button {
  flex-shrink: 0;
  margin-left: auto;
  font-weight: 400;
}

.inheritance-empty {
  color: #98a2b3;
  font-size: 11px;
}

.package-tree {
  margin: 0;
  padding: 14px 0;
  overflow: auto;
  border: 1px solid #e9edf3;
  border-radius: 7px;
  background: #fff;
}

.archive-dropzone {
  display: grid;
  width: 100%;
  min-height: 104px;
  place-items: center;
  align-content: center;
  gap: 5px;
  padding: 14px;
  border: 1px dashed #b9c8dd;
  border-radius: 8px;
  background: #fbfdff;
  color: #475467;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.archive-dropzone:hover:not(:disabled) {
  border-color: #6c95ee;
  background: #f5f8ff;
}

.archive-dropzone:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.archive-dropzone__icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #eaf0ff;
  color: #4168d9;
  font-size: 18px;
}

.archive-dropzone small,
.archive-filter-note {
  color: #98a2b3;
  font-size: 10px;
}

.archive-filter-note {
  margin: 8px 0 0;
  line-height: 1.6;
}

.archive-error {
  margin: 8px 0 0;
  color: #dc2626;
  font-size: 11px;
  font-weight: 600;
}

.release-target-error {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid #fecaca;
  border-radius: 7px;
  background: #fef2f2;
  font-size: 12px;
}

.archive-file {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  color: #667085;
  font-size: 11px;
}

.archive-file strong {
  color: #344054;
}

.archive-file__filtered {
  color: #b06a18;
}

.archive-file button {
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #98a2b3;
  font-size: 17px;
  cursor: pointer;
}

.release-assembly__actions {
  position: sticky;
  bottom: 0;
  z-index: 4;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  background: #fafbfd;
  box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.04);
}

.release-assembly__status {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding-left: 16px;
  color: #667085;
  font-size: 11px;
}

.inheritance-overlay {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(3px);
}

.inheritance-dialog {
  display: flex;
  width: min(640px, 100%);
  max-height: min(680px, 88vh);
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
}

.inheritance-dialog > header,
.inheritance-dialog > footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ec;
}

.inheritance-dialog h3 {
  margin: 0;
  font-size: 15px;
}

.inheritance-dialog > header button {
  border: 0;
  font-size: 18px;
}

.inheritance-search {
  padding: 12px 16px 4px;
}

.inheritance-search input {
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid #dce3ed;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
}

.inheritance-options {
  display: grid;
  gap: 8px;
  padding: 10px 16px 16px;
  overflow: auto;
}

.inheritance-option {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
}

.inheritance-option:has(input:checked) {
  border-color: #7c9ff0;
  background: #f5f8ff;
}

.inheritance-option > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: #667085;
  font-size: 11px;
}

.inheritance-option strong {
  color: #17233d;
  font-size: 12px;
}

.inheritance-option small {
  width: 100%;
  color: #667085;
  line-height: 1.55;
}

.inheritance-dialog > footer {
  justify-content: flex-end;
  border-top: 1px solid #e4e7ec;
  border-bottom: 0;
  background: #fafbfd;
}

.inheritance-dialog button.is-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .release-target-bar,
  .release-assembly__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .release-target-bar > span {
    margin-left: 0;
    text-align: left;
  }

  .release-assembly__status {
    padding: 12px 14px 0;
  }

  .archive-file {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .assembly-card__caret {
    transition: none;
  }
}
</style>

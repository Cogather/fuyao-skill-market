<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ExtensionBypassInheritDialog from './ExtensionBypassInheritDialog.vue';
import {
  clearExtensionBypass,
  getExtensionBypassDownload,
  inheritExtensionBypass,
  queryExtensionStructureTree,
  updateExtensionLayout,
  uploadExtensionBypass,
  type ExtensionBypassEntry,
  type ExtensionBypassResult,
  type ExtensionInheritanceSource,
  type ExtensionLayoutMode,
  type ExtensionStructureComponent,
  type ExtensionStructureEntry,
} from '../../services/skillMarket/extensionBypassService';
import type { ExtensionScene } from '../../services/skillMarket/extensionPublishMock';

const props = defineProps<{ userId: string; scene: ExtensionScene; publicationLocked?: boolean }>();
const emit = defineEmits<{
  mutationState: [state: { userId: string; sceneExtensionCode: string; busy: boolean }];
  updated: [
    metadata: {
      sceneExtensionCode: string;
      layoutMode: ExtensionLayoutMode;
      hasBypass: boolean;
      bypassEntries: ExtensionBypassEntry[];
    },
  ];
}>();
const code = computed(() => props.scene.sceneExtensionCode?.trim() ?? '');
const userId = computed(() => props.userId.trim());
const available = computed(() => Boolean(code.value && userId.value));
const layout = ref<ExtensionLayoutMode>('standard');
const hasBypass = ref(false);
const accepted = ref<ExtensionBypassEntry[]>([]);
const ignored = ref<ExtensionBypassEntry[]>([]);
const entries = ref<ExtensionStructureEntry[]>([]);
const busy = ref(false);
const mutationError = ref('');
const treeLoading = ref(false);
const treeError = ref('');
const confirmClear = ref(false);
const inheritOpen = ref(false);
const inheritError = ref('');
let mutationSequence = 0;
let treeSequence = 0;
const disabled = computed(() => !available.value || busy.value || props.publicationLocked);
watch(
  busy,
  (value) => {
    emit('mutationState', { userId: userId.value, sceneExtensionCode: code.value, busy: value });
  },
  { flush: 'sync' },
);
const components = computed<ExtensionStructureComponent[]>(() =>
  (['skill', 'command', 'agent'] as const).flatMap((type) =>
    props.scene.capabilities[type].flatMap((item) => {
      const name = item.name.trim();
      const version = item.version?.trim();
      return name && version
        ? [
            {
              componentType: type.toUpperCase() as ExtensionStructureComponent['componentType'],
              componentName: name,
              componentVersion: version,
            },
          ]
        : [];
    }),
  ),
);
const message = (cause: unknown) => (cause instanceof Error ? cause.message : '操作失败，请重试');

let activeTreeRefresh: Promise<void> | undefined;
function refreshTree() {
  if (props.publicationLocked) return;
  activeTreeRefresh = loadTree();
  return activeTreeRefresh;
}
function requestTreeRefresh() {
  if (!disabled.value && !treeLoading.value) return refreshTree();
}
async function loadTree() {
  const sequence = ++treeSequence;
  entries.value = [];
  treeError.value = '';
  treeLoading.value = false;
  if (!available.value) {
    return;
  }
  const extensionName = code.value;
  const requestUser = userId.value;
  treeLoading.value = true;
  try {
    const result = await queryExtensionStructureTree({
      userId: requestUser,
      extensionName,
      layout: layout.value,
      components: components.value,
    });
    if (sequence !== treeSequence || extensionName !== code.value || requestUser !== userId.value) {
      return;
    }
    entries.value = result.entries;
  } catch (cause) {
    if (sequence === treeSequence) {
      treeError.value = message(cause);
    }
  } finally {
    if (sequence === treeSequence) {
      treeLoading.value = false;
    }
  }
}
function publishMetadata() {
  emit('updated', {
    sceneExtensionCode: code.value,
    layoutMode: layout.value,
    hasBypass: hasBypass.value,
    bypassEntries: [...accepted.value],
  });
}
function applyResult(result: ExtensionBypassResult) {
  layout.value = result.layoutMode;
  accepted.value = result.acceptedEntries;
  ignored.value = result.ignoredEntries;
  hasBypass.value = result.acceptedEntries.length > 0;
}
async function mutate(
  run: (identity: { userId: string; extensionName: string }) => Promise<() => void>,
  inheritance = false,
) {
  if (disabled.value) {
    return;
  }
  const sequence = ++mutationSequence;
  const identity = { userId: userId.value, extensionName: code.value };
  busy.value = true;
  mutationError.value = '';
  inheritError.value = '';
  try {
    const apply = await run(identity);
    if (
      sequence !== mutationSequence ||
      identity.extensionName !== code.value ||
      identity.userId !== userId.value
    ) {
      return;
    }
    apply();
    publishMetadata();
    await nextTick();
    await refreshTree();
    // A metadata/component update may have started a newer tree request.
    while (sequence === mutationSequence && treeLoading.value && activeTreeRefresh) {
      await activeTreeRefresh;
    }
    if (sequence !== mutationSequence) return;
    return true;
  } catch (cause) {
    if (sequence !== mutationSequence) {
      return;
    }
    if (inheritance) {
      inheritError.value = message(cause);
    } else {
      mutationError.value = message(cause);
    }
  } finally {
    if (sequence === mutationSequence) {
      busy.value = false;
    }
  }
}
async function changeLayout(event: Event) {
  const select = event.target as HTMLSelectElement;
  const next = select.value;
  // Restore the native select until the persisted response arrives.
  select.value = layout.value;
  if ((next !== 'standard' && next !== 'testagent') || next === layout.value) {
    return;
  }
  await mutate(async (identity) => {
    const result = await updateExtensionLayout({ ...identity, layout: next });
    return () => {
      layout.value = result.layoutMode;
    };
  });
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  // Copy the live FileList before resetting the input so the same ZIP can be selected again.
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files?.length || disabled.value) {
    return;
  }
  if (files.length !== 1 || !/\.zip$/i.test(files[0]!.name)) {
    mutationError.value = '请选择单个 .zip 文件';
    return;
  }
  const file = files[0]!;
  await mutate(async (identity) => {
    const result = await uploadExtensionBypass({ ...identity, layout: layout.value, file });
    return () => {
      applyResult(result);
      confirmClear.value = false;
    };
  });
}
async function clear() {
  if (!hasBypass.value || !confirmClear.value) {
    return;
  }
  await mutate(async (identity) => {
    await clearExtensionBypass(identity);
    return () => {
      hasBypass.value = false;
      accepted.value = [];
      ignored.value = [];
      confirmClear.value = false;
    };
  });
}
async function download() {
  if (disabled.value || !hasBypass.value) {
    return;
  }
  const sequence = ++mutationSequence;
  const extensionName = code.value;
  const requestUser = userId.value;
  busy.value = true;
  mutationError.value = '';
  try {
    const result = await getExtensionBypassDownload({ userId: requestUser, extensionName });
    if (
      sequence !== mutationSequence ||
      extensionName !== code.value ||
      requestUser !== userId.value
    ) {
      return;
    }
    window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
  } catch (cause) {
    if (sequence === mutationSequence) {
      mutationError.value = message(cause);
    }
  } finally {
    if (sequence === mutationSequence) {
      busy.value = false;
    }
  }
}
async function inherit(source: ExtensionInheritanceSource) {
  const identity = JSON.stringify([userId.value, code.value]);
  const completed = await mutate(async (identity) => {
    const result = await inheritExtensionBypass({
      userId: identity.userId,
      sourceExtensionName: source.extensionName,
      targetExtensionName: identity.extensionName,
    });
    return () => {
      applyResult(result);
      confirmClear.value = false;
    };
  }, true);
  // Restore focus only once the opener has been re-enabled in the DOM.
  await nextTick();
  if (completed && identity === JSON.stringify([userId.value, code.value]) && !busy.value) {
    inheritOpen.value = false;
  }
}
function openInheritance() {
  if (disabled.value) return;
  inheritOpen.value = true;
  inheritError.value = '';
}
function requestClear() {
  if (!disabled.value && hasBypass.value) confirmClear.value = true;
}
watch(
  () => [code.value, userId.value],
  () => {
    mutationSequence += 1;
    busy.value = false;
    mutationError.value = '';
    inheritError.value = '';
    inheritOpen.value = false;
    confirmClear.value = false;
    ignored.value = [];
    layout.value = props.scene.layoutMode ?? 'standard';
    hasBypass.value = props.scene.hasBypass ?? false;
    accepted.value = [...(props.scene.bypassEntries ?? [])];
  },
  { immediate: true, flush: 'sync' },
);
watch(
  () => [props.scene.layoutMode, props.scene.hasBypass, props.scene.bypassEntries] as const,
  () => {
    layout.value = props.scene.layoutMode ?? 'standard';
    hasBypass.value = props.scene.hasBypass ?? false;
    accepted.value = [...(props.scene.bypassEntries ?? [])];
  },
  { deep: true },
);
watch(
  () =>
    JSON.stringify([
      code.value,
      userId.value,
      layout.value,
      components.value,
      props.publicationLocked,
    ]),
  () => {
    void refreshTree();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  mutationSequence += 1;
  treeSequence += 1;
  busy.value = false;
});
</script>

<template>
  <section class="packaging-panel" aria-labelledby="extension-packaging-title">
    <header class="packaging-heading">
      <div>
        <h3 id="extension-packaging-title">打包与旁路</h3>
        <p>配置目录布局，管理额外文件并预览完整打包结构。</p>
      </div>
      <span class="bypass-status">{{ hasBypass ? '已配置旁路' : '仅组件与系统文件' }}</span>
    </header>
    <p v-if="!code" class="packaging-hint">
      当前场景暂无场景编码，完成场景配置后可管理打包与旁路。
    </p>
    <p v-else-if="!userId" class="packaging-hint">等待当前用户身份加载后可管理打包与旁路。</p>
    <div class="packaging-controls">
      <label class="layout-label"
        >目录布局
        <select data-testid="layout" :value="layout" :disabled="disabled" @change="changeLayout">
          <option value="standard">standard</option>
          <option value="testagent">testagent</option>
        </select>
      </label>
      <label class="upload-label" :class="{ 'is-disabled': disabled }"
        >上传旁路 ZIP
        <input
          data-testid="upload"
          type="file"
          accept=".zip"
          :disabled="disabled"
          aria-label="上传旁路 ZIP"
          @change="upload"
        />
      </label>
      <button data-testid="inherit" type="button" :disabled="disabled" @click="openInheritance">
        从 Extension 继承
      </button>
      <button
        data-testid="download"
        type="button"
        :disabled="disabled || !hasBypass"
        @click="download"
      >
        下载旁路
      </button>
      <button
        data-testid="clear"
        class="danger-text"
        type="button"
        :disabled="disabled || !hasBypass"
        @click="requestClear"
      >
        移除旁路
      </button>
    </div>
    <div v-if="confirmClear" class="clear-confirm" role="alert">
      <span>确认移除当前旁路文件？目录布局将保留。</span
      ><button type="button" :disabled="busy" @click="confirmClear = false">取消</button
      ><button
        data-testid="confirm-clear"
        class="danger-text"
        type="button"
        :disabled="disabled"
        @click="clear"
      >
        确认移除
      </button>
    </div>
    <p v-if="busy" class="packaging-hint" role="status">正在处理，请稍候…</p>
    <p v-if="mutationError" class="packaging-error" role="alert">{{ mutationError }}</p>
    <div v-if="accepted.length || ignored.length" class="entry-summary">
      <div data-testid="accepted-entries" class="accepted-entries">
        <h4>已接收文件 · {{ accepted.length }}</h4>
        <ul>
          <li v-for="entry in accepted" :key="entry.path">
            <code>{{ entry.path }}</code
            ><span>{{ entry.size }} B</span>
          </li>
        </ul>
      </div>
      <div v-if="ignored.length" data-testid="ignored-entries" class="ignored-entries" role="alert">
        <h4>已忽略文件 · {{ ignored.length }}</h4>
        <p>以下文件未应用，请检查冲突原因。</p>
        <ul>
          <li v-for="entry in ignored" :key="entry.path">
            <code>{{ entry.path }}</code
            ><strong>{{ entry.reason || '目标路径受保护' }}</strong>
          </li>
        </ul>
      </div>
    </div>
    <div class="structure-heading">
      <h4>完整目录结构</h4>
      <button type="button" :disabled="disabled || treeLoading" @click="requestTreeRefresh">
        刷新目录
      </button>
    </div>
    <p v-if="treeLoading" class="packaging-hint" role="status">正在加载目录…</p>
    <p v-else-if="treeError" class="packaging-error" role="alert">目录加载失败：{{ treeError }}</p>
    <ul v-else class="structure-tree" aria-label="完整目录结构">
      <li
        v-for="entry in entries"
        :key="entry.path"
        :style="{
          paddingLeft: `${12 + Math.max(0, entry.path.replace(/\/$/, '').split('/').length - 1) * 16}px`,
        }"
      >
        <span class="entry-icon" aria-hidden="true">{{ entry.type === 'dir' ? '▸' : '▤' }}</span
        ><span class="sr-only">{{ entry.type === 'dir' ? '目录' : '文件' }}</span
        ><code>{{ entry.path }}</code
        ><small v-if="entry.size !== null">{{ entry.size }} B</small
        ><span class="source-badge" :class="`source-${entry.source.toLowerCase()}`">{{
          entry.source
        }}</span>
      </li>
      <li v-if="available && !entries.length" class="packaging-hint">暂无目录条目</li>
    </ul>
    <ExtensionBypassInheritDialog
      :open="inheritOpen"
      :user-id="userId"
      :target-scene-code="code"
      :busy="busy || publicationLocked"
      :error="inheritError"
      @close="inheritOpen = false"
      @confirm="inherit"
    />
  </section>
</template>

<style scoped>
.packaging-panel {
  margin-bottom: 20px;
  padding: 22px;
  border: 1px solid #dfe5ef;
  border-radius: 14px;
  background: #fff;
  color: #25314a;
}
.packaging-heading,
.packaging-controls,
.structure-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.packaging-heading,
.structure-heading {
  justify-content: space-between;
}
.packaging-heading h3 {
  margin: 0 0 7px;
  font-size: 17px;
}
.packaging-heading p,
.packaging-hint {
  color: #68758b;
  font-size: 13px;
}
.packaging-heading p {
  margin: 0;
}
.bypass-status {
  font-size: 12px;
  background: #eff3fa;
  color: #52627d;
  padding: 5px 10px;
  border-radius: 20px;
}
.packaging-controls {
  margin: 20px 0 12px;
}
button,
select,
.upload-label {
  border: 1px solid #d7deea;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  padding: 8px 12px;
  font: inherit;
  font-size: 13px;
}
button,
.upload-label {
  cursor: pointer;
}
button:hover:not(:disabled),
.upload-label:hover:not(.is-disabled) {
  border-color: #688ee6;
  background: #f5f8ff;
}
button:disabled,
select:disabled,
.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.layout-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.upload-label {
  position: relative;
  overflow: hidden;
  background: #edf3ff;
  color: #315ca8;
}
.upload-label input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  cursor: pointer;
}
.upload-label:focus-within {
  outline: 2px solid #4479db;
  outline-offset: 2px;
}
.danger-text {
  color: #bd3843;
}
.packaging-error {
  color: #b32f3d;
  background: #fff1f2;
  padding: 10px 12px;
  border-radius: 7px;
  font-size: 13px;
}
.clear-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  background: #fff5e9;
  border-radius: 8px;
  font-size: 13px;
}
.clear-confirm span {
  margin-right: auto;
}
.entry-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 14px;
  margin: 18px 0;
}
.entry-summary h4,
.structure-heading h4 {
  margin: 0;
  font-size: 13px;
}
.entry-summary ul,
.structure-tree {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.entry-summary li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin: 8px 0;
  font-size: 12px;
}
.entry-summary code,
.structure-tree code {
  overflow-wrap: anywhere;
}
.ignored-entries {
  padding: 14px;
  border: 1px solid #edc78a;
  background: #fff6e7;
  border-radius: 8px;
  color: #8b4c0b;
}
.ignored-entries p {
  font-size: 12px;
}
.ignored-entries li {
  display: grid;
}
.accepted-entries {
  padding: 14px;
  background: #f6f9fc;
  border-radius: 8px;
}
.accepted-entries li span {
  color: #69778d;
}
.structure-heading {
  margin-top: 20px;
}
.structure-tree {
  max-height: 360px;
  overflow: auto;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
}
.structure-tree li {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  font-size: 12px;
  border-bottom: 1px solid #f0f3f7;
}
.structure-tree small {
  margin-left: auto;
  color: #79849a;
  white-space: nowrap;
}
.entry-icon {
  color: #8793aa;
}
.source-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: 4px;
}
.source-system {
  background: #eeeafa;
  color: #7043a8;
}
.source-component {
  background: #eaf1ff;
  color: #3265af;
}
.source-file {
  background: #e4f5eb;
  color: #287c51;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 700px) {
  .packaging-panel {
    padding: 16px;
  }
  .packaging-controls {
    align-items: stretch;
  }
  .layout-label {
    width: 100%;
  }
  .structure-tree {
    max-height: 280px;
  }
}
</style>

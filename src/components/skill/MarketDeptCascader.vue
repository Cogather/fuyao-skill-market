<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';

export type MarketDeptCascaderNode = {
  id?: string;
  name: string;
  children?: MarketDeptCascaderNode[];
};

type DeptCascadeColumn = {
  levelIndex: number;
  options: MarketDeptCascaderNode[];
  active: string | undefined;
};

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    tree: MarketDeptCascaderNode[];
    maxLevel?: number;
    allLabel?: string;
    emptyText?: string;
    clearText?: string;
    doneText?: string;
    ariaLabel?: string;
    beforeClear?: () => boolean;
    beforeDone?: (value: string[]) => boolean;
    clearBehavior?: 'clear' | 'reset';
    clearValue?: string[];
    selectionMode?: 'immediate' | 'confirm';
    permissionMode?: 'none' | 'review-center';
    permissionPath?: string[];
  }>(),
  {
    maxLevel: 6,
    clearBehavior: 'clear',
    clearValue: () => [],
    selectionMode: 'immediate',
    permissionMode: 'none',
    permissionPath: () => [],
    allLabel: '全部部门',
    emptyText: '暂无部门数据（可先调整组织/分类或等待列表加载）',
    clearText: '清空部门',
    doneText: '完成',
    ariaLabel: '部门级联筛选',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
  change: [value: string[]];
  clear: [value: string[]];
  done: [value: string[]];
}>();

const open = ref(false);
const wrapRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelLayout = ref<{ left: number; top: number; maxWidth: number } | null>(null);
const panelMaxHeight = ref(340);
let panelScrollCleanup: (() => void) | null = null;

const normalizedTree = computed(() => props.tree ?? []);
const selectedPath = computed(() => props.modelValue ?? []);
const draftPath = ref<string[]>([]);
const activePath = computed(() =>
  props.selectionMode === 'confirm' ? draftPath.value : selectedPath.value,
);
const selectedLabel = computed(() =>
  selectedPath.value.length > 0 ? selectedPath.value.join(' / ') : props.allLabel,
);
const normalizedPermissionPath = computed(() => normalizePath(props.permissionPath ?? []));

function normalizePath(segments: string[]): string[] {
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

function nodeByPartial(segments: string[]): MarketDeptCascaderNode | null {
  let nodes = normalizedTree.value;
  let current: MarketDeptCascaderNode | null = null;
  for (const segment of segments) {
    current = nodes.find((node) => node.name === segment) ?? null;
    if (!current) {
      return null;
    }
    nodes = current.children ?? [];
  }
  return current;
}

function optionsAt(levelIndex: number): MarketDeptCascaderNode[] {
  const tree = normalizedTree.value;
  if (tree.length === 0) {
    return [];
  }
  const segments = activePath.value;
  if (levelIndex > segments.length) {
    return [];
  }

  let nodes = tree;
  for (let index = 0; index < levelIndex; index += 1) {
    const name = segments[index];
    if (!name) {
      return [];
    }
    const hit = nodes.find((node) => node.name === name);
    if (!hit) {
      return [];
    }
    nodes = hit.children ?? [];
  }
  return nodes;
}

const columns = computed<DeptCascadeColumn[]>(() => {
  if (normalizedTree.value.length === 0) {
    return [];
  }

  const output: DeptCascadeColumn[] = [];
  for (let level = 0; level < props.maxLevel; level += 1) {
    const options = optionsAt(level);
    if (options.length === 0) {
      break;
    }
    output.push({
      levelIndex: level,
      options,
      active: activePath.value[level],
    });
  }
  return output;
});

function hasChildren(levelIndex: number, name: string): boolean {
  const node = nodeByPartial([...activePath.value.slice(0, levelIndex), name]);
  return Boolean(node?.children?.length);
}

function pathAllowedByPermission(path: string[]): boolean {
  if (props.permissionMode !== 'review-center') {
    return true;
  }

  const permissionPath = normalizedPermissionPath.value;
  const normalizedPath = normalizePath(path);
  if (permissionPath.length === 0 || normalizedPath.length === 0) {
    return true;
  }

  const pathIsBeforePermissionDept =
    normalizedPath.length <= permissionPath.length &&
    normalizedPath.every((segment, index) => segment === permissionPath[index]);
  const pathIsInsidePermissionDept = permissionPath.every(
    (segment, index) => normalizedPath[index] === segment,
  );
  return pathIsBeforePermissionDept || pathIsInsidePermissionDept;
}

function isOptionDisabled(levelIndex: number, name: string): boolean {
  return !pathAllowedByPermission([...activePath.value.slice(0, levelIndex), name]);
}

function updatePanelLayout(): void {
  if (!open.value) {
    panelLayout.value = null;
    return;
  }

  const wrap = wrapRef.value;
  if (!wrap) {
    panelLayout.value = null;
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const margin = 16;
  const fromLeft = Math.max(0, rect.left);
  const usable = Math.max(220, Math.floor(window.innerWidth - fromLeft - margin));
  const gap = 4;
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - margin - gap);
  const availableAbove = Math.max(0, rect.top - margin - gap);
  const measuredHeight = Math.max(
    panelRef.value?.scrollHeight ?? 0,
    panelRef.value?.getBoundingClientRect().height ?? 0,
  );
  const desiredHeight = Math.min(340, Math.max(220, measuredHeight));
  const opensAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
  const availableHeight = opensAbove ? availableAbove : availableBelow;
  const maxHeight = Math.min(340, Math.max(80, Math.floor(availableHeight)));
  const renderedHeight = Math.min(desiredHeight, maxHeight);
  const nextTop = opensAbove
    ? Math.max(margin, Math.floor(rect.top - renderedHeight - gap))
    : Math.floor(rect.bottom + gap);
  panelLayout.value = {
    left: Math.floor(fromLeft),
    top: Math.floor(rect.bottom + 4),
    maxWidth: Math.min(720, usable),
  };
  if (panelLayout.value) panelLayout.value.top = nextTop;
  panelMaxHeight.value = maxHeight;
}

const panelStyle = computed((): CSSProperties => {
  const layout = panelLayout.value;
  if (!layout) {
    return {};
  }
  return {
    position: 'fixed',
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    maxWidth: `${layout.maxWidth}px`,
    maxHeight: `${panelMaxHeight.value}px`,
    zIndex: 2400,
  };
});

function setOpen(nextOpen: boolean): void {
  if (props.selectionMode === 'confirm') {
    draftPath.value = [...selectedPath.value];
  }
  open.value = nextOpen;
  if (nextOpen) {
    updatePanelLayout();
    void nextTick(() => {
      updatePanelLayout();
    });
  }
}

function toggle(): void {
  setOpen(!open.value);
}

function select(levelIndex: number, name: string): void {
  if (isOptionDisabled(levelIndex, name)) {
    return;
  }

  const nextValue = [...activePath.value.slice(0, levelIndex), name];
  if (props.selectionMode === 'confirm') {
    draftPath.value = nextValue;
    return;
  }
  emit('update:modelValue', nextValue);
  emit('change', nextValue);
}

function clear(): void {
  if (props.beforeClear && !props.beforeClear()) {
    return;
  }
  const nextValue = props.clearBehavior === 'reset' ? [...(props.clearValue ?? [])] : [];
  emit('update:modelValue', nextValue);
  emit('change', nextValue);
  emit('clear', nextValue);
  setOpen(false);
}

function done(): void {
  const nextValue = [...activePath.value];
  if (props.beforeDone && !props.beforeDone(nextValue)) {
    return;
  }
  if (props.selectionMode === 'confirm') {
    emit('update:modelValue', nextValue);
    emit('change', nextValue);
  }
  emit('done', nextValue);
  setOpen(false);
}

function onDocumentMouseDown(event: MouseEvent): void {
  if (!open.value) {
    return;
  }
  const target = event.target as Node;
  if (wrapRef.value?.contains(target) || panelRef.value?.contains(target)) {
    return;
  }
  setOpen(false);
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (open.value && event.key === 'Escape') {
    setOpen(false);
  }
}

watch(open, (isOpen) => {
  panelScrollCleanup?.();
  panelScrollCleanup = null;

  if (isOpen) {
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeydown);
    void nextTick(() => {
      updatePanelLayout();
    });
    const onScrollOrResize = (): void => {
      updatePanelLayout();
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    panelScrollCleanup = (): void => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  } else {
    document.removeEventListener('mousedown', onDocumentMouseDown);
    document.removeEventListener('keydown', onDocumentKeydown);
    panelLayout.value = null;
  }
});

onBeforeUnmount(() => {
  panelScrollCleanup?.();
  panelScrollCleanup = null;
  document.removeEventListener('mousedown', onDocumentMouseDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div ref="wrapRef" class="market-dept-cascader" :aria-label="ariaLabel">
    <button
      type="button"
      class="market-dept-cascader-trigger"
      :class="{ 'is-open': open }"
      aria-haspopup="true"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="market-dept-cascader-trigger-text" :title="selectedLabel">
        {{ selectedLabel }}
      </span>
      <span class="market-dept-cascader-caret" aria-hidden="true">▾</span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="market-dept-cascader-panel"
        :style="panelStyle"
        role="listbox"
        @mousedown.prevent
      >
        <div v-if="columns.length === 0" class="market-dept-cascader-empty">
          {{ emptyText }}
        </div>
        <div v-else class="market-dept-cascader-columns">
          <div
            v-for="column in columns"
            :key="`dept-col-${column.levelIndex}`"
            class="market-dept-cascader-col"
            role="presentation"
          >
            <button
              v-for="node in column.options"
              :key="`${column.levelIndex}-${node.name}`"
              type="button"
              class="market-dept-cascader-item"
              :class="{
                'is-active': column.active === node.name,
                'is-disabled': isOptionDisabled(column.levelIndex, node.name),
              }"
              role="option"
              :disabled="isOptionDisabled(column.levelIndex, node.name)"
              :aria-selected="column.active === node.name"
              :aria-disabled="isOptionDisabled(column.levelIndex, node.name)"
              @click="select(column.levelIndex, node.name)"
            >
              <span class="market-dept-cascader-item-label">{{ node.name }}</span>
              <span
                v-if="
                  hasChildren(column.levelIndex, node.name) &&
                  !isOptionDisabled(column.levelIndex, node.name)
                "
                class="market-dept-cascader-item-chevron"
                aria-hidden="true"
              >
                &rsaquo;
              </span>
            </button>
          </div>
        </div>
        <div class="market-dept-cascader-footer">
          <button type="button" class="market-dept-cascader-clear" @click="clear">
            {{ clearText }}
          </button>
          <button type="button" class="market-dept-cascader-done" @click="done">
            {{ doneText }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.market-dept-cascader {
  position: relative;
  min-width: 0;
}

.market-dept-cascader-trigger {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  position: relative;
  box-sizing: border-box;
  padding: 0 34px 0 14px;
  border: 1px solid #dfe6f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: #243249;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.market-dept-cascader-trigger:hover {
  border-color: #c5d0e0;
}

.market-dept-cascader-trigger.is-open,
.market-dept-cascader-trigger:focus {
  border-color: #1677ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.market-dept-cascader-trigger-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-dept-cascader-caret {
  position: absolute;
  top: 50%;
  right: 12px;
  color: #94a3b8;
  font-size: 11px;
  pointer-events: none;
  transform: translateY(-50%);
}

.market-dept-cascader-panel {
  display: flex;
  flex-direction: column;
  width: max-content;
  min-width: 200px;
  max-width: 720px;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.14);
}

.market-dept-cascader-empty {
  padding: 16px 14px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.market-dept-cascader-columns {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  width: 100%;
  min-width: 0;
  min-height: 0;
  max-height: 280px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.market-dept-cascader-col {
  flex: 0 0 auto;
  min-width: 140px;
  max-width: 220px;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 1px solid #eef2f7;
  -webkit-overflow-scrolling: touch;
}

.market-dept-cascader-col:last-of-type {
  border-right: 0;
}

.market-dept-cascader-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.market-dept-cascader-item:hover {
  background: #f8fafc;
}

.market-dept-cascader-item:disabled,
.market-dept-cascader-item.is-disabled {
  color: #a8b3c2;
  cursor: not-allowed;
}

.market-dept-cascader-item:disabled:hover,
.market-dept-cascader-item.is-disabled:hover {
  background: transparent;
}
.market-dept-cascader-item.is-active {
  background: #eaf2ff;
  color: #2563eb;
  font-weight: 750;
}

.market-dept-cascader-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-dept-cascader-item-chevron {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 800;
}

.market-dept-cascader-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid #eef2f7;
  background: #fafbfc;
  position: sticky;
  bottom: 0;
  z-index: 1;
}

.market-dept-cascader-clear {
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.market-dept-cascader-clear:hover {
  color: #2563eb;
}

.market-dept-cascader-done {
  padding: 6px 14px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #ffffff;
  color: #172033;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.market-dept-cascader-done:hover {
  border-color: #2563eb;
  color: #2563eb;
}

@media (max-width: 760px) {
  .market-dept-cascader-columns {
    flex-direction: column;
    max-height: min(60vh, 360px);
  }

  .market-dept-cascader-col {
    min-width: 100%;
    max-width: none;
    max-height: 200px;
    border-right: 0;
    border-bottom: 1px solid #eef2f7;
  }

  .market-dept-cascader-col:last-of-type {
    border-bottom: 0;
  }
}
</style>

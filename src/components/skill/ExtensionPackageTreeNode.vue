<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ExtensionPackageNode } from '../../services/skillMarket/extensionReleaseAssembly';

const props = withDefaults(
  defineProps<{
    node: ExtensionPackageNode;
    prefix?: string;
    isLast?: boolean;
    path?: string;
    selectedPath?: string;
  }>(),
  { prefix: '', isLast: true, path: '', selectedPath: '' },
);

const emit = defineEmits<{ select: [path: string] }>();
const expanded = ref(true);
const isFolder = computed(() => props.node.type === 'folder');
const nodePath = computed(() => props.path || props.node.name);
const branch = computed(() => `${props.prefix}${props.isLast ? '└─ ' : '├─ '}`);
const childPrefix = computed(() => `${props.prefix}${props.isLast ? '   ' : '│  '}`);
const sourceLabel = computed(() => {
  if (props.node.source === 'system') return '系统';
  if (props.node.source === 'inherited') return '继承';
  if (props.node.source === 'uploaded') return '上传';
  if (props.node.source === 'component') return '组件';
  if (props.node.source === 'bypass') return '旁路';
  return '';
});

function toggle(): void {
  emit('select', nodePath.value);
  if (isFolder.value) expanded.value = !expanded.value;
}
</script>

<template>
  <li class="package-tree-node">
    <button
      type="button"
      class="package-tree-row"
      :class="[
        `is-${node.type}`,
        `is-${node.source || 'plain'}`,
        { 'is-selected': selectedPath === nodePath },
      ]"
      :aria-expanded="isFolder ? expanded : undefined"
      :aria-current="selectedPath === nodePath ? 'true' : undefined"
      @click="toggle"
    >
      <span class="package-tree-branch" aria-hidden="true">{{ branch }}</span>
      <span class="package-tree-name">{{ node.name }}</span>
      <span v-if="sourceLabel" class="package-tree-source" :class="`is-${node.source}`">
        {{ sourceLabel }}
      </span>
    </button>
    <ul v-if="isFolder && expanded && node.children?.length" class="package-tree-children">
      <ExtensionPackageTreeNode
        v-for="(child, index) in node.children"
        :key="`${node.name}-${child.name}-${child.source || ''}`"
        :node="child"
        :prefix="childPrefix"
        :is-last="index === node.children.length - 1"
        :path="`${nodePath}${child.name}`"
        :selected-path="selectedPath"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.package-tree-node,
.package-tree-children {
  margin: 0;
  padding: 0;
  list-style: none;
}

.package-tree-row {
  display: flex;
  width: 100%;
  min-height: 26px;
  align-items: center;
  padding: 4px 16px;
  border: 0;
  background: transparent;
  color: #334155;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.55;
  text-align: left;
  white-space: pre;
  cursor: pointer;
}

.package-tree-row:hover {
  background: #f8fafc;
}

.package-tree-row.is-selected {
  background: #eef6ff;
  color: #1d4ed8;
  box-shadow: inset 3px 0 0 #2f7df6;
}

.package-tree-row:focus-visible {
  outline: 2px solid #2f7df6;
  outline-offset: -2px;
}

.package-tree-node {
  min-width: max-content;
}

.package-tree-branch,
.package-tree-name {
  flex: 0 0 auto;
}

.package-tree-name {
  margin-right: 12px;
}

.package-tree-source {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 999px;
  font-family: sans-serif;
  font-size: 9px;
  font-weight: 700;
  line-height: 16px;
}

.package-tree-source.is-system,
.package-tree-source.is-component {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.package-tree-source.is-inherited,
.package-tree-source.is-bypass {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #7c3aed;
}

.package-tree-source.is-uploaded {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #15803d;
}
</style>

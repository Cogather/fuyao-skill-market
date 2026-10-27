<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ExtensionPackageNode } from '../../services/skillMarket/extensionReleaseAssembly';

const props = withDefaults(
  defineProps<{
    node: ExtensionPackageNode;
    depth?: number;
  }>(),
  { depth: 0 },
);

const expanded = ref(true);
const isFolder = computed(() => props.node.type === 'folder');
const sourceLabel = computed(() => {
  if (props.node.source === 'system') return '系统';
  if (props.node.source === 'inherited') return '继承';
  if (props.node.source === 'uploaded') return '上传';
  if (props.node.source === 'component') return '组件';
  if (props.node.source === 'bypass') return '旁路';
  return '';
});

function toggle(): void {
  if (isFolder.value) expanded.value = !expanded.value;
}
</script>

<template>
  <li class="package-tree-node">
    <button
      type="button"
      class="package-tree-row"
      :class="[`is-${node.type}`, `is-${node.source || 'plain'}`]"
      :style="{ '--tree-depth': depth }"
      :aria-expanded="isFolder ? expanded : undefined"
      :disabled="!isFolder"
      @click="toggle"
    >
      <span class="package-tree-caret" :class="{ 'is-open': isFolder && expanded }">
        {{ isFolder ? '›' : '' }}
      </span>
      <svg v-if="isFolder" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3.5h8l4 4V20H6V3.5Z" />
        <path d="M14 3.5v4h4" />
      </svg>
      <span class="package-tree-name">{{ node.name }}</span>
      <span v-if="sourceLabel" class="package-tree-source" :class="`is-${node.source}`">
        {{ sourceLabel }}
      </span>
    </button>
    <ul v-if="isFolder && expanded && node.children?.length" class="package-tree-children">
      <ExtensionPackageTreeNode
        v-for="child in node.children"
        :key="`${node.name}-${child.name}-${child.source || ''}`"
        :node="child"
        :depth="depth + 1"
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
  min-height: 32px;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px calc(10px + var(--tree-depth) * 20px);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #344054;
  font: inherit;
  font-size: 12px;
  text-align: left;
}

.package-tree-row:not(:disabled) {
  cursor: pointer;
}

.package-tree-row:not(:disabled):hover {
  background: #f7f9fc;
}

.package-tree-row:disabled {
  opacity: 1;
}

.package-tree-row svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  fill: #eef2ff;
  stroke: #8492ad;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.package-tree-row.is-folder svg {
  fill: #fbbf24;
  stroke: #d49a00;
}

.package-tree-row.is-system.is-folder > .package-tree-name {
  font-weight: 700;
}

.package-tree-caret {
  display: inline-grid;
  width: 12px;
  flex: 0 0 auto;
  place-items: center;
  color: #98a2b3;
  font-size: 16px;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

.package-tree-caret.is-open {
  transform: rotate(90deg);
}

.package-tree-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.package-tree-source {
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 999px;
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

@media (prefers-reduced-motion: reduce) {
  .package-tree-caret {
    transition: none;
  }
}
</style>

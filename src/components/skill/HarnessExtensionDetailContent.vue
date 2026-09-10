<script setup lang="ts">
import { onBeforeUnmount, reactive } from 'vue';
import {
  queryHttpPlanningItemContent,
  queryHttpPlanningItemFiles,
} from '../../services/skillMarket/extensionPublishHttp';
import type {
  ExtensionCapability,
  ExtensionCapabilityType,
  ExtensionScene,
} from '../../services/skillMarket/extensionPublishMock';

const props = defineProps<{
  name: string;
  userId: string;
  capabilities: ExtensionScene['capabilities'];
}>();

type FileRow = {
  name: string;
  content: string;
  open: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
};
type CapabilityRow = {
  capability: ExtensionCapability;
  open: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
  files: FileRow[];
};

const types: ExtensionCapabilityType[] = ['skill', 'command', 'agent'];
function fileRow(name: string): FileRow {
  return { name, content: '', open: false, loaded: false, loading: false, error: '' };
}
// The parent remounts this tree when the selected asset/version is reloaded.
const sections = reactive(
  types.map((type) => ({
    type,
    label: `${type}s`,
    items: props.capabilities[type].map(
      (capability): CapabilityRow => ({
        capability,
        open: false,
        loaded: type !== 'skill',
        loading: false,
        error: '',
        files: capability.files.map((file) => fileRow(file.name)),
      }),
    ),
  })),
);
let active = true;
onBeforeUnmount(() => {
  active = false;
});

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadFiles(row: CapabilityRow): Promise<void> {
  if (row.loaded || row.loading) return;
  row.loading = true;
  row.error = '';
  try {
    const paths = await queryHttpPlanningItemFiles(props.userId, 'skill', row.capability);
    if (!active) return;
    row.files = paths.map(fileRow);
    row.loaded = true;
  } catch (error) {
    if (active) row.error = message(error, '目录加载失败');
  } finally {
    if (active) row.loading = false;
  }
}

async function toggleCapability(row: CapabilityRow): Promise<void> {
  row.open = !row.open;
  if (row.open) await loadFiles(row);
}

async function loadContent(
  type: ExtensionCapabilityType,
  row: CapabilityRow,
  file: FileRow,
): Promise<void> {
  if (file.loaded || file.loading) return;
  file.loading = true;
  file.error = '';
  try {
    const content = await queryHttpPlanningItemContent(
      props.userId,
      type,
      row.capability,
      file.name,
    );
    if (!active) return;
    file.content = content;
    file.loaded = true;
  } catch (error) {
    if (active) file.error = message(error, '文件内容加载失败');
  } finally {
    if (active) file.loading = false;
  }
}

async function toggleFile(
  type: ExtensionCapabilityType,
  row: CapabilityRow,
  file: FileRow,
): Promise<void> {
  file.open = !file.open;
  if (file.open) await loadContent(type, row, file);
}
</script>

<template>
  <div class="asset-extension-content">
    <strong><span aria-hidden="true">📁</span> {{ name }}/</strong>
    <div v-if="sections.every((section) => !section.items.length)" class="extension-empty">
      该版本在当前场景下暂无绑定组件
    </div>
    <section v-for="section in sections" v-else :key="section.type" :aria-label="section.label">
      <h3>{{ section.label }}</h3>
      <p v-if="!section.items.length" class="extension-empty">暂无 {{ section.label }}</p>
      <div
        v-for="(row, index) in section.items"
        :key="`${row.capability.id}:${index}`"
        class="extension-capability"
      >
        <button
          type="button"
          class="extension-tree-toggle"
          :aria-expanded="row.open"
          :disabled="!row.capability.name || !row.capability.version"
          @click="toggleCapability(row)"
        >
          <span aria-hidden="true">{{ row.open ? '▾' : '▸' }}</span>
          <span>{{ row.capability.name }}</span>
          <small>{{
            row.capability.version
              ? `v${row.capability.version.replace(/^v/i, '')}`
              : '暂无版本，无法查看'
          }}</small>
        </button>
        <div v-if="row.open" class="extension-files">
          <p v-if="row.loading" role="status">正在加载目录…</p>
          <div v-else-if="row.error" class="extension-error" role="alert">
            {{ row.error }}
            <button type="button" @click="loadFiles(row)">重新加载目录</button>
          </div>
          <p v-else-if="!row.files.length" class="extension-empty">暂无文件</p>
          <div v-for="file in row.files" :key="file.name" class="extension-file">
            <button
              type="button"
              class="extension-tree-toggle"
              :aria-expanded="file.open"
              @click="toggleFile(section.type, row, file)"
            >
              <span aria-hidden="true">{{ file.open ? '▾' : '▸' }} 📄</span>
              {{ file.name }}
            </button>
            <template v-if="file.open">
              <p v-if="file.loading" role="status">正在加载文件内容…</p>
              <div v-else-if="file.error" class="extension-error" role="alert">
                {{ file.error }}
                <button type="button" @click="loadContent(section.type, row, file)">
                  重新加载文件
                </button>
              </div>
              <pre v-else-if="file.loaded">{{ file.content || '暂无文件内容' }}</pre>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.asset-extension-content {
  padding: 20px;
  color: #334155;
  border: 1px solid #dce4ef;
  border-radius: 12px;
}
section {
  margin: 20px 0 0 16px;
}
h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.extension-capability {
  margin-top: 6px;
}
.extension-tree-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.extension-tree-toggle:hover {
  background: #f1f5f9;
}
.extension-tree-toggle:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.extension-tree-toggle:disabled {
  color: #94a3b8;
  cursor: default;
}
small,
.extension-empty {
  color: #64748b;
  font-size: 13px;
}
.extension-files {
  margin-left: 24px;
}
.extension-error {
  padding: 8px;
  color: #b91c1c;
}
.extension-error button {
  margin-left: 12px;
  cursor: pointer;
}
pre {
  margin: 8px 0 16px;
  padding: 16px;
  overflow: auto;
  border-radius: 8px;
  background: #f8fafc;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

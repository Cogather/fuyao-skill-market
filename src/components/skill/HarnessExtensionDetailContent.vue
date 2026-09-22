<script setup lang="ts">
import { onBeforeUnmount, reactive } from 'vue';
import {
  queryHttpPlanningItemContent,
  queryHttpPlanningItemFiles,
} from '../../services/skillMarket/extensionPublishHttp';
import type {
  ExtensionCapability,
  ExtensionCapabilityFile,
  ExtensionCapabilityType,
  ExtensionScene,
} from '../../services/skillMarket/extensionPublishMock';

const props = defineProps<{
  userId: string;
  capabilities: ExtensionScene['capabilities'];
}>();

type FileRow = ExtensionCapabilityFile & {
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

type SectionRow = {
  type: ExtensionCapabilityType;
  folder: string;
  label: string;
  iconSrc: string;
  open: boolean;
  items: CapabilityRow[];
};

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const extensionAssetBase = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}extension/`;
const extensionIconRevision = '20260814-1';
const sectionMeta: Array<Omit<SectionRow, 'open' | 'items'>> = [
  {
    type: 'skill',
    folder: 'skills',
    label: 'Skill',
    iconSrc: `${extensionAssetBase}skillIcon.png?v=${extensionIconRevision}`,
  },
  {
    type: 'command',
    folder: 'commands',
    label: 'Command',
    iconSrc: `${extensionAssetBase}commandIcon.png?v=${extensionIconRevision}`,
  },
  {
    type: 'agent',
    folder: 'agents',
    label: 'Agent',
    iconSrc: `${extensionAssetBase}agentIcon.png?v=${extensionIconRevision}`,
  },
];

function createFileRow(file: ExtensionCapabilityFile): FileRow {
  return {
    ...file,
    open: false,
    loaded: !transportIsHttp || file.content !== '',
    loading: false,
    error: '',
  };
}

// The parent remounts this tree whenever the selected asset or version changes.
const sections = reactive<SectionRow[]>(
  sectionMeta.map((section) => ({
    ...section,
    open: true,
    items: props.capabilities[section.type].map((capability) => ({
      capability,
      open: false,
      loaded: section.type !== 'skill' || !transportIsHttp || capability.files.length > 0,
      loading: false,
      error: '',
      files: capability.files.map(createFileRow),
    })),
  })),
);

let active = true;
onBeforeUnmount(() => {
  active = false;
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function displayVersion(version: string): string {
  return version.replace(/^v(?=\d)/i, '');
}

function toggleFolder(section: SectionRow): void {
  section.open = !section.open;
}

async function loadSkillFiles(row: CapabilityRow): Promise<void> {
  if (row.loaded || row.loading) return;
  if (!transportIsHttp) {
    row.loaded = true;
    return;
  }

  row.loading = true;
  row.error = '';
  try {
    const paths = await queryHttpPlanningItemFiles(props.userId, 'skill', row.capability);
    if (!active) return;
    row.files = paths.map((name) => createFileRow({ name, content: '' }));
    row.loaded = true;
  } catch (error) {
    if (active) row.error = errorMessage(error, '目录加载失败');
  } finally {
    if (active) row.loading = false;
  }
}

async function loadContent(
  type: ExtensionCapabilityType,
  row: CapabilityRow,
  file: FileRow,
): Promise<void> {
  if (file.loaded || file.loading) return;
  if (!transportIsHttp) {
    file.loaded = true;
    return;
  }

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
    if (active) file.error = errorMessage(error, '文件内容加载失败');
  } finally {
    if (active) file.loading = false;
  }
}

async function loadDirectFile(
  type: Exclude<ExtensionCapabilityType, 'skill'>,
  row: CapabilityRow,
): Promise<void> {
  if (!row.files[0]) {
    row.files = [createFileRow({ name: `${row.capability.name}.md`, content: '' })];
  }
  await loadContent(type, row, row.files[0]);
}

async function toggleCapability(type: ExtensionCapabilityType, row: CapabilityRow): Promise<void> {
  if (!row.capability.ready) return;
  row.open = !row.open;
  if (!row.open) return;
  if (type === 'skill') await loadSkillFiles(row);
  else await loadDirectFile(type, row);
}

async function toggleFile(row: CapabilityRow, file: FileRow): Promise<void> {
  file.open = !file.open;
  if (file.open) await loadContent('skill', row, file);
}
</script>

<template>
  <div class="asset-extension-content">
    <section v-for="section in sections" :key="section.type" class="capability-folder">
      <button
        type="button"
        class="folder-heading"
        :aria-expanded="section.open"
        @click="toggleFolder(section)"
      >
        <span class="folder-caret" :class="{ 'is-open': section.open }" aria-hidden="true">›</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z" />
        </svg>
        <strong>{{ section.folder }}/</strong>
        <span class="folder-count">{{ section.items.length }}</span>
      </button>

      <ul v-if="section.items.length" v-show="section.open" class="capability-list">
        <li
          v-for="(row, index) in section.items"
          :key="`${row.capability.id}:${index}`"
          class="capability-item"
        >
          <button
            type="button"
            class="capability-row"
            :class="{ 'is-open': row.open, 'is-disabled': !row.capability.ready }"
            :aria-expanded="row.open"
            :disabled="!row.capability.ready"
            @click="toggleCapability(section.type, row)"
          >
            <span class="capability-caret" aria-hidden="true">{{
              row.capability.ready ? '›' : '•'
            }}</span>
            <img class="capability-icon" :src="section.iconSrc" :alt="section.label" />
            <span
              class="capability-type-tag"
              :class="`capability-type-tag--${section.type}`"
            >
              {{ section.label }}
            </span>
            <span class="capability-name">{{ row.capability.name }}</span>
            <span v-if="row.capability.ready" class="capability-release-meta">
              <span class="capability-version">v{{ displayVersion(row.capability.version) }}</span>
              <time v-if="row.capability.publishDate">{{ row.capability.publishDate }}</time>
            </span>
            <span v-else class="unready-tag">未就绪</span>
          </button>

          <ul v-if="row.open" class="file-list">
            <li v-if="row.loading" class="folder-empty">正在加载目录…</li>
            <li v-else-if="row.error" class="folder-empty folder-empty--error">
              {{ row.error }}
              <button type="button" class="retry-button" @click="loadSkillFiles(row)">
                重新加载
              </button>
            </li>
            <template v-else-if="section.type === 'skill'">
              <li v-for="file in row.files" :key="file.name">
                <button
                  type="button"
                  class="file-row"
                  :class="{ 'is-open': file.open }"
                  :aria-expanded="file.open"
                  @click="toggleFile(row, file)"
                >
                  <span class="file-caret" aria-hidden="true">›</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3.5h8l4 4V20H6V3.5Z" />
                    <path d="M14 3.5v4h4" />
                  </svg>
                  <span class="file-name">{{ file.name }}</span>
                </button>
                <div v-if="file.open && file.error" class="file-error" role="alert">
                  {{ file.error }}
                  <button
                    type="button"
                    class="retry-button"
                    @click="loadContent('skill', row, file)"
                  >
                    重新加载
                  </button>
                </div>
                <pre v-else-if="file.open" class="file-content">{{
                  file.loading ? '正在加载…' : file.content || '(空)'
                }}</pre>
              </li>
              <li v-if="row.files.length === 0" class="folder-empty">暂无文件</li>
            </template>
            <li v-else-if="row.files[0]">
              <div v-if="row.files[0].error" class="file-error" role="alert">
                {{ row.files[0].error }}
                <button
                  type="button"
                  class="retry-button"
                  @click="loadContent(section.type, row, row.files[0])"
                >
                  重新加载
                </button>
              </div>
              <pre v-else class="file-content file-content--direct">{{
                row.files[0].loading ? '正在加载…' : row.files[0].content || '(空)'
              }}</pre>
            </li>
            <li v-else class="folder-empty">暂无文件</li>
          </ul>
        </li>
      </ul>
      <div v-else v-show="section.open" class="folder-empty">无</div>
    </section>
  </div>
</template>

<style scoped>
.asset-extension-content {
  padding: 16px 18px 26px;
  color: #334155;
}

.capability-folder + .capability-folder {
  margin-top: 15px;
}

.folder-heading {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid #e7ebf1;
  border-radius: 9px;
  background: #fafbfc;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.folder-heading:hover {
  border-color: #cedbf0;
  background: #f7faff;
}

.folder-heading:focus-visible,
.capability-row:focus-visible,
.file-row:focus-visible,
.retry-button:focus-visible {
  outline: 3px solid rgba(47, 125, 246, 0.18);
  outline-offset: 2px;
}

.folder-caret,
.capability-caret,
.file-caret {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  color: #98a2b3;
  line-height: 1;
  transition: transform 0.16s ease;
}

.folder-caret {
  width: 12px;
  font-size: 16px;
}

.folder-caret.is-open,
.capability-row.is-open .capability-caret,
.file-row.is-open .file-caret {
  transform: rotate(90deg);
}

.folder-heading svg {
  width: 18px;
  height: 18px;
  fill: #f5b526;
  stroke: #dd9d12;
  stroke-width: 1;
}

.folder-heading strong {
  flex: 1;
  color: #17233d;
  font-size: 13px;
}

.folder-count {
  width: fit-content;
  min-width: 0;
  padding: 1px 6px;
  border: 1px solid #e2e7ee;
  border-radius: 999px;
  background: #fff;
  color: #98a2b3;
  font-size: 9px;
  line-height: 1.2;
  text-align: center;
}

.capability-list,
.file-list {
  padding-left: 0;
  list-style: none;
}

.capability-list {
  margin: 0 0 0 24px;
  padding: 8px 0 0 17px;
  border-left: 1px dashed #dce4ee;
}

.capability-item + .capability-item {
  margin-top: 3px;
}

.capability-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #17233d;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.capability-row:hover:not(.is-disabled) {
  border-color: #e0e7f3;
  background: #f7faff;
}

.capability-row.is-disabled {
  cursor: default;
  opacity: 0.62;
}

.capability-caret {
  width: 14px;
  font-size: 17px;
}

.capability-icon {
  display: block;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: cover;
}

.capability-type-tag {
  display: inline-flex;
  min-height: 18px;
  flex: 0 0 auto;
  align-items: center;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
}

.capability-type-tag--skill {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.capability-type-tag--command {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #15803d;
}

.capability-type-tag--agent {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #7c3aed;
}

.capability-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-release-meta {
  display: inline-flex;
  min-height: 18px;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 8px;
  padding-block: 2px;
  line-height: 1.4;
  white-space: nowrap;
}

.capability-version {
  color: #16a34a;
  font-size: 11px;
  font-weight: 750;
}

.capability-release-meta time {
  color: #98a2b3;
  font-size: 10px;
}

.unready-tag {
  padding: 2px 7px;
  border: 1px solid #ffe0a3;
  border-radius: 5px;
  background: #fff3df;
  color: #b06a18;
  font-size: 9px;
  font-weight: 750;
}

.file-list {
  margin: 3px 0 7px 24px;
}

.file-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #667085;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.file-row:hover {
  background: #f6f9ff;
  color: #17233d;
}

.file-caret {
  width: 12px;
  font-size: 15px;
}

.file-row svg {
  width: 14px;
  height: 14px;
  fill: #eef2ff;
  stroke: #8f9bbb;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-content {
  max-height: 260px;
  margin: 4px 0 7px 21px;
  padding: 11px 13px;
  overflow: auto;
  border: 1px solid #e0e7f3;
  border-radius: 7px;
  background: #fbfcff;
  color: #17233d;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.file-content--direct {
  margin-left: 0;
}

.folder-empty,
.file-error {
  padding: 10px 14px 2px 42px;
  color: #98a2b3;
  font-size: 10px;
}

.folder-empty--error,
.file-error {
  color: #dc2626;
}

.file-error {
  margin: 4px 0 7px;
  padding: 10px 13px;
  border-radius: 7px;
  background: #fff7f7;
}

.retry-button {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  cursor: pointer;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { PlanningTaskCapabilityType } from '../../services/skillMarket/skillPlanningTaskService';
import {
  latestSkillMasterVersion,
  normalizeSkillMasterVersions,
  type SkillMasterRecord,
  type SkillMasterVersion,
} from '../../services/skillMarket/skillMasterManagementService';
import {
  queryPlanningTaskDetailFileContent,
  queryPlanningTaskDetailFilePaths,
  type PlanningTaskDetailIdentity,
} from '../../services/skillMarket/planningTaskDetailService';

type DetailFileState = {
  path: string;
  content: string;
  loaded: boolean;
  loading: boolean;
  error: string;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    record: SkillMasterRecord | null;
    userId?: string;
    capabilityType: PlanningTaskCapabilityType;
  }>(),
  {
    userId: '',
  },
);

const emit = defineEmits<{
  close: [];
}>();

const capabilityLabel = computed(() => {
  if (props.capabilityType === 'command') return 'Command';
  if (props.capabilityType === 'agent') return 'Agent';
  return 'Skill';
});

const capabilityLabelUpper = computed(() => capabilityLabel.value.toUpperCase());
const detailVersions = computed(() => normalizeSkillMasterVersions(props.record?.versions));
const selectedVersion = ref('');
const detailFiles = ref<DetailFileState[]>([]);
const detailLoading = ref(false);
const detailError = ref('');
const expandedDetailFilePath = ref('');
const detailCapabilityExpanded = ref(true);
let detailLoadSequence = 0;

const selectedVersionRecord = computed<SkillMasterVersion | null>(() => {
  return detailVersions.value.find((item) => item.version === selectedVersion.value) || null;
});

function formatUpdatedTime(value?: string): string {
  if (!value) return '—';
  const matched = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!matched) return value;
  return `${matched[1]}-${matched[2]}-${matched[3]} ${matched[4]}:${matched[5]}${
    matched[6] ? `:${matched[6]}` : ''
  }`;
}

function detailIdentity(filePath?: string): PlanningTaskDetailIdentity | null {
  if (!props.record || !selectedVersion.value) return null;
  return {
    userId: props.userId,
    capabilityType: props.capabilityType,
    capabilityName: props.record.name,
    version: selectedVersion.value,
    filePath,
  };
}

function resetDetailContent(): void {
  detailLoadSequence += 1;
  selectedVersion.value = '';
  detailFiles.value = [];
  detailLoading.value = false;
  detailError.value = '';
  expandedDetailFilePath.value = '';
  detailCapabilityExpanded.value = true;
}

async function loadDetailFile(file: DetailFileState): Promise<void> {
  if (file.loaded || file.loading) return;
  const identity = detailIdentity(file.path);
  if (!identity) return;

  file.loading = true;
  file.error = '';
  try {
    file.content = await queryPlanningTaskDetailFileContent(identity, file.path);
    file.loaded = true;
  } catch (error) {
    file.error = error instanceof Error ? error.message : '文件内容加载失败';
  } finally {
    file.loading = false;
  }
}

async function loadDetailVersion(): Promise<void> {
  const identity = detailIdentity();
  if (!identity) return;

  const sequence = ++detailLoadSequence;
  detailLoading.value = true;
  detailError.value = '';
  detailFiles.value = [];
  expandedDetailFilePath.value = '';
  detailCapabilityExpanded.value = true;

  try {
    const paths = await queryPlanningTaskDetailFilePaths(identity);
    if (sequence !== detailLoadSequence) return;

    detailFiles.value = paths.map((path) => ({
      path,
      content: '',
      loaded: false,
      loading: false,
      error: '',
    }));

    const firstFile = detailFiles.value[0];
    if (firstFile) {
      expandedDetailFilePath.value = firstFile.path;
      await loadDetailFile(firstFile);
    }
  } catch (error) {
    if (sequence !== detailLoadSequence) return;
    detailError.value = error instanceof Error ? error.message : '详情加载失败';
  } finally {
    if (sequence === detailLoadSequence) detailLoading.value = false;
  }
}

async function toggleDetailFile(file: DetailFileState): Promise<void> {
  if (expandedDetailFilePath.value === file.path) {
    expandedDetailFilePath.value = '';
    return;
  }
  expandedDetailFilePath.value = file.path;
  await loadDetailFile(file);
}

function closeDialog(): void {
  emit('close');
}

watch(
  [() => props.open, () => props.record],
  ([open, record]) => {
    resetDetailContent();
    if (!open || !record) return;

    selectedVersion.value =
      latestSkillMasterVersion(record)?.version || detailVersions.value[0]?.version || '';
    if (selectedVersion.value) void loadDetailVersion();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  detailLoadSequence += 1;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open && props.record" class="catalog-detail-overlay" @click.self="closeDialog">
      <div
        class="catalog-detail-dialog"
        :class="{ 'is-basic-only': detailVersions.length === 0 }"
        role="dialog"
        aria-modal="true"
        :aria-label="`${props.record.name} 详情`"
      >
        <header class="catalog-detail-header">
          <div class="catalog-detail-heading">
            <small>{{ capabilityLabelUpper }} DETAIL</small>
            <h3>{{ props.record.name }}</h3>
            <p>{{ props.record.description || `查看 ${capabilityLabel} 的版本与文件详情。` }}</p>
          </div>

          <div class="catalog-detail-meta">
            <div>
              <small>规划部门或产品</small>
              <strong>{{ props.record.product || props.record.department || props.record.level || '—' }}</strong>
            </div>
            <div>
              <small>负责人</small>
              <strong>{{ props.record.owner || '—' }}</strong>
            </div>
          </div>

          <div class="catalog-detail-actions">
            <span
              class="status-badge"
              :class="{
                'is-completed': props.record.status === '已完成',
                'is-progress': props.record.status === '进行中',
              }"
            >
              {{ props.record.status || '未开始' }}
            </span>
            <button type="button" class="catalog-detail-close" aria-label="关闭" @click="closeDialog">×</button>
          </div>
        </header>

        <label v-if="detailVersions.length" class="catalog-detail-version-filter">
          <span class="version-copy">
            <strong>版本</strong>
            <small>选择版本后展示对应的目录和文件内容</small>
          </span>
          <select v-model="selectedVersion" aria-label="详情版本" @change="loadDetailVersion">
            <option v-for="item in detailVersions" :key="item.version" :value="item.version">
              {{ item.version }}
            </option>
          </select>
          <span class="version-updated">
            <small>更新时间</small>
            <strong>{{ formatUpdatedTime(selectedVersionRecord?.uploadedAt) }}</strong>
          </span>
        </label>

        <section v-if="detailVersions.length" class="catalog-detail-capability">
          <button
            type="button"
            class="catalog-detail-capability-row"
            :aria-expanded="detailCapabilityExpanded"
            @click="detailCapabilityExpanded = !detailCapabilityExpanded"
          >
            <span class="catalog-detail-caret" :class="{ 'is-open': detailCapabilityExpanded }">›</span>
            <strong>{{ props.record.name }}</strong>
            <span>{{ selectedVersion }}</span>
          </button>

          <div v-if="detailCapabilityExpanded" class="catalog-detail-content">
            <p v-if="detailLoading" class="catalog-detail-state">正在加载详情...</p>
            <div v-else-if="detailError" class="catalog-detail-state is-error">
              <span>{{ detailError }}</span>
              <button type="button" @click="loadDetailVersion">重试</button>
            </div>
            <p v-else-if="detailFiles.length === 0" class="catalog-detail-state">暂无可展示的文件</p>

            <template v-else-if="props.capabilityType === 'skill'">
              <article v-for="file in detailFiles" :key="file.path" class="catalog-detail-file">
                <button
                  type="button"
                  class="catalog-detail-file-row"
                  :aria-expanded="expandedDetailFilePath === file.path"
                  @click="toggleDetailFile(file)"
                >
                  <span
                    class="catalog-detail-file-caret"
                    :class="{ 'is-open': expandedDetailFilePath === file.path }"
                  >›</span>
                  <span class="catalog-detail-file-icon">▧</span>
                  <span>{{ file.path }}</span>
                </button>
                <div v-if="expandedDetailFilePath === file.path" class="catalog-detail-file-content">
                  <p v-if="file.loading">正在加载文件内容...</p>
                  <div v-else-if="file.error" class="catalog-detail-state is-error">
                    <span>{{ file.error }}</span>
                    <button type="button" @click="loadDetailFile(file)">重试</button>
                  </div>
                  <pre v-else>{{ file.content }}</pre>
                </div>
              </article>
            </template>

            <div v-else class="catalog-detail-direct-content">
              <p v-if="detailFiles[0]?.loading">正在加载文件内容...</p>
              <div v-else-if="detailFiles[0]?.error" class="catalog-detail-state is-error">
                <span>{{ detailFiles[0].error }}</span>
                <button type="button" @click="loadDetailFile(detailFiles[0])">重试</button>
              </div>
              <pre v-else>{{ detailFiles[0]?.content }}</pre>
            </div>
          </div>
        </section>

        <footer v-if="detailVersions.length" class="catalog-detail-footer">
          <button type="button" @click="closeDialog">关闭</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.catalog-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(31, 42, 68, 0.46);
  backdrop-filter: blur(3px);
}

.catalog-detail-dialog {
  position: relative;
  display: flex;
  width: min(1040px, calc(100vw - 32px));
  height: min(820px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 22px 60px rgba(30, 45, 78, 0.28);
  color: #17233c;
}

.catalog-detail-dialog.is-basic-only {
  height: auto;
  min-height: 0;
}

.catalog-detail-header {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(320px, 0.9fr) auto;
  align-items: center;
  gap: 22px;
}

.catalog-detail-heading small {
  color: #4f6fe8;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.catalog-detail-heading h3 {
  margin: 8px 0 4px;
  font-size: 20px;
  line-height: 1.2;
}

.catalog-detail-heading p {
  margin: 0;
  color: #71809b;
  font-size: 11px;
  line-height: 1.5;
}

.catalog-detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.catalog-detail-meta > div {
  display: grid;
  gap: 5px;
  padding-left: 14px;
  border-left: 2px solid #e4eaf6;
}

.catalog-detail-meta small,
.version-updated small {
  color: #8794ab;
  font-size: 9px;
}

.catalog-detail-meta strong,
.version-updated strong {
  color: #31405e;
  font-size: 11px;
}

.catalog-detail-actions {
  display: flex;
  align-items: center;
  padding-right: 58px;
}

.catalog-detail-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f4f9;
  color: #70809d;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #dfe5ef;
  border-radius: 999px;
  background: #f2f4f8;
  color: #71809a;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.status-badge::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.status-badge.is-completed {
  border-color: #bce8ce;
  background: #ebfaf1;
  color: #25864f;
  box-shadow: 0 4px 12px rgba(47, 167, 98, 0.12);
}

.status-badge.is-progress {
  border-color: #c7d6ff;
  background: #eef3ff;
  color: #456bdc;
  box-shadow: 0 4px 12px rgba(70, 107, 220, 0.12);
}

.catalog-detail-version-filter {
  display: grid;
  grid-template-columns: minmax(190px, 0.7fr) minmax(280px, 1fr) minmax(210px, 0.55fr);
  align-items: center;
  gap: 12px;
  min-height: 62px;
  margin-top: 20px;
  padding: 8px 14px;
  border: 1px solid #dbe4f3;
  border-radius: 10px;
  background: #f7f9fd;
}

.version-copy,
.version-updated {
  display: grid;
  gap: 4px;
}

.version-copy strong {
  color: #31405e;
  font-size: 11px;
}

.version-copy small {
  color: #8996ad;
  font-size: 9px;
}

.catalog-detail-version-filter select {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #cbd8ee;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #33425f;
  font-size: 11px;
  font-weight: 800;
}

.catalog-detail-capability {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid #d9e2f1;
  border-radius: 10px;
  background: #fff;
}

.catalog-detail-capability-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 50px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid #e5ebf5;
  background: #fff;
  color: #25334f;
  text-align: left;
  cursor: pointer;
}

.catalog-detail-capability-row strong {
  font-size: 12px;
}

.catalog-detail-capability-row > span:last-child {
  color: #269548;
  font-size: 11px;
  font-weight: 900;
}

.catalog-detail-caret,
.catalog-detail-file-caret {
  display: inline-grid;
  place-items: center;
  color: #7185a8;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.18s ease;
}

.catalog-detail-caret.is-open,
.catalog-detail-file-caret.is-open {
  transform: rotate(90deg);
}

.catalog-detail-content {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px 16px 40px;
}

.catalog-detail-state {
  margin: 16px 0;
  color: #7b89a1;
  font-size: 11px;
}

.catalog-detail-state.is-error {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #c64a54;
}

.catalog-detail-state button {
  border: 1px solid #d5deee;
  border-radius: 6px;
  background: #fff;
  color: #52698f;
  cursor: pointer;
}

.catalog-detail-file + .catalog-detail-file {
  margin-top: 4px;
}

.catalog-detail-file-row {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #52627f;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.catalog-detail-file-row:hover,
.catalog-detail-file-row[aria-expanded='true'] {
  background: #f3f6fb;
}

.catalog-detail-file-caret {
  width: 12px;
  flex: 0 0 12px;
}

.catalog-detail-file-icon {
  color: #8094bd;
}

.catalog-detail-file-content,
.catalog-detail-direct-content {
  margin: 6px 0 10px 28px;
  overflow: auto;
  border: 1px solid #d6e0f0;
  border-radius: 8px;
  background: #fbfcff;
}

.catalog-detail-direct-content {
  margin: 0;
}

.catalog-detail-file-content pre,
.catalog-detail-direct-content pre {
  min-height: 210px;
  margin: 0;
  padding: 16px;
  color: #14213a;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.catalog-detail-file-content > p,
.catalog-detail-direct-content > p {
  margin: 0;
  padding: 16px;
  color: #7b89a1;
  font-size: 11px;
}

.catalog-detail-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 18px;
}

.catalog-detail-footer button {
  min-width: 52px;
  height: 34px;
  border: 1px solid #d4deee;
  border-radius: 7px;
  background: #fff;
  color: #31415f;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 900px) {
  .catalog-detail-dialog {
    padding: 18px;
  }

  .catalog-detail-header {
    grid-template-columns: 1fr;
    padding-right: 54px;
  }

  .catalog-detail-actions {
    position: absolute;
    top: 58px;
    right: 18px;
    padding-right: 0;
  }

  .catalog-detail-version-filter {
    grid-template-columns: 1fr;
  }
}
</style>

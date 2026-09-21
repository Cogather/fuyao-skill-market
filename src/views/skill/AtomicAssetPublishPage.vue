<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import {
  atomicAssetApiType,
  atomicAssetLatestVersion,
  canRetryAtomicPublish,
  publishAtomicAsset,
  queryAtomicAssetPublishHistory,
  queryAtomicPublishOrganizations,
  retryAtomicAssetPublish,
  type HarnessAtomicPublishHistoryRecord,
  type HarnessAtomicPublishResult,
} from '../../services/skillMarket/atomicAssetPublishHttp';
import {
  queryPlanningTaskDetailFileContent,
  queryPlanningTaskDetailFilePaths,
  type PlanningTaskDetailIdentity,
} from '../../services/skillMarket/planningTaskDetailService';
import type { PlanningTaskCapabilityType } from '../../services/skillMarket/skillPlanningTaskService';
import {
  normalizeHarnessAssetVersion,
  type HarnessAsset,
  type HarnessAssetOrganization,
} from '../../services/skillMarket/assetManagementTypes';

type AtomicPublishPanel = 'publish' | 'history';

type ChecklistFileState = {
  path: string;
  content: string;
  loaded: boolean;
  loading: boolean;
  error: string;
};

const props = withDefaults(
  defineProps<{
    asset: HarnessAsset;
    userId?: string;
    userName?: string;
    initialPanel?: AtomicPublishPanel;
    releaseChrome?: boolean;
  }>(),
  {
    userId: '',
    userName: '',
    initialPanel: 'publish',
    releaseChrome: true,
  },
);

const emit = defineEmits<{
  close: [];
  notify: [message: string];
  published: [result: HarnessAtomicPublishResult];
}>();

const activePanel = ref<AtomicPublishPanel>(props.initialPanel);
const organizations = ref<HarnessAssetOrganization[]>([]);
const selectedOrganizationCode = ref('');
const organizationLoading = ref(false);
const organizationError = ref('');
const publishSubmitting = ref(false);
const publishError = ref('');
const publishResult = ref<HarnessAtomicPublishResult | null>(null);
const historyBatchId = ref('');
const historyRecords = ref<HarnessAtomicPublishHistoryRecord[]>([]);
const historyTotal = ref(0);
const historyPageNum = ref(0);
const historyLoading = ref(false);
const historyError = ref('');
const retryingTaskId = ref('');
const historyPageSize = 20;
const checklistItemExpanded = ref(false);
const checklistDetailLoading = ref(false);
const checklistDetailError = ref('');
const checklistFiles = ref<ChecklistFileState[]>([]);
const expandedChecklistFilePaths = ref<string[]>([]);

const scopeLabel = computed(
  () =>
    props.asset.productName || props.asset.dimName || props.asset.departmentName || '未指定范围',
);
const scopeType = computed(
  () => props.asset.dimType || (props.asset.productName ? '产品级' : '部门级'),
);
const latestVersion = computed(() => props.asset.latestVersion?.trim() ?? '');
const versionLabel = computed(() => {
  const version = latestVersion.value;
  if (!version) return '暂无版本';
  return /^v/i.test(version) ? version : `v${version}`;
});
const historyHasMore = computed(() => historyRecords.value.length < historyTotal.value);
const historyRemaining = computed(() =>
  Math.max(historyTotal.value - historyRecords.value.length, 0),
);
const historyLoadedTotal = computed(() =>
  Math.max(historyTotal.value, historyRecords.value.length),
);
const historyBusy = computed(() => historyLoading.value || Boolean(retryingTaskId.value));
const historyLabel = computed(() => `${props.asset.assetType} 发布记录`);
const panelTitle = computed(() =>
  activePanel.value === 'publish'
    ? `${props.asset.assetType} 发布信息`
    : `${props.asset.assetType} 发布记录`,
);
const scenePrimaryLabel = computed(() => props.asset.firstScene?.trim() || '未提供一级场景');
const sceneSecondaryLabel = computed(() => props.asset.secondScene?.trim() || '未提供二级场景');
const checklistItems = computed(() => [
  {
    type: props.asset.assetType,
    name: props.asset.name,
    version: versionLabel.value,
  },
]);
const checklistCapabilityType = computed<PlanningTaskCapabilityType>(() => {
  switch (props.asset.assetType) {
    case 'Agent':
      return 'agent';
    case 'Command':
      return 'command';
    default:
      return 'skill';
  }
});

function checklistIdentity(): PlanningTaskDetailIdentity | null {
  const version =
    props.asset.currentVersion.trim() ||
    normalizeHarnessAssetVersion(props.asset.latestVersion ?? '');
  if (!version) return null;
  return {
    userId: props.userId,
    capabilityType: checklistCapabilityType.value,
    capabilityName: props.asset.name,
    version,
  };
}

async function loadChecklistFile(file: ChecklistFileState): Promise<void> {
  if (file.loaded || file.loading) return;
  const identity = checklistIdentity();
  if (!identity) return;

  file.loading = true;
  file.error = '';
  try {
    file.content = await queryPlanningTaskDetailFileContent(identity, file.path);
    file.loaded = true;
  } catch (error) {
    file.error = errorMessage(error, '文件内容加载失败');
  } finally {
    file.loading = false;
  }
}

async function loadChecklistFiles(): Promise<void> {
  const identity = checklistIdentity();
  if (!identity) {
    checklistDetailError.value = '当前资产没有可展示的版本文件';
    return;
  }
  if (checklistDetailLoading.value) return;
  checklistDetailLoading.value = true;
  checklistDetailError.value = '';
  try {
    const paths = await queryPlanningTaskDetailFilePaths(identity);
    checklistFiles.value = paths.map((path) => ({
      path,
      content: '',
      loaded: false,
      loading: false,
      error: '',
    }));
    expandedChecklistFilePaths.value = [];
    const firstFile = checklistFiles.value[0];
    if (firstFile && checklistCapabilityType.value === 'skill') {
      expandedChecklistFilePaths.value = [firstFile.path];
      await loadChecklistFile(firstFile);
    }
  } catch (error) {
    checklistDetailError.value = errorMessage(error, '资产文件目录加载失败');
  } finally {
    checklistDetailLoading.value = false;
  }
}

async function toggleChecklistItem(): Promise<void> {
  checklistItemExpanded.value = !checklistItemExpanded.value;
  if (
    checklistItemExpanded.value &&
    checklistFiles.value.length === 0 &&
    !checklistDetailLoading.value
  ) {
    await loadChecklistFiles();
  }
}

async function toggleChecklistFile(file: ChecklistFileState): Promise<void> {
  if (expandedChecklistFilePaths.value.includes(file.path)) {
    expandedChecklistFilePaths.value = expandedChecklistFilePaths.value.filter(
      (path) => path !== file.path,
    );
    return;
  }
  expandedChecklistFilePaths.value = [...expandedChecklistFilePaths.value, file.path];
  await loadChecklistFile(file);
}

// Agent / Command 资产进入发布页后直接展开「包含清单」并展示约定文件名；
// 文件内容仅在用户点击文件名后通过 /packages/file 按需加载。
async function autoExpandDirectAssetChecklist(): Promise<void> {
  if (checklistCapabilityType.value === 'skill') return;
  checklistItemExpanded.value = true;
  if (checklistFiles.value.length === 0 && !checklistDetailLoading.value) {
    await loadChecklistFiles();
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadOrganizations(): Promise<void> {
  if (organizationLoading.value) return;
  organizationLoading.value = true;
  organizationError.value = '';
  try {
    const next = await queryAtomicPublishOrganizations(props.asset, props.userId);
    organizations.value = next;
    if (!next.some((organization) => organization.id === selectedOrganizationCode.value)) {
      selectedOrganizationCode.value = next[0]?.id ?? '';
    }
    if (next.length === 0) organizationError.value = '当前资产没有可发布的目标组织';
  } catch (error) {
    organizations.value = [];
    selectedOrganizationCode.value = '';
    organizationError.value = errorMessage(error, '目标组织加载失败');
  } finally {
    organizationLoading.value = false;
  }
}

async function submitPublish(): Promise<void> {
  if (publishSubmitting.value) return;
  publishError.value = '';
  try {
    atomicAssetLatestVersion(props.asset);
    if (!selectedOrganizationCode.value) throw new Error('请选择目标组织');
    publishSubmitting.value = true;
    const result = await publishAtomicAsset({
      asset: props.asset,
      organizationCode: selectedOrganizationCode.value,
      userId: props.userId,
      userName: props.userName,
    });
    publishResult.value = result;
    if (result.accepted.length > 0) {
      historyBatchId.value = result.batchId;
      emit('published', result);
      emit('notify', '发布任务已提交，请在发布记录中查看异步执行进度');
      activePanel.value = 'history';
      await loadHistory(true);
    } else if (result.rejected.length > 0) {
      emit('notify', result.rejected[0]?.reason || '发布任务未被受理');
    }
  } catch (error) {
    publishError.value = errorMessage(error, '发布任务提交失败');
  } finally {
    publishSubmitting.value = false;
  }
}

type AtomicHistoryStatusClass = 'ok' | 'fail' | 'pending';

function historyStatusClass(status: string): AtomicHistoryStatusClass {
  if (status === '发布成功') return 'ok';
  if (status === '发布失败') return 'fail';
  return 'pending';
}

// 沿用组件内既有版本展示规则（资产信息区的 versionLabel）：缺少 v 前缀时补齐。
function historyVersionLabel(version: string): string {
  const value = version.trim();
  if (!value) return '—';
  return /^v/i.test(value) ? value : `v${value}`;
}

function historyOperatorLabel(record: HarnessAtomicPublishHistoryRecord): string {
  return `用户：${record.operatorName.trim() || '—'}（${record.operatorId.trim() || '—'}）`;
}

function historyCreatedAtLabel(record: HarnessAtomicPublishHistoryRecord): string {
  return `时间：${record.createdAt.trim() || '—'}`;
}

function historyOrganizationLabel(record: HarnessAtomicPublishHistoryRecord): string {
  return `组织：${record.targetOrgName.trim() || '—'}（${record.targetOrgCode.trim() || '—'}）`;
}

function historyQuery(pageNum: number) {
  return historyBatchId.value
    ? { batchId: historyBatchId.value, pageNum, pageSize: historyPageSize }
    : {
        assetType: atomicAssetApiType(props.asset.assetType),
        assetName: props.asset.name,
        pageNum,
        pageSize: historyPageSize,
      };
}

async function loadHistory(reset = false): Promise<void> {
  if (historyLoading.value) return;
  const pageNum = reset ? 1 : historyPageNum.value + 1;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const result = await queryAtomicAssetPublishHistory(historyQuery(pageNum));
    historyRecords.value = reset ? result.records : [...historyRecords.value, ...result.records];
    historyTotal.value = result.total;
    historyPageNum.value = result.pageNum;
  } catch (error) {
    historyError.value = errorMessage(error, '发布历史加载失败');
  } finally {
    historyLoading.value = false;
  }
}

async function showHistory(): Promise<void> {
  activePanel.value = 'history';
  if (historyPageNum.value === 0 && !historyLoading.value) await loadHistory(true);
}

async function showPublish(): Promise<void> {
  activePanel.value = 'publish';
  if (organizations.value.length === 0 && !organizationLoading.value) await loadOrganizations();
  await autoExpandDirectAssetChecklist();
}

async function retryRecord(record: HarnessAtomicPublishHistoryRecord): Promise<void> {
  if (!canRetryAtomicPublish(record) || historyBusy.value) return;
  retryingTaskId.value = record.id;
  historyError.value = '';
  try {
    await retryAtomicAssetPublish(record.id, props.userId);
    emit('notify', '重试任务已提交，请稍后刷新查看进度');
    await loadHistory(true);
  } catch (error) {
    historyError.value = errorMessage(error, '发布任务重试失败');
  } finally {
    retryingTaskId.value = '';
  }
}

onMounted(() => {
  if (activePanel.value === 'history') void loadHistory(true);
  else {
    void loadOrganizations();
    void autoExpandDirectAssetChecklist();
  }
});
</script>

<template>
  <section
    class="atomic-publish-page"
    :class="{ 'is-embedded': !releaseChrome }"
    role="region"
    :aria-label="`发布 ${asset.assetType} · ${asset.name}`"
  >
    <button v-if="releaseChrome" type="button" class="atomic-publish__back" @click="emit('close')">
      <span aria-hidden="true">←</span> 返回
    </button>

    <header v-if="releaseChrome" class="atomic-publish__heading">
      <h2>发布</h2>
      <span class="atomic-publish__type" :class="`is-${asset.assetType.toLocaleLowerCase()}`">
        {{ asset.assetType }}
      </span>
    </header>

    <article class="atomic-publish__panel">
      <header v-if="releaseChrome" class="atomic-publish__panel-header">
        <h3 class="atomic-publish__panel-title">{{ panelTitle }}</h3>
        <div class="atomic-publish__tabs">
          <button
            type="button"
            :class="{ 'is-active': activePanel === 'publish' }"
            @click="showPublish"
          >
            发布信息
          </button>
          <button
            type="button"
            :class="{ 'is-active': activePanel === 'history' }"
            @click="showHistory"
          >
            发布记录
          </button>
        </div>
      </header>

      <div v-if="publishResult" class="atomic-publish__result" role="status" aria-label="提交结果">
        <div v-if="publishResult.accepted.length" class="is-accepted">
          <strong>发布任务已受理</strong>
          <span>任务正在异步执行，请通过发布记录查看最终状态。</span>
          <ul>
            <li v-for="item in publishResult.accepted" :key="item.taskId">
              {{ item.assetName }} {{ item.assetVersion }}
            </li>
          </ul>
        </div>
        <div v-if="publishResult.rejected.length" class="is-rejected">
          <strong>未受理项</strong>
          <ul>
            <li
              v-for="item in publishResult.rejected"
              :key="`${item.assetType}:${item.assetName}:${item.assetVersion}`"
            >
              {{ item.assetName }}：{{ item.reason }}
            </li>
          </ul>
        </div>
      </div>

      <template v-if="activePanel === 'publish'">
        <div class="atomic-publish__body">
          <section class="atomic-publish__overview" aria-label="资产信息">
            <div class="atomic-publish__identity">
              <span
                class="atomic-publish__icon"
                :class="`is-${asset.assetType.toLocaleLowerCase()}`"
                aria-hidden="true"
              >
                {{ asset.assetType.charAt(0) }}
              </span>
              <div class="atomic-publish__intro">
                <div class="atomic-publish__title-row">
                  <h4>{{ asset.name }}</h4>
                  <span class="atomic-publish__version">{{ versionLabel }}</span>
                </div>
                <p class="atomic-publish__description">{{ asset.description || '暂无描述' }}</p>
              </div>
            </div>

            <dl class="atomic-publish__metadata">
              <div class="atomic-publish__dimension">
                <dt>归属于</dt>
                <dd>
                  <div class="atomic-publish__dimension-name">
                    <span class="atomic-publish__scope-tag">{{ scopeType }}</span>
                    <strong>{{ scopeLabel }}</strong>
                  </div>
                </dd>
              </div>
              <div>
                <dt>所属场景</dt>
                <dd class="atomic-publish__scene">
                  <span>{{ scenePrimaryLabel }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                  <strong>{{ sceneSecondaryLabel }}</strong>
                </dd>
              </div>
            </dl>
          </section>

          <label class="atomic-publish__field">
            <span>目标组织 <em>*</em></span>
            <select
              v-model="selectedOrganizationCode"
              aria-label="目标组织"
              :disabled="organizationLoading || publishSubmitting"
            >
              <option value="">
                {{ organizationLoading ? '正在加载目标组织…' : '请选择目标组织' }}
              </option>
              <option
                v-for="organization in organizations"
                :key="organization.id"
                :value="organization.id"
              >
                {{ organization.name }}
              </option>
            </select>
          </label>
          <div v-if="organizationError" class="atomic-publish__error" role="alert">
            <span>{{ organizationError }}</span>
            <button type="button" :disabled="organizationLoading" @click="loadOrganizations">
              重新加载
            </button>
          </div>
          <div v-if="publishError" class="atomic-publish__error" role="alert">
            {{ publishError }}
          </div>

          <div class="atomic-publish__field atomic-publish__checklist-field">
            <span>包含清单（{{ checklistItems.length }} 项）</span>
            <div class="atomic-publish__summary">
              <section class="atomic-publish__folder">
                <ul class="atomic-publish__checklist">
                  <li
                    v-for="item in checklistItems"
                    :key="`${item.type}:${item.name}`"
                    class="atomic-publish__checklist-item"
                  >
                    <button
                      type="button"
                      class="atomic-publish__checklist-row"
                      :aria-expanded="checklistItemExpanded"
                      @click="toggleChecklistItem"
                    >
                      <span
                        class="atomic-publish__checklist-caret"
                        :class="{ 'is-open': checklistItemExpanded }"
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="m9 5 7 7-7 7" />
                        </svg>
                      </span>
                      <span
                        class="atomic-publish__type-tag"
                        :class="`is-${item.type.toLocaleLowerCase()}`"
                      >
                        {{ item.type }}
                      </span>
                      <span class="atomic-publish__checklist-name">{{ item.name }}</span>
                      <span class="atomic-publish__checklist-version">{{ item.version }}</span>
                    </button>

                    <div v-if="checklistItemExpanded" class="atomic-publish__checklist-detail">
                      <p v-if="checklistDetailLoading" class="atomic-publish__file-state">
                        正在加载文件目录…
                      </p>
                      <div
                        v-else-if="checklistDetailError"
                        class="atomic-publish__file-state is-error"
                      >
                        <span>{{ checklistDetailError }}</span>
                        <button type="button" @click="loadChecklistFiles">重试</button>
                      </div>
                      <p v-else-if="checklistFiles.length === 0" class="atomic-publish__file-state">
                        暂无可展示的文件
                      </p>

                      <template v-else>
                        <article
                          v-for="file in checklistFiles"
                          :key="file.path"
                          class="atomic-publish__file"
                        >
                          <button
                            type="button"
                            class="atomic-publish__file-row"
                            :aria-expanded="expandedChecklistFilePaths.includes(file.path)"
                            @click="toggleChecklistFile(file)"
                          >
                            <span
                              class="atomic-publish__file-caret"
                              :class="{
                                'is-open': expandedChecklistFilePaths.includes(file.path),
                              }"
                              aria-hidden="true"
                            >
                              <svg viewBox="0 0 24 24" fill="none">
                                <path d="m9 5 7 7-7 7" />
                              </svg>
                            </span>
                            <span class="atomic-publish__file-icon" aria-hidden="true">▧</span>
                            <span>{{ file.path }}</span>
                          </button>
                          <div
                            v-if="expandedChecklistFilePaths.includes(file.path)"
                            :class="
                              checklistCapabilityType === 'skill'
                                ? 'atomic-publish__file-content'
                                : 'atomic-publish__direct-content'
                            "
                          >
                            <p v-if="file.loading">正在加载文件内容…</p>
                            <div v-else-if="file.error" class="atomic-publish__file-state is-error">
                              <span>{{ file.error }}</span>
                              <button type="button" @click="loadChecklistFile(file)">重试</button>
                            </div>
                            <pre v-else>{{ file.content }}</pre>
                          </div>
                        </article>
                      </template>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>

        <footer class="atomic-publish__footer">
          <button
            v-if="releaseChrome"
            type="button"
            class="atomic-publish__button is-secondary"
            :disabled="publishSubmitting"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="atomic-publish__button is-primary"
            :disabled="
              publishSubmitting ||
              organizationLoading ||
              !selectedOrganizationCode ||
              !latestVersion
            "
            @click="submitPublish"
          >
            {{ publishSubmitting ? '提交中…' : '确认发布' }}
          </button>
        </footer>
      </template>

      <section v-else class="atomic-history" role="region" :aria-label="historyLabel">
        <div class="atomic-history__toolbar">
          <div>
            <strong>发布记录</strong>
            <span v-if="historyBatchId">本次提交：{{ historyBatchId }}</span>
            <span v-if="historyLoading" class="atomic-history__loading" role="status">
              正在加载…
            </span>
          </div>
          <button
            type="button"
            class="atomic-publish__button is-secondary"
            :aria-busy="historyLoading"
            :disabled="historyBusy"
            @click="loadHistory(true)"
          >
            重新加载
          </button>
        </div>

        <div v-if="historyError" class="atomic-publish__error atomic-history__error" role="alert">
          <span>{{ historyError }}</span>
          <button type="button" :disabled="historyBusy" @click="loadHistory(true)">重新加载</button>
        </div>
        <div
          v-if="historyLoading && historyRecords.length === 0"
          class="atomic-history__empty"
          role="status"
        >
          正在加载发布记录…
        </div>
        <div v-else-if="!historyError && historyRecords.length === 0" class="atomic-history__empty">
          暂无发布记录
        </div>
        <div v-else class="atomic-timeline" :aria-busy="historyLoading">
          <article
            v-for="record in historyRecords"
            :key="record.id"
            class="atomic-timeline__item"
            :class="`is-${historyStatusClass(record.publishStatus)}`"
          >
            <i class="atomic-timeline__dot" aria-hidden="true"></i>
            <div class="atomic-timeline__card">
              <header class="atomic-timeline__head">
                <strong class="atomic-timeline__version">
                  {{ historyVersionLabel(record.assetVersion) }}
                </strong>
                <span v-if="record.source" class="atomic-timeline__source">{{
                  record.source
                }}</span>
                <b class="atomic-timeline__name">{{ record.assetName }}</b>
                <span
                  class="atomic-timeline__status"
                  :class="`is-${historyStatusClass(record.publishStatus)}`"
                >
                  {{ record.publishStatus }}
                </span>
              </header>
              <div class="atomic-timeline__body">
                <div
                  v-if="record.publishStatus === '发布失败' && record.errorMessage"
                  class="atomic-timeline__failure"
                >
                  <strong>失败原因</strong>
                  <span>{{ record.errorMessage }}</span>
                </div>
                <footer class="atomic-timeline__meta">
                  <span>{{ historyOperatorLabel(record) }}</span>
                  <span>{{ historyCreatedAtLabel(record) }}</span>
                  <span>{{ historyOrganizationLabel(record) }}</span>
                </footer>
                <div v-if="canRetryAtomicPublish(record)" class="atomic-timeline__actions">
                  <button
                    type="button"
                    class="atomic-publish__button is-secondary is-compact"
                    :aria-label="`重试发布：${record.assetName}`"
                    :aria-busy="retryingTaskId === record.id"
                    :disabled="historyBusy"
                    @click="retryRecord(record)"
                  >
                    {{ retryingTaskId === record.id ? '重试中…' : '↻ 重试发布' }}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-if="!historyError && historyHasMore" class="atomic-history__more">
          <button
            type="button"
            class="atomic-publish__button is-secondary is-compact"
            :aria-busy="historyLoading"
            :disabled="historyBusy"
            @click="loadHistory(false)"
          >
            加载更多（剩余 {{ historyRemaining }} 条）
          </button>
        </div>
        <p v-else-if="!historyError && historyRecords.length > 0" class="atomic-history__end">
          已全部加载 · 共 {{ historyLoadedTotal }} 条
        </p>
      </section>
    </article>
  </section>
</template>

<style scoped>
.atomic-publish-page {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 0;
  color: #18233b;
}

.atomic-publish-page.is-embedded {
  display: block;
  height: auto;
}

.atomic-publish__back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}

.atomic-publish__back:hover,
.atomic-publish__back:focus-visible {
  outline: none;
  color: #2864ec;
}

.atomic-publish__heading {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.atomic-publish__heading h2 {
  min-width: 0;
  margin: 0;
  color: #111827;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.atomic-publish__type {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: #efeaff;
  color: #7657dc;
  font-size: 11px;
}

.atomic-publish__type.is-skill {
  background: #e9f1ff;
  color: #3878df;
}

.atomic-publish__type.is-command {
  background: #e7f8f0;
  color: #24865f;
}

.atomic-publish__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.is-embedded .atomic-publish__panel {
  border: 0;
  border-radius: 0;
}

.atomic-publish__panel-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #e4e7ec;
}

.atomic-publish__panel-title {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 850;
}

.atomic-publish__tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.atomic-publish__tabs button {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #66728a;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.atomic-publish__tabs button:hover {
  color: #245fdf;
}

.atomic-publish__tabs button.is-active {
  border-color: #dbe5f2;
  background: #f4f7fc;
  color: #245fdf;
  font-weight: 600;
}

.atomic-publish__result {
  display: grid;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid #edf0f6;
  background: #f7f9ff;
  font-size: 13px;
}

.atomic-publish__result > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.atomic-publish__result ul {
  width: 100%;
  margin: 0;
  padding-left: 20px;
}

.atomic-publish__result .is-accepted strong {
  color: #21835a;
}

.atomic-publish__result .is-rejected strong,
.atomic-publish__result .is-rejected li {
  color: #c54747;
}

.atomic-publish__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
  scrollbar-gutter: stable;
}

.atomic-publish__overview {
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid #e2e8f4;
  border-radius: 12px;
  background: linear-gradient(115deg, #f5f8ff 0%, #fafbff 55%, #fff 100%);
}

.atomic-publish__identity {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.atomic-publish__icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 700;
}

.atomic-publish__icon.is-agent {
  background: linear-gradient(135deg, #7c5cf0, #9d7bfa);
}

.atomic-publish__icon.is-skill {
  background: linear-gradient(135deg, #2f7df6, #5fa2ff);
}

.atomic-publish__icon.is-command {
  background: linear-gradient(135deg, #18a66a, #3fc88e);
}

.atomic-publish__intro {
  min-width: 0;
  flex: 1;
}

.atomic-publish__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.atomic-publish__title-row h4 {
  margin: 0;
  color: #17233d;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.atomic-publish__version {
  flex-shrink: 0;
  padding: 2px 9px;
  border: 1px solid #cfe8db;
  border-radius: 999px;
  background: #f0faf5;
  color: #16a34a;
  font-size: 12px;
  font-weight: 750;
  line-height: 20px;
}

.atomic-publish__description {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.atomic-publish__metadata {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  margin: 22px 0 0;
  padding-top: 20px;
  border-top: 1px solid #e3e9f4;
}

.atomic-publish__metadata > div {
  min-width: 0;
}

.atomic-publish__metadata > div + div {
  padding-left: 24px;
  border-left: 1px solid #e3e9f4;
}

.atomic-publish__metadata dt {
  margin-bottom: 9px;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

.atomic-publish__metadata dd {
  margin: 0;
  color: #34435c;
  font-size: 13px;
  line-height: 22px;
  overflow-wrap: anywhere;
}

.atomic-publish__metadata strong {
  min-width: 0;
  font-weight: 600;
}

.atomic-publish__dimension-name,
.atomic-publish__scene {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.atomic-publish__scope-tag {
  flex-shrink: 0;
  padding: 0 7px;
  border: 1px solid #dbe5f6;
  border-radius: 5px;
  background: #fff;
  color: #486591;
  font-size: 11px;
  font-weight: 500;
  line-height: 20px;
}

.atomic-publish__scene svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  stroke: #94a3b8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.atomic-publish__field {
  display: grid;
  gap: 6px;
  margin-bottom: 13px;
}

.atomic-publish__field > span {
  color: #52647d;
  font-size: 12px;
  font-weight: 800;
}

.atomic-publish__field em {
  color: #dc2626;
  font-style: normal;
}

.atomic-publish__field select {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid #dfe4ec;
  border-radius: 7px;
  outline: 0;
  background: #fff;
  color: #17233d;
  font: inherit;
  font-size: 12px;
}

.atomic-publish__field select:focus {
  border-color: #5b8ff9;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.13);
}

.atomic-publish__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff1f1;
  color: #b83b3b;
  font-size: 13px;
}

.atomic-publish__error button {
  border: 0;
  background: transparent;
  color: #a62f2f;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.atomic-publish__checklist-field {
  margin-bottom: 0;
}

.atomic-publish__summary {
  padding: 12px 14px 14px;
  border: 1px solid #e1e6ee;
  border-radius: 9px;
  background: #fbfcff;
}

.atomic-publish__checklist {
  margin: 0;
  padding: 0;
  list-style: none;
}

.atomic-publish__checklist-item {
  min-width: 0;
}

.atomic-publish__checklist-row {
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

.atomic-publish__checklist-row:hover,
.atomic-publish__checklist-row[aria-expanded='true'] {
  border-color: #e0e7f3;
  background: #f7faff;
}

/* 箭头用固定尺寸 SVG：文字字形 › 的墨迹贴着基线（约 0.32em），行框居中后会整体偏低约 5px，
   换成 SVG 才能与类型标签、名称在同一水平线上严格居中。 */
.atomic-publish__checklist-caret {
  display: inline-flex;
  width: 14px;
  height: 17px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #98a2b3;
  transition: transform 0.16s ease;
}

.atomic-publish__checklist-caret svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.atomic-publish__checklist-caret.is-open {
  transform: rotate(90deg);
}

.atomic-publish__checklist-detail {
  min-width: 0;
  padding: 10px 0 4px;
}

.atomic-publish__file + .atomic-publish__file {
  margin-top: 4px;
}

.atomic-publish__file-row {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #52627f;
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.atomic-publish__file-row:hover,
.atomic-publish__file-row[aria-expanded='true'] {
  background: #f3f6fb;
}

.atomic-publish__file-caret {
  display: inline-flex;
  width: 12px;
  height: 16px;
  flex: 0 0 12px;
  align-items: center;
  justify-content: center;
  color: #7185a8;
  transition: transform 0.18s ease;
}

.atomic-publish__file-caret svg {
  width: 11px;
  height: 11px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.atomic-publish__file-caret.is-open {
  transform: rotate(90deg);
}

.atomic-publish__file-icon {
  color: #8094bd;
}

.atomic-publish__file-row > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atomic-publish__file-content,
.atomic-publish__direct-content {
  margin: 6px 0 10px 10px;
  overflow: auto;
  border: 1px solid #d6e0f0;
  border-radius: 8px;
  background: #fbfcff;
}

.atomic-publish__direct-content {
  margin: 6px 0 0 10px;
}

.atomic-publish__file-content pre,
.atomic-publish__direct-content pre {
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

.atomic-publish__file-content > p,
.atomic-publish__direct-content > p {
  margin: 0;
  padding: 16px;
  color: #7b89a1;
  font-size: 11px;
}

.atomic-publish__file-state {
  margin: 8px 0;
  color: #7b89a1;
  font-size: 11px;
}

.atomic-publish__file-state.is-error {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #c64a54;
}

.atomic-publish__file-state button {
  border: 1px solid #d5deee;
  border-radius: 6px;
  background: #fff;
  color: #52698f;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.atomic-publish__type-tag {
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

.atomic-publish__type-tag.is-agent {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #7c3aed;
}

.atomic-publish__type-tag.is-skill {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.atomic-publish__type-tag.is-command {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #15803d;
}

.atomic-publish__checklist-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atomic-publish__checklist-version {
  color: #16a34a;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.atomic-publish__footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #e4e7ec;
  background: #fafbfd;
}

.atomic-publish__button {
  min-width: 92px;
  min-height: 34px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.atomic-publish__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.atomic-publish__button.is-secondary {
  border-color: #d9deea;
  background: #fff;
  color: #566178;
}

.atomic-publish__button.is-primary {
  background: #316cf4;
  color: #fff;
}

.atomic-publish__button.is-compact {
  min-width: 0;
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.atomic-history {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 22px;
}

.atomic-history__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.atomic-history__toolbar > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.atomic-history__toolbar span {
  color: #7c879d;
  font-size: 12px;
}

.atomic-history__toolbar .atomic-history__loading {
  color: #3f6fd8;
}

.atomic-history__error {
  margin-top: 14px;
}

.atomic-timeline {
  position: relative;
  margin-top: 14px;
  padding-left: 6px;
}

.atomic-timeline::before {
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 10px;
  width: 2px;
  border-radius: 99px;
  background: linear-gradient(180deg, #2f7df6, #cbd2dc);
  content: '';
}

.atomic-timeline__item {
  position: relative;
  padding-left: 30px;
}

.atomic-timeline__item + .atomic-timeline__item {
  margin-top: 12px;
}

.atomic-timeline__dot {
  position: absolute;
  top: 11px;
  /* 轴线在 .atomic-timeline 的 left:10px（宽 2px，中心 11px）；条目自身起点为 6px，
     故圆点 left:0 时 10px 直径正好居中压在轴线上。 */
  left: 0;
  z-index: 1;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 0 0 3px #fff;
}

.atomic-timeline__item.is-ok .atomic-timeline__dot {
  background: #16a34a;
}

.atomic-timeline__item.is-fail .atomic-timeline__dot {
  background: #dc2626;
}

.atomic-timeline__item.is-pending .atomic-timeline__dot {
  background: #f59e0b;
}

.atomic-timeline__card {
  overflow: hidden;
  border: 1px solid #e1e6ee;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 1px 6px rgba(16, 24, 40, 0.05);
}

.atomic-timeline__item.is-fail .atomic-timeline__card {
  border-color: #fecaca;
}

.atomic-timeline__item.is-pending .atomic-timeline__card {
  border-color: #ffe0a3;
  background: linear-gradient(180deg, #fffbeb, #fff);
}

.atomic-timeline__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #edf0f4;
  background: #f7f8fa;
}

.atomic-timeline__version {
  flex-shrink: 0;
  color: #101828;
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
  white-space: nowrap;
}

.atomic-timeline__source {
  display: inline-flex;
  height: 20px;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 7px;
  border-radius: 5px;
  background: #eef1f6;
  color: #667085;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.atomic-timeline__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #17233d;
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atomic-timeline__status {
  flex: 0 0 auto;
  padding: 3px 9px;
  border-radius: 999px;
  background: #eef2f7;
  color: #65728b;
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
}

.atomic-timeline__status.is-ok {
  background: #eaf8f1;
  color: #27815d;
}

.atomic-timeline__status.is-fail {
  background: #fee2e2;
  color: #b91c1c;
}

.atomic-timeline__status.is-pending {
  background: #fff3df;
  color: #b06a18;
}

.atomic-timeline__body {
  padding: 12px 14px;
}

.atomic-timeline__failure {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #fecaca;
  border-left: 3px solid #dc2626;
  border-radius: 6px;
  background: #fef2f2;
  color: #7f1d1d;
  font-size: 12px;
  line-height: 1.5;
}

.atomic-timeline__failure strong {
  color: #b91c1c;
  font-size: 11px;
  font-weight: 800;
}

.atomic-timeline__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding-top: 8px;
  border-top: 1px dashed #e7ebf1;
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.6;
}

.atomic-timeline__actions {
  margin-top: 10px;
}

.atomic-history__empty {
  padding: 50px 20px;
  color: #8993a7;
  text-align: center;
}

.atomic-history__more {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.atomic-history__end {
  margin: 14px 0 0;
  color: #98a2b3;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 820px) {
  .atomic-publish__metadata {
    grid-template-columns: 1fr;
  }

  .atomic-publish__metadata > div + div {
    padding-left: 0;
    border-left: 0;
  }
}
</style>

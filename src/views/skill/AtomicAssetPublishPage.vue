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
import type {
  HarnessAsset,
  HarnessAssetOrganization,
} from '../../services/skillMarket/assetManagementTypes';

type AtomicPublishPanel = 'publish' | 'history';

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
const historyLabel = computed(() => `${props.asset.assetType} 发布记录`);

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
}

async function retryRecord(record: HarnessAtomicPublishHistoryRecord): Promise<void> {
  if (!canRetryAtomicPublish(record) || retryingTaskId.value) return;
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
  else void loadOrganizations();
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
      <div>
        <h2>发布 {{ asset.assetType }}</h2>
        <p>提交后会异步执行；任务受理不代表发布已经成功。</p>
      </div>
      <span class="atomic-publish__type" :class="`is-${asset.assetType.toLocaleLowerCase()}`">
        {{ asset.assetType }}
      </span>
    </header>

    <article class="atomic-publish__panel">
      <header v-if="releaseChrome" class="atomic-publish__panel-header">
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
              <div>
                <h4>{{ asset.name }}</h4>
                <p>{{ asset.description || '暂无描述' }}</p>
              </div>
            </div>

            <dl class="atomic-publish__metadata">
              <div>
                <dt>发布版本</dt>
                <dd>{{ versionLabel }}</dd>
              </div>
              <div>
                <dt>归属范围</dt>
                <dd>
                  <span class="atomic-publish__scope-tag">{{ scopeType }}</span>
                  {{ scopeLabel }}
                </dd>
              </div>
              <div>
                <dt>当前状态</dt>
                <dd>{{ asset.status || '—' }}</dd>
              </div>
            </dl>
          </section>

          <label class="atomic-publish__field">
            <span>目标组织</span>
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
          </div>
          <button
            type="button"
            class="atomic-publish__button is-secondary"
            :disabled="historyLoading || Boolean(retryingTaskId)"
            @click="loadHistory(true)"
          >
            刷新
          </button>
        </div>

        <div v-if="historyError" class="atomic-publish__error" role="alert">
          <span>{{ historyError }}</span>
          <button type="button" :disabled="historyLoading" @click="loadHistory(true)">
            重新加载
          </button>
        </div>
        <div v-if="historyLoading && historyRecords.length === 0" class="atomic-history__empty">
          正在加载发布记录…
        </div>
        <div v-else-if="historyRecords.length === 0" class="atomic-history__empty">
          暂无发布记录
        </div>
        <div v-else class="atomic-history__list">
          <article v-for="record in historyRecords" :key="record.id" class="atomic-history__item">
            <div class="atomic-history__item-heading">
              <div>
                <strong>{{ record.assetName }}</strong>
                <span>{{ record.assetVersion }}</span>
              </div>
              <span class="atomic-history__status" :class="`is-${record.publishStatus}`">
                {{ record.publishStatus }}
              </span>
            </div>
            <dl>
              <div>
                <dt>来源</dt>
                <dd>{{ record.source || '—' }}</dd>
              </div>
              <div>
                <dt>目标组织</dt>
                <dd>{{ record.targetOrgName || record.targetOrgCode || '—' }}</dd>
              </div>
              <div>
                <dt>发布人</dt>
                <dd>{{ record.operatorName || record.operatorId || '—' }}</dd>
              </div>
              <div>
                <dt>提交时间</dt>
                <dd>{{ record.createdAt || '—' }}</dd>
              </div>
            </dl>
            <div v-if="record.errorMessage" class="atomic-history__failure">
              {{ record.errorMessage }}
            </div>
            <button
              v-if="canRetryAtomicPublish(record)"
              type="button"
              class="atomic-publish__button is-secondary atomic-history__retry"
              :aria-label="`重试发布：${record.assetName}`"
              :disabled="historyLoading || Boolean(retryingTaskId)"
              @click="retryRecord(record)"
            >
              {{ retryingTaskId === record.id ? '重试中…' : '重试发布' }}
            </button>
          </article>
        </div>

        <button
          v-if="historyHasMore"
          type="button"
          class="atomic-publish__button is-secondary atomic-history__more"
          :disabled="historyLoading || Boolean(retryingTaskId)"
          @click="loadHistory(false)"
        >
          {{ historyLoading ? '加载中…' : '加载更多' }}
        </button>
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

.atomic-publish__back,
.atomic-publish__panel-header button,
.atomic-publish__error button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.atomic-publish__back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #dfe4ef;
  border-radius: 8px;
  background: #fff;
  color: #46536c;
  font-size: 13px;
}

.atomic-publish__back:hover,
.atomic-publish__back:focus-visible {
  border-color: #aebfea;
  outline: none;
  color: #2864ec;
}

.atomic-publish__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.atomic-publish__heading h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.atomic-publish__heading p {
  margin: 6px 0 0;
  color: #778198;
  font-size: 13px;
}

.atomic-publish__type,
.atomic-publish__scope-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #efeaff;
  color: #7657dc;
  font-size: 12px;
  font-weight: 600;
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
  border: 1px solid #e1e6f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(35, 50, 83, 0.06);
}

.is-embedded .atomic-publish__panel {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.atomic-publish__panel-header {
  display: flex;
  gap: 22px;
  padding: 0 20px;
  border-bottom: 1px solid #edf0f6;
}

.atomic-publish__panel-header button {
  min-height: 48px;
  border-bottom: 2px solid transparent;
  color: #66728a;
}

.atomic-publish__panel-header button.is-active {
  border-bottom-color: #316cf4;
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
  padding: 22px;
}

.atomic-publish__overview {
  padding: 20px;
  border: 1px solid #e7eaf2;
  border-radius: 12px;
  background: #fbfcff;
}

.atomic-publish__identity {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.atomic-publish__icon {
  display: grid;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 11px;
  background: #805cf2;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}

.atomic-publish__icon.is-skill {
  background: #4e82ed;
}

.atomic-publish__icon.is-command {
  background: #36a776;
}

.atomic-publish__identity h4 {
  margin: 1px 0 5px;
  font-size: 16px;
}

.atomic-publish__identity p {
  margin: 0;
  color: #707b91;
  font-size: 13px;
  line-height: 1.65;
}

.atomic-publish__metadata {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0 0;
}

.atomic-publish__metadata div {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 9px;
  background: #fff;
}

.atomic-publish__metadata dt,
.atomic-history dt {
  margin-bottom: 7px;
  color: #8992a5;
  font-size: 12px;
}

.atomic-publish__metadata dd,
.atomic-history dd {
  margin: 0;
  color: #2a354d;
  font-size: 13px;
}

.atomic-publish__metadata dd {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atomic-publish__scope-tag {
  min-height: 20px;
  padding: 0 7px;
  background: #eef2ff;
  color: #5267b8;
  font-size: 11px;
}

.atomic-publish__field {
  display: grid;
  gap: 8px;
  margin-top: 20px;
  color: #34405a;
  font-size: 13px;
  font-weight: 600;
}

.atomic-publish__field select {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d8deea;
  border-radius: 9px;
  background: #fff;
  color: #27334b;
  font: inherit;
}

.atomic-publish__field select:focus {
  border-color: #648ff4;
  outline: none;
  box-shadow: 0 0 0 3px rgba(47, 105, 255, 0.12);
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
  color: #a62f2f;
  text-decoration: underline;
}

.atomic-publish__footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #edf0f6;
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

.atomic-history {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 22px;
}

.atomic-history__toolbar,
.atomic-history__item-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.atomic-history__toolbar > div,
.atomic-history__item-heading > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.atomic-history__toolbar span,
.atomic-history__item-heading span {
  color: #7c879d;
  font-size: 12px;
}

.atomic-history__list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.atomic-history__item {
  position: relative;
  padding: 16px;
  border: 1px solid #e3e8f1;
  border-radius: 10px;
  background: #fbfcff;
}

.atomic-history__item dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 0;
}

.atomic-history__status {
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef2f7;
  color: #65728b !important;
}

.atomic-history__status.is-发布成功 {
  background: #e8f7ef;
  color: #25855d !important;
}

.atomic-history__status.is-发布失败 {
  background: #fff0ef;
  color: #c04a44 !important;
}

.atomic-history__status.is-进行中 {
  background: #fff5e5;
  color: #bd7721 !important;
}

.atomic-history__failure {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 7px;
  background: #fff2f1;
  color: #b7443e;
  font-size: 12px;
}

.atomic-history__retry {
  margin-top: 12px;
}

.atomic-history__empty {
  padding: 50px 20px;
  color: #8993a7;
  text-align: center;
}

.atomic-history__more {
  display: block;
  margin: 16px auto 0;
}

@media (max-width: 820px) {
  .atomic-publish__metadata,
  .atomic-history__item dl {
    grid-template-columns: 1fr;
  }
}
</style>

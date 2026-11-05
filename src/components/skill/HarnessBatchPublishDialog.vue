<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

import {
  BATCH_PUBLISH_LIMIT,
  batchAssetPublishService,
  batchPublishItem,
  batchPublishItemKey,
  type HarnessBatchPublishAsset,
  type HarnessBatchPublishOptions,
  type HarnessBatchPublishQuery,
  type HarnessBatchPublishResult,
} from '../../services/skillMarket/batchAssetPublishService';
import type { HarnessAtomicAssetType } from '../../services/skillMarket/assetManagementTypes';
import type { HarnessAtomicPublishHistoryRecord } from '../../services/skillMarket/atomicAssetPublishHttp';

const props = defineProps<{
  assetType: HarnessAtomicAssetType;
  options: HarnessBatchPublishOptions;
  query: HarnessBatchPublishQuery;
  userName: string;
}>();
const emit = defineEmits<{ close: []; accepted: [] }>();
const titleId = `batch-publish-title-${useId()}`;
const dialogRef = ref<HTMLDialogElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
const organizationButtons = ref<HTMLButtonElement[]>([]);
const poolLimit = BATCH_PUBLISH_LIMIT;
const selectedKeys = ref<string[]>([]);
const selectedOrgId = ref(props.options.organizations[0]?.id ?? '');
const pendingOrgId = ref('');
const searchQuery = ref('');
const availableOptions = ref(props.options);
const submitting = ref(false);
const optionsLoading = ref(false);
const publishError = ref('');
const publishResult = ref<HarnessBatchPublishResult | null>(null);
const acceptedKeys = ref(new Set<string>());
const progress = ref<HarnessAtomicPublishHistoryRecord[]>([]);
const progressLoading = ref(false);
const progressError = ref('');
const retryingTaskId = ref('');
const bodyRef = ref<HTMLElement | null>(null);
const resultHeading = ref<HTMLElement | null>(null);
const busy = computed(() => submitting.value || optionsLoading.value);
let disposed = false;

const candidates = computed(() =>
  availableOptions.value.assets.filter(
    (asset) =>
      asset.assetType === props.assetType &&
      !acceptedKeys.value.has(asset.id) &&
      Boolean(asset.latestVersion?.trim()),
  ),
);
const organizations = computed(() => availableOptions.value.organizations);
const selectedOrganization = computed(() =>
  organizations.value.find((organization) => organization.id === selectedOrgId.value),
);
const pendingOrganization = computed(() =>
  organizations.value.find((organization) => organization.id === pendingOrgId.value),
);
const organizationAssets = computed(() => assetsForOrganization(selectedOrgId.value));
const visibleAssets = computed(() => {
  const keyword = searchQuery.value.trim().toLocaleLowerCase();
  return organizationAssets.value.filter((asset) =>
    asset.name.toLocaleLowerCase().includes(keyword),
  );
});
const selectedAssets = computed(() => {
  const byKey = new Map(organizationAssets.value.map((asset) => [assetKey(asset), asset]));
  return selectedKeys.value.flatMap((key) => {
    const asset = byKey.get(key);
    return asset ? [asset] : [];
  });
});
const poolFull = computed(() => selectedAssets.value.length >= poolLimit);

function assetKey(asset: HarnessBatchPublishAsset): string {
  return asset.id;
}

function versionLabel(asset: HarnessBatchPublishAsset): string {
  const version = asset.latestVersion?.trim() ?? '';
  return /^v/i.test(version) ? version : `v${version}`;
}

function assetsForOrganization(orgId: string): HarnessBatchPublishAsset[] {
  return candidates.value.filter((asset) => asset.targetOrgId === orgId);
}

function moveOrganization(event: KeyboardEvent, index: number): void {
  if (busy.value) return;
  const count = organizations.value.length;
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? count - 1
        : ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? (index + 1) % count
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
            ? (index - 1 + count) % count
            : -1;
  const organization = organizations.value[nextIndex];
  if (!organization) return;
  event.preventDefault();
  switchOrganization(organization.id);
  organizationButtons.value[nextIndex]?.focus();
}

function switchOrganization(orgId: string): void {
  if (busy.value) return;
  publishError.value = '';
  if (orgId === selectedOrgId.value) {
    pendingOrgId.value = '';
    return;
  }
  if (selectedAssets.value.length) {
    pendingOrgId.value = orgId;
    return;
  }
  confirmSwitch(orgId);
}

function confirmSwitch(orgId = pendingOrgId.value): void {
  if (busy.value) return;
  selectedOrgId.value = orgId;
  pendingOrgId.value = '';
  selectedKeys.value = [];
  searchQuery.value = '';
  publishError.value = '';
}

function toggleAsset(asset: HarnessBatchPublishAsset): void {
  if (busy.value) return;
  publishError.value = '';
  const key = assetKey(asset);
  if (selectedKeys.value.includes(key)) {
    selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
  } else if (!poolFull.value) {
    selectedKeys.value = [...selectedKeys.value, key];
  }
  if (!selectedKeys.value.length) pendingOrgId.value = '';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function submitSelection(): Promise<void> {
  if (
    busy.value ||
    publishResult.value ||
    !selectedAssets.value.length ||
    !selectedOrganization.value ||
    pendingOrgId.value
  )
    return;
  submitting.value = true;
  publishError.value = '';
  try {
    const result = await batchAssetPublishService.submit({
      targetOrgId: selectedOrgId.value,
      userId: props.query.userId,
      userName: props.userName,
      items: selectedAssets.value.map(batchPublishItem),
    });
    if (disposed) return;
    publishResult.value = result;
    result.accepted.forEach((item) => acceptedKeys.value.add(batchPublishItemKey(item)));
    selectedKeys.value = result.rejected.map(batchPublishItemKey);
    if (result.accepted.length) emit('accepted');
    progress.value = [];
    progressError.value = '';
    await nextTick();
    if (bodyRef.value) bodyRef.value.scrollTop = 0;
    resultHeading.value?.focus();
    if (result.accepted.length) void loadProgress();
  } catch (error) {
    if (!disposed) publishError.value = errorMessage(error, '发布请求失败，请重试');
  } finally {
    if (!disposed) submitting.value = false;
  }
}

async function refreshOptions(): Promise<void> {
  if (busy.value || progressLoading.value || retryingTaskId.value) return;
  optionsLoading.value = true;
  publishError.value = '';
  try {
    const options = await batchAssetPublishService.queryOptions(props.query);
    if (disposed) return;
    availableOptions.value = options;
    if (!options.organizations.some((org) => org.id === selectedOrgId.value))
      selectedOrgId.value = options.organizations[0]?.id ?? '';
    const allowedIds = new Set(assetsForOrganization(selectedOrgId.value).map(assetKey));
    selectedKeys.value = selectedKeys.value.filter((key) => allowedIds.has(key));
    pendingOrgId.value = '';
    publishResult.value = null;
    searchQuery.value = '';
    await nextTick();
    if (bodyRef.value) bodyRef.value.scrollTop = 0;
    closeRef.value?.focus();
  } catch (error) {
    if (!disposed) publishError.value = errorMessage(error, '待发布清单刷新失败');
  } finally {
    if (!disposed) optionsLoading.value = false;
  }
}

async function loadProgress(): Promise<void> {
  const result = publishResult.value;
  if (!result?.accepted.length || progressLoading.value) return;
  progressLoading.value = true;
  progressError.value = '';
  try {
    const rows = await batchAssetPublishService.queryProgress(result.batchId, props.query.userId);
    if (!disposed && publishResult.value === result) progress.value = rows;
  } catch (error) {
    if (!disposed) progressError.value = errorMessage(error, '发布进度加载失败');
  } finally {
    if (!disposed) progressLoading.value = false;
  }
}

function taskProgress(taskId: string): HarnessAtomicPublishHistoryRecord | undefined {
  return progress.value.find((row) => row.id === taskId);
}

function canRetry(taskId: string): boolean {
  const task = taskProgress(taskId);
  return task?.publishStatus === '发布失败' && task.operatorId === props.query.userId;
}

async function retryTask(taskId: string): Promise<void> {
  if (retryingTaskId.value || progressLoading.value || !canRetry(taskId)) return;
  retryingTaskId.value = taskId;
  progressError.value = '';
  try {
    await batchAssetPublishService.retry(taskId, props.query.userId);
    if (disposed) return;
    const task = taskProgress(taskId);
    if (task) {
      task.publishStatus = '进行中';
      task.errorMessage = '';
    }
    emit('accepted');
    await loadProgress();
  } catch (error) {
    if (!disposed) progressError.value = errorMessage(error, '发布任务重试失败');
  } finally {
    if (!disposed) retryingTaskId.value = '';
  }
}

function close(): void {
  if (submitting.value || retryingTaskId.value) return;
  dialogRef.value?.close();
  emit('close');
}

onMounted(() => {
  dialogRef.value?.showModal();
  closeRef.value?.focus();
});
onBeforeUnmount(() => {
  disposed = true;
  dialogRef.value?.close();
});
</script>

<template>
  <Teleport to="body">
    <div class="harness-workspace-overlay">
      <dialog
        ref="dialogRef"
        class="batch-publish"
        aria-modal="true"
        :aria-labelledby="titleId"
        @cancel.prevent="close"
      >
        <header class="batch-publish__header">
          <h2 :id="titleId">批量发布 · {{ assetType }}</h2>
          <button
            ref="closeRef"
            type="button"
            class="batch-publish__close"
            aria-label="关闭批量发布"
            :disabled="submitting || Boolean(retryingTaskId)"
            @click="close"
          >
            ×
          </button>
        </header>

        <div ref="bodyRef" class="batch-publish__body" :aria-busy="busy">
          <template v-if="!publishResult">
            <section class="batch-publish__organizations" aria-label="目标组织">
              <div class="batch-publish__organization-heading">
                <p class="batch-publish__label">
                  目标组织<span>（单选，切换后清单随之变化）</span>
                </p>
                <button
                  type="button"
                  class="batch-publish__text-button"
                  :disabled="busy"
                  @click="refreshOptions"
                >
                  {{ optionsLoading ? '刷新中…' : '刷新清单' }}
                </button>
              </div>
              <div
                v-if="organizations.length"
                class="batch-publish__org-options"
                role="radiogroup"
                aria-label="目标组织（单选）"
              >
                <button
                  v-for="(org, index) in organizations"
                  :key="org.id"
                  ref="organizationButtons"
                  type="button"
                  role="radio"
                  class="batch-publish__org"
                  :class="{ 'is-active': selectedOrgId === org.id }"
                  :aria-checked="selectedOrgId === org.id"
                  :tabindex="selectedOrgId === org.id ? 0 : -1"
                  :disabled="busy"
                  :title="org.deptName ? `绑定部门：${org.deptName}（${org.deptCode}）` : org.name"
                  @click="switchOrganization(org.id)"
                  @keydown="moveOrganization($event, index)"
                >
                  {{ org.name }}<span>{{ assetsForOrganization(org.id).length }}</span>
                </button>
              </div>
              <p v-else class="batch-publish__state">当前部门及下游暂无有权限发布的待发布资产</p>
              <p v-if="selectedOrganization?.deptName" class="batch-publish__state">
                组织所属部门：{{ selectedOrganization.deptName }}
              </p>
              <div v-if="pendingOrganization" class="batch-publish__switch" role="alert">
                <span
                  >切换到「{{ pendingOrganization.name }}」将清空当前发布池（{{
                    selectedAssets.length
                  }}
                  项），确认切换？</span
                >
                <button type="button" @click="pendingOrgId = ''">取消切换</button>
                <button type="button" class="is-confirm" @click="confirmSwitch()">确认切换</button>
              </div>
            </section>

            <section class="batch-publish__pool" aria-label="发布池">
              <div class="batch-publish__pool-heading">
                <h3>发布池</h3>
                <span
                  v-if="selectedAssets.length && selectedOrganization"
                  class="batch-publish__destination"
                  >→ {{ selectedOrganization.name }}</span
                >
                <span
                  class="batch-publish__count"
                  :class="{ 'is-full': poolFull }"
                  aria-live="polite"
                  >{{ selectedAssets.length }}/{{ poolLimit }}</span
                >
              </div>
              <div class="batch-publish__chips">
                <span v-if="!selectedAssets.length" class="batch-publish__pool-empty"
                  >尚未添加资产到发布池</span
                >
                <span
                  v-for="asset in selectedAssets"
                  :key="assetKey(asset)"
                  class="batch-publish__chip"
                >
                  <span
                    class="batch-publish__type"
                    :class="`is-${asset.assetType.toLowerCase()}`"
                    >{{ asset.assetType }}</span
                  >
                  <span class="batch-publish__chip-name" :title="asset.name">{{ asset.name }}</span>
                  <span class="batch-publish__version">{{ versionLabel(asset) }}</span>
                  <button
                    type="button"
                    :aria-label="`移除 ${asset.name}`"
                    :disabled="busy"
                    @click="toggleAsset(asset)"
                  >
                    ×
                  </button>
                </span>
              </div>
              <p v-if="poolFull" class="batch-publish__limit" role="status">
                已达到 10 项上限，可移除已选资产后继续添加。
              </p>
            </section>

            <section class="batch-publish__list-section" aria-label="可发布资产">
              <label class="batch-publish__search">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
                <input
                  v-model="searchQuery"
                  :disabled="busy"
                  type="search"
                  aria-label="搜索批量发布资产"
                  placeholder="搜索资产名称…"
                />
              </label>
              <div class="batch-publish__list">
                <div
                  v-for="asset in visibleAssets"
                  :key="assetKey(asset)"
                  class="batch-publish__row"
                  :class="{ 'is-selected': selectedKeys.includes(assetKey(asset)) }"
                >
                  <div class="batch-publish__info">
                    <div class="batch-publish__name" :title="asset.name">{{ asset.name }}</div>
                    <div class="batch-publish__meta">
                      <span>{{ versionLabel(asset) }}</span
                      ><span aria-hidden="true">·</span
                      ><span :title="asset.description">{{ asset.description || '暂无描述' }}</span>
                    </div>
                    <div
                      class="batch-publish__ownership"
                      :title="`归属：${asset.dimType} / ${asset.dimName}；开发责任人：${asset.developOwnerName || asset.developOwnerId || '未指定'}；更新于：${asset.updatedAt || '未知'}`"
                    >
                      {{ asset.dimType }} · {{ asset.dimName
                      }}<span v-if="asset.developOwnerName || asset.developOwnerId">
                        · {{ asset.developOwnerName || asset.developOwnerId }}</span
                      >
                    </div>
                  </div>
                  <span
                    class="batch-publish__type"
                    :class="`is-${asset.assetType.toLowerCase()}`"
                    >{{ asset.assetType }}</span
                  >
                  <span class="batch-publish__status">待发布</span>
                  <button
                    type="button"
                    class="batch-publish__add"
                    :class="{ 'is-selected': selectedKeys.includes(assetKey(asset)) }"
                    :aria-label="`${selectedKeys.includes(assetKey(asset)) ? '取消选择' : '添加'} ${asset.name}`"
                    :aria-pressed="selectedKeys.includes(assetKey(asset))"
                    :disabled="busy || (poolFull && !selectedKeys.includes(assetKey(asset)))"
                    @click="toggleAsset(asset)"
                  >
                    {{ selectedKeys.includes(assetKey(asset)) ? '已在池中 ✓' : '＋ 添加' }}
                  </button>
                </div>
                <div v-if="!visibleAssets.length" class="batch-publish__empty">
                  {{
                    searchQuery.trim()
                      ? '未找到匹配的资产，试试其他名称'
                      : '该组织下暂无可发布的资产'
                  }}
                </div>
              </div>
            </section>
            <p class="batch-publish__help">
              按资产归属匹配可发布组织，同一批次发布至同一组织，一次最多选择 10 项。
            </p>
          </template>
          <section v-else class="batch-publish__result" aria-label="批量发布结果">
            <h3 ref="resultHeading" tabindex="-1">发布受理结果</h3>
            <p class="batch-publish__result-summary" role="status">
              已受理 {{ publishResult.accepted.length }} 项，未受理
              {{ publishResult.rejected.length }} 项
            </p>
            <p v-if="publishResult.message && publishResult.message !== 'OK'">
              {{ publishResult.message }}
            </p>
            <p v-if="publishResult.accepted.length" class="batch-publish__notice">
              已受理项将在后台发布，完成后由小鲁班发送汇总通知。可刷新进度查看处理结果。
            </p>
            <p>目标组织：{{ selectedOrganization?.name }}</p>
            <p v-if="publishResult.batchId" class="batch-publish__batch-id">
              批次 ID：{{ publishResult.batchId }}
            </p>
            <div v-if="publishResult.accepted.length" class="batch-publish__result-heading">
              <h4>已受理（{{ publishResult.accepted.length }}）</h4>
              <button
                type="button"
                class="batch-publish__text-button"
                :disabled="progressLoading || Boolean(retryingTaskId) || optionsLoading"
                @click="loadProgress"
              >
                {{ progressLoading ? '查询中…' : '刷新进度' }}
              </button>
            </div>
            <p v-if="progressError" class="batch-publish__error" role="alert">
              {{ progressError }}
            </p>
            <ul v-if="publishResult.accepted.length" class="batch-publish__result-list">
              <li
                v-for="item in publishResult.accepted"
                :key="item.taskId"
                class="batch-publish__result-row"
              >
                <div>
                  <strong>{{ item.assetName }}</strong
                  ><span class="batch-publish__version">{{
                    /^v/i.test(item.assetVersion) ? item.assetVersion : `v${item.assetVersion}`
                  }}</span>
                </div>
                <span
                  class="batch-publish__task-status"
                  :class="{
                    'is-failed': taskProgress(item.taskId)?.publishStatus === '发布失败',
                    'is-success': taskProgress(item.taskId)?.publishStatus === '发布成功',
                  }"
                  >{{ taskProgress(item.taskId)?.publishStatus || '已受理，等待处理' }}</span
                >
                <button
                  v-if="canRetry(item.taskId)"
                  type="button"
                  class="batch-publish__text-button"
                  :disabled="Boolean(retryingTaskId) || progressLoading || optionsLoading"
                  :aria-label="`重试 ${item.assetName}`"
                  @click="retryTask(item.taskId)"
                >
                  {{ retryingTaskId === item.taskId ? '重试中…' : '重试' }}
                </button>
                <p v-if="taskProgress(item.taskId)?.errorMessage" class="batch-publish__failure">
                  {{ taskProgress(item.taskId)?.errorMessage }}
                </p>
              </li>
            </ul>
            <h4 v-if="publishResult.rejected.length">
              未受理（{{ publishResult.rejected.length }}）
            </h4>
            <ul v-if="publishResult.rejected.length" class="batch-publish__result-list">
              <li
                v-for="item in publishResult.rejected"
                :key="batchPublishItemKey(item)"
                class="batch-publish__result-row"
              >
                <div>
                  <strong>{{ item.assetName }}</strong
                  ><span class="batch-publish__version">{{ item.assetVersion }}</span>
                </div>
                <span class="batch-publish__task-status is-failed">未受理</span>
                <p class="batch-publish__failure">{{ item.reason }}</p>
              </li>
            </ul>
          </section>
          <p
            v-if="publishError"
            class="batch-publish__error batch-publish__submit-error"
            role="alert"
          >
            {{ publishError }}
          </p>
        </div>

        <footer class="batch-publish__footer">
          <button
            type="button"
            class="batch-publish__button"
            :disabled="submitting || Boolean(retryingTaskId)"
            @click="close"
          >
            {{ publishResult ? '关闭' : '取消' }}
          </button>
          <button
            v-if="publishResult"
            type="button"
            class="batch-publish__button is-primary"
            :disabled="busy || progressLoading || Boolean(retryingTaskId)"
            @click="refreshOptions"
          >
            {{ optionsLoading ? '刷新中…' : '继续选择' }}
          </button>
          <button
            v-else
            type="button"
            class="batch-publish__button is-primary"
            :disabled="busy || !selectedAssets.length || Boolean(pendingOrgId)"
            @click="submitSelection"
          >
            {{ submitting ? '正在提交…' : `发布 ${selectedAssets.length} 项` }}
          </button>
        </footer>
      </dialog>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-publish {
  box-sizing: border-box;
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100dvh - 80px);
  margin: 40px auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 60px #0f172a40;
}
.batch-publish[open] {
  display: flex;
  flex-direction: column;
}
.batch-publish::backdrop {
  background: rgb(15 23 42 / 45%);
}
.batch-publish :where(*) {
  box-sizing: border-box;
}
.batch-publish button {
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  transition:
    background 0.16s,
    border-color 0.16s;
}
.batch-publish button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.batch-publish button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 3px;
}
.batch-publish__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.batch-publish__header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.batch-publish__close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 22px !important;
}
.batch-publish__close:hover {
  background: #e5e7eb;
  color: #111827;
}
.batch-publish__body {
  min-height: 0;
  overflow-y: auto;
}
.batch-publish__organizations {
  padding: 16px 24px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.batch-publish__label {
  margin: 0 0 10px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
}
.batch-publish__label span {
  font-weight: 400;
}
.batch-publish__org-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.batch-publish__org {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #4b5563;
  font-weight: 600 !important;
}
.batch-publish__org:hover {
  border-color: #93b4f5;
}
.batch-publish__org.is-active {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.batch-publish__org span {
  font-size: 11px;
  opacity: 0.75;
}
.batch-publish__switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 12px;
}
.batch-publish__switch > span {
  flex: 1 1 290px;
}
.batch-publish__switch button {
  padding: 2px 9px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 12px;
}
.batch-publish__switch .is-confirm {
  border-color: #d97706;
  background: #d97706;
  color: #fff;
}
.batch-publish__pool {
  padding: 14px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafbfc;
}
.batch-publish__pool-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.batch-publish__pool-heading h3 {
  margin: 0 auto 0 0;
  font-size: 13px;
  font-weight: 700;
}
.batch-publish__destination {
  padding: 2px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
}
.batch-publish__count {
  padding: 2px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
}
.batch-publish__count.is-full {
  background: #fee2e2;
  color: #dc2626;
}
.batch-publish__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
}
.batch-publish__pool-empty {
  color: #6b7280;
  font-size: 12px;
  line-height: 32px;
}
.batch-publish__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 6px 5px 10px;
  border: 1px solid #dbe5f1;
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
}
.batch-publish__chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-publish__chip button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #f3f4f6;
  color: #6b7280;
  line-height: 18px;
}
.batch-publish__chip button:hover {
  background: #fee2e2;
  color: #dc2626;
}
.batch-publish__version {
  flex-shrink: 0;
  color: #6b7280;
  font-size: 10px;
}
.batch-publish__type {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}
.batch-publish__type.is-agent {
  background: #ede9fe;
  color: #7c3aed;
}
.batch-publish__type.is-skill {
  background: #cffafe;
  color: #0891b2;
}
.batch-publish__type.is-command {
  background: #fef3c7;
  color: #b45309;
}
.batch-publish__list-section {
  padding: 14px 24px 16px;
}
.batch-publish__search {
  position: relative;
  display: block;
  margin-bottom: 12px;
}
.batch-publish__search svg {
  position: absolute;
  top: 10px;
  left: 12px;
  width: 16px;
  height: 16px;
  color: #9ca3af;
  pointer-events: none;
}
.batch-publish__search input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  outline: none;
}
.batch-publish__search input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px #2563eb15;
}
.batch-publish__list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.batch-publish__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #f3f4f6;
}
.batch-publish__row:last-child {
  border-bottom: 0;
}
.batch-publish__row:hover {
  background: #f9fafb;
}
.batch-publish__row.is-selected {
  background: #f8fbff;
}
.batch-publish__info {
  flex: 1;
  min-width: 0;
}
.batch-publish__name {
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.batch-publish__meta {
  display: flex;
  gap: 8px;
  color: #6b7280;
  font-size: 11px;
}
.batch-publish__meta span:first-child {
  flex-shrink: 0;
}
.batch-publish__meta span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-publish__status {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  font-weight: 600;
}
.batch-publish__status.is-published {
  background: #d1fae5;
  color: #065f46;
}
.batch-publish__add {
  flex-shrink: 0;
  min-width: 69px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  font-size: 11px !important;
  font-weight: 600 !important;
}
.batch-publish__add:hover {
  border-color: #2563eb;
  color: #2563eb;
}
.batch-publish__add.is-selected {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}
.batch-publish__empty {
  padding: 36px 16px;
  color: #6b7280;
  text-align: center;
  font-size: 13px;
}
.batch-publish__help {
  margin: 0;
  padding: 0 24px 16px;
  color: #6b7280;
  font-size: 11px;
  line-height: 1.6;
}
.batch-publish__state {
  margin: 4px 0;
  color: #6b7280;
  font-size: 12px;
}
.batch-publish__limit {
  margin: 10px 0 0;
  color: #b45309;
  font-size: 12px;
}
.batch-publish__organization-heading,
.batch-publish__result-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.batch-publish__text-button {
  flex-shrink: 0;
  border: 0;
  padding: 4px 0;
  color: #2563eb;
  background: transparent;
  font-size: 12px !important;
}
.batch-publish__ownership {
  margin-top: 4px;
  overflow: hidden;
  color: #6b7280;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-publish__result {
  padding: 20px 24px;
  font-size: 13px;
  line-height: 1.6;
}
.batch-publish__result h3 {
  margin: 0;
  outline: none;
  font-size: 16px;
}
.batch-publish__result > p {
  margin: 8px 0;
}
.batch-publish__result h4 {
  margin: 16px 0 10px;
}
.batch-publish__result-summary {
  font-weight: 600;
}
.batch-publish__notice {
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
}
.batch-publish__batch-id {
  color: #6b7280;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.batch-publish__result-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.batch-publish__result-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #f3f4f6;
}
.batch-publish__result-row:last-child {
  border: 0;
}
.batch-publish__result-row > div {
  flex: 1 1 240px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.batch-publish__result-row .batch-publish__version {
  margin-left: 8px;
}
.batch-publish__task-status {
  color: #1d4ed8;
  font-size: 12px;
}
.batch-publish__task-status.is-failed {
  color: #b42318;
}
.batch-publish__task-status.is-success {
  color: #047857;
}
.batch-publish__failure {
  flex-basis: 100%;
  margin: 0;
  color: #b42318;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.batch-publish__error {
  color: #b42318;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.batch-publish__submit-error {
  margin: 0 24px 16px;
}
.batch-publish__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  background: #fafbfc;
}
.batch-publish__button {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-weight: 600 !important;
}
.batch-publish__button:hover {
  border-color: #2563eb;
  color: #2563eb;
}
.batch-publish__button.is-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.batch-publish__button.is-primary:hover:not(:disabled) {
  border-color: #1e40af;
  background: #1e40af;
}
@media (max-width: 600px) {
  .batch-publish {
    max-height: calc(100dvh - 32px);
    margin: 16px auto;
    border-radius: 12px;
  }
  .batch-publish__header,
  .batch-publish__organizations,
  .batch-publish__pool,
  .batch-publish__list-section,
  .batch-publish__footer,
  .batch-publish__result {
    padding-left: 16px;
    padding-right: 16px;
  }
  .batch-publish__row {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
  }
  .batch-publish__info {
    flex-basis: 100%;
  }
  .batch-publish__add {
    margin-left: auto;
  }
  .batch-publish__help {
    padding-left: 16px;
    padding-right: 16px;
  }
  .batch-publish__submit-error {
    margin-left: 16px;
    margin-right: 16px;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue';

import HarnessVersionPicker from './HarnessVersionPicker.vue';
import type {
  SkillBehaviorCaseFilter,
  SkillBehaviorEvaluationKind,
  SkillQualityEvaluationCase,
  SkillTriggerEvaluationCase,
} from '../../services/skillMarket/mock/skillBehaviorEvaluation';
import {
  isSkillBehaviorEvaluationInProgress,
  querySkillBehaviorEvaluation,
  querySkillBehaviorEvaluationTrend,
  triggerSkillBehaviorEvaluation,
  type SkillBehaviorEvaluationMode,
  type SkillBehaviorEvaluationRecordDto,
  type SkillBehaviorEvaluationTrendDto,
  type SkillQualityEvaluationReportDto,
  type SkillTriggerEvaluationReportDto,
} from '../../services/skillMarket/skillBehaviorEvaluationService';

const props = defineProps<{
  assetName: string;
  version: string;
  versions: string[];
  userId?: string;
  userName?: string;
}>();

const emit = defineEmits<{
  notify: [message: string];
  changeVersion: [version: string];
}>();

const instanceId = useId();
const activeKind = ref<SkillBehaviorEvaluationKind>('trigger');
const triggerFilter = ref<SkillBehaviorCaseFilter>('all');
const qualityFilter = ref<SkillBehaviorCaseFilter>('all');
const expandedQualityCases = ref<string[]>([]);
const activeDialog = ref<'trigger' | 'trend' | null>(null);
const selectedTypes = ref<SkillBehaviorEvaluationKind[]>([]);
const submittingTypes = ref<SkillBehaviorEvaluationKind[]>([]);
const triggerDialogError = ref('');
const returnFocus = ref<HTMLElement | null>(null);
const triggerDialog = ref<HTMLElement | null>(null);
const trendDialog = ref<HTMLElement | null>(null);
const triggerDialogClose = ref<HTMLButtonElement | null>(null);
const trendDialogClose = ref<HTMLButtonElement | null>(null);
const modeStates = reactive<
  Record<
    SkillBehaviorEvaluationKind,
    { loading: boolean; record: SkillBehaviorEvaluationRecordDto | null; error: string }
  >
>({
  trigger: { loading: true, record: null, error: '' },
  quality: { loading: true, record: null, error: '' },
});
const trendState = reactive<{
  loading: boolean;
  data: SkillBehaviorEvaluationTrendDto;
  error: string;
}>({
  loading: false,
  data: { quality: [], trigger: [] },
  error: '',
});
let contextEpoch = 0;
const trendLoaded = ref(false);

const hasAvailableVersion = computed(() => Boolean(props.version.trim() && props.versions.length));
const currentState = computed(() => modeStates[activeKind.value]);
const currentRecord = computed(() => currentState.value.record);
const triggerReport = computed<SkillTriggerEvaluationReportDto | null>(() => {
  const record = modeStates.trigger.record;
  return record?.mode === 'TRIGGER' && record.state === 'completed'
    ? (record.report as SkillTriggerEvaluationReportDto | null)
    : null;
});
const qualityReport = computed<SkillQualityEvaluationReportDto | null>(() => {
  const record = modeStates.quality.record;
  return record?.mode === 'QUALITY' && record.state === 'completed'
    ? (record.report as SkillQualityEvaluationReportDto | null)
    : null;
});
const currentReport = computed(() =>
  activeKind.value === 'trigger' ? triggerReport.value : qualityReport.value,
);
const currentRate = computed(() => {
  const raw =
    activeKind.value === 'trigger' ? triggerReport.value?.accuracy : qualityReport.value?.pass_rate;
  return Number.parseFloat(raw ?? '0') || 0;
});
const rateRingStyle = computed(() => ({
  background: `conic-gradient(#6677f7 0 ${currentRate.value}%, #e8ecf7 ${currentRate.value}% 100%)`,
}));
const triggerCases = computed<SkillTriggerEvaluationCase[]>(() =>
  (triggerReport.value?.results ?? []).map((item) => ({
    id: item.case_id,
    task: item.task,
    type: item.type === 'positive' ? '正向' : '反向',
    expected: item.expect_trigger,
    actual: item.actual_trigger,
    passed: item.passed,
    details: [
      { label: '期望', content: item.expect_trigger ? '应触发当前 Skill' : '不应触发当前 Skill' },
      { label: '实际', content: item.actual_trigger ? '已触发当前 Skill' : '未触发当前 Skill' },
    ],
  })),
);
const qualityCases = computed<SkillQualityEvaluationCase[]>(() =>
  (qualityReport.value?.results ?? []).map((item) => ({
    id: item.case_id,
    task: item.task,
    score: item.score,
    duration: `${item.cost_time}s`,
    passed: item.passed,
    details: [
      { label: '期望结果', content: item.expect },
      { label: '实际输出', content: item.output },
      { label: '评分分析', content: item.reason },
    ],
  })),
);
const filteredTriggerCases = computed(() => {
  return triggerCases.value.filter((item) => matchesFilter(item.passed, triggerFilter.value));
});
const filteredQualityCases = computed(() => {
  return qualityCases.value.filter((item) => matchesFilter(item.passed, qualityFilter.value));
});
const triggerPassed = computed(() => triggerCases.value.filter((item) => item.passed).length);
const qualityPassed = computed(() => qualityCases.value.filter((item) => item.passed).length);
const currentPassed = computed(() =>
  activeKind.value === 'trigger' ? triggerPassed.value : qualityPassed.value,
);
const currentTotal = computed(() =>
  activeKind.value === 'trigger' ? triggerCases.value.length : qualityCases.value.length,
);
const triggerComposition = computed(() => [
  {
    key: 'positive-hit',
    type: '正向' as const,
    label: '命中',
    value: triggerCases.value.filter((item) => item.type === '正向' && item.actual).length,
    description: '应触发且已正确触发',
    tone: 'blue',
  },
  {
    key: 'positive-miss',
    type: '正向' as const,
    label: '漏触发',
    value: triggerCases.value.filter((item) => item.type === '正向' && !item.actual).length,
    description: '应触发但未触发',
    tone: 'orange',
  },
  {
    key: 'negative-false',
    type: '反向' as const,
    label: '误触发',
    value: triggerCases.value.filter((item) => item.type === '反向' && item.actual).length,
    description: '不应触发却触发',
    tone: 'red',
  },
  {
    key: 'negative-correct',
    type: '反向' as const,
    label: '正确不触发',
    value: triggerCases.value.filter((item) => item.type === '反向' && !item.actual).length,
    description: '不应触发且未触发',
    tone: 'green',
  },
]);
const triggerChart = computed(() => {
  const positive = triggerCases.value.filter((item) => item.type === '正向');
  const negative = triggerCases.value.filter((item) => item.type === '反向');
  return {
    positiveExpected: positive.length,
    positivePassed: positive.filter((item) => item.passed).length,
    negativeExpected: negative.length,
    negativePassed: negative.filter((item) => item.passed).length,
    max: Math.max(1, positive.length, negative.length),
  };
});
const durationDistribution = computed(() => {
  const bins = [
    { label: '<60s', value: 0 },
    { label: '60-120s', value: 0 },
    { label: '120-300s', value: 0 },
    { label: '>300s', value: 0 },
  ];
  for (const item of qualityReport.value?.results ?? []) {
    const index =
      item.cost_time < 60 ? 0 : item.cost_time < 120 ? 1 : item.cost_time <= 300 ? 2 : 3;
    bins[index]!.value += 1;
  }
  return bins;
});
const scoreDistribution = computed(() => {
  const bins = [
    { label: '<60', value: 0 },
    { label: '60-70', value: 0 },
    { label: '70-80', value: 0 },
    { label: '80-90', value: 0 },
    { label: '90-100', value: 0 },
  ];
  for (const item of qualityReport.value?.results ?? []) {
    const index =
      item.score < 60 ? 0 : item.score < 70 ? 1 : item.score < 80 ? 2 : item.score < 90 ? 3 : 4;
    bins[index]!.value += 1;
  }
  return bins;
});
const maxDurationDistribution = computed(() =>
  Math.max(1, ...durationDistribution.value.map((item) => item.value)),
);
const maxScoreDistribution = computed(() =>
  Math.max(1, ...scoreDistribution.value.map((item) => item.value)),
);
const durationDistributionAxis = computed(() => distributionAxis(maxDurationDistribution.value));
const scoreDistributionAxis = computed(() => distributionAxis(maxScoreDistribution.value));
const behaviorVersionStatuses = computed<Record<string, string>>(() => {
  const completedQuality = new Set(
    trendState.data.quality.map((point) => normalizedVersion(point.version)),
  );
  const completedTrigger = new Set(
    trendState.data.trigger.map((point) => normalizedVersion(point.version)),
  );
  return Object.fromEntries(
    props.versions.map((version) => {
      const normalized = normalizedVersion(version);
      if (normalized === normalizedVersion(props.version)) {
        const records = [modeStates.trigger.record, modeStates.quality.record];
        if (isModePending('trigger') || isModePending('quality')) {
          return [version, '进行中'];
        }
        const completed = records.filter((record) => record?.state === 'completed').length;
        if (completed === 2) return [version, '已评测'];
        if (completed === 1) return [version, '部分评测'];
        if (records.some((record) => record?.state === 'failed')) return [version, '失败'];
        return [version, '未评测'];
      }
      const completed =
        Number(completedQuality.has(normalized)) + Number(completedTrigger.has(normalized));
      return [version, completed === 2 ? '已评测' : completed === 1 ? '部分评测' : '未评测'];
    }),
  );
});
function matchesFilter(passed: boolean, filter: SkillBehaviorCaseFilter): boolean {
  return filter === 'all' || (filter === 'passed' ? passed : !passed);
}

function normalizedVersion(version: string): string {
  return version.replace(/^v/i, '');
}

function selectVersion(version: string): void {
  if (version !== props.version) emit('changeVersion', version);
}

function apiMode(kind: SkillBehaviorEvaluationKind): SkillBehaviorEvaluationMode {
  return kind === 'trigger' ? 'TRIGGER' : 'QUALITY';
}

function isModeBusy(kind: SkillBehaviorEvaluationKind): boolean {
  return submittingTypes.value.includes(kind) || isModePending(kind);
}

function isModePending(kind: SkillBehaviorEvaluationKind): boolean {
  return isSkillBehaviorEvaluationInProgress(modeStates[kind].record?.state);
}

function stateLabel(record: SkillBehaviorEvaluationRecordDto | null): string {
  if (!record) return '未评测';
  if (isSkillBehaviorEvaluationInProgress(record.state)) return '进行中';
  return record.state === 'completed' ? '已完成' : '失败';
}

function toggleQualityCase(id: string): void {
  expandedQualityCases.value = expandedQualityCases.value.includes(id)
    ? expandedQualityCases.value.filter((value) => value !== id)
    : [...expandedQualityCases.value, id];
}

function isQualityCaseExpanded(id: string): boolean {
  return expandedQualityCases.value.includes(id);
}

function openDialog(kind: 'trigger' | 'trend', event?: Event): void {
  returnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (kind === 'trigger') {
    selectedTypes.value = [];
    triggerDialogError.value = '';
  }
  activeDialog.value = kind;
  if (kind === 'trend') void loadTrend();
  nextTick(() => (kind === 'trigger' ? triggerDialogClose.value : trendDialogClose.value)?.focus());
}

function closeDialog(restoreFocus = true): void {
  activeDialog.value = null;
  if (restoreFocus) nextTick(() => returnFocus.value?.focus());
}

async function confirmTrigger(): Promise<void> {
  if (!selectedTypes.value.length) return;
  triggerDialogError.value = '';
  const kinds = [...selectedTypes.value];
  submittingTypes.value = [...new Set([...submittingTypes.value, ...kinds])];
  const results = await Promise.allSettled(
    kinds.map(async (kind) => {
      const accepted = await triggerSkillBehaviorEvaluation({
        skillName: props.assetName,
        version: props.version,
        mode: apiMode(kind),
        userId: props.userId ?? '',
        userName: props.userName ?? '',
      });
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      modeStates[kind].record = {
        id: accepted.taskId,
        skillName: accepted.skillName,
        version: accepted.version,
        mode: accepted.mode,
        creator: props.userId ?? '',
        creatorName: props.userName ?? '',
        taskId: accepted.taskId,
        state: accepted.state,
        report: null,
        error: null,
        createTime: now,
        updateTime: now,
      };
      modeStates[kind].error = '';
      return kind;
    }),
  );
  submittingTypes.value = submittingTypes.value.filter((kind) => !kinds.includes(kind));
  const succeeded = results
    .filter(
      (result): result is PromiseFulfilledResult<SkillBehaviorEvaluationKind> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value);
  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    return [
      {
        kind: kinds[index]!,
        message: result.reason instanceof Error ? result.reason.message : '发起评测失败',
      },
    ];
  });
  if (!failures.length && succeeded.length) {
    emit(
      'notify',
      `已发起${succeeded.map((kind) => (kind === 'trigger' ? '触发评测' : '质量评测')).join('、')}`,
    );
    closeDialog();
  }
  if (failures.length) {
    selectedTypes.value = failures.map((failure) => failure.kind);
    triggerDialogError.value = failures
      .map(
        (failure) => `${failure.kind === 'trigger' ? '触发评测' : '质量评测'}：${failure.message}`,
      )
      .join('；');
  }
}

function chartHeight(value: number, max: number): string {
  return `${Math.max(8, (value / max) * 100)}%`;
}

function distributionAxis(maxValue: number): { max: number; labels: number[] } {
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const max = step * 4;
  return {
    max,
    labels: Array.from({ length: 5 }, (_, index) => max - index * step),
  };
}

function trendX(index: number, length: number): number {
  if (length <= 1) return 320;
  return 80 + (index * 480) / (length - 1);
}

function trendY(rate: number): number {
  return 180 - Math.max(0, Math.min(100, rate)) * 1.6;
}

function trendPoints(points: SkillBehaviorEvaluationTrendDto['quality']): string {
  return points
    .map((point, index) => `${trendX(index, points.length)},${trendY(point.value)}`)
    .join(' ');
}

function trendArea(points: SkillBehaviorEvaluationTrendDto['quality']): string {
  if (!points.length) return '';
  return `${trendX(0, points.length)},140 ${trendPoints(points)} ${trendX(points.length - 1, points.length)},140`;
}

async function loadMode(kind: SkillBehaviorEvaluationKind, epoch = contextEpoch): Promise<void> {
  const state = modeStates[kind];
  if (!props.assetName || !props.version) {
    state.loading = false;
    state.record = null;
    state.error = '';
    return;
  }
  state.loading = true;
  state.error = '';
  try {
    const record = await querySkillBehaviorEvaluation({
      skillName: props.assetName,
      version: props.version,
      mode: apiMode(kind),
    });
    if (epoch !== contextEpoch) return;
    state.record = record;
  } catch (error) {
    if (epoch !== contextEpoch) return;
    state.error = error instanceof Error ? error.message : '评测记录加载失败';
  } finally {
    if (epoch === contextEpoch) state.loading = false;
  }
}

async function loadAllModes(): Promise<void> {
  contextEpoch += 1;
  const epoch = contextEpoch;
  await Promise.all([loadMode('trigger', epoch), loadMode('quality', epoch)]);
}

async function refreshCurrentMode(): Promise<void> {
  await loadMode(activeKind.value);
}

async function loadTrend(force = false): Promise<void> {
  if (trendState.loading || (trendLoaded.value && !force)) return;
  trendState.loading = true;
  trendState.error = '';
  try {
    trendState.data = await querySkillBehaviorEvaluationTrend(props.assetName, props.versions);
    trendLoaded.value = true;
  } catch (error) {
    trendState.error = error instanceof Error ? error.message : '版本趋势加载失败';
  } finally {
    trendState.loading = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!activeDialog.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDialog();
    return;
  }
  if (event.key !== 'Tab') return;
  const dialog = activeDialog.value === 'trigger' ? triggerDialog.value : trendDialog.value;
  const focusable = Array.from(
    dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(
  () => [props.assetName, props.version],
  () => {
    activeKind.value = 'trigger';
    triggerFilter.value = 'all';
    qualityFilter.value = 'all';
    expandedQualityCases.value = [];
    activeDialog.value = null;
    modeStates.trigger.record = null;
    modeStates.quality.record = null;
    void loadAllModes();
  },
  { immediate: true },
);

watch(
  () => props.assetName,
  () => {
    trendLoaded.value = false;
    trendState.data = { quality: [], trigger: [] };
    void loadTrend();
  },
  { immediate: true },
);

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => {
  contextEpoch += 1;
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <section
    id="asset-detail-panel-behavior"
    class="behavior-evaluation"
    role="tabpanel"
    aria-labelledby="asset-detail-tab-behavior"
  >
    <div class="behavior-evaluation__toolbar">
      <div class="behavior-version-picker">
        <span class="behavior-version-picker__label">版本</span>
        <HarnessVersionPicker
          :model-value="version"
          :versions="versions"
          :statuses="behaviorVersionStatuses"
          status-kind="evaluation"
          :disabled="!hasAvailableVersion || currentState.loading || submittingTypes.length > 0"
          @update:model-value="selectVersion"
        />
      </div>
      <div v-if="currentRecord" class="behavior-evaluation__meta" aria-label="评测触发信息">
        <span
          ><small>触发人</small><strong>{{ currentRecord.creatorName || '—' }}</strong></span
        >
        <span class="behavior-evaluation__user-id">{{ currentRecord.creator }}</span>
        <span
          ><small>触发时间</small><strong>{{ currentRecord.createTime }}</strong></span
        >
        <span
          ><small>评测模型</small><strong>{{ currentReport?.model || '—' }}</strong></span
        >
      </div>
    </div>

    <section class="behavior-card" aria-label="行为评测结果">
      <header class="behavior-card__header">
        <div class="behavior-card__heading">
          <strong>
            行为评测
            <span :class="`is-${activeKind}`">
              - {{ activeKind === 'trigger' ? '触发评测' : '质量评测' }}
            </span>
          </strong>
          <span class="behavior-card__divider" aria-hidden="true" />
          <div class="behavior-kind-tabs" role="tablist" aria-label="评测类型">
            <button
              id="behavior-kind-trigger"
              type="button"
              role="tab"
              :class="{ 'is-active': activeKind === 'trigger' }"
              :aria-selected="activeKind === 'trigger'"
              aria-controls="behavior-panel-trigger"
              @click="activeKind = 'trigger'"
            >
              <span class="behavior-kind-tabs__dot is-trigger" aria-hidden="true" />触发评测
            </button>
            <button
              id="behavior-kind-quality"
              type="button"
              role="tab"
              :class="{ 'is-active': activeKind === 'quality' }"
              :aria-selected="activeKind === 'quality'"
              aria-controls="behavior-panel-quality"
              @click="activeKind = 'quality'"
            >
              <span class="behavior-kind-tabs__dot is-quality" aria-hidden="true" />质量评测
            </button>
          </div>
        </div>
        <div class="behavior-card__actions">
          <button
            type="button"
            class="behavior-button is-secondary"
            :disabled="!hasAvailableVersion"
            @click="openDialog('trend', $event)"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 16V4m0 12h14M5.5 12.5l3-3 2.5 2 4-5" />
            </svg>
            版本趋势
          </button>
          <button
            v-if="isModePending(activeKind)"
            type="button"
            class="behavior-button"
            :disabled="currentState.loading"
            @click="refreshCurrentMode"
          >
            {{ currentState.loading ? '刷新中…' : '刷新状态' }}
          </button>
          <button
            type="button"
            class="behavior-button is-primary"
            :disabled="!hasAvailableVersion || (isModeBusy('trigger') && isModeBusy('quality'))"
            :title="
              !hasAvailableVersion
                ? '当前 Skill 暂无可用版本'
                : isModeBusy('trigger') && isModeBusy('quality')
                  ? '两类评测均在进行中'
                  : undefined
            "
            @click="openDialog('trigger', $event)"
          >
            <span aria-hidden="true">▶</span>发起评测
          </button>
        </div>
      </header>

      <section v-if="!hasAvailableVersion" class="behavior-empty" role="status">
        <span class="behavior-empty__icon" aria-hidden="true">i</span>
        <strong>当前 Skill 暂无可用版本</strong>
        <p>完成开发并上传版本包后，才能发起行为评测。</p>
      </section>

      <section v-else-if="currentState.loading" class="behavior-state" role="status">
        <span class="behavior-state__spinner" aria-hidden="true" />
        <strong>正在加载{{ activeKind === 'trigger' ? '触发评测' : '质量评测' }}记录</strong>
      </section>

      <section v-else-if="currentState.error" class="behavior-state is-error" role="alert">
        <strong>评测记录加载失败</strong>
        <p>{{ currentState.error }}</p>
        <button type="button" class="behavior-button" @click="refreshCurrentMode">重新加载</button>
      </section>

      <section v-else-if="!currentRecord" class="behavior-empty" role="status">
        <span class="behavior-empty__icon" aria-hidden="true">i</span>
        <strong>当前版本暂无{{ activeKind === 'trigger' ? '触发评测' : '质量评测' }}数据</strong>
        <p>v{{ normalizedVersion(version) }} 尚未发起该模式评测，触发后将在此生成报告。</p>
        <button
          type="button"
          class="behavior-button is-primary"
          @click="openDialog('trigger', $event)"
        >
          <span aria-hidden="true">▶</span>发起评测
        </button>
        <small>每个版本每种评测仅可触发一次；评测模型与用例集由底层按版本决定。</small>
      </section>

      <section
        v-else-if="isModePending(activeKind)"
        class="behavior-state is-running"
        role="status"
      >
        <span class="behavior-state__spinner" aria-hidden="true" />
        <strong>{{ activeKind === 'trigger' ? '触发评测' : '质量评测' }}进行中</strong>
        <small>任务 ID：{{ currentRecord.taskId }}</small>
        <button type="button" class="behavior-button" @click="refreshCurrentMode">刷新状态</button>
      </section>

      <section
        v-else-if="currentRecord.state === 'failed'"
        class="behavior-state is-error"
        role="alert"
      >
        <strong>{{ activeKind === 'trigger' ? '触发评测' : '质量评测' }}失败</strong>
        <p>{{ currentRecord.error || '评测任务执行失败，请重新发起。' }}</p>
        <button
          type="button"
          class="behavior-button is-primary"
          @click="openDialog('trigger', $event)"
        >
          重新发起
        </button>
      </section>

      <template v-else-if="currentReport">
        <div class="behavior-summary" aria-label="评测概要">
          <article class="behavior-summary__item is-rate">
            <div>
              <small>{{ activeKind === 'trigger' ? '准确率' : '通过率' }}</small>
              <div class="behavior-summary__value">
                <strong>{{ currentRate }}</strong
                ><span>%</span>
              </div>
              <p>{{ currentPassed }} / {{ currentTotal }} 用例通过</p>
            </div>
            <div class="behavior-summary__ring" :style="rateRingStyle" aria-hidden="true">
              <b>{{ currentRate }}%</b>
            </div>
          </article>
          <article class="behavior-summary__item">
            <small>{{ activeKind === 'trigger' ? '用例总数' : '总耗时' }}</small>
            <div class="behavior-summary__value is-text">
              <strong>{{
                activeKind === 'trigger' ? currentTotal : currentReport.total_cost_time
              }}</strong>
              <span v-if="activeKind === 'trigger'">条</span>
            </div>
            <p v-if="activeKind === 'quality'">全部用例累计执行时间</p>
          </article>
          <article class="behavior-summary__item">
            <small>任务完成状态</small>
            <div class="behavior-summary__value is-text">
              <strong>{{ stateLabel(currentRecord) }}</strong>
            </div>
            <p>由 {{ currentRecord.creatorName || currentRecord.creator }} 触发</p>
          </article>
          <article class="behavior-summary__item">
            <small>评测触发时间</small>
            <div class="behavior-summary__value is-text">
              <strong>{{ currentRecord.createTime.slice(11) }}</strong>
            </div>
            <p>{{ currentRecord.createTime.slice(0, 10) }} · {{ currentReport.model }}</p>
          </article>
        </div>

        <div
          v-show="activeKind === 'trigger'"
          id="behavior-panel-trigger"
          class="behavior-panel is-trigger"
          role="tabpanel"
          aria-labelledby="behavior-kind-trigger"
        >
          <header class="behavior-section-heading">
            <div>
              <h3>触发结果构成</h3>
              <p>按正向 / 反向用例统计命中、漏触发、误触发情况</p>
            </div>
          </header>
          <div class="behavior-composition">
            <article v-for="item in triggerComposition" :key="item.key" :class="`is-${item.tone}`">
              <span
                class="behavior-composition__type"
                :class="item.type === '正向' ? 'is-positive' : 'is-negative'"
              >
                {{ item.type }}
              </span>
              <strong class="behavior-composition__name">{{ item.label }}</strong>
              <div>
                <b>{{ item.value }}</b
                ><span>条</span>
              </div>
              <p>{{ item.description }}</p>
            </article>
          </div>

          <section class="behavior-chart" aria-labelledby="trigger-chart-title">
            <header><h4 id="trigger-chart-title">期望触发 vs 实际通过（用例数）</h4></header>
            <div
              class="behavior-grouped-bars"
              role="img"
              :aria-label="`正向期望 ${triggerChart.positiveExpected} 条，实际通过 ${triggerChart.positivePassed} 条；反向期望 ${triggerChart.negativeExpected} 条，实际通过 ${triggerChart.negativePassed} 条`"
            >
              <div class="behavior-bar-axis" aria-hidden="true">
                <span>{{ triggerChart.max }}</span
                ><span>{{ Math.round(triggerChart.max * 0.75) }}</span
                ><span>{{ Math.round(triggerChart.max * 0.5) }}</span
                ><span>{{ Math.round(triggerChart.max * 0.25) }}</span
                ><span>0</span>
              </div>
              <div class="behavior-bar-plot">
                <div class="behavior-bar-group">
                  <div
                    class="behavior-bar is-expected"
                    :style="{
                      height: chartHeight(triggerChart.positiveExpected, triggerChart.max),
                    }"
                  >
                    <b>{{ triggerChart.positiveExpected }}</b>
                  </div>
                  <div
                    class="behavior-bar is-positive"
                    :style="{ height: chartHeight(triggerChart.positivePassed, triggerChart.max) }"
                  >
                    <b>{{ triggerChart.positivePassed }}</b>
                  </div>
                  <span>正向（应触发）</span>
                </div>
                <div class="behavior-bar-group">
                  <div
                    class="behavior-bar is-expected"
                    :style="{
                      height: chartHeight(triggerChart.negativeExpected, triggerChart.max),
                    }"
                  >
                    <b>{{ triggerChart.negativeExpected }}</b>
                  </div>
                  <div
                    class="behavior-bar is-negative"
                    :style="{ height: chartHeight(triggerChart.negativePassed, triggerChart.max) }"
                  >
                    <b>{{ triggerChart.negativePassed }}</b>
                  </div>
                  <span>反向（不应触发）</span>
                </div>
              </div>
            </div>
            <div class="behavior-chart__legend" aria-hidden="true">
              <span><i class="is-expected" />期望数量</span>
              <span><i class="is-positive" />正向实际</span>
              <span><i class="is-negative" />反向实际</span>
            </div>
          </section>

          <header class="behavior-section-heading">
            <div>
              <h3>用例明细</h3>
              <p>查看各用例的期望触发、实际触发与结果</p>
            </div>
          </header>
          <div class="behavior-case-filters" aria-label="触发评测用例筛选">
            <button
              type="button"
              :aria-pressed="triggerFilter === 'all'"
              @click="triggerFilter = 'all'"
            >
              全部 {{ triggerCases.length }}
            </button>
            <button
              type="button"
              :aria-pressed="triggerFilter === 'passed'"
              @click="triggerFilter = 'passed'"
            >
              通过 {{ triggerPassed }}
            </button>
            <button
              type="button"
              :aria-pressed="triggerFilter === 'failed'"
              @click="triggerFilter = 'failed'"
            >
              不通过 {{ triggerCases.length - triggerPassed }}
            </button>
          </div>
          <div class="behavior-table-scroll">
            <table class="behavior-case-table">
              <thead>
                <tr>
                  <th>用例 ID</th>
                  <th>任务描述</th>
                  <th>类型</th>
                  <th>期望触发</th>
                  <th>实际触发</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredTriggerCases" :key="item.id">
                  <td class="behavior-case-id">{{ item.id }}</td>
                  <td class="behavior-case-task">{{ item.task }}</td>
                  <td>
                    <span
                      class="behavior-case-type"
                      :class="item.type === '正向' ? 'is-positive' : 'is-negative'"
                      >{{ item.type }}</span
                    >
                  </td>
                  <td>
                    <span :class="item.expected ? 'is-yes' : 'is-no'">{{
                      item.expected ? '是' : '否'
                    }}</span>
                  </td>
                  <td>
                    <span :class="item.actual ? 'is-yes' : 'is-no'">{{
                      item.actual ? '是' : '否'
                    }}</span>
                  </td>
                  <td>
                    <span class="behavior-result" :class="item.passed ? 'is-pass' : 'is-fail'">{{
                      item.passed ? '通过' : '不通过'
                    }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-show="activeKind === 'quality'"
          id="behavior-panel-quality"
          class="behavior-panel is-quality"
          role="tabpanel"
          aria-labelledby="behavior-kind-quality"
        >
          <header class="behavior-section-heading">
            <div>
              <h3>评测画像</h3>
              <p>按耗时区间与得分区间统计用例分布</p>
            </div>
          </header>
          <div class="behavior-distributions">
            <section class="behavior-chart" aria-labelledby="duration-chart-title">
              <header><h4 id="duration-chart-title">耗时分布</h4></header>
              <div
                class="behavior-distribution"
                role="img"
                :aria-label="
                  durationDistribution.map((item) => `${item.label} ${item.value} 条`).join('；')
                "
              >
                <div class="behavior-distribution__body">
                  <div class="behavior-distribution__axis" aria-hidden="true">
                    <span v-for="label in durationDistributionAxis.labels" :key="label">{{
                      label
                    }}</span>
                  </div>
                  <div class="behavior-distribution__plot">
                    <div class="behavior-distribution__columns">
                      <div
                        v-for="item in durationDistribution"
                        :key="item.label"
                        class="behavior-distribution__column"
                      >
                        <div
                          class="behavior-distribution__bar is-time"
                          :style="{
                            height: chartHeight(item.value, durationDistributionAxis.max),
                          }"
                        >
                          <b>{{ item.value }}</b>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  class="behavior-distribution__x"
                  :style="{
                    gridTemplateColumns: `repeat(${durationDistribution.length}, minmax(0, 1fr))`,
                  }"
                >
                  <span v-for="item in durationDistribution" :key="item.label">{{
                    item.label
                  }}</span>
                </div>
              </div>
            </section>
            <section class="behavior-chart" aria-labelledby="score-chart-title">
              <header><h4 id="score-chart-title">得分分布</h4></header>
              <div
                class="behavior-distribution"
                role="img"
                :aria-label="
                  scoreDistribution.map((item) => `${item.label} 分 ${item.value} 条`).join('；')
                "
              >
                <div class="behavior-distribution__body">
                  <div class="behavior-distribution__axis" aria-hidden="true">
                    <span v-for="label in scoreDistributionAxis.labels" :key="label">{{
                      label
                    }}</span>
                  </div>
                  <div class="behavior-distribution__plot">
                    <div class="behavior-distribution__columns">
                      <div
                        v-for="item in scoreDistribution"
                        :key="item.label"
                        class="behavior-distribution__column"
                      >
                        <div
                          class="behavior-distribution__bar is-score"
                          :style="{ height: chartHeight(item.value, scoreDistributionAxis.max) }"
                        >
                          <b>{{ item.value }}</b>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  class="behavior-distribution__x"
                  :style="{
                    gridTemplateColumns: `repeat(${scoreDistribution.length}, minmax(0, 1fr))`,
                  }"
                >
                  <span v-for="item in scoreDistribution" :key="item.label">{{ item.label }}</span>
                </div>
              </div>
            </section>
          </div>

          <header class="behavior-section-heading">
            <div>
              <h3>用例明细</h3>
              <p>展开用例查看期望结果、实际输出与评分分析</p>
            </div>
          </header>
          <div class="behavior-case-filters" aria-label="质量评测用例筛选">
            <button
              type="button"
              :aria-pressed="qualityFilter === 'all'"
              @click="qualityFilter = 'all'"
            >
              全部 {{ qualityCases.length }}
            </button>
            <button
              type="button"
              :aria-pressed="qualityFilter === 'passed'"
              @click="qualityFilter = 'passed'"
            >
              通过 {{ qualityPassed }}
            </button>
            <button
              type="button"
              :aria-pressed="qualityFilter === 'failed'"
              @click="qualityFilter = 'failed'"
            >
              不通过 {{ qualityCases.length - qualityPassed }}
            </button>
          </div>
          <div class="behavior-table-scroll">
            <table class="behavior-case-table">
              <thead>
                <tr>
                  <th>用例 ID</th>
                  <th>任务描述</th>
                  <th>得分</th>
                  <th>耗时</th>
                  <th>结果</th>
                  <th><span class="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="item in filteredQualityCases" :key="item.id">
                  <tr>
                    <td class="behavior-case-id is-quality">{{ item.id }}</td>
                    <td class="behavior-case-task">{{ item.task }}</td>
                    <td>
                      <strong
                        class="behavior-score"
                        :class="
                          item.score >= 80 ? 'is-high' : item.score >= 60 ? 'is-medium' : 'is-low'
                        "
                        >{{ item.score }}</strong
                      >
                    </td>
                    <td class="behavior-duration">{{ item.duration }}</td>
                    <td>
                      <span class="behavior-result" :class="item.passed ? 'is-pass' : 'is-fail'">{{
                        item.passed ? '通过' : '不通过'
                      }}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="behavior-case-toggle"
                        :aria-expanded="isQualityCaseExpanded(item.id)"
                        :aria-controls="`${instanceId}-quality-${item.id}`"
                        :aria-label="`${isQualityCaseExpanded(item.id) ? '收起' : '展开'}用例 ${item.id}`"
                        @click="toggleQualityCase(item.id)"
                      >
                        {{ isQualityCaseExpanded(item.id) ? '收起' : '展开' }}
                      </button>
                    </td>
                  </tr>
                  <tr
                    v-if="isQualityCaseExpanded(item.id)"
                    :id="`${instanceId}-quality-${item.id}`"
                    class="behavior-case-detail is-quality"
                  >
                    <td colspan="6">
                      <div class="behavior-case-detail__grid">
                        <article v-for="detail in item.details" :key="detail.label">
                          <strong>{{ detail.label }}</strong>
                          <p>{{ detail.content }}</p>
                        </article>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </section>

    <Teleport to="body">
      <div
        v-if="activeDialog === 'trigger'"
        class="behavior-dialog-overlay"
        @mousedown.self="closeDialog()"
      >
        <section
          ref="triggerDialog"
          class="behavior-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="behavior-trigger-title"
        >
          <header class="behavior-dialog__header">
            <div>
              <h2 id="behavior-trigger-title">发起质量评测</h2>
              <p>选择要触发的评测类型（可单选 / 多选），结果一次性全量返回</p>
            </div>
            <button
              ref="triggerDialogClose"
              type="button"
              class="behavior-dialog__close"
              aria-label="关闭发起评测弹窗"
              @click="closeDialog()"
            >
              ×
            </button>
          </header>
          <div class="behavior-dialog__body">
            <div class="behavior-options">
              <label
                :class="{
                  'is-selected is-trigger': selectedTypes.includes('trigger'),
                  'is-disabled': isModeBusy('trigger'),
                }"
              >
                <input
                  v-model="selectedTypes"
                  type="checkbox"
                  value="trigger"
                  :disabled="isModeBusy('trigger')"
                />
                <span class="behavior-options__tag is-trigger">触发评测</span>
                <strong>检验触发准确性</strong><b>Skill 是否在正确场景被触发</b>
                <p>
                  在各类对话输入下，检验本 Skill
                  是否被正确激活，并统计误触发（不应触发却触发）与漏触发（应触发却未触发）。关注路由准确率，不评估输出内容质量。
                </p>
                <small>用例构成 <em>正向 + 反向</em>　关注 <em>路由命中</em></small>
              </label>
              <label
                :class="{
                  'is-selected is-quality': selectedTypes.includes('quality'),
                  'is-disabled': isModeBusy('quality'),
                }"
              >
                <input
                  v-model="selectedTypes"
                  type="checkbox"
                  value="quality"
                  :disabled="isModeBusy('quality')"
                />
                <span class="behavior-options__tag is-quality">质量评测</span>
                <strong>检验输出质量</strong><b>被触发后输出是否正确、完整</b>
                <p>
                  在已触发的前提下，检验 Skill
                  输出的准确性、完整性与合规性，对每个用例打分并给出评分分析。关注内容质量，不评估触发路由。
                </p>
                <small>用例输出 <em>逐条打分</em>　关注 <em>内容正确性</em></small>
              </label>
            </div>
            <p class="behavior-dialog__hint">
              🔒 每个版本每种评测仅可触发一次；已成功的不允许重复，仅上次失败时可重试。
            </p>
            <div v-if="triggerDialogError" class="behavior-dialog__error" role="alert">
              <strong>发起评测失败</strong>
              <p>{{ triggerDialogError }}</p>
            </div>
          </div>
          <footer class="behavior-dialog__footer">
            <button type="button" class="behavior-button" @click="closeDialog()">取消</button>
            <button
              type="button"
              class="behavior-button is-primary"
              :disabled="!selectedTypes.length || submittingTypes.length > 0"
              @click="confirmTrigger"
            >
              {{ submittingTypes.length ? '发起中…' : '触发' }}
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="activeDialog === 'trend'"
        class="behavior-dialog-overlay"
        @mousedown.self="closeDialog()"
      >
        <section
          ref="trendDialog"
          class="behavior-dialog is-trend"
          role="dialog"
          aria-modal="true"
          aria-labelledby="behavior-trend-title"
        >
          <header class="behavior-dialog__header">
            <div>
              <h2 id="behavior-trend-title">版本通过率趋势</h2>
              <p>{{ assetName }} · 全部版本</p>
            </div>
            <button
              ref="trendDialogClose"
              type="button"
              class="behavior-dialog__close"
              aria-label="关闭版本趋势弹窗"
              @click="closeDialog()"
            >
              ×
            </button>
          </header>
          <div class="behavior-dialog__body behavior-trends">
            <p v-if="trendState.loading" class="behavior-trends__empty" role="status">
              正在加载版本趋势…
            </p>
            <div v-else-if="trendState.error" class="behavior-state is-error" role="alert">
              <strong>版本趋势加载失败</strong>
              <p>{{ trendState.error }}</p>
              <button type="button" class="behavior-button" @click="loadTrend(true)">
                重新加载
              </button>
            </div>
            <template v-else>
              <figure
                v-for="series in [
                  {
                    key: 'quality',
                    label: '质量评测通过率',
                    color: '#7168f4',
                    lastColor: '#9b6af1',
                    fill: 'rgba(113,104,244,0.1)',
                    points: trendState.data.quality,
                  },
                  {
                    key: 'trigger',
                    label: '触发准确率',
                    color: '#2f7df6',
                    lastColor: '#5fa2ff',
                    fill: 'rgba(47,125,246,0.1)',
                    points: trendState.data.trigger,
                  },
                ] as const"
                :key="series.key"
              >
                <figcaption>{{ series.label }}</figcaption>
                <div v-if="series.points.length" class="behavior-trend-chart">
                  <svg viewBox="0 0 640 180" aria-hidden="true">
                    <line
                      v-for="y in [20, 60, 100, 140]"
                      :key="y"
                      x1="40"
                      :y1="y"
                      x2="620"
                      :y2="y"
                      class="behavior-trend-grid"
                    />
                    <text
                      v-for="(label, index) in [100, 75, 50, 25]"
                      :key="label"
                      x="30"
                      :y="24 + index * 40"
                      text-anchor="end"
                    >
                      {{ label }}
                    </text>
                    <polygon :points="trendArea(series.points)" :fill="series.fill" />
                    <polyline
                      :points="trendPoints(series.points)"
                      fill="none"
                      :stroke="series.color"
                      stroke-width="2.5"
                    />
                    <g v-for="(point, index) in series.points" :key="point.version">
                      <circle
                        :cx="trendX(index, series.points.length)"
                        :cy="trendY(point.value)"
                        :r="index === series.points.length - 1 ? 4.5 : 3.5"
                        :fill="index === series.points.length - 1 ? series.lastColor : series.color"
                        :stroke="index === series.points.length - 1 ? '#fff' : 'none'"
                        stroke-width="2"
                      />
                      <text
                        :x="trendX(index, series.points.length)"
                        y="158"
                        text-anchor="middle"
                        :fill="index === series.points.length - 1 ? series.color : undefined"
                        :font-weight="index === series.points.length - 1 ? 800 : undefined"
                      >
                        v{{ normalizedVersion(point.version) }}
                      </text>
                      <text
                        :x="trendX(index, series.points.length)"
                        :y="trendY(point.value) - 8"
                        text-anchor="middle"
                        :fill="index === series.points.length - 1 ? series.color : undefined"
                        :font-weight="index === series.points.length - 1 ? 800 : undefined"
                      >
                        {{ point.value }}%
                      </text>
                    </g>
                  </svg>
                  <ul class="sr-only">
                    <li v-for="point in series.points" :key="point.version">
                      v{{ normalizedVersion(point.version) }}：{{ point.value }}%
                    </li>
                  </ul>
                </div>
                <p v-else class="behavior-trends__empty">暂无已完成评测的版本</p>
              </figure>
            </template>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.behavior-evaluation {
  color: #111827;
}
.behavior-evaluation :where(*) {
  box-sizing: border-box;
}
.behavior-evaluation__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin-bottom: 18px;
}
.behavior-version-picker {
  display: inline-flex;
  height: 42px;
  min-width: 220px;
  align-items: center;
  gap: 8px;
  padding-left: 14px;
  border: 1px solid #d7dee9;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 14px rgb(31 58 138 / 7%);
}
.behavior-version-picker__label {
  display: inline-flex;
  height: 40px;
  align-items: center;
  color: #667085;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}
.behavior-version-picker :deep(.harness-version-picker) {
  height: 40px;
  align-items: center;
}
.behavior-version-picker :deep(.harness-version-picker__trigger) {
  height: 40px;
  min-width: 158px;
  min-height: 40px;
  align-items: center;
  padding-top: 0;
  padding-bottom: 0;
  border: 0;
  box-shadow: none;
}
.behavior-version-picker :deep(.harness-version-picker__value) {
  display: inline-flex;
  height: 100%;
  align-items: center;
  line-height: 1;
}
.behavior-version-picker :deep(.harness-version-picker__status-dot),
.behavior-version-picker :deep(.harness-version-picker__chevron) {
  align-self: center;
}
.behavior-version-picker :deep(.harness-version-picker__trigger[aria-expanded='true']) {
  box-shadow: none;
}
.behavior-evaluation__meta {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  color: #52647d;
  font-size: 12.5px;
  box-shadow: 0 4px 14px rgb(31 58 138 / 7%);
}
.behavior-evaluation__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.behavior-evaluation__meta small {
  color: #667085;
  font-size: 11px;
  font-weight: 700;
}
.behavior-evaluation__meta strong {
  color: #1f2329;
}
.behavior-evaluation__user-id {
  margin-left: -16px;
  color: #2456e6;
  font-family: ui-monospace, monospace;
}
.behavior-card {
  overflow: hidden;
  border: 1px solid #eef0f3;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 28px rgb(73 87 156 / 8%);
}
.behavior-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 18px 22px;
  border-bottom: 1px solid #eef0f3;
  background: linear-gradient(180deg, #fbfdff, #fff);
}
.behavior-card__heading,
.behavior-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.behavior-card__heading > strong {
  color: #1f2329;
  font-size: 15px;
}
.behavior-card__heading > strong span {
  color: #2f7df6;
}
.behavior-card__heading > strong span.is-quality {
  color: #7168f4;
}
.behavior-card__divider {
  width: 1px;
  height: 18px;
  background: #d7dee9;
}
.behavior-kind-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: #e9ecf3;
}
.behavior-kind-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 18px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #52647d;
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
}
.behavior-kind-tabs button:hover:not(:disabled) {
  color: #1f2329;
}
.behavior-kind-tabs button.is-active {
  background: #fff;
  color: #1f2329;
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
.behavior-kind-tabs button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.behavior-kind-tabs__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2f7df6;
}
.behavior-kind-tabs__dot.is-quality {
  background: #7168f4;
}
.behavior-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  border: 1px solid #dbe1ea;
  border-radius: 9px;
  background: #fff;
  color: #3c4457;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms,
    border-color 160ms;
}
.behavior-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.behavior-button:hover:not(:disabled) {
  border-color: #b9c2d4;
  background: #f7f8fb;
}
.behavior-button.is-primary {
  border-color: #2456e6;
  background: #2456e6;
  color: #fff;
}
.behavior-button.is-primary:hover:not(:disabled) {
  background: #1d48c7;
}
.behavior-button.is-secondary {
  border-color: #cfdcf5;
  color: #2456e6;
}
.behavior-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.behavior-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding: 18px 22px;
  border-bottom: 1px solid #eef0f3;
  background: linear-gradient(180deg, #fff, #fbfcff);
}
.behavior-summary__item {
  position: relative;
  overflow: hidden;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.behavior-summary__item.is-rate {
  display: flex;
  align-items: center;
  gap: 14px;
  border-color: rgb(93 115 240 / 20%);
  background: linear-gradient(145deg, rgb(102 119 247 / 7%), #fff 60%);
}
.behavior-summary__item small {
  color: #52647d;
  font-size: 11px;
  font-weight: 700;
}
.behavior-summary__item p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.behavior-summary__value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-top: 6px;
}
.behavior-summary__value strong {
  color: #1f2329;
  font-size: 24px;
  line-height: 1;
}
.behavior-summary__value.is-text strong {
  font-size: 20px;
}
.behavior-summary__value span {
  color: #667085;
  font-size: 11px;
  font-weight: 700;
}
.behavior-summary__ring {
  position: relative;
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  margin-left: auto;
  border-radius: 50%;
}
.behavior-summary__ring::before {
  position: absolute;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  content: '';
}
.behavior-summary__ring b {
  position: relative;
  color: #3b4a8f;
  font-size: 12px;
}
.behavior-panel {
  padding: 22px;
}
.behavior-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.behavior-section-heading h3 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #25314f;
  font-size: 15px;
}
.behavior-section-heading h3::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f7df6;
  box-shadow: 0 0 0 5px rgb(47 125 246 / 10%);
  content: '';
}
.behavior-panel.is-quality .behavior-section-heading h3::before {
  background: #7168f4;
  box-shadow: 0 0 0 5px rgb(113 104 244 / 10%);
}
.behavior-section-heading p {
  margin: 5px 0 0 17px;
  color: #667085;
  font-size: 11px;
}
.behavior-composition {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.behavior-composition article {
  --tone: 47 125 246;
  padding: 14px 16px 16px;
  border: 1px solid #e2e8f0;
  border-top: 3px solid rgb(var(--tone));
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgb(31 58 138 / 7%);
}
.behavior-composition article.is-orange {
  --tone: 199 106 16;
}
.behavior-composition article.is-red {
  --tone: 220 38 38;
}
.behavior-composition article.is-green {
  --tone: 20 148 85;
}
.behavior-composition__type,
.behavior-case-type {
  display: inline-flex;
  padding: 3px 9px;
  border-radius: 6px;
  background: #eaf1ff;
  color: #2456e6;
  font-size: 10.5px;
  font-weight: 700;
}
.behavior-composition__type.is-negative,
.behavior-case-type.is-negative {
  background: #f1f5f9;
  color: #52647d;
}
.behavior-composition__name {
  display: block;
  margin: 8px 0 4px;
  color: #1f2329;
  font-size: 13px;
}
.behavior-composition article > div {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: rgb(var(--tone));
}
.behavior-composition article > div b {
  font-size: 26px;
  line-height: 1;
}
.behavior-composition article > div span,
.behavior-composition article p {
  color: #667085;
  font-size: 11px;
}
.behavior-composition article p {
  margin: 6px 0 0;
}
.behavior-chart {
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid rgb(170 183 220 / 42%);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 28px rgb(73 87 156 / 7%);
}
.behavior-chart header h4 {
  margin: 0 0 16px;
  color: #25314f;
  font-size: 13px;
}
.behavior-grouped-bars {
  display: flex;
  min-height: 205px;
}
.behavior-bar-axis {
  display: flex;
  width: 30px;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 6px 22px 0;
  color: #667085;
  font-size: 10px;
  text-align: right;
}
.behavior-bar-plot {
  display: flex;
  flex: 1;
  justify-content: space-around;
  gap: 24px;
  padding: 0 20px;
  border-bottom: 1.5px solid #94a3b8;
  border-left: 1.5px solid #cbd5e1;
  background: repeating-linear-gradient(
    to top,
    transparent 0,
    transparent calc(25% - 1px),
    #eef2f7 calc(25% - 1px),
    #eef2f7 25%
  );
}
.behavior-bar-group {
  display: grid;
  height: 182px;
  flex: 1;
  grid-template-columns: 34px 34px;
  grid-template-rows: 1fr 22px;
  align-items: end;
  justify-content: center;
  gap: 8px;
}
.behavior-bar-group > span {
  grid-column: 1 / -1;
  color: #52647d;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}
.behavior-bar {
  position: relative;
  min-height: 8px;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, #cbd5e1, #94a3b8);
}
.behavior-bar.is-positive {
  background: linear-gradient(180deg, #5fa2ff, #2f7df6);
}
.behavior-bar.is-negative {
  background: linear-gradient(180deg, #3fc88e, #18a66a);
}
.behavior-bar b {
  position: absolute;
  top: -20px;
  width: 100%;
  color: #1f2329;
  font-size: 11px;
  text-align: center;
}
.behavior-chart__legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
  color: #52647d;
  font-size: 11px;
}
.behavior-chart__legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.behavior-chart__legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: #94a3b8;
}
.behavior-chart__legend i.is-positive {
  background: #2f7df6;
}
.behavior-chart__legend i.is-negative {
  background: #18a66a;
}
.behavior-distributions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.behavior-distribution {
  min-width: 0;
}
.behavior-distribution__body {
  display: flex;
  height: 190px;
}
.behavior-distribution__axis {
  display: flex;
  width: 30px;
  flex: 0 0 30px;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 6px 1px 0;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-align: right;
}
.behavior-distribution__plot {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-end;
  padding: 0 12px;
  border-bottom: 1.5px solid #94a3b8;
  border-left: 1.5px solid #cbd5e1;
  background: repeating-linear-gradient(
    to top,
    transparent 0,
    transparent calc(25% - 1px),
    #eef2f7 calc(25% - 1px),
    #eef2f7 25%
  );
}
.behavior-distribution__columns {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: flex-end;
  justify-content: space-around;
  gap: 12px;
}
.behavior-distribution__column {
  display: flex;
  height: 100%;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
}
.behavior-distribution__x {
  display: grid;
  gap: 12px;
  padding: 6px 12px 0 42px;
}
.behavior-distribution__x span {
  color: #52647d;
  font-size: 10.5px;
  text-align: center;
  white-space: nowrap;
}
.behavior-distribution__bar {
  position: relative;
  width: min(38px, 75%);
  min-height: 8px;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, #5fa2ff, #2f7df6);
}
.behavior-distribution__bar.is-score {
  background: linear-gradient(180deg, #9b6af1, #7168f4);
}
.behavior-distribution__bar b {
  position: absolute;
  top: -20px;
  width: 100%;
  color: #1f2329;
  font-size: 11px;
  text-align: center;
}
.behavior-case-filters {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.behavior-case-filters button {
  min-height: 28px;
  padding: 5px 13px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  color: #52647d;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.behavior-case-filters button[aria-pressed='true'] {
  border-color: #1f2329;
  background: #1f2329;
  color: #fff;
}
.behavior-table-scroll {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.behavior-case-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 12.5px;
}
.behavior-case-table th {
  padding: 10px 14px;
  background: #f8fafc;
  color: #52647d;
  font-size: 11.5px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}
.behavior-case-table td {
  padding: 11px 14px;
  border-top: 1px solid #f0f2f7;
  color: #334155;
  vertical-align: top;
}
.behavior-case-table tbody tr:not(.behavior-case-detail):hover {
  background: #f9fbff;
}
.behavior-case-id {
  color: #2f7df6;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}
.behavior-case-id.is-quality {
  color: #7168f4;
}
.behavior-case-task {
  min-width: 230px;
  max-width: 340px;
  line-height: 1.55;
}
.is-yes {
  color: #149455;
  font-weight: 700;
}
.is-no {
  color: #dc2626;
  font-weight: 700;
}
.behavior-result {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.behavior-result::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}
.behavior-result.is-pass {
  background: #e6f7ef;
  color: #117a47;
}
.behavior-result.is-fail {
  background: #fef2f2;
  color: #c52222;
}
.behavior-score.is-high {
  color: #117a47;
}
.behavior-score.is-medium {
  color: #a9580d;
}
.behavior-score.is-low {
  color: #c52222;
}
.behavior-duration {
  color: #667085;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
}
.behavior-case-toggle {
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: #2456e6;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.behavior-case-detail td {
  padding: 14px 14px 16px 48px;
  border-top-color: #e1e7f0;
  background: #f3f6fb;
}
.behavior-case-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.behavior-case-detail.is-quality .behavior-case-detail__grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.behavior-case-detail article strong {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 6px;
  background: #eaf1ff;
  color: #2456e6;
  font-size: 10.5px;
}
.behavior-case-detail.is-quality article:nth-child(2) strong {
  background: #f3eaff;
  color: #6d55d9;
}
.behavior-case-detail.is-quality article:nth-child(3) strong {
  background: #fff7e6;
  color: #a9580d;
}
.behavior-case-detail article p {
  margin: 6px 0 0;
  color: #475569;
  font-size: 11.5px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.behavior-state {
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  padding: 36px 24px;
  color: #52647d;
  text-align: center;
}
.behavior-state strong {
  color: #1f2329;
  font-size: 15px;
}
.behavior-state p,
.behavior-state small {
  max-width: 600px;
  margin: 0;
  line-height: 1.6;
}
.behavior-state p {
  font-size: 12.5px;
}
.behavior-state small {
  color: #667085;
  font:
    11px ui-monospace,
    monospace;
  overflow-wrap: anywhere;
}
.behavior-state.is-error strong {
  color: #b42318;
}
.behavior-state__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #dbe5f7;
  border-top-color: #2f7df6;
  border-radius: 50%;
  animation: behavior-spin 0.8s linear infinite;
}
.behavior-empty {
  padding: 56px 24px;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  background: #fbfcfe;
  text-align: center;
}
.behavior-empty__icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  margin: 0 auto 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #eef2ff, #f5f3ff);
  color: #667085;
  font-size: 26px;
  font-style: italic;
  font-weight: 700;
}
.behavior-empty strong {
  display: block;
  color: #1f2329;
  font-size: 15px;
}
.behavior-empty p {
  margin: 8px 0 16px;
  color: #52647d;
  font-size: 12.5px;
}
.behavior-empty small {
  display: block;
  margin-top: 10px;
  color: #667085;
  font-size: 11px;
}
.behavior-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(31 42 68 / 46%);
  backdrop-filter: blur(3px);
}
.behavior-dialog {
  position: relative;
  width: min(680px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  color: #17233c;
  box-shadow: 0 22px 60px rgb(30 45 78 / 28%);
}
.behavior-dialog.is-trend {
  width: min(720px, calc(100vw - 32px));
}
.behavior-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid #eef0f3;
  background: linear-gradient(180deg, #fbfdff, #fff);
}
.behavior-dialog__header h2 {
  margin: 0;
  color: #1f2329;
  font-size: 16px;
  font-weight: 700;
}
.behavior-dialog__header p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
}
.behavior-dialog__close {
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.behavior-dialog__body {
  padding: 20px 22px;
}
.behavior-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid #eef0f3;
  background: #fbfcfe;
}
.behavior-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.behavior-options label {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
}
.behavior-options label:hover {
  border-color: #c3d2f7;
  background: #f7faff;
}
.behavior-options label.is-selected.is-trigger {
  border-color: #2f7df6;
  background: linear-gradient(145deg, #f0f6ff, #fff);
}
.behavior-options label.is-selected.is-quality {
  border-color: #7168f4;
  background: linear-gradient(145deg, #f5f0ff, #fff);
}
.behavior-options label.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.behavior-options input {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: #2456e6;
}
.behavior-options__tag {
  width: fit-content;
  padding: 3px 10px;
  border-radius: 7px;
  background: rgb(47 125 246 / 12%);
  color: #2f7df6;
  font-size: 11px;
  font-weight: 700;
}
.behavior-options__tag.is-quality {
  background: rgb(113 104 244 / 12%);
  color: #6d55d9;
}
.behavior-options label > strong {
  margin-top: 4px;
  color: #1f2329;
  font-size: 15px;
}
.behavior-options label > b {
  color: #1f2329;
  font-size: 12.5px;
}
.behavior-options label > p {
  margin: 4px 0 0;
  color: #52647d;
  font-size: 11.5px;
  line-height: 1.65;
}
.behavior-options label > small {
  color: #667085;
  font-size: 10.5px;
}
.behavior-options label > small em {
  color: #1f2329;
  font-style: normal;
  font-weight: 700;
}
.behavior-dialog__hint {
  margin: 12px 0 0;
  color: #52647d;
  font-size: 11.5px;
}
.behavior-dialog__error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #f3b9b9;
  border-radius: 8px;
  background: #fff5f5;
  color: #c62828;
  font-size: 12px;
}
.behavior-dialog__error strong {
  display: block;
  margin-bottom: 4px;
}
.behavior-dialog__error p {
  margin: 0;
  line-height: 1.5;
}
.behavior-trends figure {
  margin: 0;
  padding: 6px 0 10px;
}
.behavior-trends figure + figure {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eef0f3;
}
.behavior-trends figcaption {
  margin-bottom: 10px;
  color: #1f2329;
  font-size: 13px;
  font-weight: 700;
}
.behavior-trend-chart svg {
  display: block;
  width: 100%;
  height: 170px;
}
.behavior-trend-chart text {
  fill: #94a3b8;
  font-size: 10px;
}
.behavior-trend-grid {
  stroke: #eef2f7;
  stroke-width: 1;
}
.behavior-trends__empty {
  padding: 24px;
  color: #667085;
  text-align: center;
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
.behavior-kind-tabs button:focus-visible,
.behavior-button:focus-visible,
.behavior-case-filters button:focus-visible,
.behavior-case-toggle:focus-visible,
.behavior-dialog__close:focus-visible,
.behavior-options input:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
@media (max-width: 980px) {
  .behavior-summary,
  .behavior-composition {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .behavior-distributions,
  .behavior-options {
    grid-template-columns: 1fr;
  }
  .behavior-case-detail__grid,
  .behavior-case-detail.is-quality .behavior-case-detail__grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .behavior-card__header,
  .behavior-summary,
  .behavior-panel {
    padding-right: 14px;
    padding-left: 14px;
  }
  .behavior-card__heading,
  .behavior-card__actions {
    width: 100%;
  }
  .behavior-card__divider {
    display: none;
  }
  .behavior-kind-tabs,
  .behavior-card__actions .behavior-button {
    flex: 1;
  }
  .behavior-kind-tabs button {
    flex: 1;
    justify-content: center;
    padding-right: 10px;
    padding-left: 10px;
  }
  .behavior-summary,
  .behavior-composition {
    grid-template-columns: 1fr;
  }
  .behavior-evaluation__toolbar,
  .behavior-version-picker,
  .behavior-evaluation__meta {
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
  }
  .behavior-version-picker {
    align-items: center;
    flex-direction: row;
  }
  .behavior-version-picker :deep(.harness-version-picker) {
    flex: 1;
  }
  .behavior-version-picker :deep(.harness-version-picker__trigger) {
    width: 100%;
  }
  .behavior-evaluation__user-id {
    margin-left: 0;
  }
  .behavior-dialog-overlay {
    padding: 16px;
  }
  .behavior-dialog__body,
  .behavior-dialog__header,
  .behavior-dialog__footer {
    padding-right: 16px;
    padding-left: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .behavior-button {
    transition: none;
  }
  .behavior-state__spinner {
    animation: none;
  }
}
@keyframes behavior-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (forced-colors: active) {
  .behavior-kind-tabs button:focus-visible,
  .behavior-button:focus-visible,
  .behavior-case-filters button:focus-visible,
  .behavior-case-toggle:focus-visible,
  .behavior-dialog__close:focus-visible,
  .behavior-options input:focus-visible {
    outline-color: Highlight;
  }
  .behavior-kind-tabs__dot,
  .behavior-section-heading h3::before,
  .behavior-result::before {
    background: CanvasText;
  }
}
</style>

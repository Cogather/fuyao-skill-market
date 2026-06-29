<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BusinessDimensionCascader from '../../components/skill/BusinessDimensionCascader.vue';
import MarketDeptCascader from '../../components/skill/MarketDeptCascader.vue';
import {
  loadReviewCenterData,
  type ComputeChannelRow,
  type MedalLeaderboardRow,
  type ReviewCenterData,
  type ReviewDimensionDetail,
  type ReviewHistoryRecord,
  type ReviewRankingCard,
  type ReviewTaskCard,
} from '../../services/skillMarket/reviewCenterDataSource';
import type {
  ExpertReviewDimensionDto,
  ExpertReviewDimensionScoreDto,
  ReviewBadgeDto,
  SkillExpertReviewDetailDto,
} from '../../services/skillMarket/apiTypes';
import { skillBaseService } from '@/services/skillMarket/skillBaseService';

type ReviewDepartmentTreeNode = {
  name: string;
  children?: ReviewDepartmentTreeNode[];
};

const props = withDefaults(
  defineProps<{
    userId?: string;
    departmentTree?: ReviewDepartmentTreeNode[];
    isExpertReviewer?: boolean;
  }>(),
  {
    userId: '',
    departmentTree: () => [],
  },
);

const rankingCards = ref<ReviewRankingCard[]>([]);
const taskCards = reactive<ReviewTaskCard[]>([]);
const reviewTaskListRef = ref<HTMLElement | null>(null);
const reviewTransportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock')
    .trim()
    .toLowerCase() === 'http';
const reviewTaskPageNo = ref(0);
const reviewTaskTotal = ref(0);
const reviewTaskLoading = ref(false);
let reviewTaskScrollRaf = 0;
let reviewTaskPostRenderTimer: ReturnType<typeof window.setTimeout> | null = null;
let reviewTaskRequestToken = 0;

const REVIEW_TASK_PAGE_SIZE = 10;
const REVIEW_TASK_PREFETCH_MIN_DISTANCE = 180;
const REVIEW_TASK_PREFETCH_VIEWPORT_RATIO = 0.6;
const REVIEW_TASK_POST_RENDER_CHECK_DELAY = 80;
const REVIEW_TASK_VISIBLE_TAG_LIMIT = 2;

const selectedTaskId = ref(taskCards[0]?.skillId ?? '');

const computeChannels = reactive<ComputeChannelRow[]>([]);
const computeChannelTypes = ref<string[]>([]);
const isComputeChannelModalOpen = ref(false);
const computeSkillSearchQuery = ref('');
const selectedComputeSkillId = ref('');
const selectedComputeChannelType = ref('');
const computeChannelReason = ref('');

const medalRows = reactive<MedalLeaderboardRow[]>([]);
const medalAwardTypes = ref<string[]>([]);
const isMedalAwardModalOpen = ref(false);
const skillSearchQuery = ref('');
const selectedAwardSkillId = ref('');
const selectedAwardMedalTypes = ref<string[]>([]);
const awardMedalReason = ref('');

const reviewDimensionDetails = reactive<Record<string, ReviewDimensionDetail>>({});

const badgeOptions = ref<ReviewBadgeDto[]>([]);
const expertReviewDimensions = ref<ExpertReviewDimensionDto[]>([]);
const expertDimensionForms = reactive<ExpertDimensionFormState[]>([]);
const selectedReviewBadgeIds = ref<string[]>([]);
const selectedReviewBadgeReason = ref('');
const selectedReviewBadgeReasonError = ref('');
const expertOverallOpinion = ref('');
const expertOverallOpinionError = ref('');
const expertReviewId = ref('');
const expertReviewStatus = ref<'pending' | 'draft' | 'submitted'>('pending');
const expertReviewUpdatedAt = ref('');
const expertReviewMetaLoaded = ref(false);
const expertReviewLoading = ref(false);
const expertReviewSubmitting = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof window.setTimeout> | null = null;
const isVersionHistoryModalOpen = ref(false);
const greenChannelOptions = ref<string[]>([]);
const selectedGreenChannel = ref(greenChannelOptions.value[0] ?? '');
const overallReviewDimension = ref('');
const reviewHistoryRecords = ref<ReviewHistoryRecord[]>([]);
const reviewDetailTabs = ['AI评审', '专家评审'] as const;
type ReviewDetailTab = (typeof reviewDetailTabs)[number];
type ReviewVersionHistoryGroup = {
  version: string;
  records: ReviewHistoryRecord[];
};

type ExpertDimensionFormState = ExpertReviewDimensionDto & {
  scoreText: string;
  reason: string;
  scoreError: string;
  reasonError: string;
};
const activeReviewDetailTab = ref<ReviewDetailTab>('AI评审');

const AI_REVIEW_TONES = ['green', 'blue', 'amber', 'purple', 'red'] as const;
type AiReviewTone = (typeof AI_REVIEW_TONES)[number];
type AiReviewDimensionView = {
  key: string;
  label: string;
  tone: AiReviewTone;
  max_score: number;
};

const aiReviewDimensions = ref<AiReviewDimensionView[]>([
  {
    key: 'D1',
    label: '',
    tone: 'green',
    max_score: 20,
  },
  {
    key: 'D2',
    label: '',
    tone: 'blue',
    max_score: 30,
  },
  {
    key: 'D3',
    label: '',
    tone: 'amber',
    max_score: 20,
  },
  {
    key: 'D4',
    label: '',
    tone: 'purple',
    max_score: 10,
  },
  {
    key: 'D5',
    label: '',
    tone: 'red',
    max_score: 20,
  },
]);

const dimensionField = ref<Record<string, string>>({
  D1: '',
  D2: '',
  D3: '',
  D4: '',
  D5: '',
});

type RadarPoint = {
  x: string;
  y: string;
};

type RadarAxis = RadarPoint & {
  key: string;
};

type RadarLabel = RadarPoint & {
  key: string;
  text: string;
  transform: string;
};

function normalizeAiReviewDimensions(data: unknown): AiReviewDimensionView[] {
  if (Array.isArray(data)) {
    return data
      .map((item, index) => {
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const fallbackKey = `D${index + 1}`;
        const key = String(record.dimensionId ?? record.key ?? fallbackKey).trim();
        const rawMaxScore = record.maxScore ?? record.max_score;
        const maxScore = Number(rawMaxScore);

        return {
          key: key || fallbackKey,
          label: String(record.label ?? record.name ?? key ?? fallbackKey).trim(),
          tone: AI_REVIEW_TONES[index % AI_REVIEW_TONES.length],
          max_score: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 20,
        };
      })
      .filter((dimension) => dimension.key);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    return aiReviewDimensions.value.map((dimension, index) => {
      const key = dimension.key || `D${index + 1}`;
      return {
        ...dimension,
        label: String(record[key] ?? record[`D${index + 1}`] ?? dimension.label).trim(),
      };
    });
  }

  return aiReviewDimensions.value;
}

function applyAiReviewDimensions(data: unknown): void {
  const dimensions = normalizeAiReviewDimensions(data);
  if (!dimensions.length) {
    return;
  }

  aiReviewDimensions.value = dimensions;
  dimensionField.value = dimensions.reduce<Record<string, string>>((fields, dimension) => {
    fields[dimension.key] = dimension.label;
    return fields;
  }, {});
}

function replaceReactiveArray<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

function replaceReviewDimensionDetails(source: Record<string, ReviewDimensionDetail>) {
  Object.keys(reviewDimensionDetails).forEach((dimension) => {
    delete reviewDimensionDetails[dimension];
  });
  Object.entries(source).forEach(([dimension, detail]) => {
    reviewDimensionDetails[dimension] = detail;
  });
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function serviceSucceeded(value: unknown): boolean {
  const record = readRecord(value);
  const meta = readRecord(record.meta);
  if (typeof meta.success === 'boolean') {
    return meta.success;
  }
  if (record.success === false) {
    return false;
  }
  const code = record.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

function serviceMessage(value: unknown, fallback: string): string {
  const record = readRecord(value);
  const meta = readRecord(record.meta);
  const message = meta.message ?? record.message ?? record.msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function showToast(message: string, ms = 3000): void {
  toast.value = message;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, ms);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatFixedTwo(value: number): string {
  return value.toFixed(2);
}

function formatScoreInput(value: number): string {
  const rounded = roundToTwo(value);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatWeightPercent(weight: number): string {
  const percent = roundToTwo(weight * 100);
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
}

function sanitizeReviewScoreInput(raw: string): string {
  let value = raw.replace(/[^\d.]/g, '');
  const firstDotIndex = value.indexOf('.');
  if (firstDotIndex !== -1) {
    const integerPart = value.slice(0, firstDotIndex);
    const decimalPart = value
      .slice(firstDotIndex + 1)
      .replace(/\./g, '')
      .slice(0, 2);
    value = `${integerPart}.${decimalPart}`;
  }
  return value;
}

function parseReviewScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return roundToTwo(parsed);
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? roundToTwo(value) : null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundToTwo(parsed) : null;
}

function normalizeExpertReviewStatus(
  value: unknown,
  fallback: 'pending' | 'draft' | 'submitted' = 'pending',
): 'pending' | 'draft' | 'submitted' {
  const status = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['submitted', 'reviewed', 'done', 'approved', '已评'].includes(status)) {
    return 'submitted';
  }
  if (['draft', 'saved', '草稿'].includes(status)) {
    return 'draft';
  }
  if (['pending', 'todo', '待评', '待审'].includes(status)) {
    return 'pending';
  }
  return fallback;
}

function normalizeReviewBadgeIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function historyReviewBadgeIds(expertReview: unknown): string[] {
  const reviewRecord = readRecord(expertReview);
  const badgeRecord = readRecord(reviewRecord.badges);
  return normalizeReviewBadgeIds(badgeRecord.badgeIds);
}

function reviewBadgeImageSrc(badgeId: string): string {
  return `${import.meta.env.BASE_URL}badges/${encodeURIComponent(badgeId)}.png`;
}

function formatHistoryReviewTime(value: unknown): string {
  const text = String(value ?? '').trim();
  const matched = text
    .replace('T', ' ')
    .replace(/\.\d+.*$/, '')
    .match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);

  if (!matched) {
    return text;
  }

  return `${matched[1]} ${matched[2]}:${matched[3] ?? '00'}`;
}

function normalizeExpertReviewDimensionScores(value: unknown): ExpertReviewDimensionScoreDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = readRecord(item);
      const dimensionId = String(record.dimensionId ?? '').trim();
      const score = parseNullableNumber(record.score);
      const reason = String(record.reason ?? record.comment ?? '').trim();
      const nextScore: ExpertReviewDimensionScoreDto = { dimensionId };
      if (score != null) {
        nextScore.score = score;
      }
      if (reason) {
        nextScore.reason = reason;
      }
      return nextScore;
    })
    .filter((item) => item.dimensionId);
}

function normalizeCurrentUserReviewDetail(payload: unknown): SkillExpertReviewDetailDto | null {
  const detailRecord = readRecord(payload);
  const hasCurrentUserReview = Object.prototype.hasOwnProperty.call(
    detailRecord,
    'currentUserReview',
  );
  if (hasCurrentUserReview && detailRecord.currentUserReview == null) {
    return null;
  }

  const source = hasCurrentUserReview ? detailRecord.currentUserReview : payload;
  const sourceRecord = readRecord(source);
  if (Object.keys(sourceRecord).length === 0) {
    return null;
  }

  const badgeRecord = readRecord(sourceRecord.badges);
  const dimensionScores = normalizeExpertReviewDimensionScores(
    sourceRecord.dimensionScores ?? sourceRecord.dimensions,
  );
  const badgeIds = normalizeReviewBadgeIds(sourceRecord.badgeIds ?? badgeRecord.badgeIds);
  const totalScore = parseNullableNumber(sourceRecord.totalScore ?? sourceRecord.overallScore);
  const badgeReason = String(
    sourceRecord.badgeReason ?? badgeRecord.reason ?? badgeRecord.badgeReason ?? '',
  ).trim();
  const overallOpinion = String(
    sourceRecord.overallOpinion ?? sourceRecord.reviewComment ?? '',
  ).trim();
  const hasReviewValues =
    totalScore != null ||
    dimensionScores.some((item) => typeof item.score === 'number' || Boolean(item.reason)) ||
    badgeIds.length > 0 ||
    Boolean(badgeReason || overallOpinion);

  if (!hasReviewValues) {
    return null;
  }

  const skillInfoRecord = readRecord(detailRecord.skillInfo);
  const aiScoreRecord = readRecord(detailRecord.aiScore);
  return {
    reviewId: String(
      sourceRecord.reviewId ??
        detailRecord.reviewId ??
        (activeTask.value?.skillId ? `review-${activeTask.value.skillId}` : ''),
    ),
    skillId: String(
      sourceRecord.skillId ??
        detailRecord.skillId ??
        skillInfoRecord.skillId ??
        activeTask.value?.skillId ??
        '',
    ),
    aiScore: parseNullableNumber(aiScoreRecord.aiScore ?? detailRecord.aiScore) ?? 0,
    reviewStatus: normalizeExpertReviewStatus(
      sourceRecord.reviewStatus ?? sourceRecord.status,
      'submitted',
    ),
    totalScore,
    dimensionScores,
    badgeIds,
    badgeReason,
    overallOpinion,
    updatedAt: String(sourceRecord.updatedAt ?? sourceRecord.reviewedAt ?? '').trim(),
  };
}

function resetExpertReviewErrors(): void {
  expertDimensionForms.forEach((dimension) => {
    dimension.scoreError = '';
    dimension.reasonError = '';
  });
  selectedReviewBadgeReasonError.value = '';
  expertOverallOpinionError.value = '';
}

function buildExpertDimensionForms(
  dimensions: ExpertReviewDimensionDto[],
  detail?: SkillExpertReviewDetailDto | null,
): ExpertDimensionFormState[] {
  const scoreMap = new Map((detail?.dimensionScores ?? []).map((item) => [item.dimensionId, item]));

  return dimensions.map((dimension) => {
    const item = scoreMap.get(dimension.dimensionId);
    return {
      ...dimension,
      scoreText: typeof item?.score === 'number' ? formatScoreInput(item.score) : '',
      reason: String(item?.reason ?? ''),
      scoreError: '',
      reasonError: '',
    };
  });
}

function applyExpertReviewDetail(detail?: SkillExpertReviewDetailDto | null): void {
  const currentTaskId = activeTask.value?.skillId ?? '';
  expertReviewId.value = detail?.reviewId ?? (currentTaskId ? `review-${currentTaskId}` : '');
  expertReviewStatus.value = detail?.reviewStatus ?? 'pending';
  expertReviewUpdatedAt.value = detail?.updatedAt ?? '';
  selectedReviewBadgeIds.value = [...(detail?.badgeIds ?? [])];
  selectedReviewBadgeReason.value = String(detail?.badgeReason ?? '');
  selectedReviewBadgeReasonError.value = '';
  expertOverallOpinion.value = String(detail?.overallOpinion ?? '');
  expertOverallOpinionError.value = '';
  replaceReactiveArray(
    expertDimensionForms,
    buildExpertDimensionForms(expertReviewDimensions.value, detail),
  );

  const task = activeTask.value;
  if (task && detail?.reviewStatus === 'submitted' && typeof detail.totalScore === 'number') {
    const roundedTotal = roundToTwo(detail.totalScore);
    task.overallScore = roundedTotal;
    task.expertScore = formatFixedTwo(roundedTotal);
    task.hasReviewed = true;
  }
}

async function loadExpertReviewMeta(taskId: string): Promise<void> {
  const [dimensionRes, badgeRes] = await Promise.all([
    skillBaseService.getExpertReviewDimension(),
    skillBaseService.getReviewBadges(),
  ]);

  if (!serviceSucceeded(dimensionRes) || !Array.isArray(dimensionRes?.data)) {
    throw new Error(serviceMessage(dimensionRes, '专家评审维度加载失败'));
  }
  if (!serviceSucceeded(badgeRes) || !Array.isArray(badgeRes?.data)) {
    throw new Error(serviceMessage(badgeRes, '勋章列表加载失败'));
  }

  expertReviewDimensions.value = dimensionRes.data;
  badgeOptions.value = badgeRes.data;
  expertReviewMetaLoaded.value = true;

  await skillBaseService.getReviewHistory(taskId).then((res) => {
    if (res?.meta?.success && res?.data) {
      reviewHistoryRecords.value = res.data;
    }
  });
}

function applyReviewCenterShellData(data: ReviewCenterData): void {
  rankingCards.value = data.rankingCards;

  replaceReactiveArray(computeChannels, data.computeChannels);
  computeChannelTypes.value = data.computeChannelTypes;

  replaceReactiveArray(medalRows, data.medalRows);
  medalAwardTypes.value = data.medalAwardTypes;

  replaceReviewDimensionDetails(data.reviewDimensionDetails);

  greenChannelOptions.value = data.greenChannelOptions;
  selectedGreenChannel.value = greenChannelOptions.value[0] ?? '';

  overallReviewDimension.value = data.overallReviewDimension;
}

function clearActiveTaskReviewContext(): void {
  selectedSkillDetail.value = {};
  expertReviewId.value = '';
  expertReviewStatus.value = 'pending';
  expertReviewUpdatedAt.value = '';
  selectedReviewBadgeIds.value = [];
  selectedReviewBadgeReason.value = '';
  selectedReviewBadgeReasonError.value = '';
  expertOverallOpinion.value = '';
  expertOverallOpinionError.value = '';
  replaceReactiveArray(expertDimensionForms, []);
}

function normalizeReviewTaskTags(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(',');
  }

  return String(value ?? '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

function reviewTaskTags(task: ReviewTaskCard): string[] {
  return normalizeReviewTaskTags(readRecord(task).tags)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function reviewTaskVisibleTags(task: ReviewTaskCard): string[] {
  return reviewTaskTags(task).slice(0, REVIEW_TASK_VISIBLE_TAG_LIMIT);
}

function reviewTaskHiddenTags(task: ReviewTaskCard): string[] {
  return reviewTaskTags(task).slice(REVIEW_TASK_VISIBLE_TAG_LIMIT);
}

function reviewTaskHiddenTagText(task: ReviewTaskCard): string {
  return reviewTaskHiddenTags(task).join('、');
}

function reviewTaskDepartmentLabel(task: ReviewTaskCard): string {
  const record = readRecord(task);
  return String(record.departmentL6 ?? '').trim();
}

function reviewTaskMetaText(task: ReviewTaskCard): string {
  const owner = String(task.ownerUser || task.ownerName || task.owner || '').trim();
  return [owner, reviewTaskDepartmentLabel(task)].filter(Boolean).join(' · ');
}
function replaceReviewTasks(list: ReviewTaskCard[]): void {
  replaceReactiveArray(taskCards, list);
}

function appendReviewTasks(list: ReviewTaskCard[]): void {
  const existingIds = new Set(taskCards.map((task) => task.skillId));
  list.forEach((task) => {
    if (!existingIds.has(task.skillId)) {
      taskCards.push(task);
      existingIds.add(task.skillId);
    }
  });
}

function resetReviewTaskScrollState(): void {
  if (reviewTaskScrollRaf) {
    window.cancelAnimationFrame(reviewTaskScrollRaf);
    reviewTaskScrollRaf = 0;
  }
  if (reviewTaskPostRenderTimer) {
    window.clearTimeout(reviewTaskPostRenderTimer);
    reviewTaskPostRenderTimer = null;
  }
}

function resetReviewTaskListScrollPosition(): void {
  if (reviewTaskListRef.value) {
    reviewTaskListRef.value.scrollTop = 0;
  }
}

function reviewTaskRemainingScrollDistance(): number {
  const el = reviewTaskListRef.value;
  if (!el) {
    return Number.POSITIVE_INFINITY;
  }
  return el.scrollHeight - el.clientHeight - el.scrollTop;
}

function reviewTaskNearBottom(): boolean {
  const el = reviewTaskListRef.value;
  if (!el) {
    return false;
  }
  const prefetchDistance = Math.max(
    REVIEW_TASK_PREFETCH_MIN_DISTANCE,
    Math.floor(el.clientHeight * REVIEW_TASK_PREFETCH_VIEWPORT_RATIO),
  );
  return reviewTaskRemainingScrollDistance() <= prefetchDistance;
}

const reviewTaskHasMore = computed(() => taskCards.length < reviewTaskTotal.value);
const reviewTaskFooterHint = computed(() => {
  if (reviewTaskLoading.value && taskCards.length === 0) {
    return '正在加载评审 Skill...';
  }
  if (taskCards.length === 0) {
    return '暂无符合条件的评审 Skill';
  }
  if (reviewTaskLoading.value && taskCards.length > 0) {
    return `已加载 ${taskCards.length} 条 / 共 ${reviewTaskTotal.value} 条，正在加载更多...`;
  }
  if (reviewTaskHasMore.value) {
    return `已加载 ${taskCards.length} 条 / 共 ${reviewTaskTotal.value} 条，继续下拉加载更多`;
  }
  return `已加载全部 ${taskCards.length} 条评审 Skill`;
});

type ReviewTaskPageResult = {
  data?: ReviewCenterData;
  list: ReviewTaskCard[];
  total: number;
};

const isReviewFinalized = ref(false);
async function fetchReviewTaskPage(pageNum: number): Promise<ReviewTaskPageResult> {
  const params = syncReviewListFilterObj();

  if (reviewTransportIsHttp) {
    const response = await skillBaseService.getSkillReviewList({
      ...params,
      pageNum,
      pageSize: REVIEW_TASK_PAGE_SIZE,
    });
    if (!serviceSucceeded(response)) {
      throw new Error(serviceMessage(response, '评审 Skill 列表加载失败'));
    }

    const total = response.data.total;
    isReviewFinalized.value = response.data?.isFinalized ?? false;

    return {
      list: response.data.list,
      total: total,
    };
  }

  const data = await loadReviewCenterData(params, props.isExpertReviewer);
  const start = (pageNum - 1) * REVIEW_TASK_PAGE_SIZE;
  return {
    data,
    list: data.taskCards.slice(start, start + REVIEW_TASK_PAGE_SIZE).map((task) => ({ ...task })),
    total: data.taskCards.length,
  };
}

async function syncSelectedTaskAfterListChange(previousSelectedTaskId: string): Promise<void> {
  const nextSelectedTaskId = taskCards.some((task) => task.skillId === previousSelectedTaskId)
    ? previousSelectedTaskId
    : (taskCards[0]?.skillId ?? '');

  const shouldReloadDetail =
    Boolean(nextSelectedTaskId) &&
    (selectedTaskId.value !== nextSelectedTaskId ||
      String(selectedSkillDetail.value?.skillId ?? '') !== nextSelectedTaskId);

  selectedTaskId.value = nextSelectedTaskId;

  if (!nextSelectedTaskId) {
    clearActiveTaskReviewContext();
    return;
  }

  if (shouldReloadDetail) {
    await loadActiveTaskReviewContext(
      nextSelectedTaskId,
      taskCards.find((task) => task.skillId === nextSelectedTaskId).version,
    );
  }
}

async function loadReviewTaskPage(
  append = false,
  options: { resetScroll?: boolean } = {},
): Promise<void> {
  const requestToken = ++reviewTaskRequestToken;
  const targetPageNo = append ? reviewTaskPageNo.value + 1 : 1;
  const previousSelectedTaskId = selectedTaskId.value;

  if (!append) {
    resetReviewTaskScrollState();
  }

  reviewTaskLoading.value = true;
  try {
    const result = await fetchReviewTaskPage(targetPageNo);
    if (requestToken !== reviewTaskRequestToken) {
      return;
    }

    if (result.data && !append) {
      applyReviewCenterShellData(result.data);
    }

    if (append) {
      appendReviewTasks(result.list);
    } else {
      replaceReviewTasks(result.list);
    }

    reviewTaskPageNo.value = targetPageNo;
    reviewTaskTotal.value = Math.max(result.total, taskCards.length);

    await syncSelectedTaskAfterListChange(previousSelectedTaskId);
  } catch (error) {
    if (requestToken === reviewTaskRequestToken) {
      showToast(error instanceof Error ? error.message : '评审 Skill 列表加载失败');
    }
  } finally {
    if (requestToken !== reviewTaskRequestToken) {
      return;
    }
    reviewTaskLoading.value = false;
    await nextTick();

    if (!append && options.resetScroll) {
      resetReviewTaskListScrollPosition();
    }

    if (reviewTaskHasMore.value) {
      reviewTaskPostRenderTimer = window.setTimeout(() => {
        reviewTaskPostRenderTimer = null;
        scheduleReviewTaskLoadMoreCheck();
      }, REVIEW_TASK_POST_RENDER_CHECK_DELAY);
    }
  }
}

async function loadNextReviewTaskPageIfNeeded(): Promise<void> {
  if (reviewTaskLoading.value || !reviewTaskHasMore.value || !reviewTaskNearBottom()) {
    return;
  }
  await loadReviewTaskPage(true);
}

function scheduleReviewTaskLoadMoreCheck(): void {
  if (reviewTaskScrollRaf) {
    return;
  }
  reviewTaskScrollRaf = window.requestAnimationFrame(() => {
    reviewTaskScrollRaf = 0;
    void loadNextReviewTaskPageIfNeeded();
  });
}

function onReviewTaskListScroll(): void {
  scheduleReviewTaskLoadMoreCheck();
}
const activeTask = computed(
  () => taskCards.find((task) => task.skillId === selectedTaskId.value) ?? taskCards[0],
);

const selectedSkillDetail = ref<any>({});
const activeMetrics = computed(() => {
  const task = activeTask.value;
  if (!task) {
    return [];
  }

  return [
    // { label: '使用量', value: task.usage, tone: 'blue' },
    { label: '版本', value: task.version, tone: 'blue' },
    { label: '下载量', value: task.downloads, tone: 'cyan' },
    // {
    //   label: '专家评审得分',
    //   value: task.expertScore,
    //   tone: task.hasReviewed ? 'green' : 'indigo',
    // },
  ];
});

function buildRadarPoints(scale: number) {
  return aiReviewDimensions.value
    .map((_, index) => {
      const point = buildRadarPoint(index, aiReviewDimensions.value.length, 34 * scale);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

function buildRadarPoint(index: number, total: number, radius: number): RadarPoint {
  if (total <= 0) {
    return { x: '50.0', y: '50.0' };
  }

  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  const x = 50 + Math.cos(angle) * radius;
  const y = 50 + Math.sin(angle) * radius;
  return {
    x: x.toFixed(1),
    y: y.toFixed(1),
  };
}

function radarLabelTransform(index: number, total: number): string {
  if (total <= 0) {
    return 'translate(-50%, -50%)';
  }

  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  if (Math.abs(cos) < 0.28) {
    return sin < 0 ? 'translate(-50%, -70%)' : 'translate(-50%, -30%)';
  }

  return cos > 0 ? 'translate(0, -50%)' : 'translate(-100%, -50%)';
}

const aiReviewRadarGrid = computed(() => [0.25, 0.5, 0.75, 1].map(buildRadarPoints));
const aiReviewRadarPoints = computed(() => {
  const dimensionArr = selectedSkillDetail.value.aiScore?.dimensionScores
    ? [...selectedSkillDetail.value?.aiScore?.dimensionScores]
    : [];
  return (
    dimensionArr
      .map((dimension, index) => {
        const scale = dimension.score / (aiReviewDimensions.value[index]?.max_score ?? 100);
        const point = buildRadarPoint(index, aiReviewDimensions.value.length, 34 * scale);
        return `${point.x},${point.y}`;
      })
      .join(' ') ?? []
  );
});
const aiReviewRadarAxes = computed<RadarAxis[]>(() =>
  aiReviewDimensions.value.map((dimension, index) => ({
    key: dimension.key,
    ...buildRadarPoint(index, aiReviewDimensions.value.length, 34),
  })),
);
const aiReviewRadarLabels = computed<RadarLabel[]>(() =>
  aiReviewDimensions.value.map((dimension, index) => ({
    key: dimension.key,
    text: `${dimension.key} ${dimension.label}`,
    transform: radarLabelTransform(index, aiReviewDimensions.value.length),
    ...buildRadarPoint(index, aiReviewDimensions.value.length, 43),
  })),
);

const reviewVersionHistoryGroups = computed<ReviewVersionHistoryGroup[]>(() => {
  let groupMap = new Map<string, ReviewVersionHistoryGroup>();

  reviewHistoryRecords.value?.versionDetails?.forEach((record, index) => {
    const version = record.version;
    let group = groupMap.get(version);

    if (!group) {
      groupMap.set(version, record);
    }
  });

  return Array.from(groupMap);
});

const expertReviewTotalScoreValue = computed<number | null>(() => {
  return selectedSkillDetail.value?.currentUserReview?.overallScore ?? null;
});

const expertReviewTotalScoreText = computed(() => {
  const score = expertReviewTotalScoreValue.value;
  return score == null ? '待评' : expertReviewTotalScoreValue.value;
});

const expertReviewStatusText = computed(() => {
  if (expertReviewStatus.value === 'submitted') {
    return '已评';
  }
  if (expertReviewStatus.value === 'draft') {
    return '草稿';
  }
  return '待评';
});

function currentTaskReviewId(): string {
  return (
    expertReviewId.value || (activeTask.value?.skillId ? `review-${activeTask.value.skillId}` : '')
  );
}

function buildSubmittedExpertReviewDetailFromForm(source?: unknown): SkillExpertReviewDetailDto {
  const sourceRecord = readRecord(source);
  const currentReviewRecord = readRecord(sourceRecord.currentUserReview);
  const reviewRecord =
    Object.keys(currentReviewRecord).length > 0 ? currentReviewRecord : sourceRecord;
  const selectedDetailRecord = readRecord(selectedSkillDetail.value);
  const aiScoreRecord = readRecord(selectedDetailRecord.aiScore);

  return {
    reviewId: String(reviewRecord.reviewId ?? currentTaskReviewId()),
    skillId: String(reviewRecord.skillId ?? activeTask.value?.skillId ?? ''),
    aiScore: parseNullableNumber(aiScoreRecord.aiScore ?? selectedDetailRecord.aiScore) ?? 0,
    reviewStatus: normalizeExpertReviewStatus(
      reviewRecord.reviewStatus ?? reviewRecord.status,
      'submitted',
    ),
    dimensionScores: expertDimensionForms.map((dimension) => ({
      dimensionId: dimension.dimensionId,
      score: parseReviewScore(dimension.scoreText) ?? 0,
      reason: dimension.reason.trim(),
    })),
    badgeIds: [...selectedReviewBadgeIds.value],
    badgeReason:
      selectedReviewBadgeIds.value.length > 0 ? selectedReviewBadgeReason.value.trim() : '',
    overallOpinion: expertOverallOpinion.value.trim(),
    updatedAt: String(
      reviewRecord.updatedAt ??
        reviewRecord.reviewedAt ??
        new Date().toLocaleString('zh-CN', { hour12: false }),
    ),
  };
}

function onExpertDimensionScoreInput(dimensionId: string, event: Event): void {
  const target = event.target as HTMLInputElement;
  const dimension = expertDimensionForms.find((item) => item.dimensionId === dimensionId);
  if (!dimension) {
    return;
  }
  dimension.scoreText = sanitizeReviewScoreInput(target.value);
  dimension.scoreError = '';
}

function toggleReviewBadge(badgeId: string): void {
  if (selectedReviewBadgeIds.value.includes(badgeId)) {
    selectedReviewBadgeIds.value = selectedReviewBadgeIds.value.filter((item) => item !== badgeId);
  } else {
    selectedReviewBadgeIds.value = [...selectedReviewBadgeIds.value, badgeId];
  }
  if (selectedReviewBadgeIds.value.length === 0 || selectedReviewBadgeReason.value.trim()) {
    selectedReviewBadgeReasonError.value = '';
  }
}

function validateExpertReviewSubmission(): boolean {
  resetExpertReviewErrors();

  let hasMissing = false;
  let hasInvalidScore = false;
  let hasShortReason = false;

  expertDimensionForms.forEach((dimension) => {
    const scoreRaw = dimension.scoreText.trim();
    const reason = dimension.reason.trim();
    const parsedScore = parseReviewScore(scoreRaw);

    if (!scoreRaw || !reason) {
      hasMissing = true;
      if (!scoreRaw) {
        dimension.scoreError = '请填写该维度评分';
      }
      if (!reason) {
        dimension.reasonError = '请填写评分理由';
      }
      return;
    }

    if (parsedScore == null || parsedScore < 0 || parsedScore > 100) {
      hasInvalidScore = true;
      dimension.scoreError = '评分必须在0~100之间';
    }

    if (reason.length < 10) {
      hasShortReason = true;
      dimension.reasonError = '评分理由不少于10个字';
    }
  });

  if (hasMissing) {
    showToast('请完成所有评审维度的评分与评分理由');
    return false;
  }
  if (hasInvalidScore) {
    showToast('评分必须在0~100之间');
    return false;
  }
  if (hasShortReason) {
    showToast('评分理由不少于10个字');
    return false;
  }
  if (!expertOverallOpinion.value.trim()) {
    expertOverallOpinionError.value = '请填写整体评审意见';
    showToast('请填写整体评审意见');
    return false;
  }
  if (selectedReviewBadgeIds.value.length > 0 && !selectedReviewBadgeReason.value.trim()) {
    selectedReviewBadgeReasonError.value = '请选择勋章时请填写推荐理由';
    showToast('请选择勋章时请填写推荐理由');
    return false;
  }
  return true;
}

function buildExpertReviewSubmitPayload() {
  const badgeIds = [...selectedReviewBadgeIds.value];
  const badgeReason = badgeIds.length > 0 ? selectedReviewBadgeReason.value.trim() : '';
  const dimensions = expertDimensionForms.map((dimension) => ({
    dimensionId: dimension.dimensionId,
    score: parseReviewScore(dimension.scoreText) ?? 0,
    comment: dimension.reason.trim(),
  }));

  return {
    userId: props.userId,
    version: selectedSkillDetail.value?.skillInfo?.version ?? activeTask.value?.version ?? '',
    reviewId: currentTaskReviewId(),
    dimensions,
    reviewComment: expertOverallOpinion.value.trim(),
    badges: {
      badgeIds,
      reason: badgeReason,
    },
  };
}

async function loadActiveTaskReviewContext(taskId: string, version: string): Promise<void> {
  if (!taskId) {
    return;
  }
  const aiDimensionRes = await skillBaseService.getAIReviewDimension();
  if (aiDimensionRes?.meta?.success && aiDimensionRes?.data) {
    applyAiReviewDimensions(aiDimensionRes.data);
  }

  expertReviewLoading.value = true;
  try {
    await loadExpertReviewMeta(taskId);
    const skillDetailRes = await skillBaseService.getSkillReviewDetail(taskId, {
      userId: props.userId,
      version: version,
    });
    if (!serviceSucceeded(skillDetailRes) || !skillDetailRes?.data) {
      throw new Error(serviceMessage(skillDetailRes, '评审详情加载失败'));
    }
    selectedSkillDetail.value = skillDetailRes.data;
    applyExpertReviewDetail(normalizeCurrentUserReviewDetail(skillDetailRes.data));
  } catch (e) {
    selectedSkillDetail.value = {};
    applyExpertReviewDetail(null);
    showToast(e instanceof Error ? e.message : '评审详情加载失败');
  } finally {
    expertReviewLoading.value = false;
  }
}

async function selectTask(task: any) {
  selectedTaskId.value = task.skillId;
  await loadActiveTaskReviewContext(task.skillId, task.version);
}

async function submitExpertReview(): Promise<void> {
  if (!activeTask.value || expertReviewLoading.value || expertReviewSubmitting.value) {
    return;
  }
  if (!validateExpertReviewSubmission()) {
    return;
  }

  expertReviewSubmitting.value = true;
  try {
    const response = await skillBaseService.submitExpertReview(
      activeTask.value.skillId,
      buildExpertReviewSubmitPayload(),
    );
    if (!serviceSucceeded(response)) {
      showToast(serviceMessage(response, '提交失败'));
      return;
    }
    const detail =
      normalizeCurrentUserReviewDetail(response?.data) ??
      buildSubmittedExpertReviewDetailFromForm(response?.data);
    const responseRecord = readRecord(response?.data);
    const hasReturnedDetailShell =
      Object.prototype.hasOwnProperty.call(responseRecord, 'skillInfo') ||
      Object.prototype.hasOwnProperty.call(responseRecord, 'aiScore');
    const returnedCurrentUserReview = Object.prototype.hasOwnProperty.call(
      responseRecord,
      'currentUserReview',
    )
      ? responseRecord.currentUserReview
      : response?.data;
    selectedSkillDetail.value = {
      ...readRecord(selectedSkillDetail.value),
      ...(hasReturnedDetailShell ? responseRecord : {}),
      currentUserReview: returnedCurrentUserReview ?? detail,
    };
    applyExpertReviewDetail(detail);
    showToast('已提交评审意见');
    await selectTask(activeTask.value);
  } catch (e) {
    showToast(e instanceof Error ? e.message : '提交失败');
  } finally {
    expertReviewSubmitting.value = false;
  }
}

function filterTaskCardsByKeyword(keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return taskCards;
  }

  return taskCards.filter((task) => {
    return (
      task.name.toLowerCase().includes(normalized) ||
      task.ownerName.toLowerCase().includes(normalized) ||
      task.skillId.toLowerCase().includes(normalized)
    );
  });
}

const filteredSkillOptions = computed(() => filterTaskCardsByKeyword(skillSearchQuery.value));

const filteredComputeSkillOptions = computed(() =>
  filterTaskCardsByKeyword(computeSkillSearchQuery.value),
);

const isMedalAwardFormValid = computed(() => {
  return (
    Boolean(selectedAwardSkillId.value) &&
    selectedAwardMedalTypes.value.length > 0 &&
    awardMedalReason.value.trim().length > 0
  );
});

function closeMedalAwardModal() {
  isMedalAwardModalOpen.value = false;
}

function submitMedalAward() {
  if (!isMedalAwardFormValid.value) {
    return;
  }

  const task = taskCards.find((item) => item.skillId === selectedAwardSkillId.value);
  if (!task) {
    return;
  }

  const existingRow = medalRows.find((row) => row.name === task.name);
  if (existingRow) {
    selectedAwardMedalTypes.value.forEach((medalType) => {
      if (!existingRow.medals.includes(medalType)) {
        existingRow.medals.push(medalType);
      }
    });
    existingRow.count = existingRow.medals.length;
    existingRow.ownerName = task.ownerName;
  } else {
    medalRows.push({
      name: task.name,
      ownerName: task.ownerName,
      count: selectedAwardMedalTypes.value.length,
      medals: [...selectedAwardMedalTypes.value],
    });
  }

  closeMedalAwardModal();
}

const isComputeChannelFormValid = computed(() => {
  return (
    Boolean(selectedComputeSkillId.value) &&
    Boolean(selectedComputeChannelType.value) &&
    computeChannelReason.value.trim().length > 0
  );
});

function closeComputeChannelModal() {
  isComputeChannelModalOpen.value = false;
}

function submitComputeChannel() {
  if (!isComputeChannelFormValid.value) {
    return;
  }

  const task = taskCards.find((item) => item.skillId === selectedComputeSkillId.value);
  if (!task) {
    return;
  }

  const existingChannel = computeChannels.find((channel) => channel.skillId === task.skillId);
  if (existingChannel) {
    existingChannel.ownerName = task.ownerName;
    existingChannel.type = selectedComputeChannelType.value;
    existingChannel.status = '启用';
  } else {
    computeChannels.push({
      name: task.ownerName,
      id: task.skillId,
      type: selectedComputeChannelType.value,
      status: '启用',
    });
  }

  closeComputeChannelModal();
}

// 评审列表排序
const sortType = ref<'按下载量' | '按AI评分'>('按AI评分');
const sortTypeValue = computed(
  () => reviewSortList.value.find((item) => item.name === sortType.value)?.value ?? sortType.value,
);
const reviewSortList = ref<any>([
  { value: 'downloads', name: '按下载量' },
  { value: 'aiScore', name: '按AI评分' },
]);

// 审批状态相关
const reviewStatus = ref<'全部' | '待审批' | '已审批'>('全部');
const reviewStatusValue = computed(
  () =>
    reviewStatusList.value.find((item) => item.name === reviewStatus.value)?.value ??
    reviewStatus.value,
);
const reviewStatusList = ref([
  { value: 'ALL', name: '全部' },
  { value: 'PENDING', name: '待审批' },
  { value: 'REVIEWED', name: '已审批' },
]);
const selectedReviewCategoryId = ref('');

function formatReviewMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPreviousReviewMonth(): string {
  const now = new Date();
  return formatReviewMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

const currentReviewMonth = formatReviewMonth(new Date());
const fixedReviewMonth = getPreviousReviewMonth();
const fixedReviewMonthYear = Number(fixedReviewMonth.slice(0, 4));
const reviewMonthSelectionLocked = true;
const selectedReviewMonth = ref(fixedReviewMonth);
const reviewMonthPickerOpen = ref(false);
const reviewMonthViewYear = ref(fixedReviewMonthYear);
const reviewMonthPickerRef = ref<HTMLElement | null>(null);
const reviewMonthOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, '0');
  return {
    value,
    label: `${index + 1}月`,
  };
});
const selectedReviewMonthLabel = computed(() => {
  if (!selectedReviewMonth.value) {
    return '';
  }

  const [year, month] = selectedReviewMonth.value.split('-');
  if (!year || !month) {
    return '';
  }

  return `${year}-${month}`;
});

function reviewMonthValue(month: string): string {
  return `${reviewMonthViewYear.value}-${month}`;
}

function toggleReviewMonthPicker(): void {
  if (!reviewMonthPickerOpen.value) {
    reviewMonthViewYear.value = fixedReviewMonthYear;
  }

  reviewMonthPickerOpen.value = !reviewMonthPickerOpen.value;
}

function changeReviewMonthYear(delta: number): void {
  if (reviewMonthSelectionLocked) {
    return;
  }
  reviewMonthViewYear.value += delta;
}

function selectReviewMonth(month: string): void {
  if (!isReviewMonthSelectable(month)) {
    return;
  }
  selectedReviewMonth.value = reviewMonthValue(month);
  reviewMonthPickerOpen.value = false;
  void reloadReviewCenterTasks();
}

function clearReviewMonth(): void {
  const changed = Boolean(selectedReviewMonth.value);
  selectedReviewMonth.value = '';
  reviewMonthViewYear.value = fixedReviewMonthYear;
  reviewMonthPickerOpen.value = false;
  if (changed) {
    void reloadReviewCenterTasks();
  }
}

function isSelectedReviewMonth(month: string): boolean {
  return selectedReviewMonth.value === reviewMonthValue(month);
}

function isReviewMonthSelectable(month: string): boolean {
  return reviewMonthValue(month) === fixedReviewMonth;
}

function isCurrentReviewMonth(month: string): boolean {
  return currentReviewMonth === reviewMonthValue(month);
}

function handleReviewMonthOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (!reviewMonthPickerRef.value?.contains(target)) {
    reviewMonthPickerOpen.value = false;
  }
}

const reviewDepartmentTree = computed(() => props.departmentTree ?? []);
const reviewDepartmentSegments = ref<string[]>([]);
const departmentL3 = ref('');
const departmentL4 = ref('');
const departmentL5 = ref('');
const departmentL6 = ref('');
const departmentL7 = ref('');
const departmentL8 = ref('');
const reviewDepartmentLevelRefs = [
  departmentL3,
  departmentL4,
  departmentL5,
  departmentL6,
  departmentL7,
  departmentL8,
] as const;

function syncReviewDepartmentLevels(segments = reviewDepartmentSegments.value): void {
  reviewDepartmentLevelRefs.forEach((levelRef, index) => {
    levelRef.value = segments[index] ?? '';
  });
}

function reviewDepartmentLevelParams() {
  return {
    departmentL3: departmentL3.value,
    departmentL4: departmentL4.value,
    departmentL5: departmentL5.value,
    departmentL6: departmentL6.value,
    departmentL7: departmentL7.value,
    departmentL8: departmentL8.value,
  };
}

const reviewListFilterObj = reactive<any>({
  userId: '',
  reviewStatus: '',
  yearMonth: '',
  sortBy: '',
  category: null,
  departmentL3: '',
  departmentL4: '',
  departmentL5: '',
  departmentL6: '',
  departmentL7: '',
  departmentL8: '',
});

function syncReviewListFilterObj() {
  const nextParams = {
    userId: props.userId ?? '',
    reviewStatus: reviewStatusValue.value,
    yearMonth: selectedReviewMonthLabel.value,
    sortBy: sortTypeValue.value,
    category: selectedReviewCategoryId.value ?? '',
    ...reviewDepartmentLevelParams(),
  };

  Object.assign(reviewListFilterObj, nextParams);
  return { ...nextParams };
}

async function reloadReviewCenterTasks(): Promise<void> {
  await loadReviewTaskPage(false, { resetScroll: true });
}

function onReviewDepartmentChange(segments: string[]): void {
  syncReviewDepartmentLevels(segments);
}

async function onReviewDepartmentDone(segments: string[]): Promise<void> {
  syncReviewDepartmentLevels(segments);
  await reloadReviewCenterTasks();
}

async function onReviewDepartmentClear(): Promise<void> {
  reviewDepartmentSegments.value = [];
  syncReviewDepartmentLevels([]);
  await reloadReviewCenterTasks();
}

onMounted(async () => {
  await reloadReviewCenterTasks();
  document.addEventListener('mousedown', handleReviewMonthOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleReviewMonthOutsideClick);
  resetReviewTaskScrollState();
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
});
</script>

<template>
  <header class="admin-panel-head management-panel-head">
    <div>
      <h2 class="panel-title" style="font-size: 42px">优秀 Skill 评审</h2>
      <p class="all-desc">建议专家从创新设计、场景价值、工程质量等方面对 Skill 进行评审</p>
    </div>
  </header>
  <div class="review-center-page">
    <div class="review-shell">
      <section class="review-board" aria-label="评审任务">
        <div class="board-toolbar">
          <div class="board-toolbar__title">
            <h2>评审任务</h2>
            <p>按状态、月份和评分维度筛选专家待办。</p>
          </div>

          <div class="task-filter-panel" aria-label="任务筛选">
            <div class="toolbar-controls task-filter-controls">
              <label v-if="!isReviewFinalized" class="toolbar-filter">
                <span class="toolbar-filter__label">评审状态</span>
                <select
                  v-model="reviewStatus"
                  :placeholder="'请选择评审类型'"
                  size="lg"
                  @change="reloadReviewCenterTasks"
                >
                  <option
                    v-for="(option, index) in reviewStatusList"
                    :key="index"
                    :value="option.name"
                  >
                    {{ option.name }}
                  </option>
                </select>
              </label>
              <div class="toolbar-filter toolbar-filter--month">
                <span class="toolbar-filter__label">月度</span>
                <div ref="reviewMonthPickerRef" class="review-month-picker">
                  <div class="review-month-picker__control">
                    <button
                      type="button"
                      class="review-month-picker__trigger"
                      :class="{ 'is-empty': !selectedReviewMonth }"
                      aria-label="月度"
                      :aria-expanded="reviewMonthPickerOpen"
                      @click="toggleReviewMonthPicker"
                    >
                      <span class="review-month-picker__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M7 3v3M17 3v3M4.5 9.2h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <span class="review-month-picker__value">
                        {{ selectedReviewMonthLabel || '选择月度' }}
                      </span>
                      <span class="review-month-picker__arrow" aria-hidden="true" />
                    </button>
                    <button
                      v-if="selectedReviewMonth"
                      type="button"
                      class="review-month-picker__clear"
                      aria-label="清除月度"
                      :disabled="reviewMonthSelectionLocked"
                      @click.stop="clearReviewMonth"
                    >
                      ×
                    </button>
                  </div>

                  <div v-if="reviewMonthPickerOpen" class="review-month-picker__panel">
                    <div class="review-month-picker__head">
                      <button
                        type="button"
                        class="review-month-picker__year-btn"
                        aria-label="上一年"
                        :disabled="reviewMonthSelectionLocked"
                        @click="changeReviewMonthYear(-1)"
                      >
                        ‹
                      </button>
                      <strong>{{ reviewMonthViewYear }}年</strong>
                      <button
                        type="button"
                        class="review-month-picker__year-btn"
                        aria-label="下一年"
                        :disabled="reviewMonthSelectionLocked"
                        @click="changeReviewMonthYear(1)"
                      >
                        ›
                      </button>
                    </div>
                    <div class="review-month-picker__months">
                      <button
                        v-for="month in reviewMonthOptions"
                        :key="month.value"
                        type="button"
                        :disabled="
                          reviewMonthSelectionLocked && !isReviewMonthSelectable(month.value)
                        "
                        :class="[
                          'review-month-picker__month',
                          {
                            'is-selected': isSelectedReviewMonth(month.value),
                            'is-current': isCurrentReviewMonth(month.value),
                          },
                        ]"
                        @click="selectReviewMonth(month.value)"
                      >
                        {{ month.label }}
                      </button>
                    </div>
                    <div class="review-month-picker__foot">
                      <button
                        type="button"
                        :disabled="reviewMonthSelectionLocked"
                        @click="clearReviewMonth"
                      >
                        清除
                      </button>
                      <button type="button" @click="reviewMonthPickerOpen = false">关闭</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="toolbar-filter toolbar-filter--business">
                <span class="toolbar-filter__label">业务维度</span>
                <BusinessDimensionCascader
                  v-model="selectedReviewCategoryId"
                  class="review-business-dimension"
                  aria-label-prefix="评审业务维度"
                  @change="reloadReviewCenterTasks"
                />
              </div>
              <div class="toolbar-filter toolbar-filter--dept">
                <span class="toolbar-filter__label">部门</span>
                <MarketDeptCascader
                  v-model="reviewDepartmentSegments"
                  class="review-dept-cascader"
                  :tree="reviewDepartmentTree"
                  :max-level="6"
                  aria-label="评审部门级联筛选（DepartmentL1～DepartmentL6）"
                  @change="onReviewDepartmentChange"
                  @clear="onReviewDepartmentClear"
                  @done="onReviewDepartmentDone"
                />
              </div>
              <label class="toolbar-filter">
                <span class="toolbar-filter__label">排序</span>
                <select
                  v-model="sortType"
                  placeholder="请选择排序方式"
                  size="lg"
                  @change="reloadReviewCenterTasks"
                >
                  <option
                    v-for="(option, index) in reviewSortList"
                    :key="index"
                    :value="option.name"
                  >
                    {{ option.name }}
                  </option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div class="board-layout">
          <aside class="task-column" aria-label="Skill 任务列表">
            <div
              ref="reviewTaskListRef"
              class="task-list"
              aria-label="任务列表"
              @scroll="onReviewTaskListScroll"
            >
              <article
                v-for="task in taskCards"
                :key="task.skillId"
                class="task-card"
                :class="{ 'is-active': selectedTaskId === task.skillId }"
                role="button"
                tabindex="0"
                :aria-pressed="selectedTaskId === task.skillId"
                @click="selectTask(task)"
                @keydown.enter.prevent="selectTask(task)"
                @keydown.space.prevent="selectTask(task)"
              >
                <div class="task-card__title">{{ task.name }}</div>
                <div class="task-card__meta">{{ reviewTaskMetaText(task) }}</div>
                <div class="task-card__tags">
                  <span
                    v-for="tag in reviewTaskVisibleTags(task)"
                    :key="tag"
                    class="task-card__tag"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="reviewTaskHiddenTags(task).length > 0"
                    class="task-card__tag-more-wrap"
                  >
                    <button
                      type="button"
                      class="task-card__tag task-card__tag--more"
                      :aria-label="`更多标签：${reviewTaskHiddenTagText(task)}`"
                      @click.stop.prevent
                      @keydown.enter.stop.prevent
                      @keydown.space.stop.prevent
                    >
                      +{{ reviewTaskHiddenTags(task).length }}
                    </button>
                    <span class="task-card__tag-tooltip" role="tooltip">
                      <span
                        v-for="tag in reviewTaskHiddenTags(task)"
                        :key="`${task.skillId}-${tag}`"
                        class="task-card__tag task-card__tag--tooltip"
                      >
                        {{ tag }}
                      </span>
                    </span>
                  </span>
                </div>
              </article>
              <p class="task-list__status" role="status">
                {{ reviewTaskFooterHint }}
              </p>
            </div>
          </aside>

          <section class="skill-detail" aria-label="Skill 详情">
            <div class="review-detail-head">
              <div class="review-detail-tabs" role="tablist" aria-label="评审详情类型">
                <button
                  v-for="tab in reviewDetailTabs"
                  :id="`review-detail-tab-${tab}`"
                  :key="tab"
                  :class="{ 'is-active': activeReviewDetailTab === tab }"
                  type="button"
                  role="tab"
                  :aria-selected="activeReviewDetailTab === tab"
                  :aria-controls="`review-detail-panel-${tab}`"
                  @click="activeReviewDetailTab = tab"
                >
                  {{ tab }}
                </button>
              </div>

              <div class="metric-row" aria-label="Skill 数据概览">
                <span
                  v-for="metric in activeMetrics"
                  :key="metric.label"
                  :class="['metric-chip', `is-${metric.tone}`]"
                >
                  {{ metric.label }} {{ metric.value }}
                </span>
              </div>
            </div>

            <section
              v-show="activeReviewDetailTab === 'AI评审'"
              id="review-detail-panel-AI评审"
              class="ai-review-panel"
              role="tabpanel"
              aria-labelledby="review-detail-tab-AI评审"
            >
              <div class="ai-review-brief">
                <div class="ai-review-brief__icon">i</div>
                <div>
                  <h2>SKILL 评测维度说明</h2>
                  <p>
                    扶摇平台评测体系从技能边界定义完整性、接口规范完整性、异常与边界处理、规则一致性、安全与权限约束五个维度评估
                    Skill 质量
                  </p>
                </div>
              </div>

              <div class="ai-review-summary-card">
                <div class="ai-radar" aria-hidden="true">
                  <div class="ai-radar__stage">
                    <svg viewBox="0 0 100 100" role="img">
                      <polygon
                        v-for="points in aiReviewRadarGrid"
                        :key="points"
                        class="ai-radar__grid"
                        :points="points"
                      />
                      <line
                        v-for="axis in aiReviewRadarAxes"
                        :key="axis.key"
                        x1="50"
                        y1="50"
                        :x2="axis.x"
                        :y2="axis.y"
                      />
                      <polygon class="ai-radar__value" :points="aiReviewRadarPoints" />
                    </svg>
                    <span
                      v-for="label in aiReviewRadarLabels"
                      :key="label.key"
                      class="ai-radar__label"
                      :style="{
                        left: `${label.x}%`,
                        top: `${label.y}%`,
                        transform: label.transform,
                      }"
                    >
                      {{ label.text }}
                    </span>
                  </div>
                </div>
                <div class="ai-review-score">
                  <div>
                    <strong>{{ selectedSkillDetail?.aiScore?.aiScore ?? '暂无评分' }}</strong>
                    <span>/ 100</span>
                  </div>
                  <em v-if="selectedSkillDetail?.aiScore?.dimensionScores">{{
                    selectedSkillDetail?.aiScore?.dimensionScores
                      .map((item) => item.score)
                      .join('-')
                  }}</em>
                  <pre
                    v-if="selectedSkillDetail?.aiScore?.advices"
                    style="height: 120px; overflow: auto"
                    >{{
                      ('改进建议：\nSKILL.md: ' +
                        selectedSkillDetail?.aiScore?.advices?.['SKILL.md'] ?? '') +
                      '\nreferences: ' +
                      (selectedSkillDetail?.aiScore?.advices?.['references'] ?? '') +
                      '\nscripts: ' +
                      (selectedSkillDetail?.aiScore?.advices?.['scripts'] ?? '')
                    }}
                  </pre>
                </div>
              </div>

              <div class="ai-review-detail-card">
                <h2>评测详情</h2>
                <article
                  v-for="(dimension, index) in selectedSkillDetail?.aiScore?.dimensionScores ?? []"
                  :key="dimension.dimensionId"
                  :class="['ai-dimension-row', `is-${aiReviewDimensions[index]?.tone ?? 'blue'}`]"
                >
                  <div class="ai-dimension-row__header">
                    <span class="ai-dimension-row__icon">{{ index + 1 }}</span>
                    <strong>{{ aiReviewDimensions[index]?.label ?? dimension.dimensionId }}</strong>
                  </div>
                  <div class="ai-dimension-row__score">
                    <div class="ai-dimension-row__bar">
                      <span
                        :style="{
                          width: `${(dimension.score / (aiReviewDimensions[index]?.max_score ?? 100)) * 100}%`,
                        }"
                      ></span>
                    </div>
                    <strong
                      >{{ dimension.score }} / {{ aiReviewDimensions[index]?.max_score ?? 100 }}</strong
                    >
                  </div>
                  <p>{{ dimension.deductionBreakdown }}</p>
                </article>
              </div>
            </section>

            <section
              v-show="activeReviewDetailTab === '专家评审'"
              id="review-detail-panel-专家评审"
              class="expert-review expert-review--inline"
              role="tabpanel"
              aria-labelledby="review-detail-tab-专家评审"
            >
              <div class="expert-review__header">
                <div>
                  <p class="review-hero__eyebrow">Expert Score Detail</p>
                  <h2 id="expert-title">专家评审打分详情</h2>
                </div>
                <div class="expert-review__actions">
                  <button
                    type="button"
                    class="expert-review__action-btn--version-history"
                    @click="isVersionHistoryModalOpen = true"
                  >
                    历史版本评审记录
                  </button>
                  <button
                    type="button"
                    class="expert-review__action-btn--primary"
                    :disabled="expertReviewLoading || expertReviewSubmitting || isReviewFinalized"
                    @click="submitExpertReview"
                  >
                    {{ expertReviewSubmitting ? '提交中...' : '提交评审意见' }}
                  </button>
                </div>
              </div>

              <div class="expert-editor">
                <div v-if="expertReviewLoading" class="expert-review-state">评审详情加载中...</div>
                <div v-else-if="!expertDimensionForms.length" class="expert-review-state is-empty">
                  暂无评审维度，请稍后重试
                </div>
                <template v-else>
                  <div class="expert-score-summary">
                    <div class="expert-score-card">
                      <span class="expert-score-card__label">专家最终评分</span>
                      <div class="expert-score-card__value">
                        <strong>{{ expertReviewTotalScoreText }}</strong>
                        <span>分</span>
                      </div>
                      <p>系统按各维度得分与权重实时自动计算总分，专家不可手工修改。</p>
                    </div>
                    <dl class="expert-score-meta">
                      <div>
                        <dt>评审状态</dt>
                        <dd>{{ expertReviewStatusText }}</dd>
                      </div>
                      <div v-if="false">
                        <dt>评审单号</dt>
                        <dd>{{ currentTaskReviewId() || '—' }}</dd>
                      </div>
                      <div v-if="false">
                        <dt>最近保存</dt>
                        <dd>{{ expertReviewUpdatedAt || '未保存' }}</dd>
                      </div>
                    </dl>
                  </div>

                  <div class="expert-dimension-list">
                    <article
                      v-for="dimension in expertDimensionForms"
                      :key="dimension.dimensionId"
                      class="expert-dimension-card"
                    >
                      <header class="expert-dimension-card__header">
                        <div>
                          <h3>{{ dimension.name }}</h3>
                          <p>{{ dimension.description }}</p>
                        </div>
                        <span class="expert-dimension-card__weight">
                          权重 {{ formatWeightPercent(dimension.weight) }}
                        </span>
                      </header>

                      <div class="expert-dimension-card__body">
                        <label class="expert-field">
                          <span class="expert-field__label">评分</span>
                          <input
                            :id="`expert-score-${dimension.dimensionId}`"
                            :value="dimension.scoreText"
                            :disabled="isReviewFinalized"
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="请输入 0~100"
                            @input="onExpertDimensionScoreInput(dimension.dimensionId, $event)"
                          />
                          <span class="expert-field__hint">0 ~ 100，支持两位小数</span>
                          <span v-if="dimension.scoreError" class="expert-field__error">
                            {{ dimension.scoreError }}
                          </span>
                        </label>

                        <label class="expert-field expert-field--reason">
                          <span class="expert-field__label">评分理由</span>
                          <textarea
                            :id="`expert-reason-${dimension.dimensionId}`"
                            :disabled="isReviewFinalized"
                            v-model="dimension.reason"
                            placeholder="请说明该维度的评分依据、亮点与不足，至少 10 个字"
                            @input="dimension.reasonError = ''"
                          ></textarea>
                          <span class="expert-field__hint">
                            不少于 10 个字，用于说明为什么给出该分数
                          </span>
                          <span v-if="dimension.reasonError" class="expert-field__error">
                            {{ dimension.reasonError }}
                          </span>
                        </label>
                      </div>
                    </article>
                  </div>

                  <section class="expert-opinion-panel" aria-labelledby="expert-opinion-title">
                    <div class="expert-opinion-panel__header">
                      <div>
                        <h3 id="expert-opinion-title">整体评审意见</h3>
                        <p>用于补充整体判断、主要亮点、风险点和后续改进建议。</p>
                      </div>
                    </div>

                    <label class="expert-field">
                      <span class="expert-field__label">整体评审意见</span>
                      <textarea
                        v-model="expertOverallOpinion"
                        :disabled="isReviewFinalized"
                        placeholder="请从整体角度填写本次专家评审意见"
                        @input="expertOverallOpinionError = ''"
                      ></textarea>
                      <span class="expert-field__hint">
                        提交评审时必填，用于沉淀对该 Skill 的整体结论。
                      </span>
                      <span v-if="expertOverallOpinionError" class="expert-field__error">
                        {{ expertOverallOpinionError }}
                      </span>
                    </label>
                  </section>

                  <section class="expert-badge-panel" aria-labelledby="expert-badge-title">
                    <div class="expert-badge-panel__header">
                      <div>
                        <h3 id="expert-badge-title">勋章推荐</h3>
                        <p>支持多选，也可以不推荐勋章。</p>
                      </div>
                      <span class="expert-badge-panel__count">
                        已选 {{ selectedReviewBadgeIds.length }} 个
                      </span>
                    </div>

                    <div v-if="badgeOptions.length" class="expert-badge-grid">
                      <button
                        v-for="badge in badgeOptions"
                        :key="badge.badgeId"
                        type="button"
                        :disabled="isReviewFinalized"
                        class="expert-badge-card"
                        :class="{ 'is-selected': selectedReviewBadgeIds.includes(badge.badgeId) }"
                        :aria-pressed="selectedReviewBadgeIds.includes(badge.badgeId)"
                        @click="toggleReviewBadge(badge.badgeId)"
                      >
                        <span class="expert-badge-card__mark" aria-hidden="true">
                          {{ selectedReviewBadgeIds.includes(badge.badgeId) ? '✓' : '○' }}
                        </span>
                        <strong>{{ badge.name }}</strong>
                        <p>{{ badge.description }}</p>
                      </button>
                    </div>
                    <p v-else class="expert-review-state is-empty">暂无可推荐勋章</p>

                    <label class="expert-field expert-badge-panel__reason">
                      <span class="expert-field__label">勋章推荐理由</span>
                      <textarea
                        v-model="selectedReviewBadgeReason"
                        :disabled="isReviewFinalized || selectedReviewBadgeIds.length === 0"
                        :placeholder="
                          selectedReviewBadgeIds.length > 0
                            ? '请填写本次勋章推荐的整体理由；即使选择多个勋章，也只需填写一条理由'
                            : '选择至少一个勋章后再填写推荐理由'
                        "
                        @input="selectedReviewBadgeReasonError = ''"
                      ></textarea>
                      <span class="expert-field__hint">
                        选择 1 个或多个勋章时，共用同一条推荐理由；未选择勋章则无需填写。
                      </span>
                      <span v-if="selectedReviewBadgeReasonError" class="expert-field__error">
                        {{ selectedReviewBadgeReasonError }}
                      </span>
                    </label>
                  </section>
                </template>
              </div>
            </section>
          </section>
        </div>
      </section>
    </div>
    <div v-if="toast" class="review-toast" role="status" aria-live="polite">{{ toast }}</div>

    <Teleport to="body">
      <div
        v-if="isComputeChannelModalOpen"
        class="medal-award-overlay"
        role="presentation"
        @click.self="closeComputeChannelModal"
      >
        <div
          class="medal-award-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compute-channel-title"
        >
          <header class="medal-award-dialog__header">
            <div>
              <h2 id="compute-channel-title">为 Skill 增加算力</h2>
              <p>选择 Skill、算力通道类型并填写增加原因</p>
            </div>
            <button
              type="button"
              class="medal-award-dialog__close"
              aria-label="关闭"
              @click="closeComputeChannelModal"
            >
              关闭
            </button>
          </header>

          <form class="medal-award-form" @submit.prevent="submitComputeChannel">
            <fieldset class="medal-award-field">
              <legend>选择 Skill <span class="medal-award-field__required">*</span></legend>
              <input
                v-model="computeSkillSearchQuery"
                class="medal-award-search"
                type="search"
                placeholder="搜索 Skill 名称或工号"
                autocomplete="off"
              />
              <p v-if="!filteredComputeSkillOptions.length" class="medal-award-empty">
                未找到匹配的 Skill
              </p>
              <ul v-else class="medal-award-skill-list" role="radiogroup" aria-label="Skill 列表">
                <li v-for="skill in filteredComputeSkillOptions" :key="skill.skillId">
                  <label
                    class="medal-award-skill-option"
                    :class="{ 'is-selected': selectedComputeSkillId === skill.skillId }"
                  >
                    <input
                      v-model="selectedComputeSkillId"
                      type="radio"
                      name="compute-skill"
                      :value="skill.skillId"
                    />
                    <span class="medal-award-skill-option__main">
                      <strong>{{ skill.name }}</strong>
                      <span>{{ skill.ownerName }} · {{ skill.skillId }} · {{ skill.team }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>

            <fieldset class="medal-award-field">
              <legend>算力通道 <span class="medal-award-field__required">*</span></legend>
              <div class="medal-award-type-list medal-award-type-list--radio">
                <label
                  v-for="channelType in computeChannelTypes"
                  :key="channelType"
                  class="medal-award-type-option"
                >
                  <input
                    v-model="selectedComputeChannelType"
                    type="radio"
                    name="compute-channel-type"
                    :value="channelType"
                  />
                  <span>{{ channelType }}</span>
                </label>
              </div>
            </fieldset>

            <label class="medal-award-field medal-award-field--textarea">
              <span>增加算力原因 <span class="medal-award-field__required">*</span></span>
              <textarea
                v-model="computeChannelReason"
                rows="4"
                placeholder="请填写为该 Skill 增加算力的原因与说明"
              ></textarea>
            </label>

            <div class="medal-award-form__actions">
              <button
                type="button"
                class="medal-award-btn medal-award-btn--ghost"
                @click="closeComputeChannelModal"
              >
                取消
              </button>
              <button
                type="submit"
                class="medal-award-btn medal-award-btn--primary"
                :disabled="!isComputeChannelFormValid"
              >
                确认增加
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        v-if="isMedalAwardModalOpen"
        class="medal-award-overlay"
        role="presentation"
        @click.self="closeMedalAwardModal"
      >
        <div
          class="medal-award-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="medal-award-title"
        >
          <header class="medal-award-dialog__header">
            <div>
              <h2 id="medal-award-title">为 Skill 发放勋章</h2>
              <p>选择 Skill、勋章类型并填写发放理由</p>
            </div>
            <button
              type="button"
              class="medal-award-dialog__close"
              aria-label="关闭"
              @click="closeMedalAwardModal"
            >
              关闭
            </button>
          </header>

          <form class="medal-award-form" @submit.prevent="submitMedalAward">
            <fieldset class="medal-award-field">
              <legend>选择 Skill <span class="medal-award-field__required">*</span></legend>
              <input
                v-model="skillSearchQuery"
                class="medal-award-search"
                type="search"
                placeholder="搜索 Skill 名称或工号"
                autocomplete="off"
              />
              <p v-if="!filteredSkillOptions.length" class="medal-award-empty">
                未找到匹配的 Skill
              </p>
              <ul v-else class="medal-award-skill-list" role="radiogroup" aria-label="Skill 列表">
                <li v-for="skill in filteredSkillOptions" :key="skill.skillId">
                  <label
                    class="medal-award-skill-option"
                    :class="{ 'is-selected': selectedAwardSkillId === skill.skillId }"
                  >
                    <input
                      v-model="selectedAwardSkillId"
                      type="radio"
                      name="award-skill"
                      :value="skill.skillId"
                    />
                    <span class="medal-award-skill-option__main">
                      <strong>{{ skill.name }}</strong>
                      <span>{{ skill.ownerName }} · {{ skill.skillId }} · {{ skill.team }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>

            <fieldset class="medal-award-field">
              <legend>勋章类型 <span class="medal-award-field__required">*</span></legend>
              <div class="medal-award-type-list">
                <label
                  v-for="medalType in medalAwardTypes"
                  :key="medalType"
                  class="medal-award-type-option"
                >
                  <input v-model="selectedAwardMedalTypes" type="checkbox" :value="medalType" />
                  <span>{{ medalType }}</span>
                </label>
              </div>
            </fieldset>

            <label class="medal-award-field medal-award-field--textarea">
              <span>发勋章理由 <span class="medal-award-field__required">*</span></span>
              <textarea
                v-model="awardMedalReason"
                rows="4"
                placeholder="请填写发放该勋章的理由与依据"
              ></textarea>
            </label>

            <div class="medal-award-form__actions">
              <button
                type="button"
                class="medal-award-btn medal-award-btn--ghost"
                @click="closeMedalAwardModal"
              >
                取消
              </button>
              <button
                type="submit"
                class="medal-award-btn medal-award-btn--primary"
                :disabled="!isMedalAwardFormValid"
              >
                确认发放
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <div
      v-if="isVersionHistoryModalOpen"
      class="history-modal-overlay"
      role="presentation"
      @click.self="isVersionHistoryModalOpen = false"
    >
      <section
        class="history-modal version-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-modal-title"
      >
        <header class="history-modal__header">
          <div>
            <p>历史版本评审记录</p>
            <h2 id="version-history-modal-title">{{ activeTask?.name ?? 'Skill' }}</h2>
          </div>
          <button
            class="history-modal__close"
            type="button"
            aria-label="关闭历史版本评审记录"
            @click="isVersionHistoryModalOpen = false"
          >
            关闭
          </button>
        </header>

        <div class="history-modal__table-wrap version-history-modal__body">
          <div v-if="reviewVersionHistoryGroups.length === 0" class="version-history-empty">
            暂无历史版本评审记录
          </div>

          <section
            v-for="group in reviewVersionHistoryGroups"
            :key="group[0]"
            class="version-history-group"
          >
            <div class="version-history-group__header">
              <h3>{{ group[0] }}</h3>
              <span
                >{{
                  parseInt(group[1]?.expertReviews?.length + (group[1]?.aiScore?.aiModel ? 1 : 0))
                }}
                条记录</span
              >
            </div>
            <table class="version-history-table">
              <thead>
                <tr>
                  <th>评审人</th>
                  <th>评审时间</th>
                  <th style="width: 180px">各维度评分</th>
                  <th style="width: 132px">获得的勋章类型</th>
                  <th style="width: 50px">总分</th>
                  <th>整体评审意见</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="group[1].aiScore">
                  <td>
                    <div class="history-reviewer-cell">
                      <strong>{{ group[1].aiScore.aiModel }}</strong>
                      <span>AI评审</span>
                    </div>
                  </td>
                  <td class="history-time">{{ formatHistoryReviewTime(group[1].aiScore.evaluateTime) }}</td>
                  <td class="history-dimension-scores">
                    <pre class="history-dimension-pre">{{
                      group[1].aiScore.dimensionScores.reduce(
                        (pre, curr) =>
                          pre + `${dimensionField[curr.dimensionId]}维度得分: ${curr.score} \n`,
                        '',
                      )
                    }}</pre>
                  </td>
                  <td>-</td>
                  <td>
                    <strong class="history-total-score">{{ group[1].aiScore.aiScore }}</strong>
                  </td>
                  <td class="history-summary-cell">
                    <pre class="history-summary-pre">{{
                      `SKILL.md: ${group[1].aiScore.advices['SKILL.md']}\nreferences: ${group[1].aiScore.advices['references']}\nscripts:${group[1].aiScore.advices['scripts']}`
                    }}</pre>
                  </td>
                </tr>
                <tr v-for="(expertReview, index) in group[1].expertReviews" :key="index">
                  <td>
                    <div class="history-reviewer-cell">
                      <strong>{{ expertReview.expertUserId }}</strong>
                      <span>专家评审</span>
                    </div>
                  </td>
                  <td class="history-time">{{ formatHistoryReviewTime(expertReview.reviewedAt) }}</td>
                  <td class="history-dimension-scores">
                    <pre class="history-dimension-pre">{{
                      expertReview.dimensions.reduce(
                        (pre, curr) =>
                          pre +
                          `${expertReviewDimensions.find((iter) => iter.dimensionId === curr.dimensionId)?.name ?? ''}维度得分: ${curr.score} \n`,
                        '',
                      )
                    }}</pre>
                  </td>
                  <td>
                    <div
                      v-if="historyReviewBadgeIds(expertReview).length"
                      class="history-badge-icons"
                    >
                      <img
                        v-for="badgeId in historyReviewBadgeIds(expertReview)"
                        :key="badgeId"
                        :src="reviewBadgeImageSrc(badgeId)"
                        alt=""
                      />
                    </div>
                    <span v-else class="history-badge-empty">-</span>
                  </td>
                  <td>
                    <strong class="history-total-score">{{ expertReview.overallScore }}</strong>
                  </td>
                  <td class="history-summary-cell">
                    <pre class="history-summary-pre">{{ expertReview.reviewComment }}</pre>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/style/UserMarketShell.scss';
@use '@/style/skill/ReviewCenterPage.scss';
</style>

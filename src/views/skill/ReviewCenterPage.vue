<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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
  }>(),
  {
    userId: '',
    departmentTree: () => [],
  },
);

const rankingCards = ref<ReviewRankingCard[]>([]);
const taskCards = reactive<ReviewTaskCard[]>([]);

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
const expertReviewId = ref('');
const expertReviewStatus = ref<'pending' | 'draft' | 'submitted'>('pending');
const expertReviewUpdatedAt = ref('');
const expertReviewMetaLoaded = ref(false);
const expertReviewLoading = ref(false);
const expertReviewSaving = ref(false);
const expertReviewSubmitting = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof window.setTimeout> | null = null;
const isHistoryModalOpen = ref(false);
const isVersionHistoryModalOpen = ref(false);
const greenChannelOptions = ref<string[]>([]);
const selectedGreenChannel = ref(greenChannelOptions.value[0] ?? '');
const isGreenChannelSelectOpen = ref(false);
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

const maxAiReviewScore = 100;
const aiReviewDimensions = [
  {
    key: 'T',
    name: 'Trust',
    label: '技能边界完整性',
    score: 90,
    tone: 'green',
    summary:
      '双实验室交叉验证，未发现 P0/P1 级安全风险，文档全量英文可读；建议补齐中文说明和权限边界。',
  },
  {
    key: 'R',
    name: 'Reliability',
    label: '接口规范完整性',
    score: 92,
    tone: 'blue',
    summary: '核心流程稳定，异常输入与失败恢复路径描述较完整，能给新手明确的问题定位与修复指引。',
  },
  {
    key: 'A',
    name: 'Adaptability',
    label: '异常与边界处理',
    score: 90,
    tone: 'amber',
    summary: '适用场景、触发条件和不适用范围较清晰，支持自动提醒与手动记录两类使用方式。',
  },
  {
    key: 'C',
    name: 'Convention',
    label: '规则一致性',
    score: 88,
    tone: 'purple',
    summary: '目录结构清晰，模板示例丰富；主文档略密，新用户仍需要更明确的避坑指南。',
  },
  {
    key: 'E',
    name: 'Effectiveness',
    label: '安全与权限约束',
    score: 94,
    tone: 'red',
    summary: '能把可复用经验沉淀成稳定流程，对减少重复踩坑、沉淀团队知识有直接帮助。',
  },
];

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
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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

function resetExpertReviewErrors(): void {
  expertDimensionForms.forEach((dimension) => {
    dimension.scoreError = '';
    dimension.reasonError = '';
  });
  selectedReviewBadgeReasonError.value = '';
}

function buildExpertDimensionForms(
  dimensions: ExpertReviewDimensionDto[],
  detail?: SkillExpertReviewDetailDto | null,
): ExpertDimensionFormState[] {
  const scoreMap = new Map(
    (detail?.dimensionScores ?? []).map((item) => [item.dimensionId, item]),
  );

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
  replaceReactiveArray(expertDimensionForms, buildExpertDimensionForms(expertReviewDimensions.value, detail));

  const task = activeTask.value;
  if (task && detail?.reviewStatus === 'submitted' && typeof detail.totalScore === 'number') {
    const roundedTotal = roundToTwo(detail.totalScore);
    task.overallScore = roundedTotal;
    task.expertScore = formatFixedTwo(roundedTotal);
    task.hasReviewed = true;
  }
}

async function loadExpertReviewMeta(force = false): Promise<void> {
  if (expertReviewMetaLoaded.value && !force) {
    return;
  }

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
}

async function applyReviewCenterData(data: ReviewCenterData) {
  rankingCards.value = data.rankingCards;
  replaceReactiveArray(taskCards, data.taskCards);
  selectedTaskId.value = taskCards[0]?.skillId ?? '';

  replaceReactiveArray(computeChannels, data.computeChannels);
  computeChannelTypes.value = data.computeChannelTypes;

  replaceReactiveArray(medalRows, data.medalRows);
  medalAwardTypes.value = data.medalAwardTypes;

  replaceReviewDimensionDetails(data.reviewDimensionDetails);

  // badgeOptions.value = data.badgeOptions;
  // selectedPersonalMedals.value = [];

  greenChannelOptions.value = data.greenChannelOptions;
  selectedGreenChannel.value = greenChannelOptions.value[0] ?? '';

  overallReviewDimension.value = data.overallReviewDimension;
  reviewHistoryRecords.value = data.reviewHistoryRecords;

  if (taskCards[0]?.skillId) {
    await loadActiveTaskReviewContext(taskCards[0].skillId);
  } else {
    selectedSkillDetail.value = {};
    expertReviewId.value = '';
    expertReviewStatus.value = 'pending';
    expertReviewUpdatedAt.value = '';
    selectedReviewBadgeIds.value = [];
    selectedReviewBadgeReason.value = '';
    selectedReviewBadgeReasonError.value = '';
    replaceReactiveArray(expertDimensionForms, []);
  }
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
    { label: '下载量', value: task.downloads, tone: 'cyan' },
    // {
    //   label: '专家评审得分',
    //   value: task.expertScore,
    //   tone: task.hasReviewed ? 'green' : 'indigo',
    // },
  ];
});

function buildRadarPoints(scale: number) {
  return aiReviewDimensions
    .map((_, index) => {
      const point = buildRadarPoint(index, aiReviewDimensions.length, 34 * scale);
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
const aiReviewRadarPoints = computed(() =>
  aiReviewDimensions
    .map((dimension, index) => {
      const scale = dimension.score / maxAiReviewScore;
      const point = buildRadarPoint(index, aiReviewDimensions.length, 34 * scale);
      return `${point.x},${point.y}`;
    })
    .join(' '),
);
const aiReviewRadarAxes = computed<RadarAxis[]>(() =>
  aiReviewDimensions.map((dimension, index) => ({
    key: dimension.key,
    ...buildRadarPoint(index, aiReviewDimensions.length, 34),
  })),
);
const aiReviewRadarLabels = computed<RadarLabel[]>(() =>
  aiReviewDimensions.map((dimension, index) => ({
    key: dimension.key,
    text: `${dimension.key} ${dimension.label}`,
    transform: radarLabelTransform(index, aiReviewDimensions.length),
    ...buildRadarPoint(index, aiReviewDimensions.length, 43),
  })),
);
const aiReviewOverallScore = computed(() => {
  if (aiReviewDimensions.length === 0) {
    return '0';
  }

  const total = aiReviewDimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const score = Math.round((total / aiReviewDimensions.length) * 10) / 10;
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
});
const aiReviewDimensionDescription = computed(() => {
  const dimensionText = aiReviewDimensions
    .map((dimension) => `${dimension.label}（${dimension.name}）`)
    .join('、');
  return `SkillHub TRACE 评测体系当前包含 ${aiReviewDimensions.length} 个维度：${dimensionText}，用于评估 Skill 质量。当前结果为 AI 自动化检测 mock 数据，仅供专家评审前参考。`;
});
const aiReviewOverallSummary = computed(() => {
  const skillName = activeTask.value?.name ?? '该 Skill';
  return `${skillName} 的功能边界和使用流程比较完整，质量良好。主要优点是文档详细、使用灵活、支持多种 AI 工具协作；不足是部分辅助脚本仍偏简单，说明文本可以再贴近中文用户。`;
});

function formatOverallScore(score: number): string {
  const rounded = Math.round(score * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function historyRecordVersion(record: ReviewHistoryRecord, index: number): string {
  return record.reviewVersion ?? `v${Math.max(1, reviewHistoryRecords.value.length - index)}.0`;
}

const reviewVersionHistoryGroups = computed<ReviewVersionHistoryGroup[]>(() => {
  const groups: ReviewVersionHistoryGroup[] = [];
  const groupMap = new Map<string, ReviewVersionHistoryGroup>();

  reviewHistoryRecords.value.forEach((record, index) => {
    const version = historyRecordVersion(record, index);
    let group = groupMap.get(version);

    if (!group) {
      group = { version, records: [] };
      groupMap.set(version, group);
      groups.push(group);
    }

    group.records.push(record);
  });

  return groups;
});

function historyRecordType(record: ReviewHistoryRecord): string {
  if (record.reviewType) {
    return record.reviewType;
  }

  return record.reviewer.toLowerCase().includes('ai') ? 'AI评审' : '专家评审';
}

function historyRecordScores(record: ReviewHistoryRecord): string {
  return record.scores.map((score) => `${score.dimension} ${score.score}分`).join(' / ');
}

function historyRecordMedals(record: ReviewHistoryRecord): string {
  return record.medals.length ? record.medals.join('、') : '未获得';
}

function historyRecordTotalScore(record: ReviewHistoryRecord): string {
  if (record.totalScore != null) {
    return formatOverallScore(record.totalScore);
  }

  const totalScore = record.scores.find(
    (score) => score.dimension === overallReviewDimension.value || score.dimension.includes('总体'),
  )?.score;
  if (totalScore != null) {
    return formatOverallScore(totalScore);
  }

  if (!record.scores.length) {
    return '—';
  }

  const average =
    record.scores.reduce((scoreTotal, score) => scoreTotal + score.score, 0) / record.scores.length;
  return formatOverallScore(average);
}

const expertReviewTotalScore = computed(() => {
  if (expertDimensionForms.length === 0) {
    return null;
  }

  let total = 0;
  let hasScore = false;
  expertDimensionForms.forEach((dimension) => {
    const score = parseReviewScore(dimension.scoreText);
    if (score == null) {
      return;
    }
    hasScore = true;
    total += score * dimension.weight;
  });

  return hasScore ? roundToTwo(total) : null;
});

const expertReviewTotalScoreText = computed(() => {
  return expertReviewTotalScore.value == null ? '待评' : formatFixedTwo(expertReviewTotalScore.value);
});

const expertReviewStatusText = computed(() => {
  if (expertReviewStatus.value === 'submitted') {
    return '已提交';
  }
  if (expertReviewStatus.value === 'draft') {
    return '草稿中';
  }
  return '待评';
});

function currentTaskReviewId(): string {
  return expertReviewId.value || (activeTask.value?.skillId ? `review-${activeTask.value.skillId}` : '');
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

function buildExpertReviewDraftPayload() {
  const badgeIds = [...selectedReviewBadgeIds.value];
  const badgeReason = badgeIds.length > 0 ? selectedReviewBadgeReason.value.trim() : '';
  return {
    reviewId: currentTaskReviewId(),
    totalScore: expertReviewTotalScore.value,
    dimensionScores: expertDimensionForms.flatMap((dimension) => {
      const score = parseReviewScore(dimension.scoreText);
      const reason = dimension.reason.trim();
      if (score == null && !reason) {
        return [];
      }

      return [
        {
          dimensionId: dimension.dimensionId,
          ...(score != null ? { score } : {}),
          ...(reason ? { reason } : {}),
        },
      ];
    }),
    badgeIds,
    ...(badgeReason ? { badgeReason } : {}),
  };
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
  if (selectedReviewBadgeIds.value.length > 0 && !selectedReviewBadgeReason.value.trim()) {
    selectedReviewBadgeReasonError.value = '请选择勋章时请填写推荐理由';
    showToast('请选择勋章时请填写推荐理由');
    return false;
  }
  return true;
}

function buildExpertReviewSubmitPayload() {
  const totalScore = expertReviewTotalScore.value ?? 0;
  const badgeIds = [...selectedReviewBadgeIds.value];
  const badgeReason = badgeIds.length > 0 ? selectedReviewBadgeReason.value.trim() : '';
  return {
    reviewId: currentTaskReviewId(),
    totalScore,
    dimensionScores: expertDimensionForms.map((dimension) => ({
      dimensionId: dimension.dimensionId,
      score: parseReviewScore(dimension.scoreText) ?? 0,
      reason: dimension.reason.trim(),
    })),
    badgeIds,
    ...(badgeReason ? { badgeReason } : {}),
  };
}

function prependExpertReviewHistory(detail: SkillExpertReviewDetailDto): void {
  const badgeNames = detail.badgeIds.map(
    (badgeId) => badgeOptions.value.find((badge) => badge.badgeId === badgeId)?.name ?? badgeId,
  );
  const summaryParts = expertDimensionForms.map(
    (dimension) => `${dimension.name}：${dimension.reason.trim()}`,
  );
  if (badgeNames.length > 0 && detail.badgeReason?.trim()) {
    summaryParts.push(`勋章推荐：${badgeNames.join('、')}；理由：${detail.badgeReason.trim()}`);
  }
  const scores = expertDimensionForms.map((dimension) => ({
    dimension: dimension.name,
    score: parseReviewScore(dimension.scoreText) ?? 0,
    suggestion: dimension.reason.trim(),
  }));

  reviewHistoryRecords.value = [
    {
      id: `${detail.reviewId}-${detail.updatedAt ?? Date.now()}`,
      reviewType: '专家评审',
      reviewer: props.userId || '当前专家',
      reviewedAt: detail.updatedAt ?? new Date().toLocaleString('zh-CN', { hour12: false }),
      summary: summaryParts.join('；'),
      medals: badgeNames,
      totalScore: detail.totalScore ?? undefined,
      scores,
    },
    ...reviewHistoryRecords.value,
  ];
}

async function loadActiveTaskReviewContext(taskId: string): Promise<void> {
  if (!taskId) {
    return;
  }

  expertReviewLoading.value = true;
  try {
    await loadExpertReviewMeta();
    const skillDetailRes = await skillBaseService.getSkillReviewDetail(taskId, {
      userId: props.userId,
    });
    if (!serviceSucceeded(skillDetailRes) || !skillDetailRes?.data) {
      throw new Error(serviceMessage(skillDetailRes, '评审详情加载失败'));
    }
    selectedSkillDetail.value = skillDetailRes.data;
    applyExpertReviewDetail(skillDetailRes.data as SkillExpertReviewDetailDto);
  } catch (e) {
    selectedSkillDetail.value = {};
    applyExpertReviewDetail(null);
    showToast(e instanceof Error ? e.message : '评审详情加载失败');
  } finally {
    expertReviewLoading.value = false;
  }
}

async function selectTask(taskId: string) {
  selectedTaskId.value = taskId;
  await loadActiveTaskReviewContext(taskId);
}

async function saveExpertReviewDraft(): Promise<void> {
  if (!activeTask.value || expertReviewLoading.value || expertReviewSaving.value) {
    return;
  }

  expertReviewSaving.value = true;
  resetExpertReviewErrors();
  try {
    const response = await skillBaseService.saveExpertReviewDraft(
      activeTask.value.skillId,
      buildExpertReviewDraftPayload(),
    );
    if (!serviceSucceeded(response) || !response?.data) {
      showToast(serviceMessage(response, '草稿保存失败'));
      return;
    }
    selectedSkillDetail.value = response.data;
    applyExpertReviewDetail(response.data as SkillExpertReviewDetailDto);
    showToast('已保存草稿');
  } catch (e) {
    showToast(e instanceof Error ? e.message : '草稿保存失败');
  } finally {
    expertReviewSaving.value = false;
  }
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
    if (!serviceSucceeded(response) || !response?.data) {
      showToast(serviceMessage(response, '提交失败'));
      return;
    }
    const detail = response.data as SkillExpertReviewDetailDto;
    selectedSkillDetail.value = detail;
    applyExpertReviewDetail(detail);
    prependExpertReviewHistory(detail);
    showToast('已提交评审意见');
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

function openMedalAwardModal() {
  skillSearchQuery.value = '';
  selectedAwardSkillId.value = selectedTaskId.value || taskCards[0]?.skillId || '';
  selectedAwardMedalTypes.value = [];
  awardMedalReason.value = '';
  isMedalAwardModalOpen.value = true;
}

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

function openComputeChannelModal() {
  computeSkillSearchQuery.value = '';
  selectedComputeSkillId.value = selectedTaskId.value || taskCards[0]?.skillId || '';
  selectedComputeChannelType.value = computeChannelTypes.value[0] ?? '';
  computeChannelReason.value = '';
  isComputeChannelModalOpen.value = true;
}

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
const sortType = ref<'按下载量' | '按AI评分'>('按下载量');
const sortTypeValue = computed(
  () => reviewSortList.value.find((item) => item.name === sortType.value)?.value ?? sortType.value,
);
const reviewSortList = ref<any>([
  { value: 'downloads', name: '按下载量' },
  { value: 'aiScore', name: '按AI评分' },
]);

// 审批状态相关
const reviewStatus = ref<'全部' | '待审批' | '已审批'>('待审批');
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

const currentReviewYear = new Date().getFullYear();
const currentReviewMonth = formatReviewMonth(new Date());
const selectedReviewMonth = ref(getPreviousReviewMonth());
const reviewMonthPickerOpen = ref(false);
const reviewMonthViewYear = ref(currentReviewYear);
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
    reviewMonthViewYear.value = selectedReviewMonth.value
      ? Number(selectedReviewMonth.value.slice(0, 4))
      : currentReviewYear;
  }

  reviewMonthPickerOpen.value = !reviewMonthPickerOpen.value;
}

function changeReviewMonthYear(delta: number): void {
  reviewMonthViewYear.value += delta;
}

function selectReviewMonth(month: string): void {
  selectedReviewMonth.value = reviewMonthValue(month);
  reviewMonthPickerOpen.value = false;
  void reloadReviewCenterTasks();
}

function clearReviewMonth(): void {
  selectedReviewMonth.value = '';
  reviewMonthViewYear.value = currentReviewYear;
  reviewMonthPickerOpen.value = false;
  void reloadReviewCenterTasks();
}

function isSelectedReviewMonth(month: string): boolean {
  return selectedReviewMonth.value === reviewMonthValue(month);
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
const DepartmentL1 = ref('');
const DepartmentL2 = ref('');
const DepartmentL3 = ref('');
const DepartmentL4 = ref('');
const DepartmentL5 = ref('');
const DepartmentL6 = ref('');
const reviewDepartmentLevelRefs = [
  DepartmentL1,
  DepartmentL2,
  DepartmentL3,
  DepartmentL4,
  DepartmentL5,
  DepartmentL6,
] as const;

function syncReviewDepartmentLevels(segments = reviewDepartmentSegments.value): void {
  reviewDepartmentLevelRefs.forEach((levelRef, index) => {
    levelRef.value = segments[index] ?? '';
  });
}

function reviewDepartmentLevelParams() {
  return {
    DepartmentL1: DepartmentL1.value,
    DepartmentL2: DepartmentL2.value,
    DepartmentL3: DepartmentL3.value,
    DepartmentL4: DepartmentL4.value,
    DepartmentL5: DepartmentL5.value,
    DepartmentL6: DepartmentL6.value,
  };
}

const reviewListFilterObj = reactive<any>({
  userId: '',
  reviewStatus: '',
  yearMonth: '',
  sortBy: '',
  categoryId: null,
  DepartmentL1: '',
  DepartmentL2: '',
  DepartmentL3: '',
  DepartmentL4: '',
  DepartmentL5: '',
  DepartmentL6: '',
});

function syncReviewListFilterObj() {
  const nextParams = {
    userId: props.userId ?? '',
    reviewStatus: reviewStatusValue.value,
    yearMonth: selectedReviewMonthLabel.value,
    sortBy: sortTypeValue.value,
    categoryId: selectedReviewCategoryId.value ?? '',
    ...reviewDepartmentLevelParams(),
  };

  Object.assign(reviewListFilterObj, nextParams);
  return { ...nextParams };
}

const isExpertReviewer = ref(false);
const checkExpert = async () => {
  await skillBaseService.isReviewer({ userId: props.userId ?? '' }).then((res: any) => {
    if (res?.meta?.success && res?.data) {
      isExpertReviewer.value = res.data.isExpert;
    }
  });
};

async function reloadReviewCenterTasks(): Promise<void> {
  const params = syncReviewListFilterObj();
  const data = await loadReviewCenterData(params, isExpertReviewer.value);
  await applyReviewCenterData(data);
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
  await checkExpert();
  await reloadReviewCenterTasks();
  document.addEventListener('mousedown', handleReviewMonthOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleReviewMonthOutsideClick);
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
              <label class="toolbar-filter">
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
                        @click="changeReviewMonthYear(-1)"
                      >
                        ‹
                      </button>
                      <strong>{{ reviewMonthViewYear }}年</strong>
                      <button
                        type="button"
                        class="review-month-picker__year-btn"
                        aria-label="下一年"
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
                      <button type="button" @click="clearReviewMonth">清除</button>
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
            <div class="task-list" aria-label="任务列表">
              <article
                v-for="task in taskCards"
                :key="task.skillId"
                class="task-card"
                :class="{ 'is-active': selectedTaskId === task.skillId }"
                role="button"
                tabindex="0"
                :aria-pressed="selectedTaskId === task.skillId"
                @click="selectTask(task.skillId)"
                @keydown.enter.prevent="selectTask(task.skillId)"
                @keydown.space.prevent="selectTask(task.skillId)"
              >
                <div class="task-card__title">{{ task.name }}</div>
                <div class="task-card__meta">{{ task.ownerUser }} · {{ task.DepartmentL6 }}</div>
                <div class="task-card__tags">
                  <span v-for="tag in task.tags?.split(',') ?? []" :key="tag">{{ tag }}</span>
                </div>
              </article>
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
                    扶摇平台评测体系从技能边界定义完整性、接口规范完整性、异常与边界处理、规则一致性、安全与权限约束六个维度评估
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
                    <strong>{{ selectedSkillDetail.value?.aiScore / 100 }}</strong>
                    <span>/ 100</span>
                  </div>
                  <em>20-30-20-10-20</em>
                  <p>{{ aiReviewOverallSummary }}</p>
                </div>
              </div>

              <div class="ai-review-detail-card">
                <h2>评测详情</h2>
                <article
                  v-for="dimension in aiReviewDimensions"
                  :key="dimension.key"
                  :class="['ai-dimension-row', `is-${dimension.tone}`]"
                >
                  <div class="ai-dimension-row__header">
                    <span class="ai-dimension-row__icon">{{ dimension.key }}</span>
                    <strong>{{ dimension.key }} · {{ dimension.name }}</strong>
                    <em>{{ dimension.label }}</em>
                  </div>
                  <div class="ai-dimension-row__score">
                    <div class="ai-dimension-row__bar">
                      <span
                        :style="{ width: `${(dimension.score / maxAiReviewScore) * 100}%` }"
                      ></span>
                    </div>
                    <strong>{{ dimension.score }} / 100</strong>
                  </div>
                  <p>{{ dimension.summary }}</p>
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
                  <button type="button" @click="isHistoryModalOpen = true">历史评审记录</button>
                  <button
                    type="button"
                    class="expert-review__action-btn--draft"
                    :disabled="expertReviewLoading || expertReviewSaving"
                    @click="saveExpertReviewDraft"
                  >
                    {{ expertReviewSaving ? '保存中...' : '保存草稿' }}
                  </button>
                  <button
                    type="button"
                    class="expert-review__action-btn--primary"
                    :disabled="expertReviewLoading || expertReviewSubmitting"
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
                      <div>
                        <dt>评审单号</dt>
                        <dd>{{ currentTaskReviewId() || '—' }}</dd>
                      </div>
                      <div>
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
                        :disabled="selectedReviewBadgeIds.length === 0"
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
      v-if="isHistoryModalOpen"
      class="history-modal-overlay"
      role="presentation"
      @click.self="isHistoryModalOpen = false"
    >
      <section
        class="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        <header class="history-modal__header">
          <div>
            <p>历史评审记录</p>
            <h2 id="history-modal-title">{{ activeTask?.name ?? 'Skill' }}</h2>
          </div>
          <button
            class="history-modal__close"
            type="button"
            aria-label="关闭历史评审记录"
            @click="isHistoryModalOpen = false"
          >
            关闭
          </button>
        </header>

        <div class="history-modal__table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>评审版本号</th>
                <th>评审时间</th>
                <th>评审人</th>
                <th>各维度评分</th>
                <th>获得的勋章类型</th>
                <th>总分</th>
                <th>整体评审意见</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(record, index) in reviewHistoryRecords" :key="record.id">
                <td>
                  <strong class="history-version">{{ historyRecordVersion(record, index) }}</strong>
                </td>
                <td class="history-time">{{ record.reviewedAt }}</td>
                <td>
                  <div class="history-reviewer-cell">
                    <strong>{{ record.reviewer }}</strong>
                    <span>{{ historyRecordType(record) }}</span>
                  </div>
                </td>
                <td class="history-dimension-scores">{{ historyRecordScores(record) }}</td>
                <td>{{ historyRecordMedals(record) }}</td>
                <td>
                  <strong class="history-total-score">{{ historyRecordTotalScore(record) }}</strong>
                </td>
                <td class="history-summary-cell">{{ record.summary }}</td>
              </tr>
              <tr v-if="reviewHistoryRecords.length === 0">
                <td colspan="7" class="history-empty-cell">暂无历史评审记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

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
            :key="group.version"
            class="version-history-group"
          >
            <div class="version-history-group__header">
              <h3>{{ group.version }}</h3>
              <span>{{ group.records.length }} 条记录</span>
            </div>
            <table class="version-history-table">
              <thead>
                <tr>
                  <th>评审人</th>
                  <th>评审时间</th>
                  <th>各维度评分</th>
                  <th>获得的勋章类型</th>
                  <th>总分</th>
                  <th>整体评审意见</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in group.records" :key="record.id">
                  <td>
                    <div class="history-reviewer-cell">
                      <strong>{{ record.reviewer }}</strong>
                      <span>{{ historyRecordType(record) }}</span>
                    </div>
                  </td>
                  <td class="history-time">{{ record.reviewedAt }}</td>
                  <td class="history-dimension-scores">{{ historyRecordScores(record) }}</td>
                  <td>{{ historyRecordMedals(record) }}</td>
                  <td>
                    <strong class="history-total-score">{{
                      historyRecordTotalScore(record)
                    }}</strong>
                  </td>
                  <td class="history-summary-cell">{{ record.summary }}</td>
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
.review-center-page {
  min-height: 0;
  overflow: hidden;
  background: #f4f7fb;
  color: #17233d;
  font-size: 14px;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
}

.review-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto auto minmax(260px, 1fr) auto;
  align-items: center;
  gap: 24px;
  height: 70px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(25, 43, 75, 0.06);
  backdrop-filter: blur(10px);
}

.review-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #2563eb;
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.review-brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: #ffffff;
  font-size: 18px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
}

.review-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.review-nav__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  height: 42px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #1f2f4a;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.review-nav__item.is-active {
  border-color: #0f172a;
  background: #eef4ff;
  color: #1d4ed8;
}

.review-search {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: stretch;
  height: 46px;
  min-width: 260px;
  padding: 0 18px;
  border-radius: 24px;
  background: #eef2f7;
  color: #8aa0bd;
}

.review-search__icon {
  width: 14px;
  height: 14px;
  border: 2px solid #9aaaca;
  border-radius: 50%;
  position: relative;
  flex: 0 0 auto;
}

.review-search__icon::after {
  position: absolute;
  right: -6px;
  bottom: -5px;
  width: 7px;
  height: 2px;
  background: #9aaaca;
  border-radius: 999px;
  content: '';
  transform: rotate(45deg);
}

.review-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #263854;
  font: inherit;
}

.review-help {
  width: 32px;
  height: 32px;
  border: 2px solid #0f172a;
  border-radius: 50%;
  background: #ffffff;
  color: #0f172a;
  font-weight: 800;
}

.review-shell {
  display: block;
  min-height: 0;
}

.review-sidebar {
  display: none;
  padding: 24px 18px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.filter-section {
  margin-bottom: 24px;
}

.filter-section h2 {
  margin: 0 0 12px;
  color: #65748f;
  font-size: 15px;
  font-weight: 800;
}

.filter-pill,
.dimension-grid button {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.filter-pill {
  display: block;
  margin-bottom: 10px;
  text-align: left;
  padding: 0 16px;
}

.filter-pill.is-active {
  border-color: #bfdbfe;
  background: #eaf2ff;
  color: #2563eb;
}

.dimension-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.medal-filter-list {
  display: grid;
  gap: 8px;
}

.medal-filter-list span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  background: #ffffff;
  color: #52657f;
  font-weight: 700;
}

.review-main {
  padding: 24px 24px 40px;
  overflow: hidden;
}

.review-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 168px;
  padding: 30px 42px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 88% 18%, rgba(255, 255, 255, 0.2), transparent 22%),
    linear-gradient(115deg, #2f6bed 0%, #3553e7 54%, #4424b9 100%);
  color: #ffffff;
  box-shadow: 0 18px 36px rgba(47, 83, 226, 0.22);
}

.review-hero__eyebrow {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.review-hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
  letter-spacing: 0;
}

.review-hero p:not(.review-hero__eyebrow) {
  max-width: 760px;
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  line-height: 1.8;
}

.primary-action,
.expert-review__header button {
  min-width: 160px;
  height: 46px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(210px, 1fr));
  gap: 18px;
  margin-top: 22px;
}

.ranking-card,
.review-board,
.side-panel,
.expert-review {
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(25, 43, 75, 0.06);
}

.ranking-card {
  padding: 16px 16px 14px;
}

.ranking-card__header,
.board-toolbar,
.side-panel__header,
.expert-review__header,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ranking-card h2,
.board-toolbar h2,
.side-panel h2,
.expert-review h2 {
  margin: 0;
  color: #101828;
  font-size: 16px;
  line-height: 1.35;
}

.ranking-card__header button,
.side-panel__header button {
  width: 30px;
  height: 30px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #f8fbff;
  color: #5b6b84;
  font-weight: 800;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

th,
td {
  padding: 9px 6px;
  border-bottom: 1px solid #edf1f7;
  color: #40516d;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #6a7890;
  font-weight: 800;
}

.review-board {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 320px);
  min-height: 0;
  padding: 18px;
  overflow: hidden;
}

.board-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}

.board-toolbar__title {
  min-width: 0;
  padding-top: 4px;
}

.board-toolbar p {
  margin: 5px 0 0;
  color: #697890;
  font-size: 13px;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 12px;
  position: relative;
}

.toolbar-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar-filter__label {
  color: #65748f;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.toolbar-controls select,
.toolbar-controls input[type='month'],
.toolbar-controls button,
.expert-editor select {
  height: 38px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  color: #233752;
  font: inherit;
  font-weight: 700;
}

.toolbar-controls select,
.toolbar-controls input[type='month'] {
  min-width: 150px;
  padding: 0 10px;
}

.toolbar-controls input[type='month'] {
  box-sizing: border-box;
}

.toolbar-controls input[type='month']::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.72;
}

.toolbar-filter--month {
  position: relative;
}

.toolbar-filter--business {
  min-width: 0;
}

.review-business-dimension {
  width: 100%;
  min-width: 0;
}

.review-business-dimension :deep(.business-dimension-cascader__select) {
  min-height: 38px;
  height: 38px;
  padding: 0 34px 0 12px;
  border-color: #cad6e5;
  border-radius: 8px;
  color: #233752;
  font-size: 13px;
  font-weight: 700;
}

.review-business-dimension
  :deep(.business-dimension-cascader__control.has-clear .business-dimension-cascader__select) {
  padding-right: 62px;
}

.review-business-dimension :deep(.business-dimension-cascader__select:hover) {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.review-business-dimension :deep(.business-dimension-cascader__select:focus) {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.toolbar-filter--dept {
  min-width: 0;
}

.review-dept-cascader {
  width: 100%;
  min-width: 0;
}

.review-dept-cascader :deep(.market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  padding: 0 30px 0 10px;
  border-color: #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  color: #233752;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}

.review-dept-cascader :deep(.market-dept-cascader-trigger:hover) {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.review-dept-cascader :deep(.market-dept-cascader-trigger.is-open),
.review-dept-cascader :deep(.market-dept-cascader-trigger:focus) {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.review-dept-cascader :deep(.market-dept-cascader-caret) {
  right: 10px;
}

.review-month-picker {
  position: relative;
  width: 100%;
  min-width: 0;
}

.review-month-picker button {
  min-width: 0;
  padding: 0;
}

.review-month-picker__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.review-month-picker__trigger {
  width: 100%;
  min-width: 0;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 34px 0 11px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 251, 255, 0.98) 100%),
    linear-gradient(135deg, rgba(47, 125, 246, 0.14), rgba(117, 82, 255, 0.1));
  color: #233752;
  font: inherit;
  font-weight: 800;
  box-shadow:
    0 8px 20px rgba(37, 99, 235, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  cursor: pointer;
}

.review-month-picker__trigger:hover,
.review-month-picker__trigger[aria-expanded='true'] {
  border-color: #8bb8ff;
  background:
    linear-gradient(180deg, #ffffff 0%, #f5f9ff 100%),
    linear-gradient(135deg, rgba(47, 125, 246, 0.18), rgba(117, 82, 255, 0.14));
  box-shadow:
    0 10px 24px rgba(37, 99, 235, 0.1),
    0 0 0 3px rgba(47, 125, 246, 0.08);
}

.review-month-picker__trigger.is-empty {
  color: #8a98ad;
}

.review-month-picker__icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  display: inline-flex;
  color: #377df0;
}

.review-month-picker__icon svg {
  width: 18px;
  height: 18px;
}

.review-month-picker__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-month-picker__arrow {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 7px;
  height: 7px;
  border-right: 1.7px solid #64748b;
  border-bottom: 1.7px solid #64748b;
  transform: translateY(-68%) rotate(45deg);
}

.review-month-picker__clear {
  position: absolute;
  top: 25%;
  right: 27px;
  z-index: 2;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: #eef4ff;
  color: #64748b;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.review-month-picker__clear:hover {
  background: #fee2e2;
  color: #dc2626;
}

.review-month-picker__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 45;
  width: min(292px, calc(100vw - 48px));
  padding: 12px;
  border: 1px solid #dbe7ff;
  border-radius: 12px;
  background:
    radial-gradient(circle at 16% 0%, rgba(47, 125, 246, 0.08), transparent 36%),
    radial-gradient(circle at 88% 10%, rgba(117, 82, 255, 0.1), transparent 34%), #ffffff;
  box-shadow:
    0 22px 48px rgba(22, 34, 51, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.review-month-picker__head {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.review-month-picker__head strong {
  color: #10243e;
  font-size: 15px;
  font-weight: 900;
  text-align: center;
}

.review-month-picker__year-btn {
  width: 34px;
  height: 32px;
  border: 1px solid #dbe7ff;
  border-radius: 8px;
  background: #f8fbff;
  color: #2563eb;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.review-month-picker__year-btn:hover {
  border-color: #9ec5ff;
  background: #eef6ff;
}

.review-month-picker__months {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.review-month-picker__month {
  height: 34px;
  border: 1px solid #e6edf7;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.review-month-picker__month:hover {
  border-color: #9ec5ff;
  background: #eef6ff;
  color: #1d4ed8;
}

.review-month-picker__month.is-current {
  border-color: #bfdbfe;
  background: #f0f7ff;
  color: #2563eb;
}

.review-month-picker__month.is-selected {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2f7df6 0%, #7552ff 100%);
  color: #ffffff;
  box-shadow: 0 10px 20px rgba(47, 125, 246, 0.22);
}

.review-month-picker__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
}

.review-month-picker__foot button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid #dbe7ff;
  border-radius: 8px;
  background: #ffffff;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.review-month-picker__foot button:hover {
  border-color: #9ec5ff;
  color: #1d4ed8;
  background: #f8fbff;
}

.toolbar-controls button {
  min-width: 200px;
  padding: 0 14px;
}

.toolbar-controls .review-month-picker__trigger {
  min-width: 0;
  height: 38px;
  padding: 0 34px 0 11px;
}

.toolbar-controls .review-month-picker__clear {
  min-width: 0;
  width: 20px;
  height: 20px;
  padding: 0;
}

.toolbar-controls .review-month-picker__year-btn {
  min-width: 0;
  width: 34px;
  height: 32px;
  padding: 0;
}

.toolbar-controls .review-month-picker__month {
  min-width: 0;
  height: 34px;
  padding: 0;
}

.toolbar-controls .review-month-picker__foot button {
  min-width: 0;
  height: 30px;
  padding: 0 10px;
}

.board-layout {
  --review-workspace-h: auto;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
  flex: 1 1 auto;
  align-items: stretch;
  min-height: 0;
}

.task-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding-right: 8px;
  border-right: 1px solid #e2e8f0;
}

.task-filter-panel {
  flex: 0 0 auto;
  min-width: 0;
  padding: 10px 12px 12px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: linear-gradient(180deg, #fbfdff 0%, #f5f9ff 100%);
}

.task-filter-controls {
  display: grid;
  grid-template-columns:
    minmax(145px, 0.75fr) minmax(145px, 0.75fr) minmax(260px, 1.25fr)
    minmax(170px, 0.8fr) minmax(150px, 0.75fr);
  gap: 10px;
  align-items: end;
  justify-content: stretch;
}

.task-filter-controls .toolbar-filter,
.task-filter-controls select,
.task-filter-controls input[type='month'] {
  width: 100%;
  min-width: 0;
}

.task-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: auto;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.task-list::-webkit-scrollbar {
  width: 8px;
}

.task-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd5e1;
}

.task-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.task-card {
  flex: 0 0 auto;
  padding: 14px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  height: 135px;
  background: #ffffff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.task-card:hover {
  border-color: #93c5fd;
}

.task-card.is-active {
  border-color: #60a5fa;
  box-shadow: inset 4px 0 0 #3b82f6;
}

.task-card__title {
  color: #101828;
  font-size: 15px;
  font-weight: 800;
}

.task-card__meta {
  margin-top: 10px;
  color: #5e6d84;
  font-size: 13px;
}

.task-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.task-card__tags span {
  padding: 4px 8px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.skill-detail {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.review-detail-head {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
}

.metric-row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: min(315px, 100%);
  padding: 4px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #f8fafc;
  margin-right: 8px;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-weight: 800;
  white-space: nowrap;
}

.metric-chip.is-blue {
  border-color: #7dd3fc;
  background: #e0f2fe;
  color: #0369a1;
}

.metric-chip.is-cyan {
  border-color: #67e8f9;
  background: #ecfeff;
  color: #0e7490;
}

.metric-chip.is-indigo {
  border-color: #a5b4fc;
  background: #eef2ff;
  color: #4338ca;
}

.metric-chip.is-green {
  border-color: #86efac;
  background: #ecfdf5;
  color: #047857;
}

.review-detail-tabs {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #f8fafc;
}

.review-detail-tabs button {
  min-width: 112px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #52647d;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.review-detail-tabs button:hover {
  background: #edf4ff;
  color: #1d4ed8;
}

.review-detail-tabs button.is-active {
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.2);
}

.ai-review-panel {
  display: grid;
  flex: 1 1 auto;
  gap: 16px;
  align-content: start;
  width: 100%;
  min-width: 0;
  min-height: 0;
  margin-top: 12px;
  padding-right: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.ai-review-panel::-webkit-scrollbar,
.expert-review--inline::-webkit-scrollbar {
  width: 8px;
}

.ai-review-panel::-webkit-scrollbar-thumb,
.expert-review--inline::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd5e1;
}

.ai-review-panel::-webkit-scrollbar-thumb:hover,
.expert-review--inline::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.ai-review-brief,
.ai-review-summary-card,
.ai-review-detail-card {
  border: 1px solid #e0e7ff;
  border-radius: 10px;
  background: #ffffff;
  box-sizing: border-box;
}

.ai-review-brief {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  padding: 18px 20px;
  border-top: 4px solid #6366f1;
  background: linear-gradient(135deg, #f8fbff 0%, #fbf7ff 100%);
}

.ai-review-brief__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 20px;
  font-weight: 800;
}

.ai-review-brief h2,
.ai-review-detail-card h2 {
  margin: 0;
  color: #101828;
  font-size: 16px;
  line-height: 1.4;
}

.ai-review-brief p {
  margin: 8px 0 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.75;
}

.ai-review-brief__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
}

.ai-review-brief__meta span {
  position: relative;
  padding-left: 12px;
  color: #64748b;
  font-size: 13px;
}

.ai-review-brief__meta span::before {
  position: absolute;
  top: 0.62em;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
  content: '';
}

.ai-review-brief__meta button {
  flex-shrink: 0;
  min-width: 108px;
  height: 32px;
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.ai-review-summary-card {
  display: grid;
  grid-template-columns: minmax(245px, 360px) minmax(360px, 1.15fr);
  gap: 18px;
  padding: 22px;
  border-color: #edf1f7;
  box-shadow: 0 8px 22px rgba(25, 43, 75, 0.05);
}

.ai-radar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 245px;
  max-width: 360px;
}

.ai-radar__stage {
  position: relative;
  display: grid;
  place-items: center;
  width: min(240px, 100%);
  aspect-ratio: 1;
  overflow: visible;
}

.ai-radar svg {
  width: 76%;
  height: auto;
  overflow: visible;
}

.ai-radar__grid {
  fill: rgba(99, 102, 241, 0.05);
  stroke: #d9defd;
  stroke-width: 0.7;
}

.ai-radar line {
  stroke: #e1e7ff;
  stroke-width: 0.7;
}

.ai-radar__value {
  fill: rgba(99, 102, 241, 0.2);
  stroke: #6366f1;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.ai-radar__label {
  position: absolute;
  max-width: 118px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  white-space: normal;
  pointer-events: none;
}

.ai-review-score {
  // align-self: center;
  min-width: 0;
}

.ai-review-score div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.ai-review-score strong {
  color: #101828;
  font-size: 56px;
  font-weight: 800;
  line-height: 1;
}

.ai-review-score span {
  color: #94a3b8;
  font-size: 22px;
  font-weight: 700;
}

.ai-review-score em {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin-top: 12px;
  padding: 0 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}

.ai-review-score p {
  margin: 14px 0 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.8;
}

.ai-review-detail-card {
  padding: 18px 24px 6px;
  border-color: #edf1f7;
}

.ai-dimension-row {
  padding: 18px 0;
  border-top: 1px solid #eef2f7;
}

.ai-dimension-row:first-of-type {
  margin-top: 8px;
}

.ai-dimension-row__header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ai-dimension-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 15px;
  font-weight: 900;
}

.ai-dimension-row__header strong {
  color: #101828;
  font-size: 15px;
  white-space: nowrap;
}

.ai-dimension-row__header em {
  color: #64748b;
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}

.ai-dimension-row__score {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.ai-dimension-row__bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #f1f5f9;
}

.ai-dimension-row__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.ai-dimension-row__score strong {
  color: #334155;
  font-size: 14px;
  white-space: nowrap;
}

.ai-dimension-row p {
  margin: 12px 0 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.75;
}

.ai-dimension-row.is-green .ai-dimension-row__icon {
  background: #dcfce7;
  color: #059669;
}

.ai-dimension-row.is-green .ai-dimension-row__bar span {
  background: #22c55e;
}

.ai-dimension-row.is-blue .ai-dimension-row__icon {
  background: #dbeafe;
  color: #2563eb;
}

.ai-dimension-row.is-blue .ai-dimension-row__bar span {
  background: #38bdf8;
}

.ai-dimension-row.is-amber .ai-dimension-row__icon {
  background: #fef3c7;
  color: #d97706;
}

.ai-dimension-row.is-amber .ai-dimension-row__bar span {
  background: #facc15;
}

.ai-dimension-row.is-purple .ai-dimension-row__icon {
  background: #f3e8ff;
  color: #8b5cf6;
}

.ai-dimension-row.is-purple .ai-dimension-row__bar span {
  background: #c084fc;
}

.ai-dimension-row.is-red .ai-dimension-row__icon {
  background: #fee2e2;
  color: #ef4444;
}

.ai-dimension-row.is-red .ai-dimension-row__bar span {
  background: #f87171;
}

.skill-preview {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(240px, 1.1fr);
  gap: 12px;
  margin-top: 12px;
}

.file-tree,
.readme-preview {
  min-height: 146px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.file-tree strong,
.readme-preview strong {
  display: block;
  margin-bottom: 12px;
  color: #334155;
  font-size: 12px;
}

.file-tree ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: #53647d;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.8;
}

.file-tree li {
  padding-left: 16px;
  border-left: 2px solid #cbd5e1;
}

.file-tree li.is-selected {
  border-radius: 6px;
  background: #dbeafe;
  color: #1d4ed8;
}

.readme-preview h3 {
  margin: 0 0 12px;
  color: #1e293b;
  font-size: 20px;
}

.readme-preview p {
  margin: 0 0 10px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.structure-panel {
  margin-top: 20px;
}

.section-heading h3 {
  margin: 0;
  color: #101828;
  font-size: 17px;
}

.section-heading span {
  color: #708096;
  font-size: 13px;
}

.score-composer {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #fbfdff;
}

.score-scale {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  color: #64748b;
  font-weight: 800;
}

.score-scale__bar {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.score-scale__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #22c55e);
}

textarea {
  width: 100%;
  min-height: 104px;
  resize: vertical;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
  padding: 14px;
  color: #24364f;
  font: inherit;
  line-height: 1.7;
  outline: 0;
}

textarea:focus,
select:focus,
button:focus-visible,
input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.support-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.side-panel {
  padding: 16px;
}

.side-panel table span {
  display: block;
  margin-top: 4px;
  color: #7b8aa0;
  font-size: 12px;
}

.medal-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.medal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fbfdff;
}

.medal-row strong,
.medal-row span {
  display: block;
}

.medal-row strong {
  color: #17233d;
  font-size: 14px;
}

.medal-row span {
  margin-top: 4px;
  color: #697890;
  font-size: 12px;
}

.medal-icons {
  display: flex;
  gap: 6px;
}

.medal-icons span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff7ed;
  color: #c2410c;
  font-size: 13px;
  font-weight: 900;
}

.expert-review {
  max-width: 960px;
  margin: 28px auto 0;
  padding: 22px;
}

.expert-review--inline {
  flex: 1 1 auto;
  max-width: none;
  width: 100%;
  min-width: 0;
  min-height: 0;
  margin: 12px 0 0;
  padding: 16px 18px 18px;
  border-color: #e8eef5;
  box-shadow: none;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.expert-review--inline .expert-review__header {
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.expert-review--inline .expert-review__header .review-hero__eyebrow {
  margin: 0 0 4px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.expert-review--inline .expert-review__header h2 {
  font-size: 15px;
  font-weight: 700;
}

.expert-review--inline .expert-review__actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.expert-review--inline .expert-review__actions button {
  flex-shrink: 0;
  min-width: 108px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .expert-review__actions button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .expert-review__actions .expert-review__action-btn--version-history {
  min-width: 148px;
}

.expert-review--inline .expert-review__actions .expert-review__action-btn--draft {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.expert-review--inline .expert-review__actions .expert-review__action-btn--draft:hover {
  border-color: #93c5fd;
  background: #dbeafe;
}

.expert-review--inline .expert-review__actions .expert-review__action-btn--primary {
  min-width: 126px;
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.expert-review--inline .expert-review__actions .expert-review__action-btn--primary:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.expert-review--inline .expert-editor {
  margin-top: 0;
  min-width: 0;
  max-width: 100%;
  padding: 16px;
  border: 1px solid #e8eef5;
  border-radius: 10px;
  background: #fbfcfe;
  box-sizing: border-box;
  overflow: hidden;
}

.expert-review--inline .expert-dimension-summary {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #e8eef5;
  border-radius: 8px;
  background: #ffffff;
}

.expert-review--inline .score-input-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 18px 24px;
  border: 1px dashed #bfdbfe;
  border-radius: 8px;
  background: #f8fbff;
  text-align: center;
  box-sizing: border-box;
}

.expert-review--inline .score-input-panel.is-pending {
  border-color: #fcd34d;
  background: #fffbeb;
}

.expert-review--inline .score-input-panel__caption {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.expert-review--inline .score-input-panel__field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}

.expert-review--inline .score-input-panel__input-wrap {
  display: inline-flex;
  margin: 0;
}

.expert-review--inline .score-input-panel__display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 56px;
  padding: 0 10px;
  color: #1d4ed8;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  text-align: center;
}

.expert-review--inline .score-input-panel__display.is-empty {
  color: #94a3b8;
  font-size: 28px;
  font-weight: 600;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__display.is-empty {
  color: #b45309;
}

.expert-review--inline .score-input-panel__edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.expert-review--inline .score-input-panel__edit-btn:hover {
  border-color: #93c5fd;
  background: #f0f7ff;
  color: #2563eb;
}

.expert-review--inline .score-input-panel__edit-btn:focus-visible {
  outline: 0;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.expert-review--inline .score-input-panel__field input {
  width: 120px;
  height: 56px;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  outline: 0;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__field input {
  border-color: #fbbf24;
  color: #b45309;
}

.expert-review--inline .score-input-panel__field input::placeholder {
  color: #94a3b8;
  font-size: 24px;
  font-weight: 600;
}

.expert-review--inline .score-input-panel__field input:hover {
  border-color: #60a5fa;
}

.expert-review--inline .score-input-panel__field input:focus {
  border-color: #2563eb;
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.04),
    0 0 0 3px rgba(37, 99, 235, 0.16);
}

.expert-review--inline .score-input-panel__unit {
  color: #64748b;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}

.expert-review--inline .score-input-panel__range {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}

.expert-review--inline .score-input-panel__hint {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.4;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__hint {
  color: #b45309;
}

.visually-hidden {
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

.expert-review--inline .expert-editor__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  width: 100%;
  margin: 0 0 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.expert-review--inline .expert-editor__controls .medal-select,
.expert-review--inline .expert-editor__controls .green-channel-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.expert-review--inline .medal-select__label,
.expert-review--inline .green-channel-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.expert-review--inline .medal-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.expert-review--inline .medal-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .medal-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .medal-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.expert-review--inline .medal-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.expert-review--inline .medal-select__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 4px;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
}

.expert-review--inline .medal-select__option:hover {
  background: #f1f5f9;
}

.expert-review--inline .green-channel-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.expert-review--inline .green-channel-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .green-channel-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .green-channel-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.expert-review--inline .green-channel-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.expert-review--inline .green-channel-select__option {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.expert-review--inline .green-channel-select__option:hover,
.expert-review--inline .green-channel-select__option.is-selected {
  background: #f1f5f9;
}

.expert-review--inline .green-channel-select__option.is-selected {
  color: #1d4ed8;
  font-weight: 600;
}

.expert-review--inline .review-textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.expert-review--inline .review-textarea span {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.expert-review--inline .review-textarea textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 215px;
  padding: 10px 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
  resize: vertical;
}

.expert-review--inline .review-textarea textarea::placeholder {
  color: #94a3b8;
}

.expert-editor {
  margin-top: 0;
  min-width: 0;
  max-width: 100%;
  padding: 18px;
  border: 1px solid #e8eef5;
  border-radius: 10px;
  background: #fbfcfe;
  box-sizing: border-box;
  overflow: auto;
}

.expert-dimension-summary {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.dimension-score {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #eaf2ff;
  color: #1d4ed8;
}

.dimension-score--editable {
  border: 1px solid transparent;
}

.dimension-score--editable:focus-within {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

.dimension-score strong {
  font-size: 20px;
  line-height: 1;
}

.dimension-score input {
  width: 46px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1d4ed8;
  font: inherit;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}

.dimension-score span {
  margin-top: 4px;
  color: #53709b;
  font-size: 12px;
  font-weight: 800;
}

.expert-dimension-summary h3 {
  margin: 0;
  color: #17233d;
  font-size: 16px;
}

.expert-dimension-summary p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.dimension-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.dimension-checks span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
  font-weight: 800;
}

.expert-editor__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  width: 100%;
  margin: 0 0 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.expert-editor__controls label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  font-weight: 800;
}

.expert-editor__controls input {
  width: 20px;
  height: 20px;
  accent-color: #2563eb;
}

.medal-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.medal-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.medal-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.medal-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.medal-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.medal-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.medal-select__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 8px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
}

.medal-select__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 8px;
  border-radius: 7px;
  color: #253857;
  cursor: pointer;
}

.medal-select__option:hover {
  background: #eff6ff;
}

.green-channel-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.green-channel-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.green-channel-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.green-channel-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.green-channel-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.green-channel-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.green-channel-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.green-channel-select__option {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.green-channel-select__option:hover,
.green-channel-select__option.is-selected {
  background: #f1f5f9;
}

.green-channel-select__option.is-selected {
  color: #1d4ed8;
  font-weight: 600;
}

.expert-editor select {
  min-width: 260px;
  padding: 0 12px;
}

.review-textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.review-textarea span {
  display: block;
  margin-bottom: 10px;
  color: #334155;
  font-weight: 800;
}

.review-textarea textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 118px;
  box-sizing: border-box;
}

.expert-review--inline .expert-review__actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.expert-review-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 24px;
  border: 1px dashed #d7e3f3;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  color: #5b6f8f;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.expert-review-state.is-empty {
  min-height: 140px;
}

.expert-score-summary {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  gap: 16px;
  margin-bottom: 18px;
}

.expert-score-card {
  padding: 20px 22px;
  border: 1px solid #dbe8f8;
  border-radius: 16px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 34%),
    linear-gradient(180deg, #fefefe 0%, #f4f8ff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.expert-score-card__label {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #e8f1ff;
  color: #2156d8;
  font-size: 12px;
  font-weight: 700;
}

.expert-score-card__value {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 16px;
  color: #0f4ad8;
}

.expert-score-card__value strong {
  font-size: 50px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.expert-score-card__value span {
  padding-bottom: 6px;
  color: #4c6aa3;
  font-size: 18px;
  font-weight: 700;
}

.expert-score-card p {
  margin: 14px 0 0;
  color: #5f7292;
  font-size: 13px;
  line-height: 1.7;
}

.expert-score-meta {
  display: grid;
  gap: 12px;
  margin: 0;
}

.expert-score-meta div {
  padding: 16px 18px;
  border: 1px solid #e5edf7;
  border-radius: 14px;
  background: #ffffff;
}

.expert-score-meta dt {
  margin: 0 0 8px;
  color: #6b7f9f;
  font-size: 12px;
  font-weight: 600;
}

.expert-score-meta dd {
  margin: 0;
  color: #172554;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-word;
}

.expert-dimension-list {
  display: grid;
  gap: 16px;
}

.expert-dimension-card {
  padding: 18px;
  border: 1px solid #e3ebf6;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.08);
}

.expert-dimension-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.expert-dimension-card__header h3 {
  margin: 0;
  color: #12213f;
  font-size: 18px;
  font-weight: 700;
}

.expert-dimension-card__header p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.expert-dimension-card__weight {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.expert-dimension-card__body {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: 16px;
}

.expert-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.expert-field__label {
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.expert-field input,
.expert-field textarea {
  width: 100%;
  border: 1px solid #d5e0ee;
  border-radius: 12px;
  background: #ffffff;
  color: #1e293b;
  font: inherit;
  box-sizing: border-box;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.expert-field input {
  height: 46px;
  padding: 0 14px;
  font-size: 16px;
  font-weight: 600;
}

.expert-field textarea {
  min-height: 128px;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
}

.expert-field input::placeholder,
.expert-field textarea::placeholder {
  color: #94a3b8;
}

.expert-field input:hover,
.expert-field textarea:hover {
  border-color: #bfd0e6;
}

.expert-field input:disabled,
.expert-field textarea:disabled {
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}

.expert-field textarea:disabled::placeholder {
  color: #94a3b8;
}

.expert-field input:focus,
.expert-field textarea:focus {
  outline: 0;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.expert-field__hint {
  color: #7b8ba7;
  font-size: 12px;
  line-height: 1.5;
}

.expert-field__error {
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.expert-badge-panel {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid #e3ebf6;
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
}

.expert-badge-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.expert-badge-panel__header h3 {
  margin: 0;
  color: #12213f;
  font-size: 18px;
  font-weight: 700;
}

.expert-badge-panel__header p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
}

.expert-badge-panel__count {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #edf5ff;
  color: #1e40af;
  font-size: 12px;
  font-weight: 700;
}

.expert-badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.expert-badge-panel__reason {
  margin-top: 16px;
}

.expert-badge-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid #d9e5f4;
  border-radius: 14px;
  background: #ffffff;
  color: #1e293b;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.expert-badge-card:hover {
  border-color: #9ec5ff;
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(148, 163, 184, 0.16);
}

.expert-badge-card.is-selected {
  border-color: #2563eb;
  background: linear-gradient(180deg, #f3f8ff 0%, #ffffff 100%);
  box-shadow: 0 12px 20px rgba(37, 99, 235, 0.12);
}

.expert-badge-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 800;
}

.expert-badge-card strong {
  font-size: 15px;
  font-weight: 700;
}

.expert-badge-card p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.review-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 120;
  min-width: 240px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 13px 16px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.94);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.24);
}

.medal-award-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}

.medal-award-dialog {
  width: min(520px, 100%);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.medal-award-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #eef2f7;
}

.medal-award-dialog__header h2 {
  margin: 0;
  color: #101828;
  font-size: 17px;
  font-weight: 700;
}

.medal-award-dialog__header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.medal-award-dialog__close {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-dialog__close:hover {
  background: #f8fafc;
}

.medal-award-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.medal-award-field {
  margin: 0;
  padding: 0;
  border: 0;
}

.medal-award-field legend,
.medal-award-field > span {
  display: block;
  margin-bottom: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.medal-award-field__required {
  color: #dc2626;
}

.medal-award-search {
  width: 100%;
  height: 36px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}

.medal-award-search:focus {
  border-color: #3b82f6;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.medal-award-empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed #e2e8f0;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}

.medal-award-skill-list {
  display: grid;
  gap: 8px;
  max-height: 200px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.medal-award-skill-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.medal-award-skill-option:hover {
  border-color: #93c5fd;
  background: #f0f7ff;
}

.medal-award-skill-option.is-selected {
  border-color: #60a5fa;
  background: #eff6ff;
}

.medal-award-skill-option input {
  margin-top: 3px;
  accent-color: #2563eb;
}

.medal-award-skill-option__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.medal-award-skill-option__main strong {
  color: #101828;
  font-size: 14px;
}

.medal-award-skill-option__main span {
  color: #64748b;
  font-size: 12px;
}

.medal-award-type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.medal-award-type-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-type-option:has(input:checked) {
  border-color: #60a5fa;
  background: #eff6ff;
  color: #1d4ed8;
}

.medal-award-type-option input {
  accent-color: #2563eb;
}

.medal-award-type-list--radio .medal-award-type-option {
  min-width: 120px;
  justify-content: center;
}

.medal-award-field--textarea textarea {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}

.medal-award-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.medal-award-btn {
  min-width: 88px;
  height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-btn--ghost {
  border: 1px solid #d7e0ec;
  background: #ffffff;
  color: #475569;
}

.medal-award-btn--ghost:hover {
  background: #f8fafc;
}

.medal-award-btn--primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.medal-award-btn--primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.medal-award-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(15, 23, 42, 0.28);
}

.history-modal {
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100vw - 56px));
  max-height: min(720px, calc(100vh - 56px));
  overflow: hidden;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.2);
}

.history-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  border-bottom: 1px solid #e5edf7;
}

.history-modal__header p {
  margin: 0 0 6px;
  color: #5d78a5;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.history-modal__header h2 {
  margin: 0;
  color: #101828;
  font-size: 20px;
  line-height: 1.35;
}

.history-modal__close {
  flex: 0 0 auto;
  min-width: 64px;
  height: 34px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #f8fbff;
  color: #253857;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.history-modal__table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 18px 20px;
  overflow: auto;
}

.history-table {
  min-width: 980px;
  margin: 0;
  table-layout: fixed;
}

.history-table th,
.history-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #edf1f7;
  vertical-align: top;
  white-space: normal;
}

.history-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
}

.history-table th:nth-child(1) {
  width: 112px;
}

.history-table th:nth-child(2) {
  width: 150px;
}

.history-table th:nth-child(3) {
  width: 140px;
}

.history-table th:nth-child(4) {
  width: 300px;
}

.history-table th:nth-child(5) {
  width: 140px;
}

.history-table th:nth-child(6) {
  width: 86px;
}

.history-table th:nth-child(7) {
  width: 260px;
}

.history-version,
.history-total-score {
  color: #1d4ed8;
  font-size: 14px;
}

.history-time {
  color: #52647d;
  font-size: 13px;
}

.history-reviewer-cell {
  display: grid;
  gap: 6px;
}

.history-reviewer-cell strong {
  color: #17233d;
}

.history-reviewer-cell span {
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 800;
}

.history-dimension-scores,
.history-summary-cell {
  color: #475569;
  line-height: 1.7;
}

.history-empty-cell {
  padding: 32px 16px;
  color: #64748b;
  text-align: center;
}

.version-history-modal {
  width: min(1180px, calc(100vw - 56px));
}

.version-history-modal__body {
  display: grid;
  gap: 16px;
}

.version-history-group {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.version-history-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e8eef5;
  background: #f8fafc;
}

.version-history-group__header h3 {
  margin: 0;
  color: #17233d;
  font-size: 15px;
  font-weight: 800;
}

.version-history-group__header span {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.version-history-table {
  width: 100%;
  min-width: 980px;
  margin: 0;
  table-layout: fixed;
  border-collapse: collapse;
}

.version-history-table th,
.version-history-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #edf1f7;
  vertical-align: top;
  white-space: normal;
}

.version-history-table tr:last-child td {
  border-bottom: 0;
}

.version-history-table th {
  background: #ffffff;
  color: #64748b;
  font-size: 12px;
  text-align: left;
}

.version-history-table th:nth-child(1) {
  width: 140px;
}

.version-history-table th:nth-child(2) {
  width: 150px;
}

.version-history-table th:nth-child(3) {
  width: 300px;
}

.version-history-table th:nth-child(4) {
  width: 140px;
}

.version-history-table th:nth-child(5) {
  width: 86px;
}

.version-history-table th:nth-child(6) {
  width: 260px;
}

.version-history-empty {
  padding: 32px 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  text-align: center;
}

@media (max-width: 1440px) {
  .ranking-grid {
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }

  .board-layout {
    grid-template-columns: 280px minmax(360px, 1fr);
  }

  .support-column {
    flex-direction: row;
    flex-wrap: wrap;
    grid-column: 1 / -1;
    height: auto;
  }

  .support-column .side-panel {
    flex: 1 1 260px;
  }
}

@media (max-width: 1120px) {
  .review-topbar {
    grid-template-columns: 1fr auto;
    height: auto;
    padding: 16px 20px;
  }

  .review-nav,
  .review-search {
    grid-column: 1 / -1;
  }

  .review-search {
    min-width: 0;
  }

  .review-shell {
    grid-template-columns: 1fr;
  }

  .review-sidebar {
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .review-main {
    padding: 22px 18px 36px;
  }

  .board-toolbar {
    grid-template-columns: 1fr;
  }

  .task-filter-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .review-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 820px) {
  .review-nav {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .ranking-grid,
  .support-column,
  .skill-preview,
  .board-layout {
    grid-template-columns: 1fr;
  }

  .board-layout {
    --review-workspace-h: 360px;
  }

  .task-filter-controls {
    grid-template-columns: 1fr;
  }

  .task-column {
    padding-right: 0;
    border-right: 0;
  }

  .task-list {
    max-height: var(--review-workspace-h);
  }

  .board-toolbar,
  .expert-review__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-controls,
  .toolbar-filter,
  .toolbar-controls select,
  .toolbar-controls input[type='month'],
  .toolbar-controls button,
  .primary-action,
  .expert-review__header button {
    width: 100%;
  }

  .expert-review__actions {
    width: 100%;
  }

  .review-detail-head {
    align-items: stretch;
    flex-direction: column;
  }

  .metric-row {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }

  .review-detail-tabs {
    width: 100%;
  }

  .review-detail-tabs button {
    flex: 1 1 120px;
  }

  .ai-review-brief,
  .ai-review-summary-card {
    grid-template-columns: 1fr;
  }

  .ai-review-brief__meta {
    align-items: flex-start;
    flex-direction: column;
  }

  .ai-review-brief__meta button {
    width: 100%;
  }

  .ai-radar {
    min-height: 230px;
  }

  .ai-review-score strong {
    font-size: 44px;
  }

  .ai-dimension-row__header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .review-hero {
    padding: 28px;
  }

  .review-hero h1 {
    font-size: 32px;
  }

  .medal-select,
  .medal-select__control,
  .green-channel-select,
  .green-channel-select__control {
    width: 100%;
  }

  .expert-editor__controls,
  .expert-review--inline .expert-editor__controls {
    grid-template-columns: 1fr;
  }

  .expert-editor__controls .medal-select,
  .expert-editor__controls .green-channel-select,
  .expert-review--inline .expert-editor__controls .medal-select,
  .expert-review--inline .expert-editor__controls .green-channel-select {
    grid-template-columns: 1fr;
  }

  .expert-review--inline .expert-editor__controls {
    grid-template-columns: 1fr;
  }

  .expert-review--inline .expert-editor__controls .medal-select,
  .expert-review--inline .expert-editor__controls .green-channel-select {
    grid-template-columns: 1fr;
  }

  .expert-score-summary,
  .expert-dimension-card__body {
    grid-template-columns: 1fr;
  }

  .expert-badge-panel__header,
  .expert-dimension-card__header {
    flex-direction: column;
  }

  .expert-score-card__value strong {
    font-size: 40px;
  }

  .review-toast {
    top: 16px;
    right: 16px;
    left: 16px;
    min-width: 0;
    max-width: none;
  }

  .history-modal-overlay {
    padding: 14px;
  }

  .history-modal {
    width: calc(100vw - 28px);
    max-height: calc(100vh - 28px);
  }

  .history-modal__header {
    align-items: stretch;
    flex-direction: column;
  }

  .history-modal__close {
    width: 100%;
  }
}
</style>

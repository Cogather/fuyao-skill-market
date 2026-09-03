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
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

type DetailFileState = {
  path: string;
  content: string;
  loaded: boolean;
  loading: boolean;
  error: string;
};

type DetailTab = 'detail' | 'evaluation';

type EvaluationDimensionScore = {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  confidence: string;
  confidenceLabel: string;
  lowConfidence: boolean;
  evidence: string;
  rationale: string;
  rawScore: number | null;
  adjustedByPrecheck: boolean;
  adjustmentReason: string;
  derivationReason: string;
  glossary: string;
};

type EvaluationIssueSeverity = 'high' | 'medium' | 'low' | 'suggestion';

type EvaluationIssue = {
  id: string;
  severity: EvaluationIssueSeverity;
  severityLabel: string;
  title: string;
  description: string;
  evidence: string;
  dimension: string;
};

type EvaluationAdvice = {
  key: string;
  value: string;
  metaLabel: string;
};

type SkillEvaluation = {
  skillName: string;
  version: string;
  taskId: string;
  state: string;
  model: string;
  evaluatedAt: string;
  total: number;
  maxScore: number;
  percent: number;
  grade: string;
  pattern: string;
  patternLabel: string;
  knowledgeRatio: Record<'E' | 'A' | 'R', number | null>;
  knowledgeRatioGlossary: string;
  dimensions: EvaluationDimensionScore[];
  improvements: EvaluationAdvice[];
  top3Improvements: string[];
  issues: EvaluationIssue[];
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
const activeTab = ref<DetailTab>('detail');
const evaluation = ref<SkillEvaluation | null>(null);
const evaluationLoading = ref(false);
const evaluationError = ref('');
const showAllEvaluationAdvices = ref(false);
const showAllEvaluationIssues = ref(false);
let detailLoadSequence = 0;
let evaluationLoadSequence = 0;

const selectedVersionRecord = computed<SkillMasterVersion | null>(() => {
  return detailVersions.value.find((item) => item.version === selectedVersion.value) || null;
});

const evaluationGrade = computed(() => {
  const apiGrade = evaluation.value?.grade.trim().toUpperCase() ?? '';
  const percent = evaluation.value?.percent ?? 0;
  return apiGrade || (percent >= 90 ? 'A' : percent >= 80 ? 'B' : percent >= 70 ? 'C' : 'D');
});

const evaluationScoreRingStyle = computed(() => {
  const score = Math.min(100, Math.max(0, evaluation.value?.percent ?? 0));
  return {
    background: `conic-gradient(#6677f7 0 ${score}%, #e8ecf7 ${score}% 100%)`,
  };
});

const evaluationImprovementItems = computed(() => {
  return (evaluation.value?.improvements ?? []).map((item, index) => ({
    ...item,
    rank: String(index + 1).padStart(2, '0'),
  }));
});

const evaluationTop3ImprovementItems = computed(() => {
  return (evaluation.value?.top3Improvements ?? []).map((value, index) => ({
    key: `top-${index + 1}`,
    rank: index + 1,
    value,
  }));
});

const evaluationImprovementCount = computed(() => {
  return evaluationImprovementItems.value.length || evaluationTop3ImprovementItems.value.length;
});

const evaluationDimensionRows = computed(() => {
  return (evaluation.value?.dimensions ?? []).map((item) => {
    const maxScore = item.maxScore;
    const ratio = maxScore > 0 ? Math.min(100, Math.max(0, (item.score / maxScore) * 100)) : 0;
    return {
      ...item,
      ratio,
      detailText: item.evidence,
      tone: ratio >= 85 ? 'good' : ratio >= 70 ? 'medium' : 'risk',
    };
  });
});

const visibleEvaluationIssues = computed(() => {
  const issues = evaluation.value?.issues ?? [];
  return showAllEvaluationIssues.value ? issues : issues.slice(0, 3);
});

const evaluationIssueGridStyle = computed(() => {
  const issueCount = evaluation.value?.issues.length ?? 0;
  return { '--evaluation-issue-columns': String(Math.max(1, Math.min(3, issueCount))) };
});

const evaluationHighRiskIssueCount = computed(() => {
  return (evaluation.value?.issues ?? []).filter((item) => item.severity === 'high').length;
});

const evaluationStateNotice = computed(() => {
  const state = evaluation.value?.state.trim().toLowerCase() ?? '';
  if (!state || ['completed', 'success', 'succeeded', 'done'].includes(state)) return null;
  if (['failed', 'error', 'cancelled', 'canceled'].includes(state)) {
    return {
      tone: 'error',
      title: '评估未完成',
      detail: `当前任务状态：${evaluation.value?.state}`,
    };
  }
  return {
    tone: 'progress',
    title: '评估进行中',
    detail: `当前任务状态：${evaluation.value?.state}`,
  };
});

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readEvaluationSource(payload: Record<string, unknown>): Record<string, unknown> {
  const nestedEvaluation = payload.evaluation;
  if (
    nestedEvaluation &&
    typeof nestedEvaluation === 'object' &&
    !Array.isArray(nestedEvaluation)
  ) {
    return readRecord(nestedEvaluation);
  }

  // 兼容旧评审详情响应：旧接口的 aiScore 是对象，新统一接口的 aiScore 是分值。
  const legacyAiScore = payload.aiScore;
  if (legacyAiScore && typeof legacyAiScore === 'object' && !Array.isArray(legacyAiScore)) {
    return readRecord(legacyAiScore);
  }
  return payload;
}

function readFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  const text = String(value ?? '').trim();
  return text ? [text] : [];
}

function normalizePatternLabel(value: unknown): string {
  const pattern = String(value ?? '').trim();
  const labelMap: Record<string, string> = {
    process: '流程型',
    thinking: '思维型',
    navigation: '导航型',
    philosophy: '理念型',
    tool: '工具型',
  };
  return labelMap[pattern.toLowerCase()] ?? pattern;
}

function normalizeConfidence(
  value: unknown,
  lowConfidence: boolean,
): {
  confidence: string;
  confidenceLabel: string;
} {
  const confidence = String(value ?? '')
    .trim()
    .toUpperCase();
  const labelMap: Record<string, string> = { H: '高置信度', M: '中置信度', L: '低置信度' };
  const effectiveConfidence = confidence || (lowConfidence ? 'L' : '');
  return {
    confidence: effectiveConfidence,
    confidenceLabel:
      labelMap[effectiveConfidence] ?? (effectiveConfidence ? `置信度 ${effectiveConfidence}` : ''),
  };
}

function normalizeDimensionDisplayName(glossary: string, fallback: string): string {
  const matched = glossary.match(/^\s*([^（(：:]+?)\s*[（(]\s*([^）)]+?)\s*[）)]/);
  if (!matched) return fallback;
  const chineseName = matched[1]?.trim();
  const dimensionName = matched[2]?.trim();
  return dimensionName && chineseName ? `${dimensionName}：${chineseName}` : fallback;
}

function normalizeEvaluationDimensions(
  value: unknown,
  glossaryValue: unknown,
): EvaluationDimensionScore[] {
  if (!Array.isArray(value)) return [];
  const glossary = readRecord(glossaryValue);

  return value
    .map((item, index) => {
      const record = readRecord(item);
      const score = readFiniteNumber(record.score);
      if (score == null) return null;
      const id = String(record.id ?? record.dimensionId ?? `D${index + 1}`).trim();
      const maxScore = readFiniteNumber(record.max ?? record.maxScore ?? record.max_score) ?? 0;
      const lowConfidence = record.low_confidence === true || record.lowConfidence === true;
      const confidence = normalizeConfidence(record.confidence, lowConfidence);
      const glossaryText = String(glossary[id] ?? '').trim();
      const fallbackLabel = String(record.name ?? record.label ?? id).trim();
      return {
        id,
        label: normalizeDimensionDisplayName(glossaryText, fallbackLabel),
        score,
        maxScore: maxScore > 0 ? maxScore : 1,
        ...confidence,
        lowConfidence: lowConfidence || confidence.confidence === 'L',
        evidence: String(record.evidence ?? '').trim(),
        rationale: String(
          record.rationale ??
            record.deductionBreakdown ??
            record.description ??
            record.reason ??
            '',
        ).trim(),
        rawScore: readFiniteNumber(record.raw_score ?? record.rawScore),
        adjustedByPrecheck:
          record.adjusted_by_precheck === true || record.adjustedByPrecheck === true,
        adjustmentReason: String(record.adjustment_reason ?? record.adjustmentReason ?? '').trim(),
        derivationReason: String(record.derivation_reason ?? record.derivationReason ?? '').trim(),
        glossary: glossaryText,
      };
    })
    .filter((item): item is EvaluationDimensionScore => item !== null);
}

function normalizeIssueSeverity(value: unknown): {
  severity: EvaluationIssueSeverity;
  severityLabel: string;
} {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase();
  if (normalized.includes('high') || text.includes('高')) {
    return { severity: 'high', severityLabel: '高风险' };
  }
  if (normalized.includes('medium') || normalized.includes('mid') || text.includes('中')) {
    return { severity: 'medium', severityLabel: '中风险' };
  }
  if (normalized.includes('low') || text.includes('低')) {
    return { severity: 'low', severityLabel: '低风险' };
  }
  return { severity: 'suggestion', severityLabel: '建议' };
}

function normalizeEvaluationIssues(
  value: unknown,
  options: {
    fallbackSeverity: EvaluationIssueSeverity;
    forcedSeverity?: EvaluationIssueSeverity;
    idPrefix: string;
    dimensionLabels: Map<string, string>;
  },
): EvaluationIssue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const title = item.trim();
        if (!title) return null;
        return {
          id: `${options.idPrefix}-${index + 1}`,
          ...normalizeIssueSeverity(options.forcedSeverity ?? options.fallbackSeverity),
          title,
          description: '',
          evidence: '',
          dimension: '',
        };
      }

      const record = readRecord(item);
      const title = String(
        record.title ??
          record.name ??
          record.issueTitle ??
          record.issue_title ??
          record.message ??
          '',
      ).trim();
      if (!title) return null;
      const severity = options.forcedSeverity
        ? normalizeIssueSeverity(options.forcedSeverity)
        : normalizeIssueSeverity(
            record.severity ??
              record.riskLevel ??
              record.risk_level ??
              record.level ??
              record.issueLevel ??
              record.issue_level ??
              options.fallbackSeverity,
          );
      const dimensionIds = normalizeStringList(
        record.dimensions ??
          record.dimensionIds ??
          record.dimension_ids ??
          record.dimension ??
          record.dimensionName ??
          record.dimension_name,
      );
      return {
        id: String(
          record.issueId ??
            record.issue_id ??
            record.code ??
            record.id ??
            `${options.idPrefix}-${index + 1}`,
        ).trim(),
        ...severity,
        title,
        description: String(
          record.description ??
            record.detail ??
            record.issueDescription ??
            record.issue_description ??
            '',
        ).trim(),
        evidence: String(
          record.evidence ??
            record.evidencePath ??
            record.evidence_path ??
            record.filePath ??
            record.file_path ??
            record.location ??
            '',
        ).trim(),
        dimension: dimensionIds
          .map((id) => options.dimensionLabels.get(id) ?? id)
          .filter(Boolean)
          .join('、'),
      };
    })
    .filter((item): item is EvaluationIssue => item !== null);
}

function normalizeEvaluationImprovements(
  source: Record<string, unknown>,
  dimensions: EvaluationDimensionScore[],
  issues: EvaluationIssue[],
): EvaluationAdvice[] {
  const dimensionLabels = new Map(dimensions.map((item) => [item.id, item.label]));
  const issueLabels = new Map(issues.map((item) => [item.id, item.title]));
  const result = Array.isArray(source.improvements)
    ? source.improvements
        .map((item, index) => {
          const record = readRecord(item);
          const value = String(record.action ?? '').trim();
          if (!value) return null;
          const dimensionIds = normalizeStringList(
            record.linked_dimensions ?? record.linkedDimensions,
          );
          const findingIds = normalizeStringList(
            record.linked_finding_ids ?? record.linkedFindingIds,
          );
          const linkedDimensionLabels = Array.from(
            new Set(dimensionIds.flatMap((id) => dimensionLabels.get(id) || [])),
          );
          const linkedIssueLabels = Array.from(
            new Set(findingIds.flatMap((id) => issueLabels.get(id) || [])),
          );
          const metadata = [
            linkedDimensionLabels.length ? `关联维度：${linkedDimensionLabels.join('、')}` : '',
            linkedIssueLabels.length ? `关联问题：${linkedIssueLabels.join('、')}` : '',
          ].filter(Boolean);
          return {
            key: `improvement-${index + 1}`,
            value,
            metaLabel: metadata.join('；'),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  if (result.length === 0) {
    Object.entries(readRecord(source.advices)).forEach(([key, advice]) => {
      const value = String(advice ?? '').trim();
      if (!value) return;
      result.push({ key: `legacy-${key}`, value, metaLabel: '' });
    });
  }

  return result;
}

function normalizeSkillEvaluation(value: unknown): SkillEvaluation | null {
  const payload = readRecord(value);
  const source = readEvaluationSource(payload);
  const metricGlossary = readRecord(source.metricGlossary ?? source.metric_glossary);
  const dimensions = normalizeEvaluationDimensions(
    source.dimensions ?? source.dimensionScores,
    metricGlossary.dimensions,
  );
  const dimensionLabels = new Map(dimensions.map((item) => [item.id, item.label]));
  const hasNewIssueFields = Array.isArray(source.criticalIssues) || Array.isArray(source.findings);
  const issues = hasNewIssueFields
    ? [
        ...normalizeEvaluationIssues(source.criticalIssues, {
          fallbackSeverity: 'high',
          forcedSeverity: 'high',
          idPrefix: 'CRITICAL',
          dimensionLabels,
        }),
        ...normalizeEvaluationIssues(source.findings, {
          fallbackSeverity: 'low',
          forcedSeverity: 'low',
          idPrefix: 'FINDING',
          dimensionLabels,
        }),
      ]
    : normalizeEvaluationIssues(
        source.securityIssues ??
          source.security_issues ??
          source.issues ??
          source.issueList ??
          source.issue_list ??
          source.problemList ??
          source.problem_list ??
          source.problems ??
          payload.securityIssues ??
          payload.security_issues ??
          payload.issues,
        {
          fallbackSeverity: 'suggestion',
          idPrefix: 'ISSUE',
          dimensionLabels,
        },
      );
  const total =
    readFiniteNumber(source.total ?? source.aiScore ?? source.score) ??
    dimensions.reduce((sum, item) => sum + item.score, 0);
  const maxScore =
    readFiniteNumber(source.max ?? source.maxScore ?? source.max_score) ??
    dimensions.reduce((sum, item) => sum + item.maxScore, 0);
  const percent = readFiniteNumber(source.percent) ?? (maxScore > 0 ? (total / maxScore) * 100 : 0);
  const knowledgeRatioSource = readRecord(source.knowledgeRatio ?? source.knowledge_ratio);
  const state = String(source.state ?? '').trim();
  const improvements = normalizeEvaluationImprovements(source, dimensions, issues);
  const top3FromResponse = normalizeStringList(source.top3Improvements ?? source.top3_improvements);
  const top3Improvements = top3FromResponse.length
    ? top3FromResponse
    : improvements.slice(0, 3).map((item) => item.value);

  if (
    !state &&
    total === 0 &&
    dimensions.length === 0 &&
    improvements.length === 0 &&
    top3Improvements.length === 0 &&
    issues.length === 0
  ) {
    return null;
  }

  return {
    skillName: String(source.skillName ?? '').trim(),
    version: String(source.version ?? '').trim(),
    taskId: String(source.taskId ?? '').trim(),
    state,
    model: String(source.modelName ?? source.aiModel ?? source.model ?? '').trim(),
    evaluatedAt: String(
      source.updateTime ??
        source.createTime ??
        source.evaluateTime ??
        source.evaluatedAt ??
        source.updatedAt ??
        '',
    ).trim(),
    total,
    maxScore: maxScore > 0 ? maxScore : 100,
    percent: Math.round(Math.max(0, percent) * 10) / 10,
    grade: String(source.grade ?? '').trim(),
    pattern: String(source.pattern ?? '').trim(),
    patternLabel: normalizePatternLabel(source.pattern),
    knowledgeRatio: {
      E: readFiniteNumber(knowledgeRatioSource.E ?? knowledgeRatioSource.e),
      A: readFiniteNumber(knowledgeRatioSource.A ?? knowledgeRatioSource.a),
      R: readFiniteNumber(knowledgeRatioSource.R ?? knowledgeRatioSource.r),
    },
    knowledgeRatioGlossary: String(
      metricGlossary.knowledge_ratio ?? metricGlossary.knowledgeRatio ?? '',
    ).trim(),
    dimensions,
    improvements,
    top3Improvements,
    issues,
  };
}

function formatEvaluationNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function formatUpdatedTime(value?: string): string {
  if (!value) return '—';
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
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
  evaluationLoadSequence += 1;
  selectedVersion.value = '';
  detailFiles.value = [];
  detailLoading.value = false;
  detailError.value = '';
  expandedDetailFilePath.value = '';
  detailCapabilityExpanded.value = true;
  activeTab.value = 'detail';
  evaluation.value = null;
  evaluationLoading.value = false;
  evaluationError.value = '';
  showAllEvaluationAdvices.value = false;
  showAllEvaluationIssues.value = false;
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

async function loadEvaluation(): Promise<void> {
  if (!props.record || !selectedVersion.value || props.capabilityType !== 'skill') return;

  const sequence = ++evaluationLoadSequence;
  evaluationLoading.value = true;
  evaluationError.value = '';
  evaluation.value = null;
  showAllEvaluationAdvices.value = false;
  showAllEvaluationIssues.value = false;

  try {
    const detailResponse = await skillBaseService.getSkillEvaluationDetail({
      skillName: props.record.name,
      version: selectedVersion.value,
    });
    if (sequence !== evaluationLoadSequence) return;
    if (detailResponse?.meta?.success === false) {
      throw new Error(String(detailResponse?.meta?.message || '评估信息加载失败'));
    }

    const payload = readRecord(detailResponse?.data);
    evaluation.value = normalizeSkillEvaluation(payload);
  } catch (error) {
    if (sequence !== evaluationLoadSequence) return;
    evaluationError.value = error instanceof Error ? error.message : '评估信息加载失败';
  } finally {
    if (sequence === evaluationLoadSequence) evaluationLoading.value = false;
  }
}

async function loadSelectedVersion(): Promise<void> {
  await Promise.all([
    loadDetailVersion(),
    props.capabilityType === 'skill' ? loadEvaluation() : Promise.resolve(),
  ]);
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
    if (selectedVersion.value) void loadSelectedVersion();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  detailLoadSequence += 1;
  evaluationLoadSequence += 1;
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
            <div class="catalog-detail-heading-title">
              <h3>{{ props.record.name }}</h3>
              <span
                class="status-badge"
                :class="{
                  'is-completed': props.record.status === '已完成',
                  'is-progress': props.record.status === '进行中',
                }"
              >
                {{ props.record.status || '未开始' }}
              </span>
            </div>
            <p>{{ props.record.description || `查看 ${capabilityLabel} 的版本与文件详情。` }}</p>
          </div>

          <div
            class="catalog-detail-meta"
            :class="{ 'is-skill': props.capabilityType === 'skill' }"
          >
            <div>
              <small>规划部门或产品</small>
              <strong>{{
                props.record.product || props.record.department || props.record.level || '—'
              }}</strong>
            </div>
            <div>
              <small>负责人</small>
              <strong>{{ props.record.owner || '—' }}</strong>
            </div>
            <label v-if="detailVersions.length" class="catalog-detail-version-meta">
              <span>
                <small>版本</small>
                <em>{{ formatUpdatedTime(selectedVersionRecord?.uploadedAt) }} 更新</em>
              </span>
              <select v-model="selectedVersion" aria-label="详情版本" @change="loadSelectedVersion">
                <option v-for="item in detailVersions" :key="item.version" :value="item.version">
                  {{ item.version }}
                </option>
              </select>
            </label>
            <div v-if="props.capabilityType === 'skill'" class="catalog-detail-evaluation-meta">
              <small>评估模型</small>
              <strong>{{ evaluation?.model || (evaluationLoading ? '加载中...' : '—') }}</strong>
              <em>{{
                evaluationLoading ? '加载中...' : formatUpdatedTime(evaluation?.evaluatedAt)
              }}</em>
            </div>
          </div>
          <button type="button" class="catalog-detail-close" aria-label="关闭" @click="closeDialog">
            ×
          </button>
        </header>

        <div
          v-if="detailVersions.length && props.capabilityType === 'skill'"
          class="catalog-detail-tabs"
          role="tablist"
          aria-label="Skill 信息类型"
        >
          <button
            id="catalog-detail-tab-detail"
            type="button"
            role="tab"
            :class="{ 'is-active': activeTab === 'detail' }"
            :aria-selected="activeTab === 'detail'"
            aria-controls="catalog-detail-panel-detail"
            @click="activeTab = 'detail'"
          >
            详情
          </button>
          <button
            id="catalog-detail-tab-evaluation"
            type="button"
            role="tab"
            :class="{ 'is-active': activeTab === 'evaluation' }"
            :aria-selected="activeTab === 'evaluation'"
            aria-controls="catalog-detail-panel-evaluation"
            @click="activeTab = 'evaluation'"
          >
            评估
          </button>
        </div>

        <section
          v-if="
            detailVersions.length && (props.capabilityType !== 'skill' || activeTab === 'detail')
          "
          id="catalog-detail-panel-detail"
          class="catalog-detail-capability"
          role="tabpanel"
          :aria-labelledby="
            props.capabilityType === 'skill' ? 'catalog-detail-tab-detail' : undefined
          "
        >
          <button
            type="button"
            class="catalog-detail-capability-row"
            :aria-expanded="detailCapabilityExpanded"
            @click="detailCapabilityExpanded = !detailCapabilityExpanded"
          >
            <span class="catalog-detail-caret" :class="{ 'is-open': detailCapabilityExpanded }"
              >›</span
            >
            <strong>{{ props.record.name }}</strong>
            <span>{{ selectedVersion }}</span>
          </button>

          <div v-if="detailCapabilityExpanded" class="catalog-detail-content">
            <p v-if="detailLoading" class="catalog-detail-state">正在加载详情...</p>
            <div v-else-if="detailError" class="catalog-detail-state is-error">
              <span>{{ detailError }}</span>
              <button type="button" @click="loadDetailVersion">重试</button>
            </div>
            <p v-else-if="detailFiles.length === 0" class="catalog-detail-state">
              暂无可展示的文件
            </p>

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
                    >›</span
                  >
                  <span class="catalog-detail-file-icon">▧</span>
                  <span>{{ file.path }}</span>
                </button>
                <div
                  v-if="expandedDetailFilePath === file.path"
                  class="catalog-detail-file-content"
                >
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

        <section
          v-if="
            detailVersions.length && props.capabilityType === 'skill' && activeTab === 'evaluation'
          "
          id="catalog-detail-panel-evaluation"
          class="catalog-evaluation-panel"
          role="tabpanel"
          aria-labelledby="catalog-detail-tab-evaluation"
        >
          <p v-if="evaluationLoading" class="catalog-detail-state">正在加载评估信息...</p>
          <div v-else-if="evaluationError" class="catalog-detail-state is-error">
            <span>{{ evaluationError }}</span>
            <button type="button" @click="loadEvaluation">重试</button>
          </div>
          <div v-else-if="!evaluation" class="catalog-evaluation-empty">
            <span class="catalog-evaluation-empty__icon">i</span>
            <strong>当前版本暂无评估结果</strong>
            <p>完成静态评估后，可在这里查看综合得分、改进建议、评估问题和各维度评分。</p>
          </div>
          <div
            v-else-if="evaluationStateNotice"
            class="catalog-evaluation-empty"
            :class="`is-${evaluationStateNotice.tone}`"
          >
            <span class="catalog-evaluation-empty__icon">i</span>
            <strong>{{ evaluationStateNotice.title }}</strong>
            <p>{{ evaluationStateNotice.detail }}</p>
          </div>

          <template v-else>
            <div class="catalog-evaluation-summary">
              <article class="catalog-evaluation-score-card">
                <div class="catalog-evaluation-score-ring" :style="evaluationScoreRingStyle">
                  <div>
                    <strong>{{ formatEvaluationNumber(evaluation.total) }}</strong>
                    <span>/ {{ formatEvaluationNumber(evaluation.maxScore) }}</span>
                  </div>
                </div>
                <div class="catalog-evaluation-score-copy">
                  <small>综合得分</small>
                  <strong>得分率 {{ formatEvaluationNumber(evaluation.percent) }}%</strong>
                  <p>当前版本静态评估结果</p>
                </div>
                <div class="catalog-evaluation-grade-inline">
                  <div class="catalog-evaluation-grade">{{ evaluationGrade }}</div>
                </div>
              </article>

              <article
                class="catalog-evaluation-summary-card catalog-evaluation-count-card is-risk"
              >
                <small>风险问题数</small>
                <div>
                  <strong>{{ evaluation.issues.length }}</strong
                  ><span>项</span>
                </div>
                <p>其中高风险 {{ evaluationHighRiskIssueCount }} 项</p>
              </article>

              <article
                class="catalog-evaluation-summary-card catalog-evaluation-count-card is-advice"
              >
                <small>改进建议数</small>
                <div>
                  <strong>{{ evaluationImprovementCount }}</strong
                  ><span>项</span>
                </div>
                <p>接口返回的改进建议总数</p>
              </article>
            </div>

            <section
              v-if="evaluationTop3ImprovementItems.length || evaluationImprovementItems.length"
              class="catalog-evaluation-section"
            >
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>{{ showAllEvaluationAdvices ? '改进建议' : '改进建议（Top 3）' }}</h4>
                  <p>
                    {{
                      showAllEvaluationAdvices
                        ? '查看全部建议内容及其关联信息'
                        : '接口返回的优先改进建议'
                    }}
                  </p>
                </div>
                <button
                  v-if="evaluationImprovementItems.length"
                  type="button"
                  class="catalog-evaluation-section__action"
                  :aria-expanded="showAllEvaluationAdvices"
                  @click="showAllEvaluationAdvices = !showAllEvaluationAdvices"
                >
                  {{
                    showAllEvaluationAdvices
                      ? '仅显示Top3改进建议 ↑'
                      : `查看全部改进建议（${evaluationImprovementItems.length}）→`
                  }}
                </button>
                <span v-else>{{ evaluationTop3ImprovementItems.length }} 项</span>
              </header>
              <div v-if="!showAllEvaluationAdvices" class="catalog-evaluation-top-list">
                <article v-for="item in evaluationTop3ImprovementItems" :key="item.key">
                  <span>{{ item.rank }}</span>
                  <p class="catalog-two-line-clamp" :title="item.value">{{ item.value }}</p>
                </article>
              </div>
              <div v-else class="catalog-evaluation-advice-grid">
                <article v-for="item in evaluationImprovementItems" :key="item.key">
                  <div class="catalog-evaluation-advice-rank">
                    <span>{{ item.rank }}</span>
                  </div>
                  <p class="catalog-two-line-clamp" :title="item.value">{{ item.value }}</p>
                  <small
                    class="catalog-two-line-clamp"
                    :class="{ 'is-empty': !item.metaLabel }"
                    :title="item.metaLabel || undefined"
                    :aria-hidden="!item.metaLabel"
                  >
                    {{ item.metaLabel }}
                  </small>
                </article>
              </div>
            </section>

            <section
              v-if="evaluation.issues.length"
              class="catalog-evaluation-section catalog-evaluation-section--issues"
            >
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>评估问题</h4>
                  <p>汇总展示高风险问题与一般评估发现</p>
                </div>
                <button
                  v-if="evaluation.issues.length > 3"
                  type="button"
                  class="catalog-evaluation-section__action"
                  :aria-expanded="showAllEvaluationIssues"
                  @click="showAllEvaluationIssues = !showAllEvaluationIssues"
                >
                  {{
                    showAllEvaluationIssues
                      ? '收起全部问题 ↑'
                      : `查看全部问题（${evaluation.issues.length}）→`
                  }}
                </button>
              </header>

              <div class="catalog-evaluation-issue-grid" :style="evaluationIssueGridStyle">
                <article
                  v-for="issue in visibleEvaluationIssues"
                  :key="issue.id"
                  :class="`is-${issue.severity}`"
                >
                  <div class="catalog-evaluation-issue-meta">
                    <span>{{ issue.severityLabel }}</span>
                  </div>
                  <h5 class="catalog-two-line-clamp" :title="issue.title">{{ issue.title }}</h5>
                  <p
                    class="catalog-two-line-clamp"
                    :class="{ 'is-empty': !issue.description }"
                    :title="issue.description || undefined"
                    :aria-hidden="!issue.description"
                  >
                    {{ issue.description }}
                  </p>
                  <footer>
                    <span v-if="issue.evidence">证据：{{ issue.evidence }}</span>
                    <span v-else>暂无证据路径</span>
                  </footer>
                </article>
              </div>
            </section>

            <section class="catalog-evaluation-section">
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>各维度评分</h4>
                  <p>查看维度得分、得分率与评估说明</p>
                </div>
              </header>
              <div v-if="evaluationDimensionRows.length" class="catalog-evaluation-dimensions">
                <article
                  v-for="(dimension, index) in evaluationDimensionRows"
                  :key="dimension.id"
                  :class="`is-${dimension.tone}`"
                >
                  <div class="catalog-evaluation-dimension-name">
                    <span>{{ index + 1 }}</span>
                    <div>
                      <strong>{{ dimension.label }}</strong>
                      <small v-if="dimension.confidenceLabel">
                        <em :class="{ 'is-low': dimension.lowConfidence }">
                          {{ dimension.confidenceLabel }}
                        </em>
                      </small>
                    </div>
                  </div>
                  <div class="catalog-evaluation-dimension-score">
                    <div><span :style="{ width: `${dimension.ratio}%` }"></span></div>
                    <strong>{{ dimension.score }} / {{ dimension.maxScore }}</strong>
                  </div>
                  <div v-if="dimension.detailText" class="catalog-evaluation-dimension-detail">
                    <small :title="dimension.detailText">{{ dimension.detailText }}</small>
                  </div>
                </article>
              </div>
              <p v-else class="catalog-detail-state">暂无维度评估明细</p>
            </section>

            <p class="catalog-evaluation-note">
              注：评估结果仅代表当前版本的静态分析结论，具体发布决策建议结合人工评审与动态验证。
            </p>
          </template>
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

.catalog-detail-dialog,
.catalog-detail-dialog *,
.catalog-detail-dialog *::before,
.catalog-detail-dialog *::after {
  box-sizing: border-box;
}

.catalog-detail-dialog {
  position: relative;
  display: flex;
  width: min(1160px, calc(100vw - 32px));
  height: min(860px, calc(100vh - 48px));
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
  grid-template-columns: minmax(260px, 0.72fr) minmax(600px, 1.35fr);
  align-items: center;
  gap: 18px;
}

.catalog-detail-heading small {
  color: #4f6fe8;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.catalog-detail-heading h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.catalog-detail-heading-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  margin: 8px 0 4px;
}

.catalog-detail-heading-title .status-badge {
  min-height: 24px;
  flex: 0 0 auto;
  padding: 0 8px;
  font-size: 10px;
}

.catalog-detail-heading p {
  margin: 0;
  color: #71809b;
  font-size: 11px;
  line-height: 1.5;
}

.catalog-detail-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
  padding-right: 42px;
}

.catalog-detail-meta.is-skill {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.catalog-detail-meta > div,
.catalog-detail-meta > label {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 5px;
  padding-left: 14px;
  border-left: 2px solid #e4eaf6;
}

.catalog-detail-meta small,
.catalog-detail-version-meta em,
.catalog-detail-evaluation-meta em {
  color: #8794ab;
  font-size: 9px;
}

.catalog-detail-meta small {
  white-space: nowrap;
}

.catalog-detail-meta strong,
.catalog-detail-version-meta select {
  color: #31405e;
  font-size: 11px;
}

.catalog-detail-meta strong {
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.catalog-detail-version-meta > span {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.catalog-detail-version-meta em,
.catalog-detail-evaluation-meta em {
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-detail-evaluation-meta strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-detail-version-meta select {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 1px solid #cbd8ee;
  border-radius: 7px;
  outline: none;
  background: #fff;
  font-weight: 800;
}

.catalog-detail-version-meta select:focus {
  border-color: #7184ec;
  box-shadow: 0 0 0 3px rgba(92, 111, 232, 0.1);
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

.catalog-detail-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 28px;
  margin-top: 10px;
  padding: 0 12px;
  border-bottom: 1px solid #e2e8f3;
}

.catalog-detail-tabs button {
  position: relative;
  min-width: 56px;
  height: 38px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: #72809a;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.catalog-detail-tabs button::after {
  position: absolute;
  right: 6px;
  bottom: -1px;
  left: 6px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: transparent;
  content: '';
}

.catalog-detail-tabs button:hover,
.catalog-detail-tabs button.is-active {
  color: #4f63e9;
}

.catalog-detail-tabs button.is-active::after {
  background: linear-gradient(90deg, #536cf1, #8a63ee);
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

.catalog-evaluation-panel {
  min-height: 0;
  flex: 1;
  margin-top: 12px;
  overflow-y: auto;
  padding: 14px 12px 18px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 8% 2%, rgba(94, 117, 239, 0.1), transparent 28%),
    radial-gradient(circle at 96% 14%, rgba(139, 99, 235, 0.08), transparent 28%), #f7f9ff;
  scrollbar-color: #bdc8e2 transparent;
  scrollbar-width: thin;
}

.catalog-evaluation-summary {
  display: grid;
  grid-template-columns: minmax(380px, 1.55fr) repeat(2, minmax(130px, 0.55fr));
  gap: 12px;
}

.catalog-evaluation-score-card,
.catalog-evaluation-summary-card {
  position: relative;
  min-width: 0;
  min-height: 122px;
  overflow: hidden;
  border: 1px solid rgba(170, 183, 220, 0.42);
  border-radius: 16px;
  box-shadow: 0 12px 28px rgba(70, 82, 148, 0.1);
}

.catalog-evaluation-score-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 20px;
  background: linear-gradient(145deg, #f0f4ff 0%, #faf8ff 100%);
}

.catalog-evaluation-score-card::after,
.catalog-evaluation-summary-card::after {
  position: absolute;
  top: -42px;
  right: -38px;
  width: 118px;
  height: 118px;
  border-radius: 50%;
  background: rgba(102, 119, 247, 0.12);
  content: '';
}

.catalog-evaluation-score-card > *,
.catalog-evaluation-summary-card > * {
  position: relative;
  z-index: 1;
}

.catalog-evaluation-score-ring {
  position: relative;
  display: grid;
  width: 86px;
  height: 86px;
  flex: 0 0 86px;
  place-items: center;
  border-radius: 50%;
  box-shadow: 0 10px 24px rgba(86, 105, 220, 0.22);
}

.catalog-evaluation-score-ring::before {
  position: absolute;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 18px rgba(86, 105, 220, 0.08);
  content: '';
}

.catalog-evaluation-score-ring > div {
  position: relative;
  display: grid;
  place-items: center;
  gap: 5px;
}

.catalog-evaluation-score-ring strong {
  color: #202c4d;
  font-size: 21px;
  line-height: 1;
  letter-spacing: -0.6px;
}

.catalog-evaluation-score-ring span {
  color: #7c88a2;
  font-size: 10px;
  font-weight: 800;
}

.catalog-evaluation-score-card small,
.catalog-evaluation-summary-card small {
  color: #6f7c99;
  font-size: 11px;
  font-weight: 800;
}

.catalog-evaluation-score-copy {
  display: grid;
  min-width: 0;
  gap: 9px;
}

.catalog-evaluation-score-copy > strong {
  color: #354365;
  font-size: 15px;
}

.catalog-evaluation-grade-inline {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  margin-left: auto;
  padding-left: 20px;
  border-left: 1px solid rgba(122, 132, 204, 0.18);
}

.catalog-evaluation-score-card p,
.catalog-evaluation-summary-card p {
  margin: 0;
  color: #7f8ba5;
  font-size: 11px;
  line-height: 1.6;
}

.catalog-evaluation-summary-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  background: linear-gradient(145deg, #f7f3ff 0%, #fff 100%);
}

.catalog-evaluation-summary-card > strong {
  color: #354365;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.catalog-evaluation-grade {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 17px;
  background: linear-gradient(135deg, #7168f4, #9b6af1);
  box-shadow: 0 10px 22px rgba(116, 91, 223, 0.25);
  color: #fff;
  font-size: 30px;
  font-weight: 900;
}

.catalog-evaluation-count-card {
  --stat-color: 226, 82, 99;
  background: linear-gradient(145deg, rgba(var(--stat-color), 0.08), #fff 72%);
}

.catalog-evaluation-count-card.is-advice {
  --stat-color: 35, 166, 112;
}

.catalog-evaluation-count-card::after {
  background: rgba(var(--stat-color), 0.12);
}

.catalog-evaluation-count-card > div {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: rgb(var(--stat-color));
}

.catalog-evaluation-count-card > div strong {
  font-size: 34px;
  line-height: 1;
}

.catalog-evaluation-count-card > div span {
  font-size: 11px;
  font-weight: 800;
}

.catalog-evaluation-section {
  margin-top: 18px;
  padding: 20px;
  border: 1px solid rgba(170, 183, 220, 0.42);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 28px rgba(73, 87, 156, 0.08);
}

.catalog-evaluation-section:first-of-type {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(249, 246, 255, 0.96));
}

.catalog-evaluation-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.catalog-evaluation-section__header h4 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #25314f;
  font-size: 16px;
}

.catalog-evaluation-section__header h4::before {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d73f0, #9568ec);
  box-shadow: 0 0 0 5px rgba(93, 115, 240, 0.1);
  content: '';
}

.catalog-evaluation-section__header p {
  margin: 7px 0 0 17px;
  color: #7d89a3;
  font-size: 11px;
}

.catalog-evaluation-section__header > span {
  padding: 6px 11px;
  border-radius: 999px;
  background: linear-gradient(135deg, #e9edff, #f2eaff);
  color: #596ce7;
  font-size: 11px;
  font-weight: 800;
}

.catalog-evaluation-top-list {
  display: grid;
  gap: 10px;
}

.catalog-evaluation-top-list article {
  --top-color: 94, 113, 239;
  display: grid;
  min-width: 0;
  min-height: 76px;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 11px 18px 11px 14px;
  border: 1px solid rgba(var(--top-color), 0.2);
  border-left: 4px solid rgb(var(--top-color));
  border-radius: 13px;
  background: linear-gradient(100deg, rgba(var(--top-color), 0.09), #fff 46%);
  box-shadow: 0 7px 18px rgba(69, 82, 144, 0.06);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.catalog-evaluation-top-list article:nth-child(2) {
  --top-color: 245, 151, 31;
}

.catalog-evaluation-top-list article:nth-child(3) {
  --top-color: 116, 84, 232;
}

.catalog-evaluation-top-list article:hover {
  transform: translateX(3px);
  box-shadow: 0 10px 24px rgba(69, 82, 144, 0.11);
}

.catalog-evaluation-top-list article > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: rgb(var(--top-color));
  box-shadow: 0 7px 15px rgba(var(--top-color), 0.22);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
}

.catalog-evaluation-top-list p {
  height: 3.3em;
  max-height: 3.3em;
  margin: 0;
  color: #46536f;
  font-size: 12px;
  line-height: 1.65;
}

.catalog-evaluation-advice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.catalog-evaluation-advice-grid article {
  --advice-color: 255, 104, 104;
  position: relative;
  min-height: 150px;
  overflow: hidden;
  padding: 17px;
  border: 1px solid rgba(var(--advice-color), 0.24);
  border-top: 3px solid rgb(var(--advice-color));
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(var(--advice-color), 0.08), #fff 54%);
  box-shadow: 0 8px 20px rgba(69, 82, 144, 0.07);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.catalog-evaluation-advice-grid article:nth-child(2) {
  --advice-color: 255, 159, 45;
}

.catalog-evaluation-advice-grid article:nth-child(3) {
  --advice-color: 84, 112, 238;
}

.catalog-evaluation-advice-grid article:nth-child(n + 4) {
  --advice-color: 139, 92, 246;
}

.catalog-evaluation-advice-grid article:hover {
  transform: translateY(-2px);
  box-shadow: 0 13px 28px rgba(69, 82, 144, 0.13);
}

.catalog-evaluation-advice-grid article::after {
  position: absolute;
  top: -24px;
  right: -24px;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--advice-color), 0.16), transparent 68%);
  content: '';
}

.catalog-evaluation-advice-grid article > * {
  position: relative;
  z-index: 1;
}

.catalog-evaluation-advice-rank {
  display: flex;
  align-items: center;
}

.catalog-evaluation-advice-rank span {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 10px;
  background: rgb(var(--advice-color));
  box-shadow: 0 7px 16px rgba(var(--advice-color), 0.25);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
}

.catalog-evaluation-advice-grid article p {
  min-height: 3.5em;
  margin: 13px 0 12px;
  color: #596680;
  font-size: 11px;
  line-height: 1.75;
}

.catalog-evaluation-advice-grid article small {
  display: block;
  width: fit-content;
  min-height: 3.1em;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(var(--advice-color), 0.1);
  color: rgb(var(--advice-color));
  font-size: 9px;
  font-weight: 800;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.catalog-evaluation-section--issues {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 255, 0.98));
}

.catalog-evaluation-section--issues .catalog-evaluation-section__header h4::before {
  background: linear-gradient(135deg, #ff6676, #ff9f2d);
  box-shadow: 0 0 0 5px rgba(255, 102, 118, 0.1);
}

.catalog-evaluation-section__action {
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: #5c6df3;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.catalog-evaluation-section__action:hover {
  color: #7d54df;
}

.catalog-two-line-clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.catalog-two-line-clamp.is-empty {
  visibility: hidden;
}

.catalog-evaluation-issue-grid {
  display: grid;
  grid-template-columns: repeat(var(--evaluation-issue-columns), minmax(0, 1fr));
  gap: 14px;
}

.catalog-evaluation-issue-grid article {
  --issue-color: 82, 108, 239;
  display: flex;
  min-width: 0;
  min-height: 156px;
  flex-direction: column;
  padding: 16px;
  border: 1px solid rgba(var(--issue-color), 0.2);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(var(--issue-color), 0.07), #fff 48%);
  box-shadow: 0 7px 18px rgba(69, 82, 144, 0.06);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.catalog-evaluation-issue-grid article.is-high {
  --issue-color: 241, 82, 101;
}

.catalog-evaluation-issue-grid article.is-medium {
  --issue-color: 255, 157, 39;
}

.catalog-evaluation-issue-grid article.is-low {
  --issue-color: 79, 111, 232;
}

.catalog-evaluation-issue-grid article.is-suggestion {
  --issue-color: 126, 93, 238;
}

.catalog-evaluation-issue-grid article:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(69, 82, 144, 0.12);
}

.catalog-evaluation-issue-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.catalog-evaluation-issue-meta span {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 8px;
  background: rgba(var(--issue-color), 0.12);
  color: rgb(var(--issue-color));
  font-size: 10px;
  font-weight: 900;
}

.catalog-evaluation-issue-grid h5 {
  min-height: 2.9em;
  margin: 13px 0 7px;
  color: #26324e;
  font-size: 13px;
  line-height: 1.45;
}

.catalog-evaluation-issue-grid article > p {
  min-height: 3.3em;
  margin: 0;
  color: #68748d;
  font-size: 11px;
  line-height: 1.65;
}

.catalog-evaluation-issue-grid footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  color: #8792a8;
  font-size: 10px;
}

.catalog-evaluation-issue-grid footer > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.catalog-evaluation-dimensions {
  display: grid;
  gap: 10px;
}

.catalog-evaluation-dimensions article {
  --dimension-color: 39, 180, 111;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 12px;
  padding: 15px 18px;
  border: 1px solid rgba(var(--dimension-color), 0.18);
  border-left: 4px solid rgb(var(--dimension-color));
  border-radius: 13px;
  background: linear-gradient(90deg, rgba(var(--dimension-color), 0.08), #fff 24%);
}

.catalog-evaluation-dimensions article:nth-child(10n + 2) {
  --dimension-color: 56, 151, 235;
}

.catalog-evaluation-dimensions article:nth-child(10n + 3) {
  --dimension-color: 255, 159, 45;
}

.catalog-evaluation-dimensions article:nth-child(10n + 4) {
  --dimension-color: 139, 92, 246;
}

.catalog-evaluation-dimensions article:nth-child(10n + 5) {
  --dimension-color: 241, 91, 107;
}

.catalog-evaluation-dimensions article:nth-child(10n + 6) {
  --dimension-color: 20, 184, 166;
}

.catalog-evaluation-dimensions article:nth-child(10n + 7) {
  --dimension-color: 91, 105, 230;
}

.catalog-evaluation-dimensions article:nth-child(10n + 8) {
  --dimension-color: 234, 179, 8;
}

.catalog-evaluation-dimensions article:nth-child(10n + 9) {
  --dimension-color: 219, 82, 181;
}

.catalog-evaluation-dimensions article:nth-child(10n) {
  --dimension-color: 6, 182, 212;
}

.catalog-evaluation-dimension-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.catalog-evaluation-dimension-name > span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 12px;
  background: rgba(var(--dimension-color), 0.13);
  color: rgb(var(--dimension-color));
  font-size: 12px;
  font-weight: 900;
}

.catalog-evaluation-dimension-name > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.catalog-evaluation-dimension-name strong {
  color: #33405d;
  font-size: 12px;
}

.catalog-evaluation-dimension-name small {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #8a95aa;
  font-size: 10px;
}

.catalog-evaluation-dimension-name em {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(var(--dimension-color), 0.1);
  color: rgb(var(--dimension-color));
  font-size: 8px;
  font-style: normal;
  font-weight: 800;
}

.catalog-evaluation-dimension-name em.is-low {
  background: #fff0e4;
  color: #c86c21;
}

.catalog-evaluation-dimension-score {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
}

.catalog-evaluation-dimension-score > div {
  height: 9px;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: #ebeff6;
}

.catalog-evaluation-dimension-score > div span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--dimension-color), 0.72),
    rgb(var(--dimension-color))
  );
  box-shadow: 0 0 10px rgba(var(--dimension-color), 0.22);
}

.catalog-evaluation-dimension-score strong {
  min-width: 72px;
  color: #33405d;
  font-size: 11px;
  text-align: right;
}

.catalog-evaluation-dimension-detail {
  display: block;
  width: 100%;
  min-width: 0;
}

.catalog-evaluation-dimension-detail small {
  display: block;
  width: 100%;
  overflow: hidden;
  color: #8691a7;
  font-size: 11px;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-evaluation-note {
  margin: 16px 0 0;
  color: #7f8aa0;
  font-size: 10px;
  text-align: center;
}

.catalog-evaluation-empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px dashed #d9e0ee;
  border-radius: 12px;
  color: #4b5875;
  text-align: center;
}

.catalog-evaluation-empty__icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: #eef1ff;
  color: #5b6ee8;
  font-weight: 900;
}

.catalog-evaluation-empty strong {
  font-size: 12px;
}

.catalog-evaluation-empty p {
  margin: 0;
  color: #8792a8;
  font-size: 9px;
}

.catalog-evaluation-empty.is-progress .catalog-evaluation-empty__icon {
  background: #eef5ff;
  color: #397bc8;
}

.catalog-evaluation-empty.is-error .catalog-evaluation-empty__icon {
  background: #fff0f1;
  color: #d94b5e;
}

@media (max-width: 980px) {
  .catalog-detail-dialog {
    padding: 18px;
  }

  .catalog-detail-header {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .catalog-detail-heading {
    padding-right: 44px;
  }

  .catalog-detail-meta {
    padding-right: 0;
  }

  .catalog-evaluation-advice-grid {
    grid-template-columns: 1fr;
  }

  .catalog-evaluation-issue-grid {
    grid-template-columns: 1fr;
  }

  .catalog-evaluation-dimensions article {
    grid-template-columns: 1fr;
    gap: 9px;
  }
}

@media (max-width: 640px) {
  .catalog-detail-overlay {
    padding: 8px;
  }

  .catalog-detail-dialog {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    padding: 14px;
  }

  .catalog-detail-meta,
  .catalog-detail-meta.is-skill {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .catalog-evaluation-panel {
    padding: 10px 8px 14px;
  }

  .catalog-evaluation-summary {
    grid-template-columns: 1fr;
  }

  .catalog-evaluation-score-card {
    padding: 18px;
  }

  .catalog-evaluation-section {
    padding: 16px;
  }
}
</style>

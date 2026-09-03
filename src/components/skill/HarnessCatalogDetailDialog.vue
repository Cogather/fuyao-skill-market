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

type EvaluationDimensionDefinition = {
  id: string;
  label: string;
  maxScore: number;
};

type EvaluationDimensionScore = {
  id: string;
  score: number;
  description: string;
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

type SkillEvaluation = {
  model: string;
  evaluatedAt: string;
  score: number;
  dimensions: EvaluationDimensionScore[];
  advices: Record<string, string>;
  issues: EvaluationIssue[];
};

const DEFAULT_EVALUATION_DIMENSIONS: EvaluationDimensionDefinition[] = [
  { id: 'D1', label: '技能边界完整性', maxScore: 20 },
  { id: 'D2', label: '接口规范完整性', maxScore: 20 },
  { id: 'D3', label: '异常与边界处理', maxScore: 20 },
  { id: 'D4', label: '规则一致性', maxScore: 20 },
  { id: 'D5', label: '安全与权限约束', maxScore: 20 },
];

const EVALUATION_ADVICE_LABELS: Record<string, string> = {
  'SKILL.md': '主说明文档',
  references: '引用资料',
  scripts: '执行脚本',
  safety: '高风险操作确认',
  output: '输出验收标准',
  logging: '关键操作日志',
  dependencies: '依赖与运行环境',
  consistency: '术语与字段命名',
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
const evaluationDimensions = ref<EvaluationDimensionDefinition[]>([
  ...DEFAULT_EVALUATION_DIMENSIONS,
]);
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
  const score = evaluation.value?.score ?? 0;
  if (score >= 90) return { grade: 'A', label: '优秀' };
  if (score >= 80) return { grade: 'B', label: '良好' };
  if (score >= 70) return { grade: 'C', label: '合格' };
  return { grade: 'D', label: '待改进' };
});

const evaluationScoreRingStyle = computed(() => {
  const score = Math.min(100, Math.max(0, evaluation.value?.score ?? 0));
  return {
    background: `conic-gradient(#6677f7 0 ${score}%, #e8ecf7 ${score}% 100%)`,
  };
});

const evaluationAdviceItems = computed(() => {
  const entries = Object.entries(evaluation.value?.advices ?? {}).filter(([, value]) =>
    Boolean(value.trim()),
  );
  return entries.map(([key, value], index) => ({
    key,
    label: EVALUATION_ADVICE_LABELS[key] ?? key,
    value,
    rank: String(index + 1).padStart(2, '0'),
  }));
});

const visibleEvaluationAdviceItems = computed(() => {
  return showAllEvaluationAdvices.value
    ? evaluationAdviceItems.value
    : evaluationAdviceItems.value.slice(0, 3);
});

const evaluationDimensionRows = computed(() => {
  const definitionMap = new Map(evaluationDimensions.value.map((item) => [item.id, item]));
  return (evaluation.value?.dimensions ?? []).map((item, index) => {
    const definition = definitionMap.get(item.id) ?? DEFAULT_EVALUATION_DIMENSIONS[index];
    const maxScore = definition?.maxScore ?? 20;
    const ratio = maxScore > 0 ? Math.min(100, Math.max(0, (item.score / maxScore) * 100)) : 0;
    return {
      ...item,
      label: definition?.label || item.id,
      maxScore,
      ratio,
      tone: ratio >= 85 ? 'good' : ratio >= 70 ? 'medium' : 'risk',
    };
  });
});

const visibleEvaluationIssues = computed(() => {
  const issues = evaluation.value?.issues ?? [];
  return showAllEvaluationIssues.value ? issues : issues.slice(0, 2);
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

function normalizeEvaluationDimensions(value: unknown): EvaluationDimensionDefinition[] {
  if (!Array.isArray(value)) return [...DEFAULT_EVALUATION_DIMENSIONS];

  const dimensions = value
    .map((item, index) => {
      const record = readRecord(item);
      const fallback = DEFAULT_EVALUATION_DIMENSIONS[index];
      const id = String(record.dimensionId ?? record.id ?? fallback?.id ?? `D${index + 1}`).trim();
      const maxScore =
        readFiniteNumber(record.maxScore ?? record.max_score) ?? fallback?.maxScore ?? 20;
      return {
        id,
        label: String(record.label ?? record.name ?? fallback?.label ?? id).trim(),
        maxScore: maxScore > 0 ? maxScore : 20,
      };
    })
    .filter((item) => Boolean(item.id));

  return dimensions.length ? dimensions : [...DEFAULT_EVALUATION_DIMENSIONS];
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

function normalizeEvaluationIssues(value: unknown): EvaluationIssue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const record = readRecord(item);
      const title = String(
        record.title ?? record.name ?? record.issueTitle ?? record.issue_title ?? '',
      ).trim();
      if (!title) return null;
      const severity = normalizeIssueSeverity(
        record.severity ??
          record.riskLevel ??
          record.risk_level ??
          record.level ??
          record.issueLevel ??
          record.issue_level,
      );
      return {
        id: String(
          record.issueId ?? record.issue_id ?? record.code ?? record.id ?? `ISSUE-${index + 1}`,
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
        dimension: String(
          record.dimension ??
            record.dimensionName ??
            record.dimension_name ??
            record.category ??
            record.tag ??
            '',
        ).trim(),
      };
    })
    .filter((item): item is EvaluationIssue => item !== null);
}

function normalizeSkillEvaluation(value: unknown): SkillEvaluation | null {
  const payload = readRecord(value);
  const source = readEvaluationSource(payload);
  const dimensions = Array.isArray(source.dimensionScores)
    ? source.dimensionScores
        .map((item, index) => {
          const record = readRecord(item);
          const score = readFiniteNumber(record.score);
          if (score == null) return null;
          return {
            id: String(record.dimensionId ?? record.id ?? `D${index + 1}`).trim(),
            score,
            description: String(
              record.deductionBreakdown ?? record.description ?? record.reason ?? '',
            ).trim(),
          };
        })
        .filter((item): item is EvaluationDimensionScore => item !== null)
    : [];
  const advices = Object.entries(readRecord(source.advices)).reduce<Record<string, string>>(
    (result, [key, advice]) => {
      const text = String(advice ?? '').trim();
      if (text) result[key] = text;
      return result;
    },
    {},
  );
  const score = readFiniteNumber(source.aiScore ?? source.score);
  const issues = normalizeEvaluationIssues(
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
  );

  if (
    score == null &&
    dimensions.length === 0 &&
    Object.keys(advices).length === 0 &&
    issues.length === 0
  ) {
    return null;
  }

  return {
    model: String(source.aiModel ?? source.model ?? '').trim(),
    evaluatedAt: String(source.evaluateTime ?? source.evaluatedAt ?? source.updatedAt ?? '').trim(),
    score: score ?? dimensions.reduce((sum, item) => sum + item.score, 0),
    dimensions,
    advices,
    issues,
  };
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
  evaluationDimensions.value = [...DEFAULT_EVALUATION_DIMENSIONS];
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
      skillId: props.record.id,
      userId: props.userId || undefined,
      version: selectedVersion.value,
    });
    if (sequence !== evaluationLoadSequence) return;
    if (detailResponse?.meta?.success === false) {
      throw new Error(String(detailResponse?.meta?.message || '评估信息加载失败'));
    }

    const payload = readRecord(detailResponse?.data);
    const evaluationSource = readEvaluationSource(payload);
    evaluationDimensions.value = normalizeEvaluationDimensions(
      payload.dimensionDefinitions ??
        payload.dimensions ??
        payload.aiDimensions ??
        evaluationSource.dimensionDefinitions ??
        evaluationSource.aiDimensions,
    );
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
            <h3>{{ props.record.name }}</h3>
            <p>{{ props.record.description || `查看 ${capabilityLabel} 的版本与文件详情。` }}</p>
          </div>

          <div class="catalog-detail-meta">
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
            <button
              type="button"
              class="catalog-detail-close"
              aria-label="关闭"
              @click="closeDialog"
            >
              ×
            </button>
          </div>
        </header>

        <label v-if="detailVersions.length" class="catalog-detail-version-filter">
          <span class="version-copy">
            <strong>版本</strong>
            <small>选择版本后展示对应的目录和文件内容</small>
          </span>
          <select v-model="selectedVersion" aria-label="详情版本" @change="loadSelectedVersion">
            <option v-for="item in detailVersions" :key="item.version" :value="item.version">
              {{ item.version }}
            </option>
          </select>
          <span class="version-updated">
            <small>更新时间</small>
            <strong>{{ formatUpdatedTime(selectedVersionRecord?.uploadedAt) }}</strong>
          </span>
        </label>

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
            <p>完成静态评估后，可在这里查看综合得分、改进建议、安全问题和各维度表现。</p>
          </div>

          <template v-else>
            <div class="catalog-evaluation-summary">
              <article class="catalog-evaluation-score-card">
                <div class="catalog-evaluation-score-ring" :style="evaluationScoreRingStyle">
                  <div>
                    <strong>{{ evaluation.score }}</strong>
                    <span>满分 100</span>
                  </div>
                </div>
                <div>
                  <small>综合得分</small>
                  <strong>得分率 {{ Math.round(evaluation.score) }}%</strong>
                  <p>当前版本静态评估结果</p>
                </div>
              </article>

              <article class="catalog-evaluation-summary-card">
                <small>质量等级</small>
                <div class="catalog-evaluation-grade">{{ evaluationGrade.grade }}</div>
                <strong>{{ evaluationGrade.label }}</strong>
              </article>

              <article class="catalog-evaluation-summary-card">
                <small>评估模型</small>
                <strong>{{ evaluation.model || '—' }}</strong>
                <p>覆盖 {{ evaluation.dimensions.length }} 个评估维度</p>
              </article>

              <article class="catalog-evaluation-summary-card">
                <small>评估时间</small>
                <strong>{{ formatUpdatedTime(evaluation.evaluatedAt) }}</strong>
                <p>对应版本 {{ selectedVersion }}</p>
              </article>
            </div>

            <section v-if="evaluationAdviceItems.length" class="catalog-evaluation-section">
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>{{ showAllEvaluationAdvices ? '优先改进' : '优先改进（Top 3）' }}</h4>
                  <p>按内容区域整理的改进建议</p>
                </div>
                <button
                  v-if="evaluationAdviceItems.length > 3"
                  type="button"
                  class="catalog-evaluation-section__action"
                  :aria-expanded="showAllEvaluationAdvices"
                  @click="showAllEvaluationAdvices = !showAllEvaluationAdvices"
                >
                  {{
                    showAllEvaluationAdvices
                      ? '收起改进建议 ↑'
                      : `查看全部改进建议（${evaluationAdviceItems.length}）→`
                  }}
                </button>
                <span v-else>{{ evaluationAdviceItems.length }} 项</span>
              </header>
              <div class="catalog-evaluation-advice-grid">
                <article v-for="item in visibleEvaluationAdviceItems" :key="item.key">
                  <div>
                    <span>{{ item.rank }}</span>
                    <strong>{{ item.label }}</strong>
                  </div>
                  <p>{{ item.value }}</p>
                  <small>{{ item.key }}</small>
                </article>
              </div>
            </section>

            <section
              v-if="evaluation.issues.length"
              class="catalog-evaluation-section catalog-evaluation-section--issues"
            >
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>安全与主要问题</h4>
                  <p>合并展示安全问题、批评问题和待整改项</p>
                </div>
                <button
                  v-if="evaluation.issues.length > 5"
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

              <div class="catalog-evaluation-issue-grid">
                <article
                  v-for="issue in visibleEvaluationIssues"
                  :key="issue.id"
                  :class="`is-${issue.severity}`"
                >
                  <div class="catalog-evaluation-issue-meta">
                    <span>{{ issue.severityLabel }}</span>
                    <strong>{{ issue.id }}</strong>
                  </div>
                  <h5>{{ issue.title }}</h5>
                  <p>{{ issue.description || '暂无问题详情。' }}</p>
                  <footer>
                    <span v-if="issue.evidence">证据：{{ issue.evidence }}</span>
                    <span v-else>暂无证据路径</span>
                    <small v-if="issue.dimension">{{ issue.dimension }}</small>
                  </footer>
                </article>
              </div>
            </section>

            <section class="catalog-evaluation-section">
              <header class="catalog-evaluation-section__header">
                <div>
                  <h4>各维度表现</h4>
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
                      <small>{{ dimension.id }}</small>
                    </div>
                  </div>
                  <div class="catalog-evaluation-dimension-score">
                    <div><span :style="{ width: `${dimension.ratio}%` }"></span></div>
                    <strong>{{ dimension.score }} / {{ dimension.maxScore }}</strong>
                  </div>
                  <p>{{ dimension.description || '暂无该维度的详细说明。' }}</p>
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

.catalog-detail-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 28px;
  margin-top: 14px;
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
  grid-template-columns: 1.4fr 0.8fr 1.05fr 1.05fr;
  gap: 12px;
}

.catalog-evaluation-score-card,
.catalog-evaluation-summary-card {
  position: relative;
  min-width: 0;
  min-height: 144px;
  overflow: hidden;
  border: 1px solid rgba(170, 183, 220, 0.42);
  border-radius: 16px;
  box-shadow: 0 12px 28px rgba(70, 82, 148, 0.1);
}

.catalog-evaluation-score-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 22px;
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
  width: 100px;
  height: 100px;
  flex: 0 0 100px;
  place-items: center;
  border-radius: 50%;
  box-shadow: 0 10px 24px rgba(86, 105, 220, 0.22);
}

.catalog-evaluation-score-ring::before {
  position: absolute;
  width: 78px;
  height: 78px;
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
  font-size: 24px;
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

.catalog-evaluation-score-card > div:last-child {
  display: grid;
  min-width: 0;
  gap: 9px;
}

.catalog-evaluation-score-card > div:last-child strong {
  color: #354365;
  font-size: 15px;
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

.catalog-evaluation-summary-card:nth-child(2)::after {
  background: rgba(139, 92, 246, 0.13);
}

.catalog-evaluation-summary-card:nth-child(3) {
  background: linear-gradient(145deg, #effaff 0%, #fff 100%);
}

.catalog-evaluation-summary-card:nth-child(3)::after {
  background: rgba(56, 198, 242, 0.14);
}

.catalog-evaluation-summary-card:nth-child(4) {
  background: linear-gradient(145deg, #fff8ed 0%, #fff 100%);
}

.catalog-evaluation-summary-card:nth-child(4)::after {
  background: rgba(255, 159, 45, 0.14);
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

.catalog-evaluation-advice-grid article > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.catalog-evaluation-advice-grid article > div span {
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

.catalog-evaluation-advice-grid article > div strong {
  color: #293653;
  font-size: 13px;
}

.catalog-evaluation-advice-grid article p {
  margin: 13px 0 12px;
  color: #596680;
  font-size: 11px;
  line-height: 1.75;
}

.catalog-evaluation-advice-grid article small {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(var(--advice-color), 0.1);
  color: rgb(var(--advice-color));
  font-size: 9px;
  font-weight: 800;
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

.catalog-evaluation-issue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.catalog-evaluation-issue-meta strong {
  color: #56617c;
  font-size: 10px;
}

.catalog-evaluation-issue-grid h5 {
  margin: 13px 0 7px;
  color: #26324e;
  font-size: 13px;
  line-height: 1.45;
}

.catalog-evaluation-issue-grid article > p {
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

.catalog-evaluation-issue-grid footer small {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(var(--issue-color), 0.09);
  color: rgb(var(--issue-color));
  font-size: 9px;
  font-weight: 800;
}

.catalog-evaluation-dimensions {
  display: grid;
  gap: 10px;
}

.catalog-evaluation-dimensions article {
  --dimension-color: 39, 180, 111;
  display: grid;
  grid-template-columns: minmax(200px, 0.85fr) minmax(220px, 0.85fr) minmax(280px, 1.3fr);
  align-items: center;
  gap: 20px;
  min-height: 78px;
  padding: 13px 16px;
  border: 1px solid rgba(var(--dimension-color), 0.18);
  border-left: 4px solid rgb(var(--dimension-color));
  border-radius: 13px;
  background: linear-gradient(90deg, rgba(var(--dimension-color), 0.08), #fff 24%);
}

.catalog-evaluation-dimensions article:nth-child(2) {
  --dimension-color: 56, 151, 235;
}

.catalog-evaluation-dimensions article:nth-child(3) {
  --dimension-color: 255, 159, 45;
}

.catalog-evaluation-dimensions article:nth-child(4) {
  --dimension-color: 139, 92, 246;
}

.catalog-evaluation-dimensions article:nth-child(5n) {
  --dimension-color: 241, 91, 107;
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
  gap: 3px;
}

.catalog-evaluation-dimension-name strong {
  color: #33405d;
  font-size: 12px;
}

.catalog-evaluation-dimension-name small {
  color: #8a95aa;
  font-size: 10px;
}

.catalog-evaluation-dimension-score {
  display: flex;
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

.catalog-evaluation-dimensions article > p {
  margin: 0;
  color: #596680;
  font-size: 11px;
  line-height: 1.65;
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

@media (max-width: 1120px) {
  .catalog-evaluation-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

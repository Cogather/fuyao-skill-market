export type SkillBehaviorEvaluationKind = 'trigger' | 'quality';

export type SkillBehaviorCaseFilter = 'all' | 'passed' | 'failed';

export interface SkillBehaviorSummary {
  passed: number;
  total: number;
  durationSeconds: number;
  state: string;
}

export interface SkillBehaviorCaseDetail {
  label: string;
  content: string;
}

export interface SkillTriggerEvaluationCase {
  id: string;
  task: string;
  type: '正向' | '反向';
  expected: boolean;
  actual: boolean;
  passed: boolean;
  details: SkillBehaviorCaseDetail[];
}

export interface SkillQualityEvaluationCase {
  id: string;
  task: string;
  score: number;
  duration: string;
  passed: boolean;
  details: SkillBehaviorCaseDetail[];
}

export interface SkillBehaviorEvaluationMock {
  version: string;
  triggeredBy: string;
  triggeredById: string;
  triggeredAt: string;
  model: string;
  summaries: Record<SkillBehaviorEvaluationKind, SkillBehaviorSummary>;
  triggerComposition: Array<{
    key: string;
    type: '正向' | '反向';
    label: string;
    value: number;
    description: string;
    tone: 'blue' | 'orange' | 'red' | 'green';
  }>;
  triggerCases: SkillTriggerEvaluationCase[];
  qualityCases: SkillQualityEvaluationCase[];
  durationDistribution: Array<{ label: string; value: number }>;
  scoreDistribution: Array<{ label: string; value: number }>;
}

export interface SkillBehaviorTrendPoint {
  version: string;
  triggerRate: number;
  qualityRate: number;
}

const triggerCases: SkillTriggerEvaluationCase[] = [
  {
    id: 'TC-T-001',
    task: '报销上周北京出差的机票和酒店',
    type: '正向',
    expected: true,
    actual: true,
    passed: true,
    details: [
      {
        label: '期望',
        content: '触发当前 Skill，识别为费用报销意图并进入审批流程。',
      },
      {
        label: '实际',
        content: '正确触发当前 Skill，路由得分 0.82，已进入报销审批节点。',
      },
    ],
  },
  {
    id: 'TC-T-002',
    task: '把今天会议纪要整理一下',
    type: '反向',
    expected: false,
    actual: false,
    passed: true,
    details: [
      { label: '期望', content: '不应触发当前 Skill，应路由至通用助手或会议纪要类 Skill。' },
      { label: '实际', content: '未触发当前 Skill，正确路由至通用助手。' },
    ],
  },
  {
    id: 'TC-T-007',
    task: '报销上周招待客户的餐费',
    type: '正向',
    expected: true,
    actual: false,
    passed: false,
    details: [
      { label: '期望', content: '触发当前 Skill，招待费属于费用报销场景，应进入审批流程。' },
      {
        label: '实际',
        content: '未触发任何 Skill，意图得分 0.41 低于阈值 0.55，回退至通用助手。',
      },
    ],
  },
  {
    id: 'TC-T-013',
    task: '帮我订下周去上海的机票',
    type: '反向',
    expected: false,
    actual: true,
    passed: false,
    details: [
      { label: '期望', content: '不应触发当前 Skill，应路由至差旅预订 Skill。' },
      {
        label: '实际',
        content: '误触发当前 Skill，“机票”关键词与报销场景混淆，意图分类阈值偏低。',
      },
    ],
  },
];

const qualityCases: SkillQualityEvaluationCase[] = [
  {
    id: 'TC-Q-001',
    task: '识别机票 ¥1280 + 酒店 ¥680 报销单',
    score: 92,
    duration: '2.1s',
    passed: true,
    details: [
      { label: '期望结果', content: '识别金额合计 ¥1960，校验合规，输出审批节点为“直属主管”。' },
      { label: '实际输出', content: '合计 ¥1960，合规校验通过，流转至直属主管审批。' },
      {
        label: '评分分析',
        content: '金额识别准确、字段完整、流转正确；未附合规提示语，扣 8 分。',
      },
    ],
  },
  {
    id: 'TC-Q-004',
    task: '住宿费 ¥980/晚（超差旅标准 ¥800）',
    score: 52,
    duration: '2.4s',
    passed: false,
    details: [
      { label: '期望结果', content: '提示住宿费超出标准 ¥180/晚，需额外审批，并生成超标标记。' },
      { label: '实际输出', content: '住宿费合计 ¥1960，校验通过，已提交审批；未识别超标。' },
      {
        label: '评分分析',
        content: '未将单价与差旅标准比对，仅做总额校验，合规性维度扣分严重。',
      },
    ],
  },
  {
    id: 'TC-Q-009',
    task: '缺失出差事由的报销单',
    score: 68,
    duration: '1.8s',
    passed: false,
    details: [
      { label: '期望结果', content: '提示补填“出差事由”字段并阻断提交。' },
      { label: '实际输出', content: '未提示缺字段，直接提交，仅在备注中标记“事由缺失”。' },
      { label: '评分分析', content: '完整性维度扣分，必填字段校验缺失。' },
    ],
  },
];

function normalizedVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizedVersion(left).split(/[.-]/).map(Number);
  const rightParts = normalizedVersion(right).split(/[.-]/).map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const result = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (result) return result;
  }
  return normalizedVersion(left).localeCompare(normalizedVersion(right), undefined, {
    numeric: true,
  });
}

export function skillBehaviorVersionHasData(version: string): boolean {
  // Temporary local contract: v0.9.0 demonstrates the not-yet-evaluated state until APIs are wired.
  return Boolean(version) && normalizedVersion(version) !== '0.9.0';
}

export function getSkillBehaviorEvaluationMock(input: {
  version: string;
  userName?: string;
  userId?: string;
}): SkillBehaviorEvaluationMock | null {
  if (!skillBehaviorVersionHasData(input.version)) return null;
  return {
    version: input.version,
    triggeredBy: input.userName?.trim() || '张明',
    triggeredById: input.userId?.trim() || 'zhangm001',
    triggeredAt: '2026-09-18 16:08',
    model: 'glm-4.6',
    summaries: {
      trigger: { passed: 18, total: 20, durationSeconds: 12.4, state: '已完成' },
      quality: { passed: 17, total: 20, durationSeconds: 18.7, state: '已完成' },
    },
    triggerComposition: [
      {
        key: 'positive-hit',
        type: '正向',
        label: '命中',
        value: 11,
        description: '应触发且已正确触发',
        tone: 'blue',
      },
      {
        key: 'positive-miss',
        type: '正向',
        label: '漏触发',
        value: 1,
        description: '应触发但未触发',
        tone: 'orange',
      },
      {
        key: 'negative-false',
        type: '反向',
        label: '误触发',
        value: 1,
        description: '不应触发却触发',
        tone: 'red',
      },
      {
        key: 'negative-correct',
        type: '反向',
        label: '正确不触发',
        value: 7,
        description: '不应触发且未触发',
        tone: 'green',
      },
    ],
    triggerCases: triggerCases.map((item) => ({
      ...item,
      details: item.details.map((detail) => ({ ...detail })),
    })),
    qualityCases: qualityCases.map((item) => ({
      ...item,
      details: item.details.map((detail) => ({ ...detail })),
    })),
    durationDistribution: [
      { label: '<1min', value: 5 },
      { label: '1-10min', value: 9 },
      { label: '10-30min', value: 4 },
      { label: '>30min', value: 2 },
    ],
    scoreDistribution: [
      { label: '<60', value: 1 },
      { label: '60-70', value: 2 },
      { label: '70-80', value: 3 },
      { label: '80-90', value: 7 },
      { label: '90-100', value: 7 },
    ],
  };
}

export function getSkillBehaviorTrendMock(versions: string[]): SkillBehaviorTrendPoint[] {
  const evaluated = [...new Set(versions.filter(skillBehaviorVersionHasData))].sort(
    compareVersions,
  );
  return evaluated.map((version, index) => {
    const progress = evaluated.length <= 1 ? 1 : index / (evaluated.length - 1);
    return {
      version,
      triggerRate: Math.round(62 + progress * 28),
      qualityRate: Math.round(55 + progress * 30),
    };
  });
}

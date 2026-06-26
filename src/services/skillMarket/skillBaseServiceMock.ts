import PizZip from 'pizzip';
import type { AxiosRequestConfig } from 'axios';
import type { Skill, SkillVersionEntry } from '../../types/skill';
import { buildOpsDashboardBundle, parseDeptNamePath } from '../../utils/opsExcelImport';
import { stableNumericId } from './mappers';
import { getBuiltInSkills } from './mock/builtInSkills';
import { getMockBusinessDimensions } from './mock/businessDimensionsDefault';
import { mapSkillVersionsToListDto } from './mock/mapSkillVersionsToListDto';
import { getMockMarketDepartmentsTree } from './mock/marketDepartmentsTreeDefault';
import { marketSkillsToOpsExcelRows } from './opsBundleFromSkills';

function semverNums(v: string): number[] {
  return String(v)
    .split('.')
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** 版本号降序（2.0.1 > 1.2.0） */
function compareSemverDesc(a: string, b: string): number {
  const pa = semverNums(a);
  const pb = semverNums(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

type MockChannel = 'api' | 'skill' | 'fuyao' | 'direct';

const MOCK_VALIDATE_USER = {
  uid: 'w30000001',
  displayNameEN: 'Mock User',
  displayNameCN: '模拟用户',
  mail: 'mock.user@example.com',
} as const;

type MockEnvelope<T> = {
  code: number;
  message: string;
  meta: {
    number: number;
    message: string;
    success: boolean;
  };
  data: T;
};

type PagedArray<T> = T[] & {
  records: T[];
  total: number;
};

type MockOrganization = {
  id: number;
  orgName: string;
  orgCode: string;
  admins: string;
  enabled: boolean;
};

type MockSyncRow = {
  id: number;
  skillId?: string | number;
  skillName: string;
  applyType: string;
  targetLevel: string;
  targetOrgId: number;
  targetOrgName: string;
  reason: string;
  reasonDetail?: string;
  approverLabel: string;
  status: string;
  reviewResult?: string;
  reviewComment?: string;
  completedAt?: string;
};

type MockQualityReviewRow = {
  id: number;
  reviewMonth: string;
  skillId: string;
  skillName: string;
  deptName: string;
  score: number;
  qualityMark: string;
  reviewComment: string;
  reviewStatus: string;
};

type MockExpertReviewDimension = {
  dimensionId: string;
  name: string;
  description: string;
  weight: number;
};

type MockReviewBadge = {
  badgeId: string;
  name: string;
  description: string;
};

type MockExpertReviewDimensionScore = {
  dimensionId: string;
  score?: number;
  reason?: string;
};

type MockSkillReviewDetail = {
  reviewId: string;
  skillId: string;
  aiScore: number;
  reviewStatus: 'pending' | 'draft' | 'submitted';
  totalScore: number | null;
  dimensionScores: MockExpertReviewDimensionScore[];
  badgeIds: string[];
  badgeReason?: string;
  overallOpinion?: string;
  updatedAt?: string;
};

type MockSkillRecord = Skill & {
  author: string;
  createdBy: string;
  currentVersion: string;
  category: string;
  categoryGroupName: string;
  status: string;
  orgId: number | null;
  orgName: string | null;
  departmentL1: string;
  departmentL2: string;
  departmentL3: string;
  departmentL4: string;
  departmentL5: string;
  departmentL6: string;
  requirements: string;
  fileDir: string;
  packagePath: string;
  fileTree: string | string[];
  skillMdContent: string;
  createdAt: string;
  updatedAt: string;
  likes: number;
  dislikes: number;
  qualityMark: string | null;
  qualityBadges: string[];
  scored: boolean;
};

const MOCK_ORGS: MockOrganization[] = [
  {
    id: 1,
    orgName: 'IT装备部',
    orgCode: 'ORG-IT-001',
    admins: 'it_admin_a,it_admin_b',
    enabled: true,
  },
  {
    id: 2,
    orgName: '质量工具组',
    orgCode: 'ORG-QA-002',
    admins: 'qa_admin_a,qa_admin_b',
    enabled: true,
  },
  {
    id: 3,
    orgName: '平台工具组',
    orgCode: 'ORG-PLAT-003',
    admins: 'plat_admin_a,plat_admin_b',
    enabled: true,
  },
  {
    id: 4,
    orgName: '云服务组',
    orgCode: 'ORG-CLOUD-004',
    admins: 'cloud_admin_a,cloud_admin_b',
    enabled: true,
  },
  {
    id: 5,
    orgName: 'SRE团队',
    orgCode: 'ORG-SRE-005',
    admins: 'sre_admin_a,sre_admin_b',
    enabled: true,
  },
  { id: 6, orgName: 'DevOps组', orgCode: 'ORG-DEVOPS-006', admins: 'devops_admin', enabled: true },
];

const CATEGORY_BY_GROUP: Record<string, string> = {
  公共: 'COMMON',
  设计: 'DESIGN',
  开发: 'DEVELOPMENT',
  测试: 'TEST',
  运维: 'OPERATIONS',
  维护: 'MAINTENANCE',
  研究: 'RESEARCH',
  项目管理: 'PROJECT_MANAGEMENT',
};

const GROUP_BY_CATEGORY_CODE = Object.entries(CATEGORY_BY_GROUP).reduce<Record<string, string>>(
  (map, [group, code]) => {
    map[code] = group;
    return map;
  },
  {},
);

const orgStore: MockOrganization[] = MOCK_ORGS.map((o) => ({ ...o }));

let syncPending: MockSyncRow[] = [
  {
    id: 90_001,
    skillId: 10_001,
    skillName: '日志分析 Skill',
    applyType: '同步至公司组织',
    targetLevel: '组织级',
    targetOrgId: 5,
    targetOrgName: 'SRE团队',
    reason: '已在个人级完成使用验证，希望沉淀到 SRE 团队统一排障使用。',
    reasonDetail: '首版手动评审；后续接入评测集与代码仓门禁。',
    approverLabel: 'SRE团队组织管理员',
    status: '待审核',
  },
  {
    id: 90_002,
    skillId: 10_002,
    skillName: '接口 Mock 生成 Skill',
    applyType: '同步至公司组织',
    targetLevel: '组织级',
    targetOrgId: 3,
    targetOrgName: '平台工具组',
    reason: '已在个人级快速验证，可复用到接口联调场景。',
    reasonDetail: '首版手动评审；后续接入评测集与代码仓门禁。',
    approverLabel: '平台工具组组织管理员',
    status: '待审核',
  },
];

let syncDone: MockSyncRow[] = [
  {
    id: 80_001,
    skillName: '接口设计检查 Skill',
    applyType: '同步至公司组织',
    targetLevel: '组织级',
    targetOrgId: 2,
    targetOrgName: '质量工具组',
    reason: '',
    approverLabel: '',
    status: '已完成',
    reviewResult: '通过',
    reviewComment: '复用场景明确，已具备组织级沉淀价值。',
    completedAt: '2026-04-22 15:20',
  },
  {
    id: 80_002,
    skillName: 'PDF 表格抽取 Skill',
    applyType: '同步至公司组织',
    targetLevel: '组织级',
    targetOrgId: 2,
    targetOrgName: 'PDF处理小组',
    reason: '',
    approverLabel: '',
    status: '已完成',
    reviewResult: '不通过',
    reviewComment: '缺少评测样例和复用数据，需补充后重新提交。',
    completedAt: '2026-04-21 18:06',
  },
];

let qualityReviews: MockQualityReviewRow[] = [
  {
    id: 70_001,
    reviewMonth: '2026-04',
    skillId: '2',
    skillName: 'test2',
    deptName: '平台工具部',
    score: 92,
    qualityMark: '优秀 Skill',
    reviewComment: '下载量高，复用场景稳定。',
    reviewStatus: '已保存',
  },
  {
    id: 70_002,
    reviewMonth: '2026-04',
    skillId: '5',
    skillName: '接口 Mock 生成 Skill',
    deptName: '平台工具组',
    score: 86,
    qualityMark: '高复用 Skill',
    reviewComment: '建议补充更多接口协议示例。',
    reviewStatus: '待归档',
  },
];

const MOCK_EXPERT_REVIEW_DIMENSIONS: MockExpertReviewDimension[] = [
  {
    dimensionId: 'dim-001',
    name: '问题定义准确性',
    description: '是否准确识别并抓住核心问题',
    weight: 0.4,
  },
  {
    dimensionId: 'dim-002',
    name: '解决方案创新性',
    description: '方案是否具有创新性和突破性',
    weight: 0.3,
  },
  {
    dimensionId: 'dim-003',
    name: '工程落地能力',
    description: '方案是否具备实际落地价值',
    weight: 0.3,
  },
];

const MOCK_REVIEW_BADGES: MockReviewBadge[] = [
  {
    badgeId: 'badge-001',
    name: '破局先锋',
    description: '在问题解决方面具有突破性贡献',
  },
  {
    badgeId: 'badge-002',
    name: '创新引领者',
    description: '方案创新性突出',
  },
  {
    badgeId: 'badge-003',
    name: '工程典范',
    description: '工程质量与落地效果优秀',
  },
];

const expertReviewDetailStore: Record<string, MockSkillReviewDetail> = {};

function nowText(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(
    2,
    '0',
  )} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function mockSeedFromSkillId(skillId: string): number {
  const numeric = Number(String(skillId).replace(/[^\d]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return Array.from(skillId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function clampReviewScore(value: number): number {
  return roundToTwo(Math.min(100, Math.max(0, value)));
}

function computeWeightedTotal(dimensionScores: MockExpertReviewDimensionScore[]): number | null {
  if (!dimensionScores.length) {
    return null;
  }

  let total = 0;
  let hasScore = false;

  for (const dimension of MOCK_EXPERT_REVIEW_DIMENSIONS) {
    const item = dimensionScores.find((score) => score.dimensionId === dimension.dimensionId);
    if (typeof item?.score !== 'number' || Number.isNaN(item.score)) {
      continue;
    }
    hasScore = true;
    total += item.score * dimension.weight;
  }

  return hasScore ? roundToTwo(total) : null;
}

function defaultReasonForDimension(name: string, score: number): string {
  return `${name}表现较好，评分为${score.toFixed(2)}分，优势明确且仍有进一步优化空间。`;
}

function createSubmittedDimensionScores(seed: number): MockExpertReviewDimensionScore[] {
  return MOCK_EXPERT_REVIEW_DIMENSIONS.map((dimension, index) => {
    const score = clampReviewScore(82 + ((seed + index * 7) % 15) + index * 1.25);
    return {
      dimensionId: dimension.dimensionId,
      score,
      reason: defaultReasonForDimension(dimension.name, score),
    };
  });
}

function createDraftDimensionScores(seed: number): MockExpertReviewDimensionScore[] {
  const firstDimension = MOCK_EXPERT_REVIEW_DIMENSIONS[0];
  if (!firstDimension) {
    return [];
  }

  const score = clampReviewScore(84 + (seed % 10) * 0.5);
  return [
    {
      dimensionId: firstDimension.dimensionId,
      score,
      reason: `${firstDimension.name}分析较完整，先记录初步判断，后续补全其他维度。`,
    },
  ];
}

function normalizeDraftDimensionScores(raw: unknown): MockExpertReviewDimensionScore[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      if (!record) {
        return null;
      }

      const dimensionId = String(record.dimensionId ?? '').trim();
      if (!dimensionId) {
        return null;
      }

      const nextItem: MockExpertReviewDimensionScore = { dimensionId };
      const score = record.score;
      if (typeof score === 'number' && Number.isFinite(score)) {
        nextItem.score = roundToTwo(score);
      } else if (typeof score === 'string' && score.trim()) {
        const parsed = Number(score);
        if (Number.isFinite(parsed)) {
          nextItem.score = roundToTwo(parsed);
        }
      }

      const reason = String(record.reason ?? '').trim();
      if (reason) {
        nextItem.reason = reason;
      }

      return nextItem;
    })
    .filter((item): item is MockExpertReviewDimensionScore => {
      return Boolean(item && (item.reason || item.score != null));
    });
}

function normalizeBadgeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return [...new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeBadgeReason(raw: unknown, badgeIds: string[]): string {
  if (badgeIds.length === 0) {
    return '';
  }
  return readString(raw, '').trim();
}

function normalizeOverallOpinion(raw: unknown): string {
  return readString(raw, '').trim();
}

function ensureExpertReviewDetail(skillId: string): MockSkillReviewDetail {
  const key = String(skillId).trim();
  const existing = expertReviewDetailStore[key];
  if (existing) {
    return existing;
  }

  const seed = mockSeedFromSkillId(key);
  const submitted = seed % 3 !== 1;
  const drafted = !submitted && seed % 2 === 0;
  const dimensionScores = submitted
    ? createSubmittedDimensionScores(seed)
    : drafted
      ? createDraftDimensionScores(seed)
      : [];
  const detail: MockSkillReviewDetail = {
    reviewId: `review-${key}`,
    skillId: key,
    aiScore: 8600 + (seed % 1200),
    reviewStatus: submitted ? 'submitted' : drafted ? 'draft' : 'pending',
    totalScore: computeWeightedTotal(dimensionScores),
    dimensionScores,
    badgeIds: submitted
      ? [MOCK_REVIEW_BADGES[seed % MOCK_REVIEW_BADGES.length]?.badgeId ?? '']
      : [],
    badgeReason: '',
    overallOpinion: '',
    updatedAt: nowText(),
  };

  detail.badgeIds = detail.badgeIds.filter(Boolean);
  if (detail.badgeIds.length > 0) {
    detail.badgeReason = `推荐授予${detail.badgeIds.length}项勋章，Skill 在对应能力维度上表现突出。`;
  }
  if (submitted) {
    detail.overallOpinion =
      '整体来看，该 Skill 在问题识别、方案设计与工程落地上表现均衡，具备较好的推广复用价值。';
  }
  expertReviewDetailStore[key] = detail;
  return detail;
}

function ok<T>(data: T, number?: number): MockEnvelope<T> {
  const n = number ?? (Array.isArray(data) ? data.length : data == null ? 0 : 1);
  return {
    code: 0,
    message: 'OK',
    meta: { number: n, message: 'OK', success: true },
    data,
  };
}

function fail<T>(message: string, data: T, code = 50001): MockEnvelope<T> {
  return {
    code,
    message,
    meta: { number: 0, message, success: false },
    data,
  };
}

function withPageMeta<T extends object>(items: T[], total: number): PagedArray<T> {
  const out = items.map((item) => ({ ...item })) as PagedArray<T>;
  out.records = out;
  out.total = total;
  return out;
}

function normalizePath(path: unknown): string {
  const raw = String(path ?? '').trim();
  if (!raw) {
    return '';
  }
  const pathOnly = raw.split('?')[0] ?? '';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function normalizeMethod(method: unknown): string {
  return String(method ?? 'get').toLowerCase();
}

function readParams(config: AxiosRequestConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (config.params && typeof config.params === 'object') {
    Object.assign(params, config.params as Record<string, unknown>);
  }
  const rawUrl = String(config.url ?? '');
  const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
  if (query) {
    const sp = new URLSearchParams(query);
    sp.forEach((value, key) => {
      params[key] = value;
    });
  }
  return params;
}

/** 开发环境 mock 日志：避免直接打印 FormData/Blob 等不可读内容 */
function summarizeMockRequestBody(data: unknown): unknown {
  if (data === undefined || data === null || data === '') {
    return undefined;
  }
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const fields: string[] = [];
    data.forEach((value, key) => {
      if (typeof File !== 'undefined' && value instanceof File) {
        fields.push(`${key}=File(${value.name}, ${value.size}b)`);
      } else {
        const s = String(value);
        fields.push(`${key}=${s.length > 120 ? `${s.slice(0, 120)}…` : s}`);
      }
    });
    return { _type: 'FormData', fields };
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return { _type: 'Blob', size: data.size };
  }
  if (typeof data === 'string') {
    const t = data.trim();
    if (!t) {
      return undefined;
    }
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t) as unknown;
      } catch {
        return t.length > 500 ? `${t.slice(0, 500)}…` : t;
      }
    }
    return t.length > 500 ? `${t.slice(0, 500)}…` : t;
  }
  return data;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function tagsText(value: unknown): string {
  return splitTags(value).join(',');
}

function categoryGroupFromCategory(category: string): string {
  const raw = category.trim();
  if (CATEGORY_BY_GROUP[raw]) {
    return raw;
  }
  const upper = raw.toUpperCase();
  if (GROUP_BY_CATEGORY_CODE[upper]) {
    return GROUP_BY_CATEGORY_CODE[upper];
  }
  return '公共';
}

function categoryFromGroup(group: string | undefined): string {
  return CATEGORY_BY_GROUP[group ?? ''] ?? 'COMMON';
}

function categoryCandidatesFromParam(category: string): string[] {
  const raw = category.trim();
  if (!raw) {
    return [];
  }
  const out = new Set<string>([raw]);
  const visit = (nodes: ReturnType<typeof getMockBusinessDimensions>, parentCode = ''): boolean => {
    for (const node of nodes) {
      const code = String(node.dimensionCode ?? '').trim();
      const name = String(node.dimensionName ?? '').trim();
      const id = String(node.id ?? '').trim();
      if (raw === id || raw === code || raw === name) {
        if (code) {
          out.add(code);
        }
        if (parentCode) {
          out.add(parentCode);
        }
        return true;
      }
      if (node.children && visit(node.children, code || parentCode)) {
        return true;
      }
    }
    return false;
  };
  visit(getMockBusinessDimensions());
  return [...out];
}

function orgByName(name: string | undefined): MockOrganization | undefined {
  const key = (name ?? '').trim();
  return orgStore.find((o) => o.orgName === key);
}

function skillMockId(seed: Skill): string {
  return String(seed.id ?? stableNumericId(seed));
}

function skillDeptParts(skill: Skill): string[] {
  const direct = [
    (skill as any).departmentL1,
    (skill as any).departmentL2,
    (skill as any).departmentL3,
    (skill as any).departmentL4,
    (skill as any).departmentL5,
    (skill as any).departmentL6,
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  return direct.length > 0 ? direct : parseDeptNamePath(skill.dept_name ?? '');
}

function makeSkillMd(
  record: Pick<
    MockSkillRecord,
    'name' | 'description' | 'requirements' | 'author' | 'currentVersion' | 'category' | 'tags'
  >,
): string {
  return [
    '---',
    `name: ${record.name}`,
    `description: ${record.description}`,
    `requirements: ${record.requirements}`,
    'metadata:',
    `  author: ${record.author}`,
    `  version: ${record.currentVersion}`,
    `  category: ${record.category}`,
    `  tags: ${String(record.tags ?? '').replace(/,/g, ' ')}`,
    '---',
    '',
    `# ${record.name}`,
    '',
    record.description,
  ].join('\n');
}

const DEFAULT_MOCK_FILE_TREE: string[] = ['SKILL.md', 'README.md', 'scripts/main.py'];

function pickMockFileTreeFromSeed(seed: Skill): string | string[] {
  const ft = (seed as { fileTree?: unknown }).fileTree;
  if (typeof ft === 'string' && ft.trim()) {
    return ft;
  }
  if (Array.isArray(ft) && ft.length > 0) {
    return ft.map((x) => String(x));
  }
  return [...DEFAULT_MOCK_FILE_TREE];
}

function pickMockSkillMdFromSeed(seed: Skill, base: MockSkillRecord): string {
  const raw = seed.skillMdContent;
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  return makeSkillMd(base);
}

function pickQualityBadgesFromSeed(seed: Skill): string[] {
  const source = seed.qualityBadges;
  const labels = Array.isArray(source)
    ? source
    : typeof source === 'string'
      ? source.split(/[,，;；、\s]+/)
      : [];

  return [...new Set(labels.map((label) => String(label).trim()).filter(Boolean))];
}

function toMockSkillRecord(seed: Skill): MockSkillRecord {
  const id = skillMockId(seed);
  const level = seed.publish_level ?? seed.level ?? '个人级';
  const publishName =
    seed.publish_name ??
    seed.publisher ??
    (level.includes('个人') ? 'xxx_个人发布商' : '平台工具组');
  const org = level.includes('组织') ? orgByName(publishName) : undefined;
  const categoryGroupName = categoryGroupFromCategory(seed.tagFunctional || '公共');
  const category = categoryFromGroup(categoryGroupName);
  const updatedAt = seed.latestPublishTime ?? nowText();
  const downloads = seed.download_count ?? seed.downloads ?? 0;
  const currentVersion = seed.version ?? '1.0.0';
  const dept = seed.dept_name || '部门1/平台产品线/平台工具组';
  const deptParts = skillDeptParts({ ...seed, dept_name: dept });
  const author = seed.publisher ?? publishName;
  const qualityBadges = pickQualityBadgesFromSeed(seed);
  const versions = seed.versions?.map((v) => ({ ...v })) ?? [
    {
      version: currentVersion,
      publishTime: updatedAt,
      note: 'Mock 初始版本',
      packageFileName: `${seed.name ?? seed.skill_id}-v${currentVersion}.zip`,
      packageSize: 128000,
    },
  ];
  const base: MockSkillRecord = {
    ...seed,
    id,
    skill_id: seed.skill_id ?? id,
    name: seed.name ?? seed.skill_id,
    description: seed.description ?? '',
    publish_name: publishName,
    publish_level: level,
    owner_list: seed.owner_list ?? '[]',
    download_count: downloads,
    dept_name: dept,
    icon: seed.icon ?? 'PK',
    publisher: author,
    latestPublishTime: updatedAt,
    level,
    downloads,
    rating: seed.rating ?? 4.5,
    version: currentVersion,
    currentVersion,
    versions,
    ownedByUser: seed.ownedByUser ?? level.includes('个人'),
    marketStatus: seed.marketStatus ?? level,
    tagFunctional: categoryGroupName,
    tagOrg: level,
    tags: typeof seed.tags === 'string' ? seed.tags : tagsText(seed.tags),
    author,
    createdBy: seed.createdBy ?? author,
    category,
    categoryGroupName,
    status: seed.marketStatus ?? level,
    orgId: org?.id ?? null,
    orgName: org?.orgName ?? (level.includes('组织') ? publishName : null),
    departmentL1: deptParts[0] ?? '',
    departmentL2: deptParts[1] ?? '',
    departmentL3: deptParts[2] ?? '',
    departmentL4: deptParts[3] ?? '',
    departmentL5: deptParts[4] ?? '',
    departmentL6: deptParts[5] ?? '',
    requirements: '需要 Python 3.10+，可按 Skill 文档安装依赖。',
    fileDir: `fuyao/skills/${seed.name ?? seed.skill_id}/${currentVersion}`,
    packagePath: `fuyao/skills/${seed.name ?? seed.skill_id}/${currentVersion}/skill.zip`,
    fileTree: pickMockFileTreeFromSeed(seed),
    skillMdContent: '',
    createdAt: updatedAt,
    updatedAt,
    likes: Math.max(0, Math.floor(downloads * 0.05)),
    dislikes: Math.max(0, Math.floor(downloads * 0.004)),
    qualityMark:
      seed.qualityMark ?? qualityBadges[0] ?? ((seed.rating ?? 0) >= 4.7 ? '优秀 Skill' : null),
    qualityBadges:
      qualityBadges.length > 0
        ? qualityBadges
        : (seed.rating ?? 0) >= 4.7
          ? ['优秀 Skill', '高分 Skill']
          : [],
    scored: (seed.rating ?? 0) > 0,
  };
  base.skillMdContent = pickMockSkillMdFromSeed(seed, base);
  return base;
}

let skillRecords: MockSkillRecord[] = getBuiltInSkills().map(toMockSkillRecord);

function findSkill(id: string | number | undefined): MockSkillRecord | undefined {
  const sid = String(id ?? '').trim();
  if (!sid) {
    return undefined;
  }
  return skillRecords.find(
    (s) =>
      s.id === sid || s.skill_id === sid || s.name === sid || String(stableNumericId(s)) === sid,
  );
}

function readMockRole(): 'SUPER_ADMIN' | 'ORG_ADMIN' | 'USER' {
  const raw = String(import.meta.env.VITE_SKILL_MARKET_MOCK_ROLE ?? '')
    .trim()
    .toUpperCase();
  if (raw === 'USER' || raw === 'ORG_ADMIN' || raw === 'SUPER_ADMIN') {
    return raw;
  }
  return 'ORG_ADMIN';
}

function readManagedOrgIds(): number[] {
  const valid = new Set(orgStore.map((o) => o.id));
  const raw = String(import.meta.env.VITE_SKILL_MARKET_MOCK_MANAGED_ORG_IDS ?? '').trim();
  if (!raw) {
    return [...valid];
  }
  const parsed = raw
    .split(/[,，]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && valid.has(n));
  return parsed.length > 0 ? parsed : [...valid];
}

function visibleOrganizations(): MockOrganization[] {
  const role = readMockRole();
  if (role === 'USER') {
    return [];
  }
  if (role === 'SUPER_ADMIN') {
    return orgStore.map((o) => ({ ...o }));
  }
  const allow = new Set(readManagedOrgIds());
  return orgStore.filter((o) => allow.has(o.id)).map((o) => ({ ...o }));
}

function canUpdateOrganization(id: number): boolean {
  const role = readMockRole();
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  if (role === 'ORG_ADMIN') {
    return readManagedOrgIds().includes(id);
  }
  return false;
}

function matchesDepartmentFields(skill: MockSkillRecord, params: Record<string, unknown>): boolean {
  const expected = [
    params.departmentL1,
    params.departmentL2,
    params.departmentL3,
    params.departmentL4,
    params.departmentL5,
    params.departmentL6,
  ].map((v) => String(v ?? '').trim());
  const actual = [
    skill.departmentL1,
    skill.departmentL2,
    skill.departmentL3,
    skill.departmentL4,
    skill.departmentL5,
    skill.departmentL6,
  ];
  return expected.every((want, i) => !want || actual[i] === want);
}

function filterSkills(params: Record<string, unknown>, source = skillRecords): MockSkillRecord[] {
  let list = [...source];
  const keyword = String(params.keyword ?? '')
    .trim()
    .toLowerCase();
  if (keyword) {
    list = list.filter((s) =>
      [s.id, s.skill_id, s.name, s.description, s.publish_name, s.author, s.dept_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }
  const status = String(params.status ?? params.level ?? '').trim();
  if (status) {
    list = list.filter(
      (s) =>
        s.status.includes(status) || s.level.includes(status) || s.publish_level.includes(status),
    );
  }
  const orgId = readNumber(params.orgId, 0);
  if (orgId > 0) {
    list = list.filter((s) => s.orgId === orgId);
  }
  const categoryGroupName = String(params.categoryGroupName ?? '').trim();
  if (categoryGroupName) {
    list = list.filter((s) => s.categoryGroupName === categoryGroupName);
  }
  const category = String(params.categoryId ?? params.category ?? '').trim();
  if (category) {
    const categoryCandidates = categoryCandidatesFromParam(category);
    list = list.filter(
      (s) =>
        categoryCandidates.includes(s.category) ||
        categoryCandidates.includes(s.categoryGroupName) ||
        categoryCandidates.includes(s.tagFunctional ?? ''),
    );
  }
  const tags = splitTags(params.tagList ?? params.tag);
  if (tags.length > 0) {
    list = list.filter((s) => {
      const own = new Set(splitTags(s.tags));
      return tags.some((tag) => own.has(tag));
    });
  }
  list = list.filter((s) => matchesDepartmentFields(s, params));
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

function pageSkills(
  params: Record<string, unknown>,
  source = skillRecords,
): PagedArray<MockSkillRecord> {
  const list = filterSkills(params, source);
  const total = list.length;
  const pageNo = Math.max(1, readNumber(params.pageNo ?? params.pageNum, 1));
  const pageSize = Math.max(1, readNumber(params.pageSize, 12));
  const start = (pageNo - 1) * pageSize;
  return withPageMeta(list.slice(start, start + pageSize), total);
}

function fileFromFormData(data: unknown): File | undefined {
  if (typeof FormData === 'undefined' || !(data instanceof FormData)) {
    return undefined;
  }
  for (const key of ['file', 'uploadFile']) {
    const value = data.get(key);
    if (value && typeof value === 'object' && 'name' in value) {
      return value as File;
    }
  }
  return undefined;
}

function fileBaseName(file: File | undefined, fallback: string): string {
  const raw = file?.name?.replace(/\.[^.]+$/, '').trim();
  return raw || fallback;
}

function bumpPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return `${version}.1`;
  }
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`;
}

function parsedSkillFromFile(file: File | undefined): Record<string, unknown> {
  const name = fileBaseName(file, 'pdf-document-extractor');
  const existing = skillRecords.find((s) => s.name?.toLowerCase() === name.toLowerCase());
  const version = existing ? bumpPatchVersion(existing.currentVersion) : '1.0.0';
  return {
    name,
    version,
    description: `Mock：根据「${file?.name ?? `${name}.zip`}」解析出的 Skill 描述`,
    requirements: '需要 Python 3.10+，可按 SKILL.md 安装依赖。',
    author: '当前用户',
    createdBy: '当前用户',
    category: 'COMMON',
    categoryGroupName: '公共',
    tags: ['mock', 'upload'],
    level: '个人级（默认发布，无需审核）',
    nameExists: Boolean(existing),
    canSubmit: true,
    existingVersion: existing?.currentVersion,
    nextVersion: version,
    fileTree: ['SKILL.md', 'README.md', 'scripts/main.py'],
    warnings: [],
  };
}

function nextSkillId(): string {
  return String(Math.max(0, ...skillRecords.map((s) => Number(s.id)).filter(Number.isFinite)) + 1);
}

function upsertUploadedSkill(
  file: File | undefined,
  params: Record<string, unknown> = {},
): MockSkillRecord {
  const parsed = parsedSkillFromFile(file);
  const name = String(parsed.name);
  const categoryGroupName = readString(params.categoryGroupName, String(parsed.categoryGroupName));
  const stamp = nowText();
  const existing = skillRecords.find((s) => s.name?.toLowerCase() === name.toLowerCase());
  if (existing) {
    const nextVersion = String(parsed.version);
    const entry: SkillVersionEntry = {
      version: nextVersion,
      publishTime: stamp,
      note: 'Mock 上传新版本',
      packageFileName: file?.name ?? `${name}-v${nextVersion}.zip`,
      packageSize: file?.size ?? 0,
    };
    existing.currentVersion = nextVersion;
    existing.version = nextVersion;
    existing.versions = [...(existing.versions ?? []), entry];
    existing.updatedAt = stamp;
    existing.latestPublishTime = stamp;
    existing.packagePath = `fuyao/skills/${name}/${nextVersion}/skill.zip`;
    existing.fileDir = `fuyao/skills/${name}/${nextVersion}`;
    existing.tagFunctional = categoryGroupName;
    existing.categoryGroupName = categoryGroupName;
    existing.skillMdContent = makeSkillMd(existing);
    return { ...existing };
  }

  const newSkill = toMockSkillRecord({
    id: nextSkillId(),
    skill_id: name,
    name,
    description: String(parsed.description),
    publish_name: 'xxx_个人发布商',
    publish_level: '个人级',
    owner_list: '[]',
    download_count: 0,
    dept_name: '部门1/个人空间/默认部门/Skill上传组',
    publisher: String(parsed.author),
    latestPublishTime: stamp,
    level: '个人级',
    downloads: 0,
    rating: 4.5,
    version: String(parsed.version),
    versions: [
      {
        version: String(parsed.version),
        publishTime: stamp,
        note: 'Mock 首次上传',
        packageFileName: file?.name ?? `${name}-v${parsed.version}.zip`,
        packageSize: file?.size ?? 0,
      },
    ],
    ownedByUser: true,
    tagFunctional: categoryGroupName,
    tagOrg: '个人级',
    tags: tagsText(parsed.tags),
  });
  skillRecords = [newSkill, ...skillRecords];
  return { ...newSkill };
}

function createSkillFromBody(body: Record<string, unknown>): MockSkillRecord {
  const stamp = nowText();
  const name = readString(body.name, `mock-skill-${Date.now()}`);
  const category = readString(body.category, 'COMMON');
  const group = categoryGroupFromCategory(category);
  const version = readString(body.version, '1.0.0');
  const record = toMockSkillRecord({
    id: nextSkillId(),
    skill_id: name,
    name,
    description: readString(body.description, ''),
    publish_name: readString(body.author, '当前用户'),
    publish_level: '个人级',
    owner_list: '[]',
    download_count: 0,
    dept_name: '部门1/个人空间/默认部门/手动创建组',
    publisher: readString(body.author, '当前用户'),
    latestPublishTime: stamp,
    level: '个人级',
    downloads: 0,
    rating: 4.5,
    version,
    versions: [
      {
        version,
        publishTime: stamp,
        note: 'Mock 手动创建',
        packageFileName: `${name}-v${version}.zip`,
        packageSize: 0,
      },
    ],
    ownedByUser: true,
    tagFunctional: group,
    tagOrg: '个人级',
    tags: tagsText(body.tags),
  });
  record.requirements = readString(body.requirements, record.requirements);
  record.packagePath = readString(body.packagePath, record.packagePath);
  record.skillMdContent = readString(body.skillMdContent, record.skillMdContent);
  const ftBody = body.fileTree;
  if (Array.isArray(ftBody)) {
    record.fileTree = ftBody.map((x) => String(x));
  } else if (typeof ftBody === 'string' && ftBody.trim()) {
    record.fileTree = ftBody;
  }
  skillRecords = [record, ...skillRecords];
  return { ...record };
}

function createZipUrl(skill: MockSkillRecord): string {
  const zip = new PizZip();
  zip.file('SKILL.md', skill.skillMdContent || makeSkillMd(skill));
  zip.file('README.md', `# ${skill.name}\n\n${skill.description}\n`);
  zip.folder('scripts')?.file('main.py', `print("hello from ${skill.name}")\n`);
  const blob = zip.generate({ type: 'blob', mimeType: 'application/zip' });
  return URL.createObjectURL(blob);
}

function handleSkillRequest(
  method: string,
  path: string,
  config: AxiosRequestConfig,
): MockEnvelope<unknown> | null {
  const params = readParams(config);
  if (method === 'get' && (path === '/business-dimensions' || path === '/categories')) {
    const data = getMockBusinessDimensions();
    return ok(data, data.length);
  }
  if (method === 'post' && path === '/upload/parse') {
    return ok(parsedSkillFromFile(fileFromFormData(config.data)));
  }
  if (method === 'post' && path === '/upload') {
    return ok(upsertUploadedSkill(fileFromFormData(config.data), params));
  }
  if (method === 'post' && path === '') {
    return ok(createSkillFromBody((config.data ?? {}) as Record<string, unknown>));
  }
  if (method === 'get' && path === '') {
    const data = pageSkills(params);
    return ok(data, data.total);
  }
  if (method === 'get' && path === '/my') {
    const mine = skillRecords.filter((s) => s.ownedByUser);
    const data = pageSkills(params, mine.length > 0 ? mine : skillRecords.slice(0, 4));
    return ok(data, data.total);
  }
  if (method === 'post' && path === '/publish-to-market') {
    return ok({ ok: true, status: '个人级', skillStatus: '个人级' });
  }

  if (method === 'get' && path === '/review/expert/check') {
    return ok({ isExpert: true });
  }

  if (method === 'get' && path === '/review/dimensions') {
    return ok(MOCK_EXPERT_REVIEW_DIMENSIONS, MOCK_EXPERT_REVIEW_DIMENSIONS.length);
  }

  if (method === 'get' && path === '/review/badges') {
    return ok(MOCK_REVIEW_BADGES, MOCK_REVIEW_BADGES.length);
  }

  const reviewDetailMatch = /^\/review\/([^/]+)\/detail$/.exec(path);
  if (method === 'get' && reviewDetailMatch) {
    return ok({ ...ensureExpertReviewDetail(reviewDetailMatch[1]) });
  }

  const reviewDraftMatch = /^\/review\/([^/]+)\/draft$/.exec(path);
  if (method === 'post' && reviewDraftMatch) {
    const body = (config.data ?? {}) as Record<string, unknown>;
    const detail = ensureExpertReviewDetail(reviewDraftMatch[1]);
    detail.reviewId = readString(body.reviewId, detail.reviewId);
    detail.dimensionScores = normalizeDraftDimensionScores(body.dimensionScores);
    detail.badgeIds = normalizeBadgeIds(body.badgeIds);
    detail.badgeReason = normalizeBadgeReason(body.badgeReason, detail.badgeIds);
    detail.overallOpinion = normalizeOverallOpinion(body.overallOpinion);
    const totalScore = body.totalScore;
    if (typeof totalScore === 'number' && Number.isFinite(totalScore)) {
      detail.totalScore = roundToTwo(totalScore);
    } else {
      detail.totalScore = computeWeightedTotal(detail.dimensionScores);
    }
    detail.reviewStatus = 'draft';
    detail.updatedAt = nowText();
    return ok({ ...detail });
  }

  const reviewSubmitMatch = /^\/review\/([^/]+)\/submit$/.exec(path);
  if (method === 'post' && reviewSubmitMatch) {
    const body = (config.data ?? {}) as Record<string, unknown>;
    const detail = ensureExpertReviewDetail(reviewSubmitMatch[1]);
    detail.reviewId = readString(body.reviewId, detail.reviewId);
    detail.dimensionScores = normalizeDraftDimensionScores(body.dimensionScores);
    detail.badgeIds = normalizeBadgeIds(body.badgeIds);
    detail.badgeReason = normalizeBadgeReason(body.badgeReason, detail.badgeIds);
    detail.overallOpinion = normalizeOverallOpinion(body.overallOpinion);
    const totalScore = body.totalScore;
    if (typeof totalScore === 'number' && Number.isFinite(totalScore)) {
      detail.totalScore = roundToTwo(totalScore);
    } else {
      detail.totalScore = computeWeightedTotal(detail.dimensionScores);
    }
    detail.reviewStatus = 'submitted';
    detail.updatedAt = nowText();
    return ok({ ...detail });
  }

  const deleteAllMatch = /^\/([^/]+)\/all$/.exec(path);
  if (method === 'delete' && deleteAllMatch) {
    const skill = findSkill(deleteAllMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', null, 40401);
    }
    skillRecords = skillRecords.filter((s) => s !== skill);
    return ok({ ok: true });
  }

  const downloadMatch = /^\/([^/]+)\/download$/.exec(path);
  if (method === 'post' && downloadMatch) {
    const skill = findSkill(downloadMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', '');
    }
    const reqVersion = String(params.version ?? '').trim();
    if (reqVersion && !(skill.versions ?? []).some((v) => v.version === reqVersion)) {
      return fail('指定版本不存在', '');
    }
    if (reqVersion) {
      const v = (skill.versions ?? []).find((x) => x.version === reqVersion);
      if (v && (v as { unpublished?: boolean }).unpublished) {
        return fail('该版本已下架，无法下载', '');
      }
    }
    skill.downloads = (skill.downloads ?? 0) + 1;
    skill.download_count = (skill.download_count ?? 0) + 1;
    return ok(createZipUrl(skill));
  }

  const statsMatch = /^\/([^/]+)\/download-stats$/.exec(path);
  if (method === 'get' && statsMatch) {
    const skill = findSkill(statsMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', null);
    }
    return ok({
      skillId: Number(skill.id),
      name: skill.name,
      totalDownloads: skill.downloads,
      currentDownloads: skill.downloads,
      startDate: params.startDate,
      endDate: params.endDate,
      granularity: params.granularity ?? 'day',
      trend: [],
    });
  }

  const detailMatch = /^\/([^/]+)$/.exec(path);
  if (method === 'delete' && detailMatch) {
    const ver = String(params.version ?? '').trim();
    if (!ver) {
      return fail('请传入 query.version 以下架指定版本', null, 40001);
    }
    const skill = findSkill(detailMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', null, 40401);
    }
    const list = [...(skill.versions ?? [])];
    const ix = list.findIndex((x) => x.version === ver);
    if (ix < 0) {
      return fail('版本不存在', null, 40401);
    }
    const target = list[ix] as SkillVersionEntry & { unpublished?: boolean };
    if (target.unpublished) {
      return fail('该版本已下架', null, 40001);
    }
    list[ix] = { ...target, unpublished: true };
    skill.versions = list;
    const active = list.filter((x) => !(x as { unpublished?: boolean }).unpublished);
    if (active.length > 0) {
      const sorted = [...active].sort((a, b) => compareSemverDesc(a.version, b.version));
      const head = sorted[0];
      if (head) {
        skill.version = head.version;
        skill.currentVersion = head.version;
      }
    }
    skill.updatedAt = nowText();
    return ok({ ok: true });
  }
  if (method === 'get' && detailMatch) {
    const skill = findSkill(detailMatch[1]);
    return skill ? ok({ ...skill }) : fail('Skill 不存在', null, 40401);
  }

  const versionsPathMatch = /^\/([^/]+)\/versions$/.exec(path);
  if (method === 'get' && versionsPathMatch) {
    const skill = findSkill(versionsPathMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', null, 40401);
    }
    const rows = mapSkillVersionsToListDto(skill as Skill);
    return ok(rows);
  }
  if (method === 'post' && versionsPathMatch) {
    const skill = findSkill(versionsPathMatch[1]);
    if (!skill) {
      return fail('Skill 不存在', null, 40401);
    }
    const nextVersion = bumpPatchVersion(skill.currentVersion);
    const stamp = nowText();
    skill.currentVersion = nextVersion;
    skill.version = nextVersion;
    skill.updatedAt = stamp;
    skill.latestPublishTime = stamp;
    skill.versions = [
      ...(skill.versions ?? []),
      {
        version: nextVersion,
        publishTime: stamp,
        note: 'Mock 上传新版本',
        packageFileName: `${skill.name}-v${nextVersion}.zip`,
        packageSize: fileFromFormData(config.data)?.size ?? 0,
      },
    ];
    return ok({ ok: true, skillId: skill.id, version: nextVersion });
  }

  const syncMatch = /^\/([^/]+)\/sync-applications$/.exec(path);
  if (method === 'post' && syncMatch) {
    const skill = findSkill(syncMatch[1]);
    const body = (config.data ?? {}) as Record<string, unknown>;
    const targetOrgId = readNumber(body.targetOrgId, 1);
    const targetOrg = orgStore.find((o) => o.id === targetOrgId) ?? orgStore[0];
    const id = Math.max(90_000, ...syncPending.map((r) => r.id), ...syncDone.map((r) => r.id)) + 1;
    syncPending = [
      {
        id,
        skillId: skill?.id ?? syncMatch[1],
        skillName: skill?.name ?? `Skill ${syncMatch[1]}`,
        applyType: '同步至公司组织',
        targetLevel: '组织级',
        targetOrgId,
        targetOrgName: targetOrg?.orgName ?? '',
        reason: readString(body.reason, 'Mock 同步申请'),
        approverLabel: `${targetOrg?.orgName ?? '目标组织'}组织管理员`,
        status: '待审核',
      },
      ...syncPending,
    ];
    return ok({ applicationId: id, status: '待审核', skillStatus: '组织审核中' });
  }

  const syncUpdateMatch = /^\/([^/]+)\/sync-update-applications$/.exec(path);
  if (method === 'post' && syncUpdateMatch) {
    const skill = findSkill(syncUpdateMatch[1]);
    const body = (config.data ?? {}) as Record<string, unknown>;
    const targetOrgId = readNumber(body.targetOrgId, skill?.orgId ?? 1);
    const targetOrg = orgStore.find((o) => o.id === targetOrgId) ?? orgStore[0];
    const id = Math.max(90_000, ...syncPending.map((r) => r.id), ...syncDone.map((r) => r.id)) + 1;
    syncPending = [
      {
        id,
        skillId: skill?.id ?? syncUpdateMatch[1],
        skillName: skill?.name ?? `Skill ${syncUpdateMatch[1]}`,
        applyType: '更新同步',
        targetLevel: '组织级',
        targetOrgId,
        targetOrgName: targetOrg?.orgName ?? '',
        reason: readString(body.updateReason, 'Mock 更新同步申请'),
        approverLabel: `${targetOrg?.orgName ?? '目标组织'}组织管理员`,
        status: '待审核',
      },
      ...syncPending,
    ];
    return ok({ applicationId: id, status: '待审核', syncType: '更新同步' });
  }

  return null;
}

function handleApiRequest(
  method: string,
  path: string,
  config: AxiosRequestConfig,
): MockEnvelope<unknown> | null {
  const params = readParams(config);
  const reviewMatch = /^\/sync-applications\/([^/]+)\/review$/.exec(path);
  if (method === 'post' && reviewMatch) {
    const id = readNumber(reviewMatch[1], 0);
    const body = (config.data ?? {}) as Record<string, unknown>;
    const idx = syncPending.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const row = syncPending[idx];
      syncPending = syncPending.filter((r) => r.id !== id);
      syncDone = [
        {
          ...row,
          status: '已完成',
          reviewResult: body.decision === 'approve' ? '通过' : '不通过',
          reviewComment: readString(body.comment, ''),
          completedAt: nowText(),
        },
        ...syncDone,
      ];
    }
    return ok({ ok: true });
  }

  if (method === 'get' && path === '/sync-applications') {
    const source = params.tab === 'done' ? syncDone : syncPending;
    const total = source.length;
    const pageNo = Math.max(1, readNumber(params.pageNo, 1));
    const pageSize = Math.max(1, readNumber(params.pageSize, 20));
    const start = (pageNo - 1) * pageSize;
    const data = withPageMeta(source.slice(start, start + pageSize), total);
    return ok(data, total);
  }

  if (method === 'get' && path === '/users/current/role') {
    const role = readMockRole();
    const managedIds =
      role === 'USER'
        ? []
        : role === 'SUPER_ADMIN'
          ? orgStore.map((o) => o.id)
          : readManagedOrgIds();
    return ok({
      employeeNo: 'mock001',
      userName:
        role === 'SUPER_ADMIN'
          ? '演示超级管理员'
          : role === 'ORG_ADMIN'
            ? '演示组织管理员'
            : '演示普通用户',
      role,
      superAdmin: role === 'SUPER_ADMIN',
      orgAdmin: role === 'ORG_ADMIN',
      managedOrgIds: managedIds,
      managedOrgNames: orgStore.filter((o) => managedIds.includes(o.id)).map((o) => o.orgName),
      organizationScope:
        role === 'SUPER_ADMIN' ? 'ALL' : role === 'ORG_ADMIN' ? 'MANAGED_ORG' : 'NONE',
    });
  }

  if (method === 'get' && path === '/organizations') {
    const data = visibleOrganizations();
    return ok(data, data.length);
  }

  if (method === 'post' && path === '/organizations') {
    if (readMockRole() !== 'SUPER_ADMIN') {
      return fail(
        '无权限：仅超级管理员可新建组织',
        { id: 0, orgName: '', orgCode: '', admins: '', enabled: false },
        40301,
      );
    }
    const body = (config.data ?? {}) as Record<string, unknown>;
    const dto: MockOrganization = {
      id: Math.max(0, ...orgStore.map((o) => o.id)) + 1,
      orgName: readString(body.orgName),
      orgCode: readString(body.orgCode),
      admins: readString(body.admins),
      enabled: body.enabled !== false,
    };
    orgStore.push(dto);
    return ok({ ...dto });
  }

  const orgMatch = /^\/organizations\/([^/]+)$/.exec(path);
  if (method === 'put' && orgMatch) {
    const id = readNumber(orgMatch[1], 0);
    if (!canUpdateOrganization(id)) {
      return fail(
        '无权限：该组织不在您的管辖范围内',
        { id, orgName: '', orgCode: '', admins: '', enabled: false },
        40301,
      );
    }
    const body = (config.data ?? {}) as Record<string, unknown>;
    const dto: MockOrganization = {
      id,
      orgName: readString(body.orgName),
      orgCode: readString(body.orgCode),
      admins: readString(body.admins),
      enabled: body.enabled !== false,
    };
    const idx = orgStore.findIndex((o) => o.id === id);
    if (idx >= 0) {
      orgStore[idx] = dto;
    } else {
      orgStore.push(dto);
    }
    return ok({ ...dto });
  }

  if (method === 'get' && path === '/departments/tree') {
    return ok(getMockMarketDepartmentsTree());
  }

  if (method === 'get' && (path === '/business-dimensions' || path === '/categories')) {
    const data = getMockBusinessDimensions();
    return ok(data, data.length);
  }

  if (method === 'get' && path === '/dashboard/overview') {
    const bundle = buildOpsDashboardBundle(marketSkillsToOpsExcelRows(skillRecords));
    const rankings = bundle.orgBars.map((row) => ({
      name: row.name,
      totalSkills: row.skills,
      skillCount: row.skills,
      downloads: row.downloads,
    }));
    return ok({ ...bundle, rankings });
  }

  if (method === 'get' && path === '/skill-quality-reviews') {
    let rows = [...qualityReviews];
    const reviewMonth = String(params.reviewMonth ?? '').trim();
    if (reviewMonth) {
      rows = rows.filter((r) => r.reviewMonth === reviewMonth);
    }
    const keyword = String(params.keyword ?? '')
      .trim()
      .toLowerCase();
    if (keyword) {
      rows = rows.filter(
        (r) =>
          r.skillName.toLowerCase().includes(keyword) || r.deptName.toLowerCase().includes(keyword),
      );
    }
    const reviewStatus = String(params.reviewStatus ?? '').trim();
    if (reviewStatus) {
      rows = rows.filter((r) => r.reviewStatus === reviewStatus);
    }
    return ok(withPageMeta(rows, rows.length), rows.length);
  }

  if (method === 'post' && path === '/skill-quality-reviews/save') {
    const body = (config.data ?? {}) as Record<string, unknown>;
    const reviewMonth = readString(body.reviewMonth, '2026-04');
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items as Record<string, unknown>[]) {
      const skillId = String(item.skillId ?? '');
      const skill = findSkill(skillId);
      qualityReviews = [
        {
          id: Math.max(70_000, ...qualityReviews.map((r) => r.id)) + 1,
          reviewMonth,
          skillId,
          skillName: skill?.name ?? `Skill ${skillId}`,
          deptName: skill?.departmentL4 || skill?.publish_name || '',
          score: readNumber(item.score, 0),
          qualityMark: readString(item.qualityMark, ''),
          reviewComment: readString(item.reviewComment, ''),
          reviewStatus: '已保存',
        },
        ...qualityReviews,
      ];
    }
    return ok({ ok: true });
  }

  if (method === 'post' && path === '/skill-quality-reviews/archive') {
    const body = (config.data ?? {}) as Record<string, unknown>;
    const reviewMonth = readString(body.reviewMonth, '');
    qualityReviews = qualityReviews.map((r) =>
      !reviewMonth || r.reviewMonth === reviewMonth ? { ...r, reviewStatus: '已归档' } : r,
    );
    return ok({ ok: true });
  }

  return null;
}

type MockSkillDraft = {
  skillId: string;
  skillName: string;
  description: string;
  userId: string;
  archiveData: string;
  archiveSize: number;
  sessionId: string;
  sessionCreateTime: string;
  skillGenerateTime: string;
  skillStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  downloadCount: number;
  ide: string;
  codeRepo: string;
  firstMessage: string;
  version: string;
  skillMdContent: string;
  fileTree: string;
  createdAt: string;
  updatedAt: string | null;
};

let skillDrafts: MockSkillDraft[] = [
  {
    skillId: 'ai-evo-001',
    skillName: '智能日报汇总（自进化）',
    description: '自动汇总团队每日工作进展，生成结构化日报，支持多数据源聚合与异常兜底。',
    userId: 'mock001',
    archiveData: 'fuyao/skill_drafts/智能日报汇总/1.3.0',
    archiveSize: 20480,
    sessionId: 'sess-20260621-7f3a9c1d',
    sessionCreateTime: '2026-06-21 08:42:00',
    skillGenerateTime: '2026-06-21 09:14:00',
    skillStatus: 'PENDING',
    downloadCount: 0,
    ide: 'VS Code',
    codeRepo: 'git@code.company.com:agent-center/daily-report-skill.git',
    firstMessage: '帮我把团队每天的工作进展自动整理成结构化日报，要能处理某些人没填写的情况。',
    version: '1.3.0',
    skillMdContent:
      '# 智能日报汇总（自进化）\n\n## 简介\n自动汇总团队每日工作进展，生成结构化日报。\n\n## 本次自进化变更\n- 新增空数据兜底逻辑\n- 优化分段总结提示词\n- 补充字段缺失校验\n\n## 触发原因\n近 30 天调用失败率达 8.6%，自动优化 Prompt 与异常分支。',
    fileTree: 'SKILL.md\nprompts/\n  summary.md\n  fallback.md\nscripts/\n  collect.py',
    createdAt: '2026-06-21 09:15:00',
    updatedAt: null,
  },
  {
    skillId: 'ai-evo-002',
    skillName: '会议纪要生成器（自进化）',
    description: '将会议录音转写文本整理为结构化纪要与待办，支持长会议分块摘要。',
    userId: 'mock001',
    archiveData: 'fuyao/skill_drafts/会议纪要生成器/2.1.0',
    archiveSize: 30720,
    sessionId: 'sess-20260620-2b8e45af',
    sessionCreateTime: '2026-06-20 17:05:00',
    skillGenerateTime: '2026-06-20 17:42:00',
    skillStatus: 'PENDING',
    downloadCount: 0,
    ide: 'Cursor',
    codeRepo: 'git@code.company.com:agent-center/meeting-minutes-skill.git',
    firstMessage: '会议录音转写出来太长了，模型经常截断，帮我做成能分段总结再合并的纪要工具。',
    version: '2.1.0',
    skillMdContent:
      '# 会议纪要生成器（自进化）\n\n## 简介\n将会议录音转写文本整理为结构化纪要与待办。\n\n## 本次自进化变更\n- 引入分块摘要 + 二次合并\n- 适配 200k 上下文窗口模型\n\n## 触发原因\n用户反馈显示长会议截断率上升，触发上下文窗口策略升级。',
    fileTree: 'SKILL.md\nprompts/\n  chunk.md\n  merge.md\nconfig.json',
    createdAt: '2026-06-20 17:43:00',
    updatedAt: null,
  },
  {
    skillId: 'ai-evo-003',
    skillName: '客户工单分类器（自进化）',
    description: '根据工单内容自动分类并路由到对应处理队列，支持少样本提示与阈值调优。',
    userId: 'mock001',
    archiveData: 'fuyao/skill_drafts/客户工单分类器/1.0.0',
    archiveSize: 15360,
    sessionId: 'sess-20260619-c0d172e6',
    sessionCreateTime: '2026-06-19 21:30:00',
    skillGenerateTime: '2026-06-19 22:08:00',
    skillStatus: 'PENDING',
    downloadCount: 0,
    ide: 'JetBrains IDEA',
    codeRepo: 'git@code.company.com:agent-center/ticket-classifier-skill.git',
    firstMessage: '客户工单越来越多，帮我做一个能根据内容自动分类并路由到处理队列的技能。',
    version: '1.0.0',
    skillMdContent:
      '# 客户工单分类器（自进化）\n\n## 简介\n根据工单内容自动分类并路由到对应处理队列。\n\n## 本次自进化变更\n- 引入新一轮标注数据\n- 调整分类阈值与少样本提示\n\n## 触发原因\n准确率从 87% 提升至 94%，可发起一次正式版本升级。',
    fileTree: 'SKILL.md\ndata/\n  labels.csv\nprompts/\n  classify.md',
    createdAt: '2026-06-19 22:09:00',
    updatedAt: null,
  },
];

function findSkillDraft(id: string | undefined): MockSkillDraft | undefined {
  const sid = String(id ?? '').trim();
  if (!sid) {
    return undefined;
  }
  return skillDrafts.find((d) => d.skillId === sid);
}

function handleSkillDraftRequest(
  method: string,
  path: string,
  config: AxiosRequestConfig,
): MockEnvelope<unknown> | null {
  const params = readParams(config);

  // 列表（前端展示用）
  if (method === 'get' && path === '') {
    let list = [...skillDrafts];
    const skillStatus = String(params.skillStatus ?? '')
      .trim()
      .toUpperCase();
    if (skillStatus) {
      list = list.filter((d) => d.skillStatus === skillStatus);
    }
    const skillName = String(params.skillName ?? '')
      .trim()
      .toLowerCase();
    if (skillName) {
      list = list.filter((d) => d.skillName.toLowerCase().includes(skillName));
    }
    const total = list.length;
    const pageNo = Math.max(1, readNumber(params.pageNo, 1));
    const pageSize = Math.max(1, readNumber(params.pageSize, 10));
    const start = (pageNo - 1) * pageSize;
    const data = withPageMeta(list.slice(start, start + pageSize), total);
    return ok(data, total);
  }

  const approveMatch = /^\/([^/]+)\/approve$/.exec(path);
  if (method === 'post' && approveMatch) {
    const draft = findSkillDraft(approveMatch[1]);
    if (!draft) {
      return fail('草稿不存在', null);
    }
    if (draft.skillStatus !== 'PENDING') {
      return fail('草稿状态不是待审批，无法审批', null);
    }
    draft.skillStatus = 'APPROVED';
    draft.updatedAt = nowText();
    const approver = readString(params.userId, draft.userId);
    return ok({
      id: `skill-${draft.skillId}`,
      name: draft.skillName,
      description: draft.description,
      author: draft.userId,
      currentVersion: draft.version,
      level: '个人级',
      status: '个人级',
      ownerUser: draft.userId,
      packagePath: `fuyao/skills/${draft.skillName}/${draft.version}`,
      downloads: 0,
      deleted: 0,
      sourceType: 'market',
      createdBy: approver,
      createdAt: nowText(),
      fileTree: draft.fileTree,
      skillMdContent: draft.skillMdContent,
    });
  }

  const rejectMatch = /^\/([^/]+)\/reject$/.exec(path);
  if (method === 'post' && rejectMatch) {
    const draft = findSkillDraft(rejectMatch[1]);
    if (!draft) {
      return fail('草稿不存在', null);
    }
    if (draft.skillStatus !== 'PENDING') {
      return fail('草稿状态不是待审批，无法驳回', null);
    }
    draft.skillStatus = 'REJECTED';
    draft.updatedAt = nowText();
    return ok('驳回成功');
  }

  const downloadMatch = /^\/([^/]+)\/download$/.exec(path);
  if (method === 'post' && downloadMatch) {
    const draft = findSkillDraft(downloadMatch[1]);
    if (!draft) {
      return fail('草稿不存在', null);
    }
    draft.downloadCount += 1;
    return ok(
      `https://mock.s3.file.url?fileName=${encodeURIComponent(
        `${draft.skillName}.zip`,
      )}&fileDir=${encodeURIComponent(draft.archiveData)}`,
    );
  }

  // 详情
  const detailMatch = /^\/([^/]+)$/.exec(path);
  if (method === 'get' && detailMatch) {
    const draft = findSkillDraft(detailMatch[1]);
    return draft ? ok({ ...draft }) : fail('草稿不存在', null);
  }

  return null;
}

function handleDirectRequest(method: string, path: string): Record<string, string> | null {
  if (method !== 'get') {
    return null;
  }
  if (path.includes('matestoreauthservice/v1/users/validate') || path.endsWith('/users/validate')) {
    return { ...MOCK_VALIDATE_USER };
  }
  return null;
}

function handleFuyaoUserPlainResponse(
  method: string,
  path: string,
  config: AxiosRequestConfig,
): unknown | null {
  if (method !== 'get') {
    return null;
  }
  if (path.includes('auth-manager/login')) {
    return { success: true, code: 0, data: { status: 'ok' } };
  }
  if (path.includes('config-center/user')) {
    const userId = String(readParams(config).userId ?? '').trim();
    return {
      messageEn: 'success',
      data: {
        list: userId ? [{ userId, role: 'SUPER_ADMIN' }] : [],
      },
    };
  }
  return null;
}

function handleFuyaoRequest(
  method: string,
  path: string,
  config: AxiosRequestConfig,
): MockEnvelope<unknown> | null {
  if (method === 'post' && path === '/resource/resource-management/v1/storage/file') {
    const file = fileFromFormData(config.data);
    const form = config.data instanceof FormData ? config.data : undefined;
    const fileDir = String(form?.get('fileDir') ?? 'fuyao/skills/mock/1.0.0');
    return ok({
      fileName: file?.name ?? 'skill.zip',
      fileDir,
      filePath: `${fileDir}/${file?.name ?? 'skill.zip'}`,
      url: `${fileDir}/${file?.name ?? 'skill.zip'}`,
    });
  }
  return null;
}

function shouldUseMock(): boolean {
  const explicit = String(import.meta.env.VITE_SKILL_BASE_SERVICE_MOCK ?? '')
    .trim()
    .toLowerCase();
  if (explicit === 'false' || explicit === '0') {
    return false;
  }
  if (explicit === 'true' || explicit === '1') {
    return true;
  }
  return import.meta.env.VITE_SKILL_MARKET_TRANSPORT !== 'http';
}

export function maybeHandleSkillBaseMockRequest<T>(
  channel: string,
  config: AxiosRequestConfig,
): Promise<T> | null {
  if (!shouldUseMock()) {
    return null;
  }
  const method = normalizeMethod(config.method);
  const path = normalizePath(config.url);
  if (import.meta.env.DEV) {
    const params = readParams(config);
    const data = summarizeMockRequestBody(config.data);
    console.info('[skillBaseMock]', {
      channel,
      method: method.toUpperCase(),
      path: path || '(empty)',
      params,
      data,
    });
  }

  if (channel === 'direct') {
    const raw = handleDirectRequest(method, path);
    if (raw != null) {
      return Promise.resolve(raw as T);
    }
    if (import.meta.env.DEV) {
      console.warn('[skillBaseMock] no handler (direct)', path);
    }
    return null;
  }

  if (channel === 'fuyao') {
    const plain = handleFuyaoUserPlainResponse(method, path, config);
    if (plain != null) {
      return Promise.resolve(plain as T);
    }
    const envelope = handleFuyaoRequest(method, path, config);
    if (envelope) {
      return Promise.resolve(envelope as T);
    }
    if (import.meta.env.DEV) {
      console.warn('[skillBaseMock] no handler (fuyao)', {
        path,
        params: readParams(config),
        data: summarizeMockRequestBody(config.data),
      });
    }
    return null;
  }

  if (channel === 'skill') {
    const envelope = handleSkillRequest(method, path, config);
    return envelope ? Promise.resolve(envelope as T) : null;
  }
  if (channel === 'skillDraft') {
    const envelope = handleSkillDraftRequest(method, path, config);
    return envelope ? Promise.resolve(envelope as T) : null;
  }
  if (channel === 'api') {
    const envelope = handleApiRequest(method, path, config);
    return envelope ? Promise.resolve(envelope as T) : null;
  }
  return null;
}

import PizZip from 'pizzip';
import type { AxiosRequestConfig } from 'axios';
import type { Skill, SkillVersionEntry } from '../../types/skill';
import { buildOpsDashboardBundle, parseDeptNamePath } from '../../utils/opsExcelImport';
import { stableNumericId } from './mappers';
import { getBuiltInSkills } from './mock/builtInSkills';
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

type MockSkillRecord = Skill & {
  author: string;
  currentVersion: string;
  category: string;
  categoryGroupName: string;
  status: string;
  orgId: number | null;
  orgName: string | null;
  department_l1: string;
  department_l2: string;
  department_l3: string;
  department_l4: string;
  department_l5: string;
  department_l6: string;
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
  { id: 1, orgName: 'IT装备部', orgCode: 'ORG-IT-001', admins: 'it_admin_a,it_admin_b', enabled: true },
  { id: 2, orgName: '质量工具组', orgCode: 'ORG-QA-002', admins: 'qa_admin_a,qa_admin_b', enabled: true },
  { id: 3, orgName: '平台工具组', orgCode: 'ORG-PLAT-003', admins: 'plat_admin_a,plat_admin_b', enabled: true },
  { id: 4, orgName: '云服务组', orgCode: 'ORG-CLOUD-004', admins: 'cloud_admin_a,cloud_admin_b', enabled: true },
  { id: 5, orgName: 'SRE团队', orgCode: 'ORG-SRE-005', admins: 'sre_admin_a,sre_admin_b', enabled: true },
  { id: 6, orgName: 'DevOps组', orgCode: 'ORG-DEVOPS-006', admins: 'devops_admin', enabled: true },
];

const CATEGORY_BY_GROUP: Record<string, string> = {
  作业类: 'task-software-dev',
  业务类: 'domain-database',
  工具类: 'utility-doc',
};

const GROUP_BY_CATEGORY_PREFIX: { prefix: string; group: string }[] = [
  { prefix: 'task-', group: '作业类' },
  { prefix: 'domain-', group: '业务类' },
  { prefix: 'utility-', group: '工具类' },
];

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

function nowText(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
    2,
    '0',
  )} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
  for (const row of GROUP_BY_CATEGORY_PREFIX) {
    if (category.startsWith(row.prefix)) {
      return row.group;
    }
  }
  return '工具类';
}

function categoryFromGroup(group: string | undefined): string {
  return CATEGORY_BY_GROUP[group ?? ''] ?? 'utility-doc';
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
    (skill as any).department_l1,
    (skill as any).department_l2,
    (skill as any).department_l3,
    (skill as any).department_l4,
    (skill as any).department_l5,
    (skill as any).department_l6,
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

function toMockSkillRecord(seed: Skill): MockSkillRecord {
  const id = skillMockId(seed);
  const level = seed.publish_level ?? seed.level ?? '个人级';
  const publishName = seed.publish_name ?? seed.publisher ?? (level.includes('个人') ? 'xxx_个人发布商' : '平台工具组');
  const org = level.includes('组织') ? orgByName(publishName) : undefined;
  const categoryGroupName = seed.tagFunctional || '工具类';
  const category = categoryFromGroup(categoryGroupName);
  const updatedAt = seed.latestPublishTime ?? nowText();
  const downloads = seed.download_count ?? seed.downloads ?? 0;
  const currentVersion = seed.version ?? '1.0.0';
  const dept = seed.dept_name || '部门1/平台产品线/平台工具组';
  const deptParts = skillDeptParts({ ...seed, dept_name: dept });
  const author = seed.publisher ?? publishName;
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
    category,
    categoryGroupName,
    status: seed.marketStatus ?? level,
    orgId: org?.id ?? null,
    orgName: org?.orgName ?? null,
    department_l1: deptParts[0] ?? '',
    department_l2: deptParts[1] ?? '',
    department_l3: deptParts[2] ?? '',
    department_l4: deptParts[3] ?? '',
    department_l5: deptParts[4] ?? '',
    department_l6: deptParts[5] ?? '',
    requirements: '需要 Python 3.10+，可按 Skill 文档安装依赖。',
    fileDir: `fuyao/skills/${seed.name ?? seed.skill_id}/${currentVersion}`,
    packagePath: `fuyao/skills/${seed.name ?? seed.skill_id}/${currentVersion}/skill.zip`,
    fileTree: pickMockFileTreeFromSeed(seed),
    skillMdContent: '',
    createdAt: updatedAt,
    updatedAt,
    likes: Math.max(0, Math.floor(downloads * 0.05)),
    dislikes: Math.max(0, Math.floor(downloads * 0.004)),
    qualityMark: (seed.rating ?? 0) >= 4.7 ? '优秀 Skill' : null,
    qualityBadges: (seed.rating ?? 0) >= 4.7 ? ['优秀 Skill', '高分 Skill'] : [],
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
    (s) => s.id === sid || s.skill_id === sid || s.name === sid || String(stableNumericId(s)) === sid,
  );
}

function readMockRole(): 'SUPER_ADMIN' | 'ORG_ADMIN' | 'USER' {
  const raw = String(import.meta.env.VITE_SKILL_MARKET_MOCK_ROLE ?? '').trim().toUpperCase();
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
    skill.department_l1,
    skill.department_l2,
    skill.department_l3,
    skill.department_l4,
    skill.department_l5,
    skill.department_l6,
  ];
  return expected.every((want, i) => !want || actual[i] === want);
}

function filterSkills(params: Record<string, unknown>, source = skillRecords): MockSkillRecord[] {
  let list = [...source];
  const keyword = String(params.keyword ?? '').trim().toLowerCase();
  if (keyword) {
    list = list.filter((s) =>
      [s.id, s.skill_id, s.name, s.description, s.publish_name, s.author, s.dept_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }
  const status = String(params.status ?? params.level ?? '').trim();
  if (status) {
    list = list.filter((s) => s.status.includes(status) || s.level.includes(status) || s.publish_level.includes(status));
  }
  const orgId = readNumber(params.orgId, 0);
  if (orgId > 0) {
    list = list.filter((s) => s.orgId === orgId);
  }
  const categoryGroupName = String(params.categoryGroupName ?? '').trim();
  if (categoryGroupName) {
    list = list.filter((s) => s.categoryGroupName === categoryGroupName);
  }
  const category = String(params.category ?? '').trim();
  if (category) {
    list = list.filter((s) => s.category === category);
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

function pageSkills(params: Record<string, unknown>, source = skillRecords): PagedArray<MockSkillRecord> {
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
    category: 'utility-doc',
    categoryGroupName: '工具类',
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

function upsertUploadedSkill(file: File | undefined): MockSkillRecord {
  const parsed = parsedSkillFromFile(file);
  const name = String(parsed.name);
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
    tagFunctional: String(parsed.categoryGroupName),
    tagOrg: '个人级',
    tags: tagsText(parsed.tags),
  });
  skillRecords = [newSkill, ...skillRecords];
  return { ...newSkill };
}

function createSkillFromBody(body: Record<string, unknown>): MockSkillRecord {
  const stamp = nowText();
  const name = readString(body.name, `mock-skill-${Date.now()}`);
  const category = readString(body.category, 'utility-doc');
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

function handleSkillRequest(method: string, path: string, config: AxiosRequestConfig): MockEnvelope<unknown> | null {
  const params = readParams(config);
  if (method === 'post' && path === '/upload/parse') {
    return ok(parsedSkillFromFile(fileFromFormData(config.data)));
  }
  if (method === 'post' && path === '/upload') {
    return ok(upsertUploadedSkill(fileFromFormData(config.data)));
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

function handleApiRequest(method: string, path: string, config: AxiosRequestConfig): MockEnvelope<unknown> | null {
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
    const managedIds = role === 'USER' ? [] : role === 'SUPER_ADMIN' ? orgStore.map((o) => o.id) : readManagedOrgIds();
    return ok({
      employeeNo: 'mock001',
      userName: role === 'SUPER_ADMIN' ? '演示超级管理员' : role === 'ORG_ADMIN' ? '演示组织管理员' : '演示普通用户',
      role,
      superAdmin: role === 'SUPER_ADMIN',
      orgAdmin: role === 'ORG_ADMIN',
      managedOrgIds: managedIds,
      managedOrgNames: orgStore.filter((o) => managedIds.includes(o.id)).map((o) => o.orgName),
      organizationScope: role === 'SUPER_ADMIN' ? 'ALL' : role === 'ORG_ADMIN' ? 'MANAGED_ORG' : 'NONE',
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
    const keyword = String(params.keyword ?? '').trim().toLowerCase();
    if (keyword) {
      rows = rows.filter((r) => r.skillName.toLowerCase().includes(keyword) || r.deptName.toLowerCase().includes(keyword));
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
          deptName: skill?.department_l4 || skill?.publish_name || '',
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

function handleFuyaoRequest(method: string, path: string, config: AxiosRequestConfig): MockEnvelope<unknown> | null {
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
  const explicit = String(import.meta.env.VITE_SKILL_BASE_SERVICE_MOCK ?? '').trim().toLowerCase();
  if (explicit === 'false' || explicit === '0') {
    return false;
  }
  if (explicit === 'true' || explicit === '1') {
    return true;
  }
  return import.meta.env.VITE_SKILL_MARKET_TRANSPORT !== 'http';
}

export function maybeHandleSkillBaseMockRequest<T>(
  channel: MockChannel,
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
  if (channel === 'api') {
    const envelope = handleApiRequest(method, path, config);
    return envelope ? Promise.resolve(envelope as T) : null;
  }
  return null;
}

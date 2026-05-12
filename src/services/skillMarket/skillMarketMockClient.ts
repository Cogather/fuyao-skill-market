import { ref } from 'vue';
import {
  downloadSkillApi,
  listSkillsApi,
  matchesScope,
  uploadSkillApi,
} from '../../api/skillMarketMock';
import { buildOpsDashboardBundle, parseDeptNamePath, type OpsDashboardBundle } from '../../utils/opsExcelImport';
import type {
  Skill,
  SkillListQuery,
  SkillUploadPayload,
} from '../../types/skill';
import type {
  ApiEnvelope,
  CreateSkillBody,
  CreateSkillResultDto,
  CurrentUserRoleDto,
  DashboardOverviewDto,
  DashboardOverviewParams,
  MySkillsParams,
  OrganizationDto,
  OrganizationUpsertBody,
  QualityReviewArchiveBody,
  QualityReviewListParams,
  QualityReviewSaveBody,
  SkillDeleteAllParams,
  SkillListParamsDto,
  SkillListPayloadDto,
  SkillListRecordDto,
  SkillUnpublishVersionParams,
  SkillUploadParseResultDto,
  SkillVersionListItemDto,
  SuperAdminCreateBody,
  SuperAdminDto,
  SuperAdminUpdateBody,
  SyncApplicationResultDto,
  SyncApplicationsParams,
  SyncReviewBody,
  UserDepartmentDto,
  UserMarketRole,
  DepartmentTreeNodeDto,
  SkillDownloadStatsDto,
  SkillDownloadStatsParams,
} from './apiTypes';
import { skillToListRecord, stableNumericId } from './mappers';
import { getBuiltInSkills } from './mock/builtInSkills';
import { mapSkillVersionsToListDto } from './mock/mapSkillVersionsToListDto';
import { getMockMarketDepartmentsTree } from './mock/marketDepartmentsTreeDefault';
import { readOpsDashboardBundleFromJson } from './mock/opsDashboardUiDefaults';
import { marketSkillsToOpsExcelRows } from './opsBundleFromSkills';
import type { SkillDownloadOptions, SkillDownloadResult, SkillMarketClient } from './skillMarketClient.types';

function ok<T>(data: T): ApiEnvelope<T> {
  return { code: 0, message: 'success', data };
}

function paramsToSkillListQuery(params: SkillListParamsDto): SkillListQuery {
  let scope: SkillListQuery['scope'] = 'all';
  if (params.level === '个人级') {
    scope = 'personal';
  } else if (params.level === '组织级') {
    scope = 'devDept';
  }
  return {
    keyword: params.keyword,
    page: params.pageNum,
    pageSize: params.pageSize,
    scope,
  };
}

function semverNums(v: string): number[] {
  return String(v)
    .split('.')
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

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

const ORG_SEED: OrganizationDto[] = [
  { id: 1, orgName: 'IT装备部', orgCode: 'ORG-IT-001', admins: 'it_admin_a,it_admin_b', enabled: true },
  { id: 2, orgName: '质量工具组', orgCode: 'ORG-QA-002', admins: 'qa_admin_a,qa_admin_b', enabled: true },
  { id: 3, orgName: '平台工具组', orgCode: 'ORG-PLAT-003', admins: 'plat_admin_a,plat_admin_b', enabled: true },
  { id: 4, orgName: '云服务组', orgCode: 'ORG-CLOUD-004', admins: 'cloud_admin_a,cloud_admin_b', enabled: true },
  { id: 5, orgName: 'SRE团队', orgCode: 'ORG-SRE-005', admins: 'sre_admin_a,sre_admin_b', enabled: true },
];

function matchesSkillDepartmentFields(skill: Skill, params: SkillListParamsDto): boolean {
  const segs = parseDeptNamePath(skill.dept_name ?? '');
  const expected: (string | undefined)[] = [
    params.departmentL1,
    params.departmentL2,
    params.departmentL3,
    params.departmentL4,
    params.departmentL5,
    params.departmentL6,
  ];
  for (let i = 0; i < expected.length; i++) {
    const want = expected[i]?.trim();
    if (!want) {
      continue;
    }
    if (segs[i] !== want) {
      return false;
    }
  }
  return true;
}

function parseTagListParams(params: SkillListParamsDto): string[] {
  const raw = params.tagList?.trim();
  if (raw) {
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (params.tag?.trim()) {
    return [params.tag.trim()];
  }
  return [];
}

function normSkillTags(s: any): string[] {
  return (s.tags ?? [])?.map((x: string) => x.trim())?.filter(Boolean) ?? [];
}

function publishTimeForSort(skill: Skill): string {
  return skill.latestPublishTime ?? '';
}

/** 与《设计文档》§3.3.3 市场列表筛选语义对齐（Mock 内存数据） */
function applyMarketListParams(all: Skill[], params: SkillListParamsDto): Skill[] {
  const base = paramsToSkillListQuery(params);
  const scope = base.scope ?? 'all';
  let list = all.filter((s) => matchesScope(s, scope));
  const kw = params.keyword?.trim().toLowerCase();
  if (kw) {
    list = list.filter((skill) =>
      [skill.skill_id, skill.description, skill.publish_name, skill.dept_name, skill.name]
        .filter((x): x is string => Boolean(x))
        .some((x) => x.toLowerCase().includes(kw)),
    );
  }
  if (params.orgId != null && params.orgId > 0) {
    const orgName = ORG_SEED.find((o) => o.id === params.orgId)?.orgName;
    if (orgName) {
      list = list.filter((s) => (s.publish_name ?? '').trim() === orgName);
    }
  }
  list = list.filter((s) => matchesSkillDepartmentFields(s, params));
  if (params.categoryGroupName?.trim()) {
    const cg = params.categoryGroupName.trim();
    list = list.filter((s) => (s.tagFunctional ?? '').trim() === cg);
  }
  const tagTerms = parseTagListParams(params);
  if (tagTerms.length > 0) {
    list = list.filter((s) => {
      const st = normSkillTags(s);
      return tagTerms.some((t) => st.includes(t));
    });
  }
  return list;
}

type MockSyncRow = {
  id: number;
  skillId?: number;
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

function cloneBundle(b: OpsDashboardBundle): OpsDashboardBundle {
  return structuredClone(b);
}

/** 仅在本文件（Mock 客户端）内使用；HTTP 正式客户端不会调用。 */
function readMockUserMarketRole(): UserMarketRole {
  const raw = import.meta.env.VITE_SKILL_MARKET_MOCK_ROLE;
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'ORG_ADMIN';
  }
  const u = raw.trim().toUpperCase();
  if (u === 'USER') {
    return 'USER';
  }
  if (u === 'ORG_ADMIN') {
    return 'ORG_ADMIN';
  }
  if (u === 'SUPER_ADMIN') {
    return 'SUPER_ADMIN';
  }
  return 'ORG_ADMIN';
}

/** 仅在本文件（Mock 客户端）内使用；HTTP 正式客户端不会调用。 */
function readMockManagedOrgIds(validIds: number[]): number[] {
  const raw = import.meta.env.VITE_SKILL_MARKET_MOCK_MANAGED_ORG_IDS;
  if (typeof raw !== 'string' || !raw.trim()) {
    return [...validIds];
  }
  const allowed = new Set(validIds);
  const parsed = raw
    .split(/[,，]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && allowed.has(n));
  if (parsed.length === 0) {
    return [...validIds];
  }
  return parsed;
}

/**
 * 与真实后端约定一致：`GET /organizations` 按当前 Mock 角色裁剪。
 * - USER：空列表
 * - ORG_ADMIN：仅 `readMockManagedOrgIds` 范围内的组织（与 `fetchCurrentUserRole.managedOrgIds` 一致）
 * - SUPER_ADMIN：全量 `orgStore`
 */
function organizationsVisibleInMock(orgStore: OrganizationDto[]): OrganizationDto[] {
  const mockRole = readMockUserMarketRole();
  const allIds = orgStore.map((o) => o.id);
  if (mockRole === 'USER') {
    return [];
  }
  if (mockRole === 'SUPER_ADMIN') {
    return orgStore.map((o) => ({ ...o }));
  }
  const managedIds = readMockManagedOrgIds(allIds);
  const allow = new Set(managedIds);
  return orgStore.filter((o) => allow.has(o.id)).map((o) => ({ ...o }));
}

export function createSkillMarketMockClient(initialSkills?: Skill[]): SkillMarketClient {
  const seed =
    initialSkills && initialSkills.length > 0 ? [...initialSkills] : getBuiltInSkills();
  const skills = ref<Skill[]>(seed);
  const orgStore: OrganizationDto[] = ORG_SEED.map((o) => ({ ...o }));

  let syncPending: MockSyncRow[] = [
    {
      id: 90_001,
      skillId: 10_001,
      skillName: '日志分析 Skill',
      applyType: '同步至公司组织',
      targetLevel: '组织级',
      targetOrgId: 5,
      targetOrgName: 'SRE团队',
      reason: '已在个人级完成使用验证，下载 128 次，希望沉淀到 SRE团队统一排障使用。',
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
    {
      id: 80_003,
      skillName: '会议纪要 Skill',
      applyType: '同步至公司组织',
      targetLevel: '组织级',
      targetOrgId: 2,
      targetOrgName: '产品运营一组',
      reason: '',
      approverLabel: '',
      status: '已完成',
      reviewResult: '通过',
      reviewComment: '适用范围清晰，可先在目标组织内发布。',
      completedAt: '2026-04-20 11:42',
    },
  ];

  let superAdminRows: SuperAdminDto[] = [
    {
      id: 1,
      employeeNo: '000001',
      employeeName: '系统初始化超级管理员',
      enabled: true,
      remark: '预置账号',
    },
  ];

  function findSkillByApiId(id: string | number): Skill | undefined {
    const sid = String(id);
    return skills.value.find(
      (s) =>
        s.id === sid ||
        s.skill_id === sid ||
        String(stableNumericId(s)) === sid ||
        (s.name && sid === s.name),
    );
  }

  const client: SkillMarketClient = {
    skills,

    async listSkills(query) {
      return listSkillsApi(skills.value, query);
    },

    async uploadSkill(payload: SkillUploadPayload) {
      return uploadSkillApi(skills.value, payload);
    },

    async downloadSkill(skillId: string, options?: SkillDownloadOptions): Promise<SkillDownloadResult> {
      void options?.sourcePage;
      return downloadSkillApi(skills.value, skillId, { version: options?.version });
    },

    async fetchUserDepartment() {
      const data: UserDepartmentDto = {
        department_l1: '云核装备经营管理部',
        department_l2: '智能终端产品部',
        department_l3: '云服务组',
        department_l4: 'SRE团队',
        department_l5: '',
        department_l6: '',
      };
      return ok(data);
    },

    async fetchCurrentUserRole() {
      const mockRole = readMockUserMarketRole();
      const allIds = orgStore.map((o) => o.id);

      if (mockRole === 'USER') {
        const data: CurrentUserRoleDto = {
          employeeNo: 'mock001',
          userName: '演示普通用户',
          role: 'USER',
          superAdmin: false,
          orgAdmin: false,
          managedOrgIds: [],
          managedOrgNames: [],
          organizationScope: 'NONE',
        };
        return ok(data);
      }

      if (mockRole === 'SUPER_ADMIN') {
        const data: CurrentUserRoleDto = {
          employeeNo: 'mock001',
          userName: '演示超级管理员',
          role: 'SUPER_ADMIN',
          superAdmin: true,
          orgAdmin: false,
          managedOrgIds: [...allIds],
          managedOrgNames: orgStore.map((o) => o.orgName),
          organizationScope: 'ALL',
        };
        return ok(data);
      }

      const managedIds = readMockManagedOrgIds(allIds);
      const data: CurrentUserRoleDto = {
        employeeNo: 'mock001',
        userName: '演示组织管理员',
        role: 'ORG_ADMIN',
        superAdmin: false,
        orgAdmin: true,
        managedOrgIds: managedIds,
        managedOrgNames: orgStore.filter((o) => managedIds.includes(o.id)).map((o) => o.orgName),
        organizationScope: 'MANAGED_ORG',
      };
      return ok(data);
    },

    async fetchSuperAdmins() {
      return ok(superAdminRows.map((r) => ({ ...r })));
    },

    async postSuperAdmin(body: SuperAdminCreateBody) {
      const nextId = Math.max(0, ...superAdminRows.map((x) => x.id)) + 1;
      const row: SuperAdminDto = {
        id: nextId,
        employeeNo: body.employeeNo,
        employeeName: body.employeeName ?? null,
        enabled: body.enabled,
        remark: body.remark ?? null,
      };
      superAdminRows = [...superAdminRows, row];
      return ok(row);
    },

    async putSuperAdmin(id: string | number, body: SuperAdminUpdateBody) {
      const nid = Number(id);
      const idx = superAdminRows.findIndex((x) => x.id === nid);
      if (idx < 0) {
        return {
          code: 40401,
          message: '超级管理员记录不存在',
          data: {
            id: 0,
            employeeNo: '',
            employeeName: null,
            enabled: false,
            remark: null,
          },
        };
      }
      const cur = superAdminRows[idx];
      const next: SuperAdminDto = {
        ...cur,
        enabled: body.enabled ?? cur.enabled,
        employeeName:
          body.employeeName !== undefined ? body.employeeName : cur.employeeName,
        remark: body.remark !== undefined ? body.remark : cur.remark,
      };
      superAdminRows = superAdminRows.map((r, i) => (i === idx ? next : r));
      return ok(next);
    },

    async fetchSkills(params: SkillListParamsDto) {
      let list = applyMarketListParams(skills.value, params);
      list = [...list].sort((a, b) => {
        const ta = publishTimeForSort(a);
        const tb = publishTimeForSort(b);
        if (ta === tb) {
          return 0;
        }
        return ta < tb ? 1 : -1;
      });
      const pageNo = Math.max(1, params.pageNum);
      const pageSize = Math.max(1, params.pageSize);
      const total = list.length;
      const start = (pageNo - 1) * pageSize;
      const pageSlice = list.slice(start, start + pageSize);
      const records: SkillListRecordDto[] = pageSlice.map((s) =>
        skillToListRecord(s, s.latestPublishTime ?? '2026-04-28 10:20:00'),
      );
      const data: SkillListPayloadDto = {
        total,
        records,
      };
      return ok(data);
    },

    async fetchMySkills(params: MySkillsParams) {
      const mine = skills.value.filter((s) => s.ownedByUser);
      const source = mine.length > 0 ? mine : skills.value.slice(0, 4);
      let records: SkillListRecordDto[] = source.map((s) =>
        skillToListRecord(s, s.latestPublishTime ?? '2026-04-28 10:20:00'),
      );
      if (params.keyword?.trim()) {
        const kw = params.keyword.trim().toLowerCase();
        records = records.filter((r) => r.name.toLowerCase().includes(kw));
      }
      if (params.status?.trim()) {
        const st = params.status.trim();
        records = records.filter(
          (r) => r.status.includes(st) || r.level.includes(st),
        );
      }
      const pageNo = Math.max(1, params.pageNo);
      const pageSize = Math.max(1, params.pageSize);
      const total = records.length;
      const start = (pageNo - 1) * pageSize;
      const slice = records.slice(start, start + pageSize);
      const data: SkillListPayloadDto = { total, records: slice };
      return ok(data);
    },

    async fetchSkillDetail(id: string | number) {
      const skill = findSkillByApiId(id);
      if (!skill) {
        return ok<any | null>(null);
      }
      const rec = skillToListRecord(skill, skill.latestPublishTime ?? '');
      const fileTree =
        skill.fileTree != null
          ? skill.fileTree
          : (['SKILL.md', 'README.md', 'scripts/main.py'] as const);
      const skillMdContent =
        typeof skill.skillMdContent === 'string' && skill.skillMdContent.trim()
          ? skill.skillMdContent
          : `# ${rec.name}\n\n## 概述\n\n(Mock)`;
      const dto: any = {
        ...rec,
        requirements: '本地运行环境、Python 3.10+',
        lastReviewComment: null,
        lastReviewedAt: null,
        fileTree: Array.isArray(fileTree) ? [...fileTree] : fileTree,
        skillMdContent,
      };
      return ok(dto);
    },

    async fetchSkillVersions(id: string | number) {
      const skill = findSkillByApiId(id);
      if (!skill) {
        return { code: 40401, message: 'Skill 不存在', data: [] as SkillVersionListItemDto[] };
      }
      return ok(mapSkillVersionsToListDto(skill));
    },

    async deleteSkillAll(id: string | number, params: SkillDeleteAllParams) {
      void params;
      const skill = findSkillByApiId(id);
      if (!skill) {
        return { code: 40401, message: 'Skill 不存在', data: null as unknown };
      }
      skills.value = skills.value.filter((s) => s !== skill);
      return ok({ ok: true });
    },

    async unpublishSkillVersion(id: string | number, params: SkillUnpublishVersionParams) {
      void params.userId;
      const skill = findSkillByApiId(id);
      if (!skill) {
        return { code: 40401, message: 'Skill 不存在', data: null as unknown };
      }
      const vers = [...(skill.versions ?? [])];
      const ix = vers.findIndex((v) => v.version === params.version);
      if (ix < 0) {
        return { code: 40401, message: '版本不存在', data: null as unknown };
      }
      const cur = vers[ix]!;
      if ((cur as { unpublished?: boolean }).unpublished) {
        return { code: 40001, message: '该版本已下架', data: null as unknown };
      }
      vers[ix] = { ...cur, unpublished: true };
      const active = vers.filter((v) => !(v as { unpublished?: boolean }).unpublished);
      let nextVersion = skill.version;
      let nextTime = skill.latestPublishTime;
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) => compareSemverDesc(a.version, b.version));
        const head = sorted[0];
        if (head) {
          nextVersion = head.version;
          nextTime = head.publishTime;
        }
      }
      const next: Skill = {
        ...skill,
        versions: vers,
        version: nextVersion,
        latestPublishTime: nextTime,
      };
      const idx = skills.value.findIndex((s) => s === skill);
      if (idx >= 0) {
        skills.value[idx] = next;
      }
      return ok({ ok: true });
    },

    async fetchSkillDownloadStats(id: string | number, params?: SkillDownloadStatsParams) {
      const s = findSkillByApiId(id);
      const d = s ? (s.download_count ?? s.downloads ?? 0) : 0;
      const skillIdNum = s ? stableNumericId(s) : Number.parseInt(String(id), 10) || 0;
      const data: SkillDownloadStatsDto = {
        skillId: skillIdNum,
        name: s?.name ?? s?.skill_id ?? '',
        totalDownloads: d,
        currentDownloads: d,
        startDate: params?.startDate,
        endDate: params?.endDate,
        granularity: params?.granularity ?? 'day',
        trend: [],
      };
      return ok(data);
    },

    async uploadSkillArchive(file: File) {
      const baseName = file.name.replace(/\.zip$/i, '') || 'uploaded-skill';
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      const category = 'utility-doc';
      const data: any = {
        skillId: stableNumericId({ skill_id: baseName, name: baseName } as Skill),
        name: baseName,
        description: `Mock 自压缩包「${file.name}」`,
        requirements: '',
        author: 'mock-uploader',
        version: '1.0.0',
        category,
        categoryGroupName: '工具类',
        tags: ['mock'],
        level: '个人级',
        status: '个人级',
        orgId: null,
        orgName: null,
        ownerUser: 'mock',
        ownerName: 'Mock 用户',
        department_l1: '云核装备经营管理部',
        department_l2: '智能终端产品部',
        department_l3: '云服务组',
        department_l4: 'SRE团队',
        department_l5: '',
        department_l6: '',
        downloads: 0,
        fileDir: `fuyao/skills/${baseName}/1.0.0`,
        packagePath: `fuyao/skills/${baseName}/1.0.0/skill.zip`,
        fileTree: ['SKILL.md'],
        skillMdContent: `# ${baseName}\n`,
        createdAt: ts,
        updatedAt: ts,
      };
      return ok(data);
    },

    async postSkillUploadParse(file: File) {
      const raw = file.name.replace(/\.[^.]+$/, '').trim() || 'parsed-skill';
      const name = raw === 'parsed-skill' ? 'pdf-document-extractor' : raw;
      const exists = skills.value.some(
        (s) => (s.name ?? s.skill_id ?? '').toLowerCase() === name.toLowerCase(),
      );
      const data: any = {
        name,
        version: '1.0.0',
        description: `Mock：根据「${file.name}」推断的 description，真实环境由后端解析 SKILL.md`,
        requirements: '需要 Python 3.10+ 和 pdfplumber 库',
        author: '当前用户',
        category: 'utility-doc',
        categoryGroupName: '工具类',
        tags: ['pdf', 'document'],
        level: '个人级（默认发布，无需审核）',
        nameExists: exists,
        fileTree: ['SKILL.md', 'README.md'],
      };
      return ok(data);
    },

    async createSkill(body: CreateSkillBody) {
      const data: CreateSkillResultDto = {
        skillId: stableNumericId({ skill_id: body.name, name: body.name } as Skill),
        level: '个人级',
        status: '个人级',
      };
      return ok(data);
    },

    async postSkillVersion() {
      return ok({ ok: true });
    },

    async postSyncApplication() {
      const data: SyncApplicationResultDto = {
        applicationId: 90_001,
        status: '待审核',
        skillStatus: '组织审核中',
      };
      return ok(data);
    },

    async postSyncUpdateApplication() {
      const data: SyncApplicationResultDto = {
        applicationId: 90_002,
        status: '待审核',
        syncType: '更新同步',
      };
      return ok(data);
    },

    async postSyncApplicationReview(id: string | number, body: SyncReviewBody) {
      const n = Number(id);
      const idx = syncPending.findIndex((r) => r.id === n);
      if (idx >= 0) {
        const row = syncPending[idx]!;
        syncPending.splice(idx, 1);
        const stamp = new Date();
        const completedAt = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
        syncDone.unshift({
          ...row,
          status: '已完成',
          reviewResult: body.decision === 'approve' ? '通过' : '不通过',
          reviewComment: body.comment,
          completedAt,
        });
      }
      return ok({ ok: true });
    },

    async fetchSyncApplications(params: SyncApplicationsParams) {
      if (params.tab === 'pending') {
        return ok({
          total: syncPending.length,
          records: syncPending.map((r) => ({ ...r })),
        });
      }
      return ok({
        total: syncDone.length,
        records: syncDone.map((r) => ({ ...r })),
      });
    },

    async fetchOrganizations() {
      return ok(organizationsVisibleInMock(orgStore));
    },

    async postOrganization(body: OrganizationUpsertBody) {
      if (readMockUserMarketRole() !== 'SUPER_ADMIN') {
        return {
          code: 40301,
          message: '无权限：仅超级管理员可新建组织',
          data: {
            id: 0,
            orgName: '',
            orgCode: '',
            admins: '',
            enabled: false,
          },
        };
      }
      const nextId = Math.max(0, ...orgStore.map((o) => o.id)) + 1;
      const dto: OrganizationDto = {
        id: nextId,
        orgName: body.orgName,
        orgCode: body.orgCode,
        admins: body.admins,
        enabled: body.enabled,
      };
      orgStore.push(dto);
      return ok(dto);
    },

    async putOrganization(id: string | number, body: OrganizationUpsertBody) {
      const n = Number(id);
      const mockRole = readMockUserMarketRole();
      const allIds = orgStore.map((o) => o.id);
      const emptyDto = (oid: number): OrganizationDto => ({
        id: oid,
        orgName: '',
        orgCode: '',
        admins: '',
        enabled: false,
      });
      if (mockRole === 'USER') {
        return {
          code: 40301,
          message: '无权限',
          data: emptyDto(n),
        };
      }
      if (mockRole === 'ORG_ADMIN') {
        const allow = new Set(readMockManagedOrgIds(allIds));
        if (!allow.has(n)) {
          return {
            code: 40301,
            message: '无权限：该组织不在您的管辖范围内',
            data: emptyDto(n),
          };
        }
      }
      const idx = orgStore.findIndex((o) => o.id === n);
      const dto: OrganizationDto = {
        id: n,
        orgName: body.orgName,
        orgCode: body.orgCode,
        admins: body.admins,
        enabled: body.enabled,
      };
      if (idx >= 0) {
        orgStore[idx] = dto;
      }
      return ok(dto);
    },

    async fetchDepartmentsTree(): Promise<ApiEnvelope<DepartmentTreeNodeDto[]>> {
      return ok(getMockMarketDepartmentsTree());
    },

    async fetchDashboardOverview(params: DashboardOverviewParams) {
      const totalDl = skills.value.reduce(
        (sum, s) => sum + (s.download_count ?? s.downloads ?? 0),
        0,
      );
      const orgLevelSkills = skills.value.filter((s) => (s.publish_level ?? '').trim() === '组织级');
      const orgRankMap = new Map<string, { totalSkills: number; downloads: number }>();
      for (const s of orgLevelSkills) {
        const key = (s.publish_name ?? '').trim() || '未填写组织';
        const cur = orgRankMap.get(key) ?? { totalSkills: 0, downloads: 0 };
        cur.totalSkills += 1;
        cur.downloads += s.download_count ?? s.downloads ?? 0;
        orgRankMap.set(key, cur);
      }
      const rankings = [...orgRankMap.entries()]
        .map(([name, v]) => ({
          name,
          totalSkills: v.totalSkills,
          skillCount: v.totalSkills,
          downloads: v.downloads,
        }))
        .sort((a, b) => b.downloads - a.downloads || b.totalSkills - a.totalSkills);
      const data: DashboardOverviewDto = {
        system: params.system,
        statDate: params.statDate ?? '2026-04-27',
        kpis: {
          totalSkills: skills.value.length,
          skillCount: skills.value.length,
          personalSkillCount: skills.value.filter((s) =>
            (s.publish_level ?? '').includes('个人'),
          ).length,
          /** 扶摇侧：已发布为组织级、即同步到公司组织维度的 Skill 数量（与运营看板「组织级」KPI 一致） */
          verifiedSkillCount: orgLevelSkills.length,
          downloads: totalDl,
        },
        deptTree: [
          {
            deptName: '云核装备经营管理部',
            deptLevel: 1,
            skillCount: skills.value.length,
            downloads: totalDl,
            children: [],
          },
        ],
        rankings,
        topSkills: skills.value.slice(0, 5).map((s) => ({
          skillId: stableNumericId(s),
          name: s.name ?? s.skill_id,
          downloads: s.download_count ?? s.downloads ?? 0,
          likes: 0,
          dislikes: 0,
          rating: s.rating ?? 4.5,
          qualityBadges: [] as string[],
        })),
      };
      return ok(data);
    },

    async fetchQualityReviews(_params: QualityReviewListParams) {
      return ok({ total: 0, records: [] });
    },

    async postQualityReviewsSave(_body: QualityReviewSaveBody) {
      return ok({ ok: true });
    },

    async postQualityReviewsArchive(_body: QualityReviewArchiveBody) {
      return ok({ ok: true });
    },

    async postDashboardImportExcel(file: File, system: 'fuyao' | 'company', statDate: string) {
      void file;
      void system;
      void statDate;
      return ok({ ok: true });
    },

    async fetchOpsDashboardUi(system: 'fuyao' | 'company') {
      if (system === 'company') {
        return ok(cloneBundle(readOpsDashboardBundleFromJson('company')));
      }
      /**
       * 扶摇：组织级分布 = 当前市场中 `publish_level` 为组织级的 Skill，按 `publish_name` 聚合（与同步至公司组织维度一致）。
       * 使用与 Excel 导入相同的 `buildOpsDashboardBundle`，保证 KPI / orgBars / skillRows / deptTree 同源。
       */
      const bundle = buildOpsDashboardBundle(marketSkillsToOpsExcelRows(skills.value));
      return ok(cloneBundle(bundle));
    },
  };

  return client;
}

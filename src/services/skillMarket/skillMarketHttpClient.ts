import { ref } from 'vue';
import type {
  Skill,
  SkillListQuery,
  SkillUploadPayload,
  SkillUploadResponse,
} from '../../types/skill';
import type { OpsDashboardBundle } from '../../utils/opsExcelImport';
import type {
  ApiEnvelope,
  CreateSkillBody,
  CreateSkillResultDto,
  CurrentUserRoleDto,
  DashboardOverviewDto,
  DashboardOverviewParams,
  OrganizationDto,
  OrganizationUpsertBody,
  QualityReviewArchiveBody,
  QualityReviewListParams,
  QualityReviewSaveBody,
  SkillDetailDto,
  SkillDownloadRequestBody,
  SkillDownloadResultDto,
  SkillDownloadStatsDto,
  SkillDownloadStatsParams,
  MySkillsParams,
  SkillListParamsDto,
  SkillListPayloadDto,
  SkillUploadParseResultDto,
  SuperAdminCreateBody,
  SuperAdminDto,
  SuperAdminUpdateBody,
  SyncApplicationBody,
  SyncApplicationResultDto,
  SyncApplicationsParams,
  SyncReviewBody,
  SyncUpdateApplicationBody,
  UploadSkillResultDto,
  UserDepartmentDto,
  DepartmentTreeNodeDto,
} from './apiTypes';
import { SKILL_MARKET_ENDPOINTS } from './endpoints';
import { joinBaseUrl, readJsonEnvelope } from './httpJson';
import { emptyOpsDashboardBundle, readOpsDashboardBundleFromJson } from './mock/opsDashboardUiDefaults';
import { dashboardOverviewToOpsBundle } from './opsOverviewToBundle';
import { getSkillMarketRequestUserId } from './requestUserContext';
import {
  apiRecordToSkill,
  mergeSkillFromSkillDownloadDto,
  skillListQueryToDto,
  stableNumericId,
  uploadResultDtoToSkill,
} from './mappers';
import type { SkillDownloadOptions, SkillDownloadResult, SkillMarketClient } from './skillMarketClient.types';

function toSearchParams(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') {
      continue;
    }
    sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

function resolvePackageDownloadUrl(apiBase: string, downloadUrl: string): string {
  const u = downloadUrl.trim();
  if (!u) {
    return u;
  }
  if (/^https?:\/\//i.test(u)) {
    return u;
  }
  return joinBaseUrl(apiBase, u);
}

function isSkillsApiPath(path: string): boolean {
  const pathOnly = path.split('?')[0] ?? '';
  return pathOnly === '/api/skills' || pathOnly.startsWith('/api/skills/');
}

function appendUserIdToSkillsParams(path: string): string {
  const userId = getSkillMarketRequestUserId();
  if (!userId || !isSkillsApiPath(path)) {
    return path;
  }
  const [pathOnly, query = ''] = path.split('?');
  const sp = new URLSearchParams(query);
  sp.set('userId', userId);
  const q = sp.toString();
  return q ? `${pathOnly}?${q}` : pathOnly;
}

function addUserIdToSkillsJsonBody(path: string, body: unknown): unknown {
  const userId = getSkillMarketRequestUserId();
  if (!userId || !isSkillsApiPath(path)) {
    return body;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return {
      ...(body as Record<string, unknown>),
      userId,
    };
  }
  return { userId };
}

function addUserIdToSkillsForm(path: string, form: FormData): FormData {
  const userId = getSkillMarketRequestUserId();
  if (userId && isSkillsApiPath(path)) {
    form.set('userId', userId);
  }
  return form;
}

function fileNameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain?.[1]) {
    return plain[1].trim();
  }
  return fallback;
}

export function createSkillMarketHttpClient(baseUrl: string): SkillMarketClient {
  const skills = ref<Skill[]>([]);

  async function get<T>(path: string): Promise<ApiEnvelope<T>> {
    const res = await fetch(joinBaseUrl(baseUrl, appendUserIdToSkillsParams(path)), {
      credentials: 'include',
    });
    return readJsonEnvelope<T>(res);
  }

  async function postJson<T>(path: string, body: unknown): Promise<ApiEnvelope<T>> {
    const res = await fetch(joinBaseUrl(baseUrl, path), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addUserIdToSkillsJsonBody(path, body)),
    });
    return readJsonEnvelope<T>(res);
  }

  async function putJson<T>(path: string, body: unknown): Promise<ApiEnvelope<T>> {
    const res = await fetch(joinBaseUrl(baseUrl, path), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addUserIdToSkillsJsonBody(path, body)),
    });
    return readJsonEnvelope<T>(res);
  }

  async function postForm<T>(path: string, form: FormData): Promise<ApiEnvelope<T>> {
    const res = await fetch(joinBaseUrl(baseUrl, path), {
      method: 'POST',
      credentials: 'include',
      body: addUserIdToSkillsForm(path, form),
    });
    return readJsonEnvelope<T>(res);
  }

  async function hydrateFromServer(): Promise<void> {
    const env = await get<SkillListPayloadDto>(
      `${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams({ pageNo: 1, pageSize: 500 })}`,
    );
    if (env.code === 0 && env.data?.records) {
      skills.value = env.data.records.map(apiRecordToSkill);
    }
  }

  void hydrateFromServer();

  const client: SkillMarketClient = {
    skills,

    async listSkills(query: SkillListQuery) {
      const dto = skillListQueryToDto(query);
      const env = await get<SkillListPayloadDto>(
        `${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams(dto as unknown as Record<string, string | number | boolean | undefined>)}`,
      );
      if (env.code !== 0) {
        throw new Error(env.message || '列表接口失败');
      }
      const page = dto.pageNo;
      const pageSize = dto.pageSize;
      const list = env.data.records.map(apiRecordToSkill);
      const total = env.data.total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        list,
        total,
        page,
        pageSize,
        totalPages,
      };
    },

    async uploadSkill(payload: SkillUploadPayload): Promise<SkillUploadResponse> {
      if (payload.file) {
        const form = new FormData();
        form.append('file', payload.file);
        const env = await postForm<UploadSkillResultDto>(SKILL_MARKET_ENDPOINTS.skillsUpload, form);
        if (env.code !== 0) {
          throw new Error(env.message || '上传失败');
        }
        await hydrateFromServer();
        const mapped = uploadResultDtoToSkill(env.data);
        return { created: true, skill: mapped };
      }
      const body: CreateSkillBody = {
        name: payload.name.trim(),
        description: payload.note ?? '',
        author: payload.publisher?.trim() || '当前用户',
        version: '1.0.0',
        category: 'utility-doc',
        tags: '',
        packagePath: `fuyao/skills/${payload.name}/1.0.0/skill.zip`,
        skillMdContent: '',
        fileTree: ['SKILL.md'],
      };
      const env = await postJson<CreateSkillResultDto>(SKILL_MARKET_ENDPOINTS.skills, body);
      if (env.code !== 0) {
        throw new Error(env.message || '创建失败');
      }
      await hydrateFromServer();
      const found = skills.value.find((s) => (s.name ?? s.skill_id) === body.name);
      if (!found) {
        throw new Error('创建成功但未在列表中找到记录');
      }
      return { created: true, skill: found };
    },

    async downloadSkill(skillId: string, options?: SkillDownloadOptions): Promise<SkillDownloadResult> {
      const sourcePage = options?.sourcePage ?? 'market';
      const prev = skills.value.find(
        (s) =>
          String(s.id) === String(skillId) ||
          s.skill_id === skillId ||
          String(stableNumericId(s)) === String(skillId),
      );
      const body: SkillDownloadRequestBody = { sourcePage };
      const env = await postJson<SkillDownloadResultDto>(
        SKILL_MARKET_ENDPOINTS.skillDownload(skillId),
        body,
      );
      if (env.code !== 0 || !env.data) {
        throw new Error(env.message || '下载失败');
      }
      const d = env.data;
      if (!d.downloadUrl?.trim()) {
        throw new Error(env.message || '下载失败：未返回下载地址');
      }
      const merged = mergeSkillFromSkillDownloadDto(prev, d);
      const idx = skills.value.findIndex(
        (s) =>
          String(s.id) === String(skillId) ||
          s.skill_id === skillId ||
          String(stableNumericId(s)) === String(skillId),
      );
      if (idx >= 0) {
        skills.value[idx] = { ...skills.value[idx], ...merged };
      }
      const defaultZipName = `${d.name}-v${d.version}.zip`;
      const resolved = resolvePackageDownloadUrl(baseUrl, d.downloadUrl);
      let sameOrigin = false;
      try {
        const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        sameOrigin = new URL(resolved, pageOrigin || 'http://localhost').origin === pageOrigin;
      } catch {
        sameOrigin = false;
      }
      try {
        const res = await fetch(resolved, {
          credentials: sameOrigin ? 'include' : 'omit',
          mode: 'cors',
        });
        if (!res.ok) {
          throw new Error(`下载文件失败：HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const fn = fileNameFromContentDisposition(res.headers.get('Content-Disposition'), defaultZipName);
        return { blob, fileName: fn, skill: merged };
      } catch {
        return {
          blob: null,
          fileName: defaultZipName,
          skill: merged,
          directDownloadUrl: resolved,
        };
      }
    },

    fetchSkillDownloadStats(id: string | number, params?: SkillDownloadStatsParams) {
      return get<SkillDownloadStatsDto>(
        `${SKILL_MARKET_ENDPOINTS.skillDownloadStats(id)}${toSearchParams(
          params as unknown as Record<string, string | number | boolean | undefined>,
        )}`,
      );
    },

    fetchUserDepartment() {
      return get<UserDepartmentDto>(SKILL_MARKET_ENDPOINTS.userCurrentDepartment);
    },

    /** 角色完全由后端返回；不读取 `VITE_SKILL_MARKET_MOCK_*`（该类变量仅在 mock 客户端内使用）。 */
    fetchCurrentUserRole() {
      return get<CurrentUserRoleDto>(SKILL_MARKET_ENDPOINTS.userCurrentRole);
    },

    fetchSuperAdmins() {
      return get<SuperAdminDto[]>(SKILL_MARKET_ENDPOINTS.superAdmins);
    },

    postSuperAdmin(body: SuperAdminCreateBody) {
      return postJson<SuperAdminDto>(SKILL_MARKET_ENDPOINTS.superAdmins, body);
    },

    putSuperAdmin(id: string | number, body: SuperAdminUpdateBody) {
      return putJson<SuperAdminDto>(SKILL_MARKET_ENDPOINTS.superAdminById(id), body);
    },

    fetchSkills(params: SkillListParamsDto) {
      return get<SkillListPayloadDto>(
        `${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams(params as unknown as Record<string, string | number | boolean | undefined>)}`,
      );
    },

    fetchMySkills(params: MySkillsParams) {
      return get<SkillListPayloadDto>(
        `${SKILL_MARKET_ENDPOINTS.skillsMy}${toSearchParams(params as unknown as Record<string, string | number | boolean | undefined>)}`,
      );
    },

    fetchSkillDetail(id: string | number) {
      return get<SkillDetailDto | null>(SKILL_MARKET_ENDPOINTS.skillById(id));
    },

    async uploadSkillArchive(file: File) {
      const form = new FormData();
      form.append('file', file);
      return postForm<UploadSkillResultDto>(SKILL_MARKET_ENDPOINTS.skillsUpload, form);
    },

    async postSkillUploadParse(file: File) {
      const form = new FormData();
      form.append('file', file);
      return postForm<SkillUploadParseResultDto>(SKILL_MARKET_ENDPOINTS.skillsUploadParse, form);
    },

    createSkill(body: CreateSkillBody) {
      return postJson<CreateSkillResultDto>(SKILL_MARKET_ENDPOINTS.skills, body);
    },

    async postSkillVersion(id: string | number, file: File) {
      const form = new FormData();
      form.append('file', file);
      return postForm(SKILL_MARKET_ENDPOINTS.skillVersions(id), form);
    },

    postSyncApplication(id: string | number, body: SyncApplicationBody) {
      return postJson<SyncApplicationResultDto>(
        SKILL_MARKET_ENDPOINTS.skillSyncApplications(id),
        body,
      );
    },

    postSyncUpdateApplication(id: string | number, body: SyncUpdateApplicationBody) {
      return postJson<SyncApplicationResultDto>(
        SKILL_MARKET_ENDPOINTS.skillSyncUpdateApplications(id),
        body,
      );
    },

    postSyncApplicationReview(id: string | number, body: SyncReviewBody) {
      return postJson(SKILL_MARKET_ENDPOINTS.syncApplicationReview(id), body);
    },

    fetchSyncApplications(params: SyncApplicationsParams) {
      return get(`${SKILL_MARKET_ENDPOINTS.syncApplications}${toSearchParams(params as unknown as Record<string, string | number | boolean | undefined>)}`);
    },

    /**
     * 组织列表须由后端按当前登录角色裁剪（与 Mock 行为对齐）：
     * `USER` 宜返回 `[]`；`ORG_ADMIN` 仅返回其 `managedOrgIds` 内组织；`SUPER_ADMIN` 返回可治理全量。
     */
    fetchDepartmentsTree() {
      return get<DepartmentTreeNodeDto[]>(SKILL_MARKET_ENDPOINTS.departmentsTree);
    },

    fetchOrganizations() {
      return get<OrganizationDto[]>(SKILL_MARKET_ENDPOINTS.organizations);
    },

    /** POST 仅 `SUPER_ADMIN`；其它角色应由后端返回 403。 */
    postOrganization(body: OrganizationUpsertBody) {
      return postJson<OrganizationDto>(SKILL_MARKET_ENDPOINTS.organizations, body);
    },

    /** `ORG_ADMIN` 仅允许更新管辖范围内组织；越权应由后端返回 403。 */
    putOrganization(id: string | number, body: OrganizationUpsertBody) {
      return putJson<OrganizationDto>(SKILL_MARKET_ENDPOINTS.organizationById(id), body);
    },

    fetchDashboardOverview(params: DashboardOverviewParams) {
      return get<DashboardOverviewDto>(
        `${SKILL_MARKET_ENDPOINTS.dashboardOverview}${toSearchParams(params as unknown as Record<string, string | number | boolean | undefined>)}`,
      );
    },

    fetchQualityReviews(params: QualityReviewListParams) {
      return get(
        `${SKILL_MARKET_ENDPOINTS.skillQualityReviews}${toSearchParams(params as unknown as Record<string, string | number | boolean | undefined>)}`,
      );
    },

    postQualityReviewsSave(body: QualityReviewSaveBody) {
      return postJson(SKILL_MARKET_ENDPOINTS.skillQualityReviewsSave, body);
    },

    postQualityReviewsArchive(body: QualityReviewArchiveBody) {
      return postJson(SKILL_MARKET_ENDPOINTS.skillQualityReviewsArchive, body);
    },

    /**
     * 运营看板 Excel：前端自行解析；公司侧仅预览+下载 JSON。扶摇看板只读 `overview`，此处不调后端上传。
     */
    async postDashboardImportExcel(
      file: File,
      system: 'fuyao' | 'company',
      statDate: string,
    ): Promise<ApiEnvelope<{ ok: boolean; importedRows?: number }>> {
      void file;
      void system;
      void statDate;
      return { code: 0, message: 'success', data: { ok: true } };
    },

    /**
     * - **公司系统**：不请求后端；只读打包的 `src/mock/opsDashboardCompanyDefault.json`（替换文件后需重新 dev/build）。
     * - **扶摇**：`GET /api/dashboard/overview?system=fuyao`（§3.3.13）再映射为 `OpsDashboardBundle`。
     */
    async fetchOpsDashboardUi(system: 'fuyao' | 'company'): Promise<ApiEnvelope<OpsDashboardBundle>> {
      if (system === 'company') {
        return { code: 0, message: 'success', data: readOpsDashboardBundleFromJson('company') };
      }
      const env = await get<DashboardOverviewDto>(
        `${SKILL_MARKET_ENDPOINTS.dashboardOverview}${toSearchParams({ system: 'fuyao' })}`,
      );
      if (env.code !== 0 || !env.data) {
        return {
          code: env.code,
          message: env.message || '扶摇运营看板：overview 接口失败',
          data: emptyOpsDashboardBundle(),
        };
      }
      return {
        code: 0,
        message: 'success',
        data: dashboardOverviewToOpsBundle(env.data),
      };
    },
  };

  return client;
}

import { ref } from 'vue';
import { SKILL_MARKET_ENDPOINTS } from './endpoints';
import { joinBaseUrl, readJsonEnvelope } from './httpJson';
import { emptyOpsDashboardBundle, readOpsDashboardBundleFromJson } from './mock/opsDashboardUiDefaults';
import { dashboardOverviewToOpsBundle } from './opsOverviewToBundle';
import { getSkillMarketRequestUserId } from './requestUserContext';
import { apiRecordToSkill, mergeSkillFromSkillDownloadDto, skillListQueryToDto, stableNumericId, uploadResultDtoToSkill, } from './mappers';
function toSearchParams(params) {
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
function resolvePackageDownloadUrl(apiBase, downloadUrl) {
    const u = downloadUrl.trim();
    if (!u) {
        return u;
    }
    if (/^https?:\/\//i.test(u)) {
        return u;
    }
    return joinBaseUrl(apiBase, u);
}
function isSkillsApiPath(path) {
    const pathOnly = path.split('?')[0] ?? '';
    return pathOnly === '/api/skills' || pathOnly.startsWith('/api/skills/');
}
function appendUserIdToSkillsParams(path) {
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
function addUserIdToSkillsJsonBody(path, body) {
    const userId = getSkillMarketRequestUserId();
    if (!userId || !isSkillsApiPath(path)) {
        return body;
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        return {
            ...body,
            userId,
        };
    }
    return { userId };
}
function addUserIdToSkillsForm(path, form) {
    const userId = getSkillMarketRequestUserId();
    if (userId && isSkillsApiPath(path)) {
        form.set('userId', userId);
    }
    return form;
}
function fileNameFromContentDisposition(header, fallback) {
    if (!header) {
        return fallback;
    }
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].trim());
        }
        catch {
            /* ignore */
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(header);
    if (plain?.[1]) {
        return plain[1].trim();
    }
    return fallback;
}
export function createSkillMarketHttpClient(baseUrl) {
    const skills = ref([]);
    async function get(path) {
        const res = await fetch(joinBaseUrl(baseUrl, appendUserIdToSkillsParams(path)), {
            credentials: 'include',
        });
        return readJsonEnvelope(res);
    }
    async function postJson(path, body) {
        const res = await fetch(joinBaseUrl(baseUrl, path), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addUserIdToSkillsJsonBody(path, body)),
        });
        return readJsonEnvelope(res);
    }
    async function putJson(path, body) {
        const res = await fetch(joinBaseUrl(baseUrl, path), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addUserIdToSkillsJsonBody(path, body)),
        });
        return readJsonEnvelope(res);
    }
    async function postForm(path, form) {
        const res = await fetch(joinBaseUrl(baseUrl, path), {
            method: 'POST',
            credentials: 'include',
            body: addUserIdToSkillsForm(path, form),
        });
        return readJsonEnvelope(res);
    }
    async function hydrateFromServer() {
        const env = await get(`${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams({ pageNo: 1, pageSize: 500 })}`);
        if (env.code === 0 && env.data?.records) {
            skills.value = env.data.records.map(apiRecordToSkill);
        }
    }
    void hydrateFromServer();
    const client = {
        skills,
        async listSkills(query) {
            const dto = skillListQueryToDto(query);
            const env = await get(`${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams(dto)}`);
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
        async uploadSkill(payload) {
            if (payload.file) {
                const form = new FormData();
                form.append('file', payload.file);
                const env = await postForm(SKILL_MARKET_ENDPOINTS.skillsUpload, form);
                if (env.code !== 0) {
                    throw new Error(env.message || '上传失败');
                }
                await hydrateFromServer();
                const mapped = uploadResultDtoToSkill(env.data);
                return { created: true, skill: mapped };
            }
            const body = {
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
            const env = await postJson(SKILL_MARKET_ENDPOINTS.skills, body);
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
        async downloadSkill(skillId, options) {
            const sourcePage = options?.sourcePage ?? 'market';
            const prev = skills.value.find((s) => String(s.id) === String(skillId) ||
                s.skill_id === skillId ||
                String(stableNumericId(s)) === String(skillId));
            const body = { sourcePage };
            const env = await postJson(SKILL_MARKET_ENDPOINTS.skillDownload(skillId), body);
            if (env.code !== 0 || !env.data) {
                throw new Error(env.message || '下载失败');
            }
            const d = env.data;
            if (!d.downloadUrl?.trim()) {
                throw new Error(env.message || '下载失败：未返回下载地址');
            }
            const merged = mergeSkillFromSkillDownloadDto(prev, d);
            const idx = skills.value.findIndex((s) => String(s.id) === String(skillId) ||
                s.skill_id === skillId ||
                String(stableNumericId(s)) === String(skillId));
            if (idx >= 0) {
                skills.value[idx] = { ...skills.value[idx], ...merged };
            }
            const defaultZipName = `${d.name}-v${d.version}.zip`;
            const resolved = resolvePackageDownloadUrl(baseUrl, d.downloadUrl);
            let sameOrigin = false;
            try {
                const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                sameOrigin = new URL(resolved, pageOrigin || 'http://localhost').origin === pageOrigin;
            }
            catch {
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
            }
            catch {
                return {
                    blob: null,
                    fileName: defaultZipName,
                    skill: merged,
                    directDownloadUrl: resolved,
                };
            }
        },
        fetchSkillDownloadStats(id, params) {
            return get(`${SKILL_MARKET_ENDPOINTS.skillDownloadStats(id)}${toSearchParams(params)}`);
        },
        fetchUserDepartment() {
            return get(SKILL_MARKET_ENDPOINTS.userCurrentDepartment);
        },
        /** 角色完全由后端返回；不读取 `VITE_SKILL_MARKET_MOCK_*`（该类变量仅在 mock 客户端内使用）。 */
        fetchCurrentUserRole() {
            return get(SKILL_MARKET_ENDPOINTS.userCurrentRole);
        },
        fetchSuperAdmins() {
            return get(SKILL_MARKET_ENDPOINTS.superAdmins);
        },
        postSuperAdmin(body) {
            return postJson(SKILL_MARKET_ENDPOINTS.superAdmins, body);
        },
        putSuperAdmin(id, body) {
            return putJson(SKILL_MARKET_ENDPOINTS.superAdminById(id), body);
        },
        fetchSkills(params) {
            return get(`${SKILL_MARKET_ENDPOINTS.skills}${toSearchParams(params)}`);
        },
        fetchMySkills(params) {
            return get(`${SKILL_MARKET_ENDPOINTS.skillsMy}${toSearchParams(params)}`);
        },
        fetchSkillDetail(id) {
            return get(SKILL_MARKET_ENDPOINTS.skillById(id));
        },
        async uploadSkillArchive(file) {
            const form = new FormData();
            form.append('file', file);
            return postForm(SKILL_MARKET_ENDPOINTS.skillsUpload, form);
        },
        async postSkillUploadParse(file) {
            const form = new FormData();
            form.append('file', file);
            return postForm(SKILL_MARKET_ENDPOINTS.skillsUploadParse, form);
        },
        createSkill(body) {
            return postJson(SKILL_MARKET_ENDPOINTS.skills, body);
        },
        async postSkillVersion(id, file) {
            const form = new FormData();
            form.append('file', file);
            return postForm(SKILL_MARKET_ENDPOINTS.skillVersions(id), form);
        },
        postSyncApplication(id, body) {
            return postJson(SKILL_MARKET_ENDPOINTS.skillSyncApplications(id), body);
        },
        postSyncUpdateApplication(id, body) {
            return postJson(SKILL_MARKET_ENDPOINTS.skillSyncUpdateApplications(id), body);
        },
        postSyncApplicationReview(id, body) {
            return postJson(SKILL_MARKET_ENDPOINTS.syncApplicationReview(id), body);
        },
        fetchSyncApplications(params) {
            return get(`${SKILL_MARKET_ENDPOINTS.syncApplications}${toSearchParams(params)}`);
        },
        /**
         * 组织列表须由后端按当前登录角色裁剪（与 Mock 行为对齐）：
         * `USER` 宜返回 `[]`；`ORG_ADMIN` 仅返回其 `managedOrgIds` 内组织；`SUPER_ADMIN` 返回可治理全量。
         */
        fetchDepartmentsTree() {
            return get(SKILL_MARKET_ENDPOINTS.departmentsTree);
        },
        fetchOrganizations() {
            return get(SKILL_MARKET_ENDPOINTS.organizations);
        },
        /** POST 仅 `SUPER_ADMIN`；其它角色应由后端返回 403。 */
        postOrganization(body) {
            return postJson(SKILL_MARKET_ENDPOINTS.organizations, body);
        },
        /** `ORG_ADMIN` 仅允许更新管辖范围内组织；越权应由后端返回 403。 */
        putOrganization(id, body) {
            return putJson(SKILL_MARKET_ENDPOINTS.organizationById(id), body);
        },
        fetchDashboardOverview(params) {
            return get(`${SKILL_MARKET_ENDPOINTS.dashboardOverview}${toSearchParams(params)}`);
        },
        fetchQualityReviews(params) {
            return get(`${SKILL_MARKET_ENDPOINTS.skillQualityReviews}${toSearchParams(params)}`);
        },
        postQualityReviewsSave(body) {
            return postJson(SKILL_MARKET_ENDPOINTS.skillQualityReviewsSave, body);
        },
        postQualityReviewsArchive(body) {
            return postJson(SKILL_MARKET_ENDPOINTS.skillQualityReviewsArchive, body);
        },
        /**
         * 运营看板 Excel：前端自行解析；公司侧仅预览+下载 JSON。扶摇看板只读 `overview`，此处不调后端上传。
         */
        async postDashboardImportExcel(file, system, statDate) {
            void file;
            void system;
            void statDate;
            return { code: 0, message: 'success', data: { ok: true } };
        },
        /**
         * - **公司系统**：不请求后端；只读打包的 `src/mock/opsDashboardCompanyDefault.json`（替换文件后需重新 dev/build）。
         * - **扶摇**：`GET /api/dashboard/overview?system=fuyao`（§3.3.13）再映射为 `OpsDashboardBundle`。
         */
        async fetchOpsDashboardUi(system) {
            if (system === 'company') {
                return { code: 0, message: 'success', data: readOpsDashboardBundleFromJson('company') };
            }
            const env = await get(`${SKILL_MARKET_ENDPOINTS.dashboardOverview}${toSearchParams({ system: 'fuyao' })}`);
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

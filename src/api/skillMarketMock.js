function nowText() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
function bumpPatchVersion(current) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim());
    if (!m) {
        return `${current}-next`;
    }
    return `${Number(m[1])}.${Number(m[2])}.${Number(m[3]) + 1}`;
}
function matchesScope(skill, scope) {
    if (scope === 'all') {
        return true;
    }
    if (scope === 'personal') {
        return (skill.tagOrg.includes('个人') ||
            skill.level.includes('个人') ||
            skill.publisher.includes('个人') ||
            Boolean(skill.ownedByUser));
    }
    if (scope === 'devDept') {
        return (skill.tagOrg.includes('开发部') ||
            skill.level.includes('开发部') ||
            skill.tagFunctional.includes('开发'));
    }
    if (scope === 'pdu') {
        return skill.tagOrg.includes('PDU') || skill.level.includes('PDU');
    }
    return skill.tagOrg.includes('产品线') || skill.level.includes('产品线');
}
function latestEntry(skill) {
    return (skill.versions.find((v) => v.version === skill.version) ??
        skill.versions[skill.versions.length - 1] ?? {
        version: skill.version,
        publishTime: skill.latestPublishTime,
    });
}
function toZipFileName(skill) {
    const entry = latestEntry(skill);
    return entry.packageFileName ?? `${skill.name}-v${skill.version}.zip`;
}
export function listSkillsApi(database, query = {}) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 8);
    const keyword = query.keyword?.trim().toLowerCase();
    const scope = query.scope ?? 'all';
    let list = database.filter((skill) => matchesScope(skill, scope));
    if (keyword) {
        list = list.filter((skill) => skill.name.toLowerCase().includes(keyword));
    }
    list = [...list].sort((a, b) => a.latestPublishTime === b.latestPublishTime ? 0 : a.latestPublishTime < b.latestPublishTime ? 1 : -1);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return {
        list: list.slice(start, start + pageSize),
        total,
        page: safePage,
        pageSize,
        totalPages,
    };
}
export function uploadSkillApi(database, payload) {
    const name = payload.name.trim();
    if (!name) {
        throw new Error('Skill 名称不能为空');
    }
    const publishTime = nowText();
    const publisher = payload.publisher?.trim() || payload.userId?.trim() || '当前用户';
    const fileName = payload.file?.name || `${name}.zip`;
    const fileSize = payload.file?.size ?? 0;
    const existing = database.find((skill) => skill.name === name);
    if (existing) {
        const version = bumpPatchVersion(existing.version);
        existing.versions = [
            ...existing.versions,
            {
                version,
                publishTime,
                note: payload.note,
                packageFileName: fileName,
                packageSize: fileSize,
                packageBlob: payload.file ?? undefined,
            },
        ];
        existing.version = version;
        existing.latestPublishTime = publishTime;
        existing.publisher = publisher;
        existing.ownedByUser = true;
        return { created: false, skill: existing };
    }
    const version = '1.0.0';
    const skill = {
        id: `${Date.now()}`,
        name,
        icon: '📦',
        publisher,
        latestPublishTime: publishTime,
        level: payload.scopeLabel ?? '个人',
        downloads: 0,
        rating: 5,
        version,
        versions: [
            {
                version,
                publishTime,
                note: payload.note ?? '首次发布',
                packageFileName: fileName,
                packageSize: fileSize,
                packageBlob: payload.file ?? undefined,
            },
        ],
        ownedByUser: true,
        tagFunctional: payload.tagFunctional ?? '通用',
        tagOrg: payload.scopeLabel ?? '个人',
    };
    database.unshift(skill);
    return { created: true, skill };
}
export function downloadSkillApi(database, skillId) {
    const skill = database.find((item) => item.id === skillId);
    if (!skill) {
        throw new Error('Skill 不存在');
    }
    skill.downloads += 1;
    const fileName = toZipFileName(skill);
    const entry = latestEntry(skill);
    const content = JSON.stringify({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        publishTime: skill.latestPublishTime,
        mock: true,
    }, null, 2);
    return {
        blob: entry.packageBlob ?? new Blob([content], { type: 'application/zip' }),
        fileName,
        skill,
    };
}

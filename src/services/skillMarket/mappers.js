const CATEGORY_BY_GROUP = {
    作业类: 'task-software-dev',
    业务类: 'domain-database',
    工具类: 'utility-doc',
};
const GROUP_BY_CATEGORY_PREFIX = [
    { prefix: 'task-', group: '作业类' },
    { prefix: 'domain-', group: '业务类' },
    { prefix: 'utility-', group: '工具类' },
];
export function categoryGroupNameFromCategory(category) {
    for (const row of GROUP_BY_CATEGORY_PREFIX) {
        if (category.startsWith(row.prefix)) {
            return row.group;
        }
    }
    return '工具类';
}
export function defaultCategoryCodeFromGroup(group) {
    if (!group) {
        return 'utility-doc';
    }
    return CATEGORY_BY_GROUP[group] ?? 'utility-doc';
}
export function stableNumericId(skill) {
    const raw = skill.id?.trim();
    if (raw && /^\d+$/.test(raw)) {
        return Number(raw);
    }
    let h = 0;
    const key = skill.skill_id || skill.name || 'skill';
    for (let i = 0; i < key.length; i++) {
        h = (h * 31 + key.charCodeAt(i)) | 0;
    }
    return Math.abs(h) + 10_000;
}
export function skillToListRecord(skill, updatedAt) {
    const group = skill.tagFunctional ?? categoryGroupNameFromCategory('');
    const category = defaultCategoryCodeFromGroup(skill.tagFunctional);
    const likes = Math.max(0, Math.floor((skill.download_count ?? skill.downloads ?? 0) * 0.05));
    const dislikes = Math.max(0, Math.floor(likes * 0.08));
    return {
        id: stableNumericId(skill),
        name: skill.name ?? skill.skill_id,
        description: skill.description,
        author: skill.publish_name ?? skill.publisher ?? '',
        version: skill.version ?? '1.0.0',
        category,
        categoryGroupName: group,
        tags: skill.tags ?? [],
        level: skill.publish_level ?? skill.level ?? '个人级',
        status: skill.marketStatus ?? skill.publish_level ?? skill.level ?? '个人级',
        orgName: skill.tagOrg?.includes('组织') ? skill.publish_name : null,
        downloads: skill.download_count ?? skill.downloads ?? 0,
        likes,
        dislikes,
        rating: skill.rating ?? 4.5,
        qualityMark: (skill.rating ?? 0) >= 4.7 ? '优秀 Skill' : null,
        qualityBadges: (skill.rating ?? 0) >= 4.7 ? ['优秀 Skill', '高分 Skill'] : [],
        scored: (skill.rating ?? 0) > 0,
        updatedAt,
    };
}
export function skillListQueryToDto(query) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 8);
    let level;
    if (query.scope === 'personal') {
        level = '个人级';
    }
    else if (query.scope === 'devDept' || query.scope === 'pdu' || query.scope === 'productLine') {
        level = '组织级';
    }
    return {
        keyword: query.keyword,
        level,
        pageNo: page,
        pageSize,
    };
}
export function uploadResultDtoToSkill(d) {
    const updatedAt = d.updatedAt ?? d.createdAt;
    return apiRecordToSkill({
        id: d.skillId,
        name: d.name,
        description: d.description,
        author: d.ownerName,
        version: d.version,
        category: d.category,
        categoryGroupName: d.categoryGroupName,
        tags: d.tags,
        level: d.level,
        status: d.status,
        orgName: d.orgName,
        downloads: d.downloads,
        likes: 0,
        dislikes: 0,
        rating: 4.5,
        qualityMark: null,
        qualityBadges: [],
        scored: false,
        updatedAt,
    });
}
export function skillDetailDtoToSkill(d) {
    return apiRecordToSkill({
        id: d.id,
        name: d.name,
        description: d.description,
        author: d.author,
        version: d.version,
        category: d.category,
        categoryGroupName: d.categoryGroupName,
        tags: d.tags,
        level: d.level,
        status: d.status,
        orgName: d.orgName,
        downloads: d.downloads,
        likes: d.likes,
        dislikes: d.dislikes,
        rating: d.rating,
        qualityMark: d.qualityMark,
        qualityBadges: d.qualityBadges,
        scored: d.qualityBadges.length > 0,
        updatedAt: d.lastReviewedAt ?? '',
    });
}
function departmentPathFromRecord(rec) {
    const parts = [
        rec.department_l1,
        rec.department_l2,
        rec.department_l3,
        rec.department_l4,
        rec.department_l5,
        rec.department_l6,
    ]
        .map((s) => (s ?? '').trim())
        .filter(Boolean);
    return parts.join('/');
}
export function apiRecordToSkill(rec) {
    const deptPath = departmentPathFromRecord(rec);
    const orgLabel = (rec.orgName ?? '').trim() || (rec.author ?? '').trim();
    return {
        skill_id: rec.name,
        description: rec.description,
        publish_name: orgLabel,
        publish_level: rec.level,
        owner_list: '[]',
        download_count: rec.downloads,
        dept_name: deptPath || orgLabel,
        id: String(rec.id),
        name: rec.name,
        icon: '📦',
        publisher: rec.author,
        latestPublishTime: rec.updatedAt,
        level: rec.level,
        downloads: rec.downloads,
        rating: rec.rating,
        version: rec.version,
        versions: [
            {
                version: rec.version,
                publishTime: rec.updatedAt,
                note: '来自接口',
                packageFileName: `${rec.name}-v${rec.version}.zip`,
                packageSize: 0,
            },
        ],
        ownedByUser: false,
        marketStatus: rec.status,
        tagFunctional: rec.categoryGroupName,
        tagOrg: rec.level,
        tags: rec.tags ?? [],
    };
}
/** `GET /api/skills/my` 列表行 → 前端 Skill（标记为当前用户发布） */
export function apiMyRecordToSkill(rec) {
    return {
        ...apiRecordToSkill(rec),
        ownedByUser: true,
        marketStatus: rec.status,
    };
}
/** `POST /api/skills/{id}/download` 响应合并到前端 `Skill`（用于列表与详情下载量展示） */
export function mergeSkillFromSkillDownloadDto(prev, d) {
    const downloads = d.downloads;
    if (!prev) {
        return {
            skill_id: String(d.skillId),
            id: String(d.skillId),
            name: d.name,
            version: d.version,
            download_count: downloads,
            downloads,
            description: '',
            publish_name: '',
            publish_level: '',
            owner_list: '[]',
            dept_name: '',
            tags: [],
        };
    }
    return {
        ...prev,
        name: d.name || prev.name,
        version: d.version || prev.version,
        download_count: downloads,
        downloads,
    };
}

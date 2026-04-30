import * as XLSX from 'xlsx';
const REQUIRED_HEADERS = [
    'skill_id',
    'description',
    'publish_name',
    'publish_level',
    'owner_list',
    'download_count',
    'dept_name',
];
function normHeader(cell) {
    return String(cell ?? '')
        .trim()
        .toLowerCase()
        .replace(/\uFEFF/g, '');
}
/** 解析「部门1/子部门/…」层级为各段名称 */
export function parseDeptNamePath(raw) {
    const segs = raw
        .split(/[/\\]/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (segs.length === 0) {
        return ['未填写部门'];
    }
    return segs;
}
function insertPath(root, segments, skillRow) {
    let node = root;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!node.children.has(seg)) {
            node.children.set(seg, {
                name: seg,
                skillRows: [],
                children: new Map(),
            });
        }
        node = node.children.get(seg);
        node.skillRows.push(skillRow);
    }
}
function sortSkillRows(rows) {
    return [...rows].sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));
}
function buildTopSkills(rows, limit = 5) {
    return sortSkillRows(rows)
        .slice(0, limit)
        .map((row) => ({
        name: row.name,
        downloads: row.downloads,
    }));
}
function finalizeNode(node, parentPath = '', levelNo = 1) {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    const childList = [...node.children.values()].map((child) => finalizeNode(child, path, levelNo + 1));
    const downloads = node.skillRows.reduce((a, c) => a + c.downloads, 0);
    const sortedChildren = childList.length > 0
        ? childList.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads)
        : undefined;
    return {
        name: node.name,
        path,
        levelNo,
        skills: node.skillRows.length,
        downloads,
        skillRows: sortSkillRows(node.skillRows),
        topSkills: buildTopSkills(node.skillRows),
        children: sortedChildren,
    };
}
function buildDeptForestFromRows(rows) {
    const root = {
        name: '',
        skillRows: [],
        children: new Map(),
    };
    for (const row of rows) {
        const segments = parseDeptNamePath(row.deptName);
        insertPath(root, segments, toSkillDetailRow(row));
    }
    const forest = [...root.children.values()].map((node) => finalizeNode(node));
    forest.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
    return forest;
}
function parseOwner(raw, fallback) {
    try {
        const parsed = JSON.parse(raw);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        if (first && typeof first === 'object') {
            const record = first;
            const owner = String(record.lastName ?? record.lastNmae ?? record.name ?? record.owner ?? fallback ?? '').trim();
            const account = String(record.Account ?? record.account ?? '').trim();
            return {
                owner: owner || fallback || '未填写发布人',
                account: account || undefined,
            };
        }
    }
    catch {
        // owner_list is controlled by upstream exports and may be empty or non-JSON.
    }
    return { owner: fallback || '未填写发布人' };
}
function toSkillDetailRow(row) {
    const owner = parseOwner(row.ownerListRaw, row.publishName);
    return {
        name: row.skillId,
        description: row.description || '暂无描述',
        owner: owner.owner,
        downloads: row.downloadCount,
        publishLevel: row.publishLevel || '未填写层级',
        publishName: row.publishName || '未填写发布方',
        dept: row.deptName.trim() || '未填写部门',
        account: owner.account,
    };
}
function isOrgLevel(row) {
    return row.publishLevel.trim().includes('组织');
}
function isPersonalLevel(row) {
    return row.publishLevel.trim().includes('个人');
}
function collectDeptNodeCount(nodes) {
    return nodes.reduce((sum, node) => sum + 1 + collectDeptNodeCount(node.children ?? []), 0);
}
export function parseOpsExcelBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('Excel 中没有工作表');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
    });
    if (!rows.length) {
        return [];
    }
    const headerRow = rows[0].map((c) => normHeader(c));
    const col = {};
    for (const req of REQUIRED_HEADERS) {
        const idx = headerRow.indexOf(req);
        if (idx < 0) {
            throw new Error(`缺少列：${req}（请使用首行英文列名）`);
        }
        col[req] = idx;
    }
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const line = rows[r];
        if (!line || line.every((c) => String(c ?? '').trim() === '')) {
            continue;
        }
        const skillId = String(line[col.skill_id] ?? '').trim();
        if (!skillId) {
            continue;
        }
        const dlRaw = line[col.download_count];
        const downloadCount = typeof dlRaw === 'number' && Number.isFinite(dlRaw)
            ? dlRaw
            : Number.parseInt(String(dlRaw ?? '').replace(/,/g, '').trim(), 10);
        out.push({
            skillId,
            description: String(line[col.description] ?? '').trim(),
            publishName: String(line[col.publish_name] ?? '').trim(),
            publishLevel: String(line[col.publish_level] ?? '').trim(),
            ownerListRaw: String(line[col.owner_list] ?? '').trim(),
            deptName: String(line[col.dept_name] ?? '').trim(),
            downloadCount: Number.isFinite(downloadCount) ? downloadCount : 0,
        });
    }
    return out;
}
export function buildOpsDashboardBundle(rows) {
    const totalSkills = rows.length;
    const personalSkills = rows.filter(isPersonalLevel).length;
    const totalDownloads = rows.reduce((s, r) => s + r.downloadCount, 0);
    const deptTree = buildDeptForestFromRows(rows);
    const orgLevelRows = rows.filter(isOrgLevel);
    const activeSkills = orgLevelRows.length;
    const companyDownloads = orgLevelRows.reduce((s, r) => s + r.downloadCount, 0);
    const orgAgg = new Map();
    for (const r of orgLevelRows) {
        const deptPath = parseDeptNamePath(r.deptName);
        const key = r.publishName.trim() || deptPath[deptPath.length - 1] || '未填写组织';
        const cur = orgAgg.get(key) ?? { skills: 0, downloads: 0, skillRows: [] };
        cur.skills += 1;
        cur.downloads += r.downloadCount;
        cur.skillRows.push(toSkillDetailRow(r));
        orgAgg.set(key, cur);
    }
    const orgBars = [...orgAgg.entries()]
        .map(([name, v]) => {
        const skillRows = sortSkillRows(v.skillRows);
        return {
            name,
            skills: v.skills,
            downloads: v.downloads,
            skillRows,
            topSkills: buildTopSkills(skillRows),
        };
    })
        .sort((a, b) => b.downloads - a.downloads || b.skills - a.skills);
    const sortedTop = [...rows].sort((a, b) => b.downloadCount - a.downloadCount);
    const topSkills = sortedTop.slice(0, 6).map((r, i) => ({
        ...toSkillDetailRow(r),
        rank: i + 1,
    }));
    return {
        kpi: {
            totalSkills: String(totalSkills),
            activeSkills: String(activeSkills),
            personalSkills: String(personalSkills),
            totalDownloads: String(totalDownloads),
            companyDownloads: String(companyDownloads),
            deptCount: String(collectDeptNodeCount(deptTree)),
            orgCount: String(orgBars.length),
        },
        deptTree,
        orgBars,
        topSkills,
    };
}

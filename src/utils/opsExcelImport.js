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
function insertPath(root, segments, downloads) {
    let node = root;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!node.children.has(seg)) {
            node.children.set(seg, {
                name: seg,
                leafSkills: 0,
                leafDownloads: 0,
                children: new Map(),
            });
        }
        node = node.children.get(seg);
        if (i === segments.length - 1) {
            node.leafSkills += 1;
            node.leafDownloads += downloads;
        }
    }
}
function finalizeNode(node) {
    const childList = [...node.children.values()].map(finalizeNode);
    const childSkills = childList.reduce((a, c) => a + c.skills, 0);
    const childDownloads = childList.reduce((a, c) => a + c.downloads, 0);
    const sortedChildren = childList.length > 0
        ? childList.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads)
        : undefined;
    return {
        name: node.name,
        skills: node.leafSkills + childSkills,
        downloads: node.leafDownloads + childDownloads,
        children: sortedChildren,
    };
}
function buildDeptForestFromRows(rows) {
    const root = {
        name: '',
        leafSkills: 0,
        leafDownloads: 0,
        children: new Map(),
    };
    for (const row of rows) {
        const segments = parseDeptNamePath(row.deptName);
        insertPath(root, segments, row.downloadCount);
    }
    const forest = [...root.children.values()].map(finalizeNode);
    forest.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
    return forest;
}
/** 带完整路径扁平化（用于组织架构条形图 TOP） */
function flattenDeptTree(nodes, prefix = '') {
    const out = [];
    for (const n of nodes) {
        const pathLabel = prefix ? `${prefix}/${n.name}` : n.name;
        out.push({
            name: pathLabel,
            skills: n.skills,
            downloads: n.downloads,
        });
        if (n.children && n.children.length > 0) {
            out.push(...flattenDeptTree(n.children, pathLabel));
        }
    }
    return out;
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
    const personalSkills = rows.filter((r) => r.publishLevel.includes('个人')).length;
    const totalDownloads = rows.reduce((s, r) => s + r.downloadCount, 0);
    const activeSkills = rows.filter((r) => r.downloadCount > 0).length;
    const deptTree = buildDeptForestFromRows(rows);
    const flatForBars = flattenDeptTree(deptTree);
    flatForBars.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
    const orgBars = flatForBars.slice(0, 8);
    const sortedTop = [...rows].sort((a, b) => b.downloadCount - a.downloadCount);
    const topSkills = sortedTop.slice(0, 6).map((r, i) => ({
        rank: i + 1,
        name: r.description || r.skillId,
        dept: r.deptName.trim() || '未填写部门',
        downloads: r.downloadCount,
    }));
    return {
        kpi: {
            totalSkills: String(totalSkills),
            activeSkills: String(activeSkills),
            personalSkills: String(personalSkills),
            totalDownloads: String(totalDownloads),
        },
        deptTree,
        orgBars,
        topSkills,
    };
}

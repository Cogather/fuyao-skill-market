import * as XLSX from 'xlsx';

export type DeptTreeNode = {
  name: string;
  skills: number;
  downloads: number;
  children?: DeptTreeNode[];
};

export type OpsExcelRow = {
  skillId: string;
  description: string;
  publishName: string;
  publishLevel: string;
  ownerListRaw: string;
  downloadCount: number;
  deptName: string;
};

export type OpsDashboardBundle = {
  kpi: {
    totalSkills: string;
    activeSkills: string;
    personalSkills: string;
    totalDownloads: string;
  };
  deptTree: DeptTreeNode[];
  orgBars: { name: string; skills: number; downloads: number }[];
  topSkills: { rank: number; name: string; dept: string; downloads: number }[];
};

const REQUIRED_HEADERS = [
  'skill_id',
  'description',
  'publish_name',
  'publish_level',
  'owner_list',
  'download_count',
  'dept_name',
] as const;

function normHeader(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '');
}

/** 解析「部门1/子部门/…」层级为各段名称 */
export function parseDeptNamePath(raw: string): string[] {
  const segs = raw
    .split(/[/\\]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segs.length === 0) {
    return ['未填写部门'];
  }
  return segs;
}

type MutableNode = {
  name: string;
  leafSkills: number;
  leafDownloads: number;
  children: Map<string, MutableNode>;
};

function insertPath(root: MutableNode, segments: string[], downloads: number): void {
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
    node = node.children.get(seg)!;
    if (i === segments.length - 1) {
      node.leafSkills += 1;
      node.leafDownloads += downloads;
    }
  }
}

function finalizeNode(node: MutableNode): DeptTreeNode {
  const childList = [...node.children.values()].map(finalizeNode);
  const childSkills = childList.reduce((a, c) => a + c.skills, 0);
  const childDownloads = childList.reduce((a, c) => a + c.downloads, 0);
  const sortedChildren =
    childList.length > 0
      ? childList.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads)
      : undefined;
  return {
    name: node.name,
    skills: node.leafSkills + childSkills,
    downloads: node.leafDownloads + childDownloads,
    children: sortedChildren,
  };
}

function buildDeptForestFromRows(rows: OpsExcelRow[]): DeptTreeNode[] {
  const root: MutableNode = {
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

export function parseOpsExcelBuffer(buffer: ArrayBuffer): OpsExcelRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel 中没有工作表');
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (!rows.length) {
    return [];
  }

  const headerRow = rows[0].map((c) => normHeader(c));
  const col: Record<(typeof REQUIRED_HEADERS)[number], number> = {} as Record<
    (typeof REQUIRED_HEADERS)[number],
    number
  >;

  for (const req of REQUIRED_HEADERS) {
    const idx = headerRow.indexOf(req);
    if (idx < 0) {
      throw new Error(`缺少列：${req}（请使用首行英文列名）`);
    }
    col[req] = idx;
  }

  const out: OpsExcelRow[] = [];
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
    const downloadCount =
      typeof dlRaw === 'number' && Number.isFinite(dlRaw)
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

export function buildOpsDashboardBundle(rows: OpsExcelRow[]): OpsDashboardBundle {
  const totalSkills = rows.length;
  const personalSkills = rows.filter((r) => r.publishLevel.includes('个人')).length;
  const totalDownloads = rows.reduce((s, r) => s + r.downloadCount, 0);
  const activeSkills = rows.filter((r) => r.downloadCount > 0).length;

  const deptTree = buildDeptForestFromRows(rows);

  const orgLevelRows = rows.filter((r) => r.publishLevel.trim() === '组织级');
  const orgAgg = new Map<string, { skills: number; downloads: number }>();
  for (const r of orgLevelRows) {
    const key = r.deptName.trim() || '未填写部门';
    const cur = orgAgg.get(key) ?? { skills: 0, downloads: 0 };
    cur.skills += 1;
    cur.downloads += r.downloadCount;
    orgAgg.set(key, cur);
  }

  const orgBars = [...orgAgg.entries()].map(([name, v]) => ({
    name,
    skills: v.skills,
    downloads: v.downloads,
  }));

  const sortedTop = [...rows].sort((a, b) => b.downloadCount - a.downloadCount);
  const topSkills = sortedTop.slice(0, 6).map((r, i) => ({
    rank: i + 1,
    name: r.skillId,
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

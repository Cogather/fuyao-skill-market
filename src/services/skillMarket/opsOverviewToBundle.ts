import type { DashboardOverviewDto } from './apiTypes';
import type { DeptTreeNode, OpsDashboardBundle, OpsSkillDetailRow } from '../../utils/opsExcelImport';

/**
 * 将设计文档 §3.3.13 `GET /api/dashboard/overview` 的 `data` 映射为运营看板页使用的 `OpsDashboardBundle`。
 * 公司系统看板若走后端 JSON 聚合接口（`/api/dashboard/ops-ui`），则无需经过本函数。
 */
function mapDeptTree(nodes: DashboardOverviewDto['deptTree']): DeptTreeNode[] {
  return (nodes ?? []).map((n) => ({
    name: n.deptName,
    path: n.deptName,
    levelNo: n.deptLevel,
    skills: n.totalSkills,
    downloads: n.downloads,
    skillRows: [],
    topSkills: [],
    children: mapDeptTree(n.children as DashboardOverviewDto['deptTree']),
  }));
}

export function dashboardOverviewToOpsBundle(d: DashboardOverviewDto): OpsDashboardBundle {
  const k = d.kpis;
  const rankings = d.rankings ?? [];
  const top: (OpsSkillDetailRow & { rank: number })[] = (d.topSkills ?? []).map((t, i) => ({
    name: t.name,
    description: '',
    owner: '',
    downloads: t.downloads,
    publishLevel: '组织级',
    publishName: '',
    dept: '',
    rank: i + 1,
  }));
  return {
    kpis: {
      totalSkills: String(k.totalSkills),
      /** 与扶摇看板文案一致：已同步至公司侧、按组织发布的组织级 Skill 数；后端应对齐 `verifiedSkillCount` 语义 */
      activeSkills: String(k.verifiedSkillCount),
      personalSkills: String(k.personalSkillCount),
      totalDownloads: String(k.downloads),
      companyDownloads: String(Math.floor(k.downloads * 0.4)),
      deptCount: String(d.deptTree?.length ?? 0),
      orgCount: String(rankings.length),
    },
    deptTree: mapDeptTree(d.deptTree ?? []),
    orgBars: rankings.map((r) => ({
      name: r.name,
      skills: r.totalSkills,
      downloads: r.downloads,
      skillRows: [],
      topSkills: [],
    })),
    topSkills: top,
  };
}

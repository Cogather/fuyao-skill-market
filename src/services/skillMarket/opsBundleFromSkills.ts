import type { Skill } from '../../types/skill';
import type { OpsExcelRow } from '../../utils/opsExcelImport';

/** 将市场 `Skill` 转为运营管理 Excel 行模型，复用 `buildOpsDashboardBundle` 聚合逻辑 */
export function marketSkillsToOpsExcelRows(skills: Skill[]): OpsExcelRow[] {
  return skills.map((s) => ({
    skillId: String(s.name ?? s.skill_id ?? s.id ?? '').trim() || '未命名 Skill',
    description: String(s.description ?? ''),
    publishName: String(s.publish_name ?? ''),
    publishLevel: String(s.publish_level ?? ''),
    ownerListRaw: String(s.owner_list ?? ''),
    downloadCount: Number(s.download_count ?? s.downloads ?? 0),
    deptName: String(s.dept_name ?? ''),
  }));
}

import type { Skill } from '../../../types/skill';
import type { SkillFileTreeField, SkillVersionListItemDto } from '../apiTypes';
import { stableNumericId } from '../mappers';

const DEFAULT_VERSION_LIST_FILE_TREE: string[] = ['SKILL.md', 'README.md', 'scripts/main.py'];

type SkillWithPackage = Skill & { packagePath?: string };

function versionListFileTree(skill: Skill): SkillFileTreeField {
  const ft = skill.fileTree;
  if (ft != null) {
    if (typeof ft === 'string' && ft.trim()) {
      return ft;
    }
    if (Array.isArray(ft) && ft.length > 0) {
      return ft.map((x) => String(x));
    }
  }
  return [...DEFAULT_VERSION_LIST_FILE_TREE];
}

/**
 * 将内存中的 `Skill`（含 `versions`、可选 `unpublished`）转为接口约定的版本列表行。
 * 供 `skillBaseServiceMock` 与 `skillMarketMockClient` 共用，避免双份映射漂移。
 */
export function mapSkillVersionsToListDto(skill: Skill): SkillVersionListItemDto[] {
  const sidNum = Number(skill.id);
  const skillIdForRow =
    Number.isFinite(sidNum) && sidNum > 0 ? sidNum : stableNumericId(skill);
  const ft = versionListFileTree(skill);
  const md = typeof skill.skillMdContent === 'string' ? skill.skillMdContent : '';
  const name = skill.name ?? skill.skill_id ?? String(skillIdForRow);
  const pp = String((skill as SkillWithPackage).packagePath ?? '').trim();
  return (skill.versions ?? []).map((v, ix) => {
    const unpublished = Boolean((v as { unpublished?: boolean }).unpublished);
    const vf = (v as { packageFileName?: string }).packageFileName;
    const packagePath =
      typeof vf === 'string' && vf.trim().length > 0
        ? `fuyao/skills/${name}/${v.version}/${vf}`
        : pp || `fuyao/skills/${name}/${v.version}/skill.zip`;
    return {
      id: Number(skillIdForRow) * 10_000 + ix,
      skillId: skillIdForRow,
      version: v.version,
      packagePath,
      skillMdContent: md,
      fileTree: ft,
      createBy:
        (v as { publisher?: string }).publisher ??
        skill.publisher ??
        skill.publish_name ??
        '',
      createdAt: v.publishTime,
      deleted: unpublished ? 1 : 0,
    };
  });
}

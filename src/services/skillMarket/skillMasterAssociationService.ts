export interface SkillMasterAssociation {
  skillId: string;
  sceneIds: string[];
  activityIds: string[];
  planningDepartments: string[];
  updatedAt: string;
}

export type SkillMasterAssociationPayload = Omit<SkillMasterAssociation, 'updatedAt'>;

const STORAGE_KEY = 'skill-market-master-associations-v1';

const defaultAssociations: SkillMasterAssociation[] = [
  {
    skillId: 'skill-master-1001',
    sceneIds: ['scene-api-dev', 'scene-contract'],
    activityIds: ['sub-activity-api', 'sub-activity-contract'],
    planningDepartments: ['研发效能部', '联调工具部'],
    updatedAt: '2026-07-18T09:00:00.000Z',
  },
  {
    skillId: 'skill-master-1002',
    sceneIds: ['scene-test-design'],
    activityIds: ['sub-activity-case'],
    planningDepartments: ['质量工具组'],
    updatedAt: '2026-07-18T09:10:00.000Z',
  },
  {
    skillId: 'skill-master-1003',
    sceneIds: ['scene-log'],
    activityIds: ['sub-activity-locate'],
    planningDepartments: ['平台稳定部'],
    updatedAt: '2026-07-18T09:20:00.000Z',
  },
  {
    skillId: 'skill-master-1004',
    sceneIds: ['scene-risk-track'],
    activityIds: ['sub-activity-weekly'],
    planningDepartments: ['项目管理部'],
    updatedAt: '2026-07-18T09:30:00.000Z',
  },
];

let memoryAssociations: SkillMasterAssociation[] | null = null;

function normalizeValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function normalizeAssociation(value: unknown): SkillMasterAssociation {
  const record =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return {
    skillId: String(record.skillId ?? '').trim(),
    sceneIds: normalizeValues(record.sceneIds),
    activityIds: normalizeValues(record.activityIds),
    planningDepartments: normalizeValues(record.planningDepartments),
    updatedAt: String(record.updatedAt ?? '').trim(),
  };
}

function cloneAssociation(value: SkillMasterAssociation): SkillMasterAssociation {
  return {
    ...value,
    sceneIds: [...value.sceneIds],
    activityIds: [...value.activityIds],
    planningDepartments: [...value.planningDepartments],
  };
}

function readAssociations(): SkillMasterAssociation[] {
  if (memoryAssociations) return memoryAssociations;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryAssociations = parsed.map(normalizeAssociation).filter((item) => item.skillId);
        return memoryAssociations;
      }
    } catch {
      // Invalid local data falls back to the defaults.
    }
  }
  memoryAssociations = defaultAssociations.map(cloneAssociation);
  return memoryAssociations;
}

function persistAssociations(values: SkillMasterAssociation[]): void {
  memoryAssociations = values;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }
}

export function getSkillMasterAssociation(skillId: string): SkillMasterAssociation {
  const normalizedSkillId = skillId.trim();
  const existing = readAssociations().find((item) => item.skillId === normalizedSkillId);
  return existing
    ? cloneAssociation(existing)
    : {
        skillId: normalizedSkillId,
        sceneIds: [],
        activityIds: [],
        planningDepartments: [],
        updatedAt: '',
      };
}

export function saveSkillMasterAssociation(
  payload: SkillMasterAssociationPayload,
): SkillMasterAssociation {
  const association: SkillMasterAssociation = {
    skillId: payload.skillId.trim(),
    sceneIds: normalizeValues(payload.sceneIds),
    activityIds: normalizeValues(payload.activityIds),
    planningDepartments: normalizeValues(payload.planningDepartments),
    updatedAt: new Date().toISOString(),
  };
  if (!association.skillId) throw new Error('未找到需要关联的 Skill');

  const values = readAssociations();
  const index = values.findIndex((item) => item.skillId === association.skillId);
  if (index >= 0) values.splice(index, 1, association);
  else values.unshift(association);
  persistAssociations(values);
  return cloneAssociation(association);
}

export function removeSkillMasterAssociation(skillId: string): void {
  persistAssociations(readAssociations().filter((item) => item.skillId !== skillId.trim()));
}

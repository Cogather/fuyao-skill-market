import type {
  Skill,
  SkillListQuery,
  SkillListResponse,
  SkillMarketScope,
  SkillUploadPayload,
  SkillUploadResponse,
  SkillVersionEntry,
} from '../types/skill';

function nowText(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
}

function bumpPatchVersion(current: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim());
  if (!m) {
    return `${current}-next`;
  }
  return `${Number(m[1])}.${Number(m[2])}.${Number(m[3]) + 1}`;
}

function skillName(skill: Skill): string {
  return skill.name ?? skill.skill_id;
}

function skillVersion(skill: Skill): string {
  return skill.version ?? '1.0.0';
}

function skillPublishTime(skill: Skill): string {
  return skill.latestPublishTime ?? '';
}

export function matchesScope(skill: Skill, scope: SkillMarketScope): boolean {
  if (scope === 'all') {
    return true;
  }
  if (scope === 'personal') {
    return (
      (skill.publish_level ?? skill.level ?? skill.tagOrg ?? '').includes('个人') ||
      (skill.publish_name ?? skill.publisher ?? '').includes('个人') ||
      Boolean(skill.ownedByUser)
    );
  }
  if (scope === 'devDept') {
    return (skill.publish_level ?? '').trim() === '组织级';
  }
  if (scope === 'pdu') {
    return (skill.publish_name ?? skill.tagOrg ?? skill.level ?? '').includes('PDU');
  }
  return (skill.publish_name ?? skill.tagOrg ?? skill.level ?? '').includes('产品线');
}

function latestEntry(skill: Skill): SkillVersionEntry {
  const versions = skill.versions ?? [];
  return (
    versions.find((v) => v.version === skill.version) ??
    versions[versions.length - 1] ?? {
      version: skillVersion(skill),
      publishTime: skillPublishTime(skill),
    }
  );
}

function toZipFileName(skill: Skill, versionOverride?: string): string {
  const entry = versionOverride?.trim()
    ? (skill.versions ?? []).find((v) => v.version === versionOverride.trim()) ?? latestEntry(skill)
    : latestEntry(skill);
  return entry.packageFileName ?? `${skillName(skill)}-v${entry.version ?? skillVersion(skill)}.zip`;
}

export function listSkillsApi(
  database: Skill[],
  query: SkillListQuery = {},
): SkillListResponse {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, query.pageSize ?? 8);
  const keyword = query.keyword?.trim().toLowerCase();
  const scope = query.scope ?? 'all';

  let list = database.filter((skill) => matchesScope(skill, scope));

  if (keyword) {
    list = list.filter((skill) =>
      [skill.skill_id, skill.description, skill.publish_name, skill.dept_name, skill.name]
        .filter((x): x is string => Boolean(x))
        .some((x) => x.toLowerCase().includes(keyword)),
    );
  }

  list = [...list].sort((a, b) =>
    skillPublishTime(a) === skillPublishTime(b)
      ? 0
      : skillPublishTime(a) < skillPublishTime(b)
        ? 1
        : -1,
  );

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

export function uploadSkillApi(
  database: Skill[],
  payload: SkillUploadPayload,
): SkillUploadResponse {
  const name = payload.name.trim();
  if (!name) {
    throw new Error('Skill 名称不能为空');
  }

  const publishTime = nowText();
  const publisher = payload.publisher?.trim() || payload.userId?.trim() || '当前用户';
  const fileName = payload.file?.name || `${name}.zip`;
  const fileSize = payload.file?.size ?? 0;
  const existing = database.find((skill) => skillName(skill) === name);

  if (existing) {
    const version = bumpPatchVersion(skillVersion(existing));
    existing.versions = [
      ...(existing.versions ?? []),
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
    existing.publish_name = publisher;
    existing.ownedByUser = true;
    return { created: false, skill: existing };
  }

  const version = '1.0.0';
  const publishLevel = payload.scopeLabel ?? '个人级';
  const skill: Skill = {
    skill_id: name,
    description: payload.note ?? '',
    publish_name: publisher,
    publish_level: publishLevel,
    owner_list: '[]',
    download_count: 0,
    dept_name: publisher,
    id: `${Date.now()}`,
    name,
    icon: '📦',
    publisher,
    latestPublishTime: publishTime,
    level: publishLevel,
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
    tagOrg: publishLevel,
    tags: '',
  };

  database.unshift(skill);
  return { created: true, skill };
}

export function downloadSkillApi(
  database: Skill[],
  skillId: string,
  pick?: { version?: string },
): {
  blob: Blob;
  fileName: string;
  skill: Skill;
} {
  const skill = database.find((item) => (item.id ?? item.skill_id) === skillId);
  if (!skill) {
    throw new Error('Skill 不存在');
  }

  const want = pick?.version?.trim();
  let entry = latestEntry(skill);
  if (want) {
    const hit = (skill.versions ?? []).find((v) => v.version === want);
    if (!hit) {
      throw new Error('指定版本不存在');
    }
    if ((hit as { unpublished?: boolean }).unpublished) {
      throw new Error('该版本已下架，无法下载');
    }
    entry = hit;
  }

  skill.download_count = (skill.download_count ?? 0) + 1;
  skill.downloads = (skill.downloads ?? 0) + 1;
  const fileName = toZipFileName(skill, want);
  const content = JSON.stringify(
    {
      id: skill.id ?? skill.skill_id,
      name: skillName(skill),
      version: entry.version ?? skillVersion(skill),
      publishTime: entry.publishTime ?? skillPublishTime(skill),
      mock: true,
    },
    null,
    2,
  );

  return {
    blob: entry.packageBlob ?? new Blob([content], { type: 'application/zip' }),
    fileName,
    skill,
  };
}

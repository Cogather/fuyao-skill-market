import { computed, inject, ref } from 'vue';
import type { Ref } from 'vue';
import { createSkillMarketClient } from '../services/skillMarket';
import type { CurrentUserRoleDto } from '../services/skillMarket/apiTypes';
import { apiMyRecordToSkill } from '../services/skillMarket/mappers';
import type { SkillDownloadOptions, SkillMarketClient } from '../services/skillMarket/skillMarketClient.types';
import type {
  Skill,
  SkillListQuery,
  SkillListResponse,
  SkillUploadPayload,
  SkillUploadResponse,
} from '../types/skill';

export function createSkillMarketStore(userId?: Ref<string>) {
  const client: SkillMarketClient = createSkillMarketClient(undefined, userId);
  const skills = client.skills;

  const myPublishedSkills = ref<Skill[]>([]);

  async function refreshMyPublishedSkills(): Promise<void> {
    const r = await client.fetchMySkills({ pageNo: 1, pageSize: 200 });
    if (r.code === 0 && r.data?.records) {
      myPublishedSkills.value = r.data.records.map(apiMyRecordToSkill);
    }
  }

  void refreshMyPublishedSkills();

  const orgCount = ref(16);
  void client.fetchOrganizations().then((r) => {
    if (r.code === 0 && Array.isArray(r.data)) {
      orgCount.value = r.data.length;
    }
  });

  const totalSkills = computed(() => skills.value.length);
  const totalDownloads = computed(() =>
    skills.value.reduce((sum, skill) => sum + (skill.download_count ?? skill.downloads ?? 0), 0),
  );
  const downloadsLast30Days = computed(() => Math.floor(totalDownloads.value * 0.1));

  const currentUserRole = ref<CurrentUserRoleDto | null>(null);

  async function refreshCurrentUserRole(): Promise<void> {
    const r = await client.fetchCurrentUserRole();
    if (r.code === 0) {
      currentUserRole.value = r.data;
    } else {
      currentUserRole.value = null;
    }
  }

  void refreshCurrentUserRole();

  function findByName(name: string): Skill | undefined {
    const normalizedName = name.trim();
    return skills.value.find((skill) => (skill.name ?? skill.skill_id) === normalizedName);
  }

  async function uploadSkill(payload: SkillUploadPayload): Promise<SkillUploadResponse> {
    return client.uploadSkill(payload);
  }

  async function listSkills(query: SkillListQuery): Promise<SkillListResponse> {
    return client.listSkills(query);
  }

  async function downloadSkill(skillId: string, options?: SkillDownloadOptions) {
    return client.downloadSkill(skillId, options);
  }

  return {
    skills,
    myPublishedSkills,
    refreshMyPublishedSkills,
    marketClient: client,
    currentUserRole,
    refreshCurrentUserRole,
    orgCount,
    totalSkills,
    totalDownloads,
    downloadsLast30Days,
    uploadSkill,
    listSkills,
    downloadSkill,
    findByName,
  };
}

export type SkillMarketStore = ReturnType<typeof createSkillMarketStore>;

let singleton: SkillMarketStore | null = null;

export function useSkillMarketStore(): SkillMarketStore {
  if (!singleton) {
    const userId = inject<Ref<string>>('userId', ref(''));
    singleton = createSkillMarketStore(userId);
  }
  return singleton;
}

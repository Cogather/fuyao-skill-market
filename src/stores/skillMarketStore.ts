import { computed, ref } from 'vue';
import {
  downloadSkillApi,
  listSkillsApi,
  uploadSkillApi,
} from '../api/skillMarketMock';
import type {
  Skill,
  SkillListQuery,
  SkillUploadPayload,
  SkillUploadResponse,
} from '../types/skill';

const MOCK_SKILLS: Skill[] = [
  {
    id: '1',
    name: 'Java 代码 Review 助手',
    icon: '💡',
    publisher: '研发一部',
    latestPublishTime: '2024-04-22 14:30',
    level: '开发部 · 终端安全开发一部',
    downloads: 8420,
    rating: 4.8,
    version: '1.2.0',
    versions: [
      {
        version: '1.2.0',
        publishTime: '2024-04-22 14:30',
        note: '初始上架',
        packageFileName: 'java-review-helper-v1.2.0.zip',
        packageSize: 164000,
      },
    ],
    tagFunctional: '开发',
    tagOrg: '开发部 · 终端安全开发一部',
  },
  {
    id: '2',
    name: 'CI/CD 故障分析 Skill',
    icon: '🔧',
    publisher: '平台工程组',
    latestPublishTime: '2024-04-21 10:12',
    level: 'PDU · 云平台',
    downloads: 6980,
    rating: 4.6,
    version: '2.0.1',
    versions: [
      {
        version: '2.0.1',
        publishTime: '2024-04-21 10:12',
        packageFileName: 'cicd-incident-analysis-v2.0.1.zip',
        packageSize: 216000,
      },
    ],
    tagFunctional: '运维',
    tagOrg: 'PDU · 云平台',
  },
  {
    id: '3',
    name: '界面设计走查 Skill',
    icon: '📋',
    publisher: '设计组',
    latestPublishTime: '2024-04-20 09:00',
    level: '开发部 · 体验设计',
    downloads: 6210,
    rating: 4.9,
    version: '1.0.3',
    versions: [
      {
        version: '1.0.3',
        publishTime: '2024-04-20 09:00',
        packageFileName: 'ui-design-review-v1.0.3.zip',
        packageSize: 122000,
      },
    ],
    tagFunctional: '设计',
    tagOrg: '开发部 · 体验设计',
  },
  {
    id: '4',
    name: '迭代周报生成 Skill',
    icon: '📑',
    publisher: '项目管理组',
    latestPublishTime: '2024-04-19 16:00',
    level: '产品线 · 唯一产品线',
    downloads: 3960,
    rating: 4.5,
    version: '1.1.0',
    versions: [
      {
        version: '1.1.0',
        publishTime: '2024-04-19 16:00',
        packageFileName: 'weekly-report-generator-v1.1.0.zip',
        packageSize: 98000,
      },
    ],
    tagFunctional: '办公',
    tagOrg: '产品线 · 唯一产品线',
  },
  {
    id: '5',
    name: '日志分析 Skill',
    icon: '📊',
    publisher: '个人',
    latestPublishTime: '2024-04-18 11:20',
    level: '个人',
    downloads: 128,
    rating: 4.2,
    version: '0.9.0',
    versions: [
      {
        version: '0.9.0',
        publishTime: '2024-04-18 11:20',
        packageFileName: 'log-analysis-v0.9.0.zip',
        packageSize: 76000,
      },
    ],
    tagFunctional: '运维',
    tagOrg: '个人',
  },
  {
    id: '6',
    name: '技术方案评审 Skill',
    icon: '📕',
    publisher: '架构组',
    latestPublishTime: '2024-04-17 09:45',
    level: '产品线 · 唯一产品线',
    downloads: 4250,
    rating: 4.7,
    version: '1.0.0',
    versions: [
      {
        version: '1.0.0',
        publishTime: '2024-04-17 09:45',
        packageFileName: 'tech-design-review-v1.0.0.zip',
        packageSize: 131000,
      },
    ],
    tagFunctional: '设计',
    tagOrg: '产品线 · 唯一产品线',
  },
];

export function createSkillMarketStore() {
  const skills = ref<Skill[]>([...MOCK_SKILLS]);

  const totalSkills = computed(() => skills.value.length);
  const totalDownloads = computed(() =>
    skills.value.reduce((sum, skill) => sum + skill.downloads, 0),
  );
  const downloadsLast30Days = computed(() => Math.floor(totalDownloads.value * 0.1));
  const orgCount = computed(() => 16);

  function findByName(name: string): Skill | undefined {
    const normalizedName = name.trim();
    return skills.value.find((skill) => skill.name === normalizedName);
  }

  function uploadSkill(payload: SkillUploadPayload): SkillUploadResponse {
    return uploadSkillApi(skills.value, payload);
  }

  function listSkills(query: SkillListQuery) {
    return listSkillsApi(skills.value, query);
  }

  function downloadSkill(skillId: string) {
    return downloadSkillApi(skills.value, skillId);
  }

  return {
    skills,
    totalSkills,
    totalDownloads,
    downloadsLast30Days,
    orgCount,
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
    singleton = createSkillMarketStore();
  }
  return singleton;
}

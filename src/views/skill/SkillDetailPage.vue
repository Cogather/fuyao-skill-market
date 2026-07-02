<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import SkillDetailDialog from '../../components/skill/SkillDetailDialog.vue';
import type { SkillDetailDto } from '../../services/skillMarket/apiTypes';
import { skillBaseService, webfrondUrl } from '../../services/skillMarket/skillBaseService';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { useProfileStore } from '../../stores/userStore';
import {
  fileTreeFromDetailDto,
  normalizeDetailFileTreeToDisplay,
} from '../../utils/skillDetailDisplay';
import type { UserInnerTab } from '../../types/skill';

const route = useRoute();
const router = useRouter();
const skillMarketStore = useSkillMarketStore();
const userStore = useProfileStore();

const innerTabAliases: Record<string, UserInnerTab> = {
  hot: 'hot',
  overview: 'overview',
  market: 'overview',
  all: 'overview',
  core: 'core',
  coreharness: 'core',
  releases: 'releases',
  publish: 'releases',
  ops: 'ops',
  org: 'org',
  approval: 'approval',
  review: 'review',
  planning: 'planning',
  skillPlanning: 'planning',
};

const loading = ref(false);
const errorText = ref('');
const toast = ref('');
const skillDetail = ref<Record<string, unknown> | null>(null);

const userId = computed(() => {
  const fromStore = String(skillMarketStore.userId ?? '').trim();
  if (fromStore) {
    return fromStore;
  }
  return String(userStore.userInfo?.w3Id ?? '').trim();
});

const routeSkillId = computed(() => {
  const raw = route.params.skillId ?? route.query.skillId;
  return Array.isArray(raw) ? String(raw[0] ?? '').trim() : String(raw ?? '').trim();
});

function routeTabFromValue(value: unknown): UserInnerTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return 'overview';
  }
  return innerTabAliases[raw] ?? innerTabAliases[raw.toLowerCase()] ?? 'overview';
}

const sourceTab = computed(() => routeTabFromValue(route.query.tab));

const fileTreeText = computed(() => normalizeDetailFileTreeToDisplay(skillDetail.value?.fileTree));
const skillMdText = computed(() =>
  typeof skillDetail.value?.skillMdContent === 'string'
    ? String(skillDetail.value.skillMdContent)
    : '',
);

function parentTargetOrigin(): string {
  return String(webfrondUrl || '*');
}

function notifyParentDetailRoute(skillId: string): void {
  if (!skillId || window.parent === window) {
    return;
  }
  window.parent.postMessage(
    {
      type: 'CHILD_DETAIL',
      view: 'detail',
      tab: sourceTab.value,
      skillId,
    },
    parentTargetOrigin(),
  );
}

function mapSkillDetailDto(dto: SkillDetailDto): Record<string, unknown> {
  const tags = Array.isArray(dto.tags) ? dto.tags.join(',') : String(dto.tags ?? '');
  const level = String(dto.level ?? dto.status ?? '').trim();
  return {
    ...dto,
    id: String(dto.id),
    skill_id: String(dto.id),
    name: dto.name,
    currentVersion: dto.version,
    version: dto.version,
    author: dto.author || dto.createdBy || '',
    categoryGroupName: dto.categoryGroupName || dto.category || '',
    tags,
    level,
    publish_level: level,
    publish_name: dto.orgName || dto.author || '',
    downloads: dto.downloads ?? 0,
    totalDownloads: dto.downloads ?? 0,
    fileTree: fileTreeFromDetailDto(dto.fileTree),
    skillMdContent: typeof dto.skillMdContent === 'string' ? dto.skillMdContent : '',
  };
}

async function loadSkillDetail(skillId: string): Promise<void> {
  if (!skillId) {
    skillDetail.value = null;
    errorText.value = '缺少 Skill ID，无法打开详情。';
    return;
  }

  loading.value = true;
  errorText.value = '';
  try {
    const res = await skillBaseService.querySkillDetail(skillId);
    if (!res?.meta?.success || !res?.data) {
      throw new Error(res?.message || res?.meta?.message || 'Skill 详情加载失败');
    }
    skillDetail.value = mapSkillDetailDto(res.data as SkillDetailDto);
    notifyParentDetailRoute(skillId);
  } catch (error) {
    skillDetail.value = null;
    errorText.value = error instanceof Error ? error.message : 'Skill 详情加载失败';
  } finally {
    loading.value = false;
  }
}

function showToast(message: string, ms = 3000): void {
  toast.value = message;
  window.setTimeout(() => {
    toast.value = '';
  }, ms);
}

async function downloadCurrentSkill(): Promise<void> {
  const id = routeSkillId.value;
  const version = String(skillDetail.value?.currentVersion ?? skillDetail.value?.version ?? '');
  if (!id) {
    return;
  }
  try {
    const params: Record<string, string> = {};
    if (userId.value) {
      params.userId = userId.value;
    }
    if (version) {
      params.version = version;
    }
    const env = await skillBaseService.downloadSkill(params, id);
    if (!env?.meta?.success || !env?.data) {
      throw new Error(env?.message || env?.meta?.message || '下载失败');
    }
    window.open(String(env.data));
    if (skillDetail.value) {
      const nextDownloads = Number(skillDetail.value.downloads ?? 0) + 1;
      skillDetail.value = {
        ...skillDetail.value,
        downloads: nextDownloads,
        totalDownloads: nextDownloads,
      };
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下载失败');
  }
}

function goBackToMarket(): void {
  void router.push({
    name: 'skill-market',
    query: {
      tab: sourceTab.value,
    },
  });
  // 通知父页面
  window.parent.postMessage(
    {
      type: 'CHILD_TAB_CHANGE',
      tab: sourceTab.value,
    },
    webfrondUrl,
  );
}

watch(
  routeSkillId,
  (skillId) => {
    void loadSkillDetail(skillId);
  },
  { immediate: true },
);
</script>

<template>
  <main class="skill-detail-page">
    <div v-if="loading" class="skill-detail-state" role="status">Skill 详情加载中...</div>

    <div v-else-if="errorText" class="skill-detail-state skill-detail-error" role="alert">
      <strong>{{ errorText }}</strong>
      <button type="button" @click="goBackToMarket">返回市场</button>
    </div>

    <SkillDetailDialog
      v-else-if="skillDetail"
      display-mode="page"
      close-text="返回市场"
      :skill="skillDetail"
      :file-tree-text="fileTreeText"
      :skill-md-text="skillMdText"
      :show-delete="false"
      :show-try-skill="false"
      :show-version-manage="false"
      @close="goBackToMarket"
      @download="downloadCurrentSkill"
    />

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>

<style scoped lang="scss">
.skill-detail-page {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background:
    linear-gradient(rgba(96, 111, 136, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96, 111, 136, 0.045) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #fbfcff 46%, #ffffff 100%);
  background-size:
    34px 34px,
    34px 34px,
    auto;
  box-sizing: border-box;
}

.skill-detail-state {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  color: #334155;
  font-size: 15px;
  font-weight: 800;
}

.skill-detail-error {
  flex-direction: column;
  text-align: center;
}

.skill-detail-error button {
  border: 1px solid #d8eaff;
  border-radius: 999px;
  background: #eef6ff;
  color: #2f7df6;
  min-height: 38px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
}

.toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  font-size: 13px;
  font-weight: 750;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import SkillDetailDialog from '../../components/skill/SkillDetailDialog.vue';
import SkillVersionManageDialog from '../../components/skill/SkillVersionManageDialog.vue';
import type { SkillDetailDto, SkillVersionListItemDto } from '../../services/skillMarket/apiTypes';
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
const versionPanelSkill = ref<Record<string, unknown> | null>(null);
const versionPanelLoading = ref(false);
const versionUnpublishing = ref<string | null>(null);
const deletingSkillId = ref<string | null>(null);
const versionPreviewSkill = ref<Record<string, unknown> | null>(null);

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
const detailFromMyReleases = computed(() => sourceTab.value === 'releases');

const fileTreeText = computed(() => normalizeDetailFileTreeToDisplay(skillDetail.value?.fileTree));
const skillMdText = computed(() =>
  typeof skillDetail.value?.skillMdContent === 'string'
    ? String(skillDetail.value.skillMdContent)
    : '',
);
const versionPreviewFileTreeText = computed(() =>
  normalizeDetailFileTreeToDisplay(versionPreviewSkill.value?.fileTree),
);
const versionPreviewSkillMdText = computed(() =>
  typeof versionPreviewSkill.value?.skillMdContent === 'string'
    ? String(versionPreviewSkill.value.skillMdContent)
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

function isVersionRowDeleted(row: SkillVersionListItemDto): boolean {
  return Number(row.deleted) === 1;
}

function versionTimeValue(row: SkillVersionListItemDto): number {
  const raw = String(row.createdAt ?? '').trim();
  if (!raw) {
    return Number.NEGATIVE_INFINITY;
  }
  const normalized = raw.includes('T') ? raw : raw.replace(/^(\d{4}-\d{1,2}-\d{1,2})\s+/, '$1T');
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function pickCurrentVersionFromRows(list: SkillVersionListItemDto[], fallback: string): string {
  const active = list.filter((row) => !isVersionRowDeleted(row));
  if (active.length === 0) {
    return fallback;
  }
  return [...active].sort((left, right) => versionTimeValue(right) - versionTimeValue(left))[0]!
    .version;
}

function currentDetailSkillId(): string {
  return String(
    skillDetail.value?.id ?? skillDetail.value?.skill_id ?? routeSkillId.value ?? '',
  ).trim();
}

function readServiceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function serviceSucceeded(value: unknown): boolean {
  const record = readServiceRecord(value);
  const meta = readServiceRecord(record.meta);
  if (typeof meta.success === 'boolean') {
    return meta.success;
  }
  const code = record.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

function serviceMessage(value: unknown, fallback: string): string {
  const record = readServiceRecord(value);
  const meta = readServiceRecord(record.meta);
  const message = meta.message ?? record.message ?? record.msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

async function handleVersionManage(): Promise<void> {
  const skill = skillDetail.value;
  const rowId = currentDetailSkillId();
  if (!skill || !rowId) {
    showToast('无法识别 Skill ID');
    return;
  }

  const currentVersion = String(skill.currentVersion ?? skill.version ?? '');
  versionPreviewSkill.value = null;
  versionPanelLoading.value = true;
  versionPanelSkill.value = {
    ...skill,
    id: rowId,
    skill_id: rowId,
    name: skill.name ?? skill.skill_id ?? rowId,
    version: currentVersion,
    versions: [],
  };

  try {
    const res = await skillBaseService.querySkillVersions(rowId);
    if (res?.meta?.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      versionPanelSkill.value = {
        ...versionPanelSkill.value,
        version: pickCurrentVersionFromRows(list, currentVersion),
        versions: list,
      };
    } else {
      showToast(res?.message || res?.meta?.message || '版本列表加载失败');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '版本列表加载失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

function closeVersionPanel(): void {
  versionPanelSkill.value = null;
  versionPreviewSkill.value = null;
  versionUnpublishing.value = null;
}

async function reloadVersionPanelList(): Promise<void> {
  const panelSkill = versionPanelSkill.value;
  if (!panelSkill) {
    return;
  }
  const id = String(panelSkill.id ?? panelSkill.skill_id ?? currentDetailSkillId()).trim();
  if (!id) {
    return;
  }

  versionPanelLoading.value = true;
  try {
    const res = await skillBaseService.querySkillVersions(id);
    if (res?.meta?.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      versionPanelSkill.value = {
        ...panelSkill,
        version: pickCurrentVersionFromRows(list, String(panelSkill.version ?? '')),
        versions: list,
      };
    } else {
      showToast(res?.message || res?.meta?.message || '版本列表刷新失败');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '版本列表刷新失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

function onVersionManageBack(): void {
  closeVersionPanel();
}

function versionPreviewStorageKey(skillId: string, version: string): string {
  return `__detail_vprev__${skillId}__${version}`;
}

function onVersionViewDetail(row: SkillVersionListItemDto): void {
  const panelSkill = versionPanelSkill.value;
  if (!panelSkill) {
    return;
  }
  const skillId = String(panelSkill.id ?? panelSkill.skill_id ?? '').trim();
  if (!skillId) {
    return;
  }
  versionPreviewSkill.value = {
    id: versionPreviewStorageKey(skillId, String(row.version)),
    skill_id: skillId,
    name: String(panelSkill.name ?? panelSkill.skill_id ?? skillId),
    currentVersion: row.version,
    version: row.version,
    author: String(panelSkill.author ?? panelSkill.publisher ?? panelSkill.publish_name ?? ''),
    categoryGroupName: String(panelSkill.categoryGroupName ?? panelSkill.category ?? ''),
    level: String(panelSkill.level ?? panelSkill.publish_level ?? ''),
    publish_level: String(panelSkill.publish_level ?? panelSkill.level ?? ''),
    downloads: panelSkill.downloads ?? panelSkill.download_count ?? 0,
    fileTree: fileTreeFromDetailDto(row.fileTree),
    skillMdContent: typeof row.skillMdContent === 'string' ? row.skillMdContent : '',
  };
}

function closeVersionDetailPreview(): void {
  versionPreviewSkill.value = null;
}

function onVersionRowDownload(version: string): void {
  const panelSkill = versionPanelSkill.value;
  const versions =
    panelSkill && Array.isArray(panelSkill.versions)
      ? (panelSkill.versions as SkillVersionListItemDto[])
      : [];
  const row = versions.find((item) => String(item.version) === String(version));
  if (row && isVersionRowDeleted(row)) {
    showToast('该版本已下架，无法下载');
    return;
  }

  void downloadSkillVersion(version);
}

async function onVersionRowUnpublish(version: string): Promise<void> {
  if (!detailFromMyReleases.value) {
    return;
  }
  const id = currentDetailSkillId();
  if (!id) {
    return;
  }
  if (!userId.value) {
    showToast('请先配置用户工号');
    return;
  }

  versionUnpublishing.value = version;
  try {
    const res = await skillBaseService.unpublishSkillVersion(id, {
      version,
      userId: userId.value,
    });
    if (!serviceSucceeded(res)) {
      showToast(serviceMessage(res, '下架失败'));
      return;
    }
    showToast('已下架该版本');
    await reloadVersionPanelList();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下架失败');
  } finally {
    versionUnpublishing.value = null;
  }
}

async function handleDeleteClick(): Promise<void> {
  if (!detailFromMyReleases.value) {
    return;
  }
  const id = currentDetailSkillId();
  if (!id) {
    showToast('无法识别 Skill ID');
    return;
  }
  if (!userId.value) {
    showToast('请先配置用户工号');
    return;
  }

  const title = String(skillDetail.value?.name ?? skillDetail.value?.skill_id ?? id).trim();
  if (!window.confirm(`确定删除「${title}」及全部版本？此操作不可恢复。`)) {
    return;
  }

  deletingSkillId.value = id;
  try {
    const res = await skillBaseService.deleteSkillAll(id, { userId: userId.value });
    if (!serviceSucceeded(res)) {
      showToast(serviceMessage(res, '删除失败'));
      return;
    }
    showToast('已删除');
    closeVersionPanel();
    goBackToMarket();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败');
  } finally {
    deletingSkillId.value = null;
  }
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
    skillDetail.value = res.data;
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

async function downloadSkillVersion(version?: string): Promise<void> {
  const id = currentDetailSkillId();
  const targetVersion = String(
    version ?? skillDetail.value?.currentVersion ?? skillDetail.value?.version ?? '',
  );
  if (!id) {
    return;
  }
  try {
    const params: Record<string, string> = {};
    if (userId.value) {
      params.userId = userId.value;
    }
    if (targetVersion) {
      params.version = targetVersion;
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

async function downloadCurrentSkill(): Promise<void> {
  await downloadSkillVersion();
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
    closeVersionPanel();
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
      :show-delete="detailFromMyReleases"
      :deleting-skill-id="deletingSkillId"
      @version-manage="handleVersionManage"
      @delete-click="handleDeleteClick"
      @close="goBackToMarket"
      @download="downloadCurrentSkill"
    />

    <SkillVersionManageDialog
      v-if="versionPanelSkill"
      :skill="versionPanelSkill"
      :loading="versionPanelLoading"
      :unpublishing-version="versionUnpublishing"
      :show-operations-column="detailFromMyReleases"
      @close="closeVersionPanel"
      @back="onVersionManageBack"
      @download="onVersionRowDownload"
      @unpublish="onVersionRowUnpublish"
      @view-detail="onVersionViewDetail"
    />

    <SkillDetailDialog
      v-if="versionPreviewSkill"
      preview-only
      :skill="versionPreviewSkill"
      :file-tree-text="versionPreviewFileTreeText"
      :skill-md-text="versionPreviewSkillMdText"
      @close="closeVersionDetailPreview"
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

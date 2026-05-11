<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Skill } from '../../types/skill';

const props = withDefaults(
  defineProps<{
    skill: Skill;
    /** 市场总览稿：仅「下载」；其他 Tab 可保留查看版本 */
    menuMode?: 'download-only' | 'full';
    /** CoreHarness Tab：显示更丰富的标签信息 */
    variant?: 'default' | 'coreHarness';
  }>(),
  {
    menuMode: 'full',
    variant: 'default',
  },
);

const emit = defineEmits<{
  download: [];
  'view-versions': [id: string];
  'open-detail': [id: string];
}>();

const menuOpen = ref(false);

const statusLabel = computed(() => {
  if (props.variant !== 'coreHarness') {
    return '';
  }
  const downloads = props.skill.download_count ?? props.skill.downloads ?? 0;
  if (downloads >= 2000) {
    return '已发布';
  }
  if (props.skill.ownedByUser) {
    return '待发布';
  }
  return '试用中';
});

const orgShort = computed(() => {
  if (props.variant !== 'coreHarness') {
    return '';
  }
  const raw = props.skill.tagOrg || props.skill.level || props.skill.dept_name || '';
  const parts = raw.split('·').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return raw;
  }
  return parts.slice(0, 2).join(' · ');
});

const scopeLabel = computed(() => {
  const rawLevel = (props.skill.publish_level ?? props.skill.level ?? props.skill.tagOrg ?? '').trim();
  if (rawLevel.includes('组织')) {
    const orgName = (props.skill.publish_name ?? props.skill.publisher ?? '').trim();
    return orgName ? `组织级 · ${orgName}` : '组织级';
  }
  if (rawLevel.includes('个人')) {
    return '个人级';
  }
  return rawLevel;
});

const scopeKind = computed(() => {
  const rawLevel = (props.skill.publish_level ?? props.skill.level ?? props.skill.tagOrg ?? '').trim();
  if (rawLevel.includes('组织')) {
    return 'org';
  }
  if (rawLevel.includes('个人')) {
    return 'personal';
  }
  return 'other';
});

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function onDownload(): void {
  closeMenu();
  emit('download');
}

function onViewVersions(): void {
  closeMenu();
  emit('view-versions', props.skill.id ?? props.skill.skill_id);
}

function onFooterDownload(): void {
  emit('download');
}

function onOpenDetail(): void {
  emit('open-detail', props.skill.id ?? props.skill.skill_id);
}
</script>

<template>
  <article
    class="card"
    role="button"
    tabindex="0"
    @click="onOpenDetail"
    @keydown.enter="onOpenDetail"
    @keydown.space.prevent="onOpenDetail"
  >
    <div v-if="variant === 'coreHarness'" class="top-tags" aria-label="CoreHarness 标签区">
      <span class="tag tag-core">CoreHarness</span>
      <span v-if="orgShort" class="tag tag-org">{{ orgShort }}</span>
      <span class="tag tag-ver">版本 {{ skill.version }}</span>
      <span class="tag tag-status" :class="`st-${statusLabel}`">{{ statusLabel }}</span>
    </div>
    <div class="card-head">
      <h3 class="title">{{ skill.name ?? skill.skill_id }}</h3>
      <div class="menu-wrap" @click.stop>
        <button
          type="button"
          class="more"
          aria-label="更多"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          @click.stop="toggleMenu"
        >
          ···
        </button>
        <div v-if="menuOpen" class="dropdown" role="menu">
          <button type="button" role="menuitem" class="dd-item" @click.stop="onDownload">
            下载到本地
          </button>
          <button
            v-if="menuMode === 'full'"
            type="button"
            role="menuitem"
            class="dd-item"
            @click.stop="onViewVersions"
          >
            查看版本
          </button>
        </div>
      </div>
    </div>
    <p class="meta">发布组织：{{ skill.publish_name ?? skill.publisher }}</p>
    <p class="meta">发布层级：{{ skill.publish_level ?? skill.level }}</p>
    <p v-if="skill.description" class="desc">描述：{{ skill.description }}</p>
    <div class="card-foot">
      <div class="tags" :class="{ compact: variant === 'coreHarness' }">
        <span v-if="skill.tagFunctional" class="tag tag-fn">{{ skill.tagFunctional }}</span>
        <span
          v-if="variant !== 'coreHarness' && scopeLabel"
          class="tag"
          :class="scopeKind === 'personal' ? 'tag-personal' : 'tag-org'"
        >
          {{ scopeLabel }}
        </span>
      </div>
      <button type="button" class="dl-btn" aria-label="下载" @click.stop="onFooterDownload">
        <svg class="dl-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4v12m0 0l4-4m-4 4L8 12M5 19h14"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="dl-num">{{ (skill.download_count ?? skill.downloads ?? 0).toLocaleString('zh-CN') }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: #fff;
  border-radius: 6px;
  padding: 12px 12px 10px;
  border: 1px solid #f0f0f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 118px;
  cursor: pointer;
}

.card:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.18);
  outline-offset: 2px;
}

.top-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.88);
  line-height: 1.4;
  padding-right: 4px;
}

.more {
  border: none;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
  font-size: 16px;
  letter-spacing: 1px;
  padding: 2px 4px;
  line-height: 1;
  flex-shrink: 0;
}

.more:hover {
  color: #1890ff;
}

.menu-wrap {
  position: relative;
}

.dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 132px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 5;
}

.dd-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: #fff;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}

.dd-item:hover {
  background: #f5f5f5;
}

.meta, .desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: start;
}

.desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.tags.compact {
  margin-top: 0;
}

.tag {
  display: inline-block;
  font-size: 12px;
  /* line-height: 1.5; */
  /* padding: 1px 8px; */
  border-radius: 3px;
  border: 1px solid transparent;
}

.tag-core {
  color: #595959;
  background: #fafafa;
  border-color: #f0f0f0;
}

.tag-ver {
  color: rgba(0, 0, 0, 0.65);
  background: #fff;
  border-color: #f0f0f0;
}

.tag-status {
  padding: 1px 8px;
  border-radius: 999px;
  border-color: transparent;
}

.tag-status.st-已发布 {
  color: #389e0d;
  background: rgba(82, 196, 26, 0.12);
}

.tag-status.st-试用中 {
  color: #d46b08;
  background: rgba(250, 173, 20, 0.14);
}

.tag-status.st-待发布 {
  color: #096dd9;
  background: rgba(24, 144, 255, 0.12);
}

.tag-fn {
  color: #1890ff;
  /* background: rgba(24, 144, 255, 0.06); */
  border-color: rgba(24, 144, 255, 0.25);
}

.tag-org {
  color: #178f5f;
  background: #e8f8ef;
  border-color: rgba(18, 128, 92, 0.18);
}

.tag-personal {
  color: #3f5f7c;
  background: #f1f4f8;
  border-color: #edf1f5;
}

.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding-top: 2px;
}

.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 2px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
}

.dl-btn:hover {
  color: #1890ff;
}

.dl-icon {
  width: 16px;
  height: 16px;
}

.dl-num {
  font-variant-numeric: tabular-nums;
}
</style>

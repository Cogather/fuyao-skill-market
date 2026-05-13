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

const title = computed(() => props.skill.name ?? props.skill.skill_id ?? '未命名 Skill');
const description = computed(() => props.skill.description || '暂无描述');

const ownerText = computed(() => {
  const raw = props.skill.owner_list || props.skill.publisher || props.skill.publish_name || '未配置作者';
  return String(raw).split(/[,，]/)[0]?.trim() || '未配置作者';
});

const deptText = computed(() => {
  const raw = props.skill.dept_name || props.skill.publish_name || props.skill.publisher || '';
  const parts = String(raw).split(/[/>｜|]/).map((item) => item.trim()).filter(Boolean);
  return parts[parts.length - 1] || raw || '未配置部门';
});

const iconText = computed(() => {
  if (props.skill.icon) {
    return props.skill.icon;
  }
  const hit = title.value.match(/[A-Za-z0-9\u4e00-\u9fa5]/);
  return hit ? hit[0].toUpperCase() : 'S';
});

const iconClass = computed(() => {
  const text = `${props.skill.tagFunctional ?? ''}${props.skill.skill_id ?? ''}${props.skill.name ?? ''}`;
  if (/review|评审|检查/i.test(text)) return 'pink';
  if (/log|ops|运维|维护/i.test(text)) return 'orange';
  if (/api|接口|开发/i.test(text)) return 'green';
  if (/pdf|文档|办公|周报|会议/i.test(text)) return 'blue';
  return 'purple';
});

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

const displayTags = computed(() => {
  const raw = props.skill.tags || '';
  const tags = raw
    .split(/[,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(tags)];
});

const shownTags = computed(() => displayTags.value.slice(0, 2));
const extraTagCount = computed(() => Math.max(0, displayTags.value.length - shownTags.value.length));
const downloadCount = computed(() => Number(props.skill.download_count ?? props.skill.downloads ?? 0));
const ratingValue = computed(() => Number(props.skill.rating ?? 0));
const ratingLabel = computed(() => (ratingValue.value > 0 ? ratingValue.value.toFixed(1) : '未评分'));

const qualityBadges = computed(() => {
  const badges: { label: string; kind: 'gold' | 'blue' | 'gray' }[] = [];
  if (ratingValue.value >= 4.7) {
    badges.push({ label: '优秀', kind: 'gold' });
  }
  if (downloadCount.value >= 1000) {
    badges.push({ label: '复用', kind: 'blue' });
  }
  if (ratingValue.value > 0 && ratingValue.value < 4.2) {
    badges.push({ label: '优化', kind: 'gray' });
  }
  return badges;
});

function skillId(): string {
  return props.skill.id ?? props.skill.skill_id;
}

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
  emit('view-versions', skillId());
}

function onFooterDownload(): void {
  emit('download');
}

function onOpenDetail(): void {
  emit('open-detail', skillId());
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

    <header class="card-title-row">
      <span class="skill-icon" :class="iconClass" aria-hidden="true">{{ iconText }}</span>
      <span class="card-title-main">
        <h3 class="title" :title="title">{{ title }}</h3>
        <span class="meta-line" :title="`${ownerText} · ${deptText}`">
          <span>{{ ownerText }}</span>
          <span class="meta-dot">·</span>
          <span>{{ deptText }}</span>
        </span>
      </span>
    </header>

    <p class="desc" :title="description">{{ description }}</p>

    <div class="tags" :class="{ compact: variant === 'coreHarness' }">
      <span v-if="skill.tagFunctional" class="tag tag-fn">{{ skill.tagFunctional }}</span>
      <span v-for="tag in shownTags" :key="tag" class="tag tag-skill">#{{ tag }}</span>
      <span v-if="extraTagCount > 0" class="tag tag-more">+{{ extraTagCount }}</span>
      <span
        v-if="variant !== 'coreHarness' && scopeLabel"
        class="tag"
        :class="scopeKind === 'personal' ? 'tag-personal' : 'tag-org'"
      >
        {{ scopeLabel }}
      </span>
    </div>

    <footer class="card-market-footer">
      <span class="footer-medals" aria-label="质量标识">
        <span
          v-for="badge in qualityBadges"
          :key="badge.label"
          class="quality-badge"
          :class="`badge-${badge.kind}`"
          :title="badge.label"
        >
          {{ badge.label.slice(0, 1) }}
        </span>
        <span v-if="qualityBadges.length === 0" class="no-medal">—</span>
      </span>
      <span class="footer-right-metrics">
        <span class="rating-metric" :title="`评分 ${ratingLabel}`">★ {{ ratingLabel }}</span>
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
          <span class="dl-num">{{ downloadCount.toLocaleString('zh-CN') }}</span>
        </button>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  min-height: 178px;
  padding: 16px 18px 14px;
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 9px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.035);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.card:hover {
  transform: translateY(-1px);
  border-color: #dbe3ee;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
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

.menu-wrap {
  position: absolute;
  top: 12px;
  right: 14px;
}

.more {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9aa4b2;
  font-size: 16px;
  letter-spacing: 1px;
  padding: 0;
  line-height: 1;
}

.more:hover {
  color: #2563eb;
}

.dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 132px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
  z-index: 5;
  padding: 6px;
}

.dd-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  border-radius: 6px;
  background: #fff;
  padding: 8px 10px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}

.dd-item:hover {
  background: #f5f9ff;
  color: #2563eb;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding-right: 34px;
  margin-bottom: 10px;
}

.skill-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  background: #e7f0ff;
  font-size: 14px;
  font-weight: 760;
}

.skill-icon.pink {
  color: #e0448f;
  background: #fde7f3;
}

.skill-icon.purple {
  color: #7c3aed;
  background: #f1e8ff;
}

.skill-icon.green {
  color: #16a34a;
  background: #e8f8ef;
}

.skill-icon.orange {
  color: #ea580c;
  background: #fff1e6;
}

.skill-icon.blue {
  color: #2563eb;
  background: #e7f0ff;
}

.card-title-main {
  min-width: 0;
  flex: 1 1 auto;
  display: block;
}

.title {
  margin: 0;
  color: #111827;
  font-size: 15.5px;
  font-weight: 760;
  line-height: 1.32;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-line {
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8a95a6;
  font-size: 12.5px;
  line-height: 1.25;
  overflow: hidden;
  white-space: nowrap;
}

.meta-line span:not(.meta-dot) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-dot {
  flex: 0 0 auto;
  color: #cbd5e1;
}

.desc {
  margin: 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.48;
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
  margin-top: 10px;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: 138px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: #f3f6fb;
  color: #667085;
  font-size: 12px;
  font-weight: 520;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-core,
.tag-ver {
  color: #595959;
  background: #fafafa;
  border-color: #f0f0f0;
}

.tag-status {
  border-radius: 999px;
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
  color: #2563eb;
  background: #edf4ff;
}

.tag-skill {
  color: #9a3412;
  background: #fff7ed;
  border-color: #fed7aa;
}

.tag-more {
  color: #64748b;
  background: #f8fafc;
  border-color: #e2e8f0;
}

.tag-org {
  color: #16865f;
  background: #e9f8ef;
}

.tag-personal {
  color: #3f5f7c;
  background: #f1f4f8;
  border-color: #edf1f5;
}

.card-market-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
  min-height: 28px;
}

.footer-medals,
.footer-right-metrics {
  display: inline-flex;
  align-items: center;
}

.footer-medals {
  gap: 7px;
  min-width: 0;
}

.quality-badge {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  border: 1px solid transparent;
}

.badge-gold {
  color: #92400e;
  background: linear-gradient(180deg, #fff7d6, #facc15);
  border-color: #f5c542;
}

.badge-blue {
  color: #1d4ed8;
  background: linear-gradient(180deg, #eff6ff, #93c5fd);
  border-color: #bfdbfe;
}

.badge-gray {
  color: #475569;
  background: linear-gradient(180deg, #f8fafc, #cbd5e1);
  border-color: #cbd5e1;
}

.no-medal {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
}

.footer-right-metrics {
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}

.rating-metric {
  color: #b45309;
  font-size: 12.8px;
  font-weight: 700;
  line-height: 1;
}

.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  color: #2563eb;
  font-size: 12.8px;
  font-weight: 700;
}

.dl-btn:hover {
  color: #1d4ed8;
}

.dl-icon {
  width: 13px;
  height: 13px;
}

.dl-num {
  font-variant-numeric: tabular-nums;
}
</style>

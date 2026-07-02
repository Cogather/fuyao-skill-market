<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const props = withDefaults(
  defineProps<{
    skill: Record<string, unknown>;
    fileTreeText: string;
    skillMdText: string;
    /** 为 false 时不展示删除（如从市场卡片进入） */
    showDelete?: boolean;
    deletingSkillId?: string | null;
    /** 仅展示文件树与 SKILL.md，隐藏下载/调测/删除/版本管理等操作（如版本列表「查看」） */
    previewOnly?: boolean;
    /** 自进化审批模式：隐藏版本/作者等标签 */
    aiEvolution?: boolean;
    /** dialog: 弹窗；page: 独立页面内联展示 */
    displayMode?: 'dialog' | 'page';
    closeText?: string;
    showTrySkill?: boolean;
    showDownload?: boolean;
    showVersionManage?: boolean;
  }>(),
  {
    showDelete: true,
    deletingSkillId: null,
    previewOnly: false,
    aiEvolution: false,
    displayMode: 'dialog',
    closeText: '',
    showTrySkill: true,
    showDownload: true,
    showVersionManage: true,
  },
);

const emit = defineEmits<{
  close: [];
  trySkill: [];
  download: [];
  deleteClick: [evt: MouseEvent];
  versionManage: [];
  updateSkillData: [id: string, currentVersion: string];
}>();

const detailMoreWrapRef = ref<HTMLElement | null>(null);
const detailMoreMenuOpen = ref(false);
let detailMoreMenuListenersBound = false;
const isPageMode = computed(() => props.displayMode === 'page');

function skillScopeLabel(s: Record<string, unknown>): string {
  const level = String(s.publish_level ?? s.level ?? s.tagOrg ?? '').trim();
  if (level.includes('组织')) {
    const pn = String(s.publish_name ?? '').trim();
    return pn ? `组织级 · ${pn}` : '组织级';
  }
  if (level.includes('个人')) {
    return '个人级';
  }
  return level || '-';
}

function skillScopeClass(s: Record<string, unknown>): string {
  return skillScopeLabel(s).includes('组织') ? 'scope-org' : 'scope-personal';
}

function currentSkillId(): string {
  return String(props.skill?.id ?? props.skill?.skill_id ?? '');
}

function onDetailMoreDocDown(ev: MouseEvent): void {
  const wrap = detailMoreWrapRef.value;
  const t = ev.target as Node | null;
  if (!wrap || !t || wrap.contains(t)) {
    return;
  }
  closeDetailMoreMenu();
}

function removeDetailMoreMenuListeners(): void {
  if (!detailMoreMenuListenersBound) {
    return;
  }
  detailMoreMenuListenersBound = false;
  document.removeEventListener('mousedown', onDetailMoreDocDown, true);
}

function closeDetailMoreMenu(): void {
  detailMoreMenuOpen.value = false;
  removeDetailMoreMenuListeners();
}

function toggleDetailMoreMenu(): void {
  detailMoreMenuOpen.value = !detailMoreMenuOpen.value;
  if (detailMoreMenuOpen.value) {
    void nextTick(() => {
      if (!detailMoreMenuOpen.value || detailMoreMenuListenersBound) {
        return;
      }
      detailMoreMenuListenersBound = true;
      document.addEventListener('mousedown', onDetailMoreDocDown, true);
    });
  } else {
    removeDetailMoreMenuListeners();
  }
}

function onVersionMenuClick(): void {
  closeDetailMoreMenu();
  emit('versionManage');
}

function onShellClick(): void {
  if (!isPageMode.value) {
    emit('close');
  }
}
// 调测
const goToDebugPage = (skill) => {
  router.push({
    name: 'skill-debug',
    query: { id: currentSkillId(), skillName: skill.name },
  });
};
const updateSkill = async (skill) => {
  try {
    await emit('updateSkillData', skill.id, skill.currentVersion);
    goToDebugPage(skill);
  } catch (err) {
    console.error(err);
  }
};
onBeforeUnmount(() => {
  removeDetailMoreMenuListeners();
});
</script>

<template>
  <Teleport to="body" :disabled="isPageMode">
    <div
      :class="[
        isPageMode ? 'detail-page-shell' : 'overlay detail-overlay',
        { 'detail-overlay--stacked': previewOnly && !isPageMode },
      ]"
      :role="isPageMode ? undefined : 'presentation'"
      @click.self="onShellClick"
    >
      <section
        class="skill-detail-dialog"
        :class="{ 'skill-detail-dialog--page': isPageMode }"
        :role="isPageMode ? 'region' : 'dialog'"
        :aria-modal="isPageMode ? undefined : 'true'"
        aria-labelledby="skill-detail-title"
      >
        <header class="detail-head">
          <h2 id="skill-detail-title">
            {{ previewOnly ? 'Skill 详情 · 版本预览' : 'Skill 详情' }}
          </h2>
          <button type="button" class="detail-close" @click="emit('close')">
            {{ closeText || (isPageMode ? '返回' : '关闭') }}
          </button>
        </header>

        <div class="detail-toolbar">
          <div class="detail-tags">
            <span v-if="!previewOnly" class="detail-pill pill-category">{{
              skill.categoryGroupName
            }}</span>

            <span class="detail-pill pill-id">{{ skill.name }}</span>
            <span v-if="!aiEvolution" class="detail-pill"
              >版本 {{ skill.currentVersion ?? skill.version }}</span
            >
            <span v-if="!previewOnly && !aiEvolution" class="detail-pill"
              >作者 {{ skill.author }}</span
            >
            <span v-if="!previewOnly" class="detail-pill" :class="skillScopeClass(skill)">
              {{ skill.level }}
            </span>
            <span v-if="!previewOnly" class="detail-download">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {{ skill.totalDownloads }}
            </span>
          </div>
          <div v-if="!previewOnly" class="detail-actions">
            <button
              v-if="showTrySkill"
              type="button"
              class="detail-btn ghost"
              @click="updateSkill(skill)"
            >
              在线调测
            </button>
            <button
              v-if="showDownload"
              type="button"
              class="detail-btn primary"
              @click="emit('download')"
            >
              下载到本地
            </button>
            <button
              v-if="showDelete"
              type="button"
              class="detail-btn danger detail-delete-trigger"
              :disabled="deletingSkillId !== null && deletingSkillId === currentSkillId()"
              @click="emit('deleteClick', $event)"
            >
              {{ deletingSkillId === currentSkillId() ? '删除中…' : '删除' }}
            </button>
            <div
              v-if="!aiEvolution && showVersionManage"
              ref="detailMoreWrapRef"
              class="detail-more-wrap"
            >
              <button
                type="button"
                class="detail-btn detail-more-trigger"
                aria-haspopup="menu"
                :aria-expanded="detailMoreMenuOpen"
                aria-label="更多操作"
                @click.stop="toggleDetailMoreMenu"
              >
                <span class="detail-more-dots" aria-hidden="true">···</span>
              </button>
              <div v-show="detailMoreMenuOpen" class="detail-more-menu" role="menu" @click.stop>
                <button
                  type="button"
                  class="detail-more-item"
                  role="menuitem"
                  @click="onVersionMenuClick"
                >
                  版本管理
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-main">
          <aside class="detail-file-panel">
            <div class="detail-panel-title">文件结构</div>
            <pre>{{ fileTreeText }}</pre>
          </aside>
          <article class="detail-md-panel">
            <div class="detail-panel-title">SKILL.md</div>
            <div class="detail-md-body">
              <h3>{{ skill.name }} Skill</h3>
              <pre>{{ skillMdText }}</pre>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
  padding: 16px;
}

.detail-overlay {
  background: rgba(15, 23, 42, 0.48);
}

.detail-overlay.detail-overlay--stacked {
  z-index: 960;
}

.skill-detail-dialog {
  width: min(67%, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 22px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
  font-weight: 800;
}

.detail-close,
.detail-btn {
  border: 1px solid #dbe4f0;
  background: #fff;
  color: #172033;
  border-radius: 7px;
  min-height: 34px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

.detail-btn.ghost {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.detail-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  pointer-events: auto;
}

.detail-btn.ghost:disabled:hover {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.detail-close:hover,
.detail-btn.ghost:hover:not(:disabled) {
  color: #1d4ed8;
  border-color: #93c5fd;
  background: #dbeafe;
}

.detail-btn.danger {
  background: #fff;
  color: #dc2626;
  border-color: #fecaca;
}

.detail-btn.danger:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.detail-more-wrap {
  position: relative;
  flex-shrink: 0;
}

.detail-more-trigger {
  min-width: 38px;
  padding: 0 10px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.detail-more-dots {
  display: inline-block;
  transform: translateY(-1px);
  font-size: 15px;
  line-height: 1;
}

.detail-more-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 132px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  z-index: 20;
}

.detail-more-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 6px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 650;
  color: #0f172a;
  background: #f8fafc;
  cursor: pointer;
}

.detail-more-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.detail-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 18px 22px 12px;
}

.detail-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.detail-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e5eaf1;
  font-size: 12px;
  line-height: 1.2;
}

.detail-pill.pill-category,
.detail-pill.pill-id {
  background: #eff6ff;
  color: #2563eb;
  border-color: #dbeafe;
}

.detail-pill.scope-org {
  background: #dcfce7;
  color: #15803d;
  border-color: #bbf7d0;
  font-weight: 800;
}

.detail-pill.scope-personal {
  background: #f1f4f8;
  color: #3f5f7c;
  border-color: #edf1f5;
  font-weight: 800;
}

.detail-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1e293b;
  font-size: 13px;
}

.detail-download svg {
  width: 16px;
  height: 16px;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.detail-btn.primary {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.detail-btn.primary:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.detail-main {
  display: grid;
  grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
  gap: 16px;
  padding: 0 22px 18px;
  overflow: hidden;
  min-height: 0;
}

.detail-file-panel,
.detail-md-panel {
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fff;
  overflow: auto;
}

.detail-panel-title {
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
  font-size: 14px;
  font-weight: 800;
}

.detail-file-panel pre {
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  color: #334155;
  font-size: 12px;
  line-height: 1.55;
  font-family: Consolas, 'Courier New', monospace;
}

.detail-md-panel {
  display: flex;
  flex-direction: column;
}

.detail-md-body {
  padding: 18px;
  overflow: auto;
  color: #334155;
  font-size: 13px;
  line-height: 1.58;
}

.detail-md-body h3 {
  margin: 0 0 8px;
  color: #334155;
  font-size: 22px;
  line-height: 1.2;
}

@media (max-width: 820px) {
  .skill-detail-dialog {
    width: calc(100vw - 24px);
  }

  .detail-toolbar,
  .detail-main {
    grid-template-columns: 1fr;
  }

  .detail-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .detail-actions {
    width: 100%;
  }

  .detail-more-wrap {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .detail-btn {
    flex: 1;
  }

  .detail-main {
    overflow: auto;
  }
}

/* Prototype-aligned dialog polish */
.overlay,
.detail-overlay {
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
}

.skill-detail-dialog {
  border: 1px solid rgba(232, 236, 245, 0.92);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(251, 252, 255, 0.98)), #ffffff;
  box-shadow: 0 28px 70px rgba(22, 34, 51, 0.18);
}

.detail-head {
  padding: 18px 24px;
  border-bottom-color: #e9edf3;
  background: linear-gradient(180deg, rgba(120, 98, 255, 0.08), rgba(255, 255, 255, 0));
}

.detail-head h2 {
  color: #15171d;
  font-weight: 900;
  letter-spacing: 0;
}

.detail-close,
.detail-btn {
  min-height: 38px;
  border-color: #e9edf3;
  border-radius: 999px;
  background: #ffffff;
  color: #373b45;
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(12, 20, 35, 0.05);
}

.detail-close:hover,
.detail-btn.ghost:hover:not(:disabled) {
  color: #2f7df6;
  border-color: #cfd7e6;
  background: #fbfcff;
}

.detail-btn.ghost {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-btn.primary {
  background: #1d1d1f;
  border-color: #1d1d1f;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

.detail-btn.primary:hover {
  background: #111111;
  border-color: #111111;
  transform: translateY(-1px);
}

.detail-btn.danger {
  color: #c33d3d;
  background: #fff2f2;
  border-color: #ffd8d8;
}

.detail-more-menu {
  border-color: #e9edf3;
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(22, 34, 51, 0.14);
}

.detail-more-item {
  border-radius: 8px;
  background: #ffffff;
  font-weight: 800;
}

.detail-more-item:hover {
  color: #2f7df6;
  background: #eef6ff;
}

.detail-toolbar {
  padding: 18px 24px 14px;
}

.detail-pill {
  min-height: 26px;
  border-radius: 999px;
  background: #f5f7fb;
  border-color: #edf0f5;
  color: #6b7280;
  font-weight: 800;
}

.detail-pill.pill-category,
.detail-pill.pill-id {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-pill.scope-org {
  color: #19905b;
  background: #effaf4;
  border-color: #d8f0e3;
}

.detail-pill.scope-personal {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-file-panel,
.detail-md-panel {
  border-color: #e9edf3;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

.detail-panel-title {
  background: #f8fafc;
  border-bottom-color: #e9edf3;
  color: #475569;
  font-weight: 900;
}

.detail-md-body h3 {
  color: #15171d;
  font-weight: 900;
  letter-spacing: 0;
}
.detail-page-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  box-sizing: border-box;
}

.detail-page-shell .skill-detail-dialog {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.skill-detail-dialog--page {
  border-radius: 0;
}

.skill-detail-dialog--page .detail-main {
  flex: 1;
  min-height: 0;
  padding-bottom: 24px;
}
</style>

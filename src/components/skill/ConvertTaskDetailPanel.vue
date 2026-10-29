<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import type {
  ConvertAgentSkillRel,
  ConvertSquadMember,
  ConvertTaskDetail,
  ConvertTaskStatus,
} from '../../types/skill';

const props = defineProps<{
  taskId: string;
  extensionName?: string;
}>();
const emit = defineEmits<{ close: [] }>();
const titleId = `convert-detail-title-${useId()}`;
const dialogRef = ref<HTMLDialogElement | null>(null);
const task = ref<ConvertTaskDetail | null>(null);
const loading = ref(false);
const error = ref('');

const STATUS_META: Record<ConvertTaskStatus, { label: string; cls: string } | undefined> = {
  processing: { label: '转换中', cls: 'is-processing' },
  success: { label: '已转换', cls: 'is-success' },
  fail: { label: '转换失败', cls: 'is-fail' },
  canceled: { label: '已取消', cls: 'is-canceled' },
};

const statusMeta = computed(
  () => STATUS_META[task.value?.status ?? 'processing'] ?? STATUS_META.processing!,
);

/** 将 members 与 agentSkillRels 按名称合并，把 Skill 关系挂到成员卡片上 */
const mergedMembers = computed(() => {
  const members = task.value?.members ?? [];
  const rels = task.value?.agentSkillRels ?? [];
  return members.map((m) => {
    const rel = rels.find((r) => r.agentName === m.name);
    return {
      ...m,
      skills: rel?.skills ?? [],
    };
  });
});

function close(): void {
  if (loading.value) return;
  dialogRef.value?.close();
  emit('close');
}

async function loadDetail(): Promise<void> {
  if (loading.value || !props.taskId) return;
  loading.value = true;
  try {
    const env = await skillBaseService.queryConvertTaskDetail(props.taskId);
    const meta = (env.meta ?? {}) as { success?: boolean };
    if (typeof meta.success === 'boolean' && !meta.success) {
      throw new Error(env.message || '任务详情加载失败');
    }
    task.value = normalizeDetail(env.data);
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '任务详情加载失败';
  } finally {
    loading.value = false;
  }
}

function normalizeStatus(raw: unknown): ConvertTaskStatus {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'success' || s === 'succeed' || s === 'done') {
    return 'success';
  }
  if (s === 'fail' || s === 'failed') {
    return 'fail';
  }
  if (s === 'canceled' || s === 'cancelled') {
    return 'canceled';
  }
  if (s.includes('cancel')) {
    return 'canceled';
  }
  if (s.includes('fail')) {
    return 'fail';
  }
  if (s.includes('success') || s.includes('done')) {
    return 'success';
  }
  return 'processing';
}

function normalizeDetail(raw: unknown): ConvertTaskDetail {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const agentsRaw = Array.isArray(row.agents) ? row.agents : [];
  return {
    taskId: String(row.taskId ?? props.taskId),
    extensionName: props.extensionName ?? '',
    status: normalizeStatus(row.convertStatus ?? row.status),
    squadName: row.teamName ? String(row.teamName) : row.squadName ? String(row.squadName) : '',
    squadDescription: row.teamDesc ? String(row.teamDesc) : '',
    members: agentsRaw.map((item) => {
      const agent = (item ?? {}) as Record<string, unknown>;
      return {
        name: String(agent.agentName ?? ''),
        role: '执行成员',
        prompt: '',
      } satisfies ConvertSquadMember;
    }),
    agentSkillRels: agentsRaw.map((item) => {
      const agent = (item ?? {}) as Record<string, unknown>;
      return {
        agentName: String(agent.agentName ?? ''),
        skills: Array.isArray(agent.boundSkills)
          ? agent.boundSkills.map((skill) => String(skill)).filter(Boolean)
          : Array.isArray(agent.skills)
            ? agent.skills.map((skill) => String(skill)).filter(Boolean)
            : [],
      } satisfies ConvertAgentSkillRel;
    }),
    targetSpace: {
      spaceId: row.workspaceId ? String(row.workspaceId) : '',
      spaceName: row.workspaceName ? String(row.workspaceName) : '',
    },
    createdAt: String(row.createAt ?? row.createdAt ?? ''),
    finishedAt: row.updateAt ? String(row.updateAt) : row.finishedAt ? String(row.finishedAt) : null,
    errorMessage:
      typeof row.errorMessage === 'string' && row.errorMessage.trim() ? row.errorMessage : null,
  };
}

onMounted(() => {
  mounted = true;
  dialogRef.value?.showModal();
  void loadDetail();
});
let mounted = false;
onBeforeUnmount(() => {
  mounted = false;
  dialogRef.value?.close();
});

watch(
  () => props.taskId,
  () => {
    if (mounted) void loadDetail();
  },
);
</script>

<template>
  <Teleport to="body">
    <div class="harness-workspace-overlay">
      <dialog
        ref="dialogRef"
        class="convert-detail-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-busy="loading"
        tabindex="-1"
        @cancel.prevent
      >
        <header>
          <h2 :id="titleId">转换任务详情</h2>
          <button
            type="button"
            class="convert-detail-dialog__close"
            aria-label="关闭"
            :disabled="loading"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="convert-detail-dialog__body">
          <div v-if="error" class="convert-detail__error">
            {{ error }}
            <button type="button" class="convert-detail__retry" @click="loadDetail()">重试</button>
          </div>
          <div v-else-if="loading && !task" class="convert-detail__loading">任务详情加载中…</div>
          <template v-else-if="task">
            <header class="convert-detail__head">
              <h3 class="convert-detail__title">
                {{ task.extensionName }} → CoreALM-Next 小队
              </h3>
              <span class="st" :class="statusMeta.cls">{{ statusMeta.label }}</span>
            </header>
            <p class="convert-detail__meta">
              任务ID：{{ task.taskId }}
              <template v-if="task.createdAt"> · 发起时间：{{ task.createdAt }}</template>
              <template v-if="task.finishedAt"> · 完成时间：{{ task.finishedAt }}</template>
            </p>

            <div
              v-if="task.status === 'fail'"
              class="convert-detail__banner convert-detail__banner--danger"
            >
              转换失败：{{ task.errorMessage || '任务执行失败，无法完成小队生成。' }}
            </div>
            <div
              v-else-if="task.status === 'canceled'"
              class="convert-detail__banner convert-detail__banner--warn"
            >
              该转换任务已取消，结果已废弃。
            </div>
            <div
              v-else-if="task.status === 'success' && task.squadName"
              class="convert-detail__banner convert-detail__banner--ok"
            >
              小队「<b>{{ task.squadName }}</b
              >」已通过 CoreALM-Next 推送到「{{ task.targetSpace?.spaceName || '目标工作空间' }}」。
            </div>

            <template v-if="task.status === 'success'">
              <section class="convert-detail__sec" aria-label="小队信息">
                <h4 class="convert-detail__sec-title">小队信息</h4>
                <dl class="convert-detail__kv">
                  <div class="kv-item kv-item--wide">
                    <dt>小队名称</dt>
                    <dd>{{ task.squadName || '—' }}</dd>
                  </div>
                  <div class="kv-item kv-item--wide">
                    <dt>小队描述</dt>
                    <dd>{{ task.squadDescription || '—' }}</dd>
                  </div>
                </dl>
              </section>

              <section
                v-if="mergedMembers.length > 0"
                class="convert-detail__sec"
                aria-label="小队成员"
              >
                <h4 class="convert-detail__sec-title">小队成员</h4>
                <div class="convert-detail__members">
                  <div v-for="(member, idx) in mergedMembers" :key="idx" class="member-card">
                    <div class="member-card__head">
                      <span class="member-card__name">{{ member.name }}</span>
                    </div>
                    <div v-if="member.skills.length > 0" class="member-card__skills">
                      <span class="member-card__skills-label">关联 Skill</span>
                      <div class="member-card__skill-list">
                        <span
                          v-for="skill in member.skills"
                          :key="skill"
                          class="member-card__skill"
                          :title="skill"
                        >
                          {{ skill }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>

            <section class="convert-detail__sec" aria-label="目标工作空间">
              <h4 class="convert-detail__sec-title">目标工作空间</h4>
              <dl class="convert-detail__kv">
                <div class="kv-item kv-item--wide">
                  <dt>空间名称</dt>
                  <dd>{{ task.targetSpace?.spaceName || '—' }}</dd>
                </div>
                <div v-if="task.targetSpace?.spaceId" class="kv-item kv-item--wide">
                  <dt>空间 ID</dt>
                  <dd><code class="space-id">{{ task.targetSpace.spaceId }}</code></dd>
                </div>
              </dl>
            </section>
          </template>
        </div>
        <footer>
          <button
            type="button"
            class="convert-detail__refresh-btn"
            :disabled="loading"
            @click="loadDetail()"
          >
            {{ loading ? '查询中...' : '刷新' }}
          </button>
          <button type="button" class="primary-btn" :disabled="loading" @click="close">关闭</button>
        </footer>
      </dialog>
    </div>
  </Teleport>
</template>

<style scoped>
.convert-detail-dialog {
  box-sizing: border-box;
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 24px;
  overflow: hidden;
  border: 1px solid var(--hw-line, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 20px 60px rgb(15 23 42 / 18%);
}
.convert-detail-dialog[open] {
  display: flex;
  flex-direction: column;
}
.convert-detail-dialog::backdrop {
  background: rgb(15 23 42 / 38%);
  backdrop-filter: blur(3px);
}
.convert-detail-dialog header,
.convert-detail-dialog footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
}
.convert-detail-dialog header {
  justify-content: space-between;
}
.convert-detail-dialog h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.convert-detail-dialog__close {
  width: 32px;
  padding: 0;
  border-color: transparent;
  background: var(--hw-quiet, #f8fafc);
  color: var(--hw-muted, #667085);
  font-size: 22px;
}
.convert-detail-dialog__body {
  min-height: 0;
  flex: 1 1 auto;
  padding: 16px 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.convert-detail-dialog footer {
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--hw-line, #e2e8f0);
}
.convert-detail-dialog footer button {
  min-height: 32px;
  padding: 5px 14px;
  border: 1px solid var(--hw-control-line, #8593a5);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-text, #334155);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.convert-detail-dialog footer button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.convert-detail-dialog footer button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.convert-detail-dialog footer .primary-btn {
  border-color: #2f7df6;
  background: #2f7df6;
  color: #fff;
  font-weight: 600;
}
.convert-detail__error {
  padding: 10px 14px;
  border: 1px solid rgb(180 35 24 / 28%);
  border-radius: 8px;
  background: #fdf3f2;
  color: var(--hw-danger, #b42318);
  font-size: 13px;
}
.convert-detail__retry {
  margin-left: 10px;
  padding: 2px 12px;
  border: 1px solid rgb(180 35 24 / 40%);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-danger, #b42318);
  font-size: 12px;
  cursor: pointer;
}
.convert-detail__loading {
  padding: 40px 0;
  color: #8a94a6;
  font-size: 13px;
  text-align: center;
}
.convert-detail__head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.convert-detail__title {
  margin: 0;
  color: #1f2b3d;
  font-size: 17px;
  font-weight: 700;
}
.convert-detail__meta {
  margin: 6px 0 0;
  color: #8a94a6;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.convert-detail__banner {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
}
.convert-detail__banner--info {
  border: 1px solid rgb(47 125 246 / 28%);
  background: #eaf3ff;
  color: #2470e0;
}
.convert-detail__banner--ok {
  border: 1px solid rgb(22 163 74 / 26%);
  background: #e7f6ec;
  color: #15803d;
}
.convert-detail__banner--danger {
  border: 1px solid rgb(180 35 24 / 28%);
  background: #fdf3f2;
  color: #b42318;
  overflow-wrap: anywhere;
}
.convert-detail__banner--warn {
  border: 1px solid rgb(180 140 30 / 32%);
  background: #fdf8e9;
  color: #92600a;
}
.convert-detail__sec {
  margin-top: 18px;
  padding: 16px 18px;
  border: 1px solid #e9edf3;
  border-radius: 10px;
  background: #fff;
}
.convert-detail__sec-title {
  margin: 0 0 12px;
  color: #1f2b3d;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.3px;
}
.convert-detail__collapse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0 0 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
.convert-detail__collapse-head .convert-detail__sec-title {
  margin: 0;
}
.convert-detail__collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #2f7df6;
  font-size: 12px;
  font-weight: 700;
}
.convert-detail__collapse-arrow {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #2f7df6;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}
.convert-detail__collapse-arrow.is-expanded {
  transform: rotate(180deg);
}
.convert-detail__kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
  margin: 0;
}
.kv-item--wide {
  grid-column: 1 / -1;
}
.kv-item dt {
  margin-bottom: 3px;
  color: #7b8396;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.kv-item dd {
  margin: 0;
  color: #33404f;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.space-id {
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3f5f9;
  color: #5b6b81;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}
.convert-detail__instruction {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f8fafc;
  color: #3b4757;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.convert-detail__members {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.member-card {
  padding: 12px 14px;
  border: 1px solid #e9edf3;
  border-radius: 8px;
  background: #fcfdff;
}
.member-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.member-card__name {
  color: #1f2b3d;
  font-size: 13px;
  font-weight: 700;
}
.member-role {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}
.member-role.is-captain {
  background: #eaf3ff;
  color: #2470e0;
}
.member-role.is-executor {
  background: #e7f6ec;
  color: #15803d;
}
.member-card__prompt {
  margin: 8px 0 0;
  color: #5b6b81;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.member-card__skills {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e9edf3;
}
.member-card__skills-label {
  display: block;
  margin-bottom: 6px;
  color: #7b8396;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
}
.member-card__skill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.member-card__skill {
  padding: 3px 10px;
  border: 1px solid rgb(47 125 246 / 30%);
  border-radius: 999px;
  background: #eaf3ff;
  color: #2470e0;
  font-size: 12px;
  font-weight: 700;
}
.convert-detail__refresh-btn {
  margin-right: auto;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import type { ConvertTaskListItem, ConvertTaskStatus } from '../../types/skill';

const props = defineProps<{
  extensionName: string;
}>();
const emit = defineEmits<{
  start: [];
  'view-detail': [taskId: string];
}>();

const STATUS_META: Record<ConvertTaskStatus, { label: string; cls: string } | undefined> = {
  processing: { label: '转换中', cls: 'is-processing' },
  success: { label: '已转换', cls: 'is-success' },
  fail: { label: '转换失败', cls: 'is-fail' },
  canceled: { label: '已取消', cls: 'is-canceled' },
};

const tasks = ref<ConvertTaskListItem[]>([]);
const loading = ref(false);
const error = ref('');
const lastLoadedAt = ref('');

function taskStatusMeta(status: ConvertTaskStatus): { label: string; cls: string } {
  return STATUS_META[status] ?? STATUS_META.processing!;
}

async function loadTasks(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  try {
    const env = await skillBaseService.queryConvertTasks({
      extensionName: props.extensionName,
      pageNum: 1,
      pageSize: 500,
    });
    const meta = (env.meta ?? {}) as { success?: boolean };
    if (typeof meta.success === 'boolean' && !meta.success) {
      throw new Error(env.message || '转换任务加载失败');
    }
    tasks.value = normalizeTasks(env.data);
    error.value = '';
    lastLoadedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '转换任务加载失败';
  } finally {
    loading.value = false;
  }
}

function normalizeTasks(raw: unknown): ConvertTaskListItem[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      list = record.data;
    } else if (Array.isArray(record.records)) {
      list = record.records;
    } else if (Array.isArray(record.list)) {
      list = record.list;
    }
  }
  return list.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      taskId: String(row.taskId ?? row.id ?? ''),
      extensionName: String(row.extensionName ?? ''),
      extensionVersion: row.extensionVersion ? String(row.extensionVersion) : '',
      submitter: row.source ? String(row.source) : row.submitter ? String(row.submitter) : '',
      status: normalizeStatus(row.convertStatus ?? row.status),
      squadName: row.teamName ? String(row.teamName) : row.squadName ? String(row.squadName) : '',
      squadDescription: row.teamDesc ? String(row.teamDesc) : row.squadDescription ? String(row.squadDescription) : '',
      targetSpaceName: row.workspaceName
        ? String(row.workspaceName)
        : row.targetSpaceName
          ? String(row.targetSpaceName)
          : '',
      createdAt: String(row.createAt ?? row.createdAt ?? ''),
      finishedAt: row.updateAt ? String(row.updateAt) : row.finishedAt ? String(row.finishedAt) : null,
    } satisfies ConvertTaskListItem;
  });
}

function normalizeStatus(raw: unknown): ConvertTaskStatus {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'processing' || s === 'running' || s === 'pending') {
    return 'processing';
  }
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

onMounted(() => {
  void loadTasks();
});
</script>

<template>
  <section class="convert-panel" aria-label="小队转换任务">
    <div class="convert-panel__header">
      <div>
        <h3 class="convert-panel__title">转换为 CoreALM-Next 小队</h3>
        <p class="convert-panel__desc">
          将「{{ extensionName }}」转换为 CoreALM-Next 小队；转换完成后可在对应空间中查看。
        </p>
      </div>
      <div class="convert-panel__ops">
        <span v-if="lastLoadedAt" class="convert-panel__loaded">最近查询 {{ lastLoadedAt }}</span>
        <button type="button" class="convert-panel__refresh" :disabled="loading" @click="loadTasks()">
          {{ loading ? '查询中...' : '刷新' }}
        </button>
        <button type="button" class="convert-panel__start-btn" @click="emit('start')">
          转换为小队
        </button>
      </div>
    </div>

    <div v-if="error" class="convert-panel__error">
      {{ error }}
      <button type="button" class="convert-panel__retry" @click="loadTasks()">重试</button>
    </div>

    <div class="convert-panel__card">
      <table class="convert-panel__table">
        <thead>
          <tr>
            <th class="th-id">任务 ID</th>
            <th class="th-version">版本</th>
            <th class="th-submitter">发起人</th>
            <th class="th-time">发起时间</th>
            <th class="th-time">完成时间</th>
            <th class="th-space">目标工作空间</th>
            <th class="th-squad">小队名称</th>
            <th class="th-desc">小队描述</th>
            <th class="th-status">状态</th>
            <th class="th-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.taskId">
            <td>
              <button
                type="button"
                class="convert-panel__task-id"
                :title="`查看 ${task.taskId} 详情`"
                @click="emit('view-detail', task.taskId)"
              >
                {{ task.taskId }}
              </button>
            </td>
            <td><span class="version-text">{{ task.extensionVersion || '—' }}</span></td>
            <td>{{ task.submitter || '—' }}</td>
            <td>{{ task.createdAt || '—' }}</td>
            <td>{{ task.finishedAt || '—' }}</td>
            <td>{{ task.targetSpaceName || '—' }}</td>
            <td>
              <span v-if="task.squadName" class="squad-name">{{ task.squadName }}</span>
              <span v-else class="link-empty">—</span>
            </td>
            <td>
              <span v-if="task.squadDescription" class="desc-cell" :title="task.squadDescription">
                {{ task.squadDescription }}
              </span>
              <span v-else class="link-empty">—</span>
            </td>
            <td>
              <span class="st" :class="taskStatusMeta(task.status).cls">
                {{ taskStatusMeta(task.status).label }}
              </span>
            </td>
            <td>
              <button
                type="button"
                class="convert-panel__detail-link"
                @click="emit('view-detail', task.taskId)"
              >
                查看详情
              </button>
            </td>
          </tr>
          <tr v-if="tasks.length === 0">
            <td colspan="10" class="empty-row">
              {{
                loading
                  ? '查询中...'
                  : '暂无转换任务，点击右上角「转换为小队」发起第一次转换'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="tasks.length > 0" class="convert-panel__foot">共 {{ tasks.length }} 条</p>
  </section>
</template>

<style scoped>
.convert-panel {
  padding: 18px 0;
}

.convert-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.convert-panel__title {
  margin: 0 0 4px;
  color: #1f2b3d;
  font-size: 15px;
  font-weight: 700;
}

.convert-panel__desc {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.6;
}

.convert-panel__ops {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.convert-panel__loaded {
  color: #8a94a6;
  font-size: 12px;
  white-space: nowrap;
}

.convert-panel__refresh {
  min-height: 30px;
  padding: 4px 14px;
  border: 1px solid var(--hw-control-line, #8593a5);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-text, #334155);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.convert-panel__start-btn {
  min-height: 32px;
  padding: 6px 16px;
  border: 1px solid #2f7df6;
  border-radius: 6px;
  background: #2f7df6;
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.convert-panel__start-btn:hover {
  background: #2569dc;
}

.convert-panel__error {
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid rgb(180 35 24 / 28%);
  border-radius: 8px;
  background: #fdf3f2;
  color: var(--hw-danger, #b42318);
  font-size: 13px;
}

.convert-panel__retry {
  margin-left: 10px;
  padding: 2px 12px;
  border: 1px solid rgb(180 35 24 / 40%);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-danger, #b42318);
  font-size: 12px;
  cursor: pointer;
}

.convert-panel__card {
  margin-top: 14px;
  overflow-x: auto;
  border: 1px solid #e9edf3;
  border-radius: 10px;
  background: #fff;
}

.convert-panel__table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1180px;
}

.convert-panel__table thead th {
  padding: 11px 12px;
  text-align: left;
  background: linear-gradient(180deg, #f8fafd, #f3f6fb);
  border-bottom: 1px solid #e9edf3;
  color: #7b8396;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.3px;
  white-space: nowrap;
  vertical-align: bottom;
}

.th-id {
  min-width: 130px;
}

.th-version {
  min-width: 80px;
}

.th-submitter {
  min-width: 80px;
}

.th-time {
  min-width: 140px;
}

.th-space {
  min-width: 110px;
}

.th-squad {
  min-width: 130px;
}

.th-desc {
  min-width: 200px;
}

.th-status {
  min-width: 90px;
}

.th-actions {
  min-width: 90px;
}

.convert-panel__table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f4f9;
  color: #3b4757;
  font-size: 13px;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.convert-panel__task-id {
  padding: 0;
  border: none;
  background: none;
  color: #2f7df6;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.convert-panel__task-id:hover {
  text-decoration: underline;
}

.version-text {
  color: #5b6b81;
  font-weight: 700;
  font-size: 12px;
}

.squad-name {
  color: #2f5fa8;
  font-weight: 700;
}

.desc-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #5b6b81;
  font-size: 12px;
  line-height: 1.5;
}

.link-empty {
  color: #c3cbd8;
}

.convert-panel__table .st {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.convert-panel__table .st::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.convert-panel__table .st.is-processing {
  background: #eaf3ff;
  color: #2470e0;
}

.convert-panel__table .st.is-success {
  background: #e7f6ec;
  color: #15803d;
}

.convert-panel__table .st.is-fail {
  background: #fdecec;
  color: #b42318;
}

.convert-panel__table .st.is-canceled {
  background: #eef1f6;
  color: #64748b;
}

.convert-panel__detail-link {
  padding: 0;
  border: none;
  background: none;
  color: #2f7df6;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.convert-panel__detail-link:hover {
  text-decoration: underline;
}

.empty-row {
  padding: 28px 12px !important;
  color: #94a3b8 !important;
  text-align: center !important;
}

.convert-panel__foot {
  margin: 10px 2px 0;
  color: #8a94a6;
  font-size: 12px;
}
</style>

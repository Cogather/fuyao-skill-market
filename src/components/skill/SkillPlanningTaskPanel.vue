<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  getSkillTaskAssociation,
  querySkillPlanningTasks,
  updateSkillTaskProgress,
  updateSkillTaskStatus,
  usesRemoteSkillPlanningTasks,
  type SkillPlanningTask,
  type SkillTaskAssociation,
  type SkillTaskStatus,
} from '../../services/skillMarket/skillPlanningTaskService';

type TaskNotice = {
  id: string;
  day: '今天' | '昨天';
  title: string;
  detail: string;
  time: string;
  tone: 'new' | 'change' | 'delete' | 'publish';
};

const props = withDefaults(defineProps<{ userId?: string }>(), { userId: '' });
const tasks = ref<SkillPlanningTask[]>([]);
const loading = ref(false);
const loadError = ref('');
const remoteTasks = usesRemoteSkillPlanningTasks();
let reloadSequence = 0;
const keyword = ref('');
const statusFilter = ref<'all' | SkillTaskStatus>('all');
const page = ref(1);
const pageSize = 10;
const toast = ref('');
const progressDrafts = reactive<Record<string, number>>({});
let toastTimer: number | null = null;

const detailDialog = reactive({
  open: false,
  task: null as SkillPlanningTask | null,
  association: null as SkillTaskAssociation | null,
});

const notices = ref<TaskNotice[]>(
  remoteTasks
    ? []
    : [
        {
          id: 'notice-1',
          day: '今天',
          title: '新增 Skill 任务',
          detail: '接口契约检查 Skill',
          time: '09:30',
          tone: 'new',
        },
        {
          id: 'notice-2',
          day: '昨天',
          title: '负责人发生变化',
          detail: '知识库质量巡检 Skill',
          time: '16:45',
          tone: 'change',
        },
        {
          id: 'notice-3',
          day: '昨天',
          title: 'Skill 被删除',
          detail: '旧版日志聚合 Skill',
          time: '11:20',
          tone: 'delete',
        },
      ],
);

const statusOptions: Array<{ value: SkillTaskStatus; label: string }> = [
  { value: 'todo', label: '未开始' },
  { value: 'inProgress', label: '开发中' },
  { value: 'done', label: '已完成' },
];

const statusCards = computed(() =>
  statusOptions.map((item) => ({
    ...item,
    count: tasks.value.filter((task) => task.status === item.value).length,
  })),
);

const filteredTasks = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
    if (statusFilter.value !== 'all' && task.status !== statusFilter.value) return false;
    if (!text) return true;
    return [task.name, task.department, task.planningDepartment, task.owner, task.description]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / pageSize)));
const pagedTasks = computed(() => {
  const start = (page.value - 1) * pageSize;
  return filteredTasks.value.slice(start, start + pageSize);
});
const pageStart = computed(() =>
  filteredTasks.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1,
);
const pageEnd = computed(() => Math.min(page.value * pageSize, filteredTasks.value.length));
const todayNotices = computed(() => notices.value.filter((notice) => notice.day === '今天'));
const yesterdayNotices = computed(() => notices.value.filter((notice) => notice.day === '昨天'));

async function reload(): Promise<void> {
  const requestSequence = ++reloadSequence;
  loading.value = true;
  loadError.value = '';
  try {
    const nextTasks = await querySkillPlanningTasks(props.userId);
    if (requestSequence !== reloadSequence) return;
    tasks.value = nextTasks;
    tasks.value.forEach((task) => {
      progressDrafts[task.id] = task.progress;
    });
    if (page.value > totalPages.value) page.value = totalPages.value;
  } catch (error) {
    if (requestSequence !== reloadSequence) return;
    tasks.value = [];
    loadError.value = error instanceof Error ? error.message : '待办任务加载失败';
  } finally {
    if (requestSequence === reloadSequence) loading.value = false;
  }
}

function statusLabel(status: SkillTaskStatus): string {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2400);
}

function selectStatus(status: SkillTaskStatus): void {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

function openSkill(task: SkillPlanningTask): void {
  Object.assign(detailDialog, {
    open: true,
    task: { ...task },
    association: getSkillTaskAssociation(task.id),
  });
}

function closeSkill(): void {
  detailDialog.open = false;
}

function goPage(next: number): void {
  page.value = Math.min(totalPages.value, Math.max(1, next));
}

watch([keyword, statusFilter], () => {
  page.value = 1;
});
watch(
  () => props.userId,
  () => void reload(),
);
onMounted(() => void reload());
onBeforeUnmount(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <section class="task-dashboard" aria-label="我的待办任务 Dashboard">
    <header class="dashboard-heading">
      <div>
        <span>MY SKILL TODO CENTER</span>
        <h3>我的 Skill 待办中心</h3>
        <p>聚焦当前登录用户负责的 Skill 任务，完成启动、开发和进度跟踪。</p>
      </div>
      <div class="status-flow" aria-label="任务状态流转">
        <span v-for="(item, index) in statusOptions" :key="item.value">
          <b>{{ item.label }}</b
          ><i v-if="index < statusOptions.length - 1">→</i>
        </span>
      </div>
    </header>

    <div class="metric-grid">
      <button
        v-for="item in statusCards"
        :key="item.value"
        type="button"
        class="metric-card"
        :class="['is-' + item.value, { 'is-active': statusFilter === item.value }]"
        @click="selectStatus(item.value)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
        <small>{{ statusFilter === item.value ? '点击查看全部' : '点击筛选任务' }}</small>
      </button>
    </div>

    <div class="dashboard-body">
      <div class="task-board">
        <header class="task-toolbar">
          <div>
            <strong>我的任务</strong>
            <small>当前用户 {{ props.userId || '加载中' }} · {{ filteredTasks.length }} 项</small>
          </div>
          <div class="task-toolbar__actions">
            <input
              v-model.trim="keyword"
              type="search"
              placeholder="搜索 Skill 名称、部门或负责人"
            />
            <select v-model="statusFilter">
              <option value="all">全部状态</option>
              <option v-for="item in statusOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </div>
        </header>

        <div class="task-table-wrap">
          <table class="task-table">
            <colgroup>
              <col class="task-col-name" />
              <col class="task-col-department" />
              <col class="task-col-owner" />
              <col class="task-col-status" />
              <col class="task-col-updated" />
              <col class="task-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Skill 名称</th>
                <!-- <th title="随责任 Owner 自动变化">Owner 所在部门</th> -->
                <th>规划部门</th>
                <th>负责人</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in pagedTasks" :key="task.id">
                <td>
                  <div class="task-name-cell">
                    <span>{{ task.name.slice(0, 1) }}</span>
                    <div>
                      <strong>{{ task.name }}</strong>
                      <small :title="task.description">{{ task.description }}</small>
                    </div>
                  </div>
                </td>
                <!-- <td>{{ task.department || '待分配' }}</td> -->
                <td>{{ task.planningDepartment || '待明确' }}</td>
                <td>
                  <div class="owner-cell">
                    <strong>{{ task.owner || '我' }}</strong>
                    <small>{{ task.ownerId }}</small>
                  </div>
                </td>
                <td>
                  <span class="status-badge" :class="'is-' + task.status">
                    {{ statusLabel(task.status) }}
                  </span>
                </td>
                <td>{{ formatUpdatedAt(task.updatedAt) }}</td>
                <td>
                  <div class="task-actions">
                    <button type="button" class="is-link" @click="openSkill(task)">
                      查看 Skill
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="pagedTasks.length === 0">
                <td colspan="8" class="task-empty">
                  {{
                    loadError ||
                    (loading
                      ? '待办任务加载中…'
                      : props.userId
                        ? '当前没有符合条件的待办任务'
                        : '正在获取当前用户信息…')
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="task-pagination">
          <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ filteredTasks.length }} 条</span>
          <div>
            <button type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
            <strong>{{ page }} / {{ totalPages }}</strong>
            <button type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">
              下一页
            </button>
          </div>
        </footer>
      </div>

      <aside class="notification-panel" aria-label="最近通知">
        <header>
          <div><span></span><strong>最近通知</strong></div>
          <small>{{ notices.length }} 条</small>
        </header>

        <section>
          <h4>今天</h4>
          <article v-for="notice in todayNotices" :key="notice.id" :class="'is-' + notice.tone">
            <i></i>
            <div>
              <strong>{{ notice.title }}</strong>
              <p>{{ notice.detail }}</p>
            </div>
            <time>{{ notice.time }}</time>
          </article>
        </section>

        <section>
          <h4>昨天</h4>
          <article v-for="notice in yesterdayNotices" :key="notice.id" :class="'is-' + notice.tone">
            <i></i>
            <div>
              <strong>{{ notice.title }}</strong>
              <p>{{ notice.detail }}</p>
            </div>
            <time>{{ notice.time }}</time>
          </article>
        </section>
      </aside>
    </div>

    <Teleport to="body">
      <div
        v-if="detailDialog.open && detailDialog.task"
        class="task-overlay"
        @click.self="closeSkill"
      >
        <div class="skill-detail-dialog">
          <header>
            <div>
              <small>SKILL TASK DETAIL</small>
              <strong>{{ detailDialog.task.name }}</strong>
              <p>{{ detailDialog.task.description }}</p>
            </div>
            <button type="button" aria-label="关闭" @click="closeSkill">×</button>
          </header>

          <div class="detail-status">
            <span class="status-badge" :class="'is-' + detailDialog.task.status">
              {{ statusLabel(detailDialog.task.status) }}
            </span>
            <div><i :style="{ width: detailDialog.task.progress + '%' }"></i></div>
            <strong>{{ detailDialog.task.progress }}%</strong>
          </div>

          <dl>
            <!-- <div>
              <dt>Owner 所在部门</dt>
              <dd>{{ detailDialog.task.department || '待分配' }}</dd>
            </div> -->
            <div>
              <dt>规划部门</dt>
              <dd>{{ detailDialog.task.planningDepartment || '待明确' }}</dd>
            </div>
            <div>
              <dt>负责人</dt>
              <dd>{{ detailDialog.task.owner }}（{{ detailDialog.task.ownerId }}）</dd>
            </div>
            <div>
              <dt>计划完成</dt>
              <dd>{{ detailDialog.task.dueDate || '待排期' }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ formatUpdatedAt(detailDialog.task.updatedAt) }}</dd>
            </div>
            <div>
              <dt>已关联范围</dt>
              <dd>
                场景 {{ detailDialog.association?.sceneIds.length || 0 }} · 活动
                {{ detailDialog.association?.activityIds.length || 0 }} · 部门/服务
                {{
                  (detailDialog.association?.departments.length || 0) +
                  (detailDialog.association?.services.length || 0)
                }}
              </dd>
            </div>
          </dl>

          <footer><button type="button" @click="closeSkill">关闭</button></footer>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="task-toast" role="status">{{ toast }}</div>
  </section>
</template>

<style scoped lang="scss">
.task-dashboard {
  display: grid;
  gap: 18px;
  color: #17233d;
}

.dashboard-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.dashboard-heading > div:first-child > span {
  color: #4266d5;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.dashboard-heading h3 {
  margin: 5px 0 5px;
  color: #101c34;
  font-size: 23px;
  font-weight: 900;
}

.dashboard-heading p {
  margin: 0;
  color: #718097;
  font-size: 12px;
}

.status-flow {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 13px;
  border: 1px solid #e1e7f2;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
}

.status-flow span {
  display: flex;
  align-items: center;
  gap: 9px;
}

.status-flow b {
  color: #66758b;
  font-size: 10px;
  font-weight: 800;
}

.status-flow i {
  color: #aeb8c7;
  font-style: normal;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  position: relative;
  display: grid;
  min-height: 118px;
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid #dfe6f2;
  border-radius: 12px;
  background: #fff;
  color: #26344c;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(34, 50, 81, 0.055);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}

.metric-card::after {
  position: absolute;
  right: -18px;
  bottom: -30px;
  width: 94px;
  height: 94px;
  border-radius: 50%;
  background: var(--metric-color);
  content: '';
  opacity: 0.09;
}

.metric-card:hover,
.metric-card.is-active {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(34, 50, 81, 0.1);
}

.metric-card.is-active {
  border-color: var(--metric-color);
}

.metric-card.is-todo {
  --metric-color: #75839a;
}
.metric-card.is-inProgress {
  --metric-color: #e69a2f;
}
.metric-card.is-done {
  --metric-color: #2f9d72;
}

.metric-card > span {
  color: #758197;
  font-size: 11px;
  font-weight: 800;
}

.metric-card > strong {
  margin-top: 5px;
  color: var(--metric-color);
  font-size: 30px;
  line-height: 1;
}

.metric-card > small {
  align-self: end;
  margin-top: 9px;
  color: #9aa4b2;
  font-size: 9px;
}

.dashboard-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  align-items: start;
  gap: 16px;
}

.task-board,
.notification-panel {
  border: 1px solid #dfe6f1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(35, 52, 84, 0.06);
}

.task-board {
  min-width: 0;
  overflow: hidden;
}

.task-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 17px;
  border-bottom: 1px solid #e9eef5;
}

.task-toolbar > div:first-child {
  display: grid;
  gap: 3px;
}

.task-toolbar > div:first-child strong {
  font-size: 15px;
  font-weight: 900;
}

.task-toolbar > div:first-child small {
  color: #8995a7;
  font-size: 10px;
}

.task-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-toolbar input,
.task-toolbar select {
  height: 36px;
  padding: 0 10px;
  border: 1px solid #d9e1ed;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #40506a;
}

.task-toolbar input {
  width: 260px;
}

.task-table-wrap {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
}

.task-table {
  width: max(100%, 960px);
  border-collapse: collapse;
  table-layout: fixed;
}

.task-col-name {
  width: 34%;
}

.task-col-department {
  width: 16%;
}

.task-col-owner {
  width: 15%;
}

.task-col-status {
  width: 10%;
}

.task-col-updated {
  width: 12%;
}

.task-col-actions {
  width: 13%;
}

.task-table th {
  height: 42px;
  padding: 0 11px;
  border-bottom: 1px solid #e9eef5;
  background: #f8f9fc;
  color: #7f8b9e;
  font-size: 10px;
  font-weight: 800;
  text-align: left;
}

.task-table td {
  height: 70px;
  padding: 8px 11px;
  border-bottom: 1px solid #eff2f7;
  color: #435169;
  font-size: 10px;
}

.task-table th:last-child,
.task-table td:last-child {
  text-align: right;
}

.task-name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.task-name-cell > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #edf3ff;
  color: #4469d1;
  font-weight: 900;
}

.task-name-cell > div,
.owner-cell {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.task-name-cell strong,
.task-name-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-name-cell strong {
  color: #223149;
  font-size: 11px;
}

.task-name-cell small,
.owner-cell small {
  color: #8b96a7;
  font-size: 9px;
}

.owner-cell strong {
  color: #3c4a61;
  font-size: 10px;
}

.status-badge {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 99px;
  background: #f1f3f7;
  color: #68778d;
  font-size: 9px;
  font-weight: 900;
}

.status-badge.is-inProgress {
  background: #fff3df;
  color: #b06a18;
}

.status-badge.is-done {
  background: #eaf8f1;
  color: #27815d;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-cell > div,
.detail-status > div {
  height: 6px;
  overflow: hidden;
  flex: 1;
  border-radius: 99px;
  background: #e9edf3;
}

.progress-cell i,
.detail-status i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5478e4, #49a8dc);
}

.progress-input {
  display: inline-flex;
  align-items: center;
  flex: 0 0 64px;
  box-sizing: border-box;
  width: 64px;
  height: 28px;
  overflow: hidden;
  padding: 0 8px;
  border: 1px solid #cfd8ea;
  border-radius: 6px;
  background: #fff;
  color: #53627a;
  font-size: 10px;
  font-weight: 700;
}

.progress-input:focus-within {
  border-color: #5478e4;
  box-shadow: 0 0 0 2px rgba(84, 120, 228, 0.12);
}

.progress-input input {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  appearance: textfield;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: right;
}

.progress-input input::-webkit-inner-spin-button,
.progress-input input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.progress-cell strong {
  width: 30px;
  color: #53627a;
  font-size: 9px;
}

.task-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 4px;
  white-space: nowrap;
}

.task-actions button {
  height: 28px;
  padding: 0 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 9px;
  font-weight: 800;
  cursor: pointer;
}

.task-actions .is-secondary {
  border: 1px solid #cfd8ea;
  background: #fff;
  color: #466de0;
}

.task-actions .is-primary {
  background: #466de0;
  color: #fff;
}

.task-actions .is-link {
  color: #536da8;
}

.task-actions .is-link:hover {
  background: #f0f3f9;
}

.task-empty {
  height: 150px !important;
  color: #909bab !important;
  text-align: center;
}

.task-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  padding: 0 16px;
  border-top: 1px solid #edf1f6;
  color: #8b96a7;
  font-size: 9px;
}

.task-pagination > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-pagination button {
  height: 28px;
  padding: 0 9px;
  border: 1px solid #dce3ed;
  border-radius: 6px;
  background: #fff;
  color: #536178;
  font-size: 9px;
  cursor: pointer;
}

.task-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.notification-panel {
  padding: 17px;
}

.notification-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf0f5;
}

.notification-panel > header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-panel > header > div > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5578df;
  box-shadow: 0 0 0 4px rgba(85, 120, 223, 0.12);
}

.notification-panel > header strong {
  font-size: 14px;
}

.notification-panel > header small {
  color: #98a2b1;
  font-size: 9px;
}

.notification-panel section {
  margin-top: 15px;
}

.notification-panel h4 {
  margin: 0 0 8px;
  color: #98a2b1;
  font-size: 9px;
  font-weight: 900;
}

.notification-panel article {
  position: relative;
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  gap: 8px;
  padding: 9px 0;
}

.notification-panel article i {
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
  background: #7891da;
}

.notification-panel article.is-new i {
  background: #35a67a;
}
.notification-panel article.is-delete i {
  background: #df5b64;
}
.notification-panel article.is-publish i {
  background: #5476db;
}
.notification-panel article.is-change i {
  background: #e2a03e;
}

.notification-panel article div {
  min-width: 0;
}

.notification-panel article strong {
  display: block;
  color: #3f4c62;
  font-size: 10px;
}

.notification-panel article p {
  margin: 3px 0 0;
  overflow: hidden;
  color: #7d899c;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-panel time {
  color: #a0a9b7;
  font-size: 8px;
}

.task-overlay {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}

.skill-detail-dialog {
  width: min(650px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}

.skill-detail-dialog > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
}

.skill-detail-dialog > header > div {
  display: grid;
  gap: 4px;
}

.skill-detail-dialog > header small {
  color: #4c70d9;
  font-size: 9px;
  font-weight: 900;
}

.skill-detail-dialog > header strong {
  color: #1c2940;
  font-size: 20px;
}

.skill-detail-dialog > header p {
  margin: 2px 0 0;
  color: #7e8a9c;
  font-size: 11px;
  line-height: 1.7;
}

.skill-detail-dialog > header > button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f4f8;
  color: #71809a;
  font-size: 20px;
  cursor: pointer;
}

.detail-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  padding: 13px;
  border-radius: 9px;
  background: #f8f9fc;
}

.detail-status > div {
  max-width: 320px;
}

.detail-status > strong {
  color: #53627a;
  font-size: 11px;
}

.skill-detail-dialog dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skill-detail-dialog dl > div {
  padding: 12px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
}

.skill-detail-dialog dl > div:last-child {
  grid-column: 1 / -1;
}

.skill-detail-dialog dt {
  color: #8c97a8;
  font-size: 9px;
}

.skill-detail-dialog dd {
  margin: 5px 0 0;
  color: #3e4c63;
  font-size: 11px;
  font-weight: 750;
}

.skill-detail-dialog footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.skill-detail-dialog footer button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid #d9e1ec;
  border-radius: 7px;
  background: #fff;
  color: #536178;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.task-toast {
  position: fixed;
  left: 50%;
  bottom: 30px;
  z-index: 990;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 99px;
  background: rgba(25, 34, 51, 0.92);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 1180px) {
  .dashboard-body {
    grid-template-columns: 1fr;
  }

  .notification-panel {
    display: grid;
    grid-template-columns: auto repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .notification-panel > header {
    align-self: stretch;
    border-right: 1px solid #edf0f5;
    border-bottom: 0;
  }

  .notification-panel section {
    margin-top: 0;
  }
}

@media (max-width: 820px) {
  .dashboard-heading,
  .task-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .status-flow {
    overflow-x: auto;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-toolbar__actions {
    display: grid;
    grid-template-columns: 1fr 130px;
  }

  .task-toolbar input {
    width: 100%;
    box-sizing: border-box;
  }

  .notification-panel {
    display: block;
  }

  .notification-panel > header {
    border-right: 0;
    border-bottom: 1px solid #edf0f5;
  }

  .notification-panel section {
    margin-top: 15px;
  }
}

@media (max-width: 560px) {
  .metric-grid,
  .skill-detail-dialog dl {
    grid-template-columns: 1fr;
  }

  .skill-detail-dialog dl > div:last-child {
    grid-column: auto;
  }

  .task-pagination {
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
  }
}

/* Responsive task typography for wide screens */
@media (min-width: 1440px) {
  .task-toolbar > div:first-child strong,
  .notification-panel > header strong {
    font-size: clamp(14px, 0.86vw, 17px);
  }

  .task-toolbar > div:first-child small,
  .task-table th,
  .task-table td,
  .owner-cell strong,
  .status-badge,
  .progress-input,
  .task-actions button,
  .notification-panel article strong {
    font-size: clamp(10px, 0.625vw, 13px);
  }

  .task-name-cell strong {
    font-size: clamp(11px, 0.7vw, 14px);
  }

  .task-name-cell small,
  .owner-cell small,
  .progress-cell > strong,
  .notification-panel h4,
  .notification-panel article p,
  .notification-panel time,
  .task-pagination {
    font-size: clamp(9px, 0.56vw, 12px);
  }

  .progress-input {
    flex-basis: clamp(64px, 4vw, 76px);
    width: clamp(64px, 4vw, 76px);
  }

  .task-actions button {
    height: clamp(28px, 1.8vw, 34px);
    padding-inline: clamp(7px, 0.5vw, 10px);
  }
}
</style>

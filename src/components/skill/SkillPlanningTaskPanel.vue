<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  latestPlanningTaskVersion,
  planningTaskCapabilityLabel,
  queryPlanningTasks,
  usesRemotePlanningTasks,
  type PlanningTaskCapabilityType,
  type SkillPlanningTask,
} from '../../services/skillMarket/skillPlanningTaskService';
import {
  planningTaskDetailVersions,
  queryPlanningTaskDetailFileContent,
  queryPlanningTaskDetailFilePaths,
  type PlanningTaskDetailIdentity,
} from '../../services/skillMarket/planningTaskDetailService';

type TaskNotice = {
  id: string;
  day: '今天' | '昨天';
  title: string;
  detail: string;
  time: string;
  tone: 'new' | 'change' | 'delete' | 'publish';
};

const props = withDefaults(
  defineProps<{ userId?: string; capabilityType?: PlanningTaskCapabilityType }>(),
  { userId: '', capabilityType: 'skill' },
);
const capabilityLabel = computed(() => planningTaskCapabilityLabel(props.capabilityType));
const capabilityLabelUpper = computed(() => capabilityLabel.value.toUpperCase());
const tasks = ref<SkillPlanningTask[]>([]);
const loading = ref(false);
const loadError = ref('');
const remoteTasks = usesRemotePlanningTasks();
let reloadSequence = 0;
const keyword = ref('');
const page = ref(1);
const pageSize = 10;
const toast = ref('');
const progressDrafts = reactive<Record<string, number>>({});
let toastTimer: number | null = null;

const detailDialog = reactive({
  open: false,
  task: null as SkillPlanningTask | null,
  versions: [] as string[],
  selectedVersion: '',
});
const selectedDetailVersion = computed(() => {
  const task = detailDialog.task;
  const selectedVersion = detailDialog.selectedVersion.trim();
  if (!task || !selectedVersion) return null;
  return [task, ...tasks.value.filter((item) => item.id !== task.id && item.name === task.name)]
    .flatMap((item) => item.versions)
    .find((item) => item.version === selectedVersion) ?? null;
});
type DetailFileState = {
  path: string;
  content: string;
  loaded: boolean;
  loading: boolean;
  error: string;
};
const detailFiles = ref<DetailFileState[]>([]);
const detailLoading = ref(false);
const detailError = ref('');
const expandedDetailFilePath = ref('');
const detailCapabilityExpanded = ref(true);
let detailLoadSequence = 0;

const notices = ref<TaskNotice[]>(
  remoteTasks
    ? []
    : [
        {
          id: 'notice-1',
          day: '今天',
          title: `新增 ${capabilityLabel.value} 任务`,
          detail: `接口契约检查 ${capabilityLabel.value}`,
          time: '09:30',
          tone: 'new',
        },
        {
          id: 'notice-2',
          day: '昨天',
          title: '负责人发生变化',
          detail: `知识库质量巡检 ${capabilityLabel.value}`,
          time: '16:45',
          tone: 'change',
        },
        {
          id: 'notice-3',
          day: '昨天',
          title: `${capabilityLabel.value} 被删除`,
          detail: `旧版日志聚合 ${capabilityLabel.value}`,
          time: '11:20',
          tone: 'delete',
        },
      ],
);

const statusCards = computed(() => {
  const statusCounts = new Map<string, number>();

  tasks.value.forEach((task) => {
    const status = String(task.status ?? '').trim() || '未设置';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  });

  return Array.from(statusCounts, ([status, count]) => ({ status, count }));
});

const filteredTasks = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
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
    const nextTasks = await queryPlanningTasks(props.capabilityType, props.userId);
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

function formatDetailUpdatedAt(value: string): string {
  const matched = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (matched) {
    const [, year, month, day, hour, minute, second = '00'] = matched;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
  return value || '—';
}

function displayTaskVersion(task: SkillPlanningTask): string {
  return latestPlanningTaskVersion(task)?.version || '—';
}

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2400);
}

function detailIdentity(): PlanningTaskDetailIdentity | null {
  const task = detailDialog.task;
  const version = detailDialog.selectedVersion.trim();
  if (!task || !version) return null;
  return {
    userId: props.userId.trim(),
    capabilityType: props.capabilityType,
    capabilityName: task.name,
    version,
    filePath: task.filePath,
  };
}

function detailErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function loadDetailFile(file: DetailFileState, sequence = detailLoadSequence): Promise<void> {
  const identity = detailIdentity();
  if (!identity || file.loaded || file.loading) return;
  file.loading = true;
  file.error = '';
  try {
    const content = await queryPlanningTaskDetailFileContent(identity, file.path);
    if (sequence !== detailLoadSequence) return;
    file.content = content;
    file.loaded = true;
  } catch (error) {
    if (sequence !== detailLoadSequence) return;
    file.error = detailErrorMessage(error, '文件内容加载失败');
  } finally {
    if (sequence === detailLoadSequence) file.loading = false;
  }
}

async function loadDetailVersion(): Promise<void> {
  const identity = detailIdentity();
  const sequence = ++detailLoadSequence;
  detailFiles.value = [];
  expandedDetailFilePath.value = '';
  detailError.value = '';
  if (!identity) {
    detailError.value = '暂无可用版本';
    return;
  }

  detailLoading.value = true;
  try {
    const paths = await queryPlanningTaskDetailFilePaths(identity);
    if (sequence !== detailLoadSequence) return;
    detailFiles.value = paths.map((path) => ({
      path,
      content: '',
      loaded: false,
      loading: false,
      error: '',
    }));
    const firstFile = detailFiles.value[0];
    if (firstFile) {
      expandedDetailFilePath.value = firstFile.path;
      await loadDetailFile(firstFile, sequence);
    }
  } catch (error) {
    if (sequence !== detailLoadSequence) return;
    detailError.value = detailErrorMessage(error, '详情加载失败');
  } finally {
    if (sequence === detailLoadSequence) detailLoading.value = false;
  }
}

async function toggleDetailFile(file: DetailFileState): Promise<void> {
  if (expandedDetailFilePath.value === file.path) {
    expandedDetailFilePath.value = '';
    return;
  }
  expandedDetailFilePath.value = file.path;
  await loadDetailFile(file);
}

function openTask(task: SkillPlanningTask): void {
  const versions = planningTaskDetailVersions(task, tasks.value);
  const selectedVersion = versions[0] ?? '';
  Object.assign(detailDialog, {
    open: true,
    task: { ...task },
    versions,
    selectedVersion,
  });
  detailCapabilityExpanded.value = true;
  if (selectedVersion) void loadDetailVersion();
}

function closeTask(): void {
  detailLoadSequence += 1;
  detailDialog.open = false;
  detailDialog.task = null;
  detailFiles.value = [];
  detailLoading.value = false;
  detailError.value = '';
  expandedDetailFilePath.value = '';
}

function goPage(next: number): void {
  page.value = Math.min(totalPages.value, Math.max(1, next));
}

watch(keyword, () => {
  page.value = 1;
});
watch([() => props.userId, () => props.capabilityType], () => void reload());
onMounted(() => void reload());
onBeforeUnmount(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <section class="task-dashboard" :aria-label="`我的 ${capabilityLabel} 待办任务 Dashboard`">
    <header class="dashboard-heading">
      <div>
        <span>MY {{ capabilityLabelUpper }} TODO CENTER</span>
        <h3>我的 {{ capabilityLabel }} 待办中心</h3>
        <p>聚焦当前登录用户负责的 {{ capabilityLabel }} 任务，完成启动、开发和进度跟踪。</p>
      </div>
    </header>

    <div class="metric-grid">
      <article v-for="item in statusCards" :key="item.status" class="metric-card">
        <span>{{ item.status }}</span>
        <strong>{{ item.count }}</strong>
        <small>后端状态统计</small>
      </article>
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
              :placeholder="`搜索 ${capabilityLabel} 名称、部门或负责人`"
            />
          </div>
        </header>

        <div class="task-table-wrap">
          <table class="task-table">
            <colgroup>
              <col class="task-col-name" />
              <col class="task-col-department" />
              <col class="task-col-owner" />
              <col class="task-col-status" />
              <col class="task-col-version" />
              <col class="task-col-updated" />
              <col class="task-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>{{ capabilityLabel }} 名称</th>
                <!-- <th title="随责任 Owner 自动变化">Owner 所在部门</th> -->
                <th>规划部门</th>
                <th>负责人</th>
                <th>状态</th>
                <th>版本</th>
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
                  <span
                    class="status-badge"
                    :class="{
                      'is-done': task.status === '已完成',
                      'is-inProgress': task.status === '进行中',
                    }"
                  >
                    {{ task.status || '—' }}
                  </span>
                </td>
                <td>
                  <span class="task-version">{{ displayTaskVersion(task) }}</span>
                </td>
                <td>{{ formatUpdatedAt(task.updatedAt) }}</td>
                <td>
                  <div class="task-actions">
                    <button type="button" class="is-link" @click="openTask(task)">
                      查看 {{ capabilityLabel }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="pagedTasks.length === 0">
                <td colspan="7" class="task-empty">
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
    </div>

    <Teleport to="body">
      <div
        v-if="detailDialog.open && detailDialog.task"
        class="task-overlay"
        @click.self="closeTask"
      >
        <div
          class="skill-detail-dialog"
          :class="{ 'is-basic-only': detailDialog.versions.length === 0 }"
          role="dialog"
          aria-modal="true"
          :aria-label="`${detailDialog.task.name} 详情`"
        >
          <header>
            <div class="skill-detail-dialog__heading">
              <small>{{ capabilityLabelUpper }} TASK DETAIL</small>
              <strong>{{ detailDialog.task.name }}</strong>
              <p>{{ detailDialog.task.description }}</p>
            </div>
            <div class="skill-detail-dialog__meta">
              <div>
                <span>规划部门或产品</span>
                <strong>{{
                  detailDialog.task.dimName ||
                  detailDialog.task.planningDepartment ||
                  detailDialog.task.department ||
                  '—'
                }}</strong>
              </div>
              <div>
                <span>负责人</span>
                <strong>{{ detailDialog.task.ownerName || detailDialog.task.owner || '—' }}</strong>
              </div>
            </div>
            <div class="skill-detail-dialog__actions">
              <span
                class="status-badge"
                :class="{
                  'is-done': detailDialog.task.status === '已完成',
                  'is-inProgress': detailDialog.task.status === '进行中',
                }"
              >
                {{ detailDialog.task.status || '—' }}
              </span>
              <button type="button" aria-label="关闭" @click="closeTask">×</button>
            </div>
          </header>

          <label v-if="detailDialog.versions.length > 0" class="task-detail-version-filter">
            <span class="task-detail-version-filter__copy">
              <strong>版本</strong>
              <small>选择版本后展示对应的目录和文件内容</small>
            </span>
            <select
              v-model="detailDialog.selectedVersion"
              aria-label="详情版本"
              :disabled="detailDialog.versions.length === 0"
              @change="loadDetailVersion"
            >
              <option v-for="version in detailDialog.versions" :key="version" :value="version">
                {{ version }}
              </option>
            </select>
            <span class="task-detail-version-filter__updated">
              <small>更新时间</small>
              <strong>{{ formatDetailUpdatedAt(selectedDetailVersion?.uploadedAt || '') }}</strong>
            </span>
          </label>

          <section
            v-if="detailDialog.versions.length > 0"
            class="task-detail-capability"
            :aria-label="`${capabilityLabel} 详情内容`"
          >
            <div class="task-detail-capability-row">
              <button
                type="button"
                class="task-detail-toggle task-detail-capability-toggle"
                :aria-expanded="detailCapabilityExpanded"
                :aria-label="
                  detailCapabilityExpanded ? `收起 ${capabilityLabel}` : `展开 ${capabilityLabel}`
                "
                @click="detailCapabilityExpanded = !detailCapabilityExpanded"
              >
                <span class="task-detail-caret" :class="{ 'is-open': detailCapabilityExpanded }"
                  >›</span
                >
              </button>
              <strong>{{ detailDialog.task.name }}</strong>
              <span class="task-detail-selected-version">
                {{ detailDialog.selectedVersion || '—' }}
              </span>
            </div>

            <div v-if="detailCapabilityExpanded" class="task-detail-content">
              <div v-if="detailLoading" class="task-detail-state">正在加载详情…</div>
              <div v-else-if="detailError" class="task-detail-state is-error">
                <span>{{ detailError }}</span>
                <button type="button" @click="loadDetailVersion">重试</button>
              </div>
              <template v-else-if="props.capabilityType === 'skill'">
                <ul v-if="detailFiles.length" class="task-detail-file-list">
                  <li v-for="file in detailFiles" :key="file.path">
                    <button
                      type="button"
                      class="task-detail-file-row"
                      :class="{ 'is-open': expandedDetailFilePath === file.path }"
                      @click="toggleDetailFile(file)"
                    >
                      <span class="task-detail-caret">›</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 3.5h8l4 4V20H6V3.5Z" />
                        <path d="M14 3.5v4h4" />
                      </svg>
                      <span>{{ file.path }}</span>
                    </button>
                    <pre
                      v-if="expandedDetailFilePath === file.path"
                      class="task-detail-file-content"
                      >{{ file.loading ? '正在加载…' : file.error || file.content || '(空)' }}</pre>
                  </li>
                </ul>
                <div v-else class="task-detail-state">暂无文件</div>
              </template>
              <pre v-else-if="detailFiles[0]" class="task-detail-file-content is-direct">{{
                detailFiles[0].loading
                  ? '正在加载…'
                  : detailFiles[0].error || detailFiles[0].content || '(空)'
              }}</pre>
              <div v-else class="task-detail-state">暂无文件</div>
            </div>
          </section>

          <footer v-if="detailDialog.versions.length > 0">
            <button type="button" @click="closeTask">关闭</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="toast" class="task-toast" data-app-toast role="status" aria-live="polite">
        {{ toast }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
.task-dashboard {
  display: grid;
  width: 100%;
  min-width: 0;
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.metric-card {
  --metric-color: #6079df;
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
  cursor: default;
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

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(34, 50, 81, 0.1);
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
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  width: 100%;
}

.task-board,
.notification-panel {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
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

.task-toolbar input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid #d9e1ed;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #40506a;
}

.task-toolbar input {
  width: clamp(260px, 30vw, 420px);
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
  width: 31%;
}

.task-col-department {
  width: 15%;
}

.task-col-owner {
  width: 14%;
}

.task-col-status {
  width: 10%;
}

.task-col-version {
  width: 8%;
}

.task-col-updated {
  width: 11%;
}

.task-col-actions {
  width: 11%;
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
  gap: 5px;
  border: 1px solid #c5d7ff;
  background: linear-gradient(135deg, #f1f6ff, #e7efff);
  color: #3156b5;
  box-shadow: 0 2px 8px rgba(70, 109, 224, 0.1);
}

.status-badge.is-inProgress::before {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #5b7fe5;
  box-shadow: 0 0 0 3px rgba(91, 127, 229, 0.12);
  content: '';
}

.status-badge.is-done {
  gap: 5px;
  border: 1px solid #bce8d1;
  background: linear-gradient(135deg, #effaf4, #e4f6ed);
  color: #18794e;
  box-shadow: 0 2px 8px rgba(39, 129, 93, 0.1);
}

.status-badge.is-done::before {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #2fac78;
  box-shadow: 0 0 0 3px rgba(47, 172, 120, 0.12);
  content: '';
}

.task-version {
  color: #53627a;
  font-weight: 700;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-cell > div {
  height: 6px;
  overflow: hidden;
  flex: 1;
  border-radius: 99px;
  background: #e9edf3;
}

.progress-cell i {
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
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: min(1040px, calc(100vw - 32px));
  height: min(820px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}

.skill-detail-dialog.is-basic-only {
  height: auto;
}

.skill-detail-dialog > header {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(320px, 0.9fr) auto;
  align-items: center;
  flex: 0 0 auto;
  gap: 22px;
}

.skill-detail-dialog__heading {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.skill-detail-dialog__heading > small {
  color: #4c70d9;
  font-size: 9px;
  font-weight: 900;
}

.skill-detail-dialog__heading > strong {
  color: #1c2940;
  font-size: 20px;
}

.skill-detail-dialog__heading > p {
  margin: 2px 0 0;
  color: #7e8a9c;
  font-size: 11px;
  line-height: 1.7;
}

.skill-detail-dialog__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skill-detail-dialog__meta > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding-left: 12px;
  border-left: 2px solid #e1e8f5;
}

.skill-detail-dialog__meta span {
  color: #8c97a8;
  font-size: 9px;
  line-height: 1.4;
}

.skill-detail-dialog__meta strong {
  overflow: hidden;
  color: #34435c;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-detail-dialog__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  padding-right: 48px;
}

.skill-detail-dialog__actions > button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f4f8;
  color: #71809a;
  font-size: 20px;
  cursor: pointer;
}

.task-detail-version-filter {
  display: grid;
  grid-template-columns: minmax(190px, 0.8fr) minmax(280px, 1.25fr) minmax(180px, 0.75fr);
  align-items: center;
  flex: 0 0 auto;
  gap: 12px;
  margin-top: 20px;
  padding: 8px 14px;
  border: 1px solid #dfe6f2;
  border-radius: 10px;
  background: #f8faff;
}

.task-detail-version-filter__copy,
.task-detail-version-filter__updated {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.task-detail-version-filter__copy > strong {
  color: #34435d;
  font-size: 11px;
  font-weight: 850;
}

.task-detail-version-filter__copy > small,
.task-detail-version-filter__updated > small {
  color: #8c98aa;
  font-size: 9px;
  line-height: 1.45;
}

.task-detail-version-filter__updated {
  padding-left: 14px;
  border-left: 1px solid #dfe6f2;
}

.task-detail-version-filter__updated > strong {
  color: #3e4c63;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.5;
}

.task-detail-version-filter select {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 34px 0 11px;
  border: 1px solid #cfd9ea;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #33435c;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
}

.task-detail-version-filter select:focus {
  border-color: #6684e3;
  box-shadow: 0 0 0 3px rgba(84, 120, 228, 0.12);
}

.task-detail-capability {
  display: flex;
  min-height: 0;
  margin-top: 18px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dfe6f1;
  border-radius: 10px;
  background: #fff;
}

.task-detail-capability-row,
.task-detail-file-row {
  display: flex;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
  text-align: left;
}

.task-detail-capability-row {
  flex: 0 0 auto;
  gap: 9px;
  min-height: 50px;
  padding: 0 16px;
  border-bottom: 1px solid #edf1f6;
}

.task-detail-capability-row > strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #25344c;
  font-size: 12px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail-toggle {
  display: inline-grid;
  width: 22px;
  height: 28px;
  place-items: center;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.task-detail-toggle:hover,
.task-detail-toggle:focus-visible {
  outline: 0;
  background: #eaf0fb;
}

.task-detail-caret {
  display: inline-block;
  width: 12px;
  flex: 0 0 auto;
  color: #8795aa;
  font-size: 16px;
  line-height: 1;
  transition: transform 160ms ease;
}

.task-detail-caret.is-open,
.task-detail-file-row.is-open .task-detail-caret {
  transform: rotate(90deg);
}

.task-detail-selected-version {
  flex: 0 0 auto;
  color: #16a34a;
  font-size: 11px;
  font-weight: 850;
}

.task-detail-content {
  min-height: 0;
  padding: 10px 16px 16px 40px;
  overflow-y: auto;
  flex: 1;
  background: #fff;
  scrollbar-color: #aab6c9 transparent;
  scrollbar-width: thin;
}

.task-detail-content::-webkit-scrollbar {
  width: 7px;
}

.task-detail-content::-webkit-scrollbar-thumb {
  border-radius: 99px;
  background: #aab6c9;
}

.task-detail-content::-webkit-scrollbar-track {
  background: transparent;
}

.task-detail-state {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #8b97a9;
  font-size: 11px;
}

.task-detail-state.is-error {
  color: #c2413c;
}

.task-detail-state button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d7dfeb;
  border-radius: 6px;
  background: #fff;
  color: #536da8;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.task-detail-file-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-detail-file-row {
  gap: 7px;
  min-height: 34px;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #627087;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.task-detail-file-row:hover,
.task-detail-file-row.is-open {
  background: #f5f8fe;
  color: #26354d;
}

.task-detail-file-row svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: #eef2ff;
  stroke: #8797b4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.task-detail-file-row .task-detail-caret {
  display: inline-flex;
  height: 18px;
  align-items: center;
  justify-content: center;
  line-height: 18px;
  transform-origin: center;
}

.task-detail-file-row > span:last-child {
  overflow: hidden;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail-file-content {
  margin: 5px 0 9px 27px;
  padding: 13px 15px;
  overflow: visible;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fbfcff;
  color: #17233d;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-detail-file-content.is-direct {
  margin: 0;
}

.skill-detail-dialog footer {
  display: flex;
  flex: 0 0 auto;
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
    grid-template-columns: minmax(0, 1fr);
  }

  .task-toolbar input {
    width: 100%;
    box-sizing: border-box;
  }

  .task-detail-version-filter {
    grid-template-columns: 1fr;
  }

  .skill-detail-dialog > header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }

  .skill-detail-dialog__meta {
    grid-column: 1 / -1;
  }

  .task-detail-version-filter__updated {
    padding: 8px 0 0;
    border-top: 1px solid #dfe6f2;
    border-left: 0;
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
  .metric-grid {
    grid-template-columns: 1fr;
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

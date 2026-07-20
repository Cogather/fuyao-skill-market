<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import MarketDeptCascader from '../../components/skill/MarketDeptCascader.vue';
import type { MarketDeptCascaderNode } from '../../components/skill/MarketDeptCascader.vue';
import {
  mockDeptSkills,
  mockPublishTargetOrgs,
  mockPublishTasks,
  type DeptSkillCommentItem,
  type DeptSkillRow,
  type PublishTask,
  type PublishTaskSkill,
  type PublishTargetOrg,
} from '../../services/skillMarket/deptSkillReviewMock';

const props = withDefaults(
  defineProps<{
    /** 当前管理员工号（来自父级 userId） */
    userId?: string;
    /** 部门树（复用市场总览等部门级联树，与评审/规划页一致） */
    departmentTree?: MarketDeptCascaderNode[];
  }>(),
  {
    userId: '',
    departmentTree: () => [],
  },
);

const emit = defineEmits<{
  /** 点击 Skill 名称查看详情（沿用现有详情路由） */
  'open-skill-detail': [skillId: string];
  toast: [message: string];
}>();

/** 部门级联选中的路径段（如 ['部门1','平台产品线']），空数组表示全部 */
const selectedDeptSegments = ref<string[]>([]);
const skillRows = ref<DeptSkillRow[]>(mockDeptSkills.map((row) => ({ ...row })));
const publishTargetOrgs = ref<PublishTargetOrg[]>([...mockPublishTargetOrgs]);
const publishTasks = ref<PublishTask[]>(mockPublishTasks.map((task) => ({ ...task })));

type DeptReviewSubTab = 'skills' | 'tasks';
const activeSubTab = ref<DeptReviewSubTab>('skills');

const sortKey = ref<'downloads' | 'access' | 'aiScore' | 'expertScore'>('downloads');
const sortOrder = ref<'desc' | 'asc'>('desc');
const selectedSkillIds = ref<Set<string>>(new Set());

/** 待发布清单分页 */
const skillsPage = reactive({ pageNum: 1, pageSize: 10 });
/** 发布任务清单分页 */
const tasksPage = reactive({ pageNum: 1, pageSize: 10 });

const publishDialogOpen = ref(false);
const publishTargetOrgId = ref<string>('');
const publishing = ref(false);

const taskDetailOpen = ref(false);
const taskDetailTarget = ref<PublishTask | null>(null);
/** 任务详情弹窗 · Skill 清单增量渲染：已渲染条数 */
const taskSkillsVisible = ref(20);
const TASK_SKILLS_PAGE_SIZE = 20;
const taskSkillsScrollRef = ref<HTMLElement | null>(null);
/** owner 审批意见输入（驳回时必填） */
const taskApprovalInput = ref('');
/** owner 审批处理中，防止重复提交 */
const taskProcessing = ref(false);

/** 意见列表弹窗：展示某 Skill 的全部评审意见 / 一键发布申请 */
const commentsOpen = ref(false);
const commentsTarget = ref<DeptSkillRow | null>(null);
const draftComment = ref('');
const savingComment = ref(false);
/** 正在处理（关闭/驳回）的意见 ID */
const processingCommentId = ref<string>('');

const filteredSkills = computed(() => {
  let list = [...skillRows.value];
  const segs = selectedDeptSegments.value;
  if (segs.length > 0) {
    list = list.filter((row) => {
      const parts = row.deptPath.split(' / ');
      if (parts.length < segs.length) {
        return false;
      }
      return segs.every((seg, i) => parts[i] === seg);
    });
  }
  const dir = sortOrder.value === 'desc' ? -1 : 1;
  if (sortKey.value === 'downloads') {
    list.sort((a, b) => (a.downloads - b.downloads) * dir);
  } else if (sortKey.value === 'access') {
    list.sort((a, b) => (a.totalAccess - b.totalAccess) * dir);
  } else if (sortKey.value === 'aiScore') {
    list.sort((a, b) => ((a.aiScore ?? -1) - (b.aiScore ?? -1)) * dir);
  } else if (sortKey.value === 'expertScore') {
    list.sort((a, b) => ((a.expertScore ?? -1) - (b.expertScore ?? -1)) * dir);
  }
  return list;
});

/** 当前页的 Skill 列表 */
const pagedSkills = computed(() => {
  const start = (skillsPage.pageNum - 1) * skillsPage.pageSize;
  return filteredSkills.value.slice(start, start + skillsPage.pageSize);
});

const skillsTotalPages = computed(() =>
  Math.max(1, Math.ceil(filteredSkills.value.length / skillsPage.pageSize)),
);

/** 当前页的任务列表 */
const pagedTasks = computed(() => {
  const start = (tasksPage.pageNum - 1) * tasksPage.pageSize;
  return filteredTasks.value.slice(start, start + tasksPage.pageSize);
});

const tasksTotalPages = computed(() =>
  Math.max(1, Math.ceil(filteredTasks.value.length / tasksPage.pageSize)),
);

const selectedSkills = computed(() =>
  filteredSkills.value.filter((row) => selectedSkillIds.value.has(row.id)),
);

const selectedCount = computed(() => selectedSkills.value.length);

const allFilteredSelected = computed(
  () =>
    filteredSkills.value.length > 0 &&
    filteredSkills.value.every((row) => selectedSkillIds.value.has(row.id)),
);

/** 发布任务清单 · 状态筛选 */
const taskStatusFilter = ref<'all' | 'pending_owner' | 'approved' | 'rejected'>('all');
/** 发布任务清单 · 创建时间排序 */
const taskTimeSort = ref<'desc' | 'asc'>('desc');

const filteredTasks = computed(() => {
  let list = [...publishTasks.value];
  if (taskStatusFilter.value !== 'all') {
    list = list.filter((t) => t.status === taskStatusFilter.value);
  }
  const dir = taskTimeSort.value === 'desc' ? -1 : 1;
  list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) * dir);
  return list;
});

function showToast(message: string): void {
  emit('toast', message);
}

function toggleSkillSelection(id: string): void {
  const next = new Set(selectedSkillIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedSkillIds.value = next;
}

function toggleSelectAll(): void {
  if (allFilteredSelected.value) {
    selectedSkillIds.value = new Set();
    return;
  }
  selectedSkillIds.value = new Set(filteredSkills.value.map((row) => row.id));
}

/** 打开某 Skill 的意见列表弹窗 */
function openCommentsDialog(row: DeptSkillRow): void {
  commentsTarget.value = row;
  draftComment.value = '';
  savingComment.value = false;
  processingCommentId.value = '';
  commentsOpen.value = true;
}

function closeCommentsDialog(): void {
  if (savingComment.value || processingCommentId.value) {
    return;
  }
  commentsOpen.value = false;
  commentsTarget.value = null;
  draftComment.value = '';
}

const commentsTargetRow = computed(() => {
  const target = commentsTarget.value;
  if (!target) {
    return null;
  }
  return skillRows.value.find((row) => row.id === target.id) ?? null;
});

/** 提交一条新的评审意见（我提交的） */
async function submitReviewComment(): Promise<void> {
  const target = commentsTarget.value;
  if (!target) {
    return;
  }
  const content = draftComment.value.trim();
  if (!content) {
    showToast('请填写评审意见内容');
    return;
  }
  savingComment.value = true;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const idx = skillRows.value.findIndex((row) => row.id === target.id);
  if (idx >= 0) {
    const item: DeptSkillCommentItem = {
      id: `cm-${Date.now()}`,
      type: 'review',
      submitter: '当前管理员',
      submitterId: 'admin',
      content,
      status: 'processing',
      createdAt: formatNow(),
      isMine: true,
    };
    skillRows.value[idx] = {
      ...skillRows.value[idx],
      comments: [...skillRows.value[idx].comments, item],
    };
  }
  showToast(`已提交「${target.name}」的评审意见，已在个人发布中标记`);
  savingComment.value = false;
  draftComment.value = '';
}

/** 我对自己发起的一键发布申请：关闭（撤回） */
async function closePublishComment(item: DeptSkillCommentItem): Promise<void> {
  if (processingCommentId.value) {
    return;
  }
  processingCommentId.value = item.id;
  await new Promise((resolve) => setTimeout(resolve, 200));
  updateCommentStatus(item.id, 'closed');
  showToast('已关闭该一键发布申请');
  processingCommentId.value = '';
}

/** 我对自己发起的一键发布申请：驳回 */
async function rejectPublishComment(item: DeptSkillCommentItem): Promise<void> {
  if (processingCommentId.value) {
    return;
  }
  processingCommentId.value = item.id;
  await new Promise((resolve) => setTimeout(resolve, 200));
  updateCommentStatus(item.id, 'rejected');
  showToast('已驳回该一键发布申请');
  processingCommentId.value = '';
}

function updateCommentStatus(commentId: string, status: DeptSkillCommentItem['status']): void {
  for (let i = 0; i < skillRows.value.length; i += 1) {
    const row = skillRows.value[i];
    const cmtIdx = row.comments.findIndex((c) => c.id === commentId);
    if (cmtIdx >= 0) {
      const nextComments = row.comments.slice();
      nextComments[cmtIdx] = { ...nextComments[cmtIdx], status };
      skillRows.value[i] = { ...row, comments: nextComments };
      break;
    }
  }
}

function commentStatusLabel(status: DeptSkillCommentItem['status']): { label: string; cls: string } {
  if (status === 'processing') {
    return { label: '处理中', cls: 'st-reviewing-dev' };
  }
  if (status === 'closed') {
    return { label: '已关闭', cls: 'st-neutral' };
  }
  return { label: '已驳回', cls: 'st-rejected-pdu' };
}

function commentTypeLabel(type: DeptSkillCommentItem['type']): string {
  return type === 'publish' ? '一键发布申请' : '评审意见';
}

function skillCommentCount(row: DeptSkillRow): number {
  return row.comments.length;
}

function openSkillDetail(row: DeptSkillRow): void {
  emit('open-skill-detail', row.id);
}

/** 勋章名 → 小图标（emoji），未匹配时使用通用奖章图标 */
const badgeIconMap: Record<string, string> = {
  金牌: '🥇',
  银牌: '🥈',
  铜牌: '🥉',
  高复用: '♻️',
  标杆: '🎯',
  标杆案例: '🎯',
  推荐: '👍',
  强推: '🔥',
};

function badgeIcon(name: string): string {
  const key = Object.keys(badgeIconMap).find((k) => name.includes(k));
  return key ? badgeIconMap[key]! : '🎖️';
}

function openPublishDialog(): void {
  if (selectedCount.value === 0) {
    showToast('请先勾选要发布的 Skill');
    return;
  }
  if (publishTargetOrgs.value.length === 0) {
    showToast('当前无可发布的组织');
    return;
  }
  publishTargetOrgId.value =
    publishTargetOrgs.value.length === 1 ? publishTargetOrgs.value[0]!.id : '';
  publishDialogOpen.value = true;
}

function closePublishDialog(): void {
  if (publishing.value) {
    return;
  }
  publishDialogOpen.value = false;
  publishTargetOrgId.value = '';
}

const selectedPublishOrg = computed(() =>
  publishTargetOrgs.value.find((o) => o.id === publishTargetOrgId.value) ?? null,
);

async function confirmPublish(): Promise<void> {
  if (!selectedPublishOrg.value) {
    showToast('请选择目标组织');
    return;
  }
  publishing.value = true;
  await new Promise((resolve) => setTimeout(resolve, 300));
  const org = selectedPublishOrg.value;
  const now = formatNow();
  const taskId = `task-${Date.now()}`;
  const taskSkills: PublishTaskSkill[] = selectedSkills.value.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    author: row.author,
  }));
  const task: PublishTask = {
    id: taskId,
    taskName: `${org.orgName} · 批量发布任务（${taskSkills.length} 个 Skill）`,
    targetOrgId: org.id,
    targetOrgName: org.orgName,
    orgOwner: org.owner,
    status: 'pending_owner',
    skills: taskSkills,
    createdAt: now,
    completedAt: null,
    creator: props.userId || 'admin',
    approvalComment: null,
  };
  publishTasks.value = [task, ...publishTasks.value];
  for (let i = 0; i < skillRows.value.length; i += 1) {
    const row = skillRows.value[i];
    if (selectedSkillIds.value.has(row.id)) {
      const publishComment: DeptSkillCommentItem = {
        id: `cm-${Date.now()}-${row.id}`,
        type: 'publish',
        submitter: '当前管理员',
        submitterId: 'admin',
        content: `一键发布到组织：${org.orgName}，等待 owner 确认。`,
        status: 'processing',
        createdAt: now,
        isMine: true,
        publishTaskId: taskId,
      };
      skillRows.value[i] = {
        ...row,
        publishTaskId: taskId,
        comments: [...row.comments, publishComment],
      };
    }
  }
  selectedSkillIds.value = new Set();
  publishing.value = false;
  publishDialogOpen.value = false;
  publishTargetOrgId.value = '';
  showToast(`已创建发布任务「${task.taskName}」，已通知组织 owner ${org.owner} 确认`);
}

function openTaskDetail(task: PublishTask): void {
  taskDetailTarget.value = task;
  taskApprovalInput.value = '';
  taskProcessing.value = false;
  taskSkillsVisible.value = TASK_SKILLS_PAGE_SIZE;
  taskDetailOpen.value = true;
}

/** 任务详情弹窗中当前已渲染的 Skill 列表 */
const visibleTaskSkills = computed(() => {
  const target = taskDetailTarget.value;
  if (!target) {
    return [];
  }
  return target.skills.slice(0, taskSkillsVisible.value);
});

const taskSkillsTotal = computed(() => taskDetailTarget.value?.skills.length ?? 0);

const taskSkillsHasMore = computed(() => taskSkillsVisible.value < taskSkillsTotal.value);

/** 滚动加载更多 Skill */
function onTaskSkillsScroll(): void {
  const el = taskSkillsScrollRef.value;
  if (!el || !taskSkillsHasMore.value) {
    return;
  }
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (nearBottom) {
    taskSkillsVisible.value = Math.min(
      taskSkillsVisible.value + TASK_SKILLS_PAGE_SIZE,
      taskSkillsTotal.value,
    );
  }
}

function closeTaskDetail(): void {
  if (taskProcessing.value) {
    return;
  }
  taskDetailOpen.value = false;
  taskDetailTarget.value = null;
  taskApprovalInput.value = '';
}

async function ownerApproveTask(task: PublishTask): Promise<void> {
  if (taskProcessing.value) {
    return;
  }
  taskProcessing.value = true;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const idx = publishTasks.value.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    const comment = taskApprovalInput.value.trim();
    publishTasks.value[idx] = {
      ...publishTasks.value[idx],
      status: 'approved',
      completedAt: formatNow(),
      approvalComment: comment || '组织 owner 已确认，已发布到组织并完成审批。',
    };
    for (let i = 0; i < skillRows.value.length; i += 1) {
      const row = skillRows.value[i];
      if (row.publishTaskId === task.id) {
        const nextComments = row.comments.map((c) =>
          c.publishTaskId === task.id && c.type === 'publish'
            ? { ...c, status: 'closed' as const }
            : c,
        );
        skillRows.value[i] = { ...row, comments: nextComments };
      }
    }
  }
  showToast(`任务「${task.taskName}」已确认发布到组织`);
  if (taskDetailTarget.value?.id === task.id) {
    taskDetailTarget.value = publishTasks.value[idx] ?? null;
  }
  taskProcessing.value = false;
}

async function ownerRejectTask(task: PublishTask): Promise<void> {
  if (taskProcessing.value) {
    return;
  }
  const reason = taskApprovalInput.value.trim();
  if (!reason) {
    showToast('请填写驳回原因');
    return;
  }
  taskProcessing.value = true;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const idx = publishTasks.value.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    publishTasks.value[idx] = {
      ...publishTasks.value[idx],
      status: 'rejected',
      completedAt: formatNow(),
      approvalComment: reason,
    };
    for (let i = 0; i < skillRows.value.length; i += 1) {
      const row = skillRows.value[i];
      if (row.publishTaskId === task.id) {
        const nextComments = row.comments.map((c) =>
          c.publishTaskId === task.id && c.type === 'publish'
            ? { ...c, status: 'rejected' as const }
            : c,
        );
        skillRows.value[i] = { ...row, publishTaskId: null, comments: nextComments };
      }
    }
  }
  showToast(`任务「${task.taskName}」已被驳回`);
  if (taskDetailTarget.value?.id === task.id) {
    taskDetailTarget.value = publishTasks.value[idx] ?? null;
  }
  taskProcessing.value = false;
}

function taskStatusBadge(status: PublishTask['status']): { label: string; cls: string } {
  if (status === 'pending_owner') {
    return { label: '等待 owner 确认', cls: 'st-reviewing-dev' };
  }
  if (status === 'approved') {
    return { label: '已发布到组织', cls: 'st-published' };
  }
  return { label: 'owner 已驳回', cls: 'st-rejected-pdu' };
}

function formatNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function scoreText(score: number | null): string {
  return score == null ? '—' : score.toFixed(0);
}

/** 筛选条件变化时，待发布清单回到第一页 */
watch([() => selectedDeptSegments.value, sortKey, sortOrder], () => {
  skillsPage.pageNum = 1;
});

/** 点击表头排序：切换字段时默认降序，已是当前字段则切换升降序 */
function toggleSort(key: typeof sortKey.value): void {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'desc';
  }
}

function sortArrow(key: typeof sortKey.value): string {
  if (sortKey.value !== key) {
    return '';
  }
  return sortOrder.value === 'desc' ? '▼' : '▲';
}

/** 任务状态筛选 / 排序变化时，发布任务清单回到第一页 */
watch([taskStatusFilter, taskTimeSort], () => {
  tasksPage.pageNum = 1;
});

/** 筛选后的任务数量变化时（含状态被审批改变），若当前页越界则回到第一页 */
watch(
  () => filteredTasks.value.length,
  () => {
    if (tasksPage.pageNum > tasksTotalPages.value) {
      tasksPage.pageNum = 1;
    }
  },
);

function toggleTaskTimeSort(): void {
  taskTimeSort.value = taskTimeSort.value === 'desc' ? 'asc' : 'desc';
}

function goPrevSkillsPage(): void {
  if (skillsPage.pageNum > 1) {
    skillsPage.pageNum -= 1;
  }
}

function goNextSkillsPage(): void {
  if (skillsPage.pageNum < skillsTotalPages.value) {
    skillsPage.pageNum += 1;
  }
}

function onSkillsPageSizeChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value) && value > 0) {
    skillsPage.pageSize = value;
    skillsPage.pageNum = 1;
  }
}

function goPrevTasksPage(): void {
  if (tasksPage.pageNum > 1) {
    tasksPage.pageNum -= 1;
  }
}

function goNextTasksPage(): void {
  if (tasksPage.pageNum < tasksTotalPages.value) {
    tasksPage.pageNum += 1;
  }
}

function onTasksPageSizeChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value) && value > 0) {
    tasksPage.pageSize = value;
    tasksPage.pageNum = 1;
  }
}
</script>

<template>
  <section class="dept-review">
    <p class="dept-review-desc">浏览看管部门下的个人级 Skill，填写评审意见后一键发布到组织，并跟踪发布任务审批进度。</p>

    <div class="dept-review-subtabs" role="tablist" aria-label="部门评审分区">
      <button
        type="button"
        class="mini-tab"
        :class="{ active: activeSubTab === 'skills' }"
        role="tab"
        :aria-selected="activeSubTab === 'skills'"
        @click="activeSubTab = 'skills'"
      >
        待发布清单
      </button>
      <button
        type="button"
        class="mini-tab"
        :class="{ active: activeSubTab === 'tasks' }"
        role="tab"
        :aria-selected="activeSubTab === 'tasks'"
        @click="activeSubTab = 'tasks'"
      >
        发布任务清单
      </button>
    </div>

    <div v-show="activeSubTab === 'skills'" class="dept-review-body">
      <div class="dept-review-toolbar">
        <div class="dept-filter-group">
          <MarketDeptCascader
            v-model="selectedDeptSegments"
            :tree="props.departmentTree"
            :max-level="6"
            all-label="全部部门"
            aria-label="部门评审 · 部门级联筛选"
          />
        </div>
        <div class="dept-publish-wrap">
          <button
            type="button"
            class="btn primary dept-publish-btn"
            :disabled="selectedCount === 0"
            @click="openPublishDialog"
          >
            一键发布到组织（{{ selectedCount }}）
          </button>
        </div>
      </div>

      <div class="table-wrap dept-table-wrap">
        <table class="table dept-table">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  :checked="allFilteredSelected"
                  :indeterminate.prop="selectedCount > 0 && !allFilteredSelected"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="col-skill">Skill 名称</th>
              <th class="col-dept">部门</th>
              <th class="col-author">发布人</th>
              <th class="col-ver">最新版本</th>
              <th class="col-dl th-sortable" @click="toggleSort('downloads')">下载量<span class="th-sort-arrow">{{ sortArrow('downloads') }}</span></th>
              <th class="col-access th-sortable" @click="toggleSort('access')">调用量<span class="th-sort-arrow">{{ sortArrow('access') }}</span></th>
              <th class="col-ai th-sortable" @click="toggleSort('aiScore')">AI评分<span class="th-sort-arrow">{{ sortArrow('aiScore') }}</span></th>
              <th class="col-expert th-sortable" @click="toggleSort('expertScore')">专家评分<span class="th-sort-arrow">{{ sortArrow('expertScore') }}</span></th>
              <th class="col-badge">勋章</th>
              <th class="col-comment">评审意见</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedSkills" :key="row.id" class="dept-skill-row">
              <td class="col-check-td" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedSkillIds.has(row.id)"
                  @change="toggleSkillSelection(row.id)"
                />
              </td>
              <td>
                <strong class="skill-name skill-name-link" @click="openSkillDetail(row)">
                  {{ row.name }}
                </strong>
              </td>
              <td class="cell-sub" :title="row.deptPath">{{ row.deptPath.split(' / ').pop() }}</td>
              <td class="cell-sub">{{ row.author }}</td>
              <td>
                <div class="cell-main cell-main-plain">{{ row.version }}</div>
              </td>
              <td class="num">{{ row.downloads.toLocaleString('zh-CN') }}</td>
              <td class="num">{{ row.totalAccess.toLocaleString('zh-CN') }}</td>
              <td class="num" :class="{ muted: row.aiScore == null }">{{ scoreText(row.aiScore) }}</td>
              <td class="num" :class="{ muted: row.expertScore == null }">{{ scoreText(row.expertScore) }}</td>
              <td>
                <div class="badge-cell">
                  <span v-if="row.badges.length === 0" class="muted">—</span>
                  <span
                    v-for="b in row.badges"
                    :key="b"
                    class="dept-badge-icon"
                    :title="b"
                  >{{ badgeIcon(b) }}</span>
                </div>
              </td>
              <td class="col-comment-td" @click.stop>
                <button
                  type="button"
                  class="dept-comment-count"
                  :class="{ 'has-comments': skillCommentCount(row) > 0 }"
                  :title="skillCommentCount(row) > 0 ? `共 ${skillCommentCount(row)} 条意见，点击查看` : '点击添加评审意见'"
                  @click="openCommentsDialog(row)"
                >
                  <span class="dept-comment-icon" aria-hidden="true">💬</span>
                  <span class="dept-comment-num">{{ skillCommentCount(row) }}</span>
                </button>
              </td>
              <td class="col-ops-td" @click.stop>
                <button type="button" class="dept-view-btn" title="查看详情" @click="openSkillDetail(row)">
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
                  </svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredSkills.length === 0">
              <td colspan="12" class="empty-row">暂无符合条件的 Skill</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dept-pagination">
        <span class="dept-pagination-info">
          共 {{ filteredSkills.length }} 条 · 第 {{ skillsPage.pageNum }} / {{ skillsTotalPages }} 页
        </span>
        <label class="dept-pagination-size">
          每页
          <select :value="skillsPage.pageSize" @change="onSkillsPageSizeChange">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
          条
        </label>
        <div class="dept-pagination-ops">
          <button type="button" class="mini" :disabled="skillsPage.pageNum <= 1" @click="goPrevSkillsPage">上一页</button>
          <button type="button" class="mini" :disabled="skillsPage.pageNum >= skillsTotalPages" @click="goNextSkillsPage">下一页</button>
        </div>
      </div>
    </div>

    <section v-show="activeSubTab === 'tasks'" class="dept-task-section">
      <div class="dept-task-head">
        <h3>发布任务清单</h3>
        <p class="muted dept-task-tip">一键发布到组织后会生成任务，等待组织 owner 确认；确认后即上架组织。</p>
      </div>

      <div class="table-wrap dept-task-table-wrap">
        <table class="table dept-task-table">
          <thead>
            <tr>
              <th>目标组织</th>
              <th>发起人</th>
              <th>Skill 数</th>
              <th class="th-filter">
                状态
                <select
                  v-model="taskStatusFilter"
                  class="th-filter-select"
                  @click.stop
                >
                  <option value="all">全部</option>
                  <option value="pending_owner">等待 owner 确认</option>
                  <option value="approved">已发布到组织</option>
                  <option value="rejected">owner 已驳回</option>
                </select>
              </th>
              <th class="th-sortable" @click="toggleTaskTimeSort">
                创建时间
                <span class="th-sort-arrow">{{ taskTimeSort === 'desc' ? '▼' : '▲' }}</span>
              </th>
              <th>完成时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in pagedTasks" :key="task.id" class="dept-task-row">
              <td>
                <strong>{{ task.targetOrgName }}</strong>
              </td>
              <td>{{ task.creator }}</td>
              <td class="num">{{ task.skills.length }}</td>
              <td>
                <span class="st" :class="taskStatusBadge(task.status).cls">
                  {{ taskStatusBadge(task.status).label }}
                </span>
              </td>
              <td>{{ task.createdAt }}</td>
              <td>{{ task.completedAt ?? '—' }}</td>
              <td class="col-ops-td">
                <button type="button" class="dept-view-btn" title="查看详情" @click="openTaskDetail(task)">
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
                  </svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredTasks.length === 0">
              <td colspan="7" class="empty-row">暂无符合条件的发布任务</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dept-pagination">
        <span class="dept-pagination-info">
          共 {{ filteredTasks.length }} 条 · 第 {{ tasksPage.pageNum }} / {{ tasksTotalPages }} 页
        </span>
        <label class="dept-pagination-size">
          每页
          <select :value="tasksPage.pageSize" @change="onTasksPageSizeChange">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
          条
        </label>
        <div class="dept-pagination-ops">
          <button type="button" class="mini" :disabled="tasksPage.pageNum <= 1" @click="goPrevTasksPage">上一页</button>
          <button type="button" class="mini" :disabled="tasksPage.pageNum >= tasksTotalPages" @click="goNextTasksPage">下一页</button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="publishDialogOpen"
        class="overlay"
        role="presentation"
        @click.self="closePublishDialog"
      >
        <div
          class="v-dialog v-dialog-wide dept-publish-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dept-publish-title"
        >
          <div class="v-head">
            <strong id="dept-publish-title">发布到组织</strong>
            <button type="button" class="close-x" aria-label="关闭" :disabled="publishing" @click="closePublishDialog">×</button>
          </div>
          <p class="v-sub">
            已勾选 <b>{{ selectedCount }}</b> 个 Skill，将创建发布任务并通知组织 owner 确认。
          </p>
          <div class="admin-form">
            <div v-if="publishTargetOrgs.length > 1" class="dept-org-list" role="radiogroup" aria-label="目标组织">
              <label
                v-for="org in publishTargetOrgs"
                :key="org.id"
                class="dept-org-radio"
                :class="{ on: publishTargetOrgId === org.id }"
              >
                <input
                  v-model="publishTargetOrgId"
                  type="radio"
                  :value="org.id"
                  :disabled="publishing"
                />
                <span class="dept-org-main">
                  <strong>{{ org.orgName }}</strong>
                  <span class="dept-org-owner">owner：{{ org.owner }}</span>
                </span>
              </label>
            </div>
            <div v-else-if="publishTargetOrgs.length === 1" class="dept-org-single">
              默认选中唯一组织：<strong>{{ publishTargetOrgs[0].orgName }}</strong>
              <span class="dept-org-owner">（owner：{{ publishTargetOrgs[0].owner }}）</span>
            </div>
            <div class="dept-publish-skills">
              <div class="dept-publish-skills-title">本次发布的 Skill：</div>
              <ul class="dept-publish-skill-list">
                <li v-for="s in selectedSkills" :key="s.id">
                  <strong>{{ s.name }}</strong>
                  <span class="v-meta-sep">·</span>
                  <span>{{ s.version }}</span>
                  <span class="v-meta-sep">·</span>
                  <span>{{ s.author }}</span>
                </li>
              </ul>
            </div>
          </div>
          <div class="v-actions">
            <button type="button" class="btn outline sm" :disabled="publishing" @click="closePublishDialog">取消</button>
            <button type="button" class="btn primary sm" :disabled="publishing || !selectedPublishOrg" @click="confirmPublish">
              {{ publishing ? '提交中…' : '创建任务并通知 owner' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="commentsOpen && commentsTargetRow"
        class="overlay"
        role="presentation"
        @click.self="closeCommentsDialog"
      >
        <div
          class="v-dialog v-dialog-wide dept-comments-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dept-comments-title"
        >
          <div class="v-head">
            <strong id="dept-comments-title">评审意见 · {{ commentsTargetRow.name }}</strong>
            <button type="button" class="close-x" aria-label="关闭" :disabled="savingComment || !!processingCommentId" @click="closeCommentsDialog">×</button>
          </div>
          <p class="v-sub">
            {{ commentsTargetRow.version }} · {{ commentsTargetRow.author }} · {{ commentsTargetRow.deptPath }}
          </p>

          <div class="dept-comments-list">
            <div
              v-for="item in commentsTargetRow.comments"
              :key="item.id"
              class="dept-comment-item"
              :class="{ mine: item.isMine }"
            >
              <div class="dept-comment-head">
                <span class="dept-comment-type" :class="item.type">{{ commentTypeLabel(item.type) }}</span>
                <strong class="dept-comment-submitter">{{ item.submitter }}</strong>
                <span class="st" :class="commentStatusLabel(item.status).cls">
                  {{ commentStatusLabel(item.status).label }}
                </span>
                <span class="dept-comment-time muted">{{ item.createdAt }}</span>
              </div>
              <p class="dept-comment-content">{{ item.content }}</p>
              <div
                v-if="item.isMine && item.type === 'publish' && item.status === 'processing'"
                class="dept-comment-ops"
              >
                <button
                  type="button"
                  class="btn outline sm"
                  :disabled="!!processingCommentId"
                  @click="closePublishComment(item)"
                >
                  关闭
                </button>
                <button
                  type="button"
                  class="btn danger sm"
                  :disabled="!!processingCommentId"
                  @click="rejectPublishComment(item)"
                >
                  驳回
                </button>
              </div>
            </div>
            <div v-if="commentsTargetRow.comments.length === 0" class="empty-row dept-comments-empty">
              暂无意见
            </div>
          </div>

          <div class="dept-comments-add">
            <h4>添加评审意见</h4>
            <p class="dept-review-comment-hint muted">
              评审意见提交后将在该 Skill 的「个人发布」详情中标记展示，供大家查看。
            </p>
            <textarea
              v-model="draftComment"
              class="admin-textarea"
              rows="4"
              :disabled="savingComment"
              placeholder="对该 Skill 的评审意见"
            />
            <div class="v-actions">
              <button type="button" class="btn outline sm" :disabled="savingComment" @click="closeCommentsDialog">关闭</button>
              <button type="button" class="btn primary sm" :disabled="savingComment || !draftComment.trim()" @click="submitReviewComment">
                {{ savingComment ? '提交中…' : '提交意见' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="taskDetailOpen && taskDetailTarget"
        class="overlay"
        role="presentation"
        @click.self="closeTaskDetail"
      >
        <div
          class="v-dialog v-dialog-wide dept-task-detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dept-task-detail-title"
        >
          <div class="v-head">
            <strong id="dept-task-detail-title">发布任务详情</strong>
            <button type="button" class="close-x" aria-label="关闭" :disabled="taskProcessing" @click="closeTaskDetail">×</button>
          </div>
          <p class="v-sub">{{ taskDetailTarget.taskName }}</p>
          <div class="dept-task-detail-grid">
            <div><span class="muted">目标组织</span><strong>{{ taskDetailTarget.targetOrgName }}</strong></div>
            <div><span class="muted">发起人</span><strong>{{ taskDetailTarget.creator }}</strong></div>
            <div>
              <span class="muted">状态</span>
              <strong>
                <span class="st" :class="taskStatusBadge(taskDetailTarget.status).cls">
                  {{ taskStatusBadge(taskDetailTarget.status).label }}
                </span>
              </strong>
            </div>
            <div><span class="muted">创建时间</span><strong>{{ taskDetailTarget.createdAt }}</strong></div>
            <div><span class="muted">完成时间</span><strong>{{ taskDetailTarget.completedAt ?? '—' }}</strong></div>
            <div><span class="muted">发布 Skill 数</span><strong>{{ taskDetailTarget.skills.length }}</strong></div>
          </div>
          <div class="dept-task-detail-skills">
            <h4>本次发布的 Skill 清单（共 {{ taskSkillsTotal }} 个）</h4>
            <div ref="taskSkillsScrollRef" class="dept-task-skills-scroll" @scroll="onTaskSkillsScroll">
              <table class="table dept-task-detail-table">
                <thead>
                  <tr>
                    <th>Skill 名称</th>
                    <th>版本</th>
                    <th>作者</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in visibleTaskSkills" :key="s.id">
                    <td><strong>{{ s.name }}</strong></td>
                    <td>{{ s.version }}</td>
                    <td>{{ s.author }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="taskSkillsHasMore" class="dept-task-skills-hint muted">已加载 {{ visibleTaskSkills.length }} / {{ taskSkillsTotal }}，继续下拉加载更多</p>
              <p v-else class="dept-task-skills-hint muted">已全部加载（{{ taskSkillsTotal }} 个）</p>
            </div>
          </div>
          <div v-if="taskDetailTarget.approvalComment" class="dept-task-approval">
            <h4>owner 审批意见</h4>
            <p>{{ taskDetailTarget.approvalComment }}</p>
          </div>
          <div v-if="taskDetailTarget.status === 'pending_owner'" class="dept-task-owner-ops">
            <label class="admin-field dept-task-approval-field">
              <span>审批意见 <em class="dept-required">*</em>驳回时必填，确认时可选</span>
              <textarea
                v-model="taskApprovalInput"
                class="admin-textarea"
                rows="3"
                :disabled="taskProcessing"
                placeholder="请填写审批意见；驳回时必填，将通知任务发起人"
              />
            </label>
            <div class="v-actions">
              <button type="button" class="btn danger sm" :disabled="taskProcessing" @click="ownerRejectTask(taskDetailTarget)">
                {{ taskProcessing ? '处理中…' : '驳回' }}
              </button>
              <button type="button" class="btn primary sm" :disabled="taskProcessing" @click="ownerApproveTask(taskDetailTarget)">
                确认发布到组织
              </button>
            </div>
          </div>
          <div v-else class="v-actions">
            <button type="button" class="btn outline sm" @click="closeTaskDetail">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
@use '@/style/UserMarketShell.scss';

.dept-review {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dept-review-desc {
  margin: 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.5;
}

.dept-review-summary {
  flex-wrap: wrap;
}

.dept-review-subtabs {
  display: inline-flex;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  align-self: flex-start;
}

.dept-review-subtabs .mini-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  border: none;
  background: transparent;
}

.dept-review-subtabs .mini-tab.active {
  background: #edf5ff;
  color: #2563eb;
  font-weight: 700;
}

.dept-review-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dept-review-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.dept-filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.dept-publish-wrap {
  margin-left: auto;
}

.dept-publish-btn {
  white-space: nowrap;
}

.dept-table,
.dept-task-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  font-size: 13px;
}

.dept-table thead th,
.dept-task-table thead th {
  padding: 7px 12px;
  line-height: 1.3;
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: middle;
}

.dept-table tbody td,
.dept-task-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: middle;
}

.dept-table tbody tr:last-child td,
.dept-task-table tbody tr:last-child td {
  border-bottom: 0;
}

.dept-table tbody tr:hover td,
.dept-task-table tbody tr:hover td {
  background: #f8fafc;
}

.dept-table th,
.dept-task-table th {
  line-height: 1.3;
}

.dept-table .col-check input,
.dept-table .col-check-td input {
  margin: 0;
  width: 14px;
  height: 14px;
  vertical-align: middle;
  cursor: pointer;
}

.dept-table .skill-name,
.dept-task-table .skill-name {
  color: #111827;
  font-weight: 700;
}

.dept-table .cell-sub {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}

.dept-table .col-check,
.dept-table .col-check-td {
  width: 40px;
  text-align: center;
}

.dept-table .col-skill {
  min-width: 160px;
}

.dept-table .col-dept {
  width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dept-table .col-author {
  width: 80px;
}

.dept-table .col-ver {
  width: 80px;
}

.dept-table .col-dl {
  width: 72px;
}

.dept-table .col-access {
  width: 72px;
}

.dept-table .col-ai {
  width: 64px;
}

.dept-table .col-expert {
  width: 64px;
}

.dept-table .col-badge {
  min-width: 100px;
}

.dept-table .col-comment {
  width: 76px;
  text-align: center;
}

.dept-table .col-ops-td {
  width: 44px;
  text-align: center;
}

.dept-view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.dept-view-btn:hover {
  border-color: #91d5ff;
  color: #2563eb;
  background: #eff6ff;
}

.dept-table .num {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dept-table .num.muted {
  color: rgba(0, 0, 0, 0.35);
  font-weight: 500;
}

.dept-table .badge-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.dept-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 15px;
  line-height: 1;
  background: linear-gradient(180deg, #fff7e6 0%, #fff 100%);
  border: 1px solid #ffe7ba;
  cursor: help;
}

.dept-comment-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dept-comment-count:hover {
  border-color: #cbd5e1;
  background: #fff;
}

.dept-comment-count.has-comments {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: #bfdbfe;
  font-weight: 700;
}

.dept-comment-count.has-comments:hover {
  background: #dbeafe;
}

.dept-comment-icon {
  font-size: 13px;
  line-height: 1;
}

.dept-task-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dept-task-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.dept-task-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.dept-task-tip {
  margin: 0;
  font-size: 12px;
}

.th-filter {
  position: relative;
}

.th-filter-select {
  margin-left: 6px;
  padding: 1px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  font-size: 11px;
  height: 22px;
  cursor: pointer;
}

.th-sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.th-sortable:hover {
  color: #2563eb;
}

.th-sort-arrow {
  margin-left: 2px;
  font-size: 10px;
  color: #2563eb;
}

.dept-publish-dialog .dept-org-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.dept-org-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #e8ecf1;
  border-radius: 10px;
  cursor: pointer;
  background: linear-gradient(180deg, #fafbfd 0%, #fff 100%);
}

.dept-org-radio.on {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.dept-org-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dept-org-owner {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.dept-org-single {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px dashed #dbe3ef;
  border-radius: 10px;
  background: #f8fafd;
  font-size: 13px;
}

.dept-publish-skills-title {
  font-size: 13px;
  margin-bottom: 6px;
  color: rgba(0, 0, 0, 0.7);
}

.dept-publish-skill-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
  border: 1px solid #e8ecf1;
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.dept-review-comment-hint {
  font-size: 12px;
  margin: 0 0 8px;
}

.dept-comments-dialog {
  max-width: 600px;
}

.dept-comments-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 340px;
  overflow: auto;
  margin: 8px 0 14px;
}

.dept-comment-item {
  border: 1px solid #e8ecf1;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fafbfd;
}

.dept-comment-item.mine {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.dept-comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  font-size: 13px;
}

.dept-comment-type {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.dept-comment-type.review {
  color: #475569;
  background: #e2e8f0;
}

.dept-comment-type.publish {
  color: #1d4ed8;
  background: #dbeafe;
}

.dept-comment-submitter {
  font-size: 13px;
}

.dept-comment-time {
  margin-left: auto;
  font-size: 12px;
}

.dept-comment-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.75);
}

.dept-comment-ops {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.dept-comments-empty {
  text-align: center;
  padding: 24px 0;
}

.dept-comments-add {
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}

.dept-comments-add h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.dept-comments-add .admin-textarea {
  width: 100%;
  margin-bottom: 4px;
}

.dept-task-detail-dialog {
  max-width: 640px;
}

.dept-task-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 24px;
  margin: 8px 0 14px;
  font-size: 13px;
}

.dept-task-detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dept-task-detail-grid .muted {
  font-size: 12px;
}

.dept-task-detail-skills h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.dept-task-skills-scroll {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.dept-task-skills-hint {
  margin: 0;
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
}

.dept-task-detail-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.dept-task-detail-table th,
.dept-task-detail-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
}

.dept-task-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
}

.dept-task-detail-table tbody tr:last-child td {
  border-bottom: 0;
}

.dept-task-approval {
  margin: 14px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafd;
  border: 1px solid #e8ecf1;
  font-size: 13px;
}

.dept-task-approval h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.dept-task-owner-ops {
  margin-top: 8px;
}

.dept-task-owner-ops .v-actions {
  border-top: none;
  padding-top: 0;
  margin-top: 6px;
}

.dept-task-approval-field {
  margin-bottom: 8px;
}

.dept-task-approval-field .admin-textarea {
  width: 100%;
}

.dept-required {
  color: #dc2626;
  font-style: normal;
  margin-right: 2px;
}

.dept-pagination {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 4px 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}

.dept-pagination-info {
  font-variant-numeric: tabular-nums;
}

.dept-pagination-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dept-pagination-size select {
  padding: 3px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
}

.dept-pagination-ops {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.muted {
  color: rgba(0, 0, 0, 0.5);
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import { useProfileStore } from '../../stores/userStore';
import type { SkillOrgPublishTask } from '../../types/skill';

const props = withDefaults(
  defineProps<{
    /** 操作者工号（父级优先，避免 store 回填滞后） */
    userId?: string;
  }>(),
  { userId: '' },
);

const emit = defineEmits<{
  toast: [message: string];
}>();

const userStore = useProfileStore();

/** 操作者工号：父级传入 > Profile w3Id（允许为空，与既有模块一致直接发查询） */
const effectiveUserId = computed(() => {
  const fromParent = String(props.userId ?? '').trim();
  if (fromParent) {
    return fromParent;
  }
  return String(userStore.userInfo?.w3Id ?? '').trim();
});

type StatusFilter = 'all' | 'processing' | 'pending_approval' | 'success' | 'fail' | 'rejected';

/**
 * 状态映射（真实接口枚举 → 展示）：
 * PROCESSING 发布中 / PENDING_APPROVAL 待审批 / SUCCESS 成功 / FAIL 失败 / REJECTED 驳回
 */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  processing: { label: '发布中', cls: 'st-processing' },
  pending_approval: { label: '待审批', cls: 'st-pending' },
  approved: { label: '已通过', cls: 'st-approved' },
  success: { label: '成功', cls: 'st-approved' },
  fail: { label: '失败', cls: 'st-rejected' },
  rejected: { label: '已驳回', cls: 'st-rejected' },
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '发布中' },
  { value: 'pending_approval', label: '待审批' },
  { value: 'success', label: '成功' },
  { value: 'fail', label: '失败' },
  { value: 'rejected', label: '驳回' },
];

const tasks = ref<SkillOrgPublishTask[]>([]);
const loading = ref(false);
const error = ref('');
const lastLoadedAt = ref('');

/** 表头过滤：Skill 名字（文本）、目标组织（下拉）、状态（下拉）；清单仅本人名下提交 */
const nameKeyword = ref('');
const orgFilter = ref('all');
const statusFilter = ref<StatusFilter>('all');

const orgOptions = computed(() =>
  Array.from(new Set(tasks.value.map((t) => String(t.targetOrgName ?? '').trim()))).filter(Boolean),
);

const filteredTasks = computed(() => {
  const keyword = nameKeyword.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
    if (keyword && !task.skillName.toLowerCase().includes(keyword)) {
      return false;
    }
    if (orgFilter.value !== 'all' && task.targetOrgName !== orgFilter.value) {
      return false;
    }
    if (statusFilter.value !== 'all' && task.status !== statusFilter.value) {
      return false;
    }
    return true;
  });
});

/** 当前生效的表头过滤数量（用于「清空筛选」徽标） */
const activeFilterCount = computed(
  () =>
    (nameKeyword.value.trim() ? 1 : 0) +
    (orgFilter.value !== 'all' ? 1 : 0) +
    (statusFilter.value !== 'all' ? 1 : 0),
);

function filterDotClass(status: string): string {
  return `dot-${status}`;
}

/** 发布日期格式化：统一输出 YYYY-MM-DD HH:mm:ss，兼容 ISO 字符串/时间戳/不带秒的字符串 */
function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '—';
  }
  const raw = String(value).trim();
  if (!raw) {
    return '—';
  }
  // 纯数字时间戳（毫秒）
  if (/^\d+$/.test(raw)) {
    const d = new Date(Number(raw));
    return isNaN(d.getTime()) ? raw : formatFromDate(d);
  }
  // ISO 或 yyyy-MM-ddTHH:mm:ss / yyyy-MM-dd HH:mm:ss 等
  const normalized = raw
    .replace('T', ' ')
    .replace(/\.\d+.*$/, '')
    .replace(/([+-]\d{2}:?\d{2}|Z)$/, '');
  const d = new Date(normalized.replace(' ', 'T'));
  if (!isNaN(d.getTime())) {
    return formatFromDate(d);
  }
  // 兜底：补齐秒
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  return normalized;
}

function formatFromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const sortedTasks = computed(() =>
  [...filteredTasks.value].sort((a, b) =>
    String(b.publishDate).localeCompare(String(a.publishDate)),
  ),
);

const page = ref(1);
const pageSize = ref(10);
const total = computed(() => sortedTasks.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pagedTasks = computed(() => {
  const pageNum = Math.min(page.value, totalPages.value);
  const start = (pageNum - 1) * pageSize.value;
  return sortedTasks.value.slice(start, start + pageSize.value);
});

function hasAnyFilter(): boolean {
  return (
    Boolean(nameKeyword.value.trim()) || orgFilter.value !== 'all' || statusFilter.value !== 'all'
  );
}

function clearHeaderFilters(): void {
  nameKeyword.value = '';
  orgFilter.value = 'all';
  statusFilter.value = 'all';
  page.value = 1;
}

watch(nameKeyword, () => {
  page.value = 1;
});
watch(orgFilter, () => {
  page.value = 1;
});
watch(statusFilter, () => {
  page.value = 1;
});

watch(effectiveUserId, () => {
  page.value = 1;
  orgFilter.value = 'all';
  void loadTasks();
});

async function loadTasks(): Promise<void> {
  if (loading.value) {
    return;
  }
  loading.value = true;
  try {
    // 真实接口参数：userId / pageNum / pageSize / skillName / orgName（状态过滤在客户端做）
    const params: Record<string, string | number> = {
      userId: effectiveUserId.value,
      pageNum: 1,
      pageSize: 500,
    };
    const keyword = nameKeyword.value.trim();
    if (keyword) {
      params.skillName = keyword;
    }
    if (orgFilter.value !== 'all') {
      params.orgName = orgFilter.value;
    }
    const env = await skillBaseService.querySkillOrgPublishTasks(params);
    const meta = (env.meta ?? {}) as { success?: boolean };
    if (typeof meta.success === 'boolean' && !meta.success) {
      throw new Error(env.message || '发布任务加载失败');
    }
    tasks.value = normalizeTasks(env.data);
    error.value = '';
    lastLoadedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发布任务加载失败';
  } finally {
    loading.value = false;
  }
}

/** 状态枚举归一：PROCESSING / PENDING_APPROVAL / SUCCESS / FAIL / REJECTED（大小写宽容） */
function normalizeStatus(raw: unknown): SkillOrgPublishTask['status'] {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  // 精确值优先
  if (s === 'processing') {
    return 'processing';
  }
  if (s === 'pending' || s === 'pending_approval' || s === 'validating') {
    return 'pending_approval';
  }
  if (s === 'success') {
    return 'success';
  }
  if (s === 'fail') {
    return 'fail';
  }
  if (s === 'rejected') {
    return 'rejected';
  }
  // 宽容兜底：近似词（旧枚举 approved/validating 等也归入新枚举）
  if (s.includes('pending')) {
    return 'pending_approval';
  }
  if (s.includes('reject')) {
    return 'rejected';
  }
  if (s.includes('approv') || s.includes('success')) {
    return 'success';
  }
  if (s.includes('process')) {
    return 'processing';
  }
  if (s.includes('fail')) {
    return 'fail';
  }
  return 'processing';
}

function normalizeTasks(raw: unknown): SkillOrgPublishTask[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.records)) {
      list = record.records;
    } else if (Array.isArray(record.list)) {
      list = record.list;
    }
  }
  return list.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(row.taskId ?? row.id ?? ''),
      skillName: String(row.skillName ?? row.name ?? ''),
      version: row.version ? String(row.version) : undefined,
      publisher: row.publisher ? String(row.publisher) : undefined,
      publisherName: row.publisherName ? String(row.publisherName) : undefined,
      targetOrgId: row.orgCode
        ? String(row.orgCode)
        : row.targetOrgId
          ? String(row.targetOrgId)
          : undefined,
      targetOrgName: row.orgName
        ? String(row.orgName)
        : row.targetOrgName
          ? String(row.targetOrgName)
          : undefined,
      publishDate: String(row.submitTime ?? row.publishDate ?? row.createdAt ?? ''),
      status: normalizeStatus(row.status ?? row.taskStatus),
      approvalUrl: row.approvalUrl ? String(row.approvalUrl) : undefined,
      finishedDate: row.finishedDate ? String(row.finishedDate) : null,
      rejectReason:
        typeof row.errorMessage === 'string' && row.errorMessage.trim()
          ? row.errorMessage
          : row.rejectReason
            ? String(row.rejectReason)
            : null,
    } satisfies SkillOrgPublishTask;
  });
}

function taskStatusMeta(task: SkillOrgPublishTask): { label: string; cls: string } {
  return STATUS_META[task.status] ?? STATUS_META.processing!;
}

onMounted(() => {
  void loadTasks();
});
</script>

<template>
  <section class="org-publish-panel" aria-label="组织级发布任务">
    <div class="org-publish-ops">
      <p class="org-publish-desc">
        仅展示你名下提交的组织级发布任务；任务状态为「待审批」时，可点「前往审批」到审批系统处理。
      </p>
      <div class="org-publish-ops-right">
        <span v-if="lastLoadedAt" class="org-publish-loaded">最近查询 {{ lastLoadedAt }}</span>
        <button type="button" class="org-publish-refresh" :disabled="loading" @click="loadTasks()">
          {{ loading ? '查询中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="org-publish-error">
      {{ error }}
      <button type="button" class="org-publish-retry" @click="loadTasks()">重试</button>
    </div>

    <div class="org-publish-card">
      <table class="org-publish-table">
        <thead>
          <tr>
            <th class="th-filter th-skill">
              <span class="th-caption">Skill 名字</span>
              <label class="filter-chip" :class="{ active: nameKeyword.trim() }">
                <svg class="chip-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
                <input
                  v-model="nameKeyword"
                  type="text"
                  class="filter-chip-control"
                  placeholder="按名字过滤"
                  aria-label="按 Skill 名字过滤"
                />
                <button
                  v-if="nameKeyword"
                  type="button"
                  class="chip-clear"
                  aria-label="清空名字过滤"
                  @click="nameKeyword = ''"
                >
                  ×
                </button>
              </label>
            </th>
            <th>版本</th>
            <th class="th-filter th-org">
              <span class="th-caption">目标组织</span>
              <label class="filter-chip" :class="{ active: orgFilter !== 'all' }">
                <select v-model="orgFilter" class="filter-chip-control" aria-label="按目标组织过滤">
                  <option value="all">全部组织</option>
                  <option v-for="name in orgOptions" :key="name" :value="name">{{ name }}</option>
                </select>
                <svg class="chip-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </label>
            </th>
            <th>发布日期</th>
            <th class="th-filter th-status">
              <span class="th-caption">当前状态</span>
              <label class="filter-chip" :class="{ active: statusFilter !== 'all' }">
                <span
                  v-if="statusFilter !== 'all'"
                  class="chip-dot"
                  :class="filterDotClass(statusFilter)"
                >
                </span>
                <select v-model="statusFilter" class="filter-chip-control" aria-label="按状态过滤">
                  <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <svg class="chip-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </label>
            </th>
            <th>审批入口</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in pagedTasks" :key="task.id">
            <td>
              <strong class="skill-name">{{ task.skillName }}</strong>
            </td>
            <td>
              <span class="version-text">{{ task.version || '—' }}</span>
            </td>
            <td>{{ task.targetOrgName || '—' }}</td>
            <td>{{ formatDateTime(task.publishDate) }}</td>
            <td>
              <span class="st" :class="taskStatusMeta(task).cls">
                {{ taskStatusMeta(task).label }}
              </span>
              <span v-if="task.rejectReason" class="reject-reason" :title="task.rejectReason">
                驳回原因：{{ task.rejectReason }}
              </span>
              <span v-else-if="task.status === 'success' && task.finishedDate" class="finish-date">
                {{ task.finishedDate }}
              </span>
            </td>
            <td>
              <a
                v-if="task.status === 'pending_approval' && task.approvalUrl"
                class="approval-link"
                :href="task.approvalUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                前往审批 →
              </a>
              <span v-else class="link-empty">—</span>
            </td>
          </tr>
          <tr v-if="filteredTasks.length === 0">
            <td colspan="6" class="empty-row">
              {{
                loading
                  ? '查询中...'
                  : hasAnyFilter()
                    ? '没有符合筛选条件的发布任务'
                    : '暂无组织级发布任务'
              }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="org-publish-foot">
        <span class="foot-info">
          共 {{ total }} 条 · 第 {{ Math.min(page, totalPages) }} / {{ totalPages }} 页
        </span>
        <label class="foot-size">
          每页
          <select v-model.number="pageSize" @change="page = 1">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
          条
        </label>
        <div class="foot-ops">
          <button type="button" class="mini" :disabled="page <= 1" @click="page -= 1">
            上一页
          </button>
          <button type="button" class="mini" :disabled="page >= totalPages" @click="page += 1">
            下一页
          </button>
        </div>
        <button
          v-if="activeFilterCount > 0"
          type="button"
          class="clear-filter"
          @click="clearHeaderFilters"
        >
          清空筛选<span class="clear-count">{{ activeFilterCount }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.org-publish-panel {
  display: block;
}

.org-publish-ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.org-publish-desc {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.org-publish-ops-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.org-publish-loaded {
  color: #94a3b8;
  font-size: 12px;
}

.org-publish-refresh {
  min-height: 34px;
  padding: 0 16px;
  border: 1px solid #d8eaff;
  border-radius: 999px;
  background: #eef6ff;
  color: #2f7df6;
  cursor: pointer;
  font-size: 13px;
  font-weight: 850;
  transition: 0.16s ease;
}

.org-publish-refresh:hover:not(:disabled) {
  background: #dbeaff;
}

.org-publish-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.org-publish-error {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 13px;
}

.org-publish-retry {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid #fecaca;
  border-radius: 999px;
  background: #fff;
  color: #b91c1c;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.org-publish-card {
  overflow: hidden;
  border: 1px solid #e9edf3;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

.org-publish-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.org-publish-table thead th {
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

.th-filter {
  min-width: 150px;
}

.th-skill {
  min-width: 180px;
}

.th-org {
  min-width: 150px;
}

.th-status {
  min-width: 130px;
}

.th-caption {
  display: block;
  margin-bottom: 6px;
  color: #7b8396;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.5px;
}

.filter-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #f3f5f9;
  color: #33404f;
  cursor: default;
  transition: 0.16s ease;
}

.filter-chip:hover {
  border-color: #dfe6f0;
  background: #f8fafc;
}

.filter-chip:focus-within {
  border-color: rgba(47, 125, 246, 0.45);
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.1);
}

.filter-chip.active {
  border-color: rgba(47, 125, 246, 0.5);
  background: #eaf3ff;
}

.chip-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  fill: none;
  stroke: #aab4c6;
  stroke-width: 2;
  stroke-linecap: round;
}

.filter-chip.active .chip-icon {
  stroke: #2f7df6;
}

.chip-chevron {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  fill: none;
  stroke: #aab4c6;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.filter-chip.active .chip-chevron {
  stroke: #2f7df6;
}

.filter-chip-control {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: #33404f;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  outline: none;
}

.filter-chip-control::placeholder {
  color: #b6bdcf;
  font-weight: 600;
}

select.filter-chip-control {
  appearance: none;
  cursor: pointer;
  text-overflow: ellipsis;
}

.chip-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.dot-processing {
  background: #6366f1;
}

.dot-pending_approval {
  background: #2f7df6;
}

.dot-success {
  background: #16a34a;
}

.dot-fail,
.dot-rejected {
  background: #dc2626;
}

.chip-clear {
  flex: 0 0 auto;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: #dfe6f0;
  color: #5b6474;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.filter-chip.active .chip-clear {
  background: rgba(47, 125, 246, 0.18);
  color: #2f7df6;
}

.chip-clear:hover {
  background: #c9d4e3;
  color: #374151;
}

.org-publish-table tbody td {
  padding: 12px;
  border-bottom: 1px solid #f1f4f9;
  color: #33404f;
  vertical-align: top;
  line-height: 1.5;
}

.org-publish-table tbody tr {
  transition: background 0.14s ease;
}

.org-publish-table tbody tr:hover {
  background: #f6faff;
}

.org-publish-table tbody tr:last-child td {
  border-bottom: none;
}

.skill-name {
  color: #15171d;
  font-weight: 850;
}

.reject-reason {
  display: block;
  margin-top: 6px;
  max-width: 240px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.5;
}

.version-text {
  color: #64748b;
  font-weight: 700;
}

.st {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.st-processing {
  background: #eef2ff;
  color: #4f46e5;
}

.st-pending {
  background: #e0ecff;
  color: #1d4ed8;
}

.st-approved {
  background: #dcf7e8;
  color: #147a45;
}

.st-rejected {
  background: #fdeaea;
  color: #bf2726;
}

.finish-date {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.approval-link {
  color: #2f7df6;
  font-weight: 800;
  text-decoration: none;
}

.approval-link:hover {
  text-decoration: underline;
}

.link-empty {
  color: #cbd5e1;
}

.empty-row {
  padding: 28px 12px !important;
  color: #94a3b8 !important;
  text-align: center;
}

.org-publish-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 12px 14px;
  background: #fbfcfe;
  border-top: 1px solid #e9edf3;
}

.foot-info {
  color: #64748b;
  font-size: 12px;
}

.foot-size {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
}

.foot-size select {
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 12px;
}

.foot-ops {
  display: flex;
  gap: 8px;
}

.mini {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  color: #33404f;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.mini:hover:not(:disabled) {
  border-color: #cfd7e6;
  color: #2f7df6;
}

.mini:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.clear-filter {
  margin-left: auto;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(146, 64, 14, 0.22);
  border-radius: 999px;
  background: #fff8ec;
  color: #92400e;
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.clear-count {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(146, 64, 14, 0.14);
  color: #9a3412;
  font-size: 11px;
  font-weight: 900;
}

@media (max-width: 900px) {
  .org-publish-ops {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .org-publish-loaded {
    display: none;
  }

  .org-publish-table thead th,
  .org-publish-table tbody td {
    white-space: nowrap;
  }
}
</style>

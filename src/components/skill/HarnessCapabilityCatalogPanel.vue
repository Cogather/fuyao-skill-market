<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import MarketDeptCascader from './MarketDeptCascader.vue';
import {
  getHarnessCapabilityPlanningApi,
  type HarnessCapabilityType,
} from '../../services/skillMarket/harnessCapabilityPlanningService';
import type {
  SkillMasterPayload,
  SkillMasterRecord,
  SkillMasterStatus,
} from '../../services/skillMarket/skillMasterManagementService';

type DepartmentNode = {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentNode[];
};

const props = withDefaults(
  defineProps<{
    capabilityType: Exclude<HarnessCapabilityType, 'skill'>;
    departmentTree?: DepartmentNode[];
    currentUserDepartmentPath?: string[];
  }>(),
  {
    departmentTree: () => [],
    currentUserDepartmentPath: () => [],
  },
);

const api = computed(() => getHarnessCapabilityPlanningApi(props.capabilityType));
const capabilityLabel = computed(() => api.value.label);
const departmentSegments = ref<string[]>([]);
const filterForm = reactive({ level: '部门级', departmentName: '', keyword: '' });
const records = ref<SkillMasterRecord[]>([]);
const loading = ref(false);
const selectedIds = ref<string[]>([]);
const pageNum = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [5, 10, 20, 50];
const toast = ref('');
let toastTimer: number | null = null;
const importInputRef = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const exporting = ref(false);

const editor = reactive({
  open: false,
  mode: 'create' as 'create' | 'edit',
  id: '',
  name: '',
  description: '',
  owner: '',
  department: '',
  developOwner: '',
  plannedCompleteDate: '',
  status: '未开始' as SkillMasterStatus,
  error: '',
  submitting: false,
});

const deleteDialog = reactive({
  open: false,
  ids: [] as string[],
  title: '',
  message: '',
  submitting: false,
});

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2600);
}

function normalizePath(path: string[]): string[] {
  return path
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function pathExists(nodes: DepartmentNode[], path: string[]): boolean {
  let current = nodes;
  for (const segment of path) {
    const node = current.find((item) => item.name === segment);
    if (!node) return false;
    current = node.children ?? [];
  }
  return path.length > 0;
}

function firstLeafPath(nodes: DepartmentNode[], parent: string[] = []): string[] {
  for (const node of nodes) {
    const path = [...parent, node.name];
    if (!node.children?.length) return path;
    const nested = firstLeafPath(node.children, path);
    if (nested.length) return nested;
  }
  return [];
}

function applyDefaultDepartment(): void {
  const preferred = normalizePath(props.currentUserDepartmentPath);
  const path = pathExists(props.departmentTree, preferred)
    ? preferred
    : firstLeafPath(props.departmentTree);
  departmentSegments.value = path;
  filterForm.departmentName = path.at(-1) ?? '';
}

const total = computed(() => records.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageRecords = computed(() => {
  const start = (pageNum.value - 1) * pageSize.value;
  return records.value.slice(start, start + pageSize.value);
});
const pageStart = computed(() => (total.value ? (pageNum.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(total.value, pageNum.value * pageSize.value));
const allPageSelected = computed(
  () =>
    pageRecords.value.length > 0 &&
    pageRecords.value.every((record) => selectedIds.value.includes(record.id)),
);

async function reload(): Promise<void> {
  loading.value = true;
  try {
    records.value = await api.value.queryCatalog({
      keyword: filterForm.keyword,
      departmentName: filterForm.departmentName,
      level: filterForm.level,
    });
    if (pageNum.value > totalPages.value) pageNum.value = totalPages.value;
    selectedIds.value = selectedIds.value.filter((id) =>
      records.value.some((record) => record.id === id),
    );
  } catch (error) {
    records.value = [];
    showToast(error instanceof Error ? error.message : '清单加载失败');
  } finally {
    loading.value = false;
  }
}

async function onDepartmentDone(path: string[] = []): Promise<void> {
  departmentSegments.value = normalizePath(path);
  filterForm.departmentName = departmentSegments.value.at(-1) ?? '';
  pageNum.value = 1;
  await reload();
}

async function applyQuery(): Promise<void> {
  pageNum.value = 1;
  await reload();
}

async function resetQuery(): Promise<void> {
  filterForm.level = '部门级';
  filterForm.keyword = '';
  applyDefaultDepartment();
  pageNum.value = 1;
  await reload();
}

function toggleSelection(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id];
}

function togglePageSelection(): void {
  const ids = pageRecords.value.map((record) => record.id);
  selectedIds.value = allPageSelected.value
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])];
}

function resetEditor(): void {
  Object.assign(editor, {
    id: '',
    name: '',
    description: '',
    owner: '',
    department: filterForm.departmentName,
    developOwner: '',
    plannedCompleteDate: '',
    status: '未开始' as SkillMasterStatus,
    error: '',
    submitting: false,
  });
}

function openCreate(): void {
  resetEditor();
  editor.mode = 'create';
  editor.open = true;
}

function openEdit(record: SkillMasterRecord): void {
  Object.assign(editor, {
    open: true,
    mode: 'edit',
    id: record.id,
    name: record.name,
    description: record.description,
    owner: record.owner,
    department: record.department,
    developOwner: record.developOwner,
    plannedCompleteDate: record.plannedCompleteDate,
    status: record.status,
    error: '',
    submitting: false,
  });
}

function closeEditor(): void {
  if (editor.submitting) return;
  editor.open = false;
  editor.error = '';
}

function editorPayload(): SkillMasterPayload {
  return {
    name: editor.name,
    description: editor.description,
    level: filterForm.level,
    product: '',
    owner: editor.owner,
    department: editor.department || filterForm.departmentName,
    developOwner: editor.developOwner,
    developOwnerDepartment: editor.department || filterForm.departmentName,
    plannedCompleteDate: editor.plannedCompleteDate,
    status: editor.status,
  };
}

async function submitEditor(): Promise<void> {
  editor.error = '';
  try {
    editor.submitting = true;
    if (editor.mode === 'create') {
      await api.value.createCatalog(editorPayload());
      showToast(`已新增 ${capabilityLabel.value}`);
    } else {
      await api.value.updateCatalog(editor.id, editorPayload());
      showToast('已保存修改');
    }
    editor.open = false;
    await reload();
  } catch (error) {
    editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
  } finally {
    editor.submitting = false;
  }
}

function requestDelete(record: SkillMasterRecord): void {
  Object.assign(deleteDialog, {
    open: true,
    ids: [record.id],
    title: `删除“${record.name}”？`,
    message: '删除后将不能用于新规划，已有规划仍保留历史快照。',
  });
}

function requestBatchDelete(): void {
  if (!selectedIds.value.length) {
    showToast('请先勾选需要批量删除的数据');
    return;
  }
  Object.assign(deleteDialog, {
    open: true,
    ids: [...selectedIds.value],
    title: `批量删除 ${capabilityLabel.value}？`,
    message: `确认删除已勾选的 ${selectedIds.value.length} 条数据吗？删除后将不能用于新规划。`,
  });
}

async function confirmDelete(): Promise<void> {
  try {
    deleteDialog.submitting = true;
    if (deleteDialog.ids.length === 1) {
      await api.value.deleteCatalog(deleteDialog.ids[0]!);
      showToast('已删除');
    } else {
      const count = await api.value.batchDeleteCatalog(deleteDialog.ids);
      showToast(`已删除 ${count} 条数据`);
    }
    selectedIds.value = selectedIds.value.filter((id) => !deleteDialog.ids.includes(id));
    deleteDialog.open = false;
    await reload();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败');
  } finally {
    deleteDialog.submitting = false;
  }
}

function triggerImport(): void {
  importInputRef.value?.click();
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    importing.value = true;
    const result = await api.value.importCatalog(file);
    const suffix = result.failCount ? `，失败 ${result.failCount} 条` : '';
    showToast(`成功导入 ${result.successCount} 条${suffix}`);
    await reload();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导入失败');
  } finally {
    importing.value = false;
  }
}

async function exportCurrent(): Promise<void> {
  try {
    exporting.value = true;
    await api.value.exportCatalog(records.value);
    showToast(`已开始导出 ${capabilityLabel.value} 清单`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

function goPage(next: number): void {
  pageNum.value = Math.max(1, Math.min(totalPages.value, next));
}

watch(
  () => props.capabilityType,
  async () => {
    selectedIds.value = [];
    pageNum.value = 1;
    await reload();
  },
);

onMounted(async () => {
  applyDefaultDepartment();
  await reload();
});
</script>

<template>
  <section class="capability-master-panel" :aria-label="`${capabilityLabel} 清单管理`">
    <section class="capability-master-filter" :aria-label="`${capabilityLabel} 清单查询`">
      <label class="capability-master-field capability-master-field--level">
        <span>层级 <em>*</em></span>
        <select v-model="filterForm.level" @change="applyQuery">
          <option value="部门级">部门级</option>
          <option value="产品级">产品级</option>
        </select>
      </label>
      <div class="capability-master-field capability-master-field--dept">
        <span>{{ filterForm.level === '产品级' ? '产品所属部门 *' : '归属部门 *' }}</span>
        <MarketDeptCascader
          v-model="departmentSegments"
          class="capability-master-dept-cascader"
          :tree="props.departmentTree"
          :max-level="6"
          all-label="请选择部门"
          selection-mode="confirm"
          searchable
          @clear="onDepartmentDone"
          @done="onDepartmentDone"
        />
      </div>
      <label class="capability-master-field capability-master-field--keyword">
        <span>关键词</span>
        <input
          v-model.trim="filterForm.keyword"
          type="search"
          :placeholder="`搜索 ${capabilityLabel} 或 Owner`"
          @keydown.enter.prevent="applyQuery"
        />
      </label>
      <div class="capability-master-filter__actions">
        <button type="button" class="capability-master-btn is-primary" @click="applyQuery">
          查询
        </button>
        <button type="button" class="capability-master-btn" @click="resetQuery">重置</button>
      </div>
    </section>

    <section class="capability-master-board">
      <header class="capability-master-toolbar">
        <div class="capability-master-toolbar__summary">
          <strong>{{ capabilityLabel }} 原子清单</strong>
          <small
            >已选 {{ selectedIds.length }} 条 / 共 {{ total }} 条 · 可被不同部门的规划复用</small
          >
        </div>
        <div class="capability-master-toolbar__actions">
          <input
            ref="importInputRef"
            hidden
            type="file"
            accept=".xlsx,.xls"
            @change="handleImport"
          />
          <button type="button" class="capability-master-btn is-primary" @click="openCreate">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增
          </button>
          <button
            type="button"
            class="capability-master-btn"
            :disabled="importing"
            @click="triggerImport"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10m0-10 4 4m-4-4-4 4M5 17v2h14v-2" />
            </svg>
            {{ importing ? '导入中...' : '导入' }}
          </button>
          <button
            type="button"
            class="capability-master-btn"
            :disabled="exporting"
            @click="exportCurrent"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20V10m0 10 4-4m-4 4-4-4M5 7V5h14v2" />
            </svg>
            {{ exporting ? '导出中...' : '导出' }}
          </button>
          <button type="button" class="capability-master-btn is-danger" @click="requestBatchDelete">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
            </svg>
            批量删除
          </button>
        </div>
      </header>

      <div class="capability-master-table-wrap">
        <table class="capability-master-table">
          <thead>
            <tr>
              <th class="is-check">
                <input
                  type="checkbox"
                  :checked="allPageSelected"
                  :disabled="!pageRecords.length"
                  @change="togglePageSelection"
                />
              </th>
              <th>{{ capabilityLabel }}</th>
              <th>描述</th>
              <th>责任 Owner</th>
              <th>开发责任人</th>
              <th>计划完成</th>
              <th>当前进展</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="is-empty">正在加载 {{ capabilityLabel }} 清单...</td>
            </tr>
            <tr v-for="record in loading ? [] : pageRecords" :key="record.id">
              <td class="is-check">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(record.id)"
                  @change="toggleSelection(record.id)"
                />
              </td>
              <td>
                <div class="capability-name-cell">
                  <strong class="capability-name">{{ record.name }}</strong>
                </div>
              </td>
              <td class="is-description">{{ record.description }}</td>
              <td>{{ record.owner }}</td>
              <td>{{ record.developOwner }}</td>
              <td>{{ record.plannedCompleteDate || '—' }}</td>
              <td>
                <span class="capability-status" :class="`is-${record.status}`">{{
                  record.status
                }}</span>
              </td>
              <td class="is-action">
                <div class="capability-row-actions">
                  <button type="button" title="编辑" aria-label="编辑" @click="openEdit(record)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                      <path d="m13 7 4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="is-danger"
                    title="删除"
                    aria-label="删除"
                    @click="requestDelete(record)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M9 7V5h6v2m-8 3 1 9h8l1-9" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !pageRecords.length">
              <td colspan="8" class="is-empty">暂无符合条件的 {{ capabilityLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="capability-master-pagination">
        <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ total }} 条</span>
        <div class="capability-master-pagination__controls">
          <select v-model.number="pageSize" @change="pageNum = 1">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} 条/页
            </option>
          </select>
          <button type="button" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">
            上一页
          </button>
          <span>{{ pageNum }} / {{ totalPages }}</span>
          <button type="button" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">
            下一页
          </button>
        </div>
      </footer>
    </section>

    <Teleport to="body">
      <div v-if="editor.open" class="capability-master-overlay" @click.self="closeEditor">
        <form class="capability-master-dialog" @submit.prevent="submitEditor">
          <header>
            <div>
              <small>{{ capabilityLabel.toUpperCase() }} MASTER</small>
              <strong>{{
                editor.mode === 'create' ? `添加 ${capabilityLabel}` : `编辑 ${capabilityLabel}`
              }}</strong>
              <p>这里只维护可复用的原子能力；场景、活动、层级和部门/产品请在规划页配置。</p>
            </div>
            <button type="button" @click="closeEditor">×</button>
          </header>
          <div class="capability-master-form">
            <label class="is-wide">
              <span>{{ capabilityLabel }} 名称 *</span>
              <input
                v-model.trim="editor.name"
                maxlength="80"
                :placeholder="`请输入 ${capabilityLabel} 名称`"
              />
            </label>
            <label class="is-wide">
              <span>{{ capabilityLabel }} 说明 *</span>
              <textarea v-model.trim="editor.description" rows="4" maxlength="300" />
            </label>
            <label>
              <span>责任 Owner *</span>
              <input v-model.trim="editor.owner" placeholder="姓名 工号" />
            </label>
            <label>
              <span>开发责任人 *</span>
              <input v-model.trim="editor.developOwner" placeholder="姓名 工号" />
            </label>
            <label>
              <span>归属部门</span>
              <input v-model.trim="editor.department" readonly />
            </label>
            <label>
              <span>计划完成时间</span>
              <input v-model="editor.plannedCompleteDate" type="date" />
            </label>
            <label>
              <span>当前进展</span>
              <select v-model="editor.status">
                <option value="未开始">未开始</option>
                <option value="开发中">开发中</option>
                <option value="进行中">进行中</option>
                <option value="联调中">联调中</option>
                <option value="已完成">已完成</option>
              </select>
            </label>
          </div>
          <p v-if="editor.error" class="capability-master-error">{{ editor.error }}</p>
          <footer>
            <button type="button" @click="closeEditor">取消</button>
            <button type="submit" class="is-primary" :disabled="editor.submitting">
              {{ editor.submitting ? '保存中...' : '保存' }}
            </button>
          </footer>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="deleteDialog.open"
        class="capability-master-overlay"
        @click.self="deleteDialog.open = false"
      >
        <div class="capability-master-dialog is-confirm">
          <i>!</i>
          <strong>{{ deleteDialog.title }}</strong>
          <p>{{ deleteDialog.message }}</p>
          <footer>
            <button type="button" @click="deleteDialog.open = false">取消</button>
            <button
              type="button"
              class="is-danger"
              :disabled="deleteDialog.submitting"
              @click="confirmDelete"
            >
              确认删除
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="toast" class="capability-master-toast" data-app-toast role="status">
        {{ toast }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.capability-master-panel {
  display: grid;
  gap: 16px;
  color: #17233d;
  font-size: 13px;
}
.capability-master-filter {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(360px, 1.75fr) minmax(320px, 2fr) auto;
  gap: 14px;
  align-items: end;
  padding: 18px;
  border: 1px solid #dbe5f3;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 34px rgba(45, 58, 92, 0.06);
}
.capability-master-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.capability-master-field > span {
  color: #52637d;
  font-size: 12px;
  font-weight: 800;
}
.capability-master-field em {
  color: #ef4444;
  font-style: normal;
}
.capability-master-field input,
.capability-master-field select {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 0 11px;
  border: 1px solid #cfdaea;
  border-radius: 6px;
  outline: none;
  background: #fff;
  color: #233552;
  font: inherit;
  font-size: 13px;
}
.capability-master-dept-cascader :deep(.market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  padding: 0 30px 0 11px;
  border-color: #cfdaea;
  border-radius: 6px;
  background: #fff;
  color: #233552;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}
.capability-master-field input:focus,
.capability-master-field select:focus {
  border-color: #6285f5;
  box-shadow: 0 0 0 3px rgba(75, 103, 241, 0.11);
}
.capability-master-filter__actions {
  display: flex;
  gap: 10px;
}
.capability-master-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #d4dfef;
  border-radius: 6px;
  background: #fff;
  color: #263957;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}
.capability-master-btn svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.capability-master-btn:hover:not(:disabled) {
  border-color: #91a9ea;
  background: #f7f9ff;
  transform: translateY(-1px);
}
.capability-master-btn.is-primary {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(47, 125, 246, 0.18);
}
.capability-master-btn.is-danger {
  border-color: #ffd7d7;
  background: #fff7f7;
  color: #dc2626;
}
.capability-master-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.capability-master-board {
  height: clamp(520px, calc(100vh - 395px), 880px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.06);
}
.capability-master-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #edf2f7;
}
.capability-master-toolbar__summary {
  display: grid;
  gap: 4px;
}
.capability-master-toolbar__summary strong {
  color: #101828;
  font-size: 17px;
  font-weight: 900;
}
.capability-master-toolbar__summary small {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.capability-master-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.capability-master-table-wrap {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: auto;
}
.capability-master-table {
  width: 100%;
  min-width: 1180px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.capability-master-table thead {
  position: relative;
  z-index: 20;
}
.capability-master-table th,
.capability-master-table td {
  padding: 13px 12px;
  border-bottom: 1px solid #edf2f7;
  color: #334155;
  font-size: 13px;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}
.capability-master-table th {
  position: sticky;
  top: 0;
  z-index: 21;
  overflow: visible;
  background: #f8fbff;
  color: #52647d;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
th:nth-child(1) {
  width: 52px;
}
th:nth-child(2) {
  width: 220px;
}
th:nth-child(3) {
  width: 300px;
}
th:nth-child(4),
th:nth-child(5) {
  width: 150px;
}
th:nth-child(6) {
  width: 118px;
}
th:nth-child(7) {
  width: 110px;
}
th:nth-child(8) {
  width: 120px;
}
.capability-master-table tbody tr:hover td {
  background: #f8fbff;
}
td.is-description {
  color: #334155;
}
.is-check {
  text-align: center;
}
.capability-name-cell {
  display: flex;
  align-items: center;
}
.capability-name {
  color: #10243e;
  font-weight: 900;
}
.capability-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
}
.capability-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.capability-row-actions button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #2563eb;
  cursor: pointer;
}
.capability-row-actions button:hover:not(:disabled) {
  border-color: #b9ccff;
  background: #eff6ff;
}
.capability-row-actions button.is-danger {
  color: #dc2626;
}
.capability-row-actions button.is-danger:hover:not(:disabled) {
  border-color: #fecaca;
  background: #fff1f2;
}
.capability-row-actions svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.is-empty {
  height: 108px;
  color: #64748b;
  text-align: center;
}
.capability-master-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  color: #64748b;
  font-size: 13px;
}
.capability-master-pagination__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.capability-master-pagination select,
.capability-master-pagination button {
  height: 32px;
  border: 1px solid #dbe5f2;
  border-radius: 6px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-size: 13px;
}
.capability-master-pagination select {
  padding: 0 8px;
}
.capability-master-pagination button {
  padding: 0 10px;
  cursor: pointer;
}
.capability-master-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.capability-master-overlay {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(3px);
}
.capability-master-dialog {
  width: min(760px, calc(100vw - 40px));
  overflow: hidden;
  border: 1px solid #dbe4f1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}
.capability-master-dialog > header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid #e9eef5;
}
.capability-master-dialog > header div {
  display: grid;
  gap: 5px;
}
.capability-master-dialog > header small {
  color: #4f67e8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}
.capability-master-dialog > header strong {
  font-size: 20px;
}
.capability-master-dialog > header p {
  margin: 0;
  color: #718096;
  font-size: 13px;
}
.capability-master-dialog > header button {
  border: 0;
  background: transparent;
  color: #7a879b;
  font-size: 26px;
  cursor: pointer;
}
.capability-master-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding: 24px 28px;
}
.capability-master-form label {
  display: grid;
  gap: 8px;
  color: #40516b;
  font-size: 13px;
  font-weight: 800;
}
.capability-master-form label.is-wide {
  grid-column: 1 / -1;
}
.capability-master-form input,
.capability-master-form textarea,
.capability-master-form select {
  box-sizing: border-box;
  width: 100%;
  padding: 11px 13px;
  border: 1px solid #d1dbea;
  border-radius: 8px;
  outline: none;
  color: #263753;
  font: inherit;
  font-size: 13px;
  resize: vertical;
}
.capability-master-dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 28px 22px;
}
.capability-master-dialog > footer button {
  height: 42px;
  padding: 0 20px;
  border: 1px solid #d5dfed;
  border-radius: 8px;
  background: #fff;
  color: #334763;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.capability-master-dialog > footer button.is-primary {
  border-color: #4c65ea;
  background: linear-gradient(135deg, #2f7df4, #6548ef);
  color: #fff;
}
.capability-master-dialog > footer button.is-danger {
  border-color: #ef4444;
  background: #ef4444;
  color: #fff;
}
.capability-master-error {
  margin: 0 28px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff1f2;
  color: #d92d3e;
  font-size: 13px;
}
.capability-master-dialog.is-confirm {
  width: min(440px, calc(100vw - 40px));
  padding: 28px;
  text-align: center;
}
.capability-master-dialog.is-confirm > i {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  place-items: center;
  border-radius: 50%;
  background: #fff0f1;
  color: #e13847;
  font-style: normal;
  font-weight: 900;
}
.capability-master-dialog.is-confirm > strong {
  font-size: 19px;
}
.capability-master-dialog.is-confirm > p {
  color: #718096;
}
.capability-master-dialog.is-confirm > footer {
  justify-content: center;
  padding-bottom: 0;
}
.capability-master-toast {
  position: fixed;
  z-index: 1500;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 18px;
  border-radius: 9px;
  background: #17233d;
  color: #fff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.25);
  font-size: 13px;
  font-weight: 700;
}
@media (max-width: 1100px) {
  .capability-master-filter {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .capability-master-filter__actions {
    justify-content: flex-end;
  }
  .capability-master-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

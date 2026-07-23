<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  createSkillMasterRecord,
  deleteSkillMasterRecord,
  listSkillMasterRecords,
  updateSkillMasterRecord,
  type SkillMasterPayload,
  type SkillMasterRecord,
  type SkillMasterStatus,
} from '../../services/skillMarket/skillMasterManagementService';

const records = ref<SkillMasterRecord[]>([]);
const keyword = ref('');
const statusFilter = ref<'all' | SkillMasterStatus>('all');
const levelFilter = ref('all');
const toast = ref('');
let toastTimer: number | null = null;

const statusOptions: SkillMasterStatus[] = ['未开始', '开发中', '已完成'];
const levelOptions = ['部门级', '产品级'];

const editor = reactive({
  open: false,
  mode: 'create' as 'create' | 'edit',
  id: '',
  name: '',
  description: '',
  level: '',
  product: '',
  owner: '',
  department: '',
  developOwner: '',
  plannedCompleteDate: '',
  status: '未开始' as SkillMasterStatus,
  error: '',
});

const deleteDialog = reactive({ open: false, id: '', name: '' });

const filteredRecords = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return records.value.filter((record) => {
    if (statusFilter.value !== 'all' && record.status !== statusFilter.value) return false;
    if (levelFilter.value !== 'all' && record.level !== levelFilter.value) return false;
    if (!text) return true;
    return [
      record.name,
      record.description,
      record.product,
      record.owner,
      record.department,
      record.developOwner,
    ]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
});

const metrics = computed(() => ({
  total: records.value.length,
  building: records.value.filter((record) => ['开发中'].includes(record.status)).length,
  complete: records.value.filter((record) => record.status === '已完成').length,
}));

function reload(): void {
  records.value = listSkillMasterRecords();
}

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2400);
}

function resetEditor(): void {
  Object.assign(editor, {
    id: '',
    name: '',
    description: '',
    level: '',
    product: '',
    owner: '',
    department: '',
    developOwner: '',
    plannedCompleteDate: '',
    status: '未开始',
    error: '',
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
    level: record.level,
    product: record.product,
    owner: record.owner,
    department: record.department,
    developOwner: record.developOwner,
    plannedCompleteDate: record.plannedCompleteDate,
    status: record.status,
    error: '',
  });
}

function closeEditor(): void {
  editor.open = false;
  editor.error = '';
}

function submitEditor(): void {
  const payload: SkillMasterPayload = {
    name: editor.name,
    description: editor.description,
    level: editor.level,
    product: editor.product,
    owner: editor.owner,
    department: editor.department,
    developOwner: editor.developOwner,
    plannedCompleteDate: editor.plannedCompleteDate,
    status: editor.status,
  };
  try {
    if (editor.mode === 'create') {
      createSkillMasterRecord(payload);
      showToast('Skill 规划已添加，可在独立关系中关联场景和活动');
    } else {
      updateSkillMasterRecord(editor.id, payload);
      showToast('Skill 主体信息已更新');
    }
    closeEditor();
    reload();
  } catch (error) {
    editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
  }
}

function requestDelete(record: SkillMasterRecord): void {
  Object.assign(deleteDialog, { open: true, id: record.id, name: record.name });
}

function confirmDelete(): void {
  deleteSkillMasterRecord(deleteDialog.id);
  deleteDialog.open = false;
  reload();
  showToast('Skill 规划已删除');
}

onMounted(reload);
onBeforeUnmount(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <section class="master-panel" aria-label="Skill 管理">
    <div class="master-hero">
      <div class="master-hero__copy">
        <span>SKILL MASTER DATA</span>
        <h3>Skill 主体独立维护</h3>
        <p>这里只维护 Skill 自身信息，不在 Skill 记录中保存任何场景或活动字段。</p>
      </div>
      <div class="master-metrics" aria-label="Skill 主体概览">
        <div>
          <strong>{{ metrics.total }}</strong
          ><span>Skill 总数</span>
        </div>
        <div>
          <strong>{{ metrics.building }}</strong
          ><span>建设中</span>
        </div>
        <div>
          <strong>{{ metrics.complete }}</strong
          ><span>已完成</span>
        </div>
      </div>
    </div>

    <div class="separation-map" aria-label="Skill 与分类体系解耦关系">
      <div class="separation-node is-core">
        <small>独立主体</small><strong>Skill</strong><span>名称 · 说明 · Owner · 进展</span>
      </div>
      <div class="separation-link"><span>通过关系表按需关联</span><i>→</i></div>
      <div class="separation-targets">
        <div><small>分类体系</small><strong>场景</strong><span>一级 / 二级场景</span></div>
        <div><small>业务过程</small><strong>活动</strong><span>活动 / 子活动</span></div>
      </div>
    </div>

    <div class="master-board">
      <header class="master-toolbar">
        <div>
          <strong>Skill 规划主体</strong>
          <small>共 {{ filteredRecords.length }} 条 · 不含场景及活动字段</small>
        </div>
        <div class="master-toolbar__actions">
          <input
            v-model.trim="keyword"
            type="search"
            placeholder="搜索 Skill、产品、Owner 或部门"
          />
          <select v-model="levelFilter" aria-label="按层级筛选">
            <option value="all">全部层级</option>
            <option v-for="item in levelOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <select v-model="statusFilter" aria-label="按进展筛选">
            <option value="all">全部进展</option>
            <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <button type="button" class="master-primary-btn" @click="openCreate">
            ＋ 添加 Skill 规划
          </button>
        </div>
      </header>

      <div class="master-table-wrap">
        <table class="master-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>层级</th>
              <th>产品 / 服务</th>
              <th>责任 Owner</th>
              <th>归属部门</th>
              <th>开发责任人</th>
              <th>计划完成</th>
              <th>当前进展</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in filteredRecords" :key="record.id">
              <td>
                <div class="master-name-cell">
                  <span>{{ record.name.slice(0, 1) }}</span>
                  <div>
                    <strong>{{ record.name }}</strong>
                    <small :title="record.description">{{ record.description }}</small>
                  </div>
                </div>
              </td>
              <td>
                <span class="level-badge">{{ record.level }}</span>
              </td>
              <td>{{ record.product || '待明确' }}</td>
              <td>{{ record.owner }}</td>
              <td>{{ record.department || '待明确' }}</td>
              <td>{{ record.developOwner || '待认领' }}</td>
              <td>{{ record.plannedCompleteDate || '待排期' }}</td>
              <td>
                <span class="status-badge" :class="'is-' + record.status">{{ record.status }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <button type="button" @click="openEdit(record)">编辑</button>
                  <button type="button" class="is-danger" @click="requestDelete(record)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredRecords.length === 0">
              <td colspan="9" class="master-empty">暂无符合条件的 Skill 规划</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="editor.open" class="master-overlay" @click.self="closeEditor">
        <form class="master-dialog" @submit.prevent="submitEditor">
          <header>
            <div>
              <small>SKILL MASTER</small>
              <strong>{{
                editor.mode === 'create' ? '添加 Skill 规划' : '编辑 Skill 规划'
              }}</strong>
              <p>场景和活动不在这里维护，保存后再通过独立关系按需关联。</p>
            </div>
            <button type="button" aria-label="关闭" @click="closeEditor">×</button>
          </header>

          <div class="decoupled-note">
            <span>已解耦字段</span><b>不包含一级场景、二级场景、活动、子活动</b>
          </div>

          <div class="master-form-grid">
            <label class="is-wide">
              <span>Skill 名称 <em>*</em></span>
              <input
                v-model.trim="editor.name"
                maxlength="60"
                placeholder="例如：接口契约检查 Skill"
              />
            </label>
            <label class="is-wide">
              <span>Skill 说明 <em>*</em></span>
              <textarea
                v-model.trim="editor.description"
                maxlength="300"
                rows="4"
                placeholder="描述 Skill 解决的问题和核心能力"
              ></textarea>
            </label>
            <label>
              <span>层级 <em>*</em></span>
              <select v-model="editor.level">
                <option value="" disabled>请选择</option>
                <option v-for="item in levelOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>产品 / 服务</span>
              <input v-model.trim="editor.product" placeholder="请输入产品或服务名称" />
            </label>
            <label>
              <span>责任 Owner <em>*</em></span>
              <input v-model.trim="editor.owner" placeholder="请输入责任人" />
            </label>
            <label>
              <span>归属部门</span>
              <input v-model.trim="editor.department" placeholder="请输入部门名称" />
            </label>
            <label>
              <span>开发责任人</span>
              <input v-model.trim="editor.developOwner" placeholder="可稍后认领" />
            </label>
            <label>
              <span>计划完成时间</span>
              <input v-model="editor.plannedCompleteDate" type="date" />
            </label>
            <label>
              <span>当前进展</span>
              <select v-model="editor.status">
                <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>

          <p v-if="editor.error" class="master-error">{{ editor.error }}</p>
          <footer>
            <button type="button" @click="closeEditor">取消</button>
            <button type="submit" class="master-primary-btn">保存 Skill 规划</button>
          </footer>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="deleteDialog.open" class="master-overlay" @click.self="deleteDialog.open = false">
        <div class="master-dialog master-dialog--delete">
          <i>!</i>
          <strong>删除“{{ deleteDialog.name }}”？</strong>
          <p>仅删除 Skill 主体记录；独立分类体系不会受到影响。</p>
          <footer>
            <button type="button" @click="deleteDialog.open = false">取消</button>
            <button type="button" class="is-danger" @click="confirmDelete">确认删除</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="master-toast" role="status">{{ toast }}</div>
  </section>
</template>

<style scoped lang="scss">
.master-panel {
  display: grid;
  gap: 18px;
  color: #17233d;
}

.master-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  border: 1px solid #dce7f3;
  border-radius: 12px;
  background:
    radial-gradient(circle at 82% 15%, rgba(65, 118, 239, 0.15), transparent 30%),
    linear-gradient(110deg, #fff, #f6f9ff);
  box-shadow: 0 12px 34px rgba(45, 58, 92, 0.07);
}

.master-hero__copy > span {
  color: #3766d7;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.master-hero h3 {
  margin: 5px 0 6px;
  color: #111d35;
  font-size: 22px;
  font-weight: 900;
}

.master-hero p {
  margin: 0;
  color: #66748b;
  font-size: 13px;
  line-height: 1.7;
}

.master-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(92px, 1fr));
  min-width: 330px;
  border: 1px solid #dae4f4;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
}

.master-metrics div {
  display: grid;
  min-height: 76px;
  place-content: center;
  text-align: center;
}

.master-metrics div + div {
  border-left: 1px solid #e4eaf4;
}

.master-metrics strong {
  font-size: 22px;
  font-weight: 900;
}

.master-metrics span {
  margin-top: 3px;
  color: #7c879a;
  font-size: 10px;
  font-weight: 700;
}

.separation-map {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) 180px minmax(360px, 1.4fr);
  align-items: stretch;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e0e7f2;
  border-radius: 12px;
  background: #fff;
}

.separation-node,
.separation-targets > div {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border-radius: 9px;
}

.separation-node {
  border: 1px solid #bfcff5;
  background: #f2f6ff;
}

.separation-node small,
.separation-targets small {
  color: #76849a;
  font-size: 9px;
  font-weight: 800;
}

.separation-node strong,
.separation-targets strong {
  font-size: 15px;
}

.separation-node span,
.separation-targets span {
  color: #7c889b;
  font-size: 10px;
}

.separation-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #78859a;
  font-size: 10px;
  font-weight: 800;
}

.separation-link i {
  color: #3f6fe3;
  font-size: 22px;
  font-style: normal;
}

.separation-targets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.separation-targets > div {
  border: 1px solid #e2e7ef;
  background: #fafbfc;
}

.master-board {
  overflow: hidden;
  border: 1px solid #dfe6f1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(35, 52, 84, 0.06);
}

.master-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #e9eef5;
}

.master-toolbar > div:first-child {
  display: grid;
  gap: 3px;
}

.master-toolbar > div:first-child strong {
  font-size: 16px;
  font-weight: 900;
}

.master-toolbar > div:first-child small {
  color: #8b96a7;
  font-size: 11px;
}

.master-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.master-toolbar input,
.master-toolbar select {
  height: 36px;
  padding: 0 11px;
  border: 1px solid #d9e1ed;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #40506a;
}

.master-toolbar input {
  width: 260px;
}

.master-primary-btn {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #3569e8 !important;
  border-radius: 8px;
  background: #3569e8 !important;
  color: #fff !important;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.master-table-wrap {
  overflow: auto;
}

.master-table {
  width: 100%;
  min-width: 1240px;
  border-collapse: collapse;
  table-layout: fixed;
}

.master-table th {
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid #e9eef5;
  background: #f8f9fc;
  color: #7f8b9e;
  font-size: 11px;
  font-weight: 800;
  text-align: left;
}

.master-table td {
  height: 76px;
  padding: 8px 12px;
  border-bottom: 1px solid #eff2f7;
  color: #435169;
  font-size: 11px;
}

.master-table th:first-child {
  width: 280px;
}

.master-table th:nth-child(2) {
  width: 76px;
}

.master-table th:nth-child(3),
.master-table th:nth-child(5) {
  width: 120px;
}

.master-table th:nth-child(4),
.master-table th:nth-child(6) {
  width: 90px;
}

.master-table th:nth-child(7),
.master-table th:nth-child(8) {
  width: 96px;
}

.master-table th:last-child {
  width: 96px;
  text-align: right;
}

.master-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.master-name-cell > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #edf3ff;
  color: #3b68d4;
  font-weight: 900;
}

.master-name-cell > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.master-name-cell strong,
.master-name-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.master-name-cell strong {
  color: #223149;
  font-size: 13px;
}

.master-name-cell small {
  color: #8a95a5;
  font-size: 10px;
}

.level-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 800;
}

.level-badge {
  background: #eef3ff;
  color: #4c69af;
}

.status-badge {
  background: #f1f3f7;
  color: #66758c;
}

.status-badge.is-开发中,
.status-badge.is-联调中 {
  background: #fff3df;
  color: #aa6415;
}

.status-badge.is-已完成 {
  background: #eaf8f1;
  color: #27815d;
}

.status-badge.is-已延期 {
  background: #fff0f1;
  color: #d74750;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.row-actions button {
  height: 28px;
  padding: 0 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #526b9d;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.row-actions button:hover {
  background: #f1f4f9;
}

.is-danger {
  color: #d94a54 !important;
}

.master-empty {
  height: 150px !important;
  color: #8d98a9 !important;
  text-align: center;
}

.master-overlay {
  position: fixed;
  inset: 0;
  z-index: 970;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}

.master-dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}

.master-dialog > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.master-dialog > header > div {
  display: grid;
  gap: 3px;
}

.master-dialog > header small {
  color: #3569e8;
  font-size: 10px;
  font-weight: 900;
}

.master-dialog > header strong {
  color: #1d2a41;
  font-size: 20px;
}

.master-dialog > header p {
  margin: 2px 0 0;
  color: #8893a5;
  font-size: 11px;
}

.master-dialog > header > button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f2f4f8;
  color: #71809a;
  font-size: 20px;
  cursor: pointer;
}

.decoupled-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #dce7fb;
  border-radius: 8px;
  background: #f5f8ff;
  color: #58709e;
  font-size: 10px;
}

.decoupled-note span {
  padding: 3px 6px;
  border-radius: 99px;
  background: #dfe9ff;
  color: #3765cf;
  font-weight: 900;
}

.master-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}

.master-form-grid label {
  display: grid;
  gap: 7px;
}

.master-form-grid label.is-wide {
  grid-column: 1 / -1;
}

.master-form-grid label > span {
  color: #4d5d75;
  font-size: 11px;
  font-weight: 800;
}

.master-form-grid em {
  color: #d94a54;
  font-style: normal;
}

.master-form-grid input,
.master-form-grid select,
.master-form-grid textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0 11px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #26344c;
}

.master-form-grid input,
.master-form-grid select {
  height: 40px;
}

.master-form-grid textarea {
  padding-top: 10px;
  resize: vertical;
}

.master-form-grid :is(input, select, textarea):focus {
  border-color: #6d92ec;
  box-shadow: 0 0 0 3px rgba(53, 105, 232, 0.1);
}

.master-error {
  padding: 9px 11px;
  border-radius: 7px;
  background: #fff1f2;
  color: #d94851;
  font-size: 11px;
}

.master-dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}

.master-dialog > footer > button {
  height: 36px;
  padding: 0 16px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
  color: #526079;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.master-dialog--delete {
  width: min(430px, calc(100vw - 32px));
  text-align: center;
}

.master-dialog--delete > i {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: #fff0f1;
  color: #dc4651;
  font-size: 24px;
  font-style: normal;
  font-weight: 900;
}

.master-dialog--delete > strong {
  font-size: 17px;
}

.master-dialog--delete > p {
  color: #748095;
  font-size: 11px;
}

.master-dialog--delete footer .is-danger {
  border-color: #dc4651;
  background: #dc4651;
  color: #fff !important;
}

.master-toast {
  position: fixed;
  left: 50%;
  bottom: 30px;
  z-index: 990;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 99px;
  background: rgba(25, 34, 51, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .master-hero,
  .master-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .master-metrics {
    min-width: 0;
  }

  .master-toolbar__actions {
    flex-wrap: wrap;
  }

  .separation-map {
    grid-template-columns: 1fr;
  }

  .separation-link i {
    transform: rotate(90deg);
  }
}

@media (max-width: 680px) {
  .master-hero {
    padding: 20px;
  }

  .master-toolbar input {
    width: 100%;
  }

  .master-toolbar__actions > * {
    flex: 1 1 150px;
  }

  .master-form-grid,
  .separation-targets {
    grid-template-columns: 1fr;
  }

  .master-form-grid label.is-wide {
    grid-column: auto;
  }
}
</style>

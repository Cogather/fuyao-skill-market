<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MarketDeptCascader from './MarketDeptCascader.vue';
import { listScenes, type SceneRecord } from '../../services/skillMarket/sceneManagementService';
import {
  listActivities,
  type ActivityRecord,
} from '../../services/skillMarket/activityManagementService';
import {
  getSkillMasterAssociation,
  removeSkillMasterAssociation,
  saveSkillMasterAssociation,
  type SkillMasterAssociation,
} from '../../services/skillMarket/skillMasterAssociationService';
import {
  createSkillMasterRecord,
  deleteSkillMasterRecord,
  listSkillMasterRecords,
  updateSkillMasterRecord,
  type SkillMasterPayload,
  type SkillMasterRecord,
  type SkillMasterStatus,
} from '../../services/skillMarket/skillMasterManagementService';
import {
  querySkillPlanningUsers,
  type SkillPlanningUserOption,
} from '../../services/skillMarket/skillPlanningService';

type DepartmentNode = { name: string; children?: DepartmentNode[] };
type TaxonomyOption = { id: string; label: string };

const props = withDefaults(defineProps<{ departmentTree?: DepartmentNode[] }>(), {
  departmentTree: () => [],
});
const records = ref<SkillMasterRecord[]>([]);
const associations = ref<Record<string, SkillMasterAssociation>>({});
const keyword = ref('');
const statusFilter = ref<'all' | SkillMasterStatus>('all');
const toast = ref('');
let toastTimer: number | null = null;
const statusOptions: SkillMasterStatus[] = ['未开始', '开发中', '已完成'];

function makeTaxonomyOptions(records: Array<SceneRecord | ActivityRecord>): TaxonomyOption[] {
  const parentNames = new Map(records.map((item) => [item.id, item.name]));
  return records
    .filter((item) => item.status === 'enabled')
    .map((item) => ({
      id: item.id,
      label: item.parentId
        ? `${parentNames.get(item.parentId) || '未分类'} / ${item.name}`
        : item.name,
    }));
}
const sceneOptions = ref<TaxonomyOption[]>([]);
const activityOptions = ref<TaxonomyOption[]>([]);
const ownerOptions = ref<SkillPlanningUserOption[]>([]);
const developOwnerOptions = ref<SkillPlanningUserOption[]>([]);
const personDisplayLabels = ref<Record<string, string>>({});
let ownerSearchTimer: number | null = null;
let developOwnerSearchTimer: number | null = null;
let ownerSearchSequence = 0;
let developOwnerSearchSequence = 0;
let personLabelLoadSequence = 0;

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
  developOwnerDepartment: '',
  plannedCompleteDate: '',
  status: '未开始' as SkillMasterStatus,
  error: '',
});
const associationEditor = reactive({
  open: false,
  skillId: '',
  skillName: '',
  sceneIds: [] as string[],
  activityIds: [] as string[],
  planningDepartments: [] as string[],
});
const departmentPath = ref<string[]>([]);
const deleteDialog = reactive({ open: false, id: '', name: '' });

const filteredRecords = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return records.value.filter((record) => {
    if (statusFilter.value !== 'all' && record.status !== statusFilter.value) return false;
    if (!text) return true;
    return [record.name, record.description, record.owner, record.department, record.developOwner]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
});
const metrics = computed(() => ({
  total: records.value.length,
  building: records.value.filter((record) => ['开发中', '联调中'].includes(record.status)).length,
  complete: records.value.filter((record) => record.status === '已完成').length,
}));

function associationFor(skillId: string): SkillMasterAssociation {
  return (
    associations.value[skillId] ?? {
      skillId,
      sceneIds: [],
      activityIds: [],
      planningDepartments: [],
      updatedAt: '',
    }
  );
}
function looksLikePersonLabel(value: string): boolean {
  return /\s+\S+$/.test(value.trim());
}

function personDisplayLabel(value: string): string {
  const normalized = value.trim();
  return personDisplayLabels.value[normalized] || normalized || '待认领';
}

function matchingPersonOption(
  options: SkillPlanningUserOption[],
  value: string,
): SkillPlanningUserOption | undefined {
  const normalized = value.trim();
  return options.find(
    (item) => item.label === normalized || item.id === normalized || item.chName === normalized,
  );
}

async function hydratePersonDisplayLabels(sourceRecords: SkillMasterRecord[]): Promise<void> {
  const sequence = ++personLabelLoadSequence;
  const values = [
    ...new Set(
      sourceRecords
        .flatMap((record) => [record.owner, record.developOwner])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const entries = await Promise.all(
    values.map(async (value) => {
      if (looksLikePersonLabel(value)) return [value, value] as const;
      try {
        const options = await querySkillPlanningUsers(value);
        return [value, matchingPersonOption(options, value)?.label || value] as const;
      } catch {
        return [value, value] as const;
      }
    }),
  );
  if (sequence === personLabelLoadSequence) {
    personDisplayLabels.value = Object.fromEntries(entries);
  }
}

function reload(): void {
  records.value = listSkillMasterRecords();
  associations.value = Object.fromEntries(
    records.value.map((record) => [record.id, getSkillMasterAssociation(record.id)]),
  );
  void hydratePersonDisplayLabels(records.value);
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
    developOwnerDepartment: '',
    plannedCompleteDate: '',
    status: '未开始',
    error: '',
  });
  ownerOptions.value = [];
  developOwnerOptions.value = [];
}
function resolveOwnerSelection(): void {
  const value = editor.owner.trim();
  const option = matchingPersonOption(ownerOptions.value, value);
  if (!option) return;
  editor.owner = option.label;
  editor.department = option.deptName;
}

function resolveDevelopOwnerSelection(): void {
  const option = matchingPersonOption(developOwnerOptions.value, editor.developOwner);
  if (!option) return;
  editor.developOwner = option.label;
  editor.developOwnerDepartment = option.deptName;
}

function onOwnerInput(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const keyword = target?.value.trim() ?? '';
  editor.owner = target?.value ?? '';
  editor.department = '';
  if (ownerSearchTimer !== null) window.clearTimeout(ownerSearchTimer);
  const sequence = ++ownerSearchSequence;
  if (!keyword) {
    ownerOptions.value = [];
    return;
  }
  ownerSearchTimer = window.setTimeout(async () => {
    try {
      const options = await querySkillPlanningUsers(keyword);
      if (sequence !== ownerSearchSequence) return;
      ownerOptions.value = options;
      resolveOwnerSelection();
    } catch {
      if (sequence === ownerSearchSequence) ownerOptions.value = [];
    } finally {
      if (sequence === ownerSearchSequence) ownerSearchTimer = null;
    }
  }, 250);
}

function onDevelopOwnerInput(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const keyword = target?.value.trim() ?? '';
  editor.developOwner = target?.value ?? '';
  editor.developOwnerDepartment = '';
  if (developOwnerSearchTimer !== null) window.clearTimeout(developOwnerSearchTimer);
  const sequence = ++developOwnerSearchSequence;
  if (!keyword) {
    developOwnerOptions.value = [];
    return;
  }
  developOwnerSearchTimer = window.setTimeout(async () => {
    try {
      const options = await querySkillPlanningUsers(keyword);
      if (sequence !== developOwnerSearchSequence) return;
      developOwnerOptions.value = options;
      resolveDevelopOwnerSelection();
    } catch {
      if (sequence === developOwnerSearchSequence) developOwnerOptions.value = [];
    } finally {
      if (sequence === developOwnerSearchSequence) developOwnerSearchTimer = null;
    }
  }, 250);
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
    owner: personDisplayLabel(record.owner),
    department: record.department,
    developOwner: personDisplayLabel(record.developOwner),
    developOwnerDepartment: record.developOwnerDepartment || '',
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
  resolveOwnerSelection();
  resolveDevelopOwnerSelection();
  if (!editor.department.trim()) {
    editor.error =
      '\u8bf7\u9009\u62e9\u6709\u6548\u7684\u8d23\u4efb Owner\uff0c\u4ee5\u81ea\u52a8\u5e26\u51fa\u5176\u6240\u5728\u90e8\u95e8';
    return;
  }
  const payload: SkillMasterPayload = {
    name: editor.name,
    description: editor.description,
    level: editor.level,
    product: editor.product,
    owner: editor.owner,
    department: editor.department,
    developOwner: editor.developOwner,
    developOwnerDepartment: editor.developOwnerDepartment,
    plannedCompleteDate: editor.plannedCompleteDate,
    status: editor.status,
  };
  try {
    editor.mode === 'create'
      ? createSkillMasterRecord(payload)
      : updateSkillMasterRecord(editor.id, payload);
    closeEditor();
    reload();
    showToast(
      editor.mode === 'create' ? 'Skill 已添加，可前往 Skill 规划复用' : 'Skill 主体信息已更新',
    );
  } catch (error) {
    editor.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
  }
}
function openAssociation(record: SkillMasterRecord): void {
  const association = getSkillMasterAssociation(record.id);
  Object.assign(associationEditor, {
    open: true,
    skillId: record.id,
    skillName: record.name,
    sceneIds: [...association.sceneIds],
    activityIds: [...association.activityIds],
    planningDepartments: [...association.planningDepartments],
  });
  departmentPath.value = [];
  sceneOptions.value = makeTaxonomyOptions(listScenes());
  activityOptions.value = makeTaxonomyOptions(listActivities());
}
function closeAssociation(): void {
  associationEditor.open = false;
  departmentPath.value = [];
}
function addPlanningDepartment(path: string[]): void {
  const name = path[path.length - 1]?.trim();
  if (name && !associationEditor.planningDepartments.includes(name)) {
    associationEditor.planningDepartments.push(name);
  }
  departmentPath.value = [];
}
function removePlanningDepartment(name: string): void {
  associationEditor.planningDepartments = associationEditor.planningDepartments.filter(
    (item) => item !== name,
  );
}
function saveAssociation(): void {
  const saved = saveSkillMasterAssociation({
    skillId: associationEditor.skillId,
    sceneIds: associationEditor.sceneIds,
    activityIds: associationEditor.activityIds,
    planningDepartments: associationEditor.planningDepartments,
  });
  associations.value = { ...associations.value, [saved.skillId]: saved };
  closeAssociation();
  showToast('Skill 关联范围已更新');
}
function requestDelete(record: SkillMasterRecord): void {
  Object.assign(deleteDialog, { open: true, id: record.id, name: record.name });
}
function confirmDelete(): void {
  deleteSkillMasterRecord(deleteDialog.id);
  removeSkillMasterAssociation(deleteDialog.id);
  deleteDialog.open = false;
  reload();
  showToast('Skill 已删除');
}

onMounted(reload);
onBeforeUnmount(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  if (ownerSearchTimer !== null) window.clearTimeout(ownerSearchTimer);
  if (developOwnerSearchTimer !== null) window.clearTimeout(developOwnerSearchTimer);
});
</script>

<template>
  <section class="master-panel" aria-label="Skill 管理">
    <div class="master-board">
      <header class="master-toolbar">
        <div>
          <strong>Skill 原子清单</strong
          ><small>共 {{ filteredRecords.length }} 条 · 可被不同部门的规划复用</small>
        </div>
        <div class="toolbar-actions">
          <input v-model.trim="keyword" type="search" placeholder="搜索 Skill 或 Owner" />
          <select v-model="statusFilter">
            <option value="all">全部进展</option>
            <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
          </select>
          <button class="primary" type="button" @click="openCreate">＋ 添加 Skill</button>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <colgroup>
            <col class="skill-column" />
            <col class="description-column" />
            <col class="owner-column" />
            <col class="develop-owner-column" />
            <col class="date-column" />
            <col class="status-column" />
            <col class="action-column" />
          </colgroup>
          <thead>
            <tr>
              <th>Skill</th>
              <th>描述</th>
              <!-- <th>层级</th> -->
              <!-- <th>产品 / 服务</th> -->
              <th>责任 Owner</th>
              <!-- <th title="随责任 Owner 自动变化">Owner 所在部门</th> -->
              <!-- <th>关联范围</th> -->
              <th>开发责任人</th>
              <th>计划完成</th>
              <th>当前进展</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in filteredRecords" :key="record.id">
              <td>
                <div class="name-cell">
                  <i>{{ record.name.slice(0, 1) }}</i
                  ><span
                    ><strong>{{ record.name }}</strong></span
                  >
                </div>
              </td>
              <td>{{ record.description || '无' }}</td>
              <!-- <td>
                <span class="badge level">{{ record.level }}</span>
              </td> -->
              <!-- <td>{{ record.product || '待明确' }}</td> -->
              <td class="person-column">{{ personDisplayLabel(record.owner) }}</td>
              <!-- <td>{{ record.department || '随 Owner 自动带出' }}</td> -->
              <!-- <td>
                <div class="association-summary">
                  <span>场景 {{ associationFor(record.id).sceneIds.length }}</span
                  ><span>活动 {{ associationFor(record.id).activityIds.length }}</span
                  ><span>规划部门 {{ associationFor(record.id).planningDepartments.length }}</span>
                </div>
              </td> -->
              <td class="person-column">{{ personDisplayLabel(record.developOwner) }}</td>
              <td>{{ record.plannedCompleteDate || '无' }}</td>
              <td>
                <span class="badge status" :class="'is-' + record.status">{{ record.status }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <!-- <button class="associate" type="button" @click="openAssociation(record)">
                    关联</button> -->
                  <button type="button" @click="openEdit(record)">编辑</button
                  ><button class="danger" type="button" @click="requestDelete(record)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredRecords.length === 0">
              <td colspan="7" class="empty">暂无符合条件的 Skill</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="editor.open" class="overlay" @click.self="closeEditor">
        <form class="dialog" @submit.prevent="submitEditor">
          <header>
            <div>
              <small>SKILL MASTER</small
              ><strong>{{ editor.mode === 'create' ? '添加 Skill' : '编辑 Skill' }}</strong>
              <p>
                这里只维护可复用的原子 Skill；场景、活动、层级和部门/产品请在 Skill 规划中配置。
              </p>
            </div>
            <button type="button" @click="closeEditor">×</button>
          </header>
          <div class="note">
            <b>部门语义</b><span>Owner 所在部门是人员属性，不作为 Skill 的规划归属。</span>
          </div>
          <div class="form-grid">
            <label class="wide"
              ><span>Skill 名称 *</span><input v-model.trim="editor.name" maxlength="60"
            /></label>
            <label class="wide"
              ><span>Skill 说明 *</span
              ><textarea v-model.trim="editor.description" maxlength="300" rows="4"></textarea>
            </label>
            <label class="owner-picker">
              <span>&#36131;&#20219; Owner *</span>
              <input
                v-model.trim="editor.owner"
                list="skill-master-owner-options"
                autocomplete="off"
                placeholder="&#36755;&#20837;&#22995;&#21517;&#25110;&#24037;&#21495;&#21518;&#36873;&#25321;"
                @input="onOwnerInput"
                @change="resolveOwnerSelection"
              />
              <datalist id="skill-master-owner-options">
                <option
                  v-for="item in ownerOptions"
                  :key="item.id || item.label"
                  :value="item.label"
                >
                  {{ item.deptName }}
                </option>
              </datalist>
            </label>
            <!-- <label
              ><span>Owner 所在部门</span
              ><input v-model.trim="editor.department" placeholder="由 Owner 资料自动带出" readonly
            /></label> -->
            <label class="develop-owner-picker">
              <span>开发责任人</span>
              <input
                v-model.trim="editor.developOwner"
                list="skill-master-develop-owner-options"
                autocomplete="off"
                placeholder="输入姓名或工号后选择"
                @input="onDevelopOwnerInput"
                @change="resolveDevelopOwnerSelection"
              />
              <datalist id="skill-master-develop-owner-options">
                <option
                  v-for="item in developOwnerOptions"
                  :key="item.id || item.label"
                  :value="item.label"
                >
                  {{ item.deptName }}
                </option>
              </datalist>
            </label>
            <label
              ><span>计划完成时间</span><input v-model="editor.plannedCompleteDate" type="date"
            /></label>
            <label
              ><span>当前进展</span
              ><select v-model="editor.status">
                <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
              </select></label
            >
          </div>
          <p v-if="editor.error" class="error">{{ editor.error }}</p>
          <footer>
            <button type="button" @click="closeEditor">取消</button
            ><button class="primary" type="submit">保存</button>
          </footer>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="associationEditor.open" class="overlay" @click.self="closeAssociation">
        <div class="dialog association-dialog">
          <header>
            <div>
              <small>SKILL RELATIONS</small
              ><strong>关联范围 · {{ associationEditor.skillName }}</strong>
              <p>可同时关联多个场景、活动和规划部门。</p>
            </div>
            <button type="button" @click="closeAssociation">×</button>
          </header>
          <div class="association-grid">
            <section>
              <header>
                <strong>场景</strong><span>已选 {{ associationEditor.sceneIds.length }}</span>
              </header>
              <div class="option-list">
                <label v-for="item in sceneOptions" :key="item.id"
                  ><input
                    v-model="associationEditor.sceneIds"
                    type="checkbox"
                    :value="item.id"
                  /><span>{{ item.label }}</span></label
                >
              </div>
            </section>
            <section>
              <header>
                <strong>活动</strong><span>已选 {{ associationEditor.activityIds.length }}</span>
              </header>
              <div class="option-list">
                <label v-for="item in activityOptions" :key="item.id"
                  ><input
                    v-model="associationEditor.activityIds"
                    type="checkbox"
                    :value="item.id"
                  /><span>{{ item.label }}</span></label
                >
              </div>
            </section>
            <section class="department-section">
              <header>
                <strong>规划部门</strong
                ><span>已选 {{ associationEditor.planningDepartments.length }}</span>
              </header>
              <MarketDeptCascader
                v-model="departmentPath"
                :tree="props.departmentTree"
                selection-mode="confirm"
                all-label="选择要关联的规划部门"
                done-text="添加部门"
                @done="addPlanningDepartment"
              />
              <div class="department-tags">
                <span v-for="item in associationEditor.planningDepartments" :key="item"
                  >{{ item
                  }}<button
                    type="button"
                    :aria-label="'移除' + item"
                    @click="removePlanningDepartment(item)"
                  >
                    ×
                  </button></span
                ><small v-if="associationEditor.planningDepartments.length === 0"
                  >暂未关联规划部门</small
                >
              </div>
            </section>
          </div>
          <footer>
            <button type="button" @click="closeAssociation">取消</button
            ><button class="primary" type="button" @click="saveAssociation">保存关联</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="deleteDialog.open" class="overlay" @click.self="deleteDialog.open = false">
        <div class="dialog delete-dialog">
          <strong>删除“{{ deleteDialog.name }}”？</strong>
          <p>删除后将不能用于新规划，已有规划仍保留历史快照。</p>
          <footer>
            <button type="button" @click="deleteDialog.open = false">取消</button
            ><button class="danger-btn" type="button" @click="confirmDelete">确认删除</button>
          </footer>
        </div>
      </div>
    </Teleport>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
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
.master-hero > div:first-child > span,
.dialog > header small {
  color: #3766d7;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}
.master-hero h3 {
  margin: 5px 0 6px;
  font-size: 22px;
}
.master-hero p,
.dialog > header p {
  margin: 0;
  color: #66748b;
  font-size: 12px;
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
}
.master-metrics span {
  color: #7c879a;
  font-size: 10px;
  font-weight: 700;
}
.relation-map {
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) 165px minmax(500px, 1.6fr);
  align-items: stretch;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e0e7f2;
  border-radius: 12px;
  background: #fff;
}
.relation-map > div,
.relation-map section > div {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border: 1px solid #e2e7ef;
  border-radius: 9px;
  background: #fafbfc;
}
.relation-map > div {
  border-color: #bfcff5;
  background: #f2f6ff;
}
.relation-map > b {
  display: grid;
  place-items: center;
  color: #78859a;
  font-size: 10px;
}
.relation-map section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.relation-map small {
  color: #76849a;
  font-size: 9px;
  font-weight: 800;
}
.relation-map span {
  color: #7c889b;
  font-size: 10px;
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
.master-toolbar small {
  color: #8b96a7;
}
.toolbar-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toolbar-actions input,
.toolbar-actions select {
  height: 36px;
  padding: 0 11px;
  border: 1px solid #d9e1ed;
  border-radius: 8px;
  background: #fff;
}
.toolbar-actions input {
  width: 250px;
}
.primary {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #3569e8 !important;
  border-radius: 8px;
  background: #3569e8 !important;
  color: #fff !important;
  font-weight: 800;
  cursor: pointer;
}
.table-wrap {
  width: 100%;
  overflow-x: hidden;
}
.table-wrap table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}
.table-wrap col.skill-column {
  width: 19%;
}
.table-wrap col.description-column {
  width: 20%;
}
.table-wrap col.owner-column,
.table-wrap col.develop-owner-column {
  width: 14%;
}
.table-wrap col.date-column {
  width: 12%;
}
.table-wrap col.status-column {
  width: 11%;
}
.table-wrap col.action-column {
  width: 10%;
}
.table-wrap th {
  height: 42px;
  padding: 0 10px;
  background: #f8f9fc;
  color: #7f8b9e;
  font-size: 11px;
  text-align: center;
}
.table-wrap td {
  height: 76px;
  padding: 8px 10px;
  border-top: 1px solid #eff2f7;
  color: #435169;
  font-size: 11px;
  text-align: center;
  vertical-align: middle;
}
.table-wrap td.person-column {
  overflow: hidden;
  font-weight: 650;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.name-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 0;
}
.name-cell i {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #edf3ff;
  color: #3b68d4;
  font-style: normal;
  font-weight: 900;
}
.name-cell span {
  display: grid;
  min-width: 0;
}
.name-cell strong,
.name-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell small {
  color: #8a95a5;
}
.badge {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 800;
}
.level {
  background: #eef3ff;
  color: #4c69af;
}
.status {
  background: #f1f3f7;
  color: #66758c;
}
.status.is-开发中,
.status.is-联调中 {
  background: #fff3df;
  color: #aa6415;
}
.status.is-已完成 {
  background: #eaf8f1;
  color: #27815d;
}
.association-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.association-summary span,
.department-tags > span {
  padding: 4px 7px;
  border-radius: 99px;
  background: #eef3ff;
  color: #4b67aa;
  font-size: 9px;
  font-weight: 800;
}
.row-actions {
  justify-content: center;
  white-space: nowrap;
}
.row-actions button {
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #526b9d;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.row-actions .associate {
  background: #eef3ff;
  color: #3569e8;
}
.danger {
  color: #d94a54 !important;
}
.empty {
  height: 140px !important;
  text-align: center;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 970;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}
.dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}
.dialog > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.dialog > header > div {
  display: grid;
  gap: 4px;
}
.dialog > header strong {
  font-size: 20px;
}
.dialog > header > button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f2f4f8;
  font-size: 20px;
  cursor: pointer;
}
.note {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #dce7fb;
  border-radius: 8px;
  background: #f5f8ff;
  color: #58709e;
  font-size: 11px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 13px;
}
.form-grid label {
  display: grid;
  gap: 7px;
}
.form-grid .wide {
  grid-column: 1/-1;
}
.form-grid label > span {
  font-size: 11px;
  font-weight: 800;
}
.form-grid input,
.form-grid select,
.form-grid textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0 11px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
}
.form-grid input,
.form-grid select {
  height: 40px;
}
.form-grid textarea {
  padding-top: 10px;
}
.error {
  padding: 9px 11px;
  background: #fff1f2;
  color: #d94851;
}
.dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}
.dialog > footer button {
  height: 36px;
  padding: 0 16px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.association-dialog {
  width: min(980px, calc(100vw - 32px));
}
.association-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.association-grid > section {
  min-width: 0;
  padding: 14px;
  border: 1px solid #e1e7f1;
  border-radius: 10px;
  background: #fafcff;
}
.association-grid > section > header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.association-grid > section > header span {
  color: #7f8b9e;
  font-size: 10px;
}
.option-list {
  display: grid;
  max-height: 250px;
  overflow: auto;
  gap: 6px;
}
.option-list label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border-radius: 7px;
  background: #fff;
  color: #526079;
  font-size: 11px;
}
.department-section {
  grid-column: 1/-1;
}
.department-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.department-tags > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.department-tags button {
  border: 0;
  background: transparent;
  color: #5870aa;
  cursor: pointer;
}
.department-tags small {
  color: #8b96a7;
}
.delete-dialog {
  width: min(420px, calc(100vw - 32px));
  text-align: center;
}
.danger-btn {
  border-color: #dc4651 !important;
  background: #dc4651 !important;
  color: #fff;
}
.toast {
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
  .toolbar-actions {
    flex-wrap: wrap;
  }
  .relation-map {
    grid-template-columns: 1fr;
  }
  .association-grid {
    grid-template-columns: 1fr;
  }
  .department-section {
    grid-column: auto;
  }
}
@media (max-width: 680px) {
  .relation-map section,
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-grid .wide {
    grid-column: auto;
  }
  .toolbar-actions > * {
    flex: 1 1 150px;
  }
  .toolbar-actions input {
    width: 100%;
  }
}
.owner-picker + label {
  display: none;
}
</style>

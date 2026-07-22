<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  grantDepartmentPlanningPermission,
  listDepartmentPlanningPermissions,
  revokeDepartmentPlanningPermission,
  type DepartmentPlanningPermissionMember,
  type DepartmentPlanningPermissionRecord,
} from '../../services/skillMarket/departmentPlanningPermissionService';
import { notifyHarnessConfigurationChanged } from '../../services/skillMarket/harnessConfigurationSyncService';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import {
  querySkillPlanningUsers,
  type SkillPlanningUserOption,
} from '../../services/skillMarket/skillPlanningService';
import MarketDeptCascader from './MarketDeptCascader.vue';

type DepartmentNode = {
  id?: string;
  deptCode?: string;
  levelNo?: number;
  name: string;
  children?: DepartmentNode[];
};

type DepartmentOption = {
  name: string;
  deptCode: string;
  level: number;
  path: string[];
};

type DepartmentPermissionRecord = DepartmentPlanningPermissionRecord & {
  deptCode: string;
  ownerUserId: string;
};

const props = withDefaults(
  defineProps<{
    departmentTree?: DepartmentNode[];
    userId?: string;
    departmentPermissionPath?: string[];
    allowedDepartmentNames?: string[];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    departmentPermissionPath: () => [],
    allowedDepartmentNames: () => [],
    restrictToAllowedDepartments: false,
  },
);

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const records = ref<DepartmentPermissionRecord[]>([]);
const selectedDepartmentPath = ref<string[]>([]);
const toast = ref('');
let toastTimer: number | null = null;
let personSearchTimer: number | null = null;
let personSearchSeq = 0;
const userProfileCache = new Map<string, SkillPlanningUserOption>();

const personSearch = reactive({
  value: '',
  open: false,
  loading: false,
  options: [] as SkillPlanningUserOption[],
  message: '请输入人员信息',
});

const revokeDialog = reactive({
  open: false,
  departmentName: '',
  member: null as DepartmentPlanningPermissionMember | null,
});

function normalizeDepartmentPath(path: string[]): string[] {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

function sameDepartmentPath(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeDepartmentPath(left);
  const normalizedRight = normalizeDepartmentPath(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((segment, index) => segment === normalizedRight[index])
  );
}

function flattenDept5Departments(nodes: DepartmentNode[]): DepartmentOption[] {
  const options: DepartmentOption[] = [];
  const visit = (items: DepartmentNode[], parentPath: string[], depth: number): void => {
    items.forEach((node) => {
      const name = node.name.trim();
      if (!name) return;
      const path = [...parentPath, name];
      const explicitLevel = Number(node.levelNo);
      const level = Number.isFinite(explicitLevel) && explicitLevel > 0 ? explicitLevel : depth;
      if (level === 5) {
        options.push({
          name,
          deptCode: readText(node.deptCode ?? node.id) || name,
          level,
          path,
        });
        return;
      }
      if (level < 5 && node.children?.length) {
        visit(node.children, path, depth + 1);
      }
    });
  };
  visit(nodes, [], 1);
  return options;
}

const normalizedOwnerDepartmentPath = computed(() =>
  normalizeDepartmentPath(props.departmentPermissionPath),
);
const dept5DepartmentOptions = computed(() => flattenDept5Departments(props.departmentTree));
const ownerDepartmentOption = computed(
  () =>
    dept5DepartmentOptions.value.find((option) =>
      sameDepartmentPath(option.path, normalizedOwnerDepartmentPath.value),
    ) ?? null,
);
const configurableDepartmentPaths = computed(() =>
  ownerDepartmentOption.value ? [[...ownerDepartmentOption.value.path]] : [],
);
const allDepartmentNames = computed(() =>
  ownerDepartmentOption.value ? [ownerDepartmentOption.value.name] : [],
);
const selectedDepartment = computed(() => selectedDepartmentPath.value.at(-1) ?? '');
const selectedDepartmentPathLabel = computed(() => selectedDepartmentPath.value.join(' / '));
const canEditSelectedDepartment = computed(
  () =>
    Boolean(ownerDepartmentOption.value) &&
    sameDepartmentPath(selectedDepartmentPath.value, ownerDepartmentOption.value?.path ?? []),
);

const selectedRecord = computed<DepartmentPermissionRecord>(() =>
  recordForDepartment(selectedDepartment.value),
);

const selectedAdministrators = computed(() =>
  selectedRecord.value.members.filter(
    (member) =>
      !selectedRecord.value.ownerUserId ||
      normalizeUserId(member.userId) !== normalizeUserId(selectedRecord.value.ownerUserId),
  ),
);
const authorizedTotal = computed(() => selectedAdministrators.value.length);

function recordForDepartment(departmentName: string): DepartmentPermissionRecord {
  const ownerOption =
    ownerDepartmentOption.value?.name === departmentName ? ownerDepartmentOption.value : null;
  return (
    records.value.find((record) => record.departmentName === departmentName) ?? {
      departmentName,
      deptCode:
        ownerOption?.deptCode ||
        findDepartmentCode(props.departmentTree, departmentName) ||
        departmentName,
      ownerUserId: '',
      members: [],
      updatedAt: '',
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function normalizeUserId(value: unknown): string {
  return readText(value).toLowerCase();
}

function readUserIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item);
        return readText(record.userId ?? record.employeeNo ?? record.id ?? item);
      })
      .filter(Boolean);
  }
  return readText(value)
    .split(/[,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function responseRows(response: unknown): unknown[] {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  if (meta.success === false) {
    throw new Error(readText(responseRecord.message) || '部门列表加载失败');
  }
  const data = responseRecord.data ?? response;
  const dataRecord = asRecord(data);
  return Array.isArray(data)
    ? data
    : (['list', 'records', 'items', 'rows']
        .map((key) => dataRecord[key])
        .find((value): value is unknown[] => Array.isArray(value)) ?? []);
}

function findDepartmentCode(nodes: DepartmentNode[], departmentName: string): string {
  for (const node of nodes) {
    if (node.name.trim() === departmentName.trim()) {
      return readText(node.deptCode ?? node.id);
    }
    const childCode = findDepartmentCode(node.children ?? [], departmentName);
    if (childCode) return childCode;
  }
  return '';
}

function normalizeDepartmentRecords(response: unknown): DepartmentPermissionRecord[] {
  return responseRows(response).flatMap((item) => {
    const record = asRecord(item);
    const departmentName = readText(record.deptName ?? record.departmentName ?? record.name);
    if (!departmentName) return [];
    const deptCode =
      readText(record.deptCode ?? record.departmentCode ?? record.id) ||
      findDepartmentCode(props.departmentTree, departmentName) ||
      departmentName;
    const ownerUserId = readText(record.owner ?? record.ownerUserId);
    const adminUserIds = readUserIds(record.adminUserIds ?? record.admin_user_ids ?? record.admins);
    const memberIds = [...new Set([ownerUserId, ...adminUserIds].filter(Boolean))];
    const updatedAt = readText(record.updatedAt ?? record.updateTime ?? record.createdAt);
    return [
      {
        departmentName,
        deptCode,
        ownerUserId,
        updatedAt,
        members: memberIds.map((userId) => ({
          userId,
          userName: '',
          label: userId === ownerUserId ? userId + '（Owner）' : userId,
          departmentName: '',
          grantedAt: updatedAt,
        })),
      },
    ];
  });
}

function cacheUserOptions(options: SkillPlanningUserOption[]): void {
  options.forEach((option) => {
    const key = normalizeUserId(option.id);
    if (key) userProfileCache.set(key, option);
  });
}

async function resolveUserProfile(userId: string): Promise<SkillPlanningUserOption | undefined> {
  const key = normalizeUserId(userId);
  const cached = userProfileCache.get(key);
  if (cached) return cached;

  try {
    const options = await querySkillPlanningUsers(userId);
    cacheUserOptions(options);
    return options.find((option) => normalizeUserId(option.id) === key);
  } catch {
    return undefined;
  }
}

async function enrichMemberProfiles(
  departmentRecords: DepartmentPermissionRecord[],
): Promise<DepartmentPermissionRecord[]> {
  const userIds = [
    ...new Set(
      departmentRecords.flatMap((record) => record.members.map((member) => member.userId)),
    ),
  ];
  const profiles = new Map<string, SkillPlanningUserOption>();

  await Promise.all(
    userIds.map(async (userId) => {
      const profile = await resolveUserProfile(userId);
      if (profile) profiles.set(normalizeUserId(userId), profile);
    }),
  );

  return departmentRecords.map((record) => ({
    ...record,
    members: record.members.map((member) => {
      const profile = profiles.get(normalizeUserId(member.userId));
      if (!profile) return member;
      const ownerSuffix = member.userId === record.ownerUserId ? '（Owner）' : '';
      return {
        ...member,
        userName: profile.chName,
        label: `${profile.label}${ownerSuffix}`,
        departmentName: optionDepartment(profile),
      };
    }),
  }));
}

async function reload(): Promise<void> {
  const ownerOption = ownerDepartmentOption.value;
  if (!ownerOption) {
    records.value = [];
    selectedDepartmentPath.value = [];
    return;
  }

  if (transportIsHttp) {
    const userId = props.userId.trim();
    if (!userId) {
      records.value = [];
      return;
    }
    const response = await skillBaseService.querySkillPlanningDepartments({ userId });
    const departmentRecords = normalizeDepartmentRecords(response).filter(
      (record) =>
        record.deptCode === ownerOption.deptCode || record.departmentName === ownerOption.name,
    );
    records.value = await enrichMemberProfiles(departmentRecords);
  } else {
    records.value = listDepartmentPlanningPermissions()
      .filter((record) => record.departmentName === ownerOption.name)
      .map((record) => ({
        ...record,
        deptCode: ownerOption.deptCode,
        ownerUserId: '',
      }));
  }
  selectedDepartmentPath.value = [...ownerOption.path];
}

async function updateRemoteAdmins(
  record: DepartmentPermissionRecord,
  adminUserIds: string[],
): Promise<void> {
  const ownerOption = ownerDepartmentOption.value;
  if (
    !ownerOption ||
    !canEditSelectedDepartment.value ||
    (record.deptCode !== ownerOption.deptCode && record.departmentName !== ownerOption.name)
  ) {
    throw new Error('仅部门 Owner 可以配置自己所属的 dept5 部门管理员');
  }

  const response = await skillBaseService.updateSkillPlanningDepartmentAdmins(record.deptCode, {
    userId: props.userId.trim(),
    adminUserIds: [
      ...new Set(adminUserIds.filter((userId) => Boolean(userId) && userId !== record.ownerUserId)),
    ].join(','),
  });
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  if (meta.success === false) {
    throw new Error(readText(responseRecord.message) || '管理员更新失败');
  }
  notifyHarnessConfigurationChanged('permission', record.departmentName);
  await reload();
}

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2400);
}

function reloadSafely(): void {
  void reload().catch((error) => {
    records.value = [];
    showToast(error instanceof Error ? error.message : '部门列表加载失败');
  });
}

function guardDepartmentSelection(path: string[]): boolean {
  const ownerOption = ownerDepartmentOption.value;
  if (!ownerOption || !sameDepartmentPath(path, ownerOption.path)) {
    showToast('仅可选择您负责的 dept5 部门');
    return false;
  }
  return true;
}

function selectDepartment(path: string[]): void {
  if (!guardDepartmentSelection(path)) {
    return;
  }
  selectedDepartmentPath.value = [...path];
  closePersonSearch();
}

function clearPersonSearchTimer(): void {
  if (personSearchTimer !== null) {
    window.clearTimeout(personSearchTimer);
    personSearchTimer = null;
  }
}

function closePersonSearch(): void {
  personSearch.open = false;
  clearPersonSearchTimer();
}

async function searchUsers(keyword = personSearch.value): Promise<void> {
  const text = keyword.trim();
  personSearch.open = true;
  personSearch.message = '';
  if (!text) {
    personSearch.loading = false;
    personSearch.options = [];
    personSearch.message = '请输入人员信息';
    return;
  }

  const requestSeq = ++personSearchSeq;
  personSearch.loading = true;
  try {
    const options = await querySkillPlanningUsers(text);
    if (requestSeq !== personSearchSeq) return;
    cacheUserOptions(options);
    const grantedIds = new Set(selectedRecord.value.members.map((member) => member.userId));
    personSearch.options = options.filter((option) => !grantedIds.has(option.id));
    personSearch.message = personSearch.options.length > 0 ? '' : '暂无可添加的匹配人员';
  } catch (error) {
    if (requestSeq !== personSearchSeq) return;
    personSearch.options = [];
    personSearch.message = error instanceof Error ? error.message : '人员查询失败，请稍后重试';
  } finally {
    if (requestSeq === personSearchSeq) personSearch.loading = false;
  }
}

function onPersonInput(event: Event): void {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  personSearch.value = target?.value ?? '';
  personSearch.open = true;
  clearPersonSearchTimer();
  personSearchTimer = window.setTimeout(() => {
    void searchUsers();
  }, 250);
}

function openPersonSearch(): void {
  personSearch.open = true;
  if (personSearch.value.trim()) void searchUsers();
  else personSearch.message = '请输入人员信息';
}

function optionDepartment(option: SkillPlanningUserOption): string {
  const legacyDepartment = (option as SkillPlanningUserOption & { department?: string }).department;
  const hwDepartment = Object.entries(option.raw)
    .flatMap(([key, value]) => {
      const match = /^hwDepartName(\d+)$/i.exec(key);
      const name = readText(value);
      return match && name ? [{ level: Number(match[1]), name }] : [];
    })
    .sort((left, right) => right.level - left.level)[0]?.name;
  return hwDepartment || option.deptName || legacyDepartment || '';
}

async function addPermission(option: SkillPlanningUserOption): Promise<void> {
  try {
    if (!canEditSelectedDepartment.value) {
      throw new Error('当前用户无权配置该部门管理员');
    }
    cacheUserOptions([option]);
    if (transportIsHttp) {
      const record = selectedRecord.value;
      await updateRemoteAdmins(record, [
        ...record.members.map((member) => member.userId),
        option.raw.sAMAccountName,
      ]);
    } else {
      grantDepartmentPlanningPermission(selectedDepartment.value, {
        userId: option.id,
        userName: option.chName,
        label: option.label,
        departmentName: optionDepartment(option),
      });
      await reload();
    }
    personSearch.value = '';
    personSearch.options = [];
    closePersonSearch();
    showToast('已授予 ' + option.label + ' Harness 规划与配置权限');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '权限添加失败');
  }
}

function requestRevoke(member: DepartmentPlanningPermissionMember): void {
  if (!canEditSelectedDepartment.value) {
    showToast('当前用户无权修改该部门管理员');
    return;
  }
  Object.assign(revokeDialog, {
    open: true,
    departmentName: selectedDepartment.value,
    member,
  });
}

async function confirmRevoke(): Promise<void> {
  const member = revokeDialog.member;
  if (!member) return;
  try {
    if (!canEditSelectedDepartment.value) {
      throw new Error('当前用户无权修改该部门管理员');
    }
    const record = recordForDepartment(revokeDialog.departmentName);
    if (transportIsHttp) {
      if (member.userId === record.ownerUserId) {
        throw new Error('部门 Owner 不可从管理员列表中移除');
      }
      await updateRemoteAdmins(
        record,
        record.members.map((item) => item.userId).filter((userId) => userId !== member.userId),
      );
    } else {
      revokeDepartmentPlanningPermission(revokeDialog.departmentName, member.userId);
      await reload();
    }
    revokeDialog.open = false;
    showToast('人员配置权限已移除');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '权限移除失败');
  }
}

function formatGrantedAt(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN');
}

watch(
  () => [
    props.userId,
    props.departmentTree,
    props.departmentPermissionPath,
    props.allowedDepartmentNames,
    props.restrictToAllowedDepartments,
  ],
  reloadSafely,
  { deep: true },
);

onMounted(reloadSafely);
onBeforeUnmount(() => {
  clearPersonSearchTimer();
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <section class="permission-panel" aria-label="部门权限配置">
    <div class="permission-hero">
      <div class="permission-department-field">
        <span>选择配置部门</span>
        <MarketDeptCascader
          v-model="selectedDepartmentPath"
          class="permission-dept-cascader"
          :tree="departmentTree"
          :max-level="5"
          :allowed-paths="configurableDepartmentPaths"
          permission-mode="review-center"
          :permission-path="normalizedOwnerDepartmentPath"
          :disabled="!ownerDepartmentOption"
          :all-label="ownerDepartmentOption ? '请选择 dept5 部门' : '暂无可配置部门'"
          empty-text="暂无可配置的 dept5 部门"
          clear-text="恢复本部门"
          clear-behavior="reset"
          :clear-value="ownerDepartmentOption?.path ?? []"
          selection-mode="confirm"
          searchable
          search-placeholder="搜索部门名称或路径"
          aria-label="部门权限配置部门级联选择"
          :before-clear="() => Boolean(ownerDepartmentOption)"
          :before-done="guardDepartmentSelection"
          @clear="selectDepartment"
          @done="selectDepartment"
        />
        <p v-if="ownerDepartmentOption">
          仅可配置您负责的 dept5 部门，dept5 以下组织不提供管理员配置入口。
        </p>
        <p v-else>当前账号未匹配到可配置的 dept5 Owner 部门。</p>
      </div>
      <div class="permission-metrics">
        <div>
          <strong>{{ allDepartmentNames.length }}</strong
          ><span>可管理部门</span>
        </div>
        <div>
          <strong>{{ authorizedTotal }}</strong
          ><span>授权关系</span>
        </div>
        <div>
          <strong>{{ selectedAdministrators.length }}</strong
          ><span>当前部门管理员</span>
        </div>
      </div>
    </div>

    <div class="permission-workspace">
      <div class="member-pane">
        <header class="member-pane__head">
          <div>
            <small>当前配置部门</small>
            <strong>{{ selectedDepartment || '暂无部门' }}</strong>
            <p v-if="selectedDepartmentPathLabel" class="selected-department-path">
              {{ selectedDepartmentPathLabel }}
            </p>
            <p>已授权 {{ selectedAdministrators.length }} 人管理此部门的 Harness 规划与配置。</p>
          </div>
          <div class="person-search" @keydown.esc="closePersonSearch">
            <input
              :value="personSearch.value"
              type="text"
              :disabled="!canEditSelectedDepartment"
              placeholder="输入姓名或工号添加人员"
              @focus="openPersonSearch"
              @input="onPersonInput"
              @keydown.enter.prevent="searchUsers()"
            />
            <div v-if="personSearch.open" class="person-search__panel" @mousedown.stop>
              <span v-if="personSearch.loading" class="person-search__empty">查询中...</span>
              <template v-else>
                <button
                  v-for="option in personSearch.options"
                  :key="option.id || option.label"
                  type="button"
                  @click="addPermission(option)"
                >
                  <span
                    ><strong>{{ option.chName || option.label }}</strong
                    ><small>{{ option.id }}</small></span
                  >
                  <em>{{ optionDepartment(option) || '部门信息待补充' }}</em>
                </button>
                <span v-if="personSearch.message" class="person-search__empty">
                  {{ personSearch.message }}
                </span>
              </template>
            </div>
          </div>
        </header>

        <div class="permission-note">
          <span>权限范围</span>
          <p>
            覆盖 Command、Skill、Agent、Extension
            的部门级规划能力，以及配置管理中的场景管理和活动管理。
          </p>
        </div>

        <div class="member-table-head">
          <strong>管理员列表</strong>
          <span>仅展示当前 dept5 部门已授权的 Harness 管理员</span>
        </div>
        <div class="member-table-wrap">
          <table class="member-table">
            <thead>
              <tr>
                <th>人员</th>
                <th>工号</th>
                <th>人员归属部门</th>
                <th>授权时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in selectedAdministrators" :key="member.userId">
                <td>
                  <div class="member-cell">
                    <span>{{ (member.userName || member.label).slice(0, 1) }}</span>
                    <strong>{{ member.userName || member.label }}</strong>
                  </div>
                </td>
                <td>{{ member.userId }}</td>
                <td>{{ member.departmentName || '—' }}</td>
                <td>{{ formatGrantedAt(member.grantedAt) }}</td>
                <td>
                  <button type="button" class="revoke-btn" @click="requestRevoke(member)">
                    移除
                  </button>
                </td>
              </tr>
              <tr v-if="selectedAdministrators.length === 0">
                <td colspan="5" class="member-empty">该部门暂未配置 Harness 管理人员</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="revokeDialog.open"
        class="permission-overlay"
        @click.self="revokeDialog.open = false"
      >
        <div class="permission-dialog">
          <i>!</i>
          <strong>移除 {{ revokeDialog.member?.label }} 的配置权限？</strong>
          <p>移除后，该人员将不能继续管理“{{ revokeDialog.departmentName }}”的规划与公共配置。</p>
          <footer>
            <button type="button" @click="revokeDialog.open = false">取消</button>
            <button type="button" class="is-danger" @click="confirmRevoke">确认移除</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="permission-toast" role="status">{{ toast }}</div>
  </section>
</template>

<style scoped lang="scss">
.permission-panel {
  display: grid;
  gap: 18px;
  color: #17233d;
}
.permission-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  border: 1px solid #e2def3;
  border-radius: 12px;
  background:
    radial-gradient(circle at 82% 15%, rgba(117, 86, 207, 0.14), transparent 30%),
    linear-gradient(110deg, #fff, #faf8ff);
  box-shadow: 0 12px 34px rgba(45, 58, 92, 0.07);
}
.permission-department-field {
  display: grid;
  gap: 8px;
  width: min(680px, 62%);
}
.permission-department-field > span {
  color: #7055bd;
  font-size: 11px;
  font-weight: 900;
}
.permission-department-field p {
  margin: 0;
  color: #66748b;
  font-size: 10px;
  line-height: 1.7;
}
:deep(.permission-dept-cascader .market-dept-cascader-trigger) {
  min-height: 46px;
  border-color: #d8d7eb;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 12px;
}
.permission-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(94px, 1fr));
  min-width: 340px;
  border: 1px solid #e1dcef;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
}
.permission-metrics div {
  display: grid;
  min-height: 76px;
  place-content: center;
  text-align: center;
}
.permission-metrics div + div {
  border-left: 1px solid #e9e4f2;
}
.permission-metrics strong {
  font-size: 22px;
  font-weight: 900;
}
.permission-metrics span {
  margin-top: 3px;
  color: #7c879a;
  font-size: 10px;
  font-weight: 700;
}
.permission-workspace {
  min-height: 430px;
  overflow: hidden;
  border: 1px solid #dfe6f1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(35, 52, 84, 0.06);
}
.member-pane {
  min-width: 0;
  padding: 20px;
}
.member-pane__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.member-pane__head > div:first-child {
  display: grid;
  gap: 3px;
}
.member-pane__head small {
  color: #8d98a9;
  font-size: 9px;
  font-weight: 800;
}
.member-pane__head strong {
  font-size: 20px;
}
.member-pane__head p {
  margin: 0;
  color: #818da0;
  font-size: 10px;
}
.selected-department-path {
  max-width: 720px;
  overflow: hidden;
  color: #65748d !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-search {
  position: relative;
  width: min(360px, 46%);
}
.person-search > input {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid #d8e0ec;
  border-radius: 8px;
  outline: 0;
  color: #344159;
}
.person-search > input:focus {
  border-color: #8064cb;
  box-shadow: 0 0 0 3px rgba(112, 85, 189, 0.1);
}
.person-search__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 100%;
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #dce3ee;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(39, 51, 80, 0.16);
}
.person-search__panel > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.person-search__panel > button:hover {
  background: #f5f2fd;
}
.person-search__panel > button > span {
  display: grid;
  gap: 2px;
}
.person-search__panel strong {
  color: #2c3950;
  font-size: 11px;
}
.person-search__panel small {
  color: #8c97a8;
  font-size: 9px;
}
.person-search__panel em {
  color: #78869a;
  font-size: 9px;
  font-style: normal;
}
.person-search__empty {
  display: block;
  padding: 16px 10px;
  color: #98a2b1;
  font-size: 10px;
  text-align: center;
}
.permission-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 12px;
  padding: 10px 12px;
  border: 1px solid #e3dff1;
  border-radius: 8px;
  background: #faf8ff;
}
.permission-note span {
  padding: 4px 7px;
  border-radius: 99px;
  background: #e9e2fb;
  color: #694eb7;
  font-size: 9px;
  font-weight: 900;
}
.permission-note p {
  margin: 0;
  color: #6f7b8f;
  font-size: 10px;
}
.member-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 14px 0 9px;
}
.member-table-head strong {
  color: #25324a;
  font-size: 13px;
}
.member-table-head span {
  color: #8a96a8;
  font-size: 10px;
}
.member-table-wrap {
  overflow: auto;
  border: 1px solid #e4e9f1;
  border-radius: 9px;
}
.member-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  table-layout: fixed;
}
.member-table th {
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid #e6ebf2;
  background: #f8f9fc;
  color: #808c9e;
  font-size: 10px;
  font-weight: 800;
  text-align: left;
}
.member-table td {
  height: 64px;
  padding: 7px 12px;
  border-bottom: 1px solid #edf1f6;
  color: #46546b;
  font-size: 11px;
}
.member-table th:last-child,
.member-table td:last-child {
  width: 70px;
  text-align: right;
}
.member-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}
.member-cell > span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #eee9fc;
  color: #694eb7;
  font-weight: 900;
}
.member-cell strong {
  font-size: 11px;
}
.revoke-btn {
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #d74b55;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.revoke-btn:hover {
  background: #fff0f1;
}
.member-empty {
  height: 150px !important;
  color: #929dad !important;
  text-align: center;
}
.permission-overlay {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}
.permission-dialog {
  width: min(430px, calc(100vw - 32px));
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
  text-align: center;
}
.permission-dialog > i {
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
.permission-dialog > strong {
  font-size: 16px;
}
.permission-dialog > p {
  color: #748095;
  font-size: 11px;
  line-height: 1.7;
}
.permission-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}
.permission-dialog footer button {
  height: 36px;
  padding: 0 15px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  background: #fff;
  color: #526079;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.permission-dialog footer .is-danger {
  border-color: #dc4651;
  background: #dc4651;
  color: #fff;
}
.permission-toast {
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
/* 部门权限页与场景、活动页保持一致的紧凑字号 */
.permission-panel {
  gap: 15px;
}

.permission-hero {
  padding: 20px 24px;
}

.permission-department-field > span {
  font-size: 9px;
}

.permission-department-field p {
  font-size: 11px;
  line-height: 1.55;
}

.permission-metrics {
  min-width: 310px;
}

.permission-metrics div {
  min-height: 66px;
}

.permission-metrics strong {
  font-size: 18px;
}

.permission-metrics span {
  font-size: 9px;
}

.member-pane {
  padding: 17px;
}

.member-pane__head strong {
  font-size: 16px;
}

.member-pane__head p,
.permission-note p {
  font-size: 9px;
}

.person-search > input {
  height: 35px;
  font-size: 10px;
}

.permission-note {
  margin: 14px 0 10px;
  padding: 8px 10px;
}

.member-table th {
  height: 36px;
  font-size: 9px;
}

.member-table td {
  height: 52px;
  padding: 6px 10px;
  font-size: 10px;
}

.member-cell > span {
  width: 26px;
  height: 26px;
}

.member-cell strong {
  font-size: 10px;
}

.revoke-btn {
  height: 25px;
  font-size: 9px;
}
@media (max-width: 980px) {
  .permission-hero,
  .member-pane__head {
    align-items: stretch;
    flex-direction: column;
  }
  .permission-metrics {
    min-width: 0;
  }
  .permission-department-field {
    width: 100%;
  }
  .person-search {
    width: 100%;
  }
}
@media (max-width: 620px) {
  .permission-hero {
    padding: 20px;
  }
  .permission-metrics {
    grid-template-columns: 1fr;
  }
  .permission-metrics div + div {
    border-top: 1px solid #e9e4f2;
    border-left: 0;
  }
  .member-pane {
    padding: 15px;
  }
}

/* Responsive permission typography for wide screens */
@media (min-width: 1440px) {
  .member-pane__head p,
  .permission-note p,
  .person-search > input,
  .person-search__panel strong,
  .person-search__panel small,
  .person-search__panel em,
  .member-table th,
  .member-table td,
  .member-cell strong,
  .revoke-btn {
    font-size: clamp(10px, 0.625vw, 13px);
  }

  .member-pane__head strong {
    font-size: clamp(16px, 1vw, 20px);
  }
}
</style>

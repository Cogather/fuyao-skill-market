<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import HarnessConfigurationPage from './skill/HarnessConfigurationPage.vue';
import HarnessTaskManagementPage from './skill/HarnessTaskManagementPage.vue';
import SkillPlanningPage from './skill/SkillPlanningPage.vue';
import type { CurrentUserRoleDto } from '../services/skillMarket/apiTypes';
import {
  coerceDepartmentTreeFromUnknown,
  mapDepartmentTreeDtoToForest,
} from '../services/skillMarket/marketDeptTreeFromApi';
import { listAuthorizedHarnessDepartmentNames } from '../services/skillMarket/departmentPlanningPermissionService';
import {
  extractExpertDepartmentPermission,
  type ExpertDepartmentPermission,
} from '../services/skillMarket/expertDepartmentPermission';
import { harnessConfigurationRevision } from '../services/skillMarket/harnessConfigurationSyncService';
import { getMockMarketDepartmentsTree } from '../services/skillMarket/mock/marketDepartmentsTreeDefault';
import {
  marketRoleCanConfigurePlanningPermissions,
  marketRoleIsOrgAdmin,
  marketRoleIsSuperAdmin,
} from '../services/skillMarket/roleUi';
import { skillBaseService } from '../services/skillMarket/skillBaseService';
import { querySkillPlanningUsers } from '../services/skillMarket/skillPlanningService';
import { useSkillMarketStore } from '../stores/skillMarketStore';
import { useProfileStore } from '../stores/userStore';

const skillMarketStore = useSkillMarketStore();
const profileStore = useProfileStore();
const currentUserRole = ref<CurrentUserRoleDto | null>(null);
const roleContextReady = ref(false);
const remotePermissionDepartmentNames = ref<string[]>([]);
const currentUserDepartmentPermission = ref<ExpertDepartmentPermission>({
  minimumDepartmentId: '',
  path: [],
});
const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';

type HarnessTab = 'command' | 'planning' | 'tasks' | 'agent' | 'extension' | 'settings';

const harnessTabs: Array<{ key: HarnessTab; label: string; description: string }> = [
  { key: 'command', label: 'Command 规划', description: '统一规划和管理 Command 能力。' },
  { key: 'planning', label: 'Skill 规划', description: '统一管理各部门规划建设中的 Skill。' },
  { key: 'agent', label: 'Agent 规划', description: '统一规划和管理 Agent 能力。' },
  { key: 'extension', label: 'Extension 发布', description: '集中管理 Extension 的发布流程。' },
  { key: 'settings', label: '配置管理', description: '维护 Harness 管理相关的公共配置。' },
  { key: 'tasks', label: '任务管理', description: '集中跟踪当前用户负责的 Skill 任务。' },
];

const activeHarnessTab = ref<HarnessTab>('planning');
const activeHarnessTabMeta = computed(
  () => harnessTabs.find((tab) => tab.key === activeHarnessTab.value) ?? harnessTabs[1],
);
const topbarElevated = ref(false);

const userId = computed(() => {
  const injectedUserId = String(skillMarketStore.userId ?? '').trim();
  if (injectedUserId) return injectedUserId;

  const roleUserId = String(currentUserRole.value?.employeeNo ?? '').trim();
  if (roleUserId) return roleUserId;

  return String(profileStore.userInfo?.w3Id ?? '').trim();
});

const departmentTree = computed(() => {
  const injectedDepartments = skillMarketStore.departmentList;
  const source =
    transportIsHttp && Array.isArray(injectedDepartments) && injectedDepartments.length > 0
      ? injectedDepartments
      : getMockMarketDepartmentsTree();
  return mapDepartmentTreeDtoToForest(coerceDepartmentTreeFromUnknown(source));
});

function departmentLevelByPath(path: string[]): number {
  let nodes = departmentTree.value;
  let level = 0;
  for (const segment of path.map((item) => item.trim()).filter(Boolean)) {
    const node = nodes.find((item) => item.name === segment);
    if (!node) return 0;
    level = node.levelNo;
    nodes = node.children;
  }
  return level;
}

const canConfigureDepartmentPermissions = computed(
  () =>
    marketRoleCanConfigurePlanningPermissions(currentUserRole.value) &&
    departmentLevelByPath(currentUserDepartmentPermission.value.path) === 5,
);

const permissionDepartmentNames = computed(() => {
  void harnessConfigurationRevision.value;
  const assignedDepartments = transportIsHttp
    ? remotePermissionDepartmentNames.value
    : listAuthorizedHarnessDepartmentNames(userId.value);
  const role = currentUserRole.value;
  if (!role) return assignedDepartments;
  if (marketRoleIsSuperAdmin(role) || marketRoleIsOrgAdmin(role)) return [];
  return [...new Set([...(role.managedDepartmentNames ?? []), ...assignedDepartments])];
});

const restrictToPermissionDepartments = computed(() => {
  const role = currentUserRole.value;
  return !role || (!marketRoleIsSuperAdmin(role) && !marketRoleIsOrgAdmin(role));
});

const canManageHarness = computed(
  () => !restrictToPermissionDepartments.value || permissionDepartmentNames.value.length > 0,
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function normalizeHarnessDepartmentNames(response: unknown): string[] {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  if (meta.success === false) {
    throw new Error(readText(responseRecord.message) || '部门列表加载失败');
  }

  const data = responseRecord.data ?? response;
  const dataRecord = asRecord(data);
  const rows = Array.isArray(data)
    ? data
    : (['list', 'records', 'items', 'rows']
        .map((key) => dataRecord[key])
        .find((value): value is unknown[] => Array.isArray(value)) ?? []);

  return [
    ...new Set(
      rows
        .map((item) => {
          const record = asRecord(item);
          return readText(record.deptName ?? record.departmentName ?? record.name);
        })
        .filter(Boolean),
    ),
  ];
}

async function loadHarnessDepartmentScope(): Promise<void> {
  if (!transportIsHttp || !userId.value) return;
  try {
    const response = await skillBaseService.querySkillPlanningDepartments({
      userId: userId.value,
    });
    remotePermissionDepartmentNames.value = normalizeHarnessDepartmentNames(response);
  } catch (error) {
    console.error('Failed to load harness department scope:', error);
    remotePermissionDepartmentNames.value = [];
  }
}

function waitForInjectedContext(timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (userId.value && skillMarketStore.departmentList.length > 0) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (
        (userId.value && skillMarketStore.departmentList.length > 0) ||
        Date.now() - startedAt > timeout
      ) {
        window.clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

async function loadCurrentUserRole(): Promise<void> {
  try {
    const response = await skillBaseService.queryCurrentUserRole({ userId: userId.value });
    if (!response?.meta?.success || !response.data) return;

    currentUserRole.value = response.data;
    if (!String(skillMarketStore.userId ?? '').trim()) {
      const employeeNo = String(response.data.employeeNo ?? '').trim();
      if (employeeNo) skillMarketStore.updateUserId(employeeNo);
    }
  } catch (error) {
    if (transportIsHttp) {
      console.error('Failed to load harness management role context:', error);
    }
  }
}

async function loadCurrentUserDepartmentPermission(): Promise<void> {
  const currentUserId = userId.value;
  if (!currentUserId) return;

  try {
    const response = await skillBaseService.isReviewer({ userId: currentUserId });
    if (response?.meta?.success && response.data) {
      const permission = extractExpertDepartmentPermission(response.data);
      if (permission.path.length > 0) {
        currentUserDepartmentPermission.value = permission;
        return;
      }
    }
  } catch (error) {
    if (transportIsHttp) {
      console.error('Failed to load current user department from reviewer context:', error);
    }
  }

  try {
    const options = await querySkillPlanningUsers(currentUserId);
    const normalizedUserId = currentUserId.toLowerCase();
    const exactUser = options.find((option) => option.id.trim().toLowerCase() === normalizedUserId);
    const currentUser = exactUser ?? (options.length === 1 ? options[0] : undefined);
    if (currentUser) {
      currentUserDepartmentPermission.value = extractExpertDepartmentPermission(currentUser.raw);
    }
  } catch (error) {
    if (transportIsHttp) {
      console.error('Failed to load current user department from user context:', error);
    }
  }
}

function updateTopbarElevation(): void {
  topbarElevated.value = window.scrollY > 8;
}

onMounted(async () => {
  window.addEventListener('scroll', updateTopbarElevation, { passive: true });
  updateTopbarElevation();
  try {
    if (transportIsHttp) await waitForInjectedContext();
    await loadCurrentUserRole();
    await loadCurrentUserDepartmentPermission();
    await loadHarnessDepartmentScope();
  } finally {
    roleContextReady.value = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateTopbarElevation);
});
</script>

<template>
  <main class="harness-management-shell" :class="{ 'is-topbar-elevated': topbarElevated }">
    <header class="harness-topbar">
      <nav class="harness-tabs" role="tablist" aria-label="Harness 管理分区">
        <button
          v-for="tab in harnessTabs"
          :id="`harness-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          class="harness-tab"
          role="tab"
          :class="{ 'is-active': activeHarnessTab === tab.key }"
          :disabled="roleContextReady && !canManageHarness"
          :aria-selected="activeHarnessTab === tab.key"
          :aria-controls="`harness-panel-${tab.key}`"
          @click="activeHarnessTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="harness-topbar__identity" aria-label="当前工作台">
        <span class="harness-topbar__mark" aria-hidden="true">H</span>
        <span><strong>Harness 管理</strong><small>能力规划工作台</small></span>
      </div>
    </header>

    <section
      v-if="!roleContextReady || !canManageHarness"
      id="harness-panel-access"
      class="harness-tab-panel harness-placeholder-panel"
      role="tabpanel"
    >
      <div class="harness-placeholder">
        <span class="harness-placeholder__eyebrow">Harness Access</span>
        <h1>{{ roleContextReady ? '暂无管理权限' : '正在加载权限' }}</h1>
        <p v-if="roleContextReady">
          当前账号尚未获得任何部门的 Harness 规划与配置权限，请联系管理员或部门主任授权。
        </p>
        <p v-else>正在确认当前账号可管理的部门范围，请稍候。</p>
      </div>
    </section>

    <section
      v-else-if="activeHarnessTab === 'planning'"
      id="harness-panel-planning"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-planning"
    >
      <SkillPlanningPage
        :department-tree="departmentTree"
        :user-id="userId"
        :allowed-department-names="permissionDepartmentNames"
        :restrict-to-allowed-departments="restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else-if="activeHarnessTab === 'tasks'"
      id="harness-panel-tasks"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-tasks"
    >
      <HarnessTaskManagementPage :user-id="userId" />
    </section>

    <section
      v-else-if="activeHarnessTab === 'settings'"
      id="harness-panel-settings"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-settings"
    >
      <HarnessConfigurationPage
        :department-permission-path="currentUserDepartmentPermission.path"
        :department-tree="departmentTree"
        :user-id="userId"
        :is-super-admin="marketRoleIsSuperAdmin(currentUserRole)"
        :can-configure-department-permissions="canConfigureDepartmentPermissions"
        :permission-department-names="permissionDepartmentNames"
        :restrict-to-permission-departments="restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else
      :id="`harness-panel-${activeHarnessTab}`"
      class="harness-tab-panel harness-placeholder-panel"
      role="tabpanel"
      :aria-labelledby="`harness-tab-${activeHarnessTab}`"
    >
      <div class="harness-placeholder">
        <span class="harness-placeholder__eyebrow">Harness Management</span>
        <h1>{{ activeHarnessTabMeta.label }}</h1>
        <p>{{ activeHarnessTabMeta.description }}</p>
        <small>当前页签内容待接入</small>
      </div>
    </section>
  </main>
</template>

<style scoped>
.harness-management-shell {
  --harness-topbar-height: 66px;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  padding-top: var(--harness-topbar-height);
  overflow-x: hidden;
  color: #0f172a;
  background:
    radial-gradient(circle at 11% -8%, rgba(105, 166, 255, 0.22), transparent 28%),
    radial-gradient(circle at 88% -6%, rgba(117, 82, 255, 0.18), transparent 32%),
    radial-gradient(circle at 48% 12%, rgba(255, 255, 255, 0.95), transparent 34%),
    linear-gradient(180deg, #f2f7ff 0%, #fbfcff 44%, #fff 100%);
  font-family:
    'HarmonyOS Sans SC',
    'MiSans',
    'Noto Sans SC',
    'PingFang SC',
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.harness-management-shell::before {
  content: '';
  position: fixed;
  inset: 0 0 auto;
  z-index: -1;
  height: 410px;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(96, 111, 136, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96, 111, 136, 0.05) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.46), transparent 84%);
}

.harness-topbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  box-sizing: border-box;
  width: 100%;
  height: var(--harness-topbar-height);
  padding: 10px 22px 0;
  isolation: isolate;
}

.harness-topbar::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-bottom: 1px solid transparent;
  background: rgba(247, 250, 255, 0.18);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.is-topbar-elevated .harness-topbar::before {
  border-bottom-color: rgba(224, 231, 243, 0.8);
  background: rgba(247, 250, 255, 0.82);
  box-shadow: 0 10px 28px rgba(35, 52, 84, 0.08);
  backdrop-filter: blur(16px) saturate(1.12);
  -webkit-backdrop-filter: blur(16px) saturate(1.12);
}

.harness-tabs {
  display: flex;
  align-self: stretch;
  align-items: flex-end;
  gap: 4px;
  min-width: 0;
  padding: 0 8px;
  overflow-x: auto;
}

.harness-tab {
  flex: 0 0 auto;
  min-height: 48px;
  padding: 12px 16px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: rgba(0, 0, 0, 0.65);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 160ms ease,
    border-color 160ms ease;
}

.harness-tab:hover,
.harness-tab.is-active {
  color: #1890ff;
}

.harness-tab.is-active {
  border-bottom-color: #1890ff;
}

.harness-tab:disabled {
  color: #a8b2c1;
  cursor: not-allowed;
}

.harness-tab:focus-visible {
  border-radius: 5px 5px 0 0;
  outline: 3px solid rgba(24, 144, 255, 0.2);
  outline-offset: -3px;
}

.harness-topbar__identity {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  color: #253857;
}

.harness-topbar__identity > span:last-child {
  display: grid;
  gap: 1px;
}

.harness-topbar__identity strong {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 900;
}

.harness-topbar__identity small {
  color: #7c8ca3;
  font-size: 10px;
  line-height: 1.2;
}

.harness-topbar__mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  color: #fff;
  font-size: 14px;
  font-weight: 950;
  box-shadow: 0 8px 20px rgba(47, 125, 246, 0.22);
}

.harness-tab-panel {
  box-sizing: border-box;
  width: 100%;
  min-height: calc(100vh - var(--harness-topbar-height));
  padding: 14px 50px 34px;
}

.harness-placeholder-panel {
  display: grid;
  place-items: start center;
  padding-top: 72px;
}

.harness-placeholder {
  box-sizing: border-box;
  width: min(720px, 100%);
  padding: 46px 40px;
  border: 1px solid rgba(224, 231, 243, 0.92);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 48px rgba(35, 52, 84, 0.08);
  text-align: center;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.harness-placeholder__eyebrow {
  display: inline-flex;
  padding: 6px 11px;
  border-radius: 999px;
  background: rgba(47, 125, 246, 0.1);
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.harness-placeholder h1 {
  margin: 18px 0 0;
  color: #07172f;
  font-size: 34px;
  line-height: 1.2;
}

.harness-placeholder p {
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.harness-placeholder small {
  display: block;
  margin-top: 24px;
  color: #98a2b3;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .harness-tab-panel {
    padding: 12px 24px 30px;
  }
}

@media (max-width: 640px) {
  .harness-topbar {
    padding: 8px 14px 0;
  }

  .harness-topbar__identity small {
    display: none;
  }

  .harness-tab-panel {
    padding: 6px 14px 24px;
  }
}
</style>

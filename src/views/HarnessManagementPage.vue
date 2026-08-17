<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import HarnessConfigurationPage from './skill/HarnessConfigurationPage.vue';
import ExtensionPublishPage from './skill/ExtensionPublishPage.vue';
import HarnessTaskManagementPage from './skill/HarnessTaskManagementPage.vue';
import SkillPlanningPage from './skill/SkillPlanningPage.vue';
import {
  coerceDepartmentTreeFromUnknown,
  mapDepartmentTreeDtoToForest,
} from '../services/skillMarket/marketDeptTreeFromApi';
import {
  createEmptyHarnessDepartmentPermissions,
  normalizeHarnessDepartmentPermissions,
  type HarnessAccessLevel,
  type HarnessAuthorizedDepartment,
} from '../services/skillMarket/harnessDepartmentPermission';
import { getMockMarketDepartmentsTree } from '../services/skillMarket/mock/marketDepartmentsTreeDefault';
import { skillBaseService } from '../services/skillMarket/skillBaseService';
import { useSkillMarketStore } from '../stores/skillMarketStore';
import { useProfileStore } from '../stores/userStore';
import type { HarnessDepartmentSnapshot, HarnessScopeSnapshot } from '../types/harnessFilterMemory';

const skillMarketStore = useSkillMarketStore();
const profileStore = useProfileStore();
const permissionContextReady = ref(false);
const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const harnessPermissions = ref(createEmptyHarnessDepartmentPermissions());
const MOCK_HARNESS_USER_ID = 'w30000001';
const MOCK_HARNESS_DEPARTMENT_PATH = [
  '部门1',
  '平台产品线',
  '平台工具组',
  'DevOps部',
  '持续交付组',
];
const MOCK_HARNESS_DEPARTMENT_NAMES = ['持续交付组'];
const currentUserDepartmentPermission = ref({
  minimumDepartmentId: transportIsHttp ? '' : (MOCK_HARNESS_DEPARTMENT_PATH.at(-1) ?? ''),
  path: transportIsHttp ? [] : [...MOCK_HARNESS_DEPARTMENT_PATH],
});
type HarnessPermissionLoadState = 'loading' | 'ready' | 'error';
const harnessPermissionLoadState = ref<HarnessPermissionLoadState>(
  transportIsHttp ? 'loading' : 'ready',
);
const harnessPermissionError = ref('');
const HARNESS_PERMISSION_LOAD_FAILED_MESSAGE =
  '\u6743\u9650\u4fe1\u606f\u83b7\u53d6\u5931\u8d25\uff0c\u5df2\u7981\u7528\u90e8\u95e8\u9009\u62e9\u4e0e\u63d0\u4ea4\u3002';

type HarnessTab = 'command' | 'planning' | 'tasks' | 'agent' | 'extension' | 'settings';

type PlanningMemoryKey = 'command' | 'planning' | 'agent';
type PlanningScopeChange = {
  capabilityType: 'command' | 'skill' | 'agent';
  snapshot: HarnessScopeSnapshot;
};

const harnessTabs: Array<{ key: HarnessTab; label: string; description: string }> = [
  { key: 'command', label: 'Command 规划', description: '统一规划和管理 Command 能力。' },
  { key: 'planning', label: 'Skill 规划', description: '统一管理各部门规划建设中的 Skill。' },
  { key: 'agent', label: 'Agent 规划', description: '统一规划和管理 Agent 能力。' },
  { key: 'extension', label: 'Extension 发布', description: '集中管理 Extension 的发布流程。' },
  { key: 'settings', label: '配置管理', description: '维护 Harness 管理相关的公共配置。' },
  { key: 'tasks', label: '任务管理', description: '集中跟踪当前用户负责的 Skill 任务。' },
];

const activeHarnessTab = ref<HarnessTab>('planning');
const planningScopeSnapshots = ref<Partial<Record<PlanningMemoryKey, HarnessScopeSnapshot>>>({});
const catalogScopeSnapshots = ref<Partial<Record<PlanningMemoryKey, HarnessScopeSnapshot>>>({});
const configurationScopeSnapshots = ref<
  Partial<Record<'scene' | 'activity', HarnessScopeSnapshot>>
>({});
const configurationDepartmentSnapshots = ref<
  Partial<Record<'permission', HarnessDepartmentSnapshot>>
>({});
const activeHarnessTabMeta = computed(
  () => harnessTabs.find((tab) => tab.key === activeHarnessTab.value) ?? harnessTabs[1],
);
const topbarElevated = ref(false);

const userId = computed(() => {
  const injectedUserId = String(skillMarketStore.userId ?? '').trim();
  if (injectedUserId) return injectedUserId;

  if (transportIsHttp) return '';
  return String(profileStore.userInfo?.w3Id ?? '').trim() || MOCK_HARNESS_USER_ID;
});

const userName = computed(
  () =>
    String(skillMarketStore.userName ?? '').trim() ||
    String(profileStore.userInfo?.nameCn ?? '').trim() ||
    String(profileStore.userInfo?.name ?? '').trim() ||
    userId.value,
);

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

const canConfigureDepartmentPermissions = computed(() =>
  transportIsHttp
    ? harnessPermissions.value.ownedOrgs.length > 0
    : departmentLevelByPath(currentUserDepartmentPermission.value.path) === 5,
);

const permissionDepartmentNames = computed(() =>
  transportIsHttp
    ? [
        ...new Set(
          manageableDepartments.value.map((department) => department.deptName).filter(Boolean),
        ),
      ]
    : [...MOCK_HARNESS_DEPARTMENT_NAMES],
);

// Keep the complete department tree visible in mock mode across all planning tabs.
// HTTP mode remains restricted to the departments returned by the permission API.
const restrictToPermissionDepartments = computed(() => transportIsHttp);

const canManageHarness = computed(
  () => !restrictToPermissionDepartments.value || permissionDepartmentNames.value.length > 0,
);

function harnessDepartmentLevel(department: HarnessAuthorizedDepartment): number {
  const levelNo = Number(department.levelNo);
  if (Number.isFinite(levelNo) && levelNo > 0) return levelNo;
  return (
    departmentLevelByPath(resolveAuthorizedDepartmentPath(department)) || Number.MAX_SAFE_INTEGER
  );
}

function sortHarnessDepartmentsByLevel(
  departments: HarnessAuthorizedDepartment[],
): HarnessAuthorizedDepartment[] {
  return departments
    .map((department, index) => ({ department, index, level: harnessDepartmentLevel(department) }))
    .sort((left, right) => left.level - right.level || left.index - right.index)
    .map(({ department }) => department);
}

const manageableDepartments = computed<HarnessAuthorizedDepartment[]>(() =>
  transportIsHttp
    ? sortHarnessDepartmentsByLevel(harnessPermissions.value.manageableOrgs).map((department) => ({
        ...department,
        path: resolveAuthorizedDepartmentPath(department),
      }))
    : [],
);
const ownerDepartments = computed<HarnessAuthorizedDepartment[]>(() =>
  transportIsHttp
    ? harnessPermissions.value.ownedOrgs.map((department) => ({
        ...department,
        path: resolveAuthorizedDepartmentPath(department),
      }))
    : [],
);

const permissionDepartmentPaths = computed(() =>
  transportIsHttp
    ? manageableDepartments.value.map((department) => [...department.path])
    : [[...MOCK_HARNESS_DEPARTMENT_PATH]],
);

function resolveAuthorizedDepartmentPath(department: HarnessAuthorizedDepartment): string[] {
  const expectedPath = department.path.map((item) => item.trim()).filter(Boolean);
  const expectedLevelNo = Number(department.levelNo);
  const hasExpectedLevelNo = Number.isFinite(expectedLevelNo) && expectedLevelNo > 0;
  const matchingPaths: string[][] = [];
  let codeMatch: string[] | null = null;

  const visit = (nodes: typeof departmentTree.value, parentPath: string[]): void => {
    nodes.forEach((node) => {
      const path = [...parentPath, node.name];
      if (
        department.deptCode &&
        (node.deptCode === department.deptCode || node.id === department.deptCode) &&
        (!hasExpectedLevelNo || node.levelNo === expectedLevelNo)
      ) {
        codeMatch = path;
      }
      if (node.name === department.deptName || pathEndsWith(path, expectedPath)) {
        matchingPaths.push(path);
      }
      if (node.children.length > 0) visit(node.children, path);
    });
  };

  visit(departmentTree.value, []);
  if (codeMatch) return [...codeMatch];

  const suffixMatch = matchingPaths.find((path) => pathEndsWith(path, expectedPath));
  if (suffixMatch) return [...suffixMatch];
  const onlyMatch = matchingPaths.length === 1 ? matchingPaths[0] : undefined;
  if (onlyMatch) return [...onlyMatch];
  return [...expectedPath];
}

function pathEndsWith(path: string[], suffix: string[]): boolean {
  if (suffix.length === 0 || suffix.length > path.length) return false;
  const offset = path.length - suffix.length;
  return suffix.every((segment, index) => path[offset + index] === segment);
}

const harnessAccessLevel = computed<HarnessAccessLevel>(() => {
  if (transportIsHttp) return harnessPermissions.value.accessLevel;
  if (!canManageHarness.value) return 'task-only';
  return canConfigureDepartmentPermissions.value ? 'owner' : 'admin';
});

const visibleHarnessTabs = computed(() =>
  harnessAccessLevel.value === 'task-only'
    ? harnessTabs.filter((tab) => tab.key === 'tasks')
    : harnessTabs,
);

async function loadHarnessDepartmentScope(): Promise<void> {
  if (!transportIsHttp) return;
  harnessPermissionLoadState.value = 'loading';
  harnessPermissionError.value = '';
  if (!userId.value) {
    harnessPermissions.value = createEmptyHarnessDepartmentPermissions();
    harnessPermissionLoadState.value = 'error';
    harnessPermissionError.value = HARNESS_PERMISSION_LOAD_FAILED_MESSAGE;
    return;
  }

  try {
    const response = await skillBaseService.queryHarnessDeptPermissions({
      userId: userId.value,
    });
    harnessPermissions.value = normalizeHarnessDepartmentPermissions(response);
    harnessPermissionLoadState.value = 'ready';
  } catch (error) {
    console.error('Failed to load harness department scope:', error);
    harnessPermissions.value = createEmptyHarnessDepartmentPermissions();
    harnessPermissionLoadState.value = 'error';
    harnessPermissionError.value = HARNESS_PERMISSION_LOAD_FAILED_MESSAGE;
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

function updateTopbarElevation(): void {
  topbarElevated.value = window.scrollY > 8;
}

function planningMemoryKey(
  capabilityType: PlanningScopeChange['capabilityType'],
): PlanningMemoryKey {
  return capabilityType === 'skill' ? 'planning' : capabilityType;
}

function activePlanningMemoryKey(): PlanningMemoryKey {
  return activeHarnessTab.value === 'command' || activeHarnessTab.value === 'agent'
    ? activeHarnessTab.value
    : 'planning';
}

function updatePlanningScopeSnapshot(change: PlanningScopeChange): void {
  planningScopeSnapshots.value[planningMemoryKey(change.capabilityType)] = {
    ...change.snapshot,
    departmentPath: [...change.snapshot.departmentPath],
  };
}

function updateCatalogScopeSnapshot(change: PlanningScopeChange): void {
  catalogScopeSnapshots.value[planningMemoryKey(change.capabilityType)] = {
    ...change.snapshot,
    departmentPath: [...change.snapshot.departmentPath],
  };
}

function updateConfigurationScopeSnapshot(
  key: 'scene' | 'activity',
  snapshot: HarnessScopeSnapshot,
): void {
  configurationScopeSnapshots.value[key] = {
    ...snapshot,
    departmentPath: [...snapshot.departmentPath],
  };
}

function updateConfigurationDepartmentSnapshot(snapshot: HarnessDepartmentSnapshot): void {
  configurationDepartmentSnapshots.value.permission = {
    departmentPath: [...snapshot.departmentPath],
  };
}

onMounted(async () => {
  window.addEventListener('scroll', updateTopbarElevation, { passive: true });
  updateTopbarElevation();
  try {
    if (transportIsHttp) await waitForInjectedContext();
    if (transportIsHttp) await loadHarnessDepartmentScope();
    activeHarnessTab.value = harnessAccessLevel.value === 'task-only' ? 'tasks' : 'planning';
  } finally {
    permissionContextReady.value = true;
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
          v-for="tab in visibleHarnessTabs"
          :id="`harness-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          class="harness-tab"
          role="tab"
          :class="{ 'is-active': activeHarnessTab === tab.key }"
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

    <div
      v-if="harnessPermissionLoadState === 'error'"
      class="harness-permission-alert"
      role="alert"
    >
      {{ harnessPermissionError || HARNESS_PERMISSION_LOAD_FAILED_MESSAGE }}
    </div>

    <section
      v-if="!permissionContextReady"
      id="harness-panel-access"
      class="harness-tab-panel harness-placeholder-panel"
      role="tabpanel"
    >
      <div class="harness-placeholder">
        <span class="harness-placeholder__eyebrow">Harness Access</span>
        <h1>正在加载权限</h1>
        <p>正在确认当前账号可管理的部门范围，请稍候。</p>
      </div>
    </section>

    <section
      v-else-if="['command', 'planning', 'agent'].includes(activeHarnessTab)"
      :id="`harness-panel-${activeHarnessTab}`"
      class="harness-tab-panel"
      role="tabpanel"
      :aria-labelledby="`harness-tab-${activeHarnessTab}`"
    >
      <SkillPlanningPage
        :key="activeHarnessTab"
        :capability-type="
          activeHarnessTab === 'command'
            ? 'command'
            : activeHarnessTab === 'agent'
              ? 'agent'
              : 'skill'
        "
        :department-tree="departmentTree"
        :user-id="userId"
        :current-user-department-path="currentUserDepartmentPermission.path"
        :allowed-department-names="permissionDepartmentNames"
        :allowed-department-paths="permissionDepartmentPaths"
        :restrict-to-allowed-departments="restrictToPermissionDepartments"
        :initial-scope="planningScopeSnapshots[activePlanningMemoryKey()]"
        :initial-catalog-scope="catalogScopeSnapshots[activePlanningMemoryKey()]"
        @scope-change="updatePlanningScopeSnapshot"
        @catalog-scope-change="updateCatalogScopeSnapshot"
      />
    </section>

    <section
      v-else-if="activeHarnessTab === 'extension'"
      id="harness-panel-extension"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-extension"
    >
      <ExtensionPublishPage
        :user-id="userId"
        :user-name="userName"
        :department-tree="departmentTree"
        :current-user-department-path="currentUserDepartmentPermission.path"
        :allowed-department-paths="permissionDepartmentPaths"
        :restrict-to-allowed-departments="restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else-if="activeHarnessTab === 'tasks'"
      id="harness-panel-tasks"
      class="harness-tab-panel harness-tab-panel--tasks"
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
        :can-configure-department-permissions="canConfigureDepartmentPermissions"
        :owner-departments="ownerDepartments"
        :manageable-departments="manageableDepartments"
        :permission-department-names="permissionDepartmentNames"
        :permission-department-paths="permissionDepartmentPaths"
        :restrict-to-permission-departments="restrictToPermissionDepartments"
        :department-permissions-loading="harnessPermissionLoadState === 'loading'"
        :department-permissions-error="harnessPermissionError"
        :scene-initial-scope="configurationScopeSnapshots.scene"
        :activity-initial-scope="configurationScopeSnapshots.activity"
        :permission-initial-scope="configurationDepartmentSnapshots.permission"
        @scene-scope-change="updateConfigurationScopeSnapshot('scene', $event)"
        @activity-scope-change="updateConfigurationScopeSnapshot('activity', $event)"
        @permission-scope-change="updateConfigurationDepartmentSnapshot($event)"
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

.harness-permission-alert {
  position: fixed;
  top: calc(var(--harness-topbar-height) + 14px);
  right: 24px;
  z-index: 90;
  max-width: min(420px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fff1f2;
  color: #b42318;
  box-shadow: 0 12px 30px rgba(180, 35, 24, 0.12);
  font-size: 13px;
  font-weight: 700;
}

.harness-tab-panel {
  box-sizing: border-box;
  width: 100%;
  min-height: calc(100vh - var(--harness-topbar-height));
  padding: 14px 50px 34px;
}

.harness-tab-panel--tasks {
  padding-inline: clamp(12px, 1.25vw, 24px);
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

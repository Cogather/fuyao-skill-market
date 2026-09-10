<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import '../style/skill/HarnessWorkspace.scss';

import HarnessConfigurationPage from './skill/HarnessConfigurationPage.vue';
import AgentSkillAssetsPage from './skill/AgentSkillAssetsPage.vue';
import BusinessScenarioDesignPage from './skill/BusinessScenarioDesignPage.vue';
import HarnessCapabilityManagementPage from './skill/HarnessCapabilityManagementPage.vue';
import HarnessWorkflowsPage from './skill/HarnessWorkflowsPage.vue';
import ExtensionPublishPage from './skill/LegacyExtensionPublishPage.vue';
import HarnessTaskManagementPage from './skill/HarnessTaskManagementPage.vue';
import SkillPlanningPage from './skill/SkillPlanningPage.vue';
import { createHarnessScenarioWorkspace } from '../composables/useHarnessScenarioWorkspace';
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
const HARNESS_DEPARTMENT_TREE_MISSING_MESSAGE =
  '未从父页面获取到部门树，请检查初始化参数后重新进入。';

type HarnessTab =
  | 'scenarios'
  | 'capabilities'
  | 'workflows'
  | 'assets'
  | 'command'
  | 'planning'
  | 'tasks'
  | 'agent'
  | 'extension'
  | 'settings';

type PlanningMemoryKey = 'command' | 'planning' | 'agent';
type PlanningScopeChange = {
  capabilityType: 'command' | 'skill' | 'agent';
  snapshot: HarnessScopeSnapshot;
};

const harnessTabs: Array<{ key: HarnessTab; label: string; description: string }> = [
  {
    key: 'scenarios',
    label: '业务场景设计',
    description: '按产品与场景逐层组织业务，并编排端到端 Workflow。',
  },
  {
    key: 'workflows',
    label: 'Harness 工作流',
    description: '集中查看所选部门及各业务场景关联的 Harness 工作流。',
  },
  {
    key: 'capabilities',
    label: '资产清单',
    description: '统一管理 Command、Skill、Agent 清单与 Extension 发布。',
  },
  {
    key: 'assets',
    label: '资产清单',
    description: '统一查看 Agent、Skill、Command 与 Extension 资产。',
  },
  { key: 'command', label: 'Command 规划', description: '统一规划和管理 Command 能力。' },
  { key: 'planning', label: 'Skill 规划', description: '统一管理各部门规划建设中的 Skill。' },
  { key: 'agent', label: 'Agent 规划', description: '统一规划和管理 Agent 能力。' },
  { key: 'extension', label: 'Extension 发布', description: '集中管理 Extension 的发布流程。' },
  { key: 'settings', label: '权限管理', description: '维护 Harness 管理相关的公共配置。' },
  { key: 'tasks', label: '待办任务', description: '集中跟踪当前用户负责的 Skill 任务。' },
];
const showLegacyPlanningTabs = false;

const activeHarnessTab = ref<HarnessTab>('scenarios');
const configurationPage = ref<InstanceType<typeof HarnessConfigurationPage> | null>(null);
const planningPage = ref<InstanceType<typeof SkillPlanningPage> | null>(null);
const capabilityManagementActivated = ref(false);
const extensionTabActivated = ref(false);
const planningScopeSnapshots = ref<Partial<Record<PlanningMemoryKey, HarnessScopeSnapshot>>>({});
const catalogScopeSnapshots = ref<Partial<Record<PlanningMemoryKey, HarnessScopeSnapshot>>>({});
const extensionScopeSnapshot = ref<HarnessScopeSnapshot>();
const capabilityScopeSnapshots = computed<
  Partial<Record<PlanningScopeChange['capabilityType'], HarnessScopeSnapshot>>
>(() => {
  const snapshots: Partial<Record<PlanningScopeChange['capabilityType'], HarnessScopeSnapshot>> =
    {};
  if (catalogScopeSnapshots.value.command) {
    snapshots.command = catalogScopeSnapshots.value.command;
  }
  if (catalogScopeSnapshots.value.planning) {
    snapshots.skill = catalogScopeSnapshots.value.planning;
  }
  if (catalogScopeSnapshots.value.agent) {
    snapshots.agent = catalogScopeSnapshots.value.agent;
  }
  return snapshots;
});
const configurationScopeSnapshots = ref<
  Partial<Record<'scene' | 'activity', HarnessScopeSnapshot>>
>({});
const configurationDepartmentSnapshots = ref<
  Partial<Record<'permission', HarnessDepartmentSnapshot>>
>({});
const activeHarnessTabMeta = computed(
  () => harnessTabs.find((tab) => tab.key === activeHarnessTab.value) ?? harnessTabs[0]!,
);
const topbarElevated = ref(false);

const userId = computed(() => {
  const injectedUserId = String(skillMarketStore.userId ?? '').trim();
  if (injectedUserId) return injectedUserId;

  if (transportIsHttp) return '';
  return String(profileStore.userInfo?.w3Id ?? '').trim() || MOCK_HARNESS_USER_ID;
});

const userName = computed(() => String(skillMarketStore.userName ?? '').trim());

const departmentTree = computed(() => {
  const injectedDepartments = skillMarketStore.departmentList;
  // HTTP 模式只使用父页面注入的数据，不请求部门树接口，也不回退 Mock。
  const source = transportIsHttp ? injectedDepartments : getMockMarketDepartmentsTree();
  return mapDepartmentTreeDtoToForest(coerceDepartmentTreeFromUnknown(source));
});
const departmentTreeUnavailable = computed(
  () => transportIsHttp && permissionContextReady.value && departmentTree.value.length === 0,
);

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

const scenarioWorkspace = createHarnessScenarioWorkspace(() => ({
  ready: permissionContextReady.value && harnessPermissionLoadState.value === 'ready',
  userId: userId.value,
  departmentTree: departmentTree.value,
  defaultDepartmentPath:
    permissionDepartmentPaths.value[0] ?? currentUserDepartmentPermission.value.path,
  allowedDepartmentPaths: permissionDepartmentPaths.value,
  // 场景设计按管理权限选择部门；只读工作流清单保留完整部门筛选。
  restrictToAllowedDepartments:
    restrictToPermissionDepartments.value && activeHarnessTab.value === 'scenarios',
}));
const scenarioScopeSnapshot = computed<HarnessScopeSnapshot | undefined>(() => {
  const product = scenarioWorkspace.products.find(
    (item) => item._id === scenarioWorkspace.productId.value,
  );
  const department = scenarioWorkspace.departments.find(
    (item) => item._id === scenarioWorkspace.selectedDeptId.value,
  );
  return product && department
    ? {
        level: '产品级',
        departmentPath: department.path,
        offeringId: product.code,
        offeringName: product.name,
      }
    : undefined;
});

function resolveAuthorizedDepartmentPath(department: HarnessAuthorizedDepartment): string[] {
  const expectedPath = department.path.map((item) => item.trim()).filter(Boolean);
  const expectedLevelNo = Number(department.levelNo);
  const hasExpectedLevelNo = Number.isFinite(expectedLevelNo) && expectedLevelNo > 0;
  const matchingPaths: string[][] = [];
  let strictCodeMatch: string[] | null = null;
  let codeMatch: string[] | null = null;

  const visit = (nodes: typeof departmentTree.value, parentPath: string[]): void => {
    nodes.forEach((node) => {
      const path = [...parentPath, node.name];
      if (
        department.deptCode &&
        (node.deptCode === department.deptCode || node.id === department.deptCode)
      ) {
        codeMatch = path;
        if (!hasExpectedLevelNo || node.levelNo === expectedLevelNo) strictCodeMatch = path;
      }
      if (node.name === department.deptName || pathEndsWith(path, expectedPath)) {
        matchingPaths.push(path);
      }
      if (node.children.length > 0) visit(node.children, path);
    });
  };

  visit(departmentTree.value, []);
  if (strictCodeMatch) return [...strictCodeMatch];
  // 权限接口可能使用 L3-L8，而部门树使用 L1-L6；编码一致时不能被层级编号差异挡住。
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

function waitForInjectedContext(timeout = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (userId.value && departmentTree.value.length > 0) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if ((userId.value && departmentTree.value.length > 0) || Date.now() - startedAt > timeout) {
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

function updateExtensionScopeSnapshot(snapshot: HarnessScopeSnapshot): void {
  extensionScopeSnapshot.value = {
    ...snapshot,
    departmentPath: [...snapshot.departmentPath],
  };
}

function selectHarnessTab(tab: HarnessTab): void {
  if (
    tab !== activeHarnessTab.value &&
    activeHarnessTab.value === 'settings' &&
    configurationPage.value?.validateBeforeLeave() === false
  ) {
    return;
  }
  if (tab === 'capabilities') capabilityManagementActivated.value = true;
  if (tab === 'extension') extensionTabActivated.value = true;
  activeHarnessTab.value = tab;
}

function updateConfigurationScopeSnapshot(
  key: 'scene' | 'activity',
  snapshot: HarnessScopeSnapshot,
): void {
  configurationScopeSnapshots.value[key] = {
    ...snapshot,
    departmentPath: [...snapshot.departmentPath],
  };
  if (key === 'scene') scenarioWorkspace.selectScope(snapshot);
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
    activeHarnessTab.value = harnessAccessLevel.value === 'task-only' ? 'tasks' : 'scenarios';
  } finally {
    permissionContextReady.value = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateTopbarElevation);
});

onBeforeRouteLeave(() => {
  if (activeHarnessTab.value !== 'settings') return true;
  return configurationPage.value?.validateBeforeLeave() ?? true;
});
</script>

<template>
  <main
    class="harness-management-shell"
    :class="{
      'is-topbar-elevated': topbarElevated,
    }"
  >
    <header class="harness-topbar">
      <nav class="harness-tabs" role="tablist" aria-label="Harness 管理分区">
        <template v-for="tab in visibleHarnessTabs" :key="tab.key">
          <button
            v-if="
              showLegacyPlanningTabs ||
              !['command', 'planning', 'agent', 'extension'].includes(tab.key)
            "
            :id="`harness-tab-${tab.key}`"
            type="button"
            class="harness-tab"
            role="tab"
            :class="{ 'is-active': activeHarnessTab === tab.key }"
            :aria-selected="activeHarnessTab === tab.key"
            :aria-controls="`harness-panel-${tab.key}`"
            @click="selectHarnessTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </template>
      </nav>

      <div class="harness-topbar__identity" aria-label="当前工作台">
        <span class="harness-topbar__mark" aria-hidden="true">H</span>
        <span><strong>Harness 管理</strong><small>能力规划工作台</small></span>
      </div>
    </header>

    <div v-if="departmentTreeUnavailable" class="harness-permission-alert" role="alert">
      {{ HARNESS_DEPARTMENT_TREE_MISSING_MESSAGE }}
    </div>

    <div
      v-else-if="harnessPermissionLoadState === 'error'"
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
      v-if="permissionContextReady && harnessAccessLevel !== 'task-only'"
      v-show="activeHarnessTab === 'scenarios'"
      id="harness-panel-scenarios"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-scenarios"
    >
      <BusinessScenarioDesignPage
        :workspace="scenarioWorkspace"
        :active="activeHarnessTab === 'scenarios'"
      />
    </section>

    <section
      v-if="permissionContextReady && capabilityManagementActivated"
      v-show="activeHarnessTab === 'capabilities'"
      id="harness-panel-capabilities"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-capabilities"
    >
      <HarnessCapabilityManagementPage
        :user-id="userId"
        :user-name="userName"
        :department-tree="departmentTree"
        :current-user-department-path="currentUserDepartmentPermission.path"
        :allowed-department-names="permissionDepartmentNames"
        :allowed-department-paths="permissionDepartmentPaths"
        :restrict-to-allowed-departments="restrictToPermissionDepartments"
        :scope-snapshots="capabilityScopeSnapshots"
        :extension-initial-scope="extensionScopeSnapshot"
        @catalog-scope-change="updateCatalogScopeSnapshot"
        @extension-scope-change="updateExtensionScopeSnapshot"
      />
    </section>

    <section
      v-if="permissionContextReady && harnessAccessLevel !== 'task-only'"
      v-show="activeHarnessTab === 'workflows'"
      id="harness-panel-workflows"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-workflows"
    >
      <HarnessWorkflowsPage
        :workspace="scenarioWorkspace"
        :active="activeHarnessTab === 'workflows'"
        @open-scenarios="selectHarnessTab('scenarios')"
      />
    </section>

    <section
      v-if="permissionContextReady && activeHarnessTab === 'assets'"
      id="harness-panel-assets"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-assets"
    >
      <AgentSkillAssetsPage
        :user-id="userId"
        :user-name="userName"
        :department-tree="departmentTree"
        :current-user-department-path="currentUserDepartmentPermission.path"
        :allowed-department-paths="permissionDepartmentPaths"
        :restrict-to-allowed-departments="restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else-if="
        permissionContextReady && ['command', 'planning', 'agent'].includes(activeHarnessTab)
      "
      :id="`harness-panel-${activeHarnessTab}`"
      class="harness-tab-panel"
      role="tabpanel"
      :aria-labelledby="`harness-tab-${activeHarnessTab}`"
    >
      <SkillPlanningPage
        ref="planningPage"
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
      v-else-if="permissionContextReady && activeHarnessTab === 'tasks'"
      id="harness-panel-tasks"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-tasks"
    >
      <HarnessTaskManagementPage :user-id="userId" />
    </section>

    <section
      v-else-if="permissionContextReady && activeHarnessTab === 'settings'"
      id="harness-panel-settings"
      class="harness-tab-panel"
      role="tabpanel"
      aria-labelledby="harness-tab-settings"
    >
      <HarnessConfigurationPage
        :workspace="scenarioWorkspace"
        ref="configurationPage"
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
        :scene-initial-scope="scenarioScopeSnapshot || configurationScopeSnapshots.scene"
        :activity-initial-scope="configurationScopeSnapshots.activity"
        :permission-initial-scope="configurationDepartmentSnapshots.permission"
        @scene-scope-change="updateConfigurationScopeSnapshot('scene', $event)"
        @activity-scope-change="updateConfigurationScopeSnapshot('activity', $event)"
        @permission-scope-change="updateConfigurationDepartmentSnapshot($event)"
      />
    </section>

    <section
      v-else-if="
        permissionContextReady &&
        activeHarnessTab !== 'capabilities' &&
        activeHarnessTab !== 'extension' &&
        activeHarnessTab !== 'scenarios' &&
        activeHarnessTab !== 'workflows'
      "
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

    <section
      v-if="permissionContextReady && extensionTabActivated"
      v-show="activeHarnessTab === 'extension'"
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
        :initial-scope="extensionScopeSnapshot"
        @scope-change="updateExtensionScopeSnapshot"
      />
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
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  padding-top: var(--harness-topbar-height);
  overflow: hidden;
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

.harness-management-shell :deep(.harness-page-heading) {
  flex-shrink: 0;
  margin: 0 0 16px;
  padding: 0;
}

.harness-management-shell :deep(.harness-viewport-page:not(.asset-page) > .harness-page-heading) {
  margin-bottom: 0;
}

.harness-management-shell :deep(.harness-page-title) {
  margin: 0;
  color: #111827;
  font-size: 22.4px;
  font-weight: 700;
  line-height: normal;
  letter-spacing: normal;
}

.harness-management-shell :deep(.harness-page-description) {
  margin: 3.2px 0 0;
  color: #6b7280;
  font-size: 13.12px;
  font-weight: 400;
  line-height: normal;
  letter-spacing: normal;
}

.harness-management-shell :deep(.planning-tab),
.harness-management-shell :deep(.configuration-tab) {
  min-width: 144px;
  height: 42px;
  min-height: 42px;
  padding: 0 12px;
}

.harness-management-shell :deep(.capability-management-page .planning-tab),
.harness-management-shell :deep(#configuration-tab-permissions) {
  flex: 0 0 auto;
  justify-content: center;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
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
  min-height: 44px;
  padding: 10px 12px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: rgba(0, 0, 0, 0.65);
  font: inherit;
  font-size: 14px;
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
  display: flex;
  align-items: center;
  gap: 12px;
}

.harness-tab-panel {
  box-sizing: border-box;
  width: 100%;
  height: calc(100vh - var(--harness-topbar-height));
  height: calc(100dvh - var(--harness-topbar-height));
  min-height: 0;
  overflow-y: auto;
  padding: 14px 50px 34px;
}

#harness-panel-workflows,
#harness-panel-tasks {
  overflow: hidden;
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

@media (min-width: 1101px) {
  #harness-panel-scenarios {
    overflow: hidden;
  }
}

@media (min-width: 1101px) and (min-height: 900px) {
  .harness-tab-panel {
    overflow: hidden;
  }

  .harness-management-shell :deep(.harness-viewport-page) {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
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

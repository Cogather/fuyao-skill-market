<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import ScenarioActivityManagementPanel from '../../components/skill/ScenarioActivityManagementPanel.vue';
import DepartmentPlanningPermissionPanel from '../../components/skill/DepartmentPlanningPermissionPanel.vue';
import SceneSettingsPanel from '../../components/skill/SceneSettingsPanel.vue';
import type { HarnessScenarioWorkspace } from '../../composables/useHarnessScenarioWorkspace';
import type { HarnessAuthorizedDepartment } from '../../services/skillMarket/harnessDepartmentPermission';
import type {
  HarnessDepartmentSnapshot,
  HarnessScopeSnapshot,
} from '../../types/harnessFilterMemory';

type ConfigurationTab = 'scenes' | 'activities' | 'permissions';
type DepartmentTreeNode = {
  id?: string;
  deptCode?: string;
  levelNo?: number;
  name: string;
  children?: DepartmentTreeNode[];
};

const props = withDefaults(
  defineProps<{
    workspace: HarnessScenarioWorkspace;
    departmentTree?: DepartmentTreeNode[];
    userId?: string;
    canConfigureDepartmentPermissions?: boolean;
    ownerDepartments?: HarnessAuthorizedDepartment[];
    departmentPermissionPath?: string[];
    permissionDepartmentNames?: string[];
    permissionDepartmentPaths?: string[][];
    restrictToPermissionDepartments?: boolean;
    manageableDepartments?: HarnessAuthorizedDepartment[];
    departmentPermissionsLoading?: boolean;
    departmentPermissionsError?: string;
    sceneInitialScope?: HarnessScopeSnapshot;
    activityInitialScope?: HarnessScopeSnapshot;
    permissionInitialScope?: HarnessDepartmentSnapshot;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    canConfigureDepartmentPermissions: false,
    ownerDepartments: () => [],
    departmentPermissionPath: () => [],
    permissionDepartmentNames: () => [],
    permissionDepartmentPaths: () => [],
    restrictToPermissionDepartments: true,
    manageableDepartments: () => [],
    departmentPermissionsLoading: false,
    departmentPermissionsError: '',
    sceneInitialScope: undefined,
    activityInitialScope: undefined,
    permissionInitialScope: undefined,
  },
);

const emit = defineEmits<{
  'scene-scope-change': [snapshot: HarnessScopeSnapshot];
  'activity-scope-change': [snapshot: HarnessScopeSnapshot];
  'permission-scope-change': [snapshot: HarnessDepartmentSnapshot];
}>();

const showScenarioStructureConfiguration = false;
const activeConfigurationTab = ref<ConfigurationTab>('permissions');
const scenePanel = ref<InstanceType<typeof SceneSettingsPanel> | null>(null);
const activityPanel = ref<InstanceType<typeof ScenarioActivityManagementPanel> | null>(null);
const configurationTabs = computed(() => {
  const tabs: Array<{
    key: ConfigurationTab;
    label: string;
    description: string;
  }> = [
    { key: 'scenes', label: '场景管理', description: '管理分类体系' },
    { key: 'activities', label: '环节与节点', description: '维护场景工作流结构' },
  ];

  if (props.canConfigureDepartmentPermissions) {
    tabs.push({
      key: 'permissions',
      label: '部门权限配置',
      description: '管理规划与配置人员',
    });
  }

  return tabs;
});

watch(
  () => props.canConfigureDepartmentPermissions,
  (canConfigure) => {
    if (!canConfigure && activeConfigurationTab.value === 'permissions') {
      activeConfigurationTab.value = 'scenes';
    }
  },
);

function validateBeforeLeave(): boolean {
  if (activeConfigurationTab.value === 'scenes') {
    return scenePanel.value?.validateBeforeLeave() ?? true;
  }
  if (activeConfigurationTab.value === 'activities') {
    return activityPanel.value?.validateBeforeLeave() ?? true;
  }
  return true;
}

function selectConfigurationTab(tab: ConfigurationTab): void {
  if (tab === activeConfigurationTab.value || !validateBeforeLeave()) return;
  activeConfigurationTab.value = tab;
}

defineExpose({ validateBeforeLeave });
</script>

<template>
  <div class="configuration-page harness-viewport-page">
    <header class="configuration-hero harness-page-heading">
      <h2 class="harness-page-title">配置管理</h2>
      <p class="harness-page-description">
        集中维护各项 Harness 规划能力共用的场景、场景工作流的环节与节点及部门人员权限。
      </p>
    </header>

    <nav
      class="configuration-tabs"
      :class="{ 'has-permission-tab': props.canConfigureDepartmentPermissions }"
      role="tablist"
      aria-label="配置管理分区"
    >
      <template v-for="(tab, index) in configurationTabs" :key="tab.key">
        <button
          v-if="showScenarioStructureConfiguration || tab.key === 'permissions'"
          :id="`configuration-tab-${tab.key}`"
          type="button"
          class="configuration-tab"
          role="tab"
          :class="{ 'is-active': activeConfigurationTab === tab.key }"
          :aria-selected="activeConfigurationTab === tab.key"
          :aria-controls="`configuration-panel-${tab.key}`"
          @click="selectConfigurationTab(tab.key)"
        >
          <span v-if="tab.key !== 'permissions'" class="configuration-tab__icon" aria-hidden="true">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <span>
            <strong>{{ tab.label }}</strong>
          </span>
        </button>
      </template>
    </nav>

    <section
      v-if="showScenarioStructureConfiguration && activeConfigurationTab === 'scenes'"
      id="configuration-panel-scenes"
      role="tabpanel"
      aria-labelledby="configuration-tab-scenes"
    >
      <SceneSettingsPanel
        ref="scenePanel"
        :department-tree="props.departmentTree"
        :user-id="props.userId"
        :department-permission-path="props.departmentPermissionPath"
        :allowed-department-names="props.permissionDepartmentNames"
        :allowed-department-paths="props.permissionDepartmentPaths"
        :restrict-to-allowed-departments="props.restrictToPermissionDepartments"
        :manageable-departments="props.manageableDepartments"
        :department-permissions-loading="props.departmentPermissionsLoading"
        :department-permissions-error="props.departmentPermissionsError"
        :initial-scope="props.sceneInitialScope"
        @scope-change="emit('scene-scope-change', $event)"
      />
    </section>

    <section
      v-if="showScenarioStructureConfiguration && activeConfigurationTab === 'activities'"
      id="configuration-panel-activities"
      role="tabpanel"
      aria-labelledby="configuration-tab-activities"
    >
      <ScenarioActivityManagementPanel
        ref="activityPanel"
        :workspace="props.workspace"
        @scope-change="emit('activity-scope-change', $event)"
      />
    </section>

    <section
      v-if="props.canConfigureDepartmentPermissions"
      id="configuration-panel-permissions"
      role="tabpanel"
      aria-labelledby="configuration-tab-permissions"
    >
      <DepartmentPlanningPermissionPanel
        :department-tree="props.departmentTree"
        :user-id="props.userId"
        :department-permission-path="props.departmentPermissionPath"
        :owner-departments="props.ownerDepartments"
        :allowed-department-names="props.permissionDepartmentNames"
        :restrict-to-allowed-departments="props.restrictToPermissionDepartments"
        :initial-scope="props.permissionInitialScope"
        @scope-change="emit('permission-scope-change', $event)"
      />
    </section>
  </div>
</template>

<style scoped>
.configuration-page {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: #17233d;
}

.configuration-hero {
  padding: 28px 0 30px;
}

.configuration-hero h2 {
  margin: 0;
  color: #07172f;
  font-size: 42px;
  font-weight: 900;
  line-height: 1.18;
}

.configuration-hero p {
  max-width: 820px;
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.configuration-tabs {
  display: inline-flex;
  align-items: stretch;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border: 1px solid #dfe6f2;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 24px rgba(35, 52, 84, 0.05);
}

.configuration-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 168px;
  height: 54px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #7a879b;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: 160ms ease;
}

.configuration-tab:hover {
  background: #f6f8fc;
  color: #465570;
}

.configuration-tab.is-active {
  background: #eef2ff;
  color: #4054ce;
  box-shadow: inset 0 0 0 1px #d6dcff;
}

.configuration-tab__icon {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #f0f2f6;
  color: #7d899b;
  font-size: 10px;
  font-weight: 900;
}

.configuration-tab.is-active .configuration-tab__icon {
  background: #5063d8;
  color: #ffffff;
}

.configuration-tab > span:last-child {
  display: grid;
  gap: 2px;
}

.configuration-tab strong {
  font-size: 13px;
  font-weight: 900;
}

.configuration-tab small {
  color: #99a3b3;
  font-size: 10px;
}

@media (max-width: 820px) {
  .configuration-tabs,
  .configuration-tabs.has-permission-tab {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    box-sizing: border-box;
  }

  .configuration-tab {
    min-width: 0;
    padding: 0 10px;
  }

  .configuration-hero {
    padding: 26px 8px;
  }

  .configuration-hero h2 {
    font-size: 32px;
  }
}
.configuration-page {
  display: flex;
  flex-direction: column;
}

.configuration-tabs {
  flex-shrink: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .configuration-page > section {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  .configuration-page > section > :deep(*) {
    flex: 1;
    min-height: 0;
  }
}
</style>

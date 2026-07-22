<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import ActivityManagementPanel from '../../components/skill/ActivityManagementPanel.vue';
import DepartmentPlanningPermissionPanel from '../../components/skill/DepartmentPlanningPermissionPanel.vue';
import SceneSettingsPanel from '../../components/skill/SceneSettingsPanel.vue';

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
    departmentTree?: DepartmentTreeNode[];
    userId?: string;
    isSuperAdmin?: boolean;
    canConfigureDepartmentPermissions?: boolean;
    departmentPermissionPath?: string[];
    permissionDepartmentNames?: string[];
    restrictToPermissionDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    isSuperAdmin: false,
    canConfigureDepartmentPermissions: false,
    departmentPermissionPath: () => [],
    permissionDepartmentNames: () => [],
    restrictToPermissionDepartments: true,
  },
);

const activeConfigurationTab = ref<ConfigurationTab>('scenes');
const configurationTabs = computed(() => {
  const tabs: Array<{
    key: ConfigurationTab;
    label: string;
    description: string;
  }> = [
    { key: 'scenes', label: '场景管理', description: '管理分类体系' },
    { key: 'activities', label: '活动管理', description: '管理活动体系' },
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
</script>

<template>
  <div class="configuration-page">
    <header class="configuration-hero">
      <h2>配置管理</h2>
      <p>
        集中维护各项 Harness
        规划能力共用的场景、活动体系及部门人员权限，保存后自动同步至相关规划页面。
      </p>
    </header>

    <nav
      class="configuration-tabs"
      :class="{ 'has-permission-tab': props.canConfigureDepartmentPermissions }"
      role="tablist"
      aria-label="配置管理分区"
    >
      <button
        v-for="(tab, index) in configurationTabs"
        :id="`configuration-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        class="configuration-tab"
        role="tab"
        :class="{ 'is-active': activeConfigurationTab === tab.key }"
        :aria-selected="activeConfigurationTab === tab.key"
        :aria-controls="`configuration-panel-${tab.key}`"
        @click="activeConfigurationTab = tab.key"
      >
        <span class="configuration-tab__icon" aria-hidden="true">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span>
          <strong>{{ tab.label }}</strong>
          <small>{{ tab.description }}</small>
        </span>
      </button>
    </nav>

    <section
      v-if="activeConfigurationTab === 'scenes'"
      id="configuration-panel-scenes"
      role="tabpanel"
      aria-labelledby="configuration-tab-scenes"
    >
      <SceneSettingsPanel
        :department-tree="props.departmentTree"
        :user-id="props.userId"
        :is-super-admin="props.isSuperAdmin"
        :department-permission-path="props.departmentPermissionPath"
        :allowed-department-names="props.permissionDepartmentNames"
        :restrict-to-allowed-departments="props.restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else-if="activeConfigurationTab === 'activities'"
      id="configuration-panel-activities"
      role="tabpanel"
      aria-labelledby="configuration-tab-activities"
    >
      <ActivityManagementPanel
        :department-tree="props.departmentTree"
        :user-id="props.userId"
        :is-super-admin="props.isSuperAdmin"
        :department-permission-path="props.departmentPermissionPath"
        :allowed-department-names="props.permissionDepartmentNames"
        :restrict-to-allowed-departments="props.restrictToPermissionDepartments"
      />
    </section>

    <section
      v-else-if="props.canConfigureDepartmentPermissions"
      id="configuration-panel-permissions"
      role="tabpanel"
      aria-labelledby="configuration-tab-permissions"
    >
      <DepartmentPlanningPermissionPanel
        :department-tree="props.departmentTree"
        :user-id="props.userId"
        :department-permission-path="props.departmentPermissionPath"
        :allowed-department-names="props.permissionDepartmentNames"
        :restrict-to-allowed-departments="props.restrictToPermissionDepartments"
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
</style>

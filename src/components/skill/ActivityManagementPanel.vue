<script setup lang="ts">
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
import type { HarnessAuthorizedDepartment } from '../../services/skillMarket/harnessDepartmentPermission';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';
import DepartmentTaxonomyPanel from './DepartmentTaxonomyPanel.vue';

interface DepartmentTreeNode {
  id?: string;
  deptCode?: string;
  name: string;
  children?: DepartmentTreeNode[];
}

withDefaults(
  defineProps<{
    departmentTree?: DepartmentTreeNode[];
    userId?: string;
    departmentPermissionPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
    manageableDepartments?: HarnessAuthorizedDepartment[];
    departmentPermissionsLoading?: boolean;
    departmentPermissionsError?: string;
    initialScope?: HarnessScopeSnapshot;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    departmentPermissionPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
    manageableDepartments: () => [],
    departmentPermissionsLoading: false,
    departmentPermissionsError: '',
    initialScope: undefined,
  },
);

defineEmits<{
  changed: [groups: SkillPlanningOptionGroup[], departmentName: string];
  'scope-change': [snapshot: HarnessScopeSnapshot];
}>();
</script>

<template>
  <DepartmentTaxonomyPanel
    kind="activity"
    :department-tree="departmentTree"
    :user-id="userId"
    :department-permission-path="departmentPermissionPath"
    :allowed-department-names="allowedDepartmentNames"
    :allowed-department-paths="allowedDepartmentPaths"
    :restrict-to-allowed-departments="restrictToAllowedDepartments"
    :manageable-departments="manageableDepartments"
    :department-permissions-loading="departmentPermissionsLoading"
    :department-permissions-error="departmentPermissionsError"
    @changed="(groups, departmentName) => $emit('changed', groups, departmentName)"
    :initial-scope="initialScope"
    @scope-change="$emit('scope-change', $event)"
  />
</template>

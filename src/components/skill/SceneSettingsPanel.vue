<script setup lang="ts">
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
import type { HarnessAuthorizedDepartment } from '../../services/skillMarket/harnessDepartmentPermission';
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
    manageableDepartments?: HarnessAuthorizedDepartment[];
    restrictToAllowedDepartments?: boolean;
    departmentPermissionsLoading?: boolean;
    departmentPermissionsError?: string;
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
  },
);

defineEmits<{
  changed: [groups: SkillPlanningOptionGroup[], departmentName: string];
}>();
</script>

<template>
  <DepartmentTaxonomyPanel
    kind="scene"
    :department-tree="departmentTree"
    :user-id="userId"
    :department-permission-path="departmentPermissionPath"
    :allowed-department-names="allowedDepartmentNames"
    :allowed-department-paths="allowedDepartmentPaths"
    :restrict-to-allowed-departments="restrictToAllowedDepartments"
    :manageable-departments="manageableDepartments"
    @changed="(groups, departmentName) => $emit('changed', groups, departmentName)"
    :department-permissions-loading="departmentPermissionsLoading"
    :department-permissions-error="departmentPermissionsError"
  />
</template>

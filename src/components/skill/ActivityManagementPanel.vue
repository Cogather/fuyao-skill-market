<script setup lang="ts">
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
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
    isSuperAdmin?: boolean;
    departmentPermissionPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    isSuperAdmin: false,
    departmentPermissionPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
  },
);

defineEmits<{
  changed: [groups: SkillPlanningOptionGroup[], departmentName: string];
}>();
</script>

<template>
  <DepartmentTaxonomyPanel
    kind="activity"
    :department-tree="departmentTree"
    :user-id="userId"
    :is-super-admin="isSuperAdmin"
    :department-permission-path="departmentPermissionPath"
    :allowed-department-names="allowedDepartmentNames"
    :allowed-department-paths="allowedDepartmentPaths"
    :restrict-to-allowed-departments="restrictToAllowedDepartments"
    @changed="(groups, departmentName) => $emit('changed', groups, departmentName)"
  />
</template>

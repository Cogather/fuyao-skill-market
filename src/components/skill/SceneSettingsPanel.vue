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
    allowedDepartmentNames?: string[];
    restrictToAllowedDepartments?: boolean;
  }>(),
  {
    departmentTree: () => [],
    userId: '',
    isSuperAdmin: false,
    allowedDepartmentNames: () => [],
    restrictToAllowedDepartments: false,
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
    :is-super-admin="isSuperAdmin"
    :allowed-department-names="allowedDepartmentNames"
    :restrict-to-allowed-departments="restrictToAllowedDepartments"
    @changed="(groups, departmentName) => $emit('changed', groups, departmentName)"
  />
</template>

<script setup lang="ts">
import type { SkillPlanningOptionGroup } from '../../services/skillMarket/skillPlanningShared';
import DepartmentTaxonomyPanel from './DepartmentTaxonomyPanel.vue';

interface DepartmentTreeNode {
  name: string;
  children?: DepartmentTreeNode[];
}

withDefaults(
  defineProps<{
    departmentTree?: DepartmentTreeNode[];
    allowedDepartmentNames?: string[];
  }>(),
  {
    departmentTree: () => [],
    allowedDepartmentNames: () => [],
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
    :allowed-department-names="allowedDepartmentNames"
    @changed="(groups, departmentName) => $emit('changed', groups, departmentName)"
  />
</template>

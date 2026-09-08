<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Department } from '../../composables/useHarnessScenarioWorkspace';
import MarketDeptCascader, { type MarketDeptCascaderNode } from './MarketDeptCascader.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    departments: Department[];
    disabled?: boolean;
    active?: boolean;
  }>(),
  { active: true },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const selectionError = ref('');

// Authorized departments may omit their ancestors; retain those paths for navigation.
const tree = computed(() => {
  const roots: MarketDeptCascaderNode[] = [];
  for (const department of props.departments) {
    let siblings = roots;
    for (const name of department.path) {
      let node = siblings.find((item) => item.name === name);
      if (!node) {
        node = { name, children: [] };
        siblings.push(node);
      }
      siblings = node.children!;
    }
  }
  return roots;
});

function departmentForPath(path: string[]) {
  return props.departments.find(
    (department) =>
      department.path.length === path.length &&
      department.path.every((name, index) => name === path[index]),
  );
}

const selectedPath = computed({
  get: () =>
    props.departments.find((department) => department._id === props.modelValue)?.path ?? [],
  set: (path: string[]) => {
    const department = departmentForPath(path);
    if (path.length && !department) {
      return;
    }
    selectionError.value = '';
    emit('update:modelValue', department?._id ?? '');
  },
});

function beforeDone(path: string[]) {
  const allowed = !path.length || Boolean(departmentForPath(path));
  selectionError.value = allowed ? '' : '请选择有管理权限的部门';
  return allowed;
}

watch(
  () => props.modelValue,
  () => {
    selectionError.value = '';
  },
);
</script>

<template>
  <div class="harness-department-picker">
    <MarketDeptCascader
      v-if="active"
      v-model="selectedPath"
      :tree="tree"
      :disabled="disabled"
      :before-done="beforeDone"
      all-label="选部门…"
      aria-label="选择部门"
      selection-mode="confirm"
      match-trigger-width
      searchable
    />
    <p v-if="selectionError" class="department-selection-error" role="alert">
      {{ selectionError }}
    </p>
  </div>
</template>

<style scoped>
.harness-department-picker :deep(.market-dept-cascader-trigger) {
  height: 38px;
  min-height: 38px;
  padding: 0 30px 0 11px;
  border-color: #cfdaea;
  border-radius: 6px;
  background: #fff;
  color: #233552;
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}
.department-selection-error {
  margin: 6px 0 0;
  color: #b91c1c;
  font-size: 12px;
}
</style>

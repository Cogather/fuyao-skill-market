<script setup lang="ts">
import HarnessSelect from './HarnessSelect.vue';
import { ref } from 'vue';
import MarketDeptCascader, { type MarketDeptCascaderNode } from './MarketDeptCascader.vue';
import type { ProductPlanningOption } from '../../services/skillMarket/skillPlanningShared';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';

const props = withDefaults(
  defineProps<{
    level: string;
    departmentPath: string[];
    departmentTree: MarketDeptCascaderNode[];
    productName: string;
    products: ProductPlanningOption[];
    productsLoading: boolean;
    disabled?: boolean;
    permissionPath?: string[];
    allowedDepartmentPaths?: string[][];
    beforeDepartmentDone?: (path: string[]) => boolean;
    scopeLabel?: string;
    departmentAriaLabel?: string;
  }>(),
  {
    disabled: false,
    permissionPath: () => [],
    allowedDepartmentPaths: () => [],
    scopeLabel: '新增资产归属',
    departmentAriaLabel: '新增资产部门',
  },
);

const emit = defineEmits<{
  'level-change': [level: HarnessScopeSnapshot['level']];
  'department-change': [path: string[]];
  'product-change': [name: string];
}>();
const departmentError = ref('');
const productSelectRef = ref<{ element: HTMLButtonElement | null } | null>(null);

function confirmDepartment(path: string[]): boolean {
  const allowedPaths = props.allowedDepartmentPaths.length
    ? props.allowedDepartmentPaths
    : props.permissionPath.length
      ? [props.permissionPath]
      : [];
  if (
    allowedPaths.length &&
    !allowedPaths.some(
      (allowed) =>
        allowed.length <= path.length && allowed.every((segment, index) => path[index] === segment),
    )
  ) {
    departmentError.value = '请选择有权限的部门或其下级部门';
    return false;
  }
  departmentError.value = '';
  return props.beforeDepartmentDone?.(path) ?? true;
}
</script>

<template>
  <fieldset class="catalog-create-scope" :disabled="props.disabled" :aria-label="props.scopeLabel">
    <label>
      <span>层级 <em>*</em></span>
      <HarnessSelect
        aria-label="层级"
        :model-value="props.level"
        :disabled="props.disabled"
        @change="emit('level-change', $event as HarnessScopeSnapshot['level'])"
        :searchable="false"
        :options="[
          { value: '产品级', label: '产品级' },
          { value: '部门级', label: '部门级' },
        ]"
      />
    </label>
    <div class="catalog-create-scope__department">
      <span>{{ props.level === '产品级' ? '产品所属部门' : '归属部门' }} <em>*</em></span>
      <MarketDeptCascader
        :model-value="props.departmentPath"
        :tree="props.departmentTree"
        :disabled="props.disabled"
        :max-level="6"
        all-label="请选择部门"
        :aria-label="props.departmentAriaLabel"
        selection-mode="confirm"
        permission-mode="review-center"
        :permission-path="props.allowedDepartmentPaths.length ? [] : props.permissionPath"
        :allowed-paths="props.allowedDepartmentPaths"
        :before-done="confirmDepartment"
        match-trigger-width
        :panel-right-anchor="props.level === '产品级' ? productSelectRef?.element : null"
        searchable
        @clear="emit('department-change', $event)"
        @done="emit('department-change', $event)"
      />
    </div>
    <label v-if="props.level === '产品级'">
      <span>产品 <em>*</em></span>
      <HarnessSelect
        ref="productSelectRef"
        aria-label="产品"
        :model-value="props.productName"
        :disabled="props.disabled || props.productsLoading || !props.departmentPath.length"
        @change="emit('product-change', $event)"
        :options="[
          { value: '', label: props.productsLoading ? '产品加载中...' : '请选择产品' },
          ...props.products.map((product) => ({
            value: product.offeringName,
            label: product.offeringName,
          })),
        ]"
      />
    </label>
    <p v-if="departmentError" class="catalog-create-scope__error" role="alert">
      {{ departmentError }}
    </p>
  </fieldset>
</template>

<style scoped>
.catalog-create-scope {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) minmax(140px, 0.6fr);
  flex: 0 0 auto;
  gap: 12px;
  min-width: 0;
  margin: 14px 0;
  padding: 14px;
  border: 1px solid #dbe3f3;
  border-radius: 10px;
  background: #f7f9ff;
}

.catalog-create-scope > label,
.catalog-create-scope__department {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 7px;
}

.catalog-create-scope__department {
  grid-column: 2 / -1;
}

.catalog-create-scope:has(> label:nth-child(3)) .catalog-create-scope__department {
  grid-column: auto;
}

.catalog-create-scope span {
  color: #5b6882;
  font-size: 11px;
  font-weight: 700;
}

.catalog-create-scope em {
  color: #e05b67;
  font-style: normal;
}

.catalog-create-scope__error {
  grid-column: 1 / -1;
  margin: 0;
  color: #c64a54;
  font-size: 11px;
}

.catalog-create-scope :is(select, .harness-select) {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #d5dff0;
  border-radius: 7px;
  background: #fff;
  color: #354463;
  font-size: 12px;
}

.catalog-create-scope :deep(.market-dept-cascader) {
  min-width: 0;
}

.catalog-create-scope :deep(.market-dept-cascader-trigger) {
  height: 36px;
  min-height: 36px;
}

@media (max-width: 640px) {
  .catalog-create-scope {
    grid-template-columns: 1fr;
  }

  .catalog-create-scope__department {
    grid-column: auto;
  }
}
</style>

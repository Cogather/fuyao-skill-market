<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { BusinessDimensionDto } from '../../services/skillMarket/apiTypes';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

type BusinessDimensionSelection = {
  category: string;
  dimensionId: string;
  dimensionName: string;
  categoryId: string;
  categoryName: string;
  level: 0 | 1 | 2;
};

const mockStamp = '2026-06-16 00:00:00';

function mockDimension(
  categoryId: string,
  categoryName: string,
  children: BusinessDimensionDto[] = [],
): BusinessDimensionDto {
  return {
    categoryId,
    categoryName,
    sortNo: 0,
    enabled: 1,
    createdAt: mockStamp,
    updatedAt: mockStamp,
    children,
  };
}

function createMockBusinessDimensions(): BusinessDimensionDto[] {
  return [
    mockDimension('SYSTEM_DESIGN', '系统设计', [
      mockDimension('SYSTEM_DESIGN_REQUIREMENT', '需求分析'),
      mockDimension('SYSTEM_DESIGN_ARCHITECTURE', '架构设计'),
      mockDimension('SYSTEM_DESIGN_INTERFACE', '接口设计'),
      mockDimension('SYSTEM_DESIGN_REVIEW', '设计评审'),
    ]),
    mockDimension('DEVELOPMENT', '开发实现', [
      mockDimension('DEVELOPMENT_CODE_REVIEW', '代码评审'),
      mockDimension('DEVELOPMENT_API', '接口开发'),
      mockDimension('DEVELOPMENT_CICD', 'CI/CD'),
      mockDimension('DEVELOPMENT_REFACTOR', '代码重构'),
      mockDimension('DEVELOPMENT_DEBUG', '问题定位'),
    ]),
    mockDimension('TEST_VERIFICATION', '测试验证', [
      mockDimension('TEST_VERIFICATION_CASE', '用例生成'),
      mockDimension('TEST_VERIFICATION_AUTOMATION', '自动化测试'),
      mockDimension('TEST_VERIFICATION_REGRESSION', '回归分析'),
      mockDimension('TEST_VERIFICATION_DEFECT', '缺陷归因'),
    ]),
    mockDimension('OPS_OPERATION', '运维运营', [
      mockDimension('OPS_OPERATION_LOG', '日志分析'),
      mockDimension('OPS_OPERATION_ALERT', '告警处理'),
      mockDimension('OPS_OPERATION_MONITOR', '监控巡检'),
      mockDimension('OPS_OPERATION_INCIDENT', '故障复盘'),
    ]),
  ];
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    dimensionLabel?: string;
    categoryLabel?: string;
    firstSelectId?: string;
    secondSelectId?: string;
    ariaLabelPrefix?: string;
    defaultDimensionName?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: '',
    dimensionLabel: '',
    categoryLabel: '',
    firstSelectId: undefined,
    secondSelectId: undefined,
    ariaLabelPrefix: '业务维度',
    defaultDimensionName: '公共',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:dimensionLabel': [value: string];
  'update:categoryLabel': [value: string];
  change: [selection: BusinessDimensionSelection];
}>();

const businessDimensions = ref<BusinessDimensionDto[]>([]);
const businessDimensionLoading = ref(false);
const selectedBusinessDimension = ref('');
const selectedBusinessCategory = ref('');
const rootRef = ref<HTMLElement | null>(null);
const openPanel = ref<'dimension' | 'category' | ''>('');

const businessDimensionOptions = computed(() => [...businessDimensions.value]);

const selectedBusinessDimensionItem = computed(
  () =>
    businessDimensionOptions.value.find(
      (item) => item.categoryName === selectedBusinessDimension.value,
    ) ?? null,
);

function businessDimensionChildren(
  dimension: BusinessDimensionDto | null | undefined,
): BusinessDimensionDto[] {
  return [...(dimension?.children ?? [])];
}

const selectedBusinessCategoryOptions = computed(() =>
  businessDimensionChildren(selectedBusinessDimensionItem.value),
);

const selectedBusinessCategoryItem = computed(
  () =>
    selectedBusinessCategoryOptions.value.find(
      (item) => String(item.categoryId) === selectedBusinessCategory.value,
    ) ?? null,
);

const selectedBusinessCategoryParam = computed(() => {
  if (selectedBusinessCategory.value) {
    return selectedBusinessCategory.value;
  }
  const dimensionId = selectedBusinessDimensionItem.value?.categoryId;
  return dimensionId !== undefined && dimensionId !== null ? String(dimensionId) : '';
});

const selectedBusinessCategoryLabel = computed(
  () => selectedBusinessCategoryItem.value?.categoryName ?? '',
);

const dimensionTriggerText = computed(() => {
  if (selectedBusinessDimension.value) {
    return selectedBusinessDimension.value;
  }
  if (businessDimensionLoading.value) {
    return '加载中...';
  }
  return businessDimensionOptions.value.length > 0 ? '请选择一级' : '暂无业务维度';
});

const categoryTriggerText = computed(() => {
  if (selectedBusinessCategoryLabel.value) {
    return selectedBusinessCategoryLabel.value;
  }
  if (!selectedBusinessDimensionItem.value) {
    return '请先选择一级';
  }
  return selectedBusinessCategoryOptions.value.length > 0 ? '请选择二级' : '暂无二级维度';
});

const categoryDisabled = computed(
  () => disabledOrLoading.value || selectedBusinessCategoryOptions.value.length === 0,
);

const disabledOrLoading = computed(
  () =>
    props.disabled || businessDimensionLoading.value || businessDimensionOptions.value.length === 0,
);

function emitSelection(emitChange: boolean): void {
  const dimension = selectedBusinessDimensionItem.value;
  const category = selectedBusinessCategoryItem.value;
  const selection: BusinessDimensionSelection = {
    category: selectedBusinessCategoryParam.value,
    dimensionId:
      dimension?.categoryId !== undefined && dimension.categoryId !== null
        ? String(dimension.categoryId)
        : '',
    dimensionName: dimension?.categoryName ?? '',
    categoryId:
      category?.categoryId !== undefined && category.categoryId !== null
        ? String(category.categoryId)
        : '',
    categoryName: category?.categoryName ?? '',
    level: category ? 2 : dimension ? 1 : 0,
  };

  emit('update:modelValue', selection.category);
  emit('update:dimensionLabel', selection.dimensionName);
  emit('update:categoryLabel', selection.categoryName);

  if (emitChange) {
    emit('change', selection);
  }
}

function syncSelectedBusinessDimension(): void {
  const options = businessDimensionOptions.value;
  const modelValue = String(props.modelValue ?? '').trim();

  if (options.length === 0 || !modelValue) {
    selectedBusinessDimension.value = '';
    selectedBusinessCategory.value = '';
    return;
  }

  for (const dimension of options) {
    if (String(dimension.categoryId) === modelValue) {
      selectedBusinessDimension.value = dimension.categoryName ?? '';
      selectedBusinessCategory.value = '';
      return;
    }

    const child = businessDimensionChildren(dimension).find(
      (item) => String(item.categoryId) === modelValue,
    );
    if (child) {
      selectedBusinessDimension.value = dimension.categoryName ?? '';
      selectedBusinessCategory.value = String(child.categoryId);
      return;
    }
  }

  selectedBusinessDimension.value = '';
  selectedBusinessCategory.value = '';
}

async function loadBusinessDimensions(): Promise<void> {
  if (businessDimensionLoading.value || businessDimensions.value.length > 0) {
    syncSelectedBusinessDimension();
    emitSelection(false);
    return;
  }

  businessDimensionLoading.value = true;
  try {
    const env = await skillBaseService.queryBusinessDimensions({ format: 'tree' });
    if (env?.meta?.success && Array.isArray(env?.data) && env.data.length > 0) {
      businessDimensions.value = env.data;
    } else {
      businessDimensions.value = createMockBusinessDimensions();
    }
  } catch {
    businessDimensions.value = createMockBusinessDimensions();
  } finally {
    businessDimensionLoading.value = false;
    syncSelectedBusinessDimension();
    emitSelection(false);
  }
}

function closePanels(): void {
  openPanel.value = '';
}

function toggleDimensionPanel(): void {
  if (disabledOrLoading.value) {
    return;
  }
  openPanel.value = openPanel.value === 'dimension' ? '' : 'dimension';
}

function toggleCategoryPanel(): void {
  if (categoryDisabled.value) {
    return;
  }
  openPanel.value = openPanel.value === 'category' ? '' : 'category';
}

function selectBusinessDimension(dimension: BusinessDimensionDto): void {
  selectedBusinessDimension.value = dimension.categoryName ?? '';
  selectedBusinessCategory.value = '';
  closePanels();
  emitSelection(true);
}

function clearBusinessDimension(): void {
  selectedBusinessDimension.value = '';
  selectedBusinessCategory.value = '';
  closePanels();
  emitSelection(true);
}

function selectBusinessCategory(category: BusinessDimensionDto): void {
  selectedBusinessCategory.value = String(category.categoryId);
  closePanels();
  emitSelection(true);
}

function clearBusinessCategory(): void {
  selectedBusinessCategory.value = '';
  closePanels();
  emitSelection(true);
}

function handleDocumentMouseDown(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (!rootRef.value?.contains(target)) {
    closePanels();
  }
}

watch(selectedBusinessCategoryOptions, (options) => {
  if (!selectedBusinessCategory.value) {
    return;
  }
  if (!options.some((item) => String(item.categoryId) === selectedBusinessCategory.value)) {
    selectedBusinessCategory.value = '';
    emitSelection(false);
  }
});

watch(
  () => props.modelValue,
  (value) => {
    if (String(value ?? '') === selectedBusinessCategoryParam.value) {
      return;
    }
    syncSelectedBusinessDimension();
    emitSelection(false);
  },
);

onMounted(() => {
  void loadBusinessDimensions();
  document.addEventListener('mousedown', handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
});
</script>

<template>
  <div ref="rootRef" class="business-dimension-cascader">
    <div class="business-dimension-cascader__group">
      <div
        class="business-dimension-cascader__control"
        :class="{ 'has-clear': selectedBusinessDimension }"
      >
        <button
          :id="firstSelectId"
          type="button"
          class="business-dimension-cascader__select business-dimension-cascader__trigger"
          :class="{ 'is-empty': !selectedBusinessDimension }"
          :disabled="disabledOrLoading"
          :aria-label="`${ariaLabelPrefix}一级`"
          :aria-expanded="openPanel === 'dimension'"
          @click="toggleDimensionPanel"
        >
          <span>{{ dimensionTriggerText }}</span>
          <span class="business-dimension-cascader__caret" aria-hidden="true"></span>
        </button>
        <button
          v-if="selectedBusinessDimension"
          type="button"
          class="business-dimension-cascader__clear"
          :aria-label="`清空${ariaLabelPrefix}一级`"
          :title="`清空${ariaLabelPrefix}一级`"
          :disabled="disabled"
          @click.stop.prevent="clearBusinessDimension"
        >
          ×
        </button>
        <div
          v-if="openPanel === 'dimension'"
          class="business-dimension-cascader__menu"
          role="listbox"
          :aria-label="`${ariaLabelPrefix}一级选项`"
        >
          <button
            v-for="dimension in businessDimensionOptions"
            :key="dimension.categoryId"
            type="button"
            class="business-dimension-cascader__option"
            :class="{ 'is-selected': selectedBusinessDimension === dimension.categoryName }"
            role="option"
            :aria-selected="selectedBusinessDimension === dimension.categoryName"
            @click="selectBusinessDimension(dimension)"
          >
            {{ dimension.categoryName }}
          </button>
        </div>
      </div>

      <div
        class="business-dimension-cascader__control"
        :class="{ 'has-clear': selectedBusinessCategory }"
      >
        <button
          :id="secondSelectId"
          type="button"
          class="business-dimension-cascader__select business-dimension-cascader__trigger"
          :class="{ 'is-empty': !selectedBusinessCategory }"
          :disabled="categoryDisabled"
          :aria-label="`${ariaLabelPrefix}二级`"
          :aria-expanded="openPanel === 'category'"
          @click="toggleCategoryPanel"
        >
          <span>{{ categoryTriggerText }}</span>
          <span class="business-dimension-cascader__caret" aria-hidden="true"></span>
        </button>
        <button
          v-if="selectedBusinessCategory"
          type="button"
          class="business-dimension-cascader__clear"
          :aria-label="`清空${ariaLabelPrefix}二级`"
          :title="`清空${ariaLabelPrefix}二级`"
          :disabled="disabled"
          @click.stop.prevent="clearBusinessCategory"
        >
          ×
        </button>
        <div
          v-if="openPanel === 'category'"
          class="business-dimension-cascader__menu"
          role="listbox"
          :aria-label="`${ariaLabelPrefix}二级选项`"
        >
          <button
            v-for="category in selectedBusinessCategoryOptions"
            :key="category.categoryId"
            type="button"
            class="business-dimension-cascader__option"
            :class="{ 'is-selected': selectedBusinessCategory === String(category.categoryId) }"
            role="option"
            :aria-selected="selectedBusinessCategory === String(category.categoryId)"
            @click="selectBusinessCategory(category)"
          >
            {{ category.categoryName }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.business-dimension-cascader {
  width: 100%;
  min-width: 0;
}

.business-dimension-cascader__group {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.business-dimension-cascader__select {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  box-sizing: border-box;
  padding: 10px 34px 10px 12px;
  border: 1px solid #e9edf3;
  border-radius: 8px;
  outline: 0;
  background: #ffffff;
  color: #15171d;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.business-dimension-cascader__trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
}

.business-dimension-cascader__trigger span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.business-dimension-cascader__trigger.is-empty {
  color: #8a98ad;
}

.business-dimension-cascader__select:focus {
  border-color: rgba(47, 125, 246, 0.42);
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.1);
}

.business-dimension-cascader__select:disabled {
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}

.business-dimension-cascader__control {
  position: relative;
  min-width: 0;
}

.business-dimension-cascader__control.has-clear .business-dimension-cascader__select {
  padding-right: 62px;
}

.business-dimension-cascader__clear {
  position: absolute;
  top: 50%;
  right: 31px;
  z-index: 3;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #eef2f7;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
  font-weight: 850;
  line-height: 1;
  transform: translateY(-50%);
}

.business-dimension-cascader__clear:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1f2937;
}

.business-dimension-cascader__clear:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.business-dimension-cascader__caret {
  position: absolute;
  top: 50%;
  right: 13px;
  width: 7px;
  height: 7px;
  border-right: 1.7px solid #64748b;
  border-bottom: 1.7px solid #64748b;
  transform: translateY(-68%) rotate(45deg);
}

.business-dimension-cascader__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 80;
  display: grid;
  max-height: 260px;
  overflow: auto;
  padding: 6px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
}

.business-dimension-cascader__option {
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #253857;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.business-dimension-cascader__option:hover,
.business-dimension-cascader__option.is-selected {
  background: #eff6ff;
  color: #1d4ed8;
}

@media (max-width: 760px) {
  .business-dimension-cascader__group {
    grid-template-columns: 1fr;
  }
}
</style>

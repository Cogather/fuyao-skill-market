<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import type { BusinessDimensionDto } from '../../services/skillMarket/apiTypes';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

type BusinessDimensionOption = {
  id: string;
  name: string;
  children: BusinessDimensionOption[];
};

type BusinessDimensionSelection = {
  category: string;
  dimensionId: string;
  dimensionName: string;
  categoryId: string;
  categoryName: string;
  level: 0 | 1 | 2;
};

type RawBusinessDimension = BusinessDimensionDto & {
  id?: string | number;
  dimensionName?: string;
};

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

const dimensions = ref<BusinessDimensionOption[]>([]);
const loading = ref(false);
const selectedDimensionId = ref('');
const selectedCategoryId = ref('');

const selectedDimension = computed(
  () => dimensions.value.find((dimension) => dimension.id === selectedDimensionId.value) ?? null,
);

const selectedCategoryOptions = computed(() => selectedDimension.value?.children ?? []);

const selectedCategory = computed(
  () =>
    selectedCategoryOptions.value.find((category) => category.id === selectedCategoryId.value) ??
    null,
);

function normalizeDimension(item: BusinessDimensionDto): BusinessDimensionOption | null {
  const raw = item as RawBusinessDimension;
  const rawId = raw.categoryId ?? raw.id;
  const id = rawId === undefined || rawId === null ? '' : String(rawId).trim();
  const name = String(raw.categoryName ?? raw.dimensionName ?? raw.name ?? '').trim();

  if (!id || !name) {
    return null;
  }

  const children = Array.isArray(raw.children)
    ? raw.children
        .map(normalizeDimension)
        .filter((child): child is BusinessDimensionOption => Boolean(child))
    : [];

  return {
    id,
    name,
    children,
  };
}

function readDimensionRows(raw: unknown): BusinessDimensionDto[] {
  if (Array.isArray(raw)) {
    return raw as BusinessDimensionDto[];
  }

  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.list)) {
    return record.list as BusinessDimensionDto[];
  }
  if (Array.isArray(record.records)) {
    return record.records as BusinessDimensionDto[];
  }

  return [];
}

function serviceSucceeded(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const meta = record.meta as Record<string, unknown> | undefined;
  if (typeof meta?.success === 'boolean') {
    return meta.success;
  }
  if (record.success === false) {
    return false;
  }
  const code = record.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

function currentSelection(): BusinessDimensionSelection {
  const dimension = selectedDimension.value;
  const category = selectedCategory.value;

  return {
    category: category?.id ?? dimension?.id ?? '',
    dimensionId: dimension?.id ?? '',
    dimensionName: dimension?.name ?? '',
    categoryId: category?.id ?? '',
    categoryName: category?.name ?? '',
    level: category ? 2 : dimension ? 1 : 0,
  };
}

function emitSelection(emitChange: boolean): void {
  const selection = currentSelection();
  emit('update:modelValue', selection.category);
  emit('update:dimensionLabel', selection.dimensionName);
  emit('update:categoryLabel', selection.categoryName);

  if (emitChange) {
    emit('change', selection);
  }
}

function findByCategory(category: string): { dimensionId: string; categoryId: string } | null {
  const target = category.trim();
  if (!target) {
    return null;
  }

  for (const dimension of dimensions.value) {
    if (dimension.id === target) {
      return { dimensionId: dimension.id, categoryId: '' };
    }

    const child = dimension.children.find((item) => item.id === target);
    if (child) {
      return { dimensionId: dimension.id, categoryId: child.id };
    }
  }

  return null;
}

function selectDefaultDimension(): void {
  const fallback =
    dimensions.value.find((item) => item.name === props.defaultDimensionName) ??
    dimensions.value[0] ??
    null;

  selectedDimensionId.value = fallback?.id ?? '';
  selectedCategoryId.value = '';
}

function syncFromModelValue(): void {
  const matched = findByCategory(String(props.modelValue ?? ''));
  if (matched) {
    selectedDimensionId.value = matched.dimensionId;
    selectedCategoryId.value = matched.categoryId;
    return;
  }

  if (
    !selectedDimensionId.value ||
    !dimensions.value.some((item) => item.id === selectedDimensionId.value)
  ) {
    selectDefaultDimension();
  }
}

async function loadBusinessDimensions(): Promise<void> {
  if (loading.value || dimensions.value.length > 0) {
    syncFromModelValue();
    emitSelection(false);
    return;
  }

  loading.value = true;
  try {
    const env = await skillBaseService.queryBusinessDimensions({ format: 'tree' });
    if (serviceSucceeded(env)) {
      dimensions.value = readDimensionRows((env as Record<string, unknown>).data)
        .map(normalizeDimension)
        .filter((item): item is BusinessDimensionOption => Boolean(item));
    }
  } finally {
    loading.value = false;
    syncFromModelValue();
    emitSelection(false);
  }
}

function onDimensionChange(): void {
  selectedCategoryId.value = '';
  emitSelection(true);
}

function onCategoryChange(): void {
  emitSelection(true);
}

function clearCategory(): void {
  selectedCategoryId.value = '';
  emitSelection(true);
}

watch(
  () => props.modelValue,
  (value) => {
    const current = currentSelection().category;
    if (String(value ?? '') === current) {
      return;
    }
    syncFromModelValue();
    emitSelection(false);
  },
);

onMounted(() => {
  void loadBusinessDimensions();
});
</script>

<template>
  <div class="business-dimension-cascader">
    <div class="business-dimension-cascader__group">
      <select
        :id="firstSelectId"
        v-model="selectedDimensionId"
        class="business-dimension-cascader__select"
        :disabled="disabled || loading || dimensions.length === 0"
        :aria-label="`${ariaLabelPrefix}一级`"
        @change="onDimensionChange"
      >
        <option v-if="dimensions.length === 0" value="">
          {{ loading ? '加载中...' : '暂无业务维度' }}
        </option>
        <option v-for="dimension in dimensions" :key="dimension.id" :value="dimension.id">
          {{ dimension.name }}
        </option>
      </select>

      <div
        class="business-dimension-cascader__category"
        :class="{ 'has-clear': selectedCategoryId }"
      >
        <select
          :id="secondSelectId"
          v-model="selectedCategoryId"
          class="business-dimension-cascader__select"
          :disabled="disabled || selectedCategoryOptions.length === 0"
          :aria-label="`${ariaLabelPrefix}二级`"
          @change="onCategoryChange"
        >
          <option value=""></option>
          <option
            v-for="category in selectedCategoryOptions"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <button
          v-if="selectedCategoryId"
          type="button"
          class="business-dimension-cascader__clear"
          :aria-label="`清空${ariaLabelPrefix}二级`"
          :title="`清空${ariaLabelPrefix}二级`"
          :disabled="disabled"
          @click="clearCategory"
        >
          ×
        </button>
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
  width: 100%;
  min-width: 0;
  min-height: 42px;
  box-sizing: border-box;
  padding: 10px 12px;
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

.business-dimension-cascader__select:focus {
  border-color: rgba(47, 125, 246, 0.42);
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.1);
}

.business-dimension-cascader__select:disabled {
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}

.business-dimension-cascader__category {
  position: relative;
  min-width: 0;
}

.business-dimension-cascader__category.has-clear .business-dimension-cascader__select {
  padding-right: 58px;
}

.business-dimension-cascader__clear {
  position: absolute;
  top: 50%;
  right: 34px;
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

@media (max-width: 760px) {
  .business-dimension-cascader__group {
    grid-template-columns: 1fr;
  }
}
</style>

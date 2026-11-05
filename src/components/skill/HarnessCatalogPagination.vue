<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import HarnessSelect from './HarnessSelect.vue';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
}>();
const emit = defineEmits<{
  'page-change': [page: number];
  'page-size-change': [size: number];
}>();
const pageSizeOptions = [10, 20, 50, 100].map((value) => ({ value, label: `${value}条/页` }));
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const pageNumbers = computed(() => {
  const start = Math.max(1, Math.min(props.page - 3, totalPages.value - 6));
  return Array.from({ length: Math.min(7, totalPages.value) }, (_, index) => start + index);
});
const jumpPage = ref(String(props.page));
watch(
  () => props.page,
  (page) => {
    jumpPage.value = String(page);
  },
);

function goToPage(value: number | string): void {
  const parsed = Number(value);
  const page = Number.isFinite(parsed)
    ? Math.min(totalPages.value, Math.max(1, Math.trunc(parsed)))
    : props.page;
  jumpPage.value = String(page);
  if (!props.loading && page !== props.page) emit('page-change', page);
}
</script>

<template>
  <nav class="catalog-pagination" aria-label="资产清单分页">
    <span class="catalog-pagination__total">共 {{ total }} 条</span>
    <div class="catalog-pagination__controls">
      <HarnessSelect
        class="catalog-pagination__size"
        :model-value="pageSize"
        :options="pageSizeOptions"
        :searchable="false"
        :disabled="loading"
        aria-label="每页条数"
        @change="emit('page-size-change', $event)"
      />
      <div class="catalog-pagination__pages">
        <button
          type="button"
          aria-label="上一页"
          :disabled="loading || page <= 1"
          @click="goToPage(page - 1)"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="m10 3-5 5 5 5" />
          </svg>
        </button>
        <button
          v-for="number in pageNumbers"
          :key="number"
          type="button"
          :aria-label="`第 ${number} 页`"
          :aria-current="number === page ? 'page' : undefined"
          :disabled="loading"
          @click="goToPage(number)"
        >
          {{ number }}
        </button>
        <button
          type="button"
          aria-label="下一页"
          :disabled="loading || page >= totalPages"
          @click="goToPage(page + 1)"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="m6 3 5 5-5 5" />
          </svg>
        </button>
      </div>
      <label class="catalog-pagination__jump">
        前往
        <input
          v-model="jumpPage"
          type="number"
          min="1"
          :max="totalPages"
          :disabled="loading"
          aria-label="跳转页码"
          @change="goToPage(jumpPage)"
          @keydown.enter.prevent="goToPage(jumpPage)"
        />
        页
      </label>
    </div>
  </nav>
</template>

<style scoped>
.catalog-pagination {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-size: 13px;
}
.catalog-pagination__total,
.catalog-pagination__jump {
  white-space: nowrap;
}
.catalog-pagination__controls,
.catalog-pagination__pages,
.catalog-pagination__jump {
  display: flex;
  align-items: center;
  gap: 8px;
}
.catalog-pagination__controls {
  flex-wrap: wrap;
  min-width: 0;
}
.catalog-pagination__pages {
  flex-wrap: wrap;
  gap: 4px;
}
.catalog-pagination__size {
  flex: 0 0 112px;
  width: 112px;
  min-width: 112px;
  height: 32px;
  min-height: 32px;
}
.catalog-pagination__pages button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font: inherit;
  cursor: pointer;
}
.catalog-pagination__pages svg {
  width: 16px;
  height: 16px;
}
.catalog-pagination__pages button:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
}
.catalog-pagination__pages button[aria-current='page'] {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.catalog-pagination__pages button[aria-current='page']:hover {
  color: #fff;
}
.catalog-pagination__jump input {
  box-sizing: border-box;
  width: 52px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #374151;
  font: inherit;
  text-align: center;
  appearance: textfield;
}
.catalog-pagination__jump input::-webkit-inner-spin-button,
.catalog-pagination__jump input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}
.catalog-pagination button:disabled,
.catalog-pagination input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.catalog-pagination button:focus-visible,
.catalog-pagination input:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
</style>

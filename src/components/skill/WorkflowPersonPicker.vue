<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

import {
  querySkillPlanningUsers,
  type SkillPlanningUserOption,
} from '../../services/skillMarket/skillPlanningService';

const props = withDefaults(
  defineProps<{
    modelValue: SkillPlanningUserOption | null;
    label: string;
    placeholder?: string;
  }>(),
  { placeholder: '输入姓名或工号后选择' },
);

const emit = defineEmits<{
  'update:modelValue': [value: SkillPlanningUserOption | null];
}>();

const pickerId = `workflow-person-${useId()}`;
const listboxId = `${pickerId}-options`;
const rootRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const keyword = ref('');
const open = ref(false);
const loading = ref(false);
const options = ref<SkillPlanningUserOption[]>([]);
const error = ref('');
const activeIndex = ref(-1);
const searched = ref(false);
let composing = false;
let outsidePointerInProgress = false;
let requestSequence = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const displayValue = computed(() => {
  const selected = props.modelValue;
  return selected
    ? [selected.chName, selected.sAMAccountName || selected.id].filter(Boolean).join(' ') ||
        selected.label
    : keyword.value;
});
const activeOptionId = computed(() =>
  open.value && activeIndex.value >= 0 ? `${pickerId}-option-${activeIndex.value}` : undefined,
);
const statusMessage = computed(() => {
  if (loading.value) return '正在查询人员…';
  if (error.value) return error.value;
  if (searched.value && !options.value.length) return '暂无匹配人员';
  if (!keyword.value.trim() || composing) return '请输入姓名或工号';
  return '';
});

function invalidateSearch(): void {
  requestSequence += 1;
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  loading.value = false;
}

function closePopup(): void {
  invalidateSearch();
  open.value = false;
  activeIndex.value = -1;
}

async function searchUsers(query: string, sequence: number): Promise<void> {
  if (sequence !== requestSequence) return;
  try {
    const result = await querySkillPlanningUsers(query);
    if (sequence !== requestSequence) return;
    options.value = result;
    searched.value = true;
  } catch (cause) {
    if (sequence !== requestSequence) return;
    error.value = cause instanceof Error ? cause.message : '人员查询失败，请稍后重试';
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function scheduleSearch(delay = 250): void {
  // Invalidate at the edit, before the debounce, so older responses cannot replace this query.
  invalidateSearch();
  options.value = [];
  activeIndex.value = -1;
  error.value = '';
  searched.value = false;
  open.value = true;
  const query = keyword.value.trim();
  if (!query || composing || props.modelValue) return;
  loading.value = true;
  const sequence = requestSequence;
  if (delay === 0) {
    void searchUsers(query, sequence);
    return;
  }
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void searchUsers(query, sequence);
  }, delay);
}

function onInput(event: Event): void {
  keyword.value = (event.target as HTMLInputElement).value;
  scheduleSearch();
}

function onCompositionStart(): void {
  composing = true;
  scheduleSearch();
}

function onCompositionEnd(event: CompositionEvent): void {
  composing = false;
  onInput(event);
}

function onFocus(): void {
  if (!props.modelValue && !open.value) scheduleSearch();
}

function selectPerson(option: SkillPlanningUserOption): void {
  closePopup();
  emit('update:modelValue', option);
}

async function clearSelection(): Promise<void> {
  closePopup();
  keyword.value = '';
  options.value = [];
  error.value = '';
  searched.value = false;
  emit('update:modelValue', null);
  await nextTick();
  inputRef.value?.focus();
  onFocus();
}

function onKeydown(event: KeyboardEvent): void {
  outsidePointerInProgress = false;
  if (event.isComposing || composing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    if (!open.value) return;
    event.preventDefault();
    event.stopPropagation();
    closePopup();
    return;
  }
  if (props.modelValue) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    if (!open.value) scheduleSearch();
    if (!options.value.length) return;
    const lastIndex = options.value.length - 1;
    activeIndex.value =
      event.key === 'ArrowDown'
        ? activeIndex.value >= lastIndex
          ? 0
          : activeIndex.value + 1
        : activeIndex.value <= 0
          ? lastIndex
          : activeIndex.value - 1;
    void nextTick(() => {
      if (activeOptionId.value) {
        document.getElementById(activeOptionId.value)?.scrollIntoView({ block: 'nearest' });
      }
    });
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    const option = options.value[activeIndex.value];
    if (option) selectPerson(option);
  }
}

function onFocusOut(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && rootRef.value?.contains(event.relatedTarget)) return;
  // Keep the outside click target in place until its click handler has run.
  if (outsidePointerInProgress) return;
  closePopup();
}

function onOutsidePointerDown(event: PointerEvent): void {
  outsidePointerInProgress = event.target instanceof Node && !rootRef.value?.contains(event.target);
}

function onDocumentClick(event: MouseEvent): void {
  outsidePointerInProgress = false;
  // Internal actions can remove their button before this bubbling listener runs.
  const root = rootRef.value;
  if (root && !event.composedPath().includes(root)) closePopup();
}

watch(
  () => props.modelValue,
  () => {
    closePopup();
    keyword.value = '';
    options.value = [];
    error.value = '';
    searched.value = false;
    composing = false;
  },
  { flush: 'sync' },
);

onMounted(() => {
  document.addEventListener('pointerdown', onOutsidePointerDown, true);
  document.addEventListener('click', onDocumentClick);
});
onBeforeUnmount(() => {
  invalidateSearch();
  document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
  <div ref="rootRef" class="workflow-person-picker" @focusout="onFocusOut">
    <label :for="pickerId" class="workflow-person-picker__label">{{ label }}</label>
    <div class="workflow-person-picker__control">
      <input
        :id="pickerId"
        ref="inputRef"
        class="workflow-person-picker__input"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="open && options.length ? listboxId : undefined"
        :aria-activedescendant="activeOptionId"
        :value="displayValue"
        :placeholder="placeholder"
        :readonly="Boolean(modelValue)"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      />
      <button
        v-if="modelValue || keyword"
        class="workflow-person-picker__clear"
        type="button"
        :aria-label="`清空${label}`"
        @mousedown.prevent
        @click="clearSelection"
      >
        ×
      </button>
    </div>
    <div v-if="open" class="workflow-person-picker__popup">
      <div v-if="statusMessage" class="workflow-person-picker__status" role="status">
        <span>{{ statusMessage }}</span>
        <button
          v-if="error"
          class="workflow-person-picker__retry"
          type="button"
          @mousedown.prevent
          @click="scheduleSearch(0)"
        >
          重试
        </button>
      </div>
      <div v-if="options.length" :id="listboxId" role="listbox" :aria-label="`${label}搜索结果`">
        <button
          v-for="(option, index) in options"
          :id="`${pickerId}-option-${index}`"
          :key="`${option.sAMAccountName || option.id}-${option.label}`"
          class="workflow-person-picker__option"
          :class="{ 'is-active': activeIndex === index }"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="activeIndex === index"
          @mousedown.prevent
          @mouseenter="activeIndex = index"
          @click="selectPerson(option)"
        >
          <span class="workflow-person-picker__identity">
            <strong>{{ option.chName || option.label }}</strong>
            <small>{{ option.sAMAccountName || option.id }}</small>
          </span>
          <span class="workflow-person-picker__department">{{
            option.deptName || '暂无部门'
          }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-person-picker {
  display: grid;
  width: 100%;
  min-width: 0;
  align-content: start;
  gap: 6px;
}

.workflow-person-picker__label {
  color: #52637d;
  font-size: 12px;
  font-weight: 700;
}

.workflow-person-picker__control {
  position: relative;
  min-width: 0;
}

.workflow-person-picker .workflow-person-picker__input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 38px 0 11px;
  border: 1px solid #d7dfeb;
  border-radius: 6px;
  outline: none;
  background: #fff;
  color: #263753;
  font: inherit;
  font-size: 12px;
  text-overflow: ellipsis;
}

.workflow-person-picker__input[readonly] {
  background: #f8fbff;
  cursor: default;
}

.workflow-person-picker .workflow-person-picker__input:focus {
  border-color: #6285f5;
  box-shadow: 0 0 0 2px rgb(75 103 241 / 11%);
}

.workflow-person-picker__clear {
  position: absolute;
  top: 50%;
  right: 5px;
  display: grid;
  width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  transform: translateY(-50%);
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: #eef2f7;
  color: #64748b;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.workflow-person-picker__popup {
  box-sizing: border-box;
  max-height: 180px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  border: 1px solid #dce3ee;
  border-radius: 6px;
  background: #fff;
}

.workflow-person-picker__option {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #263753;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.workflow-person-picker__option:hover,
.workflow-person-picker__option.is-active {
  background: #eff5ff;
}

.workflow-person-picker__identity {
  display: flex;
  min-width: 0;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.workflow-person-picker__identity strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.workflow-person-picker__identity small,
.workflow-person-picker__department {
  color: #78869a;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.workflow-person-picker__department {
  max-width: 48%;
  text-align: right;
}

.workflow-person-picker__status {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 8px;
  color: #78869a;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.workflow-person-picker__retry {
  height: 26px;
  min-height: 26px;
  flex-shrink: 0;
  padding: 0 8px;
  border: 1px solid #d7dfeb;
  border-radius: 4px;
  background: #fff;
  color: #3569e8;
  font: inherit;
  cursor: pointer;
}

.workflow-person-picker__clear:hover,
.workflow-person-picker__retry:hover {
  background: #e8efff;
}

.workflow-person-picker__clear:focus-visible,
.workflow-person-picker__retry:focus-visible {
  outline: 2px solid #6285f5;
  outline-offset: 2px;
}
</style>

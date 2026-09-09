<script setup lang="ts" generic="T extends string | number = string">
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: T;
    options: { value: T; label: string; disabled?: boolean }[];
    placeholder?: string;
    disabled?: boolean;
    searchable?: boolean;
  }>(),
  { placeholder: '请选择', searchable: true },
);
const emit = defineEmits<{
  'update:modelValue': [value: T];
  change: [value: T];
}>();
const attrs = useAttrs();
const id = `harness-select-${useId()}`;
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const open = ref(false);
const query = ref('');
const activeIndex = ref(-1);
const menuStyle = ref<Record<string, string>>({});
const label = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue)?.label ?? props.placeholder,
);
const filtered = computed(() =>
  props.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const activeId = computed(() =>
  open.value && activeIndex.value >= 0 ? `${id}-${activeIndex.value}` : undefined,
);
const menuLabel = ref('选择选项');
let typed = '';
let typedAt = 0;

defineExpose({ element: trigger });

function positionMenu() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.min(
    Math.max(rect.width, props.searchable ? 240 : 144),
    window.innerWidth - 24,
  );
  const below = window.innerHeight - rect.bottom - 18;
  const above = rect.top - 18;
  const desired = Math.min(336, filtered.value.length * 38 + (props.searchable ? 62 : 12));
  const upward = below < desired && above > below;
  let zIndex = 1600;
  for (
    let ancestor: HTMLElement | null = trigger.value;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const layer = Number.parseInt(getComputedStyle(ancestor).zIndex, 10);
    if (Number.isFinite(layer)) zIndex = Math.max(zIndex, layer + 1);
  }
  menuStyle.value = {
    zIndex: String(zIndex),
    width: `${width}px`,
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    ...(upward
      ? { bottom: `${window.innerHeight - rect.top + 6}px` }
      : { top: `${rect.bottom + 6}px` }),
    maxHeight: `${Math.max(60, Math.min(336, upward ? above : below))}px`,
  };
}

function revealActive() {
  nextTick(() => {
    const option = document.getElementById(`${id}-${activeIndex.value}`);
    if (!option || !list.value) return;
    const top = option.offsetTop;
    if (top < list.value.scrollTop) list.value.scrollTop = top;
    else if (top + option.offsetHeight > list.value.scrollTop + list.value.clientHeight)
      list.value.scrollTop = top + option.offsetHeight - list.value.clientHeight;
  });
}

async function show() {
  if (props.disabled || trigger.value?.matches(':disabled')) return;
  query.value = '';
  typed = '';
  const selected = props.options.findIndex(
    (option) => option.value === props.modelValue && !option.disabled,
  );
  activeIndex.value =
    selected >= 0 ? selected : props.options.findIndex((option) => !option.disabled);
  menuLabel.value = String(
    attrs['aria-label'] || trigger.value?.labels?.[0]?.textContent?.trim() || '选择选项',
  );
  positionMenu();
  open.value = true;
  await nextTick();
  searchInput.value?.focus({ preventScroll: true });
  revealActive();
}

function close(restoreFocus = false) {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}

function choose(index: number) {
  const option = filtered.value[index];
  if (!option || option.disabled || props.disabled || trigger.value?.matches(':disabled')) return;
  close(true);
  if (option.value !== props.modelValue) {
    emit('update:modelValue', option.value);
    emit('change', option.value);
  }
}

function keydown(event: KeyboardEvent) {
  if (event.isComposing || props.disabled) return;
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === 'Tab') {
    // Search lives in a portal; restore the trigger before the browser advances focus.
    close(event.target === searchInput.value);
    return;
  }
  if (event.key === 'Enter' || (event.key === ' ' && event.target !== searchInput.value)) {
    event.preventDefault();
    if (open.value) choose(activeIndex.value);
    else void show();
    return;
  }
  const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (navigation.includes(event.key)) {
    if (event.target === searchInput.value && ['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open.value) {
      void show();
      return;
    }
    const enabled = filtered.value
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (!enabled.length) return;
    const current = enabled.indexOf(activeIndex.value);
    if (event.key === 'Home') activeIndex.value = enabled[0]!;
    else if (event.key === 'End') activeIndex.value = enabled[enabled.length - 1]!;
    else
      activeIndex.value =
        enabled[
          Math.max(0, Math.min(enabled.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
        ]!;
    revealActive();
  } else if (
    event.target !== searchInput.value &&
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    if (!open.value) void show();
    if (props.searchable) {
      query.value = event.key;
      return;
    }
    typed = Date.now() - typedAt > 800 ? event.key : typed + event.key;
    typedAt = Date.now();
    const index = filtered.value.findIndex(
      (option) =>
        !option.disabled && option.label.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()),
    );
    if (index >= 0) {
      activeIndex.value = index;
      revealActive();
    }
  }
}

function outside(event: Event) {
  if (!(event.target instanceof Node)) return;
  if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) close();
}

function scrolled(event: Event) {
  if (event.target instanceof Node && panel.value?.contains(event.target)) return;
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
    close();
    return;
  }
  for (let ancestor = trigger.value?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowY)) continue;
    const bounds = ancestor.getBoundingClientRect();
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) {
      close();
      return;
    }
  }
  positionMenu();
}

function removeListeners() {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('focusin', outside);
  window.removeEventListener('scroll', scrolled, true);
  window.removeEventListener('resize', positionMenu);
}
watch(
  open,
  (value) => {
    removeListeners();
    if (!value) return;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', positionMenu);
  },
  { flush: 'sync' },
);
watch(
  query,
  () => {
    activeIndex.value = filtered.value.findIndex((option) => !option.disabled);
    if (list.value) list.value.scrollTop = 0;
  },
  { flush: 'sync' },
);
watch(
  () => props.options,
  () => {
    if (!open.value) return;
    activeIndex.value = filtered.value.findIndex(
      (option) => !option.disabled && option.value === props.modelValue,
    );
    if (activeIndex.value < 0)
      activeIndex.value = filtered.value.findIndex((option) => !option.disabled);
    positionMenu();
  },
);
watch(
  () => props.disabled,
  (value) => {
    if (value) close();
  },
);
onBeforeUnmount(removeListeners);
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="harness-select"
    role="combobox"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? id : undefined"
    :aria-activedescendant="activeId"
    :disabled="disabled"
    :data-value="modelValue"
    :title="label"
    @click="open ? close() : show()"
    @keydown="keydown"
  >
    <span class="harness-select__value">{{ label }}</span>
    <svg
      class="harness-select__chevron"
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path d="m5 8 5 5 5-5" />
    </svg>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="harness-select-panel"
        :style="menuStyle"
        @keydown="keydown"
      >
        <div v-if="searchable" class="harness-select-panel__search">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            aria-label="搜索选项"
            placeholder="搜索选项…"
            :aria-controls="id"
            :aria-activedescendant="activeId"
            autocomplete="off"
          />
        </div>
        <div
          :id="id"
          ref="list"
          role="listbox"
          :aria-label="menuLabel"
          class="harness-select-panel__list"
        >
          <div
            v-for="(option, index) in filtered"
            :id="`${id}-${index}`"
            :key="option.value"
            :data-value="option.value"
            role="option"
            class="harness-select-panel__option"
            :class="{ 'is-active': index === activeIndex }"
            :aria-selected="option.value === modelValue"
            :aria-disabled="option.disabled || undefined"
            @pointerdown.prevent
            @pointermove="!option.disabled && (activeIndex = index)"
            @click="choose(index)"
          >
            <span>{{ option.label }}</span>
            <svg
              v-if="option.value === modelValue"
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="m4 10 4 4 8-8" />
            </svg>
          </div>
        </div>
        <div v-if="!filtered.length" class="harness-select-panel__empty" role="status">
          {{ query ? '没有匹配的选项' : '暂无可选项' }}
        </div>
      </div>
    </Teleport>
  </button>
</template>

<style scoped>
.harness-select.harness-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid #8593a5;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms,
    box-shadow 140ms,
    background 140ms;
}
.harness-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.harness-select__chevron {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  color: #667085;
  transition: transform 140ms;
}
.harness-select.harness-select:hover:not(:disabled) {
  border-color: #2563eb;
  background: #fbfdff;
}
.harness-select.harness-select[aria-expanded='true'] {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgb(37 99 235 / 10%);
}
.harness-select[aria-expanded='true'] .harness-select__chevron {
  transform: rotate(180deg);
  color: #2563eb;
}
.harness-select.harness-select:disabled {
  background: #f8fafc;
  color: #667085;
  cursor: not-allowed;
}
.harness-select.harness-select:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.harness-select-panel {
  position: fixed;
  z-index: 1600;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  padding: 6px;
  border: 1px solid #c3cedd;
  border-radius: 12px;
  background: #fff;
  box-shadow:
    0 12px 36px rgb(23 35 61 / 14%),
    0 2px 6px rgb(23 35 61 / 5%);
  color: #334155;
  font:
    14px/20px 'HarmonyOS Sans SC',
    'MiSans',
    'Noto Sans SC',
    'PingFang SC',
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    sans-serif;
  text-align: left;
}
.harness-select-panel__search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin: 4px 4px 8px;
  padding: 7px 9px;
  border: 1px solid #8593a5;
  border-radius: 7px;
  background: #f8fafc;
}
.harness-select-panel__search:focus-within {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.harness-select-panel__search svg {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  color: #667085;
}
.harness-select-panel__search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #334155;
  font: inherit;
}
.harness-select-panel__search input::placeholder {
  color: #667085;
}
.harness-select-panel__list {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.harness-select-panel__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 38px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.harness-select-panel__option > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.harness-select-panel__option svg {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
}
.harness-select-panel__option.is-active {
  background: #f1f5fb;
  border-color: #8593a5;
}
.harness-select-panel__option[aria-selected='true'] {
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}
.harness-select-panel__option[aria-disabled='true'] {
  color: #667085;
  background: #f8fafc;
  cursor: not-allowed;
}
.harness-select-panel__empty {
  padding: 24px 12px;
  color: #667085;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .harness-select.harness-select,
  .harness-select__chevron {
    transition: none;
  }
}
@media (forced-colors: active) {
  .harness-select.harness-select:focus-visible,
  .harness-select-panel__search:focus-within {
    outline-color: Highlight;
  }
  .harness-select-panel {
    border-color: CanvasText;
  }
  .harness-select-panel__option.is-active {
    border-color: Highlight;
  }
  .harness-select-panel__option[aria-selected='true'] {
    color: Highlight;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  versions: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [version: string];
  change: [];
}>();
const menuId = `harness-versions-${useId()}`;
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<Record<string, string>>({});
const unavailable = computed(() => props.disabled || props.versions.length === 0);
const displayVersion = computed(() => (props.modelValue ? `v${props.modelValue}` : '无可用版本'));
let search = '';
let searchTime = 0;

function revealActive(): void {
  nextTick(() =>
    menu.value
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
      ?.scrollIntoView({ block: 'nearest' }),
  );
}

function positionMenu(): void {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const upward = below < 180 && above > below;
  menuStyle.value = {
    width: `${width}px`,
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    ...(upward
      ? { bottom: `${window.innerHeight - rect.top + 6}px` }
      : { top: `${rect.bottom + 6}px` }),
    maxHeight: `${Math.max(60, Math.min(280, (upward ? above : below) - 6))}px`,
  };
}

function show(): void {
  if (unavailable.value || !trigger.value) return;
  positionMenu();
  activeIndex.value = Math.max(0, props.versions.indexOf(props.modelValue));
  open.value = true;
  revealActive();
}

function choose(index: number): void {
  const version = props.versions[index];
  if (!version || unavailable.value) return;
  open.value = false;
  if (version !== props.modelValue) {
    emit('update:modelValue', version);
    emit('change');
  }
}

function keydown(event: KeyboardEvent): void {
  if (unavailable.value) return;
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault();
      event.stopPropagation();
      open.value = false;
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open.value) choose(activeIndex.value);
    else show();
    return;
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const wasOpen = open.value;
    if (!wasOpen) show();
    if (event.key === 'Home') activeIndex.value = 0;
    else if (event.key === 'End') activeIndex.value = props.versions.length - 1;
    else if (wasOpen)
      activeIndex.value = Math.max(
        0,
        Math.min(
          props.versions.length - 1,
          activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1),
        ),
      );
    revealActive();
    return;
  }
  if (
    event.key.length === 1 &&
    /^[\w.-]$/.test(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    if (!open.value) show();
    search = Date.now() - searchTime > 800 ? event.key : search + event.key;
    searchTime = Date.now();
    const index = props.versions.findIndex(
      (version) => `v${version}`.startsWith(search) || version.startsWith(search),
    );
    if (index >= 0) {
      activeIndex.value = index;
      revealActive();
    }
  }
}

function outside(event: Event): void {
  if (!(event.target instanceof Node)) return;
  if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target))
    open.value = false;
}
function scrolled(event: Event): void {
  if (!open.value) return;
  if (event.target instanceof Node && menu.value?.contains(event.target)) return;
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
    close();
    return;
  }
  // A click can follow a queued ancestor scroll; keep the popup attached to its trigger.
  positionMenu();
}
function close(): void {
  open.value = false;
}
watch(unavailable, (value) => {
  if (value) close();
});
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  window.addEventListener('scroll', scrolled, true);
  window.addEventListener('resize', close);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('scroll', scrolled, true);
  window.removeEventListener('resize', close);
});
</script>

<template>
  <div class="harness-version-picker">
    <button
      ref="trigger"
      class="harness-version-picker__trigger"
      type="button"
      role="combobox"
      aria-label="版本"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :aria-activedescendant="open ? `${menuId}-${activeIndex}` : undefined"
      :disabled="unavailable"
      :title="displayVersion"
      @click="open ? close() : show()"
      @keydown="keydown"
      @blur="close"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="5" cy="4" r="2" />
        <circle cx="5" cy="16" r="2" />
        <circle cx="15" cy="5" r="2" />
        <path d="M5 6v8m0-3h5a5 5 0 0 0 5-4" />
      </svg>
      <span>{{ displayVersion }}</span>
      <svg
        class="harness-version-picker__chevron"
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="m5 8 5 5 5-5" />
      </svg>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        class="harness-version-picker__menu"
        role="listbox"
        aria-label="可用版本"
        :style="menuStyle"
      >
        <div class="harness-version-picker__caption" aria-hidden="true">选择版本</div>
        <button
          v-for="(version, index) in versions"
          :id="`${menuId}-${index}`"
          :key="version"
          class="harness-version-picker__option"
          :class="{ 'is-active': index === activeIndex }"
          :data-index="index"
          type="button"
          role="option"
          :aria-selected="version === modelValue"
          :aria-label="`v${version}`"
          :title="`v${version}`"
          tabindex="-1"
          @pointerdown.prevent
          @pointermove="activeIndex = index"
          @click="choose(index)"
        >
          <span>v{{ version }}</span>
          <svg
            v-if="version === modelValue"
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="m4 10 4 4 8-8" />
          </svg>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.harness-version-picker {
  max-width: 100%;
}
.harness-version-picker .harness-version-picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 144px;
  max-width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid #8593a5;
  border-radius: 6px;
  background: #f6f9ff;
  color: #1d4ed8;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.harness-version-picker__trigger > span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.harness-version-picker__trigger svg,
.harness-version-picker__option svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.harness-version-picker__trigger[aria-expanded='true'] {
  border-color: #2563eb;
  background: #eff6ff;
}
.harness-version-picker__trigger[aria-expanded='true'] .harness-version-picker__chevron {
  transform: rotate(180deg);
}
.harness-version-picker__trigger:disabled {
  color: #667085;
  background: #f8fafc;
  cursor: default;
}
.harness-version-picker__trigger:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.harness-version-picker__menu {
  position: fixed;
  z-index: 1500;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border: 1px solid #8593a5;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 32px rgb(31 50 81 / 14%);
  font:
    13px/20px 'HarmonyOS Sans SC',
    'MiSans',
    'Noto Sans SC',
    'PingFang SC',
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    sans-serif;
}
.harness-version-picker__caption {
  padding: 4px 10px 8px;
  color: #667085;
  font-size: 12px;
}
.harness-version-picker__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #334155;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.harness-version-picker__option > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.harness-version-picker__option[aria-selected='true'] {
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}
.harness-version-picker__option.is-active {
  border-color: #2563eb;
  background: #edf3ff;
}
@media (forced-colors: active) {
  .harness-version-picker__trigger:focus-visible {
    outline-color: Highlight;
  }
  .harness-version-picker__option.is-active {
    border-color: Highlight;
  }
  .harness-version-picker__option[aria-selected='true'] {
    color: Highlight;
  }
}
</style>

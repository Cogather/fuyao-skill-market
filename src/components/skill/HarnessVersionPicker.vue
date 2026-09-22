<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  versions: string[];
  statuses?: Record<string, string>;
  statusKind?: 'release' | 'evaluation';
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
const displayVersion = computed(() => props.modelValue || '无可用版本');
let search = '';
let searchTime = 0;

type VersionStatusTone = 'developing' | 'pending' | 'published' | 'partial' | 'failed';

function versionStatus(status: string | undefined): {
  label: string;
  tone: VersionStatusTone;
} {
  const normalized = String(status ?? '')
    .trim()
    .toLocaleLowerCase();
  if (props.statusKind === 'evaluation') {
    if (['已评测', 'completed', 'evaluated'].includes(normalized)) {
      return { label: '已评测', tone: 'published' };
    }
    if (['部分评测', 'partial'].includes(normalized)) {
      return { label: '部分评测', tone: 'partial' };
    }
    if (['进行中', 'queuing', 'pending', 'running'].includes(normalized)) {
      return { label: '进行中', tone: 'pending' };
    }
    if (['失败', 'failed'].includes(normalized)) {
      return { label: '失败', tone: 'failed' };
    }
    return { label: '未评测', tone: 'developing' };
  }
  if (['已发布', '发布成功', '成功', 'published', 'released', 'success'].includes(normalized)) {
    return { label: '已发布', tone: 'published' };
  }
  if (
    [
      '待发布',
      '可发布',
      '发布中',
      '进行中',
      'pending',
      'ready',
      'processing',
      'in_progress',
    ].includes(normalized)
  ) {
    return { label: '待发布', tone: 'pending' };
  }
  return { label: '开发中', tone: 'developing' };
}

const versionOptions = computed(() =>
  props.versions.map((version) => ({
    version,
    ...versionStatus(props.statuses?.[version]),
  })),
);
const selectedStatus = computed(() => versionStatus(props.statuses?.[props.modelValue]));

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
  const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 24);
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
      <span class="harness-version-picker__value">{{ displayVersion }}</span>
      <span
        v-if="modelValue"
        class="harness-version-picker__status-dot"
        :class="`is-${selectedStatus.tone}`"
        aria-hidden="true"
      />
      <span class="harness-version-picker__chevron" aria-hidden="true" />
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
        <button
          v-for="(option, index) in versionOptions"
          :id="`${menuId}-${index}`"
          :key="option.version"
          class="harness-version-picker__option"
          :class="{ 'is-active': index === activeIndex }"
          :data-index="index"
          type="button"
          role="option"
          :aria-selected="option.version === modelValue"
          :aria-label="`${option.version} ${option.label}`"
          :title="`${option.version} ${option.label}`"
          tabindex="-1"
          @pointerdown.prevent
          @pointermove="activeIndex = index"
          @click="choose(index)"
        >
          <span class="harness-version-picker__option-version">{{ option.version }}</span>
          <span class="harness-version-picker__option-status">
            <span
              class="harness-version-picker__status-dot"
              :class="`is-${option.tone}`"
              aria-hidden="true"
            />
            <small>{{ option.label }}</small>
          </span>
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
  gap: 10px;
  min-width: 200px;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid #d7dee9;
  border-radius: 10px;
  background: #fff;
  color: #2456e6;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  transition:
    border-color 140ms,
    box-shadow 140ms;
}
.harness-version-picker__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.harness-version-picker__chevron {
  width: 0;
  height: 0;
  flex: 0 0 auto;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  border-top: 6px solid #8a93a6;
  transition: transform 140ms;
}
.harness-version-picker__trigger[aria-expanded='true'] {
  border-color: #2456e6;
  background: #fff;
  box-shadow: 0 0 0 3px rgb(36 86 230 / 10%);
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
  padding: 5px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(31 35 41 / 14%);
  font:
    13.5px/20px 'HarmonyOS Sans SC',
    'MiSans',
    'Noto Sans SC',
    'PingFang SC',
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    sans-serif;
}
.harness-version-picker__option {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #3c4457;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.harness-version-picker__option-version {
  min-width: 0;
  overflow-wrap: anywhere;
}
.harness-version-picker__option-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  color: #8a93a6;
  white-space: nowrap;
}
.harness-version-picker__option-status small {
  font-size: 11px;
  line-height: 18px;
}
.harness-version-picker__status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
}
.harness-version-picker__status-dot.is-developing {
  background: #a6aebf;
}
.harness-version-picker__status-dot.is-pending {
  background: #f08c2c;
}
.harness-version-picker__status-dot.is-published {
  background: #18b26a;
}
.harness-version-picker__status-dot.is-partial {
  background: #6677f7;
}
.harness-version-picker__status-dot.is-failed {
  background: #dc2626;
}
.harness-version-picker__option[aria-selected='true'] {
  background: #eef2ff;
  color: #2456e6;
  font-weight: 600;
}
.harness-version-picker__option:hover,
.harness-version-picker__option.is-active {
  background: #f2f4f9;
}
.harness-version-picker__option[aria-selected='true']:hover,
.harness-version-picker__option[aria-selected='true'].is-active {
  background: #eef2ff;
}
@media (forced-colors: active) {
  .harness-version-picker__trigger:focus-visible {
    outline-color: Highlight;
  }
  .harness-version-picker__option[aria-selected='true'] {
    color: Highlight;
  }
  .harness-version-picker__status-dot {
    background: CanvasText;
  }
}
</style>

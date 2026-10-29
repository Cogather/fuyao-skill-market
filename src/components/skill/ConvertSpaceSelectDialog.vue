<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import type { ConvertSpaceOption } from '../../types/skill';

const props = defineProps<{
  extensionName: string;
  versions: string[];
  defaultVersion?: string;
  loadSpaces: () => Promise<ConvertSpaceOption[]>;
  startTask: (space: ConvertSpaceOption, version: string) => Promise<void>;
}>();
const emit = defineEmits<{ close: []; submitted: [] }>();
const titleId = `convert-space-title-${useId()}`;
const dialogRef = ref<HTMLDialogElement | null>(null);
const confirmRef = ref<HTMLButtonElement | null>(null);
const spaces = ref<ConvertSpaceOption[]>([]);
const loading = ref(false);
const submitting = ref(false);
const loadError = ref('');
const submitError = ref('');
const selectedId = ref('');
const selectedVersion = ref('');
let mounted = false;

const selectedSpace = (): ConvertSpaceOption | undefined =>
  spaces.value.find((space) => space.spaceId === selectedId.value);

function close(): void {
  if (submitting.value) return;
  dialogRef.value?.close();
  emit('close');
}

async function loadSpaces(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const list = await props.loadSpaces();
    spaces.value = Array.isArray(list) ? list : [];
    if (spaces.value.length > 0 && !selectedId.value) {
      selectedId.value = spaces.value[0]!.spaceId;
    }
    if (spaces.value.length === 0) {
      loadError.value = '暂无可选的目标工作空间';
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '空间列表加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

async function confirmStart(): Promise<void> {
  if (submitting.value) return;
  const space = selectedSpace();
  if (!space) {
    submitError.value = '请先选择目标工作空间';
    return;
  }
  if (!selectedVersion.value) {
    submitError.value = '请选择 Extension 版本';
    return;
  }
  submitting.value = true;
  submitError.value = '';
  dialogRef.value?.focus();
  try {
    await props.startTask(space, selectedVersion.value);
    if (mounted) emit('submitted');
  } catch (e) {
    if (mounted) submitError.value = e instanceof Error ? e.message : '发起转换失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  mounted = true;
  dialogRef.value?.showModal();
  confirmRef.value?.focus();
  selectedVersion.value = props.defaultVersion || props.versions[0] || '';
  void loadSpaces();
});
onBeforeUnmount(() => {
  mounted = false;
  dialogRef.value?.close();
});
</script>

<template>
  <Teleport to="body">
    <div class="harness-workspace-overlay">
      <dialog
        ref="dialogRef"
        class="convert-space-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-busy="submitting"
        tabindex="-1"
        @cancel.prevent
      >
        <header>
          <h2 :id="titleId">转换为 CoreALM-Next 小队</h2>
          <button
            type="button"
            class="convert-space-dialog__close"
            aria-label="关闭"
            :disabled="submitting"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="convert-space-dialog__body">
          <p class="convert-space-dialog__intro">
            即将把「<strong>{{ extensionName }}</strong
            >」转换为 CoreALM-Next 小队，请选择目标工作空间：
          </p>
          <div v-if="loading" class="convert-space-state">空间列表加载中…</div>
          <div v-else-if="loadError" class="convert-space-state is-error">
            {{ loadError }}
            <button type="button" class="convert-space-retry" @click="loadSpaces()">重试</button>
          </div>
          <div v-else class="convert-space-field">
            <div class="convert-space-field__row">
              <div class="convert-space-field__col">
                <label class="convert-space-field__label" for="convert-version-select">Extension 版本</label>
                <select
                  id="convert-version-select"
                  v-model="selectedVersion"
                  class="convert-space-field__select"
                  :disabled="submitting"
                >
                  <option value="" disabled>请选择版本…</option>
                  <option v-for="ver in props.versions" :key="ver" :value="ver">{{ ver }}</option>
                </select>
              </div>
              <div class="convert-space-field__col">
                <label class="convert-space-field__label" for="convert-space-select">目标工作空间</label>
                <select
                  id="convert-space-select"
                  v-model="selectedId"
                  class="convert-space-field__select"
                  :disabled="submitting"
                >
                  <option value="" disabled>请选择空间…</option>
                  <option v-for="space in spaces" :key="space.spaceId" :value="space.spaceId">
                    {{ space.spaceName }}
                  </option>
                </select>
              </div>
            </div>
            <p v-if="selectedSpace()?.description" class="convert-space-field__desc">
              {{ selectedSpace()?.description }}
            </p>
          </div>
          <p v-if="submitError" class="convert-space-dialog__error" role="alert">{{ submitError }}</p>
        </div>
        <footer>
          <button ref="confirmRef" type="button" :disabled="submitting || loading" @click="close">
            取消
          </button>
          <button
            type="button"
            class="primary-btn"
            :disabled="submitting || loading || spaces.length === 0 || !selectedId"
            @click="confirmStart"
          >
            {{ submitting ? '发起中…' : '发起转换' }}
          </button>
        </footer>
      </dialog>
    </div>
  </Teleport>
</template>

<style scoped>
.convert-space-dialog {
  box-sizing: border-box;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 24px;
  overflow: hidden;
  border: 1px solid var(--hw-line, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 20px 60px rgb(15 23 42 / 18%);
  color-scheme: light;
}
.convert-space-dialog[open] {
  display: flex;
  flex-direction: column;
}
.convert-space-dialog::backdrop {
  background: rgb(15 23 42 / 38%);
  backdrop-filter: blur(3px);
}
.convert-space-dialog header,
.convert-space-dialog footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
}
.convert-space-dialog header {
  justify-content: space-between;
}
.convert-space-dialog h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.convert-space-dialog__body {
  min-height: 0;
  padding: 16px 0 20px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.convert-space-dialog__intro {
  margin: 0 0 14px;
  line-height: 1.7;
  color: var(--hw-text, #334155);
  font-size: 13px;
}
.convert-space-state {
  padding: 24px 0;
  color: #667085;
  font-size: 13px;
  text-align: center;
}
.convert-space-state.is-error {
  color: var(--hw-danger, #b42318);
}
.convert-space-retry {
  margin-left: 10px;
  padding: 3px 12px;
  border: 1px solid var(--hw-control-line, #8593a5);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-text, #334155);
  font-size: 12px;
  cursor: pointer;
}
.convert-space-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.convert-space-field__row {
  display: flex;
  gap: 16px;
}
.convert-space-field__col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.convert-space-field__label {
  color: #7b8396;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.3px;
}
.convert-space-field__select {
  width: 100%;
  box-sizing: border-box;
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid #d5dcea;
  border-radius: 8px;
  background: #fff;
  color: #1f2b3d;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.convert-space-field__select:hover:not(:disabled) {
  border-color: #b6c6e0;
}
.convert-space-field__select:focus-visible {
  border-color: #2f7df6;
  box-shadow: 0 0 0 3px rgb(47 125 246 / 12%);
}
.convert-space-field__desc {
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
  line-height: 1.7;
}
.convert-space-dialog__error {
  margin: 14px 0 0;
  color: var(--hw-danger, #b42318);
  font-size: 13px;
  line-height: 1.7;
}
.convert-space-dialog footer {
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--hw-line, #e2e8f0);
}
.convert-space-dialog footer button {
  min-height: 32px;
  padding: 5px 14px;
  border: 1px solid var(--hw-control-line, #8593a5);
  border-radius: 6px;
  background: #fff;
  color: var(--hw-text, #334155);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.convert-space-dialog footer button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.convert-space-dialog footer button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.convert-space-dialog footer .primary-btn {
  border-color: #2f7df6;
  background: #2f7df6;
  color: #fff;
  font-weight: 600;
}
</style>

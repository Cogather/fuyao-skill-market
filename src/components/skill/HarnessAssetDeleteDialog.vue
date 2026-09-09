<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = defineProps<{
  assetName: string;
  assetType: string;
  deleteAsset: () => Promise<void>;
}>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const titleId = `asset-delete-title-${useId()}`;
const descriptionId = `${titleId}-description`;
const dialogRef = ref<HTMLDialogElement | null>(null);
const cancelRef = ref<HTMLButtonElement | null>(null);
const submitting = ref(false);
const error = ref('');
let mounted = false;

function close(): void {
  if (submitting.value) return;
  dialogRef.value?.close();
  emit('close');
}

async function confirmDelete(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  dialogRef.value?.focus();
  try {
    await props.deleteAsset();
    if (mounted) emit('deleted');
  } catch (cause) {
    if (mounted) error.value = cause instanceof Error ? cause.message : '删除失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  mounted = true;
  // A native modal keeps focus and keyboard interaction inside the dialog.
  dialogRef.value?.showModal();
  cancelRef.value?.focus();
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
        class="asset-delete-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        :aria-busy="submitting"
        tabindex="-1"
        @cancel.prevent="close"
      >
        <header>
          <h2 :id="titleId">删除 {{ assetType }} 资产</h2>
          <button
            type="button"
            class="asset-delete-dialog__close"
            aria-label="关闭"
            :disabled="submitting"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="asset-delete-dialog__body">
          <p :id="descriptionId">
            确认删除「<strong>{{ assetName }}</strong
            >」？删除后无法恢复，请谨慎操作。
          </p>
          <p v-if="error" class="asset-delete-dialog__error" role="alert">{{ error }}</p>
        </div>
        <footer>
          <button ref="cancelRef" type="button" :disabled="submitting" @click="close">取消</button>
          <button type="button" class="danger-btn" :disabled="submitting" @click="confirmDelete">
            {{ submitting ? '删除中…' : '确认删除' }}
          </button>
        </footer>
      </dialog>
    </div>
  </Teleport>
</template>

<style scoped>
.asset-delete-dialog {
  box-sizing: border-box;
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 24px;
  overflow: hidden;
  border: 1px solid var(--hw-line, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 20px 60px rgb(15 23 42 / 18%);
}
.asset-delete-dialog[open] {
  display: flex;
  flex-direction: column;
}
.asset-delete-dialog::backdrop {
  background: rgb(15 23 42 / 38%);
  backdrop-filter: blur(3px);
}
.asset-delete-dialog header,
.asset-delete-dialog footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
}
.asset-delete-dialog header {
  justify-content: space-between;
}
.asset-delete-dialog h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.asset-delete-dialog__body {
  min-height: 0;
  padding: 20px 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.asset-delete-dialog p {
  margin: 0;
  line-height: 1.7;
}
.asset-delete-dialog .asset-delete-dialog__error {
  margin-top: 12px;
  color: var(--hw-danger, #b42318);
  font-size: 13px;
}
.asset-delete-dialog footer {
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--hw-line, #e2e8f0);
}
.asset-delete-dialog button {
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
.asset-delete-dialog button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.asset-delete-dialog button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.asset-delete-dialog .asset-delete-dialog__close {
  width: 32px;
  padding: 0;
  border-color: transparent;
  background: var(--hw-quiet, #f8fafc);
  color: var(--hw-muted, #667085);
  font-size: 22px;
}
</style>

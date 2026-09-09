<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';

import type { SkillPlanningUserOption } from '../../services/skillMarket/skillPlanningShared';
import WorkflowPersonPicker from './WorkflowPersonPicker.vue';

const props = defineProps<{
  label: string;
  currentValue: string;
  savePerson: (person: SkillPlanningUserOption) => Promise<string>;
}>();
const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const titleId = `asset-person-editor-${useId()}`;
const dialogRef = ref<HTMLElement | null>(null);
const selectedPerson = ref<SkillPlanningUserOption | null>(null);
const submitting = ref(false);
const error = ref('');

function close(): void {
  if (!submitting.value) emit('close');
}

async function save(): Promise<void> {
  if (!selectedPerson.value || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await props.savePerson(selectedPerson.value);
    emit('saved');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '人员保存失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => dialogRef.value?.querySelector<HTMLInputElement>('input')?.focus());
</script>

<template>
  <Teleport to="body">
    <div class="person-editor-overlay" @click.self="close" @keydown.esc="close">
      <form
        ref="dialogRef"
        class="person-editor"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-busy="submitting"
        @submit.prevent="save"
      >
        <header class="person-editor__header">
          <h2 :id="titleId">修改{{ label }}</h2>
          <button
            type="button"
            class="person-editor__close"
            aria-label="关闭"
            :disabled="submitting"
            @click="close"
          >
            ×
          </button>
        </header>
        <p class="person-editor__current">当前{{ label }}：{{ currentValue || '—' }}</p>
        <fieldset :disabled="submitting">
          <WorkflowPersonPicker v-model="selectedPerson" :label="label" />
        </fieldset>
        <p v-if="error" class="person-editor__error" role="alert">{{ error }}</p>
        <footer class="person-editor__footer">
          <button type="button" :disabled="submitting" @click="close">取消</button>
          <button
            type="submit"
            class="person-editor__save"
            :disabled="!selectedPerson || submitting"
          >
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.person-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(30 41 59 / 38%);
  backdrop-filter: blur(4px);
}

.person-editor {
  box-sizing: border-box;
  width: min(480px, 100%);
  padding: 24px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 64px rgb(30 41 59 / 20%);
}

.person-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.person-editor h2 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
}

.person-editor button {
  padding: 7px 14px;
  border: 1px solid #d5def4;
  border-radius: 7px;
  background: #fff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.person-editor button:disabled {
  opacity: 0.5;
  cursor: default;
}

.person-editor button:focus-visible {
  outline: 2px solid #4569ff;
  outline-offset: 3px;
}

.person-editor .person-editor__close {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: #f1f4f9;
  color: #7d8da8;
  font-size: 20px;
}

.person-editor__current {
  margin: 16px 0;
  color: #64748b;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.person-editor fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.person-editor__error {
  margin: 12px 0 0;
  color: #b42318;
  font-size: 13px;
}

.person-editor__footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 28px;
}

.person-editor .person-editor__save {
  border-color: #4569ff;
  background: #4569ff;
  color: #fff;
}
</style>

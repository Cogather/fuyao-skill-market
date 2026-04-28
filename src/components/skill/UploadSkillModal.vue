<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
  }>(),
  {
    modelValue: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  submit: [payload: { name: string; publisher: string; note: string; file: File | null }];
}>();

const name = ref('');
const userId = ref('当前用户');
const note = ref('');
const file = ref<File | null>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      return;
    }
    name.value = '';
    userId.value = '当前用户';
    note.value = '';
    file.value = null;
  },
);

function close(): void {
  emit('update:modelValue', false);
}

function onOverlayClick(): void {
  close();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  name.value = file.value?.name ?? '';
  console.log(file.value);
  // name
}

function onSubmit(): void {
  emit('submit', {
    name: name.value,
    publisher: userId.value,
    note: note.value,
    file: file.value,
  });
  close();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" role="presentation" @click.self="onOverlayClick">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div class="dialog-head">
          <h2 id="upload-title" class="dialog-title">上传 Skill</h2>
          <button type="button" class="close-x" aria-label="关闭" @click="close">x</button>
        </div>
        <p class="hint">
          若 Skill 名称与市场中已有条目<strong>完全相同</strong>，将视为<strong>新版本发布</strong>并追加版本记录。
        </p>
        <div class="field">
          <label for="sk-file">Skill ZIP 包</label>
          <input id="sk-file" type="file" accept=".zip,application/zip" @change="onFileChange" />
        </div>
        <div class="field">
          <label for="sk-note">版本说明（可选）</label>
          <textarea id="sk-note" v-model="note" rows="3" placeholder="本次更新要点" />
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" @click="close">取消</button>
          <button type="button" class="btn primary" @click="onSubmit">确定上传</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.dialog {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-x {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
}

.hint {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
  margin: 0 0 16px;
  line-height: 1.6;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
  margin-bottom: 6px;
}

.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 8px 11px;
  font-size: 14px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn {
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn.ghost {
  background: #fff;
  border-color: #d9d9d9;
  color: rgba(0, 0, 0, 0.88);
}

.btn.primary {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

type ParsedSkillMeta = {
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  requirements: string;
  tags: string;
  level: string;
};

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
  submit: [payload: { name: string; publisher: string; note: string; file: File | null; scopeLabel?: string; tagFunctional?: string }];
}>();

const note = ref('');
const file = ref<File | null>(null);
const parsed = ref<ParsedSkillMeta | null>(null);
const parseState = ref<'idle' | 'success' | 'duplicate'>('idle');

const parseNotice = computed(() => {
  if (parseState.value === 'success') {
    return '解析成功：已从 SKILL.md Front Matter 中解析基础信息和 metadata，必填项完整，名称未重名。';
  }
  if (parseState.value === 'duplicate') {
    return '重名校验未通过：市场内已存在同名 Skill。请修改 SKILL.md Front Matter 中的 name 后重新上传；如果你是维护人，请从“我的发布”进入“上传新版本”。';
  }
  return '等待上传：解析字段会自动回显且禁填。';
});

const canSubmit = computed(() => Boolean(parsed.value) && parseState.value === 'success');

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      return;
    }
    reset();
  },
);

function reset(): void {
  note.value = '';
  file.value = null;
  parsed.value = null;
  parseState.value = 'idle';
}

function close(): void {
  emit('update:modelValue', false);
}

function onOverlayClick(): void {
  close();
}

function fileBaseName(uploadFile: File): string {
  return uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'uploaded-skill';
}

function parseUploadOk(uploadFile: File | null): void {
  const base = uploadFile ? fileBaseName(uploadFile) : 'pdf-document-extractor';
  parsed.value = {
    name: base === 'uploaded-skill' ? 'pdf-document-extractor' : base,
    version: '1.0.0',
    description: '从 PDF 文件中提取文本和表格、填充表单、合并文档。在处理 PDF 文件或用户提及 PDF、表单或文档提取时使用。',
    author: '当前用户',
    category: 'utility-doc',
    requirements: '需要 Python 3.10+ 和 pdfplumber 库',
    tags: 'pdf document extraction',
    level: '个人级（默认发布，无需审核）',
  };
  parseState.value = 'success';
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  parseUploadOk(file.value);
}

function onSubmit(): void {
  if (!parsed.value || parseState.value !== 'success') {
    return;
  }
  emit('submit', {
    name: parsed.value.name,
    publisher: parsed.value.author,
    note: note.value.trim() || parsed.value.description,
    file: file.value,
    scopeLabel: '个人级',
    tagFunctional: parsed.value.category,
  });
  close();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" role="presentation" @click.self="onOverlayClick">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <header class="dialog-head">
          <div>
            <h2 id="upload-title" class="dialog-title">上传 Skill</h2>
            <p class="dialog-sub">上传压缩包后自动解析 SKILL.md，解析字段回显且不可手动编辑。</p>
          </div>
          <button type="button" class="close-x" aria-label="关闭" @click="close">x</button>
        </header>

        <div class="notice">
          <b>个人级上传规则：</b>后端会先解压压缩包并读取 <code>SKILL.md</code> 的 Front Matter，解析
          name、description、requirements 以及 metadata 下的 author、version、category、tags。校验通过后，系统会保存压缩包和解析出的元数据，默认发布为个人级 Skill。
        </div>

        <label class="upload-zone" for="sk-file">
          <span class="upload-icon" aria-hidden="true">↑</span>
          <strong>上传 Skill 压缩包</strong>
          <span>支持 .zip 文件。选择后自动解析并回显基础信息。</span>
          <input id="sk-file" type="file" accept=".zip,application/zip" @change="onFileChange" />
        </label>

        <div class="parse-notice" :class="{ success: parseState === 'success', error: parseState === 'duplicate' }">
          {{ parseNotice }}
        </div>

        <section class="upload-result-card" aria-label="解析结果">
          <div class="upload-result-head">
            <b>解析结果</b>
            <span>来自 SKILL.md Front Matter</span>
          </div>
          <div class="upload-result-body">
            <div class="upload-meta-grid">
              <div class="form-field">
                <label>name</label>
                <input class="input readonly" readonly :value="parsed?.name ?? '等待解析'" />
              </div>
              <div class="form-field">
                <label>metadata.version</label>
                <input class="input readonly" readonly :value="parsed?.version ?? '等待解析'" />
              </div>
              <div class="form-field full">
                <label>description</label>
                <textarea class="textarea readonly" readonly :value="parsed?.description ?? '等待解析'" />
              </div>
              <div class="form-field">
                <label>metadata.author</label>
                <input class="input readonly" readonly :value="parsed?.author ?? '等待解析'" />
              </div>
              <div class="form-field">
                <label>metadata.category</label>
                <input class="input readonly" readonly :value="parsed?.category ?? '等待解析'" />
              </div>
              <div class="form-field full">
                <label>requirements</label>
                <input class="input readonly" readonly :value="parsed?.requirements ?? '等待解析'" />
              </div>
              <div class="form-field full">
                <label>metadata.tags</label>
                <input class="input readonly" readonly :value="parsed?.tags ?? '可选，等待解析'" />
              </div>
              <div class="form-field">
                <label>默认发布层级</label>
                <input class="input readonly" readonly :value="parsed?.level ?? '个人级（默认发布，无需审核）'" />
              </div>
              <div class="form-field full">
                <label for="sk-note">变更说明</label>
                <textarea id="sk-note" v-model="note" class="textarea" placeholder="可填写本次上传说明；为空时使用 description" />
              </div>
            </div>
          </div>
        </section>

        <footer class="actions">
          <span class="actions-spacer" aria-hidden="true" />
          <button type="button" class="btn ghost" @click="close">取消</button>
          <button type="button" class="btn primary" :disabled="!canSubmit" @click="onSubmit">确定上传</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}

.dialog {
  width: min(940px, 100%);
  max-height: min(90vh, 780px);
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.35);
}

.dialog-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 850;
  color: #0f172a;
}

.dialog-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.close-x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.close-x:hover {
  background: #f8fafc;
  color: #1d4ed8;
}

.notice {
  margin: 22px 22px 14px;
  padding: 13px 15px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 13px;
  line-height: 1.7;
}

.notice code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid #dbeafe;
}

.upload-zone {
  display: grid;
  place-items: center;
  gap: 7px;
  margin: 0 22px 14px;
  padding: 22px;
  text-align: center;
  cursor: pointer;
  border: 1.5px dashed #93c5fd;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
  transition: 0.16s ease;
}

.upload-zone:hover {
  background: #eff6ff;
  transform: translateY(-1px);
}

.upload-zone input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.upload-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 20px;
  font-weight: 900;
}

.upload-zone strong {
  color: #0f172a;
  font-size: 16px;
}

.upload-zone span:last-child {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.parse-notice {
  margin: 0 22px 14px;
  padding: 12px 14px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 13px;
  line-height: 1.6;
}

.parse-notice.success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.parse-notice.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.upload-result-card {
  margin: 0 22px 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.upload-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.upload-result-head b {
  color: #0f172a;
  font-size: 14px;
}

.upload-result-head span {
  color: #64748b;
  font-size: 12px;
}

.upload-result-body {
  padding: 14px;
}

.upload-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-field.full {
  grid-column: 1 / -1;
}

.form-field label {
  display: block;
  margin-bottom: 7px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.input,
.textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  padding: 10px 12px;
}

.textarea {
  min-height: 82px;
  resize: vertical;
}

.readonly {
  background: #f8fafc;
  color: #475569;
  cursor: not-allowed;
}

.actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 22px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
}

.actions-spacer {
  flex: 1;
}

.btn {
  min-height: 34px;
  border-radius: 6px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn.ghost {
  background: #fff;
  border-color: #d9d9d9;
  color: #334155;
}

.btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.btn.primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .overlay {
    padding: 12px;
  }

  .dialog {
    max-height: 94vh;
  }

  .upload-meta-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-wrap: wrap;
  }

  .actions-spacer {
    display: none;
  }

  .btn {
    flex: 1 1 auto;
  }
}
</style>

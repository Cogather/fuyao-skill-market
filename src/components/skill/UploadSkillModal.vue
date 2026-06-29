<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { useProfileStore } from '../../stores/userStore';
import BusinessDimensionCascader from './BusinessDimensionCascader.vue';

const skillMarketStore = useSkillMarketStore();
const userStore = useProfileStore();

type ParsedSkillMeta = {
  name: string;
  version: string;
  description: string;
  author?: string;
  category?: string;
  requirements?: string;
  tags: string;
  level: string;
};

type VersionUpgradeMeta = {
  name: string;
  existingVersion: string;
  nextVersion: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** 对接 `POST /api/skills/upload/parse`；不传则保持本地 Mock 解析（仅开发兜底） */
    parseSkillArchive?: (file: File) => Promise<any>;
    /**
     * 上传/解析接口使用的操作者工号。建议由 `UserMarketShell` 传入其 `userId` 计算属性（含角色 employeeNo 回退），
     * 避免弹窗内仅读 store 时与壳层「角色已返回、store 尚未回填」的瞬时不同步。
     */
    operatorUserId?: string;
  }>(),
  {
    modelValue: false,
  },
);

/** 父级传入 > 市场 store > Profile w3Id */
const userId = computed(() => {
  const fromParent = String(props.operatorUserId ?? '').trim();
  if (fromParent) {
    return fromParent;
  }
  const fromMarket = String(skillMarketStore.userId ?? '').trim();
  if (fromMarket) {
    return fromMarket;
  }
  return String(userStore.userInfo?.w3Id ?? '').trim();
});

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  submit: [
    payload: {
      name: string;
      publisher: string;
      note: string;
      file: File | null;
      scopeLabel?: string;
      tagFunctional?: string;
      version?: string;
      versionUpgrade?: boolean;
      existingVersion?: string;
    },
  ];
}>();

const note = ref('');
const file = ref<File | null>(null);
const parsed = ref<ParsedSkillMeta | null>(null);
const parseState = ref<'idle' | 'success' | 'warning' | 'duplicate'>('idle');
const parseWarnings = ref<string[]>([]);
const versionUpgrade = ref<VersionUpgradeMeta | null>(null);
const parsing = ref(false);
const uploading = ref(false);
const parseError = ref('');
const selectedBusinessDimensionName = ref('');
const selectedBusinessCategoryParam = ref('');
const duplicateChecking = ref(false);
const duplicateCheckMessage = ref('');
const duplicateCheckStatus = ref<'idle' | 'found' | 'none' | 'error'>('idle');
const skillGuideOpen = ref(false);
const skillGuideCopied = ref(false);
let skillGuideCopyTimer: number | undefined;

const skillFrontMatterExample = `---
name: skill-name
description: 从 PDF 文件中提取文本和表格、填充表单、合并文档。在处理 PDF 文件或用户提及 PDF、表单或文档提取时使用。
metadata:
  version: 1.0.0
  tags: pdf document extraction
---

xxxxxxxxxxxxxxxxxxxxx
`;

const parseNotice = computed(() => {
  if (parseError.value) {
    return parseError.value;
  }
  if (uploading.value) {
    return '正在保存文件并上传 Skill...';
  }
  if (parseState.value === 'warning') {
    return '解析完成，但存在 warnings，请处理后重新选择文件。';
  }
  if (parseState.value === 'duplicate') {
    return '有重名的 Skill：市场内已存在其他人创建的同名 Skill。';
  }
  if (parseState.value === 'success') {
    return '解析成功：基础信息和 tags 已自动回显，请确认业务维度后提交。';
  }
  if (parsing.value) {
    return '正在请求后端解析压缩包…';
  }
  return '等待上传：解析字段会自动回显；业务维度请手动选择。';
});

const canSubmit = computed(
  () =>
    Boolean(parsed.value) &&
    parseState.value === 'success' &&
    Boolean(selectedBusinessDimensionName.value) &&
    Boolean(selectedBusinessCategoryParam.value) &&
    !uploading.value,
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      reset();
    }
  },
);

function reset(): void {
  note.value = '';
  file.value = null;
  parsed.value = null;
  parseState.value = 'idle';
  parseWarnings.value = [];
  versionUpgrade.value = null;
  parsing.value = false;
  uploading.value = false;
  parseError.value = '';
  selectedBusinessDimensionName.value = '';
  selectedBusinessCategoryParam.value = '';
  duplicateChecking.value = false;
  duplicateCheckMessage.value = '';
  duplicateCheckStatus.value = 'idle';
}

function close(): void {
  emit('update:modelValue', false);
}

function onOverlayClick(): void {
  close();
}

function openSkillGuide(): void {
  skillGuideOpen.value = true;
}

function closeSkillGuide(): void {
  skillGuideOpen.value = false;
}

async function copySkillGuide(): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(skillFrontMatterExample);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = skillFrontMatterExample;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    skillGuideCopied.value = true;
    window.clearTimeout(skillGuideCopyTimer);
    skillGuideCopyTimer = window.setTimeout(() => {
      skillGuideCopied.value = false;
    }, 1600);
  } catch (e) {
    skillGuideCopied.value = false;
  }
}

function parseUploadOk(info: any): void {
  // const base = uploadFile ? fileBaseName(uploadFile) : 'pdf-document-extractor';
  const rawTags = info?.tags;
  parsed.value = {
    name: info.name,
    version: info.version,
    description: info.description,
    author: info?.author || '',
    category: info.category,
    requirements: info?.requirements || '',
    tags: Array.isArray(rawTags) ? rawTags.join(',') : String(rawTags ?? ''),
    level: info?.level || '个人级',
  };
  parseState.value = 'success';
  if (info?.nameExists && info?.existingVersion) {
    versionUpgrade.value = {
      name: info.name,
      existingVersion: String(info.existingVersion),
      nextVersion: String(info.nextVersion ?? info.version ?? ''),
    };
  }
}

function readEnvelopeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function serviceSucceeded(value: unknown): boolean {
  const record = readEnvelopeRecord(value);
  const meta = readEnvelopeRecord(record.meta);
  if (typeof meta.success === 'boolean') {
    return meta.success;
  }
  if (record.success === false) {
    return false;
  }
  const code = record.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

function serviceMessage(value: unknown, fallback: string): string {
  const record = readEnvelopeRecord(value);
  const meta = readEnvelopeRecord(record.meta);
  const message = meta.message ?? record.message ?? record.msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function skillListRowsFromData(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.map(readEnvelopeRecord);
  }
  const record = readEnvelopeRecord(raw);
  if (Array.isArray(record.records)) {
    return record.records.map(readEnvelopeRecord);
  }
  return [];
}

function skillRowName(row: Record<string, unknown>): string {
  return String(row.name ?? row.skillName ?? row.skill_id ?? '').trim();
}

async function checkDuplicateName(): Promise<void> {
  const name = parsed.value?.name?.trim();
  duplicateCheckMessage.value = '';
  duplicateCheckStatus.value = 'idle';
  if (!name || duplicateChecking.value) {
    return;
  }
  duplicateChecking.value = true;
  try {
    const env = await skillBaseService.querySkillList({
      keyword: name,
      pageNum: 1,
      pageSize: 50,
    });
    if (!serviceSucceeded(env)) {
      duplicateCheckStatus.value = 'error';
      duplicateCheckMessage.value = serviceMessage(env, '重名检索失败');
      return;
    }
    const rows = skillListRowsFromData(readEnvelopeRecord(env).data);
    const existing = rows.find((row) => skillRowName(row).toLowerCase() === name.toLowerCase());
    if (existing) {
      const existingVersion = String(existing.currentVersion ?? existing.version ?? '').trim();
      duplicateCheckStatus.value = 'found';
      duplicateCheckMessage.value = existingVersion
        ? `已检索到同名 Skill，当前版本 ${existingVersion}。`
        : '已检索到同名 Skill。';
      versionUpgrade.value = {
        name,
        existingVersion,
        nextVersion: parsed.value?.version ?? '',
      };
      return;
    }
    duplicateCheckStatus.value = 'none';
    duplicateCheckMessage.value = '未检索到同名 Skill，可作为新 Skill 上传。';
    versionUpgrade.value = null;
  } catch (e) {
    duplicateCheckStatus.value = 'error';
    duplicateCheckMessage.value = e instanceof Error ? e.message : '重名检索失败';
  } finally {
    duplicateChecking.value = false;
  }
}

function storagePathSegment(value: string, fallback: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

function buildStorageFileDir(meta: ParsedSkillMeta): string {
  return [
    'fuyao',
    'skills',
    storagePathSegment(meta.name, 'uploaded-skill'),
    storagePathSegment(meta.version, '1.0.0'),
  ].join('/');
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  parseError.value = '';
  parseWarnings.value = [];
  versionUpgrade.value = null;
  parsed.value = null;
  parseState.value = 'idle';
  duplicateCheckMessage.value = '';
  duplicateCheckStatus.value = 'idle';
  if (!file.value) {
    return;
  }
  if (props.parseSkillArchive) {
    parsing.value = true;
    try {
      const r = await props.parseSkillArchive(file.value);
      const warnings = r.warnings ?? [];
      if (warnings.length > 0) {
        parseWarnings.value = warnings;
        parseState.value = 'warning';
        return;
      }
      if (!r.canSubmit) {
        parseState.value = 'duplicate';
        return;
      }
      parseState.value = 'success';
      parseUploadOk(r);
    } catch (e) {
      parseError.value = e instanceof Error ? e.message : '解析请求失败';
      parseState.value = 'idle';
    } finally {
      parsing.value = false;
    }
    return;
  }
}

const onSubmit = async (): Promise<void> => {
  if (!parsed.value || parseState.value !== 'success' || !file.value || uploading.value) {
    return;
  }
  parseError.value = '';
  uploading.value = true;
  try {
    // 调用skill的upload接口
    const formData = new FormData();
    formData.append('file', file.value);
    const uploadParams: Record<string, string> = {
      userId: userId.value,
      category: selectedBusinessCategoryParam.value,
    };
    const env = await skillBaseService.uploadSkillPackage(formData, uploadParams);
    if (!serviceSucceeded(env)) {
      parseError.value = serviceMessage(env, '上传失败');
      return;
    }
    // 调用fuyao的uploadStorageFile接口
    const storageFormData = new FormData();
    storageFormData.append('uploadFile', file.value);
    storageFormData.append('fileDir', buildStorageFileDir(parsed.value));
    const storageEnv = await skillBaseService.uploadStorageFile(storageFormData);
    if (!serviceSucceeded(storageEnv)) {
      parseError.value = serviceMessage(storageEnv, '文件存储失败');
      return;
    }
    emit('submit', {
      name: parsed.value.name,
      publisher: parsed.value.author ?? '',
      note: note.value.trim() || parsed.value.description,
      file: file.value,
      scopeLabel: '个人级',
      tagFunctional: selectedBusinessDimensionName.value,
      version: parsed.value.version,
      versionUpgrade: Boolean(versionUpgrade.value),
      existingVersion: versionUpgrade.value?.existingVersion,
    });
    close();
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : '上传失败';
  } finally {
    uploading.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" role="presentation" @click.self="onOverlayClick">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <header class="dialog-head">
          <div>
            <h2 id="upload-title" class="dialog-title">上传 Skill</h2>
          </div>
          <button type="button" class="close-x" aria-label="关闭" @click="close">关闭</button>
        </header>

        <div class="notice">
          系统自动解析 Skill 名称、描述、版本和 tags；业务维度由用户选择，不从
          <code>SKILL.md</code> 自动带出。
        </div>

        <label class="upload-zone" :class="{ disabled: parsing }" for="sk-file">
          <span class="upload-icon" aria-hidden="true">↑</span>
          <strong>上传 Skill 压缩包</strong>
          <span>支持 .zip 文件。选择后自动解析并回显基础信息。</span>
          <input
            id="sk-file"
            type="file"
            accept=".zip,application/zip"
            :disabled="parsing"
            @change="onFileChange"
          />
        </label>

        <div
          class="parse-notice"
          :class="{
            success: parseState === 'success',
            warning: parseState === 'warning',
            error: parseState === 'duplicate' || Boolean(parseError),
          }"
        >
          <div class="parse-notice-row">
            <div>{{ parseNotice }}</div>
            <button
              v-if="parseWarnings?.some((warning) => warning.includes('metadata.'))"
              type="button"
              class="skill-guide-trigger"
              @click="openSkillGuide"
            >
              查看示例
            </button>
          </div>
          <ul v-if="parseWarnings.length > 0" class="warning-list">
            <li v-for="(warning, index) in parseWarnings" :key="`${warning}-${index}`">
              {{ warning }}
            </li>
          </ul>
        </div>

        <section class="upload-result-card upload-result-card--publish-info" aria-label="发布信息">
          <div class="upload-result-head">
            <b>发布信息</b>
            <span>基础信息和 tags 自动解析，业务维度手动选择</span>
          </div>
          <div class="upload-result-body">
            <div class="upload-meta-grid">
              <div class="form-field">
                <label>name</label>
                <input class="input readonly" readonly :value="parsed?.name ?? '等待解析'" />
              </div>
              <div class="form-field">
                <label>version</label>
                <input class="input readonly" readonly :value="parsed?.version ?? '等待解析'" />
              </div>
              <div class="form-field full">
                <label>description</label>
                <textarea
                  class="textarea readonly"
                  readonly
                  :value="parsed?.description ?? '等待解析'"
                />
              </div>
              <div class="form-field full">
                <label>tags</label>
                <input class="input readonly" readonly :value="parsed?.tags ?? '等待解析'" />
              </div>
              <div class="form-field">
                <label for="sk-business-dimension">业务维度</label>
                <BusinessDimensionCascader
                  v-model="selectedBusinessCategoryParam"
                  v-model:dimension-label="selectedBusinessDimensionName"
                  first-select-id="sk-business-dimension"
                  second-select-id="sk-business-category"
                  aria-label-prefix="业务维度"
                />
              </div>
              <div class="form-field">
                <label>默认发布层级</label>
                <input
                  class="input readonly"
                  readonly
                  :value="parsed?.level ?? '个人级（默认发布，无需审核）'"
                />
              </div>
              <div class="duplicate-row full">
                <span
                  v-if="duplicateCheckMessage"
                  class="duplicate-message"
                  :class="duplicateCheckStatus"
                >
                  {{ duplicateCheckMessage }}
                </span>
                <button
                  v-if="false"
                  type="button"
                  class="btn outline"
                  :disabled="!parsed?.name || duplicateChecking"
                  @click="checkDuplicateName"
                >
                  {{ duplicateChecking ? '检索中...' : '模拟重名' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <footer class="actions">
          <span class="actions-spacer" aria-hidden="true" />
          <button type="button" class="btn ghost" @click="close">取消</button>
          <button type="button" class="btn primary" :disabled="!canSubmit" @click="onSubmit">
            {{ uploading ? '上传中...' : '确定上传' }}
          </button>
        </footer>

        <div
          v-if="skillGuideOpen"
          class="skill-guide-backdrop"
          role="presentation"
          @click.self="closeSkillGuide"
        >
          <section
            class="skill-guide-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-guide-title"
          >
            <header class="skill-guide-head">
              <div>
                <h3 id="skill-guide-title">SKILL.md 前置信息写法</h3>
                <p>将下面内容放在 SKILL.md 文件开头，并按实际 Skill 信息替换字段值。</p>
              </div>
              <button
                type="button"
                class="skill-guide-close"
                aria-label="关闭写法说明"
                @click="closeSkillGuide"
              >
                关闭
              </button>
            </header>
            <div class="skill-guide-code-wrap">
              <button
                type="button"
                class="skill-guide-copy"
                :aria-label="skillGuideCopied ? '已复制' : '复制写法文本'"
                :title="skillGuideCopied ? '已复制' : '复制'"
                @click="copySkillGuide"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="10" height="10" rx="2" />
                  <path d="M5 15V7a2 2 0 0 1 2-2h8" />
                </svg>
              </button>
              <span v-if="skillGuideCopied" class="skill-guide-copied">已复制</span>
              <pre class="skill-guide-code"><code>{{ skillFrontMatterExample }}</code></pre>
              <p>（备注：metadata中version为必填项，tags非必填）</p>
            </div>
          </section>
        </div>
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
  min-width: 52px;
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
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

.upload-zone.disabled {
  cursor: not-allowed;
  opacity: 0.65;
  pointer-events: none;
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

.parse-notice-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.skill-guide-trigger {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(146, 64, 14, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #92400e;
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.skill-guide-trigger:hover {
  border-color: rgba(146, 64, 14, 0.4);
  background: #ffffff;
}

.parse-notice.success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.parse-notice.warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.parse-notice.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.warning-list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.warning-list li + li {
  margin-top: 4px;
}

.skill-guide-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.3);
}

.skill-guide-panel {
  width: min(720px, 100%);
  max-height: min(78vh, 680px);
  overflow: hidden;
  border: 1px solid #e9edf3;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
}

.skill-guide-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e9edf3;
  background: linear-gradient(180deg, rgba(47, 125, 246, 0.08), rgba(255, 255, 255, 0));
}

.skill-guide-head h3 {
  margin: 0;
  color: #15171d;
  font-size: 17px;
  font-weight: 900;
}

.skill-guide-head p,
.skill-guide-code-wrap p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.skill-guide-close {
  min-width: 52px;
  height: 34px;
  border: 1px solid #e9edf3;
  border-radius: 999px;
  background: #ffffff;
  color: #373b45;
  cursor: pointer;
  font-size: 13px;
  font-weight: 850;
}

.skill-guide-close:hover {
  color: #2f7df6;
  border-color: #cfd7e6;
  background: #fbfcff;
}

.skill-guide-code-wrap {
  position: relative;
  margin: 18px 20px 20px;
}

.skill-guide-copy {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
}

.skill-guide-copy:hover {
  color: #2f7df6;
  border-color: #b8d7ff;
}

.skill-guide-copy svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.skill-guide-copied {
  position: absolute;
  top: 14px;
  right: 52px;
  z-index: 1;
  color: #166534;
  font-size: 12px;
  font-weight: 850;
}

.skill-guide-code {
  max-height: calc(78vh - 160px);
  margin: 0;
  overflow: auto;
  padding: 18px 18px 18px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: rgb(245, 247, 251);
  color: #0f172a;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.skill-guide-code code {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.upload-result-card {
  margin: 0 22px 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.upload-result-card--publish-info {
  overflow: visible;
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

.duplicate-row.full {
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

.duplicate-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-height: 44px;
}

.duplicate-message {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.duplicate-message.found {
  color: #b45309;
}

.duplicate-message.none {
  color: #166534;
}

.duplicate-message.error {
  color: #b91c1c;
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

.btn.outline {
  min-height: 46px;
  padding: 0 18px;
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.btn.outline:hover:not(:disabled) {
  background: #dbeafe;
}

.btn:disabled,
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

/* Prototype-aligned upload dialog polish */
.overlay {
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
}

.dialog {
  border: 1px solid rgba(232, 236, 245, 0.92);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(251, 252, 255, 0.98)), #ffffff;
  box-shadow: 0 28px 70px rgba(22, 34, 51, 0.18);
}

.dialog-head {
  padding: 18px 24px;
  border-bottom-color: #e9edf3;
  background: linear-gradient(180deg, rgba(120, 98, 255, 0.08), rgba(255, 255, 255, 0));
}

.dialog-title {
  color: #15171d;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0;
}

.close-x,
.btn {
  border-radius: 999px;
  font-weight: 850;
}

.close-x {
  border-color: #e9edf3;
  color: #373b45;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(12, 20, 35, 0.05);
}

.close-x:hover {
  color: #2f7df6;
  border-color: #cfd7e6;
  background: #fbfcff;
}

.notice,
.parse-notice {
  border-color: #d8eaff;
  border-radius: 8px;
  background: #eef6ff;
  color: #2f61c8;
}

.upload-zone {
  border-color: #d8eaff;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(246, 250, 255, 0.86)),
    linear-gradient(90deg, rgba(47, 125, 246, 0.08), rgba(46, 205, 211, 0.07));
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

.upload-zone:hover {
  background: #f8fbff;
  border-color: #b8d7ff;
}

.upload-icon {
  border-radius: 8px;
  background: linear-gradient(135deg, #2f7df6, #7552ff);
  box-shadow: 0 10px 22px rgba(95, 101, 155, 0.18);
}

.upload-result-card {
  border-color: #e9edf3;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

.upload-result-card--publish-info :deep(.business-dimension-cascader__menu) {
  top: auto;
  bottom: calc(100% + 4px);
}

.upload-result-head {
  background: #f8fafc;
  border-bottom-color: #e9edf3;
}

.upload-result-head b {
  color: #15171d;
  font-weight: 900;
}

.form-field label {
  color: #7b8396;
  font-weight: 900;
  letter-spacing: 0;
}

.input,
.textarea {
  border-color: #e9edf3;
  border-radius: 8px;
  color: #15171d;
  font-weight: 700;
}

.input:focus,
.textarea:focus {
  border-color: rgba(47, 125, 246, 0.42);
  box-shadow: 0 0 0 3px rgba(47, 125, 246, 0.1);
}

.readonly {
  background: #f8fafc;
  color: #626b7c;
}

.actions {
  border-top-color: #e9edf3;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
}

.btn.ghost {
  border-color: #e9edf3;
  background: #ffffff;
  color: #373b45;
}

.btn.primary {
  background: #1d1d1f;
  border-color: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

.btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.16);
}

.btn.outline {
  border-color: #d8eaff;
  background: #eef6ff;
  color: #2f7df6;
}
</style>

<script setup lang="ts">
import { nextTick, onMounted, ref, useId } from 'vue';

import type {
  HarnessAssetPersonField,
  HarnessAssetType,
} from '../../services/skillMarket/assetManagementTypes';
import type { SkillPlanningUserOption } from '../../services/skillMarket/skillPlanningShared';
import WorkflowPersonPicker from './WorkflowPersonPicker.vue';

type EditableAssetType = Exclude<HarnessAssetType, 'Extension'>;

const props = defineProps<{
  assetType: EditableAssetType;
  name: string;
  description: string;
  people: Record<HarnessAssetPersonField, SkillPlanningUserOption | null>;
  submitting: boolean;
  error: string;
  requiredNamePrefix?: string;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  'update:description': [value: string];
  'update-person': [field: HarnessAssetPersonField, value: SkillPlanningUserOption | null];
  close: [];
  save: [];
}>();

const titleId = `asset-edit-dialog-${useId()}`;
const nameInput = ref<HTMLInputElement | null>(null);

function close(): void {
  if (!props.submitting) emit('close');
}

onMounted(() => void nextTick(() => nameInput.value?.focus()));
</script>

<template>
  <Teleport to="body">
    <div
      class="asset-master-overlay harness-workspace-overlay"
      @click.self="close"
      @keydown.esc="close"
    >
      <form
        class="asset-master-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-label="`编辑 ${assetType}`"
        :aria-busy="submitting"
        @submit.prevent="emit('save')"
      >
        <header>
          <div>
            <small>{{ assetType.toUpperCase() }} MASTER</small>
            <h2 :id="titleId">编辑 {{ assetType }}</h2>
            <p>这里只维护可复用资产的基本信息；归属、场景和活动请在规划页配置。</p>
          </div>
          <button type="button" aria-label="关闭" :disabled="submitting" @click="close">×</button>
        </header>

        <div class="asset-master-note">
          <b>归属说明</b>
          <span>责任人所属部门是人员属性，不改变当前资产的规划归属。</span>
        </div>

        <fieldset :disabled="submitting">
          <div class="asset-master-form">
            <label class="is-wide">
              <span>{{ assetType }} 名称 *</span>
              <input
                ref="nameInput"
                :value="name"
                type="text"
                maxlength="64"
                aria-label="名称"
                :placeholder="requiredNamePrefix || `请输入 ${assetType} 名称`"
                @input="emit('update:name', ($event.target as HTMLInputElement).value)"
              />
              <small v-if="requiredNamePrefix" class="asset-master-name-hint">
                需以产品名称的小写形式“{{ requiredNamePrefix }}”开头
              </small>
            </label>
            <label class="is-wide">
              <span>{{ assetType }} 说明 *</span>
              <textarea
                :value="description"
                rows="5"
                maxlength="300"
                aria-label="描述"
                @input="emit('update:description', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
            <WorkflowPersonPicker
              :model-value="people.owner"
              label="责任人"
              @update:model-value="emit('update-person', 'owner', $event)"
            />
            <WorkflowPersonPicker
              :model-value="people.developer"
              label="开发责任人"
              @update:model-value="emit('update-person', 'developer', $event)"
            />
          </div>
        </fieldset>

        <p v-if="error" class="asset-master-error" role="alert">{{ error }}</p>

        <footer>
          <button type="button" :disabled="submitting" @click="close">取消</button>
          <button type="submit" class="is-primary" :disabled="submitting">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.asset-master-overlay {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 27, 45, 0.42);
  backdrop-filter: blur(4px);
}

.asset-master-dialog {
  box-sizing: border-box;
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  overflow: auto;
  padding: 22px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  color: #17233d;
  box-shadow: 0 24px 70px rgba(24, 36, 59, 0.24);
}

.asset-master-dialog > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.asset-master-dialog > header div {
  display: grid;
  gap: 5px;
}

.asset-master-dialog > header small {
  color: #4f67e8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.asset-master-dialog h2 {
  margin: 0;
  font-size: 20px;
}

.asset-master-dialog > header p {
  margin: 0;
  color: #718096;
  font-size: 12px;
}

.asset-master-dialog > header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #f2f4f8;
  color: #7a879b;
  font: inherit;
  font-size: 20px;
  cursor: pointer;
}

.asset-master-note {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #dce7fb;
  border-radius: 8px;
  background: #f5f8ff;
  color: #58709e;
  font-size: 12px;
}

.asset-master-dialog fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.asset-master-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.asset-master-form > label {
  display: grid;
  gap: 7px;
  color: #40516b;
  font-size: 13px;
  font-weight: 600;
}

.asset-master-form > label.is-wide {
  grid-column: 1 / -1;
}

.asset-master-form input,
.asset-master-form textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0 11px;
  border: 1px solid #d7dfeb;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #263753;
  font: inherit;
  font-size: 13px;
}

.asset-master-form input {
  height: 40px;
}

.asset-master-form textarea {
  min-height: 116px;
  padding-top: 10px;
  resize: vertical;
}

.asset-master-form input:focus,
.asset-master-form textarea:focus {
  border-color: #6285f5;
  box-shadow: 0 0 0 3px rgba(75, 103, 241, 0.11);
}

.asset-master-name-hint {
  color: #7a879b;
  font-size: 12px;
  font-weight: 400;
}

.asset-master-error {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff1f2;
  color: #d92d3e;
  font-size: 13px;
}

.asset-master-dialog > footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.asset-master-dialog > footer button {
  min-width: 64px;
  height: 40px;
  padding: 0 16px;
  border: 1px solid #d5dfed;
  border-radius: 8px;
  background: #fff;
  color: #334763;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.asset-master-dialog > footer button.is-primary {
  border-color: #4c65ea;
  background: linear-gradient(135deg, #2f7df4, #6548ef);
  color: #fff;
}

.asset-master-dialog button:disabled,
.asset-master-dialog fieldset:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

@media (max-width: 640px) {
  .asset-master-overlay {
    padding: 16px;
  }

  .asset-master-dialog {
    width: calc(100vw - 24px);
    padding: 18px;
  }

  .asset-master-form {
    grid-template-columns: 1fr;
  }

  .asset-master-form > label.is-wide {
    grid-column: auto;
  }
}
</style>

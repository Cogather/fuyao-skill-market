<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  queryHarnessWorkflowCommands,
  type HarnessWorkflowCommand,
} from '../../services/skillMarket/harnessWorkflowListService';
import {
  planningTaskDetailDirectFilePath,
  queryPlanningTaskDetailFileContent,
} from '../../services/skillMarket/planningTaskDetailService';

type CommandContentState = {
  loading: boolean;
  loaded: boolean;
  content: string;
  error: string;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    workflowName: string;
    isHttp: boolean;
    userId: string;
    dimType: string;
    dimCode: string;
    dimName: string;
    firstScene: string;
    secondScene: string;
    initialCommands?: HarnessWorkflowCommand[];
  }>(),
  { initialCommands: () => [] },
);

const emit = defineEmits<{ close: [] }>();
const commands = ref<HarnessWorkflowCommand[]>([]);
const loading = ref(false);
const error = ref('');
const expandedKeys = ref<Set<string>>(new Set());
const contentByKey = reactive<Record<string, CommandContentState>>({});
let loadSequence = 0;

const dialogLabel = computed(() => `${props.workflowName} Command 清单`);

function commandKey(command: HarnessWorkflowCommand, index: number): string {
  return JSON.stringify([command.name, command.version, index]);
}

function stateFor(key: string): CommandContentState {
  if (!contentByKey[key]) {
    contentByKey[key] = { loading: false, loaded: false, content: '', error: '' };
  }
  return contentByKey[key];
}

function replaceExpanded(key: string, expanded: boolean): void {
  const next = new Set(expandedKeys.value);
  if (expanded) next.add(key);
  else next.delete(key);
  expandedKeys.value = next;
}

function clearDialogState(): void {
  expandedKeys.value = new Set();
  Object.keys(contentByKey).forEach((key) => delete contentByKey[key]);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message.trim() ? caught.message : fallback;
}

async function loadCommands(): Promise<void> {
  const sequence = ++loadSequence;
  loading.value = true;
  error.value = '';
  commands.value = [];
  clearDialogState();
  try {
    const result = props.isHttp
      ? await queryHarnessWorkflowCommands({
          userId: props.userId,
          dimType: props.dimType,
          dimCode: props.dimCode,
          dimName: props.dimName,
          firstScene: props.firstScene,
          secondScene: props.secondScene,
        })
      : props.initialCommands.map((command) => ({ ...command }));
    if (sequence !== loadSequence || !props.open) return;
    commands.value = result;
  } catch (caught) {
    if (sequence !== loadSequence || !props.open) return;
    error.value = errorMessage(caught, 'Command 清单加载失败');
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function loadCommandContent(command: HarnessWorkflowCommand, index: number): Promise<void> {
  const key = commandKey(command, index);
  const state = stateFor(key);
  const version = command.version?.trim() || '';
  if (!version || state.loading || state.loaded) return;
  const sequence = loadSequence;
  state.loading = true;
  state.error = '';
  try {
    const capabilityName = command.name.replace(/^\/+/, '');
    const path = planningTaskDetailDirectFilePath(capabilityName, 'command');
    const content = await queryPlanningTaskDetailFileContent(
      {
        userId: props.userId,
        capabilityType: 'command',
        capabilityName,
        version,
        filePath: path,
      },
      path,
    );
    if (sequence !== loadSequence || !props.open) return;
    state.content = content;
    state.loaded = true;
  } catch (caught) {
    if (sequence !== loadSequence || !props.open) return;
    state.error = errorMessage(caught, 'Command 内容加载失败');
  } finally {
    if (sequence === loadSequence) state.loading = false;
  }
}

async function toggleCommand(command: HarnessWorkflowCommand, index: number): Promise<void> {
  const key = commandKey(command, index);
  const opening = !expandedKeys.value.has(key);
  replaceExpanded(key, opening);
  if (opening) await loadCommandContent(command, index);
}

function close(): void {
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') close();
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown);
      void loadCommands();
    } else {
      loadSequence += 1;
      document.removeEventListener('keydown', onKeydown);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  loadSequence += 1;
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="open" class="workflow-command-overlay" @mousedown.self="close">
    <section
      class="workflow-command-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogLabel"
    >
      <header class="workflow-command-header">
        <div>
          <span class="workflow-command-eyebrow">WORKFLOW COMMANDS</span>
          <h2>{{ workflowName }} <small>Command 清单</small></h2>
          <p>共 {{ commands.length }} 个入口，展开可查看当前版本内容</p>
        </div>
        <button type="button" class="workflow-command-close" aria-label="关闭" @click="close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </header>

      <div class="workflow-command-body">
        <div v-if="loading" class="workflow-command-feedback" role="status">
          <span class="workflow-command-spinner" aria-hidden="true"></span>
          正在加载 Command 清单…
        </div>
        <div v-else-if="error" class="workflow-command-feedback is-error" role="alert">
          <span>{{ error }}</span>
          <button type="button" @click="loadCommands">重新加载</button>
        </div>
        <div v-else-if="!commands.length" class="workflow-command-empty" role="status">
          当前工作流暂无 Command 入口
        </div>
        <ol v-else class="workflow-command-list">
          <li
            v-for="(command, index) in commands"
            :key="commandKey(command, index)"
            class="workflow-command-item"
            :class="{ 'is-open': expandedKeys.has(commandKey(command, index)) }"
          >
            <button
              type="button"
              class="workflow-command-summary"
              :aria-expanded="expandedKeys.has(commandKey(command, index))"
              :aria-label="`${expandedKeys.has(commandKey(command, index)) ? '收起' : '展开'} Command ${command.name}`"
              @click="toggleCommand(command, index)"
            >
              <span class="workflow-command-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="workflow-command-info">
                <span class="workflow-command-name">{{ command.name }}</span>
                <span v-if="command.description" class="workflow-command-description">
                  {{ command.description }}
                </span>
              </span>
              <span
                class="workflow-command-version"
                :class="{ 'is-empty': !command.version?.trim() }"
              >
                {{ command.version?.trim() ? `v${command.version.trim()}` : '暂无版本' }}
              </span>
              <svg
                class="workflow-command-chevron"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>

            <div
              v-if="expandedKeys.has(commandKey(command, index))"
              class="workflow-command-content-wrap"
            >
              <p v-if="!command.version?.trim()" class="workflow-command-unavailable">
                暂无已发布版本，暂不能查看内容
              </p>
              <p
                v-else-if="stateFor(commandKey(command, index)).loading"
                class="workflow-command-content-status"
                role="status"
              >
                正在加载 Command 内容…
              </p>
              <div
                v-else-if="stateFor(commandKey(command, index)).error"
                class="workflow-command-content-error"
                role="alert"
              >
                <span>{{ stateFor(commandKey(command, index)).error }}</span>
                <button
                  type="button"
                  :aria-label="`重新加载 ${command.name}`"
                  @click="loadCommandContent(command, index)"
                >
                  重新加载
                </button>
              </div>
              <pre v-else class="workflow-command-content">{{
                stateFor(commandKey(command, index)).content || '(空)'
              }}</pre>
            </div>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workflow-command-overlay {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(3px);
}

.workflow-command-dialog {
  width: min(1080px, 100%);
  max-height: min(760px, calc(100vh - 56px));
  overflow: hidden;
  border: 1px solid #dfe5f1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.22);
}

.workflow-command-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px 20px;
  border-bottom: 1px solid #edf1f7;
  background:
    radial-gradient(circle at 92% 0%, rgba(80, 112, 255, 0.13), transparent 42%),
    linear-gradient(135deg, #fbfcff 0%, #f5f8ff 100%);
}

.workflow-command-eyebrow {
  color: #5675df;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.workflow-command-header h2 {
  margin: 5px 0 4px;
  color: #172033;
  font-size: 20px;
  line-height: 1.35;
}

.workflow-command-header h2 small {
  margin-left: 6px;
  color: #667085;
  font-size: 14px;
  font-weight: 600;
}

.workflow-command-header p {
  margin: 0;
  color: #7a8498;
  font-size: 12px;
}

.workflow-command-close {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #dce3ef;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.85);
  color: #667085;
  cursor: pointer;
}

.workflow-command-close:hover {
  border-color: #b9c7e6;
  background: #fff;
  color: #315de8;
}

.workflow-command-close svg,
.workflow-command-chevron {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.workflow-command-body {
  max-height: calc(min(760px, 100vh - 56px) - 119px);
  padding: 18px 22px 22px;
  overflow-y: auto;
}

.workflow-command-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow-command-item {
  overflow: hidden;
  border: 1px solid #26354d;
  border-radius: 11px;
  background-color: #0f172a;
  background-image: linear-gradient(145deg, rgba(30, 41, 59, 0.82), rgba(15, 23, 42, 0));
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  transition:
    border-color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.workflow-command-item:hover,
.workflow-command-item.is-open {
  border-color: #3b82f6;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.2);
}

.workflow-command-item:hover {
  transform: translateY(-1px);
}

.workflow-command-summary {
  display: grid;
  width: 100%;
  grid-template-columns: 36px minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  border: 0;
  background: transparent;
  color: #e2e8f0;
  text-align: left;
  cursor: pointer;
}

.workflow-command-summary:hover {
  background: rgba(59, 130, 246, 0.07);
}

.workflow-command-index {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(125, 211, 252, 0.16);
  border-radius: 9px;
  background: rgba(59, 130, 246, 0.16);
  color: #93c5fd;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.workflow-command-info {
  min-width: 0;
}

.workflow-command-name {
  display: block;
  overflow: hidden;
  color: #7dd3fc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-command-description {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #cbd5e1;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-command-version {
  padding: 3px 9px;
  border: 1px solid rgba(125, 211, 252, 0.32);
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.17);
  color: #bfdbfe;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.workflow-command-version.is-empty {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(148, 163, 184, 0.08);
  color: #94a3b8;
}

.workflow-command-chevron {
  color: #94a3b8;
  transition: transform 160ms ease;
}

.workflow-command-item.is-open .workflow-command-chevron {
  transform: rotate(90deg);
  color: #7dd3fc;
}

.workflow-command-content-wrap {
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  padding: 0 16px 16px 64px;
}

.workflow-command-content {
  max-height: 300px;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #020617;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.workflow-command-feedback,
.workflow-command-empty,
.workflow-command-unavailable,
.workflow-command-content-status,
.workflow-command-content-error {
  color: #7a8498;
  font-size: 13px;
}

.workflow-command-feedback,
.workflow-command-empty {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px dashed #dce3ef;
  border-radius: 10px;
  background: #fbfcfe;
}

.workflow-command-feedback.is-error,
.workflow-command-content-error {
  color: #b42318;
}

.workflow-command-feedback button,
.workflow-command-content-error button {
  margin-left: 8px;
  padding: 4px 9px;
  border: 1px solid #f1b4af;
  border-radius: 6px;
  background: #fff;
  color: #b42318;
  cursor: pointer;
}

.workflow-command-unavailable,
.workflow-command-content-status,
.workflow-command-content-error {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: #1e293b;
  color: #94a3b8;
}

.workflow-command-content-error {
  border-color: rgba(248, 113, 113, 0.28);
  background: #321c25;
  color: #fca5a5;
}

.workflow-command-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid #d7e0f5;
  border-top-color: #4166db;
  border-radius: 50%;
  animation: workflow-command-spin 800ms linear infinite;
}

@keyframes workflow-command-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .workflow-command-overlay {
    padding: 14px;
  }

  .workflow-command-header {
    padding: 20px;
  }

  .workflow-command-body {
    padding: 14px;
  }

  .workflow-command-summary {
    grid-template-columns: 34px minmax(0, 1fr) 18px;
  }

  .workflow-command-version {
    grid-column: 2;
    justify-self: start;
  }

  .workflow-command-chevron {
    grid-column: 3;
    grid-row: 1 / span 2;
  }

  .workflow-command-content-wrap {
    padding-left: 14px;
  }
}
</style>

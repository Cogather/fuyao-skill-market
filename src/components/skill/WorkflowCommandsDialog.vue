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
  <Teleport to="body">
    <div
      v-if="open"
      class="workflow-command-overlay harness-workspace-overlay"
      @mousedown.self="close"
    >
      <section
        class="workflow-command-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogLabel"
      >
        <header class="workflow-command-header">
          <div>
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
  </Teleport>
</template>

<style scoped>
.workflow-command-overlay,
.workflow-command-overlay * {
  box-sizing: border-box;
}

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
  box-sizing: border-box;
  display: flex;
  width: min(92vw, 1760px);
  max-width: 100%;
  max-height: min(88vh, 980px, calc(100vh - 56px));
  max-height: min(88dvh, 980px, calc(100dvh - 56px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
}

.workflow-command-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.workflow-command-header h2 {
  margin: 0 0 4px;
  color: #1f2937;
  font-size: 18px;
  line-height: 1.35;
}

.workflow-command-header h2 small {
  margin-left: 6px;
  color: #6b7280;
  font-size: 14px;
  font-weight: 600;
}

.workflow-command-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
}

.workflow-command-close {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
}

.workflow-command-close:hover {
  border-color: #bfdbfe;
  background: #f0f5ff;
  color: #2563eb;
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
  min-height: 0;
  flex: 1 1 auto;
  padding: 16px;
  overflow-y: auto;
}

.workflow-command-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow-command-item {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  transition: border-color 160ms ease;
}

.workflow-command-item.is-open {
  border-color: #bfdbfe;
}

.workflow-command-summary {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.workflow-command-summary:hover {
  background: #f7f8fa;
}

.workflow-command-item.is-open .workflow-command-summary {
  background: #f0f5ff;
}

.workflow-command-info {
  min-width: 0;
}

.workflow-command-name {
  display: block;
  overflow: hidden;
  color: #2563eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-command-description {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #6b7280;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-command-version {
  padding: 2px 8px;
  border: 0;
  border-radius: 6px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.workflow-command-version.is-empty {
  background: #f9fafb;
  color: #9ca3af;
}

.workflow-command-chevron {
  color: #9ca3af;
  transition: transform 160ms ease;
}

.workflow-command-item.is-open .workflow-command-chevron {
  transform: rotate(90deg);
  color: #2563eb;
}

.workflow-command-content-wrap {
  border-top: 1px solid #e5e7eb;
  background: #f7f8fa;
}

.workflow-command-content {
  max-height: 300px;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  border: 0;
  background: #f7f8fa;
  color: #1f2937;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
}

.workflow-command-feedback,
.workflow-command-empty,
.workflow-command-unavailable,
.workflow-command-content-status,
.workflow-command-content-error {
  color: #6b7280;
  font-size: 14px;
  line-height: 22px;
}

.workflow-command-feedback,
.workflow-command-empty {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.workflow-command-feedback.is-error,
.workflow-command-content-error {
  color: #b42318;
}

.workflow-command-feedback button,
.workflow-command-content-error button {
  margin-left: 8px;
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #2563eb;
  cursor: pointer;
}

.workflow-command-feedback button:hover,
.workflow-command-content-error button:hover {
  border-color: #bfdbfe;
  background: #f0f5ff;
}

.workflow-command-unavailable,
.workflow-command-content-status,
.workflow-command-content-error {
  margin: 0;
  padding: 14px 16px;
  background: #f7f8fa;
  color: #6b7280;
}

.workflow-command-content-error {
  background: #fef2f2;
  color: #b42318;
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
    padding: 16px;
  }

  .workflow-command-body {
    padding: 14px;
  }

  .workflow-command-summary {
    grid-template-columns: minmax(0, 1fr) 18px;
  }

  .workflow-command-version {
    grid-column: 1;
    justify-self: start;
  }

  .workflow-command-chevron {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>

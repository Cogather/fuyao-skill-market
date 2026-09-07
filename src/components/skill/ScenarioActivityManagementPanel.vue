<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  HarnessScenarioWorkspace,
  Node as WorkflowNode,
  Stage,
} from '../../composables/useHarnessScenarioWorkspace';
import type { ActivityRecord } from '../../services/skillMarket/activityManagementService';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';

const props = defineProps<{ workspace: HarnessScenarioWorkspace }>();
const emit = defineEmits<{ 'scope-change': [snapshot: HarnessScopeSnapshot] }>();
const {
  departments,
  scenarios,
  workflows,
  selectedDeptId,
  productId,
  selectedScenarioId,
  productOptions,
  selectDepartment,
  deptPath,
  ensureWorkflow,
  loadLegacyActivities,
  bindLegacyActivity,
  loading,
  available,
  error,
} = props.workspace;

type Editor = {
  kind: 'stage' | 'node';
  scenarioId: string;
  id: string;
  stageId: string;
  name: string;
  description: string;
  initialName: string;
  initialDescription: string;
};

const editor = ref<Editor | null>(null);
const editorError = ref('');
const notice = ref('');
const actionError = ref('');
const legacyActivities = ref<ActivityRecord[]>([]);
const legacyActivityId = ref('');
const legacyLoading = ref(false);
const legacyError = ref('');
const binding = ref(false);
let legacyLoadSequence = 0;

const currentScopeProduct = computed(() =>
  available.value && departments.some((department) => department._id === selectedDeptId.value)
    ? productOptions.value.find((product) => product._id === productId.value)
    : undefined,
);
const currentScenario = computed(() =>
  scenarios.find(
    (scenario) =>
      scenario._id === selectedScenarioId.value &&
      scenario.productId === currentScopeProduct.value?._id,
  ),
);
const primaryId = computed(
  () => currentScenario.value?.parentId || currentScenario.value?._id || '',
);
const primaryScenarios = computed(() =>
  scenarios.filter((scenario) => scenario.productId === productId.value && scenario.level === 1),
);
const secondaryScenarios = computed(() =>
  scenarios.filter(
    (scenario) =>
      scenario.productId === productId.value &&
      scenario.parentId === primaryId.value &&
      scenario.level === 2,
  ),
);
const currentWorkflow = computed(() =>
  currentScenario.value?.level === 2
    ? workflows.find((workflow) => workflow.scenarioId === currentScenario.value?._id)
    : undefined,
);
const stages = computed(() =>
  [...(currentWorkflow.value?.stages || [])].sort((left, right) => left.order - right.order),
);
const canEdit = computed(
  () => available.value && currentScenario.value?.level === 2 && !loading.value && !binding.value,
);
const legacyPrimaryActivities = computed(() =>
  legacyActivities.value.filter((activity) => activity.parentId === null),
);
const editorDirty = computed(() =>
  Boolean(
    editor.value &&
    (editor.value.name !== editor.value.initialName ||
      editor.value.description !== editor.value.initialDescription),
  ),
);

function validateBeforeLeave(): boolean {
  if (binding.value) {
    notice.value = '正在导入旧活动，请稍候。';
    return false;
  }
  return !editorDirty.value || window.confirm('环节或节点的修改尚未保存，确认放弃修改？');
}

function emitScope() {
  const department = departments.find((item) => item._id === selectedDeptId.value);
  const product = currentScopeProduct.value;
  if (!department || (productId.value && !product)) return;
  emit('scope-change', {
    level: '产品级',
    departmentPath: [...department.path],
    offeringId: product?.code || '',
    offeringName: product?.name || '',
  });
}

function changeScope(event: Event, field: 'department' | 'product' | 'primary' | 'secondary') {
  const select = event.target as HTMLSelectElement;
  const previous =
    field === 'department'
      ? selectedDeptId.value
      : field === 'product'
        ? productId.value
        : field === 'primary'
          ? primaryId.value
          : currentScenario.value?.level === 2
            ? selectedScenarioId.value
            : '';
  const allowedValue =
    field === 'department'
      ? departments.some((item) => item._id === select.value)
      : !select.value ||
        (field === 'product'
          ? productOptions.value
          : field === 'primary'
            ? primaryScenarios.value
            : secondaryScenarios.value
        ).some((item) => item._id === select.value);
  if (
    !allowedValue ||
    ((field === 'primary' || field === 'secondary') && !available.value) ||
    !validateBeforeLeave()
  ) {
    select.value = previous;
    return;
  }
  editor.value = null;
  if (field === 'department') selectDepartment(select.value);
  else if (field === 'product') {
    productId.value = select.value;
    selectedScenarioId.value = '';
  } else selectedScenarioId.value = select.value || (field === 'secondary' ? primaryId.value : '');
  emitScope();
}

function orderedNodes(stage: Stage): WorkflowNode[] {
  return [...stage.steps].sort((left, right) => left.order - right.order);
}

function openEditor(kind: 'stage' | 'node', stage?: Stage, node?: WorkflowNode) {
  if (!canEdit.value || !currentScenario.value || !validateBeforeLeave()) return;
  if (stage && !currentWorkflow.value?.stages.includes(stage)) return;
  if (node && !stage?.steps.includes(node)) return;
  const existing = kind === 'stage' ? stage : node;
  editor.value = {
    kind,
    scenarioId: currentScenario.value._id,
    id: existing?.id || '',
    stageId: kind === 'node' ? stage?.id || '' : '',
    name: existing?.name || '',
    description: existing?.description || '',
    initialName: existing?.name || '',
    initialDescription: existing?.description || '',
  };
  editorError.value = '';
  actionError.value = '';
  notice.value = '';
}

function saveEditor() {
  const draft = editor.value;
  if (!draft || !canEdit.value || !currentScenario.value) return;
  if (draft.scenarioId !== currentScenario.value._id) {
    editorError.value = '场景范围已切换，请重新打开编辑';
    return;
  }
  const name = draft.name.trim();
  if (!name) {
    editorError.value = `请输入${draft.kind === 'stage' ? '环节' : '节点'}名称`;
    return;
  }
  const stage = currentWorkflow.value?.stages.find((item) => item.id === draft.stageId);
  const siblings =
    draft.kind === 'stage' ? currentWorkflow.value?.stages || [] : stage?.steps || [];
  if (siblings.some((item) => item.id !== draft.id && item.name === name)) {
    editorError.value = '同一层级下已存在同名项';
    return;
  }
  if (draft.kind === 'node' && !stage) {
    editorError.value = '所属环节已不存在，请重新选择';
    return;
  }
  try {
    const description = draft.description.trim();
    const existing = siblings.find((item) => item.id === draft.id);
    if (draft.id && !existing) {
      editorError.value = '编辑项已不存在，请重新选择';
      return;
    }
    if (existing) {
      existing.name = name;
      existing.description = description;
    } else {
      const id = `${draft.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (draft.kind === 'stage') {
        const workflow = ensureWorkflow(currentScenario.value._id);
        workflow.stages.push({ id, name, description, order: workflow.stages.length, steps: [] });
      } else stage?.steps.push({ id, name, description, order: stage.steps.length, assets: [] });
    }
    notice.value = `${draft.kind === 'stage' ? '环节' : '节点'}已保存`;
    editor.value = null;
  } catch (caught) {
    editorError.value = caught instanceof Error ? caught.message : '保存失败';
  }
}

function moveItem(items: Array<{ id: string; order: number }>, id: string, direction: -1 | 1) {
  if (!canEdit.value) return;
  if (
    items !== currentWorkflow.value?.stages &&
    !currentWorkflow.value?.stages.some((stage) => stage.steps === items)
  )
    return;
  const sorted = [...items].sort((left, right) => left.order - right.order);
  const index = sorted.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return;
  const [moved] = sorted.splice(index, 1);
  if (!moved) return;
  sorted.splice(nextIndex, 0, moved);
  sorted.forEach((item, order) => {
    item.order = order;
  });
}

function removeStage(stage: Stage) {
  if (
    !canEdit.value ||
    !currentWorkflow.value ||
    !currentWorkflow.value.stages.includes(stage) ||
    !window.confirm(`确认删除环节“${stage.name}”？环节下的节点会一并删除。`)
  )
    return;
  currentWorkflow.value.stages = currentWorkflow.value.stages.filter(
    (item) => item.id !== stage.id,
  );
  [...currentWorkflow.value.stages]
    .sort((left, right) => left.order - right.order)
    .forEach((item, order) => {
      item.order = order;
    });
  if (editor.value?.id === stage.id || editor.value?.stageId === stage.id) editor.value = null;
  notice.value = '环节已删除';
}

function removeNode(stage: Stage, node: WorkflowNode) {
  if (
    !canEdit.value ||
    !currentWorkflow.value?.stages.includes(stage) ||
    !stage.steps.includes(node) ||
    !window.confirm(`确认删除节点“${node.name}”？`)
  )
    return;
  stage.steps = stage.steps.filter((item) => item.id !== node.id);
  orderedNodes(stage).forEach((item, order) => {
    item.order = order;
  });
  if (editor.value?.id === node.id) editor.value = null;
  notice.value = '节点已删除';
}

async function importLegacyActivity() {
  if (!canEdit.value || !legacyActivityId.value || !validateBeforeLeave()) return;
  editor.value = null;
  binding.value = true;
  actionError.value = '';
  notice.value = '';
  try {
    await bindLegacyActivity(legacyActivityId.value);
    legacyActivityId.value = '';
    notice.value = '已将所选活动及子活动导入当前场景，旧活动数据已保留。';
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : '旧活动导入失败';
  } finally {
    binding.value = false;
  }
}

watch(
  [selectedDeptId, productId, selectedScenarioId, loading, available],
  async () => {
    const requestSequence = ++legacyLoadSequence;
    editor.value = null;
    legacyActivityId.value = '';
    legacyActivities.value = [];
    legacyError.value = '';
    notice.value = '';
    actionError.value = '';
    legacyLoading.value = false;
    if (!available.value || loading.value || currentScenario.value?.level !== 2) return;
    legacyLoading.value = true;
    try {
      const records = await loadLegacyActivities();
      if (requestSequence === legacyLoadSequence) legacyActivities.value = records;
    } catch (caught) {
      if (requestSequence === legacyLoadSequence)
        legacyError.value = caught instanceof Error ? caught.message : '旧活动加载失败';
    } finally {
      if (requestSequence === legacyLoadSequence) legacyLoading.value = false;
    }
  },
  { immediate: true },
);

defineExpose({ validateBeforeLeave });
</script>

<template>
  <div class="scenario-activity-panel">
    <header class="panel-heading">
      <span class="eyebrow">SCENARIO WORKFLOW</span>
      <h2>环节与节点</h2>
      <p>
        原“归属活动 /
        归属子活动”对应工作流中的环节与节点。选择二级场景后，维护该场景唯一工作流的流程结构。
      </p>
      <small>工作流关联保存在当前浏览器。</small>
    </header>

    <section class="scope-card" aria-label="环节节点场景范围">
      <label
        >部门
        <select
          :value="selectedDeptId"
          aria-label="选择部门"
          :disabled="binding"
          @change="changeScope($event, 'department')"
        >
          <option value="">请选择部门</option>
          <option v-for="department in departments" :key="department._id" :value="department._id">
            {{ deptPath(department._id) }}
          </option>
        </select>
      </label>
      <label
        >产品
        <select
          :value="productId"
          aria-label="选择产品"
          :disabled="loading || binding || !selectedDeptId"
          @change="changeScope($event, 'product')"
        >
          <option value="">请选择产品</option>
          <option v-for="product in productOptions" :key="product._id" :value="product._id">
            {{ product.name }}
          </option>
        </select>
      </label>
      <label
        >一级场景
        <select
          :value="primaryId"
          aria-label="选择一级场景"
          :disabled="!available || loading || binding || !productId"
          @change="changeScope($event, 'primary')"
        >
          <option value="">请选择一级场景</option>
          <option v-for="scenario in primaryScenarios" :key="scenario._id" :value="scenario._id">
            {{ scenario.name }}
          </option>
        </select>
      </label>
      <label
        >二级场景
        <select
          :value="currentScenario?.level === 2 ? selectedScenarioId : ''"
          aria-label="选择二级场景"
          :disabled="!available || loading || binding || !primaryId"
          @change="changeScope($event, 'secondary')"
        >
          <option value="">请选择二级场景</option>
          <option v-for="scenario in secondaryScenarios" :key="scenario._id" :value="scenario._id">
            {{ scenario.name }}
          </option>
        </select>
      </label>
    </section>

    <p v-if="loading" class="feedback" role="status">正在加载场景配置…</p>
    <p v-if="error || actionError" class="feedback error" role="alert">
      {{ error || actionError }}
    </p>
    <p v-if="notice" class="feedback" role="status">{{ notice }}</p>

    <div v-if="currentScenario?.level !== 2" class="empty-state">
      <h3>请选择二级场景</h3>
      <p>一级场景用于分组；环节与节点归属于选中的二级场景。</p>
    </div>
    <template v-else>
      <section class="workflow-structure" aria-label="场景环节与节点">
        <header class="structure-heading">
          <div>
            <h3>
              {{ primaryScenarios.find((item) => item._id === primaryId)?.name }} /
              {{ currentScenario.name }}
            </h3>
            <p>
              {{
                currentWorkflow
                  ? `工作流：${currentWorkflow.name}`
                  : '添加环节或导入旧活动后，将创建该场景的工作流。'
              }}
            </p>
          </div>
          <button
            type="button"
            class="primary-button"
            :disabled="!canEdit"
            @click="openEditor('stage')"
          >
            添加环节
          </button>
        </header>

        <form v-if="editor" class="structure-editor" @submit.prevent="saveEditor">
          <h4>{{ editor.id ? '编辑' : '添加' }}{{ editor.kind === 'stage' ? '环节' : '节点' }}</h4>
          <label
            >{{ editor.kind === 'stage' ? '环节名称' : '节点名称' }}
            <input
              v-model="editor.name"
              :aria-label="editor.kind === 'stage' ? '环节名称' : '节点名称'"
              maxlength="100"
              :disabled="!canEdit"
            />
          </label>
          <label
            >描述<textarea
              v-model="editor.description"
              aria-label="描述"
              rows="2"
              :disabled="!canEdit"
            ></textarea>
          </label>
          <p v-if="editorError" class="error" role="alert">{{ editorError }}</p>
          <div class="actions">
            <button type="submit" class="primary-button" :disabled="!canEdit">保存</button
            ><button type="button" @click="editor = null">取消</button>
          </div>
        </form>

        <div v-if="!stages.length && !editor" class="empty-state compact">
          <h4>该场景尚未配置环节与节点</h4>
          <p>添加环节后，可继续添加节点；也可从下方导入旧活动结构。</p>
        </div>
        <div v-else class="stages-list">
          <article
            v-for="(stage, stageIndex) in stages"
            :key="stage.id"
            class="scenario-stage-card"
            :data-stage-id="stage.id"
            :aria-label="`环节 ${stage.name}`"
          >
            <header class="stage-heading">
              <div class="stage-summary">
                <span class="stage-number">{{ stageIndex + 1 }}</span>
                <div>
                  <h4>{{ stage.name }}</h4>
                  <p v-if="stage.description">{{ stage.description }}</p>
                </div>
                <span class="count">{{ stage.steps.length }} 个节点</span>
              </div>
              <div class="actions">
                <button
                  type="button"
                  :disabled="!canEdit || stageIndex === 0"
                  :aria-label="`上移环节 ${stage.name}`"
                  @click="moveItem(currentWorkflow!.stages, stage.id, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  :disabled="!canEdit || stageIndex === stages.length - 1"
                  :aria-label="`下移环节 ${stage.name}`"
                  @click="moveItem(currentWorkflow!.stages, stage.id, 1)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  :disabled="!canEdit"
                  :aria-label="`编辑环节 ${stage.name}`"
                  @click="openEditor('stage', stage)"
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="danger-button"
                  :disabled="!canEdit"
                  :aria-label="`删除环节 ${stage.name}`"
                  @click="removeStage(stage)"
                >
                  删除
                </button>
                <button type="button" :disabled="!canEdit" @click="openEditor('node', stage)">
                  添加节点
                </button>
              </div>
            </header>
            <ol v-if="stage.steps.length" class="nodes-list">
              <li
                v-for="(node, nodeIndex) in orderedNodes(stage)"
                :key="node.id"
                class="scenario-node-row"
                :data-node-id="node.id"
              >
                <div class="node-summary">
                  <span class="node-number">{{ stageIndex + 1 }}.{{ nodeIndex + 1 }}</span>
                  <div>
                    <strong>{{ node.name }}</strong>
                    <p v-if="node.description">{{ node.description }}</p>
                  </div>
                  <span class="count">{{ node.assets.length }} 个资产</span>
                </div>
                <div class="actions">
                  <button
                    type="button"
                    :disabled="!canEdit || nodeIndex === 0"
                    :aria-label="`上移节点 ${node.name}`"
                    @click="moveItem(stage.steps, node.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    :disabled="!canEdit || nodeIndex === stage.steps.length - 1"
                    :aria-label="`下移节点 ${node.name}`"
                    @click="moveItem(stage.steps, node.id, 1)"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    :disabled="!canEdit"
                    :aria-label="`编辑节点 ${node.name}`"
                    @click="openEditor('node', stage, node)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="danger-button"
                    :disabled="!canEdit"
                    :aria-label="`删除节点 ${node.name}`"
                    @click="removeNode(stage, node)"
                  >
                    删除
                  </button>
                </div>
              </li>
            </ol>
            <p v-else class="no-nodes">暂无节点，点击“添加节点”继续配置。</p>
          </article>
        </div>
      </section>

      <section class="legacy-card" aria-label="导入旧活动">
        <div>
          <h3>从旧活动导入</h3>
          <p>选择一个原归属活动，将它及其子活动复制为当前场景的环节和节点。旧活动数据会保留。</p>
        </div>
        <div class="legacy-controls">
          <select
            v-model="legacyActivityId"
            aria-label="选择旧活动"
            :disabled="!canEdit || legacyLoading"
          >
            <option value="">{{ legacyLoading ? '正在加载旧活动…' : '请选择旧活动' }}</option>
            <option
              v-for="activity in legacyPrimaryActivities"
              :key="activity.id"
              :value="activity.id"
            >
              {{ activity.name }}（{{
                legacyActivities.filter((item) => item.parentId === activity.id).length
              }}
              个子活动）
            </option>
          </select>
          <button
            type="button"
            :disabled="!canEdit || !legacyActivityId || legacyLoading"
            @click="importLegacyActivity"
          >
            {{ binding ? '正在导入…' : '导入到当前场景' }}
          </button>
        </div>
        <p v-if="legacyError" class="error" role="alert">{{ legacyError }}</p>
        <p v-else-if="!legacyLoading && !legacyPrimaryActivities.length" class="muted">
          当前范围暂无可导入的旧活动。
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.scenario-activity-panel,
.scenario-activity-panel * {
  box-sizing: border-box;
}
.scenario-activity-panel {
  display: grid;
  gap: 18px;
  min-width: 0;
  color: #17233d;
}
.panel-heading h2 {
  margin: 6px 0 10px;
  font-size: 24px;
}
.panel-heading p,
.panel-heading small,
.structure-heading p,
.legacy-card p,
.stage-summary p,
.node-summary p {
  margin: 0;
  color: #66748a;
  line-height: 1.65;
}
.panel-heading small {
  display: block;
  margin-top: 8px;
  font-size: 12px;
}
.eyebrow {
  color: #5264d8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.scope-card,
.workflow-structure,
.legacy-card {
  padding: 20px;
  border: 1px solid #dfe6f2;
  border-radius: 13px;
  background: #fff;
}
.scope-card {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr 1fr;
  gap: 14px;
}
.scenario-activity-panel label {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: #52647d;
  font-size: 13px;
}
.scenario-activity-panel select,
.scenario-activity-panel input,
.scenario-activity-panel textarea {
  width: 100%;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #d8e0ee;
  border-radius: 7px;
  background: #fff;
  color: #17233d;
  font: inherit;
}
.scenario-activity-panel textarea {
  resize: vertical;
}
.scenario-activity-panel button {
  padding: 7px 10px;
  border: 1px solid #d8e0ee;
  border-radius: 6px;
  background: #fff;
  color: #52647d;
  font: inherit;
  font-size: 13px;
}
.scenario-activity-panel button:not(:disabled),
.scenario-activity-panel select:not(:disabled) {
  cursor: pointer;
}
.scenario-activity-panel button:hover:not(:disabled) {
  border-color: #5264d8;
  color: #4054ce;
}
.scenario-activity-panel button:disabled,
.scenario-activity-panel select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.scenario-activity-panel button:focus-visible,
.scenario-activity-panel select:focus-visible,
.scenario-activity-panel input:focus-visible,
.scenario-activity-panel textarea:focus-visible {
  outline: 2px solid #5264d8;
  outline-offset: 2px;
}
.scenario-activity-panel .primary-button {
  border-color: #5264d8;
  background: #5264d8;
  color: #fff;
}
.scenario-activity-panel .primary-button:hover:not(:disabled) {
  background: #4054ce;
  color: #fff;
}
.scenario-activity-panel .danger-button {
  color: #be4149;
}
.structure-heading,
.stage-heading,
.scenario-node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.structure-heading {
  align-items: flex-start;
  margin-bottom: 18px;
}
.structure-heading h3,
.legacy-card h3 {
  margin: 0 0 7px;
  font-size: 16px;
}
.structure-heading > button {
  flex-shrink: 0;
}
.structure-editor {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid #ced6ff;
  border-radius: 9px;
  background: #f7f8ff;
}
.structure-editor h4 {
  margin: 0;
  font-size: 15px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.stages-list {
  display: grid;
  gap: 14px;
}
.scenario-stage-card {
  border: 1px solid #e1e7f1;
  border-radius: 10px;
  overflow: hidden;
}
.stage-heading {
  padding: 16px;
  background: #f8faff;
}
.stage-summary,
.node-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.stage-summary h4 {
  margin: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.stage-number {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: #e7ecff;
  color: #4054ce;
  font-size: 13px;
  font-weight: 700;
}
.count {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eef1f6;
  color: #7a879b;
  font-size: 11px;
  white-space: nowrap;
}
.nodes-list {
  padding: 0 16px;
  margin: 0;
  list-style: none;
}
.scenario-node-row {
  padding: 14px 0;
  border-top: 1px solid #edf1f7;
}
.node-summary strong {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.node-number {
  color: #8796aa;
  font-size: 12px;
}
.stage-summary p,
.node-summary p {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.no-nodes {
  margin: 0;
  padding: 18px 16px;
  color: #8996a9;
  font-size: 13px;
}
.empty-state {
  padding: 44px 20px;
  border: 1px dashed #d8e0ee;
  border-radius: 12px;
  background: #fafbfe;
  text-align: center;
}
.empty-state h3,
.empty-state h4 {
  margin: 0 0 8px;
  color: #52647d;
}
.empty-state p {
  margin: 0;
  color: #8391a6;
  font-size: 13px;
  line-height: 1.7;
}
.empty-state.compact {
  padding: 30px 16px;
}
.legacy-card {
  display: grid;
  gap: 14px;
}
.legacy-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.legacy-controls select {
  flex: 1;
}
.legacy-controls button {
  flex-shrink: 0;
}
.feedback {
  margin: 0;
  padding: 11px 14px;
  border-radius: 8px;
  background: #eff4ff;
  color: #4054ce;
  font-size: 13px;
}
.error {
  color: #be4149;
  font-size: 13px;
}
.feedback.error {
  background: #fff2f2;
}
.muted {
  color: #8996a9;
  font-size: 13px;
}
@media (max-width: 1120px) {
  .scope-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stage-heading,
  .scenario-node-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
@media (max-width: 650px) {
  .scope-card {
    grid-template-columns: minmax(0, 1fr);
  }
  .scope-card,
  .workflow-structure,
  .legacy-card {
    padding: 14px;
  }
  .structure-heading,
  .legacy-controls {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

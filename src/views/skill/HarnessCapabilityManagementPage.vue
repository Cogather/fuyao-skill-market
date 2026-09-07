<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

import HarnessCapabilityCatalogPanel from '../../components/skill/HarnessCapabilityCatalogPanel.vue';
import SkillMasterManagementPanel from '../../components/skill/SkillMasterManagementPanelV2.vue';
import type { HarnessCapabilityType } from '../../services/skillMarket/harnessCapabilityPlanningService';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';
import ExtensionPublishPage from './ExtensionPublishPage.vue';

type DepartmentTreeNode = {
  id?: string;
  deptCode?: string;
  levelNo?: number;
  name: string;
  children?: DepartmentTreeNode[];
};

type CapabilityManagementTab = HarnessCapabilityType | 'extension';
type CatalogAssetType = 'Agent' | 'Skill' | 'Command';
type CatalogAction = 'create' | 'import';
type CatalogScopeChange = {
  capabilityType: HarnessCapabilityType;
  snapshot: HarnessScopeSnapshot;
};
type CatalogPanelActions = {
  applyExternalScope: (scope: HarnessScopeSnapshot) => boolean;
  openCreate: () => void;
  triggerImport: () => void;
};

const props = withDefaults(
  defineProps<{
    userId?: string;
    userName?: string;
    departmentTree?: DepartmentTreeNode[];
    currentUserDepartmentPath?: string[];
    allowedDepartmentNames?: string[];
    allowedDepartmentPaths?: string[][];
    restrictToAllowedDepartments?: boolean;
    scopeSnapshots?: Partial<Record<HarnessCapabilityType, HarnessScopeSnapshot>>;
    extensionInitialScope?: HarnessScopeSnapshot;
  }>(),
  {
    userId: '',
    userName: '',
    departmentTree: () => [],
    currentUserDepartmentPath: () => [],
    allowedDepartmentNames: () => [],
    allowedDepartmentPaths: () => [],
    restrictToAllowedDepartments: false,
    scopeSnapshots: () => ({}),
    extensionInitialScope: undefined,
  },
);

const emit = defineEmits<{
  'catalog-scope-change': [change: CatalogScopeChange];
  'extension-scope-change': [snapshot: HarnessScopeSnapshot];
}>();

const managementTabs: Array<{
  key: CapabilityManagementTab;
  label: string;
  summary: string;
}> = [
  { key: 'command', label: 'Command 清单', summary: '维护可用于场景关系配置的 Command。' },
  { key: 'skill', label: 'Skill 清单', summary: '维护和引入可复用的原子 Skill。' },
  { key: 'agent', label: 'Agent 清单', summary: '维护可用于场景关系配置的 Agent。' },
  { key: 'extension', label: 'Extension 发布', summary: '按业务场景组织并发布 Extension。' },
];

const activeManagementTab = ref<CapabilityManagementTab>('command');
const activatedTabs = ref<Record<CapabilityManagementTab, boolean>>({
  command: true,
  skill: false,
  agent: false,
  extension: false,
});
const activeTabMeta = computed(
  () => managementTabs.find((tab) => tab.key === activeManagementTab.value) ?? managementTabs[0]!,
);

const commandCatalogPanel = ref<InstanceType<typeof HarnessCapabilityCatalogPanel> | null>(null);
const skillCatalogPanel = ref<InstanceType<typeof SkillMasterManagementPanel> | null>(null);
const agentCatalogPanel = ref<InstanceType<typeof HarnessCapabilityCatalogPanel> | null>(null);

function normalizeDepartmentPath(path: string[] | undefined): string[] {
  return (path ?? []).map((segment) => segment.trim()).filter(Boolean);
}

function sameDepartmentPath(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeDepartmentPath(left);
  const normalizedRight = normalizeDepartmentPath(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((segment, index) => segment === normalizedRight[index])
  );
}

function departmentPathStartsWith(path: string[], requiredPrefix: string[]): boolean {
  const normalizedPath = normalizeDepartmentPath(path);
  const normalizedPrefix = normalizeDepartmentPath(requiredPrefix);
  return (
    normalizedPrefix.length > 0 &&
    normalizedPath.length >= normalizedPrefix.length &&
    normalizedPrefix.every((segment, index) => normalizedPath[index] === segment)
  );
}

function filterDepartmentTreeByPaths(
  nodes: DepartmentTreeNode[],
  allowedPaths: string[][],
  parentPath: string[] = [],
): DepartmentTreeNode[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    const pathIsRelevant = allowedPaths.some(
      (allowedPath) =>
        departmentPathStartsWith(path, allowedPath) ||
        departmentPathStartsWith(allowedPath, path) ||
        sameDepartmentPath(path, allowedPath),
    );
    if (!pathIsRelevant) return [];
    return [
      {
        ...node,
        children: filterDepartmentTreeByPaths(node.children ?? [], allowedPaths, path),
      },
    ];
  });
}

function filterDepartmentTreeByNames(
  nodes: DepartmentTreeNode[],
  allowedNames: Set<string>,
  ancestorAllowed = false,
): DepartmentTreeNode[] {
  return nodes.flatMap((node) => {
    const nodeAllowed = ancestorAllowed || allowedNames.has(node.name.trim());
    const children = filterDepartmentTreeByNames(node.children ?? [], allowedNames, nodeAllowed);
    if (!nodeAllowed && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

const normalizedAllowedDepartmentPaths = computed(() =>
  props.allowedDepartmentPaths
    .map((path) => normalizeDepartmentPath(path))
    .filter((path) => path.length > 0),
);
const currentUserMinimumDepartmentPath = computed(() =>
  normalizeDepartmentPath(props.currentUserDepartmentPath),
);
const defaultDepartmentPath = computed(() =>
  normalizeDepartmentPath(
    normalizedAllowedDepartmentPaths.value[0] ?? currentUserMinimumDepartmentPath.value,
  ),
);
const catalogDepartmentTree = computed(() => {
  if (!props.restrictToAllowedDepartments) return props.departmentTree;
  if (normalizedAllowedDepartmentPaths.value.length > 0) {
    return filterDepartmentTreeByPaths(
      props.departmentTree,
      normalizedAllowedDepartmentPaths.value,
    );
  }
  return filterDepartmentTreeByNames(
    props.departmentTree,
    new Set(props.allowedDepartmentNames.map((name) => name.trim()).filter(Boolean)),
  );
});

function selectManagementTab(tab: CapabilityManagementTab): void {
  activatedTabs.value[tab] = true;
  activeManagementTab.value = tab;
}

async function focusManagementTab(index: number): Promise<void> {
  const normalizedIndex = (index + managementTabs.length) % managementTabs.length;
  const tab = managementTabs[normalizedIndex];
  if (!tab) return;
  selectManagementTab(tab.key);
  await nextTick();
  document.getElementById(`capability-management-tab-${tab.key}`)?.focus();
}

function onManagementTabKeydown(event: KeyboardEvent, index: number): void {
  let targetIndex: number | undefined;
  if (event.key === 'ArrowRight') targetIndex = index + 1;
  else if (event.key === 'ArrowLeft') targetIndex = index - 1;
  else if (event.key === 'Home') targetIndex = 0;
  else if (event.key === 'End') targetIndex = managementTabs.length - 1;
  if (targetIndex === undefined) return;
  event.preventDefault();
  void focusManagementTab(targetIndex);
}

function catalogScopeIsAllowed(scope: HarnessScopeSnapshot): boolean {
  if (!props.restrictToAllowedDepartments) return true;
  const path = normalizeDepartmentPath(scope.departmentPath);
  if (normalizedAllowedDepartmentPaths.value.length > 0) {
    return normalizedAllowedDepartmentPaths.value.some((allowedPath) =>
      departmentPathStartsWith(path, allowedPath),
    );
  }
  const allowedNames = new Set(
    props.allowedDepartmentNames.map((name) => name.trim()).filter(Boolean),
  );
  return path.some((segment) => allowedNames.has(segment));
}

function emitCatalogScopeSnapshot(
  capabilityType: HarnessCapabilityType,
  snapshot: HarnessScopeSnapshot,
): void {
  if (!catalogScopeIsAllowed(snapshot)) return;
  emit('catalog-scope-change', {
    capabilityType,
    snapshot: { ...snapshot, departmentPath: [...snapshot.departmentPath] },
  });
}

function emitExtensionScopeSnapshot(snapshot: HarnessScopeSnapshot): void {
  emit('extension-scope-change', {
    ...snapshot,
    departmentPath: [...snapshot.departmentPath],
  });
}

function capabilityTypeForAsset(assetType: CatalogAssetType): HarnessCapabilityType {
  if (assetType === 'Command') return 'command';
  if (assetType === 'Agent') return 'agent';
  return 'skill';
}

function catalogPanelFor(capabilityType: HarnessCapabilityType): CatalogPanelActions | null {
  if (capabilityType === 'command') return commandCatalogPanel.value;
  if (capabilityType === 'agent') return agentCatalogPanel.value;
  return skillCatalogPanel.value;
}

async function openCatalogAction(
  assetType: CatalogAssetType,
  action: CatalogAction,
  scope: HarnessScopeSnapshot,
): Promise<void> {
  const capabilityType = capabilityTypeForAsset(assetType);
  selectManagementTab(capabilityType);
  await nextTick();

  const panel = catalogPanelFor(capabilityType);
  if (!panel) return;
  const externalScope = { ...scope, departmentPath: [...scope.departmentPath] };
  if (!catalogScopeIsAllowed(externalScope)) return;
  if (panel.applyExternalScope(externalScope) === false) return;
  if (action === 'create') panel.openCreate();
  else panel.triggerImport();
}

defineExpose({ openCatalogAction });
</script>

<template>
  <div class="capability-management-page harness-viewport-page">
    <header class="capability-management-hero harness-page-heading">
      <div>
        <h2 class="harness-page-title">资产清单</h2>
        <p class="harness-page-description">
          集中维护 Command、Skill 与 Agent 原子能力清单，并完成 Extension 发布。当前分区：{{
            activeTabMeta.summary
          }}
        </p>
      </div>
    </header>

    <nav class="planning-tabs" role="tablist" aria-label="资产清单分区">
      <button
        v-for="(tab, index) in managementTabs"
        :id="`capability-management-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        class="planning-tab"
        role="tab"
        :class="{ 'is-active': activeManagementTab === tab.key }"
        :aria-label="tab.label"
        :aria-selected="activeManagementTab === tab.key"
        :aria-controls="`capability-management-panel-${tab.key}`"
        :tabindex="activeManagementTab === tab.key ? 0 : -1"
        @click="selectManagementTab(tab.key)"
        @keydown="onManagementTabKeydown($event, index)"
      >
        <span class="planning-tab__icon" aria-hidden="true">{{
          String(index + 1).padStart(2, '0')
        }}</span>
        <span
          ><strong>{{ tab.label }}</strong></span
        >
      </button>
    </nav>

    <section
      v-show="activeManagementTab === 'command'"
      id="capability-management-panel-command"
      class="capability-management-panel"
      role="tabpanel"
      aria-labelledby="capability-management-tab-command"
    >
      <HarnessCapabilityCatalogPanel
        v-if="activatedTabs.command"
        ref="commandCatalogPanel"
        capability-type="command"
        :user-id="props.userId"
        :department-tree="catalogDepartmentTree"
        :current-user-department-path="currentUserMinimumDepartmentPath"
        :default-department-path="defaultDepartmentPath"
        :initial-scope="props.scopeSnapshots.command"
        @scope-change="emitCatalogScopeSnapshot('command', $event)"
      />
    </section>

    <section
      v-show="activeManagementTab === 'skill'"
      id="capability-management-panel-skill"
      class="capability-management-panel"
      role="tabpanel"
      aria-labelledby="capability-management-tab-skill"
    >
      <SkillMasterManagementPanel
        v-if="activatedTabs.skill"
        ref="skillCatalogPanel"
        :department-tree="catalogDepartmentTree"
        :user-id="props.userId"
        :current-user-department-path="currentUserMinimumDepartmentPath"
        :allowed-department-names="props.allowedDepartmentNames"
        :allowed-department-paths="props.allowedDepartmentPaths"
        :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
        :initial-scope="props.scopeSnapshots.skill"
        @scope-change="emitCatalogScopeSnapshot('skill', $event)"
      />
    </section>

    <section
      v-show="activeManagementTab === 'agent'"
      id="capability-management-panel-agent"
      class="capability-management-panel"
      role="tabpanel"
      aria-labelledby="capability-management-tab-agent"
    >
      <HarnessCapabilityCatalogPanel
        v-if="activatedTabs.agent"
        ref="agentCatalogPanel"
        capability-type="agent"
        :user-id="props.userId"
        :department-tree="catalogDepartmentTree"
        :current-user-department-path="currentUserMinimumDepartmentPath"
        :default-department-path="defaultDepartmentPath"
        :initial-scope="props.scopeSnapshots.agent"
        @scope-change="emitCatalogScopeSnapshot('agent', $event)"
      />
    </section>

    <section
      v-show="activeManagementTab === 'extension'"
      id="capability-management-panel-extension"
      class="capability-management-panel"
      role="tabpanel"
      aria-labelledby="capability-management-tab-extension"
    >
      <ExtensionPublishPage
        v-if="activatedTabs.extension"
        :user-id="props.userId"
        :user-name="props.userName"
        :department-tree="props.departmentTree"
        :current-user-department-path="currentUserMinimumDepartmentPath"
        :allowed-department-paths="props.allowedDepartmentPaths"
        :restrict-to-allowed-departments="props.restrictToAllowedDepartments"
        :initial-scope="props.extensionInitialScope"
        @scope-change="emitExtensionScopeSnapshot"
      />
    </section>
  </div>
</template>

<style scoped>
.capability-management-page {
  display: grid;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  color: #17233d;
}

.capability-management-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  margin: 0;
  padding: 28px 0 30px;
}

.capability-management-hero > div {
  width: 100%;
  min-width: 0;
}

.capability-management-hero h2 {
  margin: 0;
  color: #07172f;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.18;
}

.capability-management-hero p {
  max-width: none;
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.planning-tabs {
  display: inline-flex;
  align-items: stretch;
  gap: 4px;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  overflow-x: auto;
  border: 1px solid #dfe6f2;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 24px rgba(35, 52, 84, 0.05);
}

.planning-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 168px;
  height: 54px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #7a879b;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: 160ms ease;
}

.planning-tab:hover {
  background: #f6f8fc;
  color: #465570;
}

.planning-tab:focus-visible {
  outline: 3px solid rgba(80, 99, 216, 0.24);
  outline-offset: -3px;
}

.planning-tab.is-active {
  background: #eef2ff;
  color: #4054ce;
  box-shadow: inset 0 0 0 1px #d6dcff;
}

.planning-tab__icon {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #f0f2f6;
  color: #7d899b;
  font-size: 10px;
  font-weight: 900;
}

.planning-tab.is-active .planning-tab__icon {
  background: #5063d8;
  color: #ffffff;
}

.planning-tab > span:last-child {
  display: grid;
  gap: 2px;
}

.planning-tab strong {
  font-size: 13px;
  font-weight: 900;
}

.capability-management-panel {
  display: grid;
  gap: 16px;
  min-width: 0;
}

@media (max-width: 760px) {
  .capability-management-hero {
    padding: 22px 0 20px;
  }

  .capability-management-hero h2 {
    font-size: 34px;
  }

  .planning-tab {
    min-width: 148px;
  }
}
.capability-management-page {
  display: flex;
  flex-direction: column;
}

.planning-tabs {
  flex-shrink: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .capability-management-panel {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  .capability-management-panel > :deep(*) {
    flex: 1;
    min-height: 0;
  }
}
</style>

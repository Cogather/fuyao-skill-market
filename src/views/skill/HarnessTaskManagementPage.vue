<script setup lang="ts">
import { computed, ref } from 'vue';

import SkillPlanningTaskPanel from '../../components/skill/SkillPlanningTaskPanel.vue';

import type { PlanningTaskCapabilityType } from '../../services/skillMarket/skillPlanningTaskService';
type TaskManagementTab = `${PlanningTaskCapabilityType}-tasks`;

withDefaults(defineProps<{ userId?: string }>(), { userId: '' });

const activeTaskTab = ref<TaskManagementTab>('command-tasks');
const taskTabs: Array<{
  key: TaskManagementTab;
  label: string;
  description: string;
  capabilityType: PlanningTaskCapabilityType;
}> = [
  {
    key: 'command-tasks',
    label: 'Command待办',
    description: '跟踪 Command 规划任务',
    capabilityType: 'command',
  },
  {
    key: 'skill-tasks',
    label: 'Skill待办',
    description: '跟踪 Skill 规划任务',
    capabilityType: 'skill',
  },
  {
    key: 'agent-tasks',
    label: 'Agent待办',
    description: '跟踪 Agent 规划任务',
    capabilityType: 'agent',
  },
];
const activeTaskTabMeta = computed(
  () => taskTabs.find((tab) => tab.key === activeTaskTab.value) ?? taskTabs[0],
);
</script>

<template>
  <div class="task-management-page harness-viewport-page">
    <header class="task-management-hero harness-page-heading">
      <h2 class="harness-page-title">任务管理</h2>
      <p class="harness-page-description">
        集中查看当前用户负责的 Harness 任务，持续跟踪 Command、Skill 与 Agent 建设状态及完成进度。
      </p>
    </header>

    <nav class="task-management-tabs" role="tablist" aria-label="任务管理分区">
      <button
        v-for="(tab, index) in taskTabs"
        :id="'task-management-tab-' + tab.key"
        :key="tab.key"
        type="button"
        class="task-management-tab"
        role="tab"
        :class="{ 'is-active': activeTaskTab === tab.key }"
        :aria-selected="activeTaskTab === tab.key"
        :aria-controls="'task-management-panel-' + tab.key"
        @click="activeTaskTab = tab.key"
      >
        <span class="task-management-tab__icon" aria-hidden="true">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span>
          <strong>{{ tab.label }}</strong>
          <small>{{ tab.description }}</small>
        </span>
      </button>
    </nav>

    <section
      :id="'task-management-panel-' + activeTaskTabMeta.key"
      :key="activeTaskTabMeta.key"
      class="task-management-content"
      role="tabpanel"
      :aria-labelledby="'task-management-tab-' + activeTaskTabMeta.key"
    >
      <SkillPlanningTaskPanel
        :capability-type="activeTaskTabMeta.capabilityType"
        :user-id="userId"
      />
    </section>
  </div>
</template>

<style scoped>
.task-management-page {
  display: grid;
  gap: 16px;
  width: 100%;
  max-width: none;
  min-width: 0;
  justify-self: stretch;
  box-sizing: border-box;
  color: #17233d;
}

.task-management-hero {
  padding: 28px 0 30px;
}

.task-management-hero h2 {
  margin: 0;
  color: #07172f;
  font-size: 42px;
  font-weight: 900;
  line-height: 1.18;
}

.task-management-hero p {
  max-width: 820px;
  margin: 12px 0 0;
  color: #52647d;
  font-size: 15px;
  line-height: 1.7;
}

.task-management-tabs {
  display: inline-flex;
  align-items: stretch;
  gap: 6px;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  padding: 5px;
  border: 1px solid #dfe6f2;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 4px 16px rgba(35, 52, 84, 0.04);
}

.task-management-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  min-width: 216px;
  min-height: 64px;
  padding: 10px 16px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.task-management-tab:hover {
  background: #f5f7ff;
  color: #4054ce;
}

.task-management-tab:focus-visible {
  outline: 3px solid rgba(80, 99, 216, 0.3);
  outline-offset: 2px;
}

.task-management-tab.is-active {
  background: #eef2ff;
  color: #4054ce;
  box-shadow: inset 0 0 0 1px #cfd8ff, 0 3px 10px rgba(80, 99, 216, 0.08);
}

.task-management-tab__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #f0f3f9;
  color: #73829b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.task-management-tab.is-active .task-management-tab__icon {
  background: #5063d8;
  color: #fff;
}

.task-management-tab > span:last-child {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.task-management-tab strong {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
}

.task-management-tab small {
  margin: 0;
  color: #7b8aa2;
  font-size: 11px;
  line-height: 16px;
}

.task-management-tab.is-active small {
  color: #6878aa;
}

.task-management-content {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-width: 0;
  justify-self: stretch;
  padding-top: 6px;
}

@media (max-width: 820px) {
  .task-management-tabs {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  .task-management-tab {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .task-management-hero h2 {
    font-size: 34px;
  }
}
.task-management-page {
  display: flex;
  flex-direction: column;
}

.task-management-tabs {
  flex-shrink: 0;
}

.task-management-content {
  padding-top: 0;
}

@media (min-width: 1101px) and (min-height: 900px) {
  .task-management-content {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  .task-management-content > :deep(*) {
    flex: 1;
    min-height: 0;
  }
}
</style>

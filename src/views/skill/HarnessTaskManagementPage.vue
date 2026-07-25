<script setup lang="ts">
import { ref } from 'vue';

import SkillPlanningTaskPanel from '../../components/skill/SkillPlanningTaskPanel.vue';

type TaskManagementTab = 'skill-tasks';

withDefaults(defineProps<{ userId?: string }>(), { userId: '' });

const activeTaskTab = ref<TaskManagementTab>('skill-tasks');
const taskTabs: Array<{
  key: TaskManagementTab;
  label: string;
  description: string;
}> = [{ key: 'skill-tasks', label: 'Skill待办', description: '跟踪 Skill 规划任务' }];
</script>

<template>
  <div class="task-management-page">
    <header class="task-management-hero">
      <h2>任务管理</h2>
      <p>集中查看当前用户负责的 Harness 任务，持续跟踪 Skill 建设状态与完成进度。</p>
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
      v-if="activeTaskTab === 'skill-tasks'"
      id="task-management-panel-skill-tasks"
      class="task-management-content"
      role="tabpanel"
      aria-labelledby="task-management-tab-skill-tasks"
    >
      <SkillPlanningTaskPanel :user-id="userId" />
    </section>
  </div>
</template>

<style scoped>
.task-management-page {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
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
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border: 1px solid #dfe6f2;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 24px rgba(35, 52, 84, 0.05);
}

.task-management-tab {
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
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: 160ms ease;
}

.task-management-tab:hover {
  background: #f6f8fc;
  color: #465570;
}

.task-management-tab.is-active {
  background: #eef2ff;
  color: #4054ce;
  box-shadow: inset 0 0 0 1px #d6dcff;
}

.task-management-tab__icon {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #f0f2f6;
  color: #7d899b;
  font-size: 10px;
  font-weight: 900;
}

.task-management-tab.is-active .task-management-tab__icon {
  background: #5063d8;
  color: #fff;
}

.task-management-tab > span:last-child {
  display: grid;
  gap: 2px;
}

.task-management-tab strong {
  font-size: 13px;
  font-weight: 900;
}

.task-management-tab small {
  color: #99a3b3;
  font-size: 10px;
}

.task-management-content {
  min-width: 0;
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
</style>

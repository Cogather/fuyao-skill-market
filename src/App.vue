<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { RouterView, useRouter } from 'vue-router';

import { useSkillMarketStore } from './stores/skillMarketStore';
// import { useProfileStore } from './stores/userStore';

const skillMarketStore = useSkillMarketStore();
// const profileStore = useProfileStore();
const router = useRouter();
const PARENT_CONTEXT_STORAGE_KEY = '__skill_market_parent_context_v1__';

// 当前项目的用户上下文由父应用注入，暂不调用 /users/validate。

  
function firstString(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
}

function syncRouteFromParent(payload: Record<string, unknown>): void {
  const tab = firstString(payload.tab) || 'hot';
  const skillId =
    firstString(payload.skillId) || firstString(payload.skillID) || firstString(payload.skill_id);

  if (skillId) {
    void router.push({
      name: 'skill-detail',
      params: { skillId },
      query: { tab },
    });
    return;
  }

  if (['planning', 'skillPlanning', 'Skill规划', 'Skill 规划', 'skill规划'].includes(tab)) {
    void router.push({ name: 'harness-management' });
    return;
  }

  if (payload.tab != null) {
    void router.push({
      name: 'skill-square',
      query: { tab },
    });
  }
}

function readCachedParentContext(): Record<string, unknown> | undefined {
  if (window.__SKILL_MARKET_PARENT_CONTEXT__) {
    return window.__SKILL_MARKET_PARENT_CONTEXT__;
  }
  try {
    const raw = window.sessionStorage.getItem(PARENT_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function cacheCurrentParentContext(): void {
  const context: Record<string, unknown> = {
    type: 'Skill_Square_Init',
    userId: skillMarketStore.userId,
    userName: skillMarketStore.userName,
    departmentList: skillMarketStore.departmentList,
  };
  window.__SKILL_MARKET_PARENT_CONTEXT__ = context;
  try {
    window.sessionStorage.setItem(PARENT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // iframe 禁用 sessionStorage 时仍保留当前页面内存中的父级上下文。
  }
}

function applyParentContext(p: Record<string, unknown>, source: 'message' | 'buffer'): void {
  let contextUpdated = false;
  const incomingUserId = firstString(p.userId);
  if (incomingUserId) {
    skillMarketStore.updateUserId(incomingUserId);
    contextUpdated = true;
  }
  const incomingUserName = firstString(p.userName);
  if (incomingUserName) {
    skillMarketStore.updateUserName(incomingUserName);
    contextUpdated = true;
  }
  try {
    const departmentSource = p.departmentList ?? p.departmentListStr;
    const list =
      typeof departmentSource === 'string' ? JSON.parse(departmentSource) : departmentSource;
    if (Array.isArray(list)) {
      const keepExistingTree = list.length === 0 && skillMarketStore.departmentList.length > 0;
      if (!keepExistingTree) {
        skillMarketStore.updateDept(list);
        contextUpdated = true;
      }
      console.info('[部门选择链路][Skill_Square_Init] departmentList', {
        receivedAt: new Date().toISOString(),
        source,
        incomingCount: list.length,
        ignoredEmptyUpdate: keepExistingTree,
        currentCount: skillMarketStore.departmentList.length,
        departmentList: list,
      });
    } else if (departmentSource !== undefined) {
      console.warn('[部门选择链路][Skill_Square_Init] 部门树格式无效，已忽略', {
        receivedAt: new Date().toISOString(),
        incomingDepartmentList: list,
        currentCount: skillMarketStore.departmentList.length,
      });
    }
  } catch (error) {
    console.error('父应用部门树解析失败：', error);
  }
  if (contextUpdated) cacheCurrentParentContext();
}

function handleEvent(event: MessageEvent): void {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'Skill_Square_Init') {
    return;
  }
  applyParentContext(p, 'message');
  syncRouteFromParent(p);
}

window.addEventListener('message', handleEvent);
const bufferedParentContext = readCachedParentContext();
if (bufferedParentContext?.type === 'Skill_Square_Init') {
  // 恢复数据上下文但不恢复旧路由，避免刷新 Harness 时被缓存 tab 导回 Skill 广场。
  applyParentContext(bufferedParentContext, 'buffer');
}
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
});
</script>

<template>
  <div class="app-wrapper">
    <RouterView />
  </div>
</template>

<style scoped>
.app-wrapper {
  width: 100%;
  height: 100vh;
}
</style>

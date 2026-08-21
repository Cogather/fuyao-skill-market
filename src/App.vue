<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';

import { useSkillMarketStore } from './stores/skillMarketStore';
import { isUsableDepartmentTree } from './services/skillMarket/departmentTreeLoader';
// import { useProfileStore } from './stores/userStore';

const skillMarketStore = useSkillMarketStore();
// const profileStore = useProfileStore();
const router = useRouter();
const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';

onMounted(() => {
  // 用户信息仍由父应用注入；这里只独立加载真实部门树，避免父消息时序影响 Harness。
  if (transportIsHttp) void skillMarketStore.refreshDepartmentTree();
});

// 当前项目的用户上下文由父应用注入，暂不调用 /users/validate。
// onMounted(async () => {
//   await profileStore.initUserInfo();
//   startTokenCheck();
// });
//
// const startTokenCheck = () => {
//   setInterval(() => {
//     profileStore.checkUserToken();
//   }, 300 * 1000); // 每5分钟检查一次
// };

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

function handleEvent(event: MessageEvent): void {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'Skill_Square_Init') {
    return;
  }
  const incomingUserId = firstString(p.userId);
  if (incomingUserId) {
    skillMarketStore.updateUserId(incomingUserId);
  }
  const incomingUserName = firstString(p.userName);
  if (incomingUserName) {
    skillMarketStore.updateUserName(incomingUserName);
  }
  try {
    const departmentSource = p.departmentList ?? p.departmentListStr;
    const list =
      typeof departmentSource === 'string' ? JSON.parse(departmentSource) : departmentSource;
    if (Array.isArray(list) && isUsableDepartmentTree(list)) {
      const updated = skillMarketStore.updateDept(list, 'parent');
      console.info('[部门选择链路][Skill_Square_Init] departmentList', {
        receivedAt: new Date().toISOString(),
        incomingCount: list.length,
        accepted: updated,
        currentSource: skillMarketStore.departmentTreeSource,
        currentCount: skillMarketStore.departmentList.length,
        departmentList: list,
      });
    } else if (departmentSource !== undefined) {
      console.warn('[部门选择链路][Skill_Square_Init] 收到空部门树，已忽略', {
        receivedAt: new Date().toISOString(),
        incomingDepartmentList: list,
        currentSource: skillMarketStore.departmentTreeSource,
        currentCount: skillMarketStore.departmentList.length,
      });
      if (transportIsHttp && !isUsableDepartmentTree(skillMarketStore.departmentList)) {
        void skillMarketStore.refreshDepartmentTree();
      }
    }
  } catch (error) {
    console.error('父应用部门树解析失败：', error);
    if (transportIsHttp && !isUsableDepartmentTree(skillMarketStore.departmentList)) {
      void skillMarketStore.refreshDepartmentTree();
    }
  }
  syncRouteFromParent(p);
}

window.addEventListener('message', handleEvent);
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

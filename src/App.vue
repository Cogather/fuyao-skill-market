<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';

import { useProfileStore } from './stores/userStore';

const profileStore = useProfileStore();
const router = useRouter();

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
  syncRouteFromParent(p);
}

window.addEventListener('message', handleEvent);

let loginCheckTimer: number | undefined;

// 用户信息已在应用挂载前初始化；页面运行期间每 5 分钟复查一次登录态。
onMounted(() => {
  loginCheckTimer = window.setInterval(() => profileStore.checkUserToken(), 300 * 1000);
});
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
  if (loginCheckTimer !== undefined) {
    window.clearInterval(loginCheckTimer);
  }
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

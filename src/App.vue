<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';

import { useSkillMarketStore } from './stores/skillMarketStore';
import { useProfileStore } from './stores/userStore';

const skillMarketStore = useSkillMarketStore();
const profileStore = useProfileStore();
const router = useRouter();

onMounted(async () => {
  await profileStore.initUserInfo();
  startTokenCheck();
});

const startTokenCheck = () => {
  setInterval(() => {
    profileStore.checkUserToken();
  }, 300 * 1000); // 每5分钟检查一次
};

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

  if (payload.tab != null) {
    void router.push({
      name: 'skill-market',
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
  if (p.type !== 'Skill_Square_Init' && p.type !== 'SKill_Square_Init') {
    return;
  }
  const incomingUserId = firstString(p.userId);
  if (incomingUserId) {
    skillMarketStore.updateUserId(incomingUserId);
  }
  try {
    const departmentSource = p.departmentList ?? p.departmentListStr;
    const list =
      typeof departmentSource === 'string' ? JSON.parse(departmentSource) : departmentSource;
    if (Array.isArray(list)) {
      skillMarketStore.updateDept(list);
      console.log('是否已存入departmentList', skillMarketStore.departmentList);
    }
  } catch (error) {}
  syncRouteFromParent(p);
}

window.addEventListener('message', handleEvent);
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
});
</script>

<template>
  <RouterView />
</template>

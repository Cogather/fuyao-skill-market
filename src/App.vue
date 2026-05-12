<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView } from 'vue-router';

import { useSkillMarketStore } from './stores/skillMarketStore';
import { useProfileStore } from './stores/userStore';

const skillMarketStore = useSkillMarketStore();
const profileStore = useProfileStore();

onMounted(async () => {
  await profileStore.initUserInfo()
  startTokenCheck()
});

const startTokenCheck = () => {
  setInterval(() => {
    profileStore.checkUserToken()
  }, 300 * 1000); // 每5分钟检查一次
}

function handleEvent(event: MessageEvent): void {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'init') {
    return;
  }
  skillMarketStore.updateUserId(p.userId as string);
  try {
    const list = JSON.parse(p.departmentListStr as string);
    skillMarketStore.updateDept(list);
    console.log("是否已存入departmentList", skillMarketStore.departmentList);
  } catch (error) {}
}

window.addEventListener('message', handleEvent);
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
});
</script>

<template>
  <RouterView />
</template>

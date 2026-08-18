<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';

import { useSkillMarketStore } from './stores/skillMarketStore';
import { useProfileStore } from './stores/userStore';
import {
  describeHarnessDepartmentError,
  harnessDepartmentTrace,
  summarizeDepartmentTree,
} from './utils/harnessDepartmentDiagnostics';

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
  const departmentSource = p.departmentList ?? p.departmentListStr;
  harnessDepartmentTrace('parent-init.received', {
    origin: event.origin,
    payloadKeys: Object.keys(p),
    incomingUserId: incomingUserId || '(empty)',
    hasDepartmentList: p.departmentList != null,
    hasDepartmentListStr: p.departmentListStr != null,
    departmentSourceType: Array.isArray(departmentSource)
      ? 'array'
      : departmentSource === null
        ? 'null'
        : typeof departmentSource,
    departmentSourceStringLength:
      typeof departmentSource === 'string' ? departmentSource.length : undefined,
  });
  if (incomingUserId) {
    skillMarketStore.updateUserId(incomingUserId);
  }
  const incomingUserName = firstString(p.userName);
  if (incomingUserName) {
    skillMarketStore.updateUserName(incomingUserName);
  }
  try {
    const list =
      typeof departmentSource === 'string' ? JSON.parse(departmentSource) : departmentSource;
    if (Array.isArray(list)) {
      const rawTreeSummary = summarizeDepartmentTree(list);
      skillMarketStore.updateDept(list);
      harnessDepartmentTrace(
        'parent-init.department-stored',
        {
          userId: skillMarketStore.userId || '(empty)',
          rawTreeSummary,
          storedTreeSummary: summarizeDepartmentTree(skillMarketStore.departmentList),
        },
        rawTreeSummary.rootCount === 0 || rawTreeSummary.namedNodeCount === 0 ? 'warn' : 'info',
      );
    } else {
      harnessDepartmentTrace(
        'parent-init.department-ignored',
        {
          reason: 'departmentList/departmentListStr 解析后不是数组',
          parsedType: list === null ? 'null' : typeof list,
        },
        'warn',
      );
    }
  } catch (error) {
    harnessDepartmentTrace(
      'parent-init.department-parse-failed',
      {
        error: describeHarnessDepartmentError(error),
        departmentSourceStringLength:
          typeof departmentSource === 'string' ? departmentSource.length : undefined,
        departmentSourcePreview:
          typeof departmentSource === 'string' ? departmentSource.slice(0, 300) : undefined,
      },
      'error',
    );
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

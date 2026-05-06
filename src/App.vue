<script setup lang="ts">
import { onBeforeUnmount, provide, ref } from 'vue';
import type { Ref } from 'vue';
import { RouterView } from 'vue-router';

import type { DepartmentTreeNodeDto } from './services/skillMarket/apiTypes';
import {
  normalizeSkillMarketRequestUserId,
  setSkillMarketRequestUserId,
} from './services/skillMarket/requestUserContext';

const mockDepartmentList: DepartmentTreeNodeDto[] = [
  {
    deptName: '核心网产品线mock',
    deptLevel: 1,
    children: [
      {
        deptName: '核心网研究部',
        deptLevel: 2,
        children: [],
      },
    ],
  },
];

/** 父页面 postMessage 下发的部门树；在 setup 中 provide，子组件 inject 同一 Ref 即可响应更新 */
const departmentList = ref<DepartmentTreeNodeDto[] | null>(mockDepartmentList);
provide<Ref<DepartmentTreeNodeDto[] | null>>('departmentList', departmentList);
/** 父页面 postMessage 下发的用户 id；接口层读取同一份上下文补到 `/api/skills...` 请求 */
const userId = ref('');
provide<Ref<string>>('userId', userId);

function updateUserIdFromParent(value: unknown): void {
  const next = normalizeSkillMarketRequestUserId(value);
  userId.value = next;
  setSkillMarketRequestUserId(next);
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

  if ('userId' in p) {
    updateUserIdFromParent(p.userId);
  }

  let list: unknown = null;
  if (Array.isArray(p.departmentList)) {
    list = p.departmentList;
  } else if (typeof p.departmentListStr === 'string' && p.departmentListStr.length > 0) {
    try {
      list = JSON.parse(p.departmentListStr);
    } catch {
      list = null;
    }
  }

  if (Array.isArray(list)) {
    departmentList.value = list as DepartmentTreeNodeDto[];
  }
}

window.addEventListener('message', handleEvent);
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
});
</script>

<template>
  <RouterView />
</template>

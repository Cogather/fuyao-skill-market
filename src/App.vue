<script setup lang="ts">
import { onBeforeUnmount, provide, ref } from 'vue';
import type { Ref } from 'vue';
import { RouterView } from 'vue-router';

import type { DepartmentTreeNodeDto } from './services/skillMarket/apiTypes';

/** 父页面 postMessage 下发的部门树；在 setup 中 provide，子组件 inject 同一 Ref 即可响应更新 */
const departmentList = ref<DepartmentTreeNodeDto[] | null>(null);
provide<Ref<DepartmentTreeNodeDto[] | null>>('departmentList', departmentList);

function handleEvent(event: MessageEvent): void {
  const payload = event.data;
  if (payload && typeof payload === 'object' && 'departmentList' in payload) {
    const list = (payload as { departmentList?: unknown }).departmentList;
    if (Array.isArray(list)) {
      departmentList.value = list as DepartmentTreeNodeDto[];
    }
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

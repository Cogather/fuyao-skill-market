<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { RouterView } from 'vue-router';

import { useAppContextStore } from './stores/appContextStore';

const appContextStore = useAppContextStore();

function handleEvent(event: MessageEvent): void {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const p = payload as Record<string, unknown>;
  if (p.type !== 'init') {
    return;
  }

  appContextStore.applyInitPayload(p);
}

window.addEventListener('message', handleEvent);
onBeforeUnmount(() => {
  window.removeEventListener('message', handleEvent);
});
</script>

<template>
  <RouterView />
</template>

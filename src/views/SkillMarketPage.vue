<script setup lang="ts">
import UserMarketShell from './skill/UserMarketShell.vue';
</script>

<template>
  <div class="skill-market-page">
    <UserMarketShell />
  </div>
</template>

<style scoped>
.skill-market-page {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  min-height: 100vh;
  box-sizing: border-box;
  background:
    linear-gradient(rgba(96, 111, 136, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96, 111, 136, 0.045) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #fbfcff 46%, #ffffff 100%);
  background-size:
    34px 34px,
    34px 34px,
    auto;
}
</style>

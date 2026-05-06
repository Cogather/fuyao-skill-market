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
  background: #f0f2f5;
}
</style>

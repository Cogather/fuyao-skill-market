<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';

const store = useSkillMarketStore();
const { skills } = store;

const toast = ref('');

const rows = computed(() =>
  [...skills.value].sort((a, b) =>
    (a.latestPublishTime ?? '') < (b.latestPublishTime ?? '') ? 1 : -1,
  ),
);

function approve(skillId: string): void {
  toast.value = `已批准（演示）：Skill #${skillId}`;
  setTimeout(() => {
    toast.value = '';
  }, 2500);
}
</script>

<template>
  <div class="admin-shell">
    <section class="hero admin">
      <div class="hero-inner">
        <span class="badge">Skill Market · 管理员视角</span>
        <h1 class="hero-title">分层发布审批与全市场治理</h1>
        <p class="hero-desc">
          查看全量 Skill、版本与发布人；此处为前端演示，审批动作为本地 Toast，可对接真实审批流 API。
        </p>
      </div>
    </section>

    <div class="panel">
      <h2 class="panel-title">全市场 Skill 列表</h2>
      <p class="panel-help">操作列提供「批准上架到组织层」等演示按钮。</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>版本</th>
              <th>发布人</th>
              <th>最新发布时间</th>
              <th>下载量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id ?? s.skill_id">
              <td>
                <span class="icon">{{ s.icon }}</span>
                {{ s.name ?? s.skill_id }}
              </td>
              <td>{{ s.version }}</td>
              <td>{{ s.publish_name ?? s.publisher }}</td>
              <td>{{ s.latestPublishTime }}</td>
              <td>{{ s.download_count ?? s.downloads ?? 0 }}</td>
              <td>
                <button type="button" class="link-btn" @click="approve(s.id ?? s.skill_id)">批准分层发布</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.admin-shell {
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 0 clamp(16px, 2vw, 32px) 32px;
  box-sizing: border-box;
}

.hero {
  margin-top: 16px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  padding: 28px 32px;
  border: 1px solid #d6e4ff;
}

.hero.admin {
  background: linear-gradient(105deg, #fff7e6 0%, #e6f4ff 100%);
}

.hero-inner {
  max-width: 820px;
}

.badge {
  display: inline-block;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(250, 140, 22, 0.15);
  color: #d46b08;
  margin-bottom: 12px;
}

.hero-title {
  margin: 0 0 12px;
  font-size: 24px;
  color: rgba(0, 0, 0, 0.88);
}

.hero-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(0, 0, 0, 0.55);
}

.panel {
  margin-top: 16px;
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px 24px;
  border: 1px solid #f0f0f0;
}

.panel-title {
  margin: 0 0 6px;
  font-size: 18px;
}

.panel-help {
  margin: 0 0 16px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  border-bottom: 1px solid #f0f0f0;
  padding: 12px 10px;
  text-align: left;
}

th {
  background: #fafafa;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
}

.icon {
  margin-right: 6px;
}

.link-btn {
  border: none;
  background: transparent;
  color: #1890ff;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
}

.link-btn:hover {
  text-decoration: underline;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1100;
}
</style>

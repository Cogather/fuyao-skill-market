<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { Skill } from '../../types/skill';
import { apiRecordToSkill } from '../../services/skillMarket/mappers';
import type { SkillListRecordDto } from '../../services/skillMarket/apiTypes';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

const skills = ref<Skill[]>([]);

const toast = ref('');

const rows = computed(() =>
  [...skills.value].sort((a, b) =>
    (a.latestPublishTime ?? '') < (b.latestPublishTime ?? '') ? 1 : -1,
  ),
);

async function loadSkills(): Promise<void> {
  const r = await skillBaseService.querySkillList({
    pageNo: 1,
    pageSize: 50,
  });
  if (r.meta.success && r.data?.records) {
    skills.value = (r.data.records as SkillListRecordDto[]).map((item) => apiRecordToSkill(item));
  } else {
    toast.value = r.message || 'Skill 列表加载失败';
  }
}

onMounted(() => {
  void loadSkills();
});

async function approve(skillId: string): Promise<void> {
  try {
    const pending = await skillBaseService.querySyncApplicationList({
      tab: 'pending',
      pageNo: 1,
      pageSize: 20,
    });
    const rec = pending.data?.records?.[0] as { id?: number } | undefined;
    const applicationId = rec?.id ?? 90_001;
    const r = await skillBaseService.reviewSyncApplication({
      decision: 'approve',
      comment: `演示：批准 Skill ${skillId} 同步至组织`,
    }, String(applicationId));
    toast.value =
      r.meta.success
        ? `已调用审核接口：申请 #${applicationId}（Skill #${skillId}）`
        : r.message || '审核接口返回异常';
    setTimeout(() => {
      toast.value = '';
    }, 3500);
  } catch (e) {
    toast.value = e instanceof Error ? e.message : '审核请求失败';
    setTimeout(() => {
      toast.value = '';
    }, 3500);
  }
}
</script>

<template>
  <div class="admin-shell">
    <section class="hero admin">
      <div class="hero-inner">
        <span class="badge">Skill Market · 管理员视角</span>
        <h1 class="hero-title">分层发布审批与全市场治理</h1>
        <p class="hero-desc">
          查看全量 Skill、版本与发布人；审批动作通过 Mock 接口层（与真实后端同契约），切换 HTTP 模式即可联调。
        </p>
      </div>
    </section>

    <div class="panel">
      <h2 class="panel-title">全市场 Skill 列表</h2>
      <p class="panel-help">操作列提供「批准上架到组织层」：将调用 <code>POST /api/sync-applications/:id/review</code>（见 <code>endpoints.ts</code>）。</p>
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
                <button type="button" class="link-btn" @click="approve(String(s.id ?? s.skill_id))">
                  批准分层发布
                </button>
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
  background: #f0f2f5;
}

.hero {
  padding: clamp(24px, 4vw, 48px) 0;
}

.hero-inner {
  max-width: 960px;
}

.hero.admin .badge {
  display: inline-block;
  margin-bottom: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #e6f4ff;
  color: #0958d9;
}

.hero-title {
  margin: 0 0 12px;
  font-size: clamp(22px, 3vw, 28px);
  line-height: 1.25;
}

.hero-desc {
  margin: 0;
  color: #595959;
  line-height: 1.6;
}

.panel {
  margin-top: 8px;
  padding: 20px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.panel-title {
  margin: 0 0 8px;
  font-size: 18px;
}

.panel-help {
  margin: 0 0 16px;
  font-size: 13px;
  color: #8c8c8c;
}

.table-wrap {
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th,
.table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.table th {
  font-weight: 600;
  color: #434343;
  background: #fafafa;
}

.icon {
  margin-right: 6px;
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: #1677ff;
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  font-size: 14px;
  z-index: 2000;
}
</style>

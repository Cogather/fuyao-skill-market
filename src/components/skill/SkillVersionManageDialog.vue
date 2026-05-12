<script setup lang="ts">
import { computed } from 'vue';
import type { SkillVersionListItemDto } from '../../services/skillMarket/apiTypes';

const props = withDefaults(
  defineProps<{
    /** 当前对外版本（展示「当前」角标） */
    currentVersion: string;
    versions: SkillVersionListItemDto[];
    loading?: boolean;
    unpublishingVersion?: string | null;
    /** 为 false 时隐藏「操作」列（如从市场详情进入） */
    showOperationsColumn?: boolean;
  }>(),
  {
    loading: false,
    unpublishingVersion: null,
    showOperationsColumn: true,
  },
);

const emit = defineEmits<{
  close: [];
  back: [];
  download: [version: string];
  unpublish: [version: string];
  viewDetail: [row: SkillVersionListItemDto];
}>();

function semverNums(v: string): number[] {
  return String(v)
    .split('.')
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareSemverDesc(a: string, b: string): number {
  const pa = semverNums(a);
  const pb = semverNums(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

function formatPublishTime(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) {
    return '—';
  }
  const forDate = s.includes('T') ? s : s.replace(/^(\d{4}-\d{1,2}-\d{1,2})\s+/, '$1T');
  const d = new Date(forDate);
  if (!Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace(/\//g, '-');
  }
  return s;
}

const sortedVersions = computed(() => [...props.versions].sort((a, b) => compareSemverDesc(a.version, b.version)));

function isUnpublished(row: SkillVersionListItemDto): boolean {
  return Number(row.deleted) === 1;
}

function isCurrent(row: SkillVersionListItemDto): boolean {
  return String(row.version) === String(props.currentVersion ?? '').trim();
}
</script>

<template>
  <Teleport to="body">
    <div class="ver-mgmt-overlay" role="presentation" @click.self="emit('close')">
      <div class="ver-mgmt-dialog" role="dialog" aria-modal="true" aria-labelledby="ver-mgmt-title" @click.stop>
        <header class="ver-mgmt-head">
          <h2 id="ver-mgmt-title" class="ver-mgmt-title">版本管理</h2>
          <div class="ver-mgmt-head-actions">
            <button type="button" class="ver-mgmt-btn ghost" @click="emit('back')">← 返回 Skill 详情</button>
            <button type="button" class="ver-mgmt-btn" @click="emit('close')">关闭</button>
          </div>
        </header>

        <div class="ver-mgmt-body">
          <p v-if="loading" class="ver-mgmt-loading">版本列表加载中…</p>
          <div v-else class="ver-mgmt-table-wrap">
            <table class="ver-mgmt-table">
              <thead>
                <tr>
                  <th class="col-ver">版本号</th>
                  <th class="col-pub">创建人</th>
                  <th class="col-time">创建时间</th>
                  <th v-if="showOperationsColumn" class="col-ops">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in sortedVersions"
                  :key="row.version + String(row.publishTime)"
                  class="ver-mgmt-row"
                  :class="{ 'is-unpublished': isUnpublished(row) }"
                >
                  <td class="col-ver">
                    <div class="ver-vercell">
                      <span class="ver-num">{{ row.version }}</span>
                      <span v-if="isCurrent(row) && !isUnpublished(row)" class="badge badge-current">当前</span>
                      <span v-if="isUnpublished(row)" class="badge badge-off">已下架</span>
                      <button type="button" class="ver-op-link ver-view-link" @click="emit('viewDetail', row)">
                        查看
                      </button>
                    </div>
                  </td>
                  <td class="col-pub">{{ row.createBy || '—' }}</td>
                  <td class="col-time">{{ formatPublishTime(row.createdAt) }}</td>
                  <td v-if="showOperationsColumn" class="col-ops">
                    <template v-if="!isUnpublished(row)">
                      <button type="button" class="ver-op-link primary" @click="emit('download', row.version)">
                        下载
                      </button>
                      <button
                        type="button"
                        class="ver-op-link danger"
                        :disabled="unpublishingVersion === row.version"
                        @click="emit('unpublish', row.version)"
                      >
                        {{ unpublishingVersion === row.version ? '下架中…' : '下架' }}
                      </button>
                    </template>
                    <button v-else type="button" class="ver-op-pill disabled" disabled>已下架</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!loading && sortedVersions.length === 0" class="ver-mgmt-empty">暂无版本记录</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ver-mgmt-overlay {
  position: fixed;
  inset: 0;
  z-index: 920;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.48);
}

.ver-mgmt-dialog {
  width: min(920px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ver-mgmt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.ver-mgmt-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}

.ver-mgmt-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ver-mgmt-btn {
  border: 1px solid #dbe4f0;
  background: #fff;
  color: #1e293b;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.ver-mgmt-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.ver-mgmt-btn.ghost {
  border-color: #93c5fd;
  color: #2563eb;
  background: #fff;
}

.ver-mgmt-btn.ghost:hover {
  background: #eff6ff;
  border-color: #60a5fa;
}

.ver-mgmt-body {
  padding: 0;
  overflow: auto;
  min-height: 0;
}

.ver-mgmt-loading {
  margin: 0;
  padding: 28px 22px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}

.ver-mgmt-table-wrap {
  padding: 0 0 16px;
}

.ver-mgmt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ver-mgmt-table thead th {
  text-align: left;
  padding: 12px 22px;
  font-weight: 750;
  color: #475569;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.ver-mgmt-table tbody td {
  padding: 14px 22px;
  border-bottom: 1px solid #eef2f7;
  vertical-align: middle;
  color: #0f172a;
}

.ver-mgmt-row.is-unpublished td {
  color: #94a3b8;
}

.col-ver {
  width: 28%;
}

.col-pub {
  width: 22%;
}

.col-time {
  width: 26%;
}

.col-ops {
  width: 24%;
}

.ver-num {
  font-weight: 700;
  color: inherit;
}

.ver-vercell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.ver-view-link {
  margin-right: 0;
}

.badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  vertical-align: middle;
}

.badge-current {
  background: #ecfdf5;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.badge-off {
  margin-left: 8px;
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.col-ops {
  white-space: nowrap;
}

.ver-op-link {
  margin-right: 12px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
}

.ver-op-link.primary {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #fff;
}

.ver-op-link.primary:hover {
  background: #eff6ff;
}

.ver-op-link.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fff;
}

.ver-op-link.danger:hover:not(:disabled) {
  background: #fef2f2;
}

.ver-op-link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ver-op-pill.disabled {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 13px;
  cursor: not-allowed;
}

.ver-mgmt-empty {
  margin: 0;
  padding: 28px 22px;
  text-align: center;
  color: #64748b;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue';

type AssetType = 'Agent' | 'Skill' | 'Command' | 'Extension';
type AssetFilter = 'all' | AssetType;
type PageView = 'list' | 'detail' | 'publish';

type ReleaseNote = {
  version: string;
  date: string;
  organization: string;
  notes?: string;
  publisher?: string;
  status?: '已发布' | '发布失败';
  extensionName?: string;
};

type Asset = {
  id: string;
  name: string;
  description?: string;
  assetType: AssetType;
  version?: string;
  owner?: string;
  productId?: string;
  auto?: boolean;
  marketplace?: {
    rating?: number;
    downloads?: number;
    calls?: number;
  };
  releaseNotes: ReleaseNote[];
};

type Department = {
  id: string;
  name: string;
  parentId?: string;
};

type DepartmentRow = Department & { depth: number; hasChildren: boolean };

const TYPE_FILTERS: Array<{ key: AssetFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'Agent', label: 'Agent' },
  { key: 'Skill', label: 'Skill' },
  { key: 'Command', label: 'Command' },
  { key: 'Extension', label: 'Extension' },
];

const DEPARTMENTS: Department[] = [
  { id: 'cloud-core', name: '云核心网产品线' },
  { id: 'cloud-core-rd', name: '云核心网研发管理部', parentId: 'cloud-core' },
  { id: 'packet-core', name: '分组核心网产品部', parentId: 'cloud-core-rd' },
  { id: 'packet-control', name: '分组控制开发部', parentId: 'packet-core' },
  { id: 'packet-access', name: '分组移动接入开发部', parentId: 'packet-core' },
  { id: 'packet-data', name: '分组融合数据开发部', parentId: 'packet-core' },
];

const PRODUCTS = [
  { id: 'udm', name: 'UDM', departmentId: 'packet-control' },
  { id: 'upcf', name: 'UPCF', departmentId: 'packet-data' },
  { id: 'uscdb', name: 'USCDB', departmentId: 'packet-access' },
];

const ASSET_SEED: Asset[] = [
  {
    id: 'udm-design-skill',
    name: 'udm-design-skill',
    assetType: 'Skill',
    version: '1.0.0',
    owner: '李丹',
    productId: 'udm',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'udm-dt-agent',
    name: 'udm-dt-skill',
    assetType: 'Agent',
    version: '1.0.0',
    owner: '李丹',
    productId: 'udm',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'udm-coding-skill',
    name: 'udm-coding-skill',
    assetType: 'Skill',
    version: '1.0.0',
    owner: '李丹',
    productId: 'udm',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'udm-coding-agent',
    name: 'udm-coding-agent',
    assetType: 'Agent',
    version: '1.0.0',
    owner: '李丹',
    productId: 'udm',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'codec-agent',
    name: '编解码生成 Agent',
    description: '根据协议定义生成编解码实现代码',
    assetType: 'Agent',
    version: '1.0.0',
    productId: 'udm',
    marketplace: { rating: 4.8, downloads: 256, calls: 560 },
    releaseNotes: [
      {
        version: '1.0.0',
        date: '2026-09-03T13:21:33.846Z',
        organization: '云核心网研发管理部',
        notes: '发布到组织：云核心网研发管理部',
      },
    ],
  },
  {
    id: 'protocol-parser-skill',
    name: '协议解析Skill',
    description: '解析协议字段定义与类型约束，输出结构化协议描述',
    assetType: 'Skill',
    version: '1.0.0',
    owner: '李工',
    productId: 'udm',
    marketplace: { rating: 4.1, downloads: 42, calls: 95 },
    releaseNotes: [],
  },
  {
    id: 'udm-mml-e2e-extension',
    name: 'udm-mml-e2e-extension',
    description: '基于场景「MML开发」自动生成的 Extension',
    assetType: 'Extension',
    version: '1.0.0',
    productId: 'udm',
    auto: true,
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'analyze-command',
    name: '/analyze',
    description: '分析输入并输出结构化结论',
    assetType: 'Command',
    owner: '赵工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'codec-generate-command',
    name: '/codec-generate',
    description: '根据协议定义生成编解码实现',
    assetType: 'Command',
    version: '1.0.0',
    productId: 'udm',
    owner: '张工',
    marketplace: {},
    releaseNotes: [
      {
        version: '1.0.0',
        date: '2026-09-04T06:35:28.350Z',
        organization: '云核心网研发管理部',
        notes: '发布到组织：云核心网研发管理部',
      },
    ],
  },
  {
    id: 'codec-validate-command',
    name: '/codec-validate',
    description: '校验编解码实现的协议兼容性',
    assetType: 'Command',
    version: '1.0.0',
    productId: 'udm',
    owner: '张工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'deploy-command',
    name: '/deploy',
    description: '发布产物到目标环境',
    assetType: 'Command',
    owner: '王工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'format-check-command',
    name: '/format-check',
    description: '检查代码格式规范',
    assetType: 'Command',
    owner: '王工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'pr-review-command',
    name: '/pr-review',
    description: '对指定 PR 进行代码评审并输出建议',
    assetType: 'Command',
    version: '1.0.0',
    productId: 'udm',
    owner: '李工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'summarize-command',
    name: '/summarize',
    description: '对输入文本生成结构化摘要',
    assetType: 'Command',
    version: '1.0.0',
    productId: 'udm',
    owner: '钱工',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'test-unpublished-command',
    name: '/test-unpublished',
    description: '用于测试的未发布 Command',
    assetType: 'Command',
    owner: '测试',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'udm-e2e-command',
    name: '/udm-e2e-command',
    assetType: 'Command',
    owner: '李丹',
    marketplace: {},
    releaseNotes: [],
  },
  {
    id: 'udm-test-command',
    name: '/udm-test-command',
    assetType: 'Command',
    owner: '李丹',
    marketplace: {},
    releaseNotes: [],
  },
];

const ASSET_CONTENT: Record<AssetType, { document?: string; skillMd?: string; script?: string }> = {
  Agent: {
    document:
      'Agent 能力说明：接收输入文本，输出分类/识别结果。\n调用：HTTP API\n输入：{ text: string }\n输出：{ category: string }',
  },
  Skill: {
    skillMd:
      '# Skill 能力说明\n\n分析输入并输出结构化结论。\n\n## 输入\n{ input: string }\n\n## 输出\n{ result: object }',
    script: '#!/bin/bash\necho "analyzing..."\nnode ./analyze.js "$1"',
  },
  Command: {
    document: 'Command：在 Agent 中通过 /xxx 触发，参数与正文由流水线发布回填。',
  },
  Extension: {},
};

const QUALITY_REPORT = {
  overallScore: 92,
  summary: '该 Skill 已通过质量门禁，整体评分 92 分，建议发布。',
  items: [
    { name: '单元测试覆盖率', value: '88%', pass: true },
    { name: '性能基准', value: '90 分', pass: true },
    { name: '安全扫描', value: '95 分', pass: true },
    { name: '可维护性', value: '89 分', pass: true },
  ],
};

const ORGANIZATIONS = ['云核心网研发管理部', '客服中心', '运维部', '数据中台', '安全部'];

const assets = ref<Asset[]>(structuredClone(ASSET_SEED));
const view = ref<PageView>('list');
const filter = ref<AssetFilter>('all');
const selectedDepartmentId = ref('');
const selectedProductId = ref('');
const selectedAssetId = ref('');
const detailTab = ref<'content' | 'report'>('content');
const publishTab = ref<'publish' | 'history'>('publish');
const selectedOrganization = ref('');
const departmentOpen = ref(false);
const expandedDepartments = ref(new Set<string>(['cloud-core', 'cloud-core-rd', 'packet-core']));
const toastMessage = ref('');
let toastTimer: number | undefined;

const selectedAsset = computed(
  () => assets.value.find((asset) => asset.id === selectedAssetId.value) ?? null,
);

const selectedDepartmentPath = computed(() => {
  const path: string[] = [];
  let current = DEPARTMENTS.find((department) => department.id === selectedDepartmentId.value);
  while (current) {
    path.unshift(current.name);
    current = current.parentId
      ? DEPARTMENTS.find((department) => department.id === current?.parentId)
      : undefined;
  }
  return path;
});

const selectedDepartmentLabel = computed(() =>
  selectedDepartmentPath.value.length > 0 ? selectedDepartmentPath.value.join(' / ') : '选部门…',
);

const visibleDepartmentRows = computed<DepartmentRow[]>(() => {
  const rows: DepartmentRow[] = [];
  const append = (parentId: string | undefined, depth: number) => {
    DEPARTMENTS.filter((department) => department.parentId === parentId).forEach((department) => {
      const hasChildren = DEPARTMENTS.some((item) => item.parentId === department.id);
      rows.push({ ...department, depth, hasChildren });
      if (hasChildren && expandedDepartments.value.has(department.id)) {
        append(department.id, depth + 1);
      }
    });
  };
  append(undefined, 0);
  return rows;
});

const departmentProducts = computed(() =>
  selectedDepartmentId.value
    ? PRODUCTS.filter((product) => product.departmentId === selectedDepartmentId.value)
    : PRODUCTS,
);

const filteredAssets = computed(() =>
  assets.value.filter(
    (asset) =>
      (filter.value === 'all' || asset.assetType === filter.value) &&
      (!selectedProductId.value || asset.productId === selectedProductId.value),
  ),
);

const currentContent = computed(() =>
  selectedAsset.value ? ASSET_CONTENT[selectedAsset.value.assetType] : ASSET_CONTENT.Agent,
);

const nextVersion = computed(() => {
  const asset = selectedAsset.value;
  if (!asset) return '';
  if (asset.auto) return `v1.0.${asset.releaseNotes.length + 1}`;
  return asset.version ? `v${asset.version}` : '无版本（未开发）';
});

function isPublished(asset: Asset): boolean {
  return Boolean(
    asset.version && asset.releaseNotes.some((release) => release.version === asset.version),
  );
}

function statusLabel(asset: Asset): string {
  if (!asset.version) return '未开发';
  return isPublished(asset) ? '已发布' : '待发布';
}

function statusClass(asset: Asset): string {
  if (!asset.version) return 'is-info';
  return isPublished(asset) ? 'is-success' : 'is-warning';
}

function showToast(message: string): void {
  toastMessage.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function toggleDepartment(id: string): void {
  const next = new Set(expandedDepartments.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedDepartments.value = next;
}

function selectDepartment(id: string): void {
  selectedDepartmentId.value = id;
  selectedProductId.value = '';
  departmentOpen.value = false;
}

function openDetail(asset: Asset): void {
  selectedAssetId.value = asset.id;
  detailTab.value = 'content';
  view.value = 'detail';
}

function openPublish(asset: Asset): void {
  selectedAssetId.value = asset.id;
  selectedOrganization.value = '';
  publishTab.value = 'publish';
  view.value = 'publish';
}

function confirmPublish(): void {
  const asset = selectedAsset.value;
  if (!asset) return;
  if (!selectedOrganization.value) {
    showToast('请先选择目标组织');
    return;
  }

  const version = nextVersion.value.replace(/^v/, '');
  asset.version = version;
  asset.releaseNotes.unshift({
    version,
    date: new Date().toISOString(),
    organization: selectedOrganization.value,
    notes: `发布到组织：${selectedOrganization.value}`,
    publisher: '当前用户',
    status: '已发布',
    extensionName: asset.name,
  });
  publishTab.value = 'history';
  showToast('发布成功（mock）');
}

function formatReleaseDate(value: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
</script>

<template>
  <div class="asset-page" @keydown.esc="departmentOpen = false">
    <template v-if="view === 'list'">
      <header class="asset-page__header">
        <div>
          <h1>资产清单</h1>
          <p>Extension 基于场景自动生成。</p>
        </div>
        <div class="asset-page__actions">
          <button
            type="button"
            class="asset-button is-secondary"
            @click="showToast('批量导入（mock）')"
          >
            批量导入
          </button>
          <button
            type="button"
            class="asset-button is-primary"
            @click="showToast('新建资产（mock）')"
          >
            + 新建资产
          </button>
        </div>
      </header>

      <section class="asset-scope" aria-label="资产范围筛选">
        <div class="asset-department">
          <button
            type="button"
            class="asset-department__trigger"
            :class="{ 'is-open': departmentOpen }"
            :aria-expanded="departmentOpen"
            @click="departmentOpen = !departmentOpen"
          >
            <span :title="selectedDepartmentLabel">{{ selectedDepartmentLabel }}</span>
            <span aria-hidden="true">▾</span>
          </button>
          <button
            v-if="departmentOpen"
            type="button"
            class="asset-department__backdrop"
            aria-label="关闭部门选择"
            @click="departmentOpen = false"
          />
          <div v-if="departmentOpen" class="asset-department__panel">
            <div
              v-for="department in visibleDepartmentRows"
              :key="department.id"
              class="asset-department__row"
              :style="{ paddingLeft: `${4 + department.depth * 14}px` }"
            >
              <button
                type="button"
                class="asset-department__toggle"
                :disabled="!department.hasChildren"
                :aria-label="`${expandedDepartments.has(department.id) ? '收起' : '展开'}${department.name}`"
                @click="toggleDepartment(department.id)"
              >
                {{
                  department.hasChildren ? (expandedDepartments.has(department.id) ? '▾' : '▸') : ''
                }}
              </button>
              <button
                type="button"
                class="asset-department__name"
                :class="{ 'is-selected': selectedDepartmentId === department.id }"
                @click="selectDepartment(department.id)"
              >
                {{ department.name }}
              </button>
            </div>
          </div>
        </div>

        <select
          v-if="departmentProducts.length > 0"
          v-model="selectedProductId"
          class="asset-select"
          aria-label="产品筛选"
        >
          <option value="">全部产品</option>
          <option v-for="product in departmentProducts" :key="product.id" :value="product.id">
            {{ product.name }}
          </option>
        </select>
      </section>

      <nav class="asset-filters" aria-label="资产类型">
        <button
          v-for="item in TYPE_FILTERS"
          :key="item.key"
          type="button"
          :class="{ 'is-active': filter === item.key }"
          @click="filter = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <section class="asset-board">
        <div v-if="filteredAssets.length > 0" class="asset-grid">
          <article
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="asset-card"
            role="button"
            tabindex="0"
            @click="openDetail(asset)"
            @keydown.enter.prevent="openDetail(asset)"
            @keydown.space.prevent="openDetail(asset)"
          >
            <div class="asset-card__title">
              <h2>{{ asset.name }}</h2>
              <span class="asset-badge is-type">{{ asset.assetType }}</span>
            </div>
            <p>{{ asset.description || '暂无描述' }}</p>
            <div class="asset-card__meta">
              <span>⭐ {{ (asset.marketplace?.rating ?? 0).toFixed(1) }}</span>
              <span>📥 {{ asset.marketplace?.downloads ?? 0 }}</span>
              <span>📞 {{ asset.marketplace?.calls ?? 0 }}</span>
              <span>{{ asset.version ? `v${asset.version}` : '未开发' }}</span>
              <span class="asset-badge" :class="statusClass(asset)">{{ statusLabel(asset) }}</span>
            </div>
            <button
              v-if="asset.version && !isPublished(asset)"
              type="button"
              class="asset-button is-primary asset-card__publish"
              @click.stop="openPublish(asset)"
            >
              发布
            </button>
          </article>
        </div>
        <div v-else class="asset-empty">暂无资产</div>
      </section>
    </template>

    <template v-else-if="view === 'detail' && selectedAsset">
      <button type="button" class="asset-button is-secondary asset-back" @click="view = 'list'">
        ← 返回
      </button>
      <header class="asset-page__header asset-page__header--detail">
        <h1>{{ selectedAsset.name }}</h1>
        <div class="asset-page__tags">
          <span class="asset-badge is-type">{{ selectedAsset.assetType }}</span>
          <span v-if="selectedAsset.auto" class="asset-badge is-type">自动生成</span>
        </div>
      </header>

      <section class="asset-board asset-detail">
        <label class="asset-field asset-field--inline">
          <span>版本</span>
          <select class="asset-select">
            <option>v{{ selectedAsset.version || '1.0.0' }}</option>
          </select>
        </label>

        <nav class="asset-subtabs" aria-label="资产详情分区">
          <button
            type="button"
            :class="{ 'is-active': detailTab === 'content' }"
            @click="detailTab = 'content'"
          >
            内容
          </button>
          <button
            v-if="selectedAsset.assetType === 'Skill'"
            type="button"
            :class="{ 'is-active': detailTab === 'report' }"
            @click="detailTab = 'report'"
          >
            质量报告
          </button>
        </nav>

        <div v-if="detailTab === 'content'" class="asset-file-tree">
          <template v-if="selectedAsset.assetType === 'Skill'">
            <strong>📁 {{ selectedAsset.name }}/</strong>
            <div class="asset-file-tree__branch">
              <span>📄 SKILL.md</span>
              <pre>{{ currentContent.skillMd }}</pre>
              <span>📄 run.sh</span>
              <pre>{{ currentContent.script }}</pre>
            </div>
          </template>
          <template v-else-if="selectedAsset.assetType === 'Extension'">
            <strong>📁 {{ selectedAsset.name }}/</strong>
            <div class="asset-file-tree__branch">
              <strong>📁 commands/</strong><small>（从工作流加载）</small>
              <strong>📁 agents/</strong><small>（从工作流加载）</small> <strong>📁 skills/</strong
              ><small>（从工作流加载）</small>
            </div>
          </template>
          <template v-else>
            <span>📄 {{ selectedAsset.name }}.md</span>
            <pre>{{ currentContent.document || '内容由流水线发布后回填' }}</pre>
          </template>
        </div>

        <div v-else class="asset-report">
          <div class="asset-report__summary">
            <span>整体评分</span>
            <strong>{{ QUALITY_REPORT.overallScore }}</strong>
            <small>{{ QUALITY_REPORT.summary }}</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>结果</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in QUALITY_REPORT.items" :key="item.name">
                <td>{{ item.name }}</td>
                <td>{{ item.value }}</td>
                <td>
                  <span class="asset-badge is-success">{{ item.pass ? '通过' : '未通过' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          v-if="selectedAsset.version && !isPublished(selectedAsset)"
          type="button"
          class="asset-button is-primary asset-detail__publish"
          @click="openPublish(selectedAsset)"
        >
          发布
        </button>
      </section>
    </template>

    <template v-else-if="view === 'publish' && selectedAsset">
      <button type="button" class="asset-button is-secondary asset-back" @click="view = 'detail'">
        ← 返回
      </button>
      <header class="asset-page__header asset-page__header--detail">
        <h1>发布 · {{ selectedAsset.name }}</h1>
        <span class="asset-badge is-type">{{ selectedAsset.assetType }}</span>
      </header>

      <nav class="asset-subtabs asset-subtabs--outside" aria-label="发布分区">
        <button
          type="button"
          :class="{ 'is-active': publishTab === 'publish' }"
          @click="publishTab = 'publish'"
        >
          发布
        </button>
        <button
          type="button"
          :class="{ 'is-active': publishTab === 'history' }"
          @click="publishTab = 'history'"
        >
          发布历史
        </button>
      </nav>

      <section v-if="publishTab === 'publish'" class="asset-board asset-publish">
        <label class="asset-field asset-field--inline">
          <span>下一版本（自增）</span>
          <input :value="nextVersion" disabled />
        </label>

        <div class="asset-file-tree">
          <template v-if="selectedAsset.assetType === 'Skill'">
            <strong>📁 {{ selectedAsset.name }}/</strong>
            <div class="asset-file-tree__branch">
              <span>📄 SKILL.md</span>
              <pre>{{ currentContent.skillMd }}</pre>
              <span>📄 run.sh</span>
              <pre>{{ currentContent.script }}</pre>
            </div>
          </template>
          <template v-else>
            <span>📄 {{ selectedAsset.name }}.md</span>
            <pre>{{ currentContent.document || '内容由流水线发布后回填' }}</pre>
          </template>
        </div>

        <label class="asset-field asset-field--inline asset-publish__organization">
          <span>目标组织</span>
          <select v-model="selectedOrganization" class="asset-select">
            <option value="">选组织…</option>
            <option v-for="organization in ORGANIZATIONS" :key="organization" :value="organization">
              {{ organization }}
            </option>
          </select>
        </label>
        <button type="button" class="asset-button is-primary" @click="confirmPublish">
          确认发布
        </button>
      </section>

      <section v-else class="asset-board asset-history">
        <div v-if="selectedAsset.releaseNotes.length === 0" class="asset-empty">暂无发布记录</div>
        <article
          v-for="release in selectedAsset.releaseNotes"
          v-else
          :key="`${release.version}-${release.date}`"
          class="asset-history__item"
        >
          <div>
            <strong>{{ release.extensionName || selectedAsset.name }}</strong>
            <code>v{{ release.version }}</code>
            <span class="asset-badge is-success">{{ release.status || '已发布' }}</span>
            <time>{{ formatReleaseDate(release.date) }}</time>
          </div>
          <p>发布人：{{ release.publisher || '—' }} · 组织：{{ release.organization || '—' }}</p>
        </article>
      </section>
    </template>

    <Transition name="asset-toast">
      <div v-if="toastMessage" class="asset-toast" role="status">{{ toastMessage }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.asset-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  color: #111827;
  font-size: 14px;
  line-height: normal;
  letter-spacing: normal;
  font-synthesis: auto;
  text-rendering: auto;
  -webkit-font-smoothing: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

.asset-page :where(*) {
  box-sizing: border-box;
}

.asset-page button,
.asset-page input,
.asset-page select {
  line-height: normal;
  letter-spacing: normal;
}

.asset-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 16px;
  flex-wrap: wrap;
}

.asset-page__header h1 {
  margin: 0;
  color: #111827;
  font-family: inherit;
  font-size: 22.4px;
  font-weight: 700;
  line-height: normal;
  letter-spacing: normal;
}

.asset-page__header p {
  margin: 3.2px 0 0;
  color: #6b7280;
  font-size: 13.12px;
}

.asset-page__header--detail {
  margin-top: 0;
}

.asset-page__actions {
  display: flex;
  align-items: center;
  gap: 6.4px;
}

.asset-page__tags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.asset-button {
  display: inline-flex;
  align-items: center;
  gap: 4.8px;
  padding: 6.4px 13.6px;
  border: 0;
  border-radius: 6px;
  font-size: 12.48px;
  font-weight: 500;
  cursor: pointer;
}

.asset-button.is-primary {
  background: #2563eb;
  color: #fff;
}

.asset-button.is-primary:hover {
  background: #1e40af;
}

.asset-button.is-secondary {
  background: #e5e7eb;
  color: #1f2937;
}

.asset-scope {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 9.6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.asset-department {
  position: relative;
  flex: 1;
  min-width: 280px;
}

.asset-department__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6.4px 9.6px;
  overflow: hidden;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 13.12px;
  cursor: pointer;
}

.asset-department__trigger > span:first-child {
  flex: 1;
  padding-right: 4.8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-department__trigger > span:last-child {
  color: #9ca3af;
}

.asset-department__backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  border: 0;
  background: transparent;
}

.asset-department__panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 21;
  max-height: 280px;
  padding: 3.2px 0;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.asset-department__row {
  display: flex;
  align-items: center;
  gap: 4.8px;
  padding: 4px 6.4px;
}

.asset-department__row:hover {
  background: #f9fafb;
}

.asset-department__toggle,
.asset-department__name {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.asset-department__toggle {
  flex: 0 0 12px;
  width: 12px;
  padding: 0;
  color: #9ca3af;
  font-family: inherit;
  font-size: 14px;
  text-align: center;
  user-select: none;
}

.asset-department__toggle:disabled {
  cursor: default;
}

.asset-department__name {
  flex: 1;
  padding: 0;
  color: #374151;
  font-family: inherit;
  font-size: 12.48px;
  text-align: left;
  user-select: none;
}

.asset-department__name.is-selected {
  color: #2563eb;
  font-weight: 600;
}

.asset-select,
.asset-field input {
  width: 100%;
  padding: 6.4px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13.12px;
}

.asset-scope > .asset-select {
  width: auto;
  min-width: 140px;
}

.asset-filters,
.asset-subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6.4px;
}

.asset-filters {
  margin-bottom: 16px;
}

.asset-filters button,
.asset-subtabs button {
  padding: 5.6px 11.2px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.asset-filters button:hover,
.asset-subtabs button:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.asset-filters button.is-active,
.asset-subtabs button.is-active {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.asset-board {
  box-sizing: border-box;
  padding: 16px;
  margin-bottom: 16px;
  border: 0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 6.4px;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}

.asset-card:hover,
.asset-card:focus-visible {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.asset-card__title {
  display: flex;
  justify-content: space-between;
}

.asset-card h2 {
  margin: 0;
  color: inherit;
  font-family: inherit;
  font-size: 14.08px;
  font-weight: 700;
  line-height: normal;
  letter-spacing: normal;
}

.asset-card > p {
  flex: 1;
  margin: 0;
  color: #4b5563;
  font-size: 12.48px;
}

.asset-card__meta {
  display: flex;
  gap: 9.6px;
  flex-wrap: wrap;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-card__publish {
  align-self: flex-start;
  margin-top: 6.4px;
}

.asset-badge {
  display: inline-block;
  padding: 2.88px 8.8px;
  border-radius: 9999px;
  font-size: 10.88px;
  font-weight: 600;
}

.asset-badge.is-type,
.asset-badge.is-info {
  background: #dbeafe;
  color: #0c2d6b;
}

.asset-badge.is-success {
  background: #d1fae5;
  color: #065f46;
}

.asset-badge.is-warning {
  background: #fef3c7;
  color: #92400e;
}

.asset-empty {
  padding: 32px;
  color: #9ca3af;
  text-align: center;
}

.asset-back {
  margin-bottom: 8px;
}

.asset-detail,
.asset-publish {
  display: block;
}

.asset-field {
  display: block;
  margin-bottom: 12.8px;
}

.asset-field > span {
  display: block;
  margin-bottom: 4.8px;
  color: #374151;
  font-size: 12.48px;
  font-weight: 500;
}

.asset-field--inline .asset-select,
.asset-field--inline input {
  width: auto;
}

.asset-subtabs {
  padding-bottom: 0;
  margin-bottom: 12.8px;
  border-bottom: 1px solid #e5e7eb;
}

.asset-subtabs--outside {
  margin: 0 0 12.8px;
}

.asset-file-tree {
  padding: 14px;
  border-radius: 8px;
  background: #f9fafb;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.9;
}

.asset-file-tree__branch {
  margin-left: 22px;
  padding-left: 10px;
  border-left: 1px dashed #d1d5db;
}

.asset-file-tree__branch > span,
.asset-file-tree__branch > strong,
.asset-file-tree__branch small {
  display: block;
}

.asset-file-tree__branch > span {
  color: #4b5563;
}

.asset-file-tree > span {
  color: #4b5563;
}

.asset-file-tree__branch small {
  margin-left: 22px;
  color: #9ca3af;
  font-size: inherit;
}

.asset-file-tree pre {
  margin: 4px 0 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #1e293b;
  color: #cbd5e1;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.asset-report__summary {
  margin-bottom: 12.8px;
  padding: 16px;
  border-left: 4px solid #10b981;
  border-radius: 8px;
  background: #f9fafb;
}

.asset-report__summary span {
  display: block;
  color: #6b7280;
  font-size: 12.48px;
}

.asset-report__summary strong {
  display: block;
  font-size: 32px;
  font-weight: 700;
}

.asset-report__summary small {
  display: block;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-report table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.48px;
}

.asset-report th,
.asset-report td {
  padding: 6.4px;
  text-align: left;
}

.asset-report td {
  border-bottom: 1px solid #e5e7eb;
}

.asset-report th {
  background: #f3f4f6;
}

.asset-detail__publish {
  margin-top: 16px;
}

.asset-publish__organization {
  margin-top: 16px;
}

.asset-history {
  display: block;
}

.asset-history__item {
  padding: 11.2px 12.8px;
  margin-bottom: 9.6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.asset-history__item > div {
  display: flex;
  align-items: center;
  gap: 6.4px;
  flex-wrap: wrap;
  margin-bottom: 4.8px;
}

.asset-history__item code {
  display: inline-block;
  padding: 1.6px 6.4px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #6b7280;
  font-family: monospace;
  font-size: 11.52px;
  line-height: normal;
}

.asset-history__item time {
  margin-left: auto;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-history__item p {
  margin: 0;
  color: #6b7280;
  font-size: 11.52px;
}

.asset-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 120;
  max-width: min(360px, calc(100vw - 32px));
  padding: 11px 16px;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
  font-size: 13px;
}

.asset-toast-enter-active,
.asset-toast-leave-active {
  transition: 160ms ease;
}

.asset-toast-enter-from,
.asset-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 700px) {
  .asset-page__header,
  .asset-scope {
    align-items: stretch;
    flex-direction: column;
  }

  .asset-page__actions {
    align-self: flex-start;
  }

  .asset-department {
    min-width: 0;
  }

  .asset-select {
    width: 100%;
  }

  .asset-history__item time {
    width: 100%;
    margin-left: 0;
  }
}
</style>

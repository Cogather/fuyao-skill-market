<script setup lang="ts">
import { computed, ref } from 'vue';

const rankingCards = [
  {
    title: '季度嘉奖实时榜单',
    columns: ['名称', '作者', '评分', '使用量', '排名'],
    rows: [
      ['会议助手', '张三', '4.9', '18,888', '1'],
      ['接口 Mock 生成', '李四', '4.8', '9,236', '2'],
      ['SQL 巡检', '王五', '4.7', '7,604', '3'],
    ],
  },
  {
    title: '5月榜单 TOP 20',
    columns: ['名称', '作者', 'AI得分', '专家评审得分'],
    rows: [
      ['日志分析 Skill', '赵六', '92', '96'],
      ['需求拆解 Skill', '陈七', '89', '待评'],
      ['日报生成 Skill', '周八', '88', '91'],
    ],
  },
  {
    title: '今日新锐榜',
    columns: ['名称', '作者', 'AI得分', '专家评审得分'],
    rows: [
      ['测试用例评审', '吴九', '91', '94'],
      ['知识库巡检', '郑十', '86', '待评'],
      ['CI/CD 发布检查', '钱一', '84', '90'],
    ],
  },
  {
    title: '实时使用量榜单',
    columns: ['名称', '作者', '使用量', '专家评审得分'],
    rows: [
      ['test2 Skill', '张三', '18,888', '95'],
      ['会议助手', '李四', '12,045', '待评'],
      ['接口 Mock 生成', '王五', '9,236', '92'],
    ],
  },
];

const taskCards = [
  {
    name: 'test2 Skill',
    owner: '张三',
    id: 'u10002',
    team: '平台工具部',
    active: true,
    tags: ['开发', '#cicd', '#log'],
  },
  {
    name: '测试用例评审 Skill',
    owner: '李四',
    id: 'u10091',
    team: '质量工具组',
    active: false,
    tags: ['测试', '#review', '#test'],
  },
  {
    name: '接口 Mock 生成 Skill',
    owner: '王五',
    id: 'u10082',
    team: '联调工具部',
    active: false,
    tags: ['开发', '#mock', '#api'],
  },
];

const metrics = [
  { label: '使用量', value: '45', tone: 'blue' },
  { label: '下载量', value: '13', tone: 'cyan' },
  { label: 'AI评分', value: '68', tone: 'indigo' },
  { label: '专家评审得分', value: '75', tone: 'green' },
];

const scoreTabs = ['结构详情', '效果评分', '反馈评分', '影响评分', '专家评审'];

const computeChannels = [
  { name: '张三', id: 'z00123456', type: '标准算力', status: '启用' },
  { name: '李四', id: 'l30012345', type: '无限 token', status: '启用' },
  { name: '王五', id: 'w10088991', type: '低延迟', status: '暂停' },
];

const medalRows = [
  { name: '会议助手', owner: '张三', count: 5, medals: ['月度', '专业'] },
  { name: '日志分析 Skill', owner: '李四', count: 4, medals: ['影响', '新锐'] },
  { name: '接口 Mock 生成', owner: '王五', count: 3, medals: ['效率', '个人'] },
];

const reviewDimensions = [
  '边界覆盖维度',
  '指令具体性维度',
  '可执行性维度',
  '场景匹配维度',
  '总体评价',
];
const reviewDimensionDetails: Record<
  string,
  {
    score: number;
    summary: string;
    checks: string[];
    placeholder: string;
  }
> = {
  边界覆盖维度: {
    score: 86,
    summary: '检查 Skill 是否覆盖主要业务边界、异常输入和权限限制。',
    checks: ['核心使用场景完整', '异常输入处理明确', '权限与数据范围有说明'],
    placeholder: '填写边界覆盖情况、遗漏场景和需要补充的边界条件',
  },
  指令具体性维度: {
    score: 91,
    summary: '检查 Skill 指令是否清晰、可复现，是否减少执行歧义。',
    checks: ['目标描述具体', '输入输出格式明确', '步骤顺序清晰'],
    placeholder: '填写指令具体性评价、模糊描述和推荐改写建议',
  },
  可执行性维度: {
    score: 83,
    summary: '检查 Skill 是否具备稳定执行所需的依赖、参数和失败兜底。',
    checks: ['依赖说明完整', '参数示例可直接复用', '失败处理路径明确'],
    placeholder: '填写可执行性评价、阻塞点和落地风险',
  },
  场景匹配维度: {
    score: 88,
    summary: '检查 Skill 与目标业务场景、目标用户和交付流程的匹配程度。',
    checks: ['目标人群清楚', '业务流程匹配', '结果能直接用于交付'],
    placeholder: '填写场景匹配评价、适用范围和不适用场景',
  },
  总体评价: {
    score: 90,
    summary: '综合各维度评分、使用数据和专家意见，给出最终评价与授奖建议。',
    checks: ['综合评分达标', '具备复用价值', '可进入月度评优候选'],
    placeholder: '输入总体评价、授奖理由与后续改进建议',
  },
};
const activeScoreTab = ref('结构详情');
const activeReviewDimension = ref('总体评价');
const isExpertScoreTab = computed(() => activeScoreTab.value === '专家评审');
const activeReviewDimensionDetail = computed(
  () => reviewDimensionDetails[activeReviewDimension.value],
);
</script>

<template>
  <div class="review-center-page">
    <div class="review-shell">
      <section class="review-board" aria-label="评审任务">
        <div class="board-toolbar">
          <div>
            <h2>评审任务</h2>
            <p>按状态、月份和评分维度筛选专家待办。</p>
          </div>
          <div class="toolbar-controls">
            <select aria-label="评审状态">
              <option>未评审 / 已评审 / 未评分</option>
              <option>只看待评审</option>
              <option>只看已完成</option>
            </select>
            <select aria-label="月份">
              <option>2026年05月</option>
              <option>2026年04月</option>
            </select>
            <button type="button">按月度 AI 评分 TOP 排序</button>
          </div>
        </div>

        <div class="board-layout">
          <aside class="task-list" aria-label="任务列表">
            <article
              v-for="task in taskCards"
              :key="task.id"
              class="task-card"
              :class="{ 'is-active': task.active }"
            >
              <div class="task-card__title">{{ task.name }}</div>
              <div class="task-card__meta">{{ task.owner }} {{ task.id }} · {{ task.team }}</div>
              <div class="task-card__tags">
                <span v-for="tag in task.tags" :key="tag">{{ tag }}</span>
              </div>
            </article>
          </aside>

          <section class="skill-detail" aria-label="Skill 详情">
            <div class="metric-row">
              <span
                v-for="metric in metrics"
                :key="metric.label"
                :class="['metric-chip', `is-${metric.tone}`]"
              >
                {{ metric.label }} {{ metric.value }}
              </span>
            </div>

            <div class="score-tabs" role="tablist" aria-label="评分类型">
              <button
                v-for="tab in scoreTabs"
                :key="tab"
                :class="{ 'is-active': activeScoreTab === tab }"
                type="button"
                @click="activeScoreTab = tab"
              >
                {{ tab }}
              </button>
            </div>

            <div v-if="!isExpertScoreTab" class="score-tab-pane">
              <div class="skill-preview">
                <div class="file-tree">
                  <strong>文件结构</strong>
                  <ul>
                    <li>test2-skill/</li>
                    <li class="is-selected">SKILL.md</li>
                    <li>deploy/</li>
                    <li>values.yaml</li>
                    <li>chart.yaml</li>
                    <li>ci/Jenkinsfile</li>
                  </ul>
                </div>
                <div class="readme-preview">
                  <strong>SKILL.md</strong>
                  <h3>test2 Skill</h3>
                  <p>多版本历史 + deploy / ci 目录，正文用于与 test1 区分效果。</p>
                  <p>当前版本覆盖批处理、交付模板和常见异常处理流程。</p>
                </div>
              </div>

              <div class="structure-panel">
                <div class="section-heading">
                  <h3>{{ activeScoreTab }}打分情况</h3>
                  <span>专家评分维度：完整性、清晰度、可复用性</span>
                </div>
                <div class="score-composer">
                  <div class="score-scale">
                    <span>0</span>
                    <div class="score-scale__bar"><span style="width: 84%"></span></div>
                    <span>100</span>
                  </div>
                  <textarea
                    aria-label="结构打分情况"
                    placeholder="记录评审意见、扣分点和改进建议"
                  ></textarea>
                </div>
              </div>
            </div>

            <section
              v-else
              class="expert-review expert-review--inline"
              aria-labelledby="expert-title"
            >
              <div class="expert-review__header">
                <div>
                  <p class="review-hero__eyebrow">Expert Score Detail</p>
                  <h2 id="expert-title">专家评审打分详情</h2>
                </div>
                <button type="button">历史评审记录</button>
              </div>

              <div class="dimension-tabs" role="tablist" aria-label="专家评分维度">
                <button
                  v-for="dimension in reviewDimensions"
                  :key="dimension"
                  :class="{ 'is-active': activeReviewDimension === dimension }"
                  type="button"
                  @click="activeReviewDimension = dimension"
                >
                  {{ dimension }}
                </button>
              </div>

              <div class="expert-editor">
                <div class="expert-dimension-summary">
                  <div class="dimension-score">
                    <strong>{{ activeReviewDimensionDetail.score }}</strong>
                    <span>分</span>
                  </div>
                  <div>
                    <h3>{{ activeReviewDimension }}</h3>
                    <p>{{ activeReviewDimensionDetail.summary }}</p>
                  </div>
                </div>

                <div class="dimension-checks" aria-label="维度检查项">
                  <span v-for="check in activeReviewDimensionDetail.checks" :key="check">{{
                    check
                  }}</span>
                </div>

                <div class="expert-editor__controls">
                  <label>
                    <span>是否授予个人勋章</span>
                    <input type="checkbox" checked />
                  </label>
                  <select aria-label="勋章类型">
                    <option>选择绿色通道类型（默认无）</option>
                    <option>月度优秀勋章</option>
                    <option>专家认可勋章</option>
                  </select>
                </div>
                <label class="review-textarea">
                  <span>{{ activeReviewDimension }}详情</span>
                  <textarea :placeholder="activeReviewDimensionDetail.placeholder"></textarea>
                </label>
              </div>
            </section>
          </section>

          <aside class="support-column" aria-label="资源与榜单">
            <section class="side-panel">
              <div class="side-panel__header">
                <h2>算力 / Token 绿色通道</h2>
                <button type="button" aria-label="新增通道">+</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>人员</th>
                    <th>开通类型</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="channel in computeChannels" :key="channel.id">
                    <td>
                      {{ channel.name }}<span>{{ channel.id }}</span>
                    </td>
                    <td>{{ channel.type }}</td>
                    <td>{{ channel.status }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="side-panel">
              <div class="side-panel__header">
                <h2>勋章榜单</h2>
                <button type="button" aria-label="查看规则">i</button>
              </div>
              <div class="medal-list">
                <article v-for="row in medalRows" :key="row.name" class="medal-row">
                  <div>
                    <strong>{{ row.name }}</strong>
                    <span>{{ row.owner }} · 获得 {{ row.count }} 枚</span>
                  </div>
                  <div class="medal-icons">
                    <span v-for="medal in row.medals" :key="medal">{{ medal.slice(0, 1) }}</span>
                  </div>
                </article>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.review-center-page {
  min-height: 100vh;
  background: #f4f7fb;
  color: #17233d;
  font-size: 14px;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
}

.review-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto auto minmax(260px, 1fr) auto;
  align-items: center;
  gap: 24px;
  height: 70px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(25, 43, 75, 0.06);
  backdrop-filter: blur(10px);
}

.review-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #2563eb;
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.review-brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: #ffffff;
  font-size: 18px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
}

.review-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.review-nav__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  height: 42px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #1f2f4a;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.review-nav__item.is-active {
  border-color: #0f172a;
  background: #eef4ff;
  color: #1d4ed8;
}

.review-search {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: stretch;
  height: 46px;
  min-width: 260px;
  padding: 0 18px;
  border-radius: 24px;
  background: #eef2f7;
  color: #8aa0bd;
}

.review-search__icon {
  width: 14px;
  height: 14px;
  border: 2px solid #9aaaca;
  border-radius: 50%;
  position: relative;
  flex: 0 0 auto;
}

.review-search__icon::after {
  position: absolute;
  right: -6px;
  bottom: -5px;
  width: 7px;
  height: 2px;
  background: #9aaaca;
  border-radius: 999px;
  content: '';
  transform: rotate(45deg);
}

.review-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #263854;
  font: inherit;
}

.review-help {
  width: 32px;
  height: 32px;
  border: 2px solid #0f172a;
  border-radius: 50%;
  background: #ffffff;
  color: #0f172a;
  font-weight: 800;
}

.review-shell {
  display: block;
  min-height: calc(100vh - 70px);
}

.review-sidebar {
  display: none;
  padding: 24px 18px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.filter-section {
  margin-bottom: 24px;
}

.filter-section h2 {
  margin: 0 0 12px;
  color: #65748f;
  font-size: 15px;
  font-weight: 800;
}

.filter-pill,
.dimension-grid button {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.filter-pill {
  display: block;
  margin-bottom: 10px;
  text-align: left;
  padding: 0 16px;
}

.filter-pill.is-active {
  border-color: #bfdbfe;
  background: #eaf2ff;
  color: #2563eb;
}

.dimension-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.medal-filter-list {
  display: grid;
  gap: 8px;
}

.medal-filter-list span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  background: #ffffff;
  color: #52657f;
  font-weight: 700;
}

.review-main {
  padding: 24px 24px 40px;
  overflow: hidden;
}

.review-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 168px;
  padding: 30px 42px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 88% 18%, rgba(255, 255, 255, 0.2), transparent 22%),
    linear-gradient(115deg, #2f6bed 0%, #3553e7 54%, #4424b9 100%);
  color: #ffffff;
  box-shadow: 0 18px 36px rgba(47, 83, 226, 0.22);
}

.review-hero__eyebrow {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.review-hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
  letter-spacing: 0;
}

.review-hero p:not(.review-hero__eyebrow) {
  max-width: 760px;
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  line-height: 1.8;
}

.primary-action,
.expert-review__header button {
  min-width: 160px;
  height: 46px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(210px, 1fr));
  gap: 18px;
  margin-top: 22px;
}

.ranking-card,
.review-board,
.side-panel,
.expert-review {
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(25, 43, 75, 0.06);
}

.ranking-card {
  padding: 16px 16px 14px;
}

.ranking-card__header,
.board-toolbar,
.side-panel__header,
.expert-review__header,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ranking-card h2,
.board-toolbar h2,
.side-panel h2,
.expert-review h2 {
  margin: 0;
  color: #101828;
  font-size: 16px;
  line-height: 1.35;
}

.ranking-card__header button,
.side-panel__header button {
  width: 30px;
  height: 30px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #f8fbff;
  color: #5b6b84;
  font-weight: 800;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

th,
td {
  padding: 9px 6px;
  border-bottom: 1px solid #edf1f7;
  color: #40516d;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #6a7890;
  font-weight: 800;
}

.review-board {
  margin-top: 22px;
  padding: 18px;
}

.board-toolbar {
  align-items: flex-start;
  margin-bottom: 18px;
}

.board-toolbar p {
  margin: 5px 0 0;
  color: #697890;
  font-size: 13px;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.toolbar-controls select,
.toolbar-controls button,
.expert-editor select {
  height: 38px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  color: #233752;
  font: inherit;
  font-weight: 700;
}

.toolbar-controls select {
  min-width: 150px;
  padding: 0 10px;
}

.toolbar-controls button {
  min-width: 200px;
  padding: 0 14px;
}

.board-layout {
  display: grid;
  grid-template-columns: 220px minmax(420px, 1fr) 280px;
  gap: 18px;
  align-items: stretch;
}

.task-list {
  display: grid;
  align-content: start;
  gap: 12px;
  padding-right: 12px;
  border-right: 1px solid #e2e8f0;
}

.task-card {
  padding: 14px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #ffffff;
}

.task-card.is-active {
  border-color: #60a5fa;
  box-shadow: inset 4px 0 0 #3b82f6;
}

.task-card__title {
  color: #101828;
  font-size: 15px;
  font-weight: 800;
}

.task-card__meta {
  margin-top: 10px;
  color: #5e6d84;
  font-size: 13px;
}

.task-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.task-card__tags span {
  padding: 4px 8px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.skill-detail {
  min-width: 0;
}

.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid;
  border-radius: 8px;
  font-weight: 800;
}

.metric-chip.is-blue {
  border-color: #7dd3fc;
  background: #e0f2fe;
  color: #0369a1;
}

.metric-chip.is-cyan {
  border-color: #67e8f9;
  background: #ecfeff;
  color: #0e7490;
}

.metric-chip.is-indigo {
  border-color: #a5b4fc;
  background: #eef2ff;
  color: #4338ca;
}

.metric-chip.is-green {
  border-color: #86efac;
  background: #ecfdf5;
  color: #047857;
}

.score-tabs,
.dimension-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-top: 12px;
}

.score-tabs button,
.dimension-tabs button {
  min-width: 116px;
  height: 34px;
  border: 1px solid #0f172a;
  background: #f8fafc;
  color: #253857;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.score-tabs button:first-child,
.dimension-tabs button:first-child {
  border-radius: 8px 0 0 8px;
}

.score-tabs button:last-child,
.dimension-tabs button:last-child {
  border-radius: 0 8px 8px 0;
}

.score-tabs button.is-active,
.dimension-tabs button.is-active {
  background: #97d9ff;
  color: #0f3a6b;
}

.skill-preview {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(240px, 1.1fr);
  gap: 12px;
  margin-top: 12px;
}

.file-tree,
.readme-preview {
  min-height: 146px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.file-tree strong,
.readme-preview strong {
  display: block;
  margin-bottom: 12px;
  color: #334155;
  font-size: 12px;
}

.file-tree ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: #53647d;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.8;
}

.file-tree li {
  padding-left: 16px;
  border-left: 2px solid #cbd5e1;
}

.file-tree li.is-selected {
  border-radius: 6px;
  background: #dbeafe;
  color: #1d4ed8;
}

.readme-preview h3 {
  margin: 0 0 12px;
  color: #1e293b;
  font-size: 20px;
}

.readme-preview p {
  margin: 0 0 10px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.structure-panel {
  margin-top: 20px;
}

.section-heading h3 {
  margin: 0;
  color: #101828;
  font-size: 17px;
}

.section-heading span {
  color: #708096;
  font-size: 13px;
}

.score-composer {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #fbfdff;
}

.score-scale {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  color: #64748b;
  font-weight: 800;
}

.score-scale__bar {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.score-scale__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #22c55e);
}

textarea {
  width: 100%;
  min-height: 104px;
  resize: vertical;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
  padding: 14px;
  color: #24364f;
  font: inherit;
  line-height: 1.7;
  outline: 0;
}

textarea:focus,
select:focus,
button:focus-visible,
input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.support-column {
  display: grid;
  align-content: start;
  gap: 18px;
}

.side-panel {
  padding: 16px;
}

.side-panel table span {
  display: block;
  margin-top: 4px;
  color: #7b8aa0;
  font-size: 12px;
}

.medal-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.medal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fbfdff;
}

.medal-row strong,
.medal-row span {
  display: block;
}

.medal-row strong {
  color: #17233d;
  font-size: 14px;
}

.medal-row span {
  margin-top: 4px;
  color: #697890;
  font-size: 12px;
}

.medal-icons {
  display: flex;
  gap: 6px;
}

.medal-icons span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff7ed;
  color: #c2410c;
  font-size: 13px;
  font-weight: 900;
}

.expert-review {
  max-width: 960px;
  margin: 28px auto 0;
  padding: 22px;
}

.expert-review--inline {
  max-width: none;
  margin: 16px 0 0;
  padding: 18px;
}

.expert-review__header .review-hero__eyebrow {
  color: #5d78a5;
}

.expert-review__header h2 {
  font-size: 20px;
}

.expert-review__header button {
  border: 1px solid #0f172a;
  box-shadow: none;
}

.expert-editor {
  margin-top: 0;
  padding: 18px;
  border: 1px solid #111827;
  border-radius: 8px;
}

.expert-dimension-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.dimension-score {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #eaf2ff;
  color: #1d4ed8;
}

.dimension-score strong {
  font-size: 20px;
  line-height: 1;
}

.dimension-score span {
  margin-top: 4px;
  color: #53709b;
  font-size: 12px;
  font-weight: 800;
}

.expert-dimension-summary h3 {
  margin: 0;
  color: #17233d;
  font-size: 16px;
}

.expert-dimension-summary p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.dimension-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.dimension-checks span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
  font-weight: 800;
}

.expert-editor__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 14px;
}

.expert-editor__controls label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  font-weight: 800;
}

.expert-editor__controls input {
  width: 20px;
  height: 20px;
  accent-color: #2563eb;
}

.expert-editor select {
  min-width: 260px;
  padding: 0 12px;
}

.review-textarea span {
  display: block;
  margin-bottom: 10px;
  color: #334155;
  font-weight: 800;
}

.review-textarea textarea {
  min-height: 118px;
}

@media (max-width: 1440px) {
  .ranking-grid {
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }

  .board-layout {
    grid-template-columns: 220px minmax(360px, 1fr);
  }

  .support-column {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }
}

@media (max-width: 1120px) {
  .review-topbar {
    grid-template-columns: 1fr auto;
    height: auto;
    padding: 16px 20px;
  }

  .review-nav,
  .review-search {
    grid-column: 1 / -1;
  }

  .review-search {
    min-width: 0;
  }

  .review-shell {
    grid-template-columns: 1fr;
  }

  .review-sidebar {
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .review-main {
    padding: 22px 18px 36px;
  }

  .review-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 820px) {
  .review-nav {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .ranking-grid,
  .support-column,
  .skill-preview,
  .board-layout {
    grid-template-columns: 1fr;
  }

  .task-list {
    padding-right: 0;
    border-right: 0;
  }

  .board-toolbar,
  .expert-review__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-controls,
  .toolbar-controls select,
  .toolbar-controls button,
  .primary-action,
  .expert-review__header button {
    width: 100%;
  }

  .review-hero {
    padding: 28px;
  }

  .review-hero h1 {
    font-size: 32px;
  }
}
</style>

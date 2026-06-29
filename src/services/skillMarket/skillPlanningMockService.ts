import * as XLSX from 'xlsx';
import {
  cloneSkillPlanningItem,
  exportSkillPlanningTemplateToExcel,
  normalizeProgress,
  normalizeSkillPlanningPayload,
  normalizeText,
  normalizeTextArray,
  rowToSkillPlanningPayload,
  skillPlanningExportHeaders,
  skillPlanningFieldMap,
  type ProductPlanningOption,
  type SkillPlanningBatchPatch,
  type SkillPlanningFilterOptions,
  type SkillPlanningImportResult,
  type SkillPlanningOptionGroup,
  type SkillPlanningItem,
  type SkillPlanningListResult,
  type SkillPlanningPayload,
  type SkillPlanningQuery,
} from './skillPlanningShared';

const initialSkillPlanningItems: SkillPlanningItem[] = [
  {
    id: 'plan-1001',
    firstScene: '研发提效',
    secondScene: '代码生成',
    activityNodeName: '需求研发',
    subActivityNodeName: '接口开发',
    name: '接口 Mock 生成 Skill',
    description: '根据接口定义自动生成 Mock 数据和联调示例，减少前后端等待时间。',
    level: '平台级',
    offeringId: 'offering-api',
    offeringName: 'API产品线',
    owner: '张三',
    deptCode: 'dept-api-link',
    deptName: '联调工具部',
    developOwner: '李明',
    planedCompleteDate: '2026-07-15',
    status: '开发中',
  },
  {
    id: 'plan-1002',
    firstScene: '质量保障',
    secondScene: '测试设计',
    activityNodeName: '测试验证',
    subActivityNodeName: '用例生成',
    name: '测试用例评审 Skill',
    description: '围绕需求说明和历史缺陷生成测试用例评审建议，提升测试覆盖完整度。',
    level: '部门级',
    offeringId: 'offering-quality',
    offeringName: '质量产品线',
    owner: '李四',
    deptCode: 'dept-review-team',
    deptName: '评审小组',
    developOwner: '周扬',
    planedCompleteDate: '2026-08-05',
    status: '未开始',
  },
  {
    id: 'plan-1003',
    firstScene: '运营分析',
    secondScene: '日志洞察',
    activityNodeName: '线上运营',
    subActivityNodeName: '异常定位',
    name: '日志异常定位 Skill',
    description: '汇总异常日志、调用链和发布记录，输出可执行的问题定位摘要。',
    level: '组织级',
    offeringId: 'offering-sre',
    offeringName: 'SRE产品线',
    owner: '王五',
    deptCode: 'dept-log-tools',
    deptName: '日志工具组',
    developOwner: '陈七',
    planedCompleteDate: '2026-06-30',
    status: '联调中',
  },
  {
    id: 'plan-1004',
    firstScene: '知识管理',
    secondScene: '文档沉淀',
    activityNodeName: '交付复盘',
    subActivityNodeName: '知识入库',
    name: '会议纪要沉淀 Skill',
    description: '从会议记录中抽取决策、风险、待办和关联文档，自动整理到团队知识库。',
    level: '部门级',
    offeringId: 'offering-project',
    offeringName: '项目产品线',
    owner: '赵六',
    deptCode: 'dept-project-management',
    deptName: '项目管理部',
    developOwner: '刘岚',
    planedCompleteDate: '2026-07-28',
    status: '开发中',
  },
  {
    id: 'plan-1005',
    firstScene: '发布运维',
    secondScene: '变更管控',
    activityNodeName: '版本发布',
    subActivityNodeName: '发布检查',
    name: '发布风险检查 Skill',
    description: '结合发布单、代码变更和历史事故，生成发布前风险检查清单。',
    level: '平台级',
    offeringId: 'offering-devops',
    offeringName: '平台产品线',
    owner: '钱慧',
    deptCode: 'dept-release-tools',
    deptName: '发布工具组',
    developOwner: '吴越',
    planedCompleteDate: '2026-06-20',
    status: '已延期',
  },
  {
    id: 'plan-1006',
    firstScene: '用户支持',
    secondScene: '问答助手',
    activityNodeName: '服务支持',
    subActivityNodeName: '问题分流',
    name: '工单智能分派 Skill',
    description: '按问题类型、系统模块和处理经验自动推荐承接团队与处理路径。',
    level: '组织级',
    offeringId: 'offering-cloud-service',
    offeringName: '云服务产品线',
    owner: '孙宇',
    deptCode: 'dept-cloud-sre',
    deptName: 'SRE团队',
    developOwner: '高宁',
    planedCompleteDate: '2026-09-10',
    status: '未开始',
  },
  {
    id: 'plan-1007',
    firstScene: '研发提效',
    secondScene: '代码审查',
    activityNodeName: '需求研发',
    subActivityNodeName: '合并评审',
    name: '代码评审摘要 Skill',
    description: '生成代码改动摘要、风险点和建议关注文件，辅助 reviewer 快速进入上下文。',
    level: '个人级',
    offeringId: 'offering-platform-tools',
    offeringName: '平台工具产品线',
    owner: '何佳',
    deptCode: 'dept-change-analysis',
    deptName: '变更分析组',
    developOwner: '许安',
    planedCompleteDate: '2026-08-18',
    status: '开发中',
  },
  {
    id: 'plan-1008',
    firstScene: '质量保障',
    secondScene: '缺陷复盘',
    activityNodeName: '问题闭环',
    subActivityNodeName: '根因分析',
    name: '缺陷根因归纳 Skill',
    description: '对缺陷描述、提交记录和修复方案进行归纳，输出可复用的质量改进建议。',
    level: '部门级',
    offeringId: 'offering-quality',
    offeringName: '质量产品线',
    owner: '郑欣',
    deptCode: 'dept-quality-tools',
    deptName: '质量工具组',
    developOwner: '马可',
    planedCompleteDate: '2026-07-08',
    status: '已完成',
  },
  {
    id: 'plan-1009',
    firstScene: '数据治理',
    secondScene: 'SQL治理',
    activityNodeName: '数据开发',
    subActivityNodeName: 'SQL优化',
    name: 'SQL 改写建议 Skill',
    description: '识别慢 SQL、缺失索引和高风险写法，给出可落地的改写建议。',
    level: '平台级',
    offeringId: 'offering-data',
    offeringName: '数据产品线',
    owner: '林澈',
    deptCode: 'dept-sql-governance',
    deptName: 'SQL治理组',
    developOwner: '唐可',
    planedCompleteDate: '2026-07-22',
    status: '联调中',
  },
  {
    id: 'plan-1010',
    firstScene: '需求管理',
    secondScene: '需求澄清',
    activityNodeName: '需求分析',
    subActivityNodeName: '边界确认',
    name: '需求澄清助手 Skill',
    description: '根据需求文本自动提炼目标、依赖、异常场景和待确认问题。',
    level: '部门级',
    offeringId: 'offering-business',
    offeringName: '业务产品线',
    owner: '顾宁',
    deptCode: 'dept-requirement-analysis',
    deptName: '需求分析组',
    developOwner: '孟扬',
    planedCompleteDate: '2026-08-12',
    status: '开发中',
  },
  {
    id: 'plan-1011',
    firstScene: '体验设计',
    secondScene: '设计走查',
    activityNodeName: '交互设计',
    subActivityNodeName: '一致性检查',
    name: '设计规范走查 Skill',
    description: '对页面截图和组件标注进行走查，发现间距、文案和状态一致性问题。',
    level: '部门级',
    offeringId: 'offering-design',
    offeringName: '设计产品线',
    owner: '许晴',
    deptCode: 'dept-experience-design',
    deptName: '体验设计部',
    developOwner: '韩舟',
    planedCompleteDate: '2026-09-01',
    status: '未开始',
  },
  {
    id: 'plan-1012',
    firstScene: '发布运维',
    secondScene: '变更分析',
    activityNodeName: '变更评估',
    subActivityNodeName: '影响面识别',
    name: '变更影响分析 Skill',
    description: '基于代码改动、服务依赖和配置差异，生成发布影响面与回滚关注点。',
    level: '组织级',
    offeringId: 'offering-platform-tools',
    offeringName: '平台工具产品线',
    owner: '罗一',
    deptCode: 'dept-change-analysis',
    deptName: '变更分析组',
    developOwner: '谢南',
    planedCompleteDate: '2026-07-30',
    status: '开发中',
  },
  {
    id: 'plan-1013',
    firstScene: '项目管理',
    secondScene: '风险跟踪',
    activityNodeName: '项目推进',
    subActivityNodeName: '周报生成',
    name: '项目风险播报 Skill',
    description: '汇总里程碑、阻塞事项和依赖团队状态，自动生成项目风险播报。',
    level: '部门级',
    offeringId: 'offering-project',
    offeringName: '项目产品线',
    owner: '蒋晨',
    deptCode: 'dept-project-management',
    deptName: '项目管理部',
    developOwner: '彭越',
    planedCompleteDate: '2026-08-25',
    status: '已完成',
  },
  {
    id: 'plan-1014',
    firstScene: '移动研发',
    secondScene: '埋点验收',
    activityNodeName: '客户端发布',
    subActivityNodeName: '数据验收',
    name: '移动端埋点验收 Skill',
    description: '比对埋点方案、客户端日志和验收清单，自动标记漏埋与字段异常。',
    level: '个人级',
    offeringId: 'offering-mobile',
    offeringName: '移动端产品线',
    owner: '丁然',
    deptCode: 'dept-test-team',
    deptName: '测试部门',
    developOwner: '沈星',
    planedCompleteDate: '2026-09-18',
    status: '未开始',
  },
  {
    id: 'plan-1015',
    firstScene: '稳定性保障',
    secondScene: '巡检报告',
    activityNodeName: '线上运营',
    subActivityNodeName: '日报生成',
    name: '稳定性日报 Skill',
    description: '整合告警、容量、错误率和变更信息，生成每日稳定性结论和待办。',
    level: '组织级',
    offeringId: 'offering-cloud-service',
    offeringName: '云服务产品线',
    owner: '叶航',
    deptCode: 'dept-cloud-sre',
    deptName: 'SRE团队',
    developOwner: '冯澈',
    planedCompleteDate: '2026-06-26',
    status: '已完成',
  },
  {
    id: 'plan-1016',
    firstScene: '质量保障',
    secondScene: '接口契约',
    activityNodeName: '测试验证',
    subActivityNodeName: '契约校验',
    name: '接口契约校验 Skill',
    description: '对比接口契约、Mock 响应和真实返回，定位字段缺失、类型不一致和兼容性风险。',
    level: '平台级',
    offeringId: 'offering-api',
    offeringName: 'API产品线',
    owner: '苏棠',
    deptCode: 'dept-api-link',
    deptName: '联调工具部',
    developOwner: '秦川',
    planedCompleteDate: '2026-08-02',
    status: '联调中',
  },
];

const mockProductPlanningOptions: ProductPlanningOption[] = [
  { offeringId: 'offering-api', offeringName: 'API产品线' },
  { offeringId: 'offering-quality', offeringName: '质量产品线' },
  { offeringId: 'offering-sre', offeringName: 'SRE产品线' },
  { offeringId: 'offering-project', offeringName: '项目产品线' },
  { offeringId: 'offering-devops', offeringName: '平台产品线' },
  { offeringId: 'offering-cloud-service', offeringName: '云服务产品线' },
  { offeringId: 'offering-platform-tools', offeringName: '平台工具产品线' },
  { offeringId: 'offering-data', offeringName: '数据产品线' },
  { offeringId: 'offering-business', offeringName: '业务产品线' },
  { offeringId: 'offering-design', offeringName: '设计产品线' },
  { offeringId: 'offering-mobile', offeringName: '移动端产品线' },
];

let skillPlanningItems = [...initialSkillPlanningItems];
let idSeed = 2000;

function matchesDateRange(item: SkillPlanningItem, query: SkillPlanningQuery): boolean {
  const date = item.planedCompleteDate;
  if (query.plannedStartDate && date < query.plannedStartDate) {
    return false;
  }
  if (query.plannedEndDate && date > query.plannedEndDate) {
    return false;
  }
  return true;
}

function matchesDiscreteFilter(value: string, values: string[]): boolean {
  return values.length === 0 || values.includes(value);
}

function sortItems(items: SkillPlanningItem[], query: SkillPlanningQuery): SkillPlanningItem[] {
  if (query.sortBy !== 'planedCompleteDate' || !query.sortOrder) {
    return items;
  }

  const sorted = [...items];
  sorted.sort((left, right) => {
    const result = left.planedCompleteDate.localeCompare(right.planedCompleteDate);
    return query.sortOrder === 'asc' ? result : -result;
  });
  return sorted;
}

function distinctValuesInOrder(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function createOptionGroups(
  parentKey: 'firstScene' | 'activityNodeName',
  childKey: 'secondScene' | 'subActivityNodeName',
): SkillPlanningOptionGroup[] {
  const groupMap = new Map<string, string[]>();

  skillPlanningItems.forEach((item) => {
    const parent = normalizeText(item[parentKey]);
    const child = normalizeText(item[childKey]);
    if (!parent) {
      return;
    }
    groupMap.set(parent, distinctValuesInOrder([...(groupMap.get(parent) ?? []), child]));
  });

  return Array.from(groupMap, ([value, children]) => ({ value, children }));
}

function filterItems(query: SkillPlanningQuery): SkillPlanningItem[] {
  const keyword = normalizeText(query.keyword).toLowerCase();
  const firstScene = normalizeTextArray(query.firstScene);
  const secondScene = normalizeTextArray(query.secondScene);
  const activityNodeName = normalizeTextArray(query.activityNodeName);
  const subActivityNodeName = normalizeTextArray(query.subActivityNodeName);
  const level = normalizeTextArray(query.level);
  const status = normalizeTextArray(query.status);
  const department =
    normalizeText(query.deptName) ||
    normalizeText((query as { department?: unknown }).department) ||
    [
      query.departmentL8,
      query.departmentL7,
      query.departmentL6,
      query.departmentL5,
      query.departmentL4,
      query.departmentL3,
    ]
      .map(normalizeText)
      .find(Boolean) ||
    '';
  const owner = normalizeText(query.owner);

  return skillPlanningItems.filter((item) => {
    if (department && item.deptName !== department) return false;
    if (!matchesDiscreteFilter(item.firstScene, firstScene)) return false;
    if (!matchesDiscreteFilter(item.secondScene, secondScene)) return false;
    if (!matchesDiscreteFilter(item.activityNodeName, activityNodeName)) return false;
    if (!matchesDiscreteFilter(item.subActivityNodeName, subActivityNodeName)) return false;
    if (!matchesDiscreteFilter(item.level, level)) return false;
    if (!matchesDiscreteFilter(item.status, status)) return false;
    if (owner && !item.owner.includes(owner)) return false;
    if (!matchesDateRange(item, query)) return false;
    if (!keyword) return true;

    return [item.offeringName, item.name, item.description, item.owner, item.deptName, item.developOwner]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
}

export async function getPlanningOption(): Promise<SkillPlanningFilterOptions> {
  const sceneGroups = createOptionGroups('firstScene', 'secondScene');
  const activityGroups = createOptionGroups('activityNodeName', 'subActivityNodeName');

  return {
    firstScene: sceneGroups.map((group) => group.value),
    secondScene: distinctValuesInOrder(sceneGroups.flatMap((group) => group.children)),
    activityNodeName: activityGroups.map((group) => group.value),
    subActivityNodeName: distinctValuesInOrder(activityGroups.flatMap((group) => group.children)),
    level: distinctValuesInOrder(skillPlanningItems.map((item) => item.level)),
    status: distinctValuesInOrder(skillPlanningItems.map((item) => item.status)),
    sceneGroups,
    activityGroups,
  };
}

export async function querySkillConfig(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  const pageNum = Math.max(1, Number(query.pageNum ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const filtered = sortItems(filterItems(query), query);
  const start = (pageNum - 1) * pageSize;

  return {
    list: filtered.slice(start, start + pageSize).map(cloneSkillPlanningItem),
    total: filtered.length,
  };
}

export async function exportAllSkillPlanningList(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningItem[]> {
  return sortItems(filterItems(query), query).map(cloneSkillPlanningItem);
}

export async function getProductPlanning(
  params: { offeringName?: string } = {},
): Promise<ProductPlanningOption[]> {
  const keyword = normalizeText(params.offeringName).toLowerCase();
  const optionMap = new Map<string, ProductPlanningOption>();

  [...mockProductPlanningOptions, ...skillPlanningItems].forEach((item) => {
    const option = {
      offeringId: normalizeText(item.offeringId),
      offeringName: normalizeText(item.offeringName),
    };
    if (!option.offeringName) {
      return;
    }
    optionMap.set(option.offeringId || option.offeringName, option);
  });

  return Array.from(optionMap.values()).filter((option) =>
    keyword ? option.offeringName.toLowerCase().includes(keyword) : true,
  );
}

export async function createSkillPlanning(
  payload: SkillPlanningPayload,
): Promise<SkillPlanningItem> {
  const item = {
    id: `plan-${idSeed++}`,
    ...normalizeSkillPlanningPayload(payload),
  };
  skillPlanningItems = [item, ...skillPlanningItems];
  return cloneSkillPlanningItem(item);
}

export async function updateSkillPlanning(
  id: string,
  payload: SkillPlanningPayload,
): Promise<SkillPlanningItem> {
  const index = skillPlanningItems.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error('未找到要编辑的 Skill 规划');
  }

  const next = { id, ...normalizeSkillPlanningPayload(payload) };
  skillPlanningItems.splice(index, 1, next);
  return cloneSkillPlanningItem(next);
}

function normalizeSkillPlanningBatchPatch(patch: SkillPlanningBatchPatch): SkillPlanningBatchPatch {
  const next: SkillPlanningBatchPatch = {};
  const description = normalizeText(patch.description);
  const offeringName = normalizeText(patch.offeringName);
  const owner = normalizeText(patch.owner);
  const deptName = normalizeText(patch.deptName);
  const developOwner = normalizeText(patch.developOwner);
  const planedCompleteDate = normalizeText(patch.planedCompleteDate);
  const status = normalizeText(patch.status);

  if (description) next.description = description;
  if (offeringName) next.offeringName = offeringName;
  if (owner) next.owner = owner;
  if (deptName) next.deptName = deptName;
  if (developOwner) next.developOwner = developOwner;
  if (planedCompleteDate) next.planedCompleteDate = planedCompleteDate;
  if (status) next.status = normalizeProgress(status);

  return next;
}

export async function batchUpdateSkillPlanning(
  ids: string[],
  patch: SkillPlanningBatchPatch,
): Promise<number> {
  const idSet = new Set(normalizeTextArray(ids));
  const nextPatch = normalizeSkillPlanningBatchPatch(patch);
  if (idSet.size === 0 || Object.keys(nextPatch).length === 0) {
    return 0;
  }

  let updatedCount = 0;
  skillPlanningItems = skillPlanningItems.map((item) => {
    if (!idSet.has(item.id)) {
      return item;
    }
    updatedCount += 1;
    return { ...item, ...nextPatch };
  });

  return updatedCount;
}

export async function deleteSkillPlanning(id: string): Promise<void> {
  skillPlanningItems = skillPlanningItems.filter((item) => item.id !== id);
}

export async function batchDeleteSkillPlanning(ids: string[]): Promise<number> {
  const idSet = new Set(ids);
  const before = skillPlanningItems.length;
  skillPlanningItems = skillPlanningItems.filter((item) => !idSet.has(item.id));
  return before - skillPlanningItems.length;
}

export async function downloadSkillPlanningTemplate(): Promise<void> {
  await exportSkillPlanningTemplateToExcel();
}

export async function importSkillPlanningFromExcel(file: File): Promise<SkillPlanningImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerSet = new Set((headerRows[0] ?? []).map(normalizeText));
  const presentKeys = new Set(
    Array.from(headerSet)
      .map((header) => skillPlanningFieldMap[header])
      .filter(Boolean),
  );
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const missingFields = skillPlanningExportHeaders.filter((header) => {
    const key = skillPlanningFieldMap[header];
    return !presentKeys.has(key);
  });

  if (missingFields.length > 0) {
    return { created: 0, missingFields };
  }

  const imported = rows
    .map(rowToSkillPlanningPayload)
    .filter((payload) => payload.name && payload.deptName && payload.owner);

  const createdItems = imported.map((payload) => ({
    id: `plan-${idSeed++}`,
    ...normalizeSkillPlanningPayload(payload),
  }));

  skillPlanningItems = [...createdItems, ...skillPlanningItems];
  return { created: createdItems.length, missingFields: [] };
}

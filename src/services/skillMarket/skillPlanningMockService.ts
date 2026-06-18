import * as XLSX from 'xlsx';
import {
  cloneSkillPlanningItem,
  normalizeProgress,
  normalizeSkillPlanningPayload,
  normalizeText,
  normalizeTextArray,
  rowToSkillPlanningPayload,
  skillPlanningExportHeaders,
  skillPlanningFieldMap,
  type SkillPlanningBatchPatch,
  type SkillPlanningFilterOptions,
  type SkillPlanningImportResult,
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
    skillName: '接口 Mock 生成 Skill',
    skillDescription: '根据接口定义自动生成 Mock 数据和联调示例，减少前后端等待时间。',
    level: '平台级',
    owner: '张三',
    department: '平台工具部',
    developer: '李明',
    planedCompleteDate: '2026-07-15',
    status: '开发中',
  },
  {
    id: 'plan-1002',
    firstScene: '质量保障',
    secondScene: '测试设计',
    activityNodeName: '测试验证',
    subActivityNodeName: '用例生成',
    skillName: '测试用例评审 Skill',
    skillDescription: '围绕需求说明和历史缺陷生成测试用例评审建议，提升测试覆盖完整度。',
    level: '部门级',
    owner: '李四',
    department: '质量工具组',
    developer: '周扬',
    planedCompleteDate: '2026-08-05',
    status: '未开始',
  },
  {
    id: 'plan-1003',
    firstScene: '运营分析',
    secondScene: '日志洞察',
    activityNodeName: '线上运营',
    subActivityNodeName: '异常定位',
    skillName: '日志分析 Skill',
    skillDescription: '汇总异常日志、调用链和发布记录，输出可执行的问题定位摘要。',
    level: '组织级',
    owner: '王五',
    department: '数据平台部',
    developer: '陈七',
    planedCompleteDate: '2026-06-30',
    status: '联调中',
  },
  {
    id: 'plan-1004',
    firstScene: '知识管理',
    secondScene: '文档沉淀',
    activityNodeName: '交付复盘',
    subActivityNodeName: '知识入库',
    skillName: '会议纪要沉淀 Skill',
    skillDescription: '从会议记录中抽取决策、风险、待办和关联文档，自动整理到团队知识库。',
    level: '部门级',
    owner: '赵六',
    department: '研发效能部',
    developer: '刘岚',
    planedCompleteDate: '2026-07-28',
    status: '开发中',
  },
  {
    id: 'plan-1005',
    firstScene: '发布运维',
    secondScene: '变更管控',
    activityNodeName: '版本发布',
    subActivityNodeName: '发布检查',
    skillName: '发布风险检查 Skill',
    skillDescription: '结合发布单、代码变更和历史事故，生成发布前风险检查清单。',
    level: '平台级',
    owner: '钱慧',
    department: '云平台部',
    developer: '吴越',
    planedCompleteDate: '2026-06-20',
    status: '已延期',
  },
  {
    id: 'plan-1006',
    firstScene: '用户支持',
    secondScene: '问答助手',
    activityNodeName: '服务支持',
    subActivityNodeName: '问题分流',
    skillName: '工单智能分派 Skill',
    skillDescription: '按问题类型、系统模块和处理经验自动推荐承接团队与处理路径。',
    level: '组织级',
    owner: '孙宇',
    department: '客户成功部',
    developer: '高宁',
    planedCompleteDate: '2026-09-10',
    status: '未开始',
  },
  {
    id: 'plan-1007',
    firstScene: '研发提效',
    secondScene: '代码审查',
    activityNodeName: '需求研发',
    subActivityNodeName: '合并评审',
    skillName: '代码评审摘要 Skill',
    skillDescription: '生成代码改动摘要、风险点和建议关注文件，辅助 reviewer 快速进入上下文。',
    level: '个人级',
    owner: '何佳',
    department: '平台工具部',
    developer: '许安',
    planedCompleteDate: '2026-08-18',
    status: '开发中',
  },
  {
    id: 'plan-1008',
    firstScene: '质量保障',
    secondScene: '缺陷复盘',
    activityNodeName: '问题闭环',
    subActivityNodeName: '根因分析',
    skillName: '缺陷根因归纳 Skill',
    skillDescription: '对缺陷描述、提交记录和修复方案进行归纳，输出可复用的质量改进建议。',
    level: '部门级',
    owner: '郑欣',
    department: '质量工具组',
    developer: '马可',
    planedCompleteDate: '2026-07-08',
    status: '已完成',
  },
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

function matchesDiscreteFilter(value: string, singleValue: string, multiValues: string[]): boolean {
  if (singleValue && value !== singleValue) {
    return false;
  }

  if (multiValues.length > 0 && !multiValues.includes(value)) {
    return false;
  }

  return true;
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

function filterItems(query: SkillPlanningQuery): SkillPlanningItem[] {
  const keyword = normalizeText(query.keyword).toLowerCase();
  const primaryScenes = normalizeTextArray(query.primaryScenes);
  const secondaryScenes = normalizeTextArray(query.secondaryScenes);
  const activities = normalizeTextArray(query.activities);
  const subActivities = normalizeTextArray(query.subActivities);
  const levels = normalizeTextArray(query.levels);
  const progresses = normalizeTextArray(query.progresses);
  const department =
    normalizeText(query.department) ||
    [
      query.DepartmentL6,
      query.DepartmentL5,
      query.DepartmentL4,
      query.DepartmentL3,
      query.DepartmentL2,
      query.DepartmentL1,
    ]
      .map(normalizeText)
      .find(Boolean) ||
    '';
  const firstScene = normalizeText(query.firstScene);
  const secondScene = normalizeText(query.secondScene);
  const activityNodeName = normalizeText(query.activityNodeName);
  const subActivityNodeName = normalizeText(query.subActivityNodeName);
  const level = normalizeText(query.level);
  const status = normalizeText(query.status);
  const owner = normalizeText(query.owner);

  return skillPlanningItems.filter((item) => {
    if (department && item.department !== department) return false;
    if (!matchesDiscreteFilter(item.firstScene, firstScene, primaryScenes)) return false;
    if (!matchesDiscreteFilter(item.secondScene, secondScene, secondaryScenes)) return false;
    if (!matchesDiscreteFilter(item.activityNodeName, activityNodeName, activities)) return false;
    if (!matchesDiscreteFilter(item.subActivityNodeName, subActivityNodeName, subActivities))
      return false;
    if (!matchesDiscreteFilter(item.level, level, levels)) return false;
    if (!matchesDiscreteFilter(item.status, status, progresses)) return false;
    if (owner && !item.owner.includes(owner)) return false;
    if (!matchesDateRange(item, query)) return false;
    if (!keyword) return true;

    return [item.skillName, item.skillDescription, item.developer]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
}

export async function getPlanningOption(): Promise<SkillPlanningFilterOptions> {
  return {
    firstScene: distinctValuesInOrder(skillPlanningItems.map((item) => item.firstScene)),
    secondScene: distinctValuesInOrder(skillPlanningItems.map((item) => item.secondScene)),
    activityNodeName: distinctValuesInOrder(
      skillPlanningItems.map((item) => item.activityNodeName),
    ),
    subActivityNodeName: distinctValuesInOrder(
      skillPlanningItems.map((item) => item.subActivityNodeName),
    ),
    level: distinctValuesInOrder(skillPlanningItems.map((item) => item.level)),
    status: distinctValuesInOrder(skillPlanningItems.map((item) => item.status)),
  };
}

export async function guerySkillConfig(
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

export async function queryAllSkillPlanningList(
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningItem[]> {
  return sortItems(filterItems(query), query).map(cloneSkillPlanningItem);
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

export async function deleteSkillPlanning(id: string): Promise<void> {
  skillPlanningItems = skillPlanningItems.filter((item) => item.id !== id);
}

export async function batchDeleteSkillPlanning(ids: string[]): Promise<number> {
  const idSet = new Set(ids);
  const before = skillPlanningItems.length;
  skillPlanningItems = skillPlanningItems.filter((item) => !idSet.has(item.id));
  return before - skillPlanningItems.length;
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
    .filter((payload) => payload.skillName && payload.department && payload.owner);

  const createdItems = imported.map((payload) => ({
    id: `plan-${idSeed++}`,
    ...normalizeSkillPlanningPayload(payload),
  }));

  skillPlanningItems = [...createdItems, ...skillPlanningItems];
  return { created: createdItems.length, missingFields: [] };
}

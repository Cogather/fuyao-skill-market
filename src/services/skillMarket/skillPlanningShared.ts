import * as XLSX from 'xlsx';

export type SkillPlanningProgress = '未开始' | '开发中' | '联调中' | '已完成' | '已延期';
export type SkillPlanningSortField = 'planedCompleteDate';
export type SkillPlanningSortOrder = 'asc' | 'desc';

export interface SkillPlanningItem {
  id: string;
  firstScene: string;
  secondScene: string;
  activityNodeName: string;
  subActivityNodeName: string;
  skillName: string;
  skillDescription: string;
  level: string;
  owner: string;
  department: string;
  developer: string;
  planedCompleteDate: string;
  status: SkillPlanningProgress;
}

export interface SkillPlanningQuery {
  department?: string;
  DepartmentL1?: string;
  DepartmentL2?: string;
  DepartmentL3?: string;
  DepartmentL4?: string;
  DepartmentL5?: string;
  DepartmentL6?: string;
  firstScene?: string;
  primaryScenes?: string[];
  secondScene?: string;
  secondaryScenes?: string[];
  activityNodeName?: string;
  activities?: string[];
  subActivityNodeName?: string;
  subActivities?: string[];
  level?: string;
  levels?: string[];
  status?: string;
  progresses?: string[];
  owner?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  keyword?: string;
  sortBy?: SkillPlanningSortField;
  sortOrder?: SkillPlanningSortOrder;
  pageNum?: number;
  pageSize?: number;
}

export interface SkillPlanningListResult {
  list: SkillPlanningItem[];
  total: number;
}

export interface SkillPlanningFilterOptions {
  firstScene: string[];
  secondScene: string[];
  activityNodeName: string[];
  subActivityNodeName: string[];
  level: string[];
  status: string[];
}

export interface SkillPlanningImportResult {
  created: number;
  missingFields: string[];
}

export type SkillPlanningPayload = Omit<SkillPlanningItem, 'id'>;
export type SkillPlanningBatchPatch = Partial<
  Pick<SkillPlanningItem, 'department' | 'status' | 'planedCompleteDate' | 'developer'>
>;

export const skillPlanningFieldMap: Record<string, keyof SkillPlanningPayload> = {
  一级场景: 'firstScene',
  二级场景: 'secondScene',
  归属活动: 'activityNodeName',
  归属子活动: 'subActivityNodeName',
  'Skill 名称': 'skillName',
  Skill名称: 'skillName',
  SKILL名称: 'skillName',
  'Skill 说明': 'skillDescription',
  Skill说明: 'skillDescription',
  SKILL说明: 'skillDescription',
  层级: 'level',
  '责任 Owner': 'owner',
  责任Owner: 'owner',
  '责任 Owener': 'owner',
  责任Owener: 'owner',
  归属部门: 'department',
  开发责任人: 'developer',
  计划完成时间: 'planedCompleteDate',
  当前进展: 'status',
};

export const skillPlanningExportHeaders: Array<keyof typeof skillPlanningFieldMap> = [
  '一级场景',
  '二级场景',
  '归属活动',
  '归属子活动',
  'Skill 名称',
  'Skill 说明',
  '层级',
  '责任 Owner',
  '归属部门',
  '开发责任人',
  '计划完成时间',
  '当前进展',
];

const defaultProgress: SkillPlanningProgress = '未开始';

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeProgress(value: unknown): SkillPlanningProgress {
  const text = normalizeText(value);
  if (['未开始', '开发中', '联调中', '已完成', '已延期'].includes(text)) {
    return text as SkillPlanningProgress;
  }
  return defaultProgress;
}

export function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
}

export function createEmptySkillPlanningPayload(): SkillPlanningPayload {
  return {
    firstScene: '',
    secondScene: '',
    activityNodeName: '',
    subActivityNodeName: '',
    skillName: '',
    skillDescription: '',
    level: '',
    owner: '',
    department: '',
    developer: '',
    planedCompleteDate: '',
    status: defaultProgress,
  };
}

export function normalizeSkillPlanningPayload(
  payload: Partial<SkillPlanningPayload>,
): SkillPlanningPayload {
  return {
    firstScene: normalizeText(payload.firstScene),
    secondScene: normalizeText(payload.secondScene),
    activityNodeName: normalizeText(payload.activityNodeName),
    subActivityNodeName: normalizeText(payload.subActivityNodeName),
    skillName: normalizeText(payload.skillName),
    skillDescription: normalizeText(payload.skillDescription),
    level: normalizeText(payload.level),
    owner: normalizeText(payload.owner),
    department: normalizeText(payload.department),
    developer: normalizeText(payload.developer),
    planedCompleteDate: normalizeText(payload.planedCompleteDate),
    status: normalizeProgress(payload.status),
  };
}

export function normalizeSkillPlanningItem(value: unknown): SkillPlanningItem {
  const record =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    id: normalizeText(record.id),
    firstScene: normalizeText(record.firstScene),
    secondScene: normalizeText(record.secondScene),
    activityNodeName: normalizeText(record.activityNodeName),
    subActivityNodeName: normalizeText(record.subActivityNodeName),
    skillName: normalizeText(record.skillName),
    skillDescription: normalizeText(record.skillDescription),
    level: normalizeText(record.level),
    owner: normalizeText(record.owner),
    department: normalizeText(record.department),
    developer: normalizeText(record.developer),
    planedCompleteDate: normalizeText(record.planedCompleteDate),
    status: normalizeProgress(record.status),
  };
}

export function cloneSkillPlanningItem(item: SkillPlanningItem): SkillPlanningItem {
  return { ...item };
}

export function rowToSkillPlanningPayload(row: Record<string, unknown>): SkillPlanningPayload {
  const payload = createEmptySkillPlanningPayload();
  for (const [label, key] of Object.entries(skillPlanningFieldMap)) {
    if (row[label] !== undefined) {
      payload[key] = key === 'status' ? normalizeProgress(row[label]) : normalizeText(row[label]);
    }
  }
  return normalizeSkillPlanningPayload(payload);
}

export function itemToSkillPlanningExportRow(item: SkillPlanningItem): Record<string, string> {
  return {
    一级场景: item.firstScene,
    二级场景: item.secondScene,
    归属活动: item.activityNodeName,
    归属子活动: item.subActivityNodeName,
    'Skill 名称': item.skillName,
    'Skill 说明': item.skillDescription,
    层级: item.level,
    '责任 Owner': item.owner,
    归属部门: item.department,
    开发责任人: item.developer,
    计划完成时间: item.planedCompleteDate,
    当前进展: item.status,
  };
}

export async function exportSkillPlanningTemplateToExcel(
  filename = 'Skill规划导入模板.xlsx',
): Promise<void> {
  const sheet = XLSX.utils.aoa_to_sheet([[...skillPlanningExportHeaders]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Skill规划模板');
  XLSX.writeFile(workbook, filename);
}

export async function exportSkillPlanningToExcel(
  rows: SkillPlanningItem[],
  filename = 'Skill规划清单.xlsx',
): Promise<void> {
  const sheet = XLSX.utils.json_to_sheet(rows.map(itemToSkillPlanningExportRow), {
    header: [...skillPlanningExportHeaders],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Skill规划');
  XLSX.writeFile(workbook, filename);
}

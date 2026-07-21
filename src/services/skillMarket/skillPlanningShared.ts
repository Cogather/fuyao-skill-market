import * as XLSX from 'xlsx';

export type SkillPlanningProgress = '未开始' | '开发中' | '联调中' | '已完成' | '已延期';
export type SkillPlanningSortField = 'planedCompleteDate';
export type SkillPlanningSortOrder = 'asc' | 'desc';

export interface SkillPlanningItem {
  id: string;
  sceneId?: string;
  activityId?: string;
  firstScene: string;
  secondScene: string;
  activityNodeName: string;
  subActivityNodeName: string;
  name: string;
  description: string;
  level: string;
  offeringId: string;
  offeringName: string;
  owner: string;
  deptCode: string;
  deptName: string;
  developOwner: string;
  planedCompleteDate: string;
  status: SkillPlanningProgress;
  l5DeptCode?: string;
  l5DeptName?: string;
  l4DeptCode?: string;
  l4DeptName?: string;
  l3DeptCode?: string;
  l3DeptName?: string;
  l2DeptCode?: string;
  l2DeptName?: string;
  l1DeptCode?: string;
  l1DeptName?: string;
}

export interface SkillPlanningQuery {
  deptName?: string;
  departmentL3?: string;
  departmentL4?: string;
  departmentL5?: string;
  departmentL6?: string;
  departmentL7?: string;
  departmentL8?: string;
  firstScene?: string;
  secondScene?: string;
  activityNodeName?: string;
  subActivityNodeName?: string;
  level?: string;
  status?: string;
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

export interface SkillPlanningOptionGroup {
  value: string;
  children: string[];
}

export interface ProductPlanningOption {
  offeringId: string;
  offeringName: string;
}

export interface SkillPlanningUserOption {
  id: string;
  chName: string;
  label: string;
  deptName: string;
  raw: Record<string, unknown>;
}

export interface SkillPlanningFilterOptions {
  firstScene: string[];
  secondScene: string[];
  activityNodeName: string[];
  subActivityNodeName: string[];
  level: string[];
  status: string[];
  sceneGroups: SkillPlanningOptionGroup[];
  activityGroups: SkillPlanningOptionGroup[];
}

export interface SkillPlanningImportResult {
  created: number;
  missingFields: string[];
}

export type SkillPlanningPayload = Omit<SkillPlanningItem, 'id'>;
export type SkillPlanningBatchPatch = Partial<
  Pick<
    SkillPlanningItem,
    | 'description'
    | 'offeringName'
    | 'owner'
    | 'deptName'
    | 'developOwner'
    | 'planedCompleteDate'
    | 'status'
  >
>;
export type SkillPlanningBatchUpdatePayload = { ids: string[] } & SkillPlanningBatchPatch;

export const skillPlanningFieldMap: Record<string, keyof SkillPlanningPayload> = {
  一级场景: 'firstScene',
  二级场景: 'secondScene',
  归属活动: 'activityNodeName',
  归属子活动: 'subActivityNodeName',
  'Skill 名称': 'name',
  Skill名称: 'name',
  SKILL名称: 'name',
  'Skill 说明': 'description',
  Skill说明: 'description',
  SKILL说明: 'description',
  层级: 'level',
  产品: 'offeringName',
  '责任 Owner': 'owner',
  责任Owner: 'owner',
  '责任 Owener': 'owner',
  责任Owener: 'owner',
  归属部门: 'deptName',
  开发责任人: 'developOwner',
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
  '产品',
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
    name: '',
    description: '',
    level: '',
    offeringId: '',
    offeringName: '',
    owner: '',
    deptName: '',
    developOwner: '',
    planedCompleteDate: '',
    status: defaultProgress,
  };
}

export function normalizeSkillPlanningPayload(
  payload: Partial<SkillPlanningPayload>,
): SkillPlanningPayload {
  return {
    sceneId: normalizeText(payload.sceneId),
    activityId: normalizeText(payload.activityId),
    firstScene: normalizeText(payload.firstScene),
    secondScene: normalizeText(payload.secondScene),
    activityNodeName: normalizeText(payload.activityNodeName),
    subActivityNodeName: normalizeText(payload.subActivityNodeName),
    name: normalizeText(payload.name),
    description: normalizeText(payload.description),
    level: normalizeText(payload.level),
    offeringId: normalizeText(payload.offeringId),
    offeringName: normalizeText(payload.offeringName),
    owner: normalizeText(payload.owner),
    deptName: normalizeText(payload.deptName),
    developOwner: normalizeText(payload.developOwner),
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
    sceneId: normalizeText(record.sceneId),
    activityId: normalizeText(record.activityId),
    firstScene: normalizeText(record.firstScene),
    secondScene: normalizeText(record.secondScene),
    activityNodeName: normalizeText(record.activityNodeName),
    subActivityNodeName: normalizeText(record.subActivityNodeName),
    name: normalizeText(record.name),
    description: normalizeText(record.description),
    level: normalizeText(record.level),
    offeringId: normalizeText(record.offeringId),
    offeringName: normalizeText(record.offeringName),
    owner: normalizeText(record.owner),
    deptName: normalizeText(record.deptName),
    developOwner: normalizeText(record.developOwner),
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
    'Skill 名称': item.name,
    'Skill 说明': item.description,
    层级: item.level,
    产品: item.offeringName,
    '责任 Owner': item.owner,
    归属部门: item.deptName,
    开发责任人: item.developOwner,
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

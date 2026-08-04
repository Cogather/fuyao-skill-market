import * as XLSX from 'xlsx';

import type { CreateSkillPlanningSupplementBody } from './apiTypes';
import type {
  SkillMasterPayload,
  SkillMasterRecord,
  SkillMasterStatus,
} from './skillMasterManagementService';
import type {
  ProductPlanningOption,
  SkillPlanningBatchPatch,
  SkillPlanningImportResult,
  SkillPlanningItem,
  SkillPlanningListResult,
  SkillPlanningQuery,
} from './skillPlanningShared';

export type HarnessCapabilityType = 'skill' | 'command' | 'agent';
export type MockHarnessCapabilityType = Exclude<HarnessCapabilityType, 'skill'>;

export interface HarnessCapabilityCatalogQuery {
  keyword?: string;
  departmentName?: string;
  level?: string;
  product?: string;
}

interface CapabilityState {
  catalog: SkillMasterRecord[];
  planning: SkillPlanningItem[];
  catalogSeed: number;
  planningSeed: number;
}

const STORAGE_PREFIX = 'skill-market-harness-capability-planning-v1';
const now = '2026-08-01T08:00:00.000Z';

function master(
  id: string,
  name: string,
  description: string,
  owner: string,
  department: string,
  developOwner: string,
  plannedCompleteDate: string,
  status: SkillMasterStatus,
): SkillMasterRecord {
  return {
    id,
    name,
    description,
    level: '部门级',
    product: '',
    owner,
    department,
    developOwner,
    developOwnerDepartment: department,
    plannedCompleteDate,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function planning(
  id: string,
  capabilityId: string,
  record: SkillMasterRecord,
  taxonomy: Pick<
    SkillPlanningItem,
    'firstScene' | 'secondScene' | 'activityNodeName' | 'subActivityNodeName'
  >,
): SkillPlanningItem {
  return {
    id,
    skillId: capabilityId,
    sceneId: `${id}-scene`,
    activityId: `${id}-activity`,
    ...taxonomy,
    name: record.name,
    description: record.description,
    level: '部门级',
    offeringId: '',
    offeringName: '',
    owner: record.owner,
    deptCode: 'dept-continuous-delivery',
    deptName: record.department,
    planningDeptCode: 'dept-continuous-delivery',
    planningDeptName: '持续交付组',
    developOwner: record.developOwner,
    planedCompleteDate: record.plannedCompleteDate,
    status: record.status,
  };
}

const commandCatalog = [
  master(
    'command-master-1001',
    '发布前检查 Command',
    '汇总部署差异、变更窗口和发布门禁结果，生成可执行的发布前检查清单。',
    '李四 w30000002',
    '持续交付组',
    '周扬 w30000007',
    '2026-08-12',
    '开发中',
  ),
  master(
    'command-master-1002',
    '故障上下文采集 Command',
    '一键收集服务日志、调用链、配置变更与发布记录，减少故障定位准备时间。',
    '郑欣 w30000015',
    '持续交付组',
    '马可 w30000016',
    '2026-07-18',
    '已完成',
  ),
  master(
    'command-master-1003',
    '接口联调初始化 Command',
    '初始化联调环境并生成请求示例、鉴权配置和基础 Mock 数据。',
    '张三 w30000021',
    '联调工具部',
    '李明 w30000022',
    '2026-09-05',
    '未开始',
  ),
];

const agentCatalog = [
  master(
    'agent-master-1001',
    '测试用例评审 Agent',
    '围绕需求说明和历史缺陷主动评审测试用例，输出缺失场景与覆盖建议。',
    '李四 w30000002',
    '持续交付组',
    '周扬 w30000007',
    '2026-08-05',
    '未开始',
  ),
  master(
    'agent-master-1002',
    '缺陷根因分析 Agent',
    '串联缺陷描述、提交记录、监控告警和修复方案，形成可复用的根因分析报告。',
    '郑欣 w30000015',
    '持续交付组',
    '马可 w30000016',
    '2026-07-08',
    '已完成',
  ),
  master(
    'agent-master-1003',
    '需求澄清 Agent',
    '持续分析需求上下文，识别边界、依赖和冲突并推动待确认事项闭环。',
    '顾宁 w30000031',
    '需求分析组',
    '孟扬 w30000032',
    '2026-09-16',
    '开发中',
  ),
];

const defaultStates: Record<MockHarnessCapabilityType, CapabilityState> = {
  command: {
    catalog: commandCatalog,
    planning: [
      planning('command-plan-1001', commandCatalog[0]!.id, commandCatalog[0]!, {
        firstScene: '发布运维',
        secondScene: '变更管控',
        activityNodeName: '版本发布',
        subActivityNodeName: '发布检查',
      }),
      planning('command-plan-1002', commandCatalog[1]!.id, commandCatalog[1]!, {
        firstScene: '质量保障',
        secondScene: '缺陷复盘',
        activityNodeName: '问题闭环',
        subActivityNodeName: '根因分析',
      }),
    ],
    catalogSeed: 2000,
    planningSeed: 2000,
  },
  agent: {
    catalog: agentCatalog,
    planning: [
      planning('agent-plan-1001', agentCatalog[0]!.id, agentCatalog[0]!, {
        firstScene: '质量保障',
        secondScene: '测试设计',
        activityNodeName: '测试验证',
        subActivityNodeName: '用例生成',
      }),
      planning('agent-plan-1002', agentCatalog[1]!.id, agentCatalog[1]!, {
        firstScene: '质量保障',
        secondScene: '缺陷复盘',
        activityNodeName: '问题闭环',
        subActivityNodeName: '根因分析',
      }),
    ],
    catalogSeed: 2000,
    planningSeed: 2000,
  },
};

const memoryStates = new Map<MockHarnessCapabilityType, CapabilityState>();

function cloneRecord(record: SkillMasterRecord): SkillMasterRecord {
  return { ...record };
}

function clonePlanningItem(item: SkillPlanningItem): SkillPlanningItem {
  return { ...item };
}

function cloneState(state: CapabilityState): CapabilityState {
  return {
    catalog: state.catalog.map(cloneRecord),
    planning: state.planning.map(clonePlanningItem),
    catalogSeed: state.catalogSeed,
    planningSeed: state.planningSeed,
  };
}

function storageKey(type: MockHarnessCapabilityType): string {
  return `${STORAGE_PREFIX}-${type}`;
}

function readState(type: MockHarnessCapabilityType): CapabilityState {
  const cached = memoryStates.get(type);
  if (cached) return cached;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(storageKey(type));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CapabilityState>;
        if (Array.isArray(parsed.catalog) && Array.isArray(parsed.planning)) {
          const state: CapabilityState = {
            catalog: parsed.catalog.map(cloneRecord),
            planning: parsed.planning.map(clonePlanningItem),
            catalogSeed: Number(parsed.catalogSeed) || 2000,
            planningSeed: Number(parsed.planningSeed) || 2000,
          };
          memoryStates.set(type, state);
          return state;
        }
      }
    } catch {
      // Invalid local mock data falls back to the bundled examples.
    }
  }
  const state = cloneState(defaultStates[type]);
  memoryStates.set(type, state);
  return state;
}

function persistState(type: MockHarnessCapabilityType, state: CapabilityState): void {
  memoryStates.set(type, state);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(type), JSON.stringify(state));
  }
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function selections(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(text).filter(Boolean))];
}

function matches(value: string, expected: unknown): boolean {
  const values = selections(expected);
  return values.length === 0 || values.includes(value);
}

function hydratedPlanning(state: CapabilityState): SkillPlanningItem[] {
  const catalog = new Map(state.catalog.map((record) => [record.id, record]));
  return state.planning.map((item) => {
    const record = item.skillId ? catalog.get(item.skillId) : undefined;
    return record
      ? {
          ...item,
          name: record.name,
          description: record.description,
          owner: record.owner,
          deptName: record.department,
          developOwner: record.developOwner,
          planedCompleteDate: record.plannedCompleteDate,
          status: record.status,
        }
      : item;
  });
}

function filterPlanning(state: CapabilityState, query: SkillPlanningQuery): SkillPlanningItem[] {
  const keyword = text(query.keyword).toLocaleLowerCase();
  const planningDepartment =
    text(query.planningDeptName) ||
    [
      query.departmentL8,
      query.departmentL7,
      query.departmentL6,
      query.departmentL5,
      query.departmentL4,
      query.departmentL3,
    ]
      .map(text)
      .find(Boolean) ||
    '';

  const rows = hydratedPlanning(state).filter((item) => {
    if (planningDepartment && item.planningDeptName !== planningDepartment) return false;
    if (query.offeringName && item.offeringName !== query.offeringName) return false;
    if (!matches(item.firstScene, query.firstScene)) return false;
    if (!matches(item.secondScene, query.secondScene)) return false;
    if (!matches(item.activityNodeName, query.activityNodeName)) return false;
    if (!matches(item.subActivityNodeName, query.subActivityNodeName)) return false;
    if (!matches(item.level, query.level)) return false;
    if (!matches(item.status, query.status)) return false;
    if (!keyword) return true;
    return [item.name, item.description, item.owner, item.developOwner, item.planningDeptName]
      .join(' ')
      .toLocaleLowerCase()
      .includes(keyword);
  });

  if (query.sortBy === 'planedCompleteDate' && query.sortOrder) {
    rows.sort((left, right) => {
      const result = left.planedCompleteDate.localeCompare(right.planedCompleteDate);
      return query.sortOrder === 'asc' ? result : -result;
    });
  }
  return rows;
}

export async function queryMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery = {},
): Promise<SkillPlanningListResult> {
  const filtered = filterPlanning(readState(type), query);
  const pageNum = Math.max(1, Number(query.pageNum ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const start = (pageNum - 1) * pageSize;
  return {
    list: filtered.slice(start, start + pageSize).map(clonePlanningItem),
    total: filtered.length,
  };
}

function planningDepartmentFromBody(body: CreateSkillPlanningSupplementBody): string {
  return body.dimType === '部门级' ? text(body.dimName) : '持续交付组';
}

function planningItemFromBody(
  type: MockHarnessCapabilityType,
  state: CapabilityState,
  body: CreateSkillPlanningSupplementBody,
  id: string,
  previous?: SkillPlanningItem,
): SkillPlanningItem {
  const record = state.catalog.find((item) => item.name === text(body.skillName));
  if (!record) {
    throw new Error(`请先在 ${type === 'command' ? 'Command' : 'Agent'} 清单中维护该能力`);
  }
  const isProduct = body.dimType === '产品级';
  return {
    id,
    skillId: record.id,
    sceneId: previous?.sceneId || `${id}-scene`,
    activityId: previous?.activityId || `${id}-activity`,
    firstScene: text(body.firstScene),
    secondScene: text(body.secondScene),
    activityNodeName: text(body.activityNodeName),
    subActivityNodeName: text(body.subActivityNodeName),
    name: record.name,
    description: record.description,
    level: isProduct ? '产品级' : '部门级',
    offeringId: isProduct ? text(body.dimCode) : '',
    offeringName: isProduct ? text(body.dimName) : '',
    owner: record.owner,
    deptCode: previous?.deptCode || '',
    deptName: record.department,
    planningDeptCode: previous?.planningDeptCode || (isProduct ? '' : text(body.dimCode)),
    planningDeptName: previous?.planningDeptName || planningDepartmentFromBody(body),
    developOwner: record.developOwner,
    planedCompleteDate: record.plannedCompleteDate,
    status: record.status,
  };
}

export async function createMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  body: CreateSkillPlanningSupplementBody,
): Promise<unknown> {
  const state = readState(type);
  const item = planningItemFromBody(type, state, body, `${type}-plan-${state.planningSeed++}`);
  state.planning.unshift(item);
  persistState(type, state);
  return { meta: { success: true, message: '新增成功' }, data: clonePlanningItem(item) };
}

export async function updateMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  body: CreateSkillPlanningSupplementBody & { id: string },
): Promise<unknown> {
  const state = readState(type);
  const index = state.planning.findIndex((item) => item.id === body.id);
  if (index < 0) throw new Error('未找到要编辑的规划');
  const item = planningItemFromBody(type, state, body, body.id, state.planning[index]);
  state.planning.splice(index, 1, item);
  persistState(type, state);
  return { meta: { success: true, message: '更新成功' }, data: clonePlanningItem(item) };
}

export async function batchUpdateMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  ids: string[],
  patch: SkillPlanningBatchPatch,
): Promise<number> {
  const state = readState(type);
  const idSet = new Set(ids);
  let count = 0;
  state.planning = state.planning.map((item) => {
    if (!idSet.has(item.id)) return item;
    count += 1;
    return { ...item, ...patch };
  });
  persistState(type, state);
  return count;
}

export async function deleteMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  id: string,
): Promise<void> {
  const state = readState(type);
  state.planning = state.planning.filter((item) => item.id !== id);
  persistState(type, state);
}

export async function batchDeleteMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  ids: string[],
): Promise<number> {
  const state = readState(type);
  const idSet = new Set(ids);
  const before = state.planning.length;
  state.planning = state.planning.filter((item) => !idSet.has(item.id));
  persistState(type, state);
  return before - state.planning.length;
}

function capabilityLabel(type: MockHarnessCapabilityType): string {
  return type === 'command' ? 'Command' : 'Agent';
}

function planningHeaders(type: MockHarnessCapabilityType): string[] {
  return [
    '一级场景',
    '二级场景',
    '归属活动',
    '归属子活动',
    `${capabilityLabel(type)} 名称`,
    `${capabilityLabel(type)} 说明`,
    '层级',
    '产品',
    '责任 Owner',
    '归属部门',
    '规划部门',
    '开发责任人',
    '计划完成时间',
    '当前进展',
  ];
}

function planningRow(item: SkillPlanningItem): unknown[] {
  return [
    item.firstScene,
    item.secondScene,
    item.activityNodeName,
    item.subActivityNodeName,
    item.name,
    item.description,
    item.level,
    item.offeringName,
    item.owner,
    item.deptName,
    item.planningDeptName,
    item.developOwner,
    item.planedCompleteDate,
    item.status,
  ];
}

export async function exportMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  query: SkillPlanningQuery,
): Promise<null> {
  const rows = filterPlanning(readState(type), query);
  const sheet = XLSX.utils.aoa_to_sheet([
    planningHeaders(type),
    ...rows.map((item) => planningRow(item)),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, `${capabilityLabel(type)}规划`);
  XLSX.writeFile(workbook, `${capabilityLabel(type)}规划清单.xlsx`);
  return null;
}

export async function downloadMockCapabilityPlanningTemplate(
  type: MockHarnessCapabilityType,
): Promise<void> {
  const sheet = XLSX.utils.aoa_to_sheet([planningHeaders(type)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '导入模板');
  XLSX.writeFile(workbook, `${capabilityLabel(type)}规划导入模板.xlsx`);
}

function cell(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return '';
}

export async function importMockCapabilityPlanning(
  type: MockHarnessCapabilityType,
  file: File,
): Promise<SkillPlanningImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  const source = sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    : [];
  const state = readState(type);
  const label = capabilityLabel(type);
  const errors: SkillPlanningImportResult['errorList'] = [];
  const created: SkillPlanningItem[] = [];

  source.forEach((record, index) => {
    const name = cell(record, [`${label} 名称`, `${label}名称`, '名称']);
    const catalog = state.catalog.find((item) => item.name === name);
    const required = {
      name,
      firstScene: cell(record, ['一级场景']),
      secondScene: cell(record, ['二级场景']),
      activityNodeName: cell(record, ['归属活动']),
      subActivityNodeName: cell(record, ['归属子活动']),
      planningDeptName: cell(record, ['规划部门']),
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0 || !catalog) {
      errors.push({
        rowNum: index + 2,
        errMsg: !catalog ? `${label} 不在原子清单中` : `缺少必填字段：${missing.join('、')}`,
      });
      return;
    }
    const id = `${type}-plan-${state.planningSeed++}`;
    created.push({
      id,
      skillId: catalog.id,
      sceneId: `${id}-scene`,
      activityId: `${id}-activity`,
      firstScene: required.firstScene,
      secondScene: required.secondScene,
      activityNodeName: required.activityNodeName,
      subActivityNodeName: required.subActivityNodeName,
      name: catalog.name,
      description: catalog.description,
      level: cell(record, ['层级']) || '部门级',
      offeringId: '',
      offeringName: cell(record, ['产品']),
      owner: catalog.owner,
      deptCode: '',
      deptName: catalog.department,
      planningDeptName: required.planningDeptName,
      developOwner: catalog.developOwner,
      planedCompleteDate: catalog.plannedCompleteDate,
      status: catalog.status,
    });
  });

  state.planning.unshift(...created);
  persistState(type, state);
  return {
    created: created.length,
    missingFields: [],
    totalCount: source.length,
    successCount: created.length,
    failCount: errors.length,
    errorList: errors,
  };
}

export async function queryMockCapabilityCatalog(
  type: MockHarnessCapabilityType,
  query: HarnessCapabilityCatalogQuery = {},
): Promise<SkillMasterRecord[]> {
  const keyword = text(query.keyword).toLocaleLowerCase();
  const departmentName = text(query.departmentName);
  const level = text(query.level);
  const product = text(query.product);
  return readState(type)
    .catalog.filter((record) => {
      if (departmentName && record.department !== departmentName) return false;
      if (level && record.level && record.level !== level) return false;
      if (product && record.product && record.product !== product) return false;
      if (!keyword) return true;
      return [record.name, record.description, record.owner, record.developOwner]
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword);
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(cloneRecord);
}

function normalizeCatalogPayload(payload: SkillMasterPayload): SkillMasterPayload {
  return {
    name: text(payload.name),
    description: text(payload.description),
    level: text(payload.level) || '部门级',
    product: text(payload.product),
    owner: text(payload.owner),
    department: text(payload.department),
    developOwner: text(payload.developOwner),
    developOwnerDepartment: text(payload.developOwnerDepartment) || text(payload.department),
    plannedCompleteDate: text(payload.plannedCompleteDate),
    status: payload.status || '未开始',
  };
}

function validateCatalogPayload(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
): void {
  const label = capabilityLabel(type);
  if (!payload.name) throw new Error(`请输入 ${label} 名称`);
  if (!payload.description) throw new Error(`请输入 ${label} 说明`);
  if (!payload.owner) throw new Error('请输入责任 Owner');
  if (!payload.developOwner) throw new Error('请输入开发责任人');
}

export async function createMockCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  payload: SkillMasterPayload,
): Promise<SkillMasterRecord> {
  const state = readState(type);
  const normalized = normalizeCatalogPayload(payload);
  validateCatalogPayload(type, normalized);
  const timestamp = new Date().toISOString();
  const record: SkillMasterRecord = {
    id: `${type}-master-${state.catalogSeed++}`,
    ...normalized,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.catalog.unshift(record);
  persistState(type, state);
  return cloneRecord(record);
}

export async function updateMockCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  id: string,
  payload: SkillMasterPayload,
): Promise<SkillMasterRecord> {
  const state = readState(type);
  const index = state.catalog.findIndex((record) => record.id === id);
  if (index < 0) throw new Error(`未找到该 ${capabilityLabel(type)}`);
  const normalized = normalizeCatalogPayload(payload);
  validateCatalogPayload(type, normalized);
  const record = {
    ...state.catalog[index]!,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  state.catalog.splice(index, 1, record);
  persistState(type, state);
  return cloneRecord(record);
}

export async function deleteMockCapabilityCatalogRecord(
  type: MockHarnessCapabilityType,
  id: string,
): Promise<void> {
  const state = readState(type);
  state.catalog = state.catalog.filter((record) => record.id !== id);
  persistState(type, state);
}

export async function batchDeleteMockCapabilityCatalogRecords(
  type: MockHarnessCapabilityType,
  ids: string[],
): Promise<number> {
  const state = readState(type);
  const idSet = new Set(ids);
  const before = state.catalog.length;
  state.catalog = state.catalog.filter((record) => !idSet.has(record.id));
  persistState(type, state);
  return before - state.catalog.length;
}

export async function exportMockCapabilityCatalog(
  type: MockHarnessCapabilityType,
  records: SkillMasterRecord[],
): Promise<void> {
  const label = capabilityLabel(type);
  const sheet = XLSX.utils.json_to_sheet(
    records.map((record) => ({
      [`${label} 名称`]: record.name,
      [`${label} 说明`]: record.description,
      '责任 Owner': record.owner,
      归属部门: record.department,
      开发责任人: record.developOwner,
      计划完成时间: record.plannedCompleteDate,
      当前进展: record.status,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, `${label}清单`);
  XLSX.writeFile(workbook, `${label}原子清单.xlsx`);
}

export async function importMockCapabilityCatalog(
  type: MockHarnessCapabilityType,
  file: File,
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  const source = sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    : [];
  const label = capabilityLabel(type);
  const errors: string[] = [];
  let successCount = 0;
  for (const [index, row] of source.entries()) {
    try {
      await createMockCapabilityCatalogRecord(type, {
        name: cell(row, [`${label} 名称`, `${label}名称`, '名称']),
        description: cell(row, [`${label} 说明`, `${label}说明`, '说明', '描述']),
        level: cell(row, ['层级']) || '部门级',
        product: cell(row, ['产品']),
        owner: cell(row, ['责任 Owner', '责任Owner']),
        department: cell(row, ['归属部门']),
        developOwner: cell(row, ['开发责任人']),
        developOwnerDepartment: cell(row, ['归属部门']),
        plannedCompleteDate: cell(row, ['计划完成时间', '计划完成']),
        status: (cell(row, ['当前进展']) || '未开始') as SkillMasterStatus,
      });
      successCount += 1;
    } catch (error) {
      errors.push(`第 ${index + 2} 行：${error instanceof Error ? error.message : '导入失败'}`);
    }
  }
  return { successCount, failCount: errors.length, errors };
}

export async function getMockCapabilityProducts(
  type: MockHarnessCapabilityType,
  planningDeptName: string,
): Promise<ProductPlanningOption[]> {
  const products = readState(type)
    .catalog.filter((record) => record.level === '产品级' && record.product)
    .map((record) => ({
      offeringId: record.product,
      offeringName: record.product,
      planningDeptName,
    }));
  return [...new Map(products.map((item) => [item.offeringName, item])).values()];
}

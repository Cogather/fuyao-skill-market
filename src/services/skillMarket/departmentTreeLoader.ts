import { skillBaseService } from './skillBaseService';
import {
  coerceDepartmentTreeFromUnknown,
  mapDepartmentTreeDtoToForest,
} from './marketDeptTreeFromApi';

type UnknownRecord = Record<string, unknown>;

const TREE_CONTAINER_KEYS = [
  'data',
  'result',
  'list',
  'records',
  'rows',
  'content',
  'tree',
  'deptTree',
  'departmentTree',
  'departments',
  'departmentList',
] as const;

let inFlightRequest: Promise<unknown[]> | null = null;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export function extractDepartmentTreeList(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;

  const queue: unknown[] = [response];
  const visited = new Set<object>();
  let emptyList: unknown[] = [];
  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      if (value.length > 0) return value;
      emptyList = value;
      continue;
    }
    const record = asRecord(value);
    if (!record || visited.has(record)) continue;
    visited.add(record);
    TREE_CONTAINER_KEYS.forEach((key) => {
      if (record[key] !== undefined) queue.push(record[key]);
    });
  }
  return emptyList;
}

export function isUsableDepartmentTree(value: unknown): boolean {
  const source = Array.isArray(value) ? value : extractDepartmentTreeList(value);
  if (source.length === 0) return false;
  const forest = mapDepartmentTreeDtoToForest(coerceDepartmentTreeFromUnknown(source));
  const hasNamedNode = (nodes: typeof forest): boolean =>
    nodes.some((node) => Boolean(node.name.trim()) || hasNamedNode(node.children));
  return hasNamedNode(forest);
}

function responseSucceeded(response: unknown): boolean {
  const record = asRecord(response);
  const meta = asRecord(record?.meta);
  if (meta?.success === false) return false;
  const code = record?.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

async function requestDepartmentTree(): Promise<unknown[]> {
  const response = await skillBaseService.queryDeptReviewDepartments({
    _departmentTreeNonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!responseSucceeded(response)) throw new Error('真实部门树接口返回失败');

  const list = extractDepartmentTreeList(response);
  if (!isUsableDepartmentTree(list)) throw new Error('真实部门树为空或返回结构无法识别');
  return list;
}

/** 合并多个页面同时发起的请求，HTTP 模式统一只获取真实部门树。 */
export function fetchFreshDepartmentTree(): Promise<unknown[]> {
  if (inFlightRequest) return inFlightRequest;
  inFlightRequest = requestDepartmentTree().finally(() => {
    inFlightRequest = null;
  });
  return inFlightRequest;
}

import type { DepartmentTreeNodeDto } from './apiTypes';

/** 与 `UserMarketShell` 内原 `MarketDeptNode` 一致，供接口树映射 */
export type MarketDeptForestNode = {
  name: string;
  path: string;
  levelNo: number;
  children: MarketDeptForestNode[];
};

/**
 * 将后端 / Mock 返回的 `DepartmentTreeNodeDto` 转为市场级联使用的森林（各级名称有序）。
 */
/**
 * 将父页面 postMessage 等来源的未知结构尽量规整为 `DepartmentTreeNodeDto`，便于与市场级联共用映射逻辑。
 */
export function coerceDepartmentTreeFromUnknown(nodes: unknown): DepartmentTreeNodeDto[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }
  const out: DepartmentTreeNodeDto[] = [];
  for (const item of nodes) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    const namePart = o.deptName ?? o.name ?? o.label ?? o.departmentName ?? o.title;
    const deptName = typeof namePart === 'string' ? namePart.trim() : String(namePart ?? '').trim();
    const deptLevel =
      typeof o.deptLevel === 'number' && Number.isFinite(o.deptLevel) ? o.deptLevel : 0;
    const childRaw = o.children;
    const children =
      Array.isArray(childRaw) && childRaw.length > 0 ? coerceDepartmentTreeFromUnknown(childRaw) : [];
    out.push({
      deptName,
      deptLevel,
      ...(children.length > 0 ? { children, } : {}),
    });
  }
  return out;
}

export function mapDepartmentTreeDtoToForest(nodes: DepartmentTreeNodeDto[] | undefined): MarketDeptForestNode[] {
  if (!nodes?.length) {
    return [];
  }
  const mapped = nodes.map((n) => mapOneDepartmentTreeNode(n, ''));
  return mapped.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function mapOneDepartmentTreeNode(n: DepartmentTreeNodeDto, parentPath: string): MarketDeptForestNode {
  const path = parentPath ? `${parentPath}/${n.deptName}` : n.deptName;
  const levelNo =
    n.deptLevel > 0 ? n.deptLevel : (parentPath ? parentPath.split('/').filter(Boolean).length + 1 : 1);
  const rawChildren = n.children ?? [];
  const children = rawChildren
    .map((c) => mapOneDepartmentTreeNode(c, path))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return {
    name: n.deptName,
    path,
    levelNo,
    children,
  };
}

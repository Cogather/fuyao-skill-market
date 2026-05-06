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

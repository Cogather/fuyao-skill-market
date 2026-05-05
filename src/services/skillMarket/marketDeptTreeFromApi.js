/**
 * 将后端 / Mock 返回的 `DepartmentTreeNodeDto` 转为市场级联使用的森林（各级名称有序）。
 */
export function mapDepartmentTreeDtoToForest(nodes) {
    if (!nodes?.length) {
        return [];
    }
    const mapped = nodes.map((n) => mapOneDepartmentTreeNode(n, ''));
    return mapped.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}
function mapOneDepartmentTreeNode(n, parentPath) {
    const path = parentPath ? `${parentPath}/${n.deptName}` : n.deptName;
    const levelNo = n.deptLevel > 0 ? n.deptLevel : (parentPath ? parentPath.split('/').filter(Boolean).length + 1 : 1);
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

import type { DepartmentTreeNodeDto } from './apiTypes';

/** 与 `UserMarketShell` 内原 `MarketDeptNode` 一致，供接口树映射 */
export type MarketDeptForestNode = {
  id?: string;
  deptCode?: string;
  name: string;
  path: string;
  levelNo: number;
  children: MarketDeptForestNode[];
};

type DepartmentCodeNode = {
  id?: string | number | null;
  deptCode?: string | number | null;
};

function normalizeDepartmentCode(value: unknown): string {
  const code = String(value ?? '').trim();
  return code && code !== 'undefined' && code !== 'null' ? code : '';
}

export function getDepartmentNodeCode(node: DepartmentCodeNode | null | undefined): string {
  return normalizeDepartmentCode(node?.deptCode) || normalizeDepartmentCode(node?.id);
}

/**
 * 将后端 / Mock 返回的 `DepartmentTreeNodeDto` 转为市场级联使用的森林（各级名称有序）。
 */
/**
 * 将接口返回的部门树结构规整为 `DepartmentTreeNodeDto`，便于与市场级联共用映射逻辑。
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
    const deptLevelValue = o.deptLevel ?? o.levelNo;
    const parsedDeptLevel = Number(deptLevelValue);
    const deptLevel = Number.isFinite(parsedDeptLevel) && parsedDeptLevel > 0 ? parsedDeptLevel : 0;
    const deptCodePart =
      o.deptCode ??
      o.departmentCode ??
      o.dept_code ??
      o.department_code ??
      o.orgCode ??
      o.organizationCode ??
      o.code;
    const deptCode =
      typeof deptCodePart === 'string' || typeof deptCodePart === 'number'
        ? String(deptCodePart).trim()
        : '';
    const deptIdPart = o.deptId ?? o.departmentId ?? o.id ?? o.value ?? deptCodePart;
    const deptId =
      typeof deptIdPart === 'string' || typeof deptIdPart === 'number'
        ? String(deptIdPart).trim()
        : '';
    const childRaw =
      o.children ??
      o.childrenList ??
      o.childList ??
      o.childDepartments ??
      o.childDepartmentList ??
      o.childDeptList ??
      o.subDepartments;
    const children =
      Array.isArray(childRaw) && childRaw.length > 0
        ? coerceDepartmentTreeFromUnknown(childRaw)
        : [];
    out.push({
      ...(deptId ? { deptId } : {}),
      ...(deptCode ? { deptCode } : {}),
      deptName,
      deptLevel,
      ...(children.length > 0 ? { children } : {}),
    });
  }
  return out;
}

export function mapDepartmentTreeDtoToForest(
  nodes: DepartmentTreeNodeDto[] | undefined,
): MarketDeptForestNode[] {
  if (!nodes?.length) {
    return [];
  }
  return nodes.map((n) => mapOneDepartmentTreeNode(n, ''));
}

function mapOneDepartmentTreeNode(
  n: DepartmentTreeNodeDto,
  parentPath: string,
): MarketDeptForestNode {
  const path = parentPath ? `${parentPath}/${n.deptName}` : n.deptName;
  const levelNo =
    n.deptLevel > 0
      ? n.deptLevel
      : parentPath
        ? parentPath.split('/').filter(Boolean).length + 1
        : 1;
  const rawChildren = n.children ?? [];
  const children = rawChildren.map((c) => mapOneDepartmentTreeNode(c, path));
  return {
    ...(n.deptId !== undefined && String(n.deptId).trim() ? { id: String(n.deptId).trim() } : {}),
    ...(n.deptCode !== undefined && String(n.deptCode).trim()
      ? { deptCode: String(n.deptCode).trim() }
      : {}),
    name: n.deptName,
    path,
    levelNo,
    children,
  };
}

function firstDepartmentField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(record[key] ?? '').trim();
    if (value && value !== 'undefined' && value !== 'null') {
      return value;
    }
  }
  return '';
}

/**
 * 将用户信息接口返回的扁平部门层级转换为部门树。
 * HTTP 数据使用 hwDepartNameN / hwDepartCodeN，Mock 与部分旧接口使用 department_lN。
 */
export function buildDeptTreeFromUserInfo(
  deptInfo: Record<string, unknown> | null | undefined,
): DepartmentTreeNodeDto[] {
  if (!deptInfo || typeof deptInfo !== 'object') {
    return [];
  }

  const record = deptInfo as Record<string, unknown>;
  const levels: { name: string; code: string }[] = [];
  // 真实接口的业务组织通常从 L3 开始；仅有低层级字段或旧格式时从 L1 兼容读取。
  const hasBusinessDepartmentLevel = Array.from({ length: 6 }, (_, index) => index + 3).some(
    (level) =>
      firstDepartmentField(record, [`hwDepartName${level}`, `hwDepartNames${level}`]) !== '',
  );
  const firstLevel = hasBusinessDepartmentLevel ? 3 : 1;

  for (let i = firstLevel; i <= 8; i += 1) {
    const name = firstDepartmentField(record, [
      `hwDepartName${i}`,
      `hwDepartNames${i}`,
      `department_l${i}`,
      `departmentL${i}`,
      `dept_l${i}`,
      `deptL${i}`,
    ]);
    const code = firstDepartmentField(record, [
      `hwDepartCode${i}`,
      `department_code_l${i}`,
      `departmentCodeL${i}`,
      `deptCode${i}`,
    ]);
    if (name) {
      levels.push({ name, code });
    }
  }

  if (levels.length === 0) {
    return [];
  }

  // 从低层级到高层级逐级嵌套构建树
  let tree: DepartmentTreeNodeDto | null = null;
  for (const [index, level] of levels.entries()) {
    const node: DepartmentTreeNodeDto = {
      ...(level.code ? { deptCode: level.code, deptId: level.code } : {}),
      deptName: level.name,
      deptLevel: index + 1,
    };
    if (tree) {
      // 将当前节点作为上一级的子节点
      const deepest = findDeepestNode(tree);
      deepest.children = [node];
    } else {
      tree = node;
    }
  }

  return tree ? [tree] : [];
}

function findDeepestNode(node: DepartmentTreeNodeDto): DepartmentTreeNodeDto {
  if (node.children && node.children.length > 0) {
    return findDeepestNode(node.children[0]!);
  }
  return node;
}

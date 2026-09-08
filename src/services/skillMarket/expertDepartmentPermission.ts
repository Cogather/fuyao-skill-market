export type ExpertDepartmentPermission = {
  minimumDepartmentId: string;
  path: string[];
};

type DepartmentLevel = {
  id: string;
  level: number;
  name: string;
  order: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim();
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = asText(record[key]);
    if (text) {
      return text;
    }
  }
  return '';
}

function readDepartmentLevel(value: unknown, order: number): DepartmentLevel | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const name = asText(value);
    return name ? { id: '', level: order, name, order } : null;
  }

  const record = asRecord(value);
  const name = firstText(record, ['departmentName', 'deptName', 'name', 'label', 'title']);
  if (!name) {
    return null;
  }

  const levelText = firstText(record, ['departmentLevel', 'deptLevel', 'levelNo', 'level']);
  const level = Number(levelText);
  return {
    id: firstText(record, [
      'departmentId',
      'deptId',
      'id',
      'departmentCode',
      'deptCode',
      'code',
      'value',
    ]),
    level: Number.isFinite(level) && level > 0 ? level : order,
    name,
    order,
  };
}

function permissionFromLevels(levels: DepartmentLevel[]): ExpertDepartmentPermission | null {
  const normalized = levels
    .filter((level) => level.name)
    .sort((left, right) => left.level - right.level || left.order - right.order);
  if (normalized.length === 0) {
    return null;
  }
  const minimumDepartment = normalized.at(-1);
  if (!minimumDepartment) {
    return null;
  }
  return {
    minimumDepartmentId: minimumDepartment.id,
    path: normalized.map((level) => level.name),
  };
}

function permissionFromArray(record: Record<string, unknown>): ExpertDepartmentPermission | null {
  const key = 'dept';
  const levels = [];
  for (let i = 1; i <= 8; i += 1) {
    const source = record[`${key}${i.toString()}`];
    const level = readDepartmentLevel(source, i);
    if (level !== null) {
      levels.push(level);
    }
  }
  const permission = permissionFromLevels(levels);
  return permission;
}

function permissionFromFlatLevels(
  record: Record<string, unknown>,
): ExpertDepartmentPermission | null {
  const levels: DepartmentLevel[] = [];
  for (let level = 1; level <= 8; level += 1) {
    const value =
      record[`hwDepartName${level}`] ??
      record[`departmentL${level}`] ??
      record[`department_l${level}`] ??
      record[`dept${level}`] ??
      record[`deptL${level}`] ??
      record[`dept_l${level}`] ??
      record[`departmentLevel${level}`];
    const department = readDepartmentLevel(value, level);
    if (!department) {
      continue;
    }
    const siblingId = firstText(record, [
      `hwDepartCode${level}`,
      `departmentL${level}Id`,
      `departmentL${level}ID`,
      `departmentL${level}Code`,
      `deptL${level}Id`,
      `deptL${level}ID`,
      `deptL${level}Code`,
    ]);
    levels.push({
      ...department,
      id: department.id || siblingId,
      level,
    });
  }
  return permissionFromLevels(levels);
}

function permissionFromPath(record: Record<string, unknown>): ExpertDepartmentPermission | null {
  const pathText = firstText(record, [
    'departmentPath',
    'deptPath',
    'departmentFullPath',
    'deptFullPath',
  ]);
  const path = pathText
    .split(/[/>]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (path.length === 0) {
    return null;
  }
  return {
    minimumDepartmentId: firstText(record, [
      'minimumDepartmentId',
      'lowestDepartmentId',
      'departmentId',
      'deptId',
    ]),
    path,
  };
}

export function extractExpertDepartmentPermission(value: unknown): ExpertDepartmentPermission {
  const root = asRecord(value);
  const nestedRecords = [
    asRecord(root.dept),
    root,
    asRecord(root.departmentInfo),
    asRecord(root.departmentHierarchy),
    asRecord(root.department),
  ];

  for (const record of nestedRecords) {
    const permission =
      permissionFromArray(record) ?? permissionFromFlatLevels(record) ?? permissionFromPath(record);
    if (permission) {
      return permission;
    }
  }

  return {
    minimumDepartmentId: '',
    path: [],
  };
}

export type HarnessAccessLevel = 'owner' | 'admin' | 'task-only';

export type HarnessAuthorizedDepartment = {
  deptName: string;
  deptCode: string;
  path: string[];
  codePath: string[];
  levelNo: number;
};

export type HarnessDepartmentPermissions = {
  accessLevel: HarnessAccessLevel;
  ownedOrgs: HarnessAuthorizedDepartment[];
  adminOrgs: HarnessAuthorizedDepartment[];
  manageableOrgs: HarnessAuthorizedDepartment[];
};

const HARNESS_DEPARTMENT_LEVELS = [3, 4, 5, 6, 7, 8] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readText(record[key]);
    if (value) return value;
  }
  return '';
}

function readPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readText).filter(Boolean);
  }
  return readText(value)
    .split(/[/>|,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHarnessOrg(value: unknown): HarnessAuthorizedDepartment | null {
  const record = asRecord(value);
  const levelSegments = HARNESS_DEPARTMENT_LEVELS.map((level) => ({
    level,
    name: firstText(record, [
      'deptNameL' + level,
      'departmentNameL' + level,
      'deptL' + level + 'Name',
      'departmentL' + level,
      'deptL' + level,
    ]),
    code: firstText(record, [
      'deptCodeL' + level,
      'departmentCodeL' + level,
      'deptL' + level + 'Code',
    ]),
  }));
  const deepestCodedSegment = [...levelSegments].reverse().find((segment) => segment.code);
  const deepestNamedLevelNo =
    [...levelSegments].reverse().find((segment) => segment.name)?.level ?? 0;
  const explicitLevelNo = Number(
    firstText(record, [
      'deptLevel',
      'departmentLevel',
      'levelNo',
      'level',
      'orgLevel',
      'deptLevelNo',
      'departmentLevelNo',
    ]),
  );
  const authorizationLevelNo =
    deepestCodedSegment?.level ??
    (Number.isFinite(explicitLevelNo) && explicitLevelNo > 0
      ? explicitLevelNo
      : deepestNamedLevelNo);
  const authorizedSegments = levelSegments.filter(
    (segment) => segment.name && (!authorizationLevelNo || segment.level <= authorizationLevelNo),
  );
  const path = authorizedSegments.map((segment) => segment.name);
  const codePath = authorizedSegments.map((segment) => segment.code);

  if (path.length === 0) {
    const fallbackPath = readPath(
      record.path ??
        record.deptPath ??
        record.departmentPath ??
        record.deptNamePath ??
        record.departmentNamePath,
    );
    const fallbackPathLength = deepestCodedSegment
      ? Math.max(1, deepestCodedSegment.level - HARNESS_DEPARTMENT_LEVELS[0] + 1)
      : fallbackPath.length;
    path.push(...fallbackPath.slice(0, fallbackPathLength));
  }

  const fallbackName = firstText(record, [
    'deptName',
    'departmentName',
    'orgName',
    'name',
    'label',
  ]);
  if (path.length === 0 && fallbackName) {
    path.push(fallbackName);
  }
  if (path.length === 0) return null;

  const fallbackCode = firstText(record, ['deptCode', 'departmentCode', 'orgCode', 'code', 'id']);
  return {
    deptName: path.at(-1) ?? fallbackName,
    deptCode: deepestCodedSegment?.code ?? fallbackCode,
    path,
    codePath,
    levelNo: authorizationLevelNo,
  };
}

function normalizeOrgList(value: unknown): HarnessAuthorizedDepartment[] {
  if (!Array.isArray(value)) return [];

  const orgs = new Map<string, HarnessAuthorizedDepartment>();
  value.forEach((item) => {
    const org = normalizeHarnessOrg(item);
    if (!org) return;
    const key = org.deptCode || org.path.join('/');
    if (!orgs.has(key)) orgs.set(key, org);
  });
  return [...orgs.values()];
}

function assertHarnessPermissionSuccess(response: unknown): void {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  if (meta.success === false) {
    throw new Error(
      readText(meta.message) || readText(responseRecord.message) || '部门管理权限加载失败',
    );
  }
}

export function createEmptyHarnessDepartmentPermissions(): HarnessDepartmentPermissions {
  return {
    accessLevel: 'task-only',
    ownedOrgs: [],
    adminOrgs: [],
    manageableOrgs: [],
  };
}

export function normalizeHarnessDepartmentPermissions(
  response: unknown,
): HarnessDepartmentPermissions {
  assertHarnessPermissionSuccess(response);
  const responseRecord = asRecord(response);
  const data = asRecord(responseRecord.data ?? response);
  const ownedOrgs = normalizeOrgList(
    data.ownedOrgs ?? data.ownerOrgs ?? data.ownedDepartments ?? data.ownerDepartments,
  );
  const ownedCodes = new Set(ownedOrgs.map((org) => org.deptCode).filter(Boolean));
  const ownedPaths = new Set(ownedOrgs.map((org) => org.path.join('/')));
  const adminOrgs = normalizeOrgList(
    data.adminOrgs ?? data.managedOrgs ?? data.adminDepartments ?? data.managedDepartments,
  ).filter(
    (org) => !(org.deptCode && ownedCodes.has(org.deptCode)) && !ownedPaths.has(org.path.join('/')),
  );

  return {
    accessLevel: ownedOrgs.length > 0 ? 'owner' : adminOrgs.length > 0 ? 'admin' : 'task-only',
    ownedOrgs,
    adminOrgs,
    manageableOrgs: [...ownedOrgs, ...adminOrgs],
  };
}

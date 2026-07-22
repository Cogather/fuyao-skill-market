import { notifyHarnessConfigurationChanged } from './harnessConfigurationSyncService';

export interface DepartmentPlanningPermissionMember {
  userId: string;
  userName: string;
  label: string;
  departmentName: string;
  grantedAt: string;
}

export interface DepartmentPlanningPermissionRecord {
  departmentName: string;
  members: DepartmentPlanningPermissionMember[];
  updatedAt: string;
}

const STORAGE_KEY = 'skill-market-department-planning-permissions-v1';

const defaultRecords: DepartmentPlanningPermissionRecord[] = [
  {
    departmentName: '联调工具部',
    members: [
      {
        userId: 'mock001',
        userName: '张三',
        label: '张三 mock001',
        departmentName: '联调工具部',
        grantedAt: '2026-07-18T09:00:00.000Z',
      },
      {
        userId: '000127',
        userName: '李明',
        label: '李明 000127',
        departmentName: '联调工具部',
        grantedAt: '2026-07-18T09:10:00.000Z',
      },
    ],
    updatedAt: '2026-07-18T09:10:00.000Z',
  },
  {
    departmentName: '质量产品部',
    members: [
      {
        userId: '000245',
        userName: '李四',
        label: '李四 000245',
        departmentName: '质量产品部',
        grantedAt: '2026-07-18T09:20:00.000Z',
      },
    ],
    updatedAt: '2026-07-18T09:20:00.000Z',
  },
];

let memoryRecords: DepartmentPlanningPermissionRecord[] | null = null;

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function cloneMember(
  member: DepartmentPlanningPermissionMember,
): DepartmentPlanningPermissionMember {
  return { ...member };
}

function cloneRecord(
  record: DepartmentPlanningPermissionRecord,
): DepartmentPlanningPermissionRecord {
  return { ...record, members: record.members.map(cloneMember) };
}

function readRecords(): DepartmentPlanningPermissionRecord[] {
  if (memoryRecords) return memoryRecords;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DepartmentPlanningPermissionRecord[];
        if (Array.isArray(parsed)) {
          memoryRecords = parsed;
          return memoryRecords;
        }
      }
    } catch {
      // Invalid local data falls back to the default permission records.
    }
  }
  memoryRecords = defaultRecords.map(cloneRecord);
  return memoryRecords;
}

function persist(records: DepartmentPlanningPermissionRecord[]): void {
  memoryRecords = records;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

export function listDepartmentPlanningPermissions(): DepartmentPlanningPermissionRecord[] {
  return readRecords().map(cloneRecord);
}

export function listAuthorizedHarnessDepartmentNames(userId: string): string[] {
  const normalizedUserId = normalize(userId);
  if (!normalizedUserId) return [];
  return readRecords()
    .filter((record) =>
      record.members.some((member) => normalize(member.userId) === normalizedUserId),
    )
    .map((record) => record.departmentName)
    .filter(Boolean);
}

export function grantDepartmentPlanningPermission(
  departmentName: string,
  member: Omit<DepartmentPlanningPermissionMember, 'grantedAt'>,
): DepartmentPlanningPermissionRecord {
  const normalizedDepartment = normalize(departmentName);
  const userId = normalize(member.userId);
  if (!normalizedDepartment) throw new Error('请选择部门');
  if (!userId) throw new Error('请选择有效人员');

  const records = readRecords();
  let record = records.find((item) => item.departmentName === normalizedDepartment);
  const now = new Date().toISOString();
  if (!record) {
    record = { departmentName: normalizedDepartment, members: [], updatedAt: now };
    records.push(record);
  }
  if (record.members.some((item) => item.userId === userId)) {
    throw new Error('该人员已拥有此部门的 Harness 规划与配置权限');
  }
  record.members.push({
    userId,
    userName: normalize(member.userName),
    label:
      normalize(member.label) || [normalize(member.userName), userId].filter(Boolean).join(' '),
    departmentName: normalize(member.departmentName),
    grantedAt: now,
  });
  record.updatedAt = now;
  persist(records);
  notifyHarnessConfigurationChanged('permission', normalizedDepartment);
  return cloneRecord(record);
}

export function revokeDepartmentPlanningPermission(
  departmentName: string,
  userId: string,
): DepartmentPlanningPermissionRecord {
  const records = readRecords();
  const record = records.find((item) => item.departmentName === departmentName);
  if (!record) throw new Error('未找到该部门的权限配置');
  record.members = record.members.filter((item) => item.userId !== userId);
  record.updatedAt = new Date().toISOString();
  persist(records);
  notifyHarnessConfigurationChanged('permission', departmentName);
  return cloneRecord(record);
}

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { DepartmentTreeNodeDto } from '../services/skillMarket/apiTypes';

const defaultDepartmentList: DepartmentTreeNodeDto[] = [
  {
    deptName: '核心网产品线mock',
    deptLevel: 1,
    children: [
      {
        deptName: '核心网研究部',
        deptLevel: 2,
        children: [],
      },
    ],
  },
];

function normalizeUserId(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseDepartmentListFromPayload(payload: Record<string, unknown>): DepartmentTreeNodeDto[] | null {
  if (Array.isArray(payload.departmentList)) {
    return payload.departmentList as DepartmentTreeNodeDto[];
  }
  if (typeof payload.departmentListStr !== 'string' || payload.departmentListStr.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(payload.departmentListStr);
    return Array.isArray(parsed) ? (parsed as DepartmentTreeNodeDto[]) : null;
  } catch {
    return null;
  }
}

export const useAppContextStore = defineStore('appContext', () => {
  const userId = ref('');
  const departmentList = ref<DepartmentTreeNodeDto[] | null>(defaultDepartmentList);

  function applyInitPayload(payload: Record<string, unknown>): void {
    if ('userId' in payload) {
      userId.value = normalizeUserId(payload.userId);
    }

    const nextDepartmentList = parseDepartmentListFromPayload(payload);
    if (nextDepartmentList) {
      departmentList.value = nextDepartmentList;
    }
  }

  return {
    userId,
    departmentList,
    applyInitPayload,
  };
});

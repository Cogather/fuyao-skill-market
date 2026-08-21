import { defineStore } from 'pinia';
import {
  fetchFreshDepartmentTree,
  isUsableDepartmentTree,
} from '../services/skillMarket/departmentTreeLoader';

export type DepartmentTreeSource = 'none' | 'parent' | 'http-api';
export type DepartmentTreeLoadState = 'idle' | 'loading' | 'ready' | 'error';

export const useSkillMarketStore = defineStore('skillMarketStore', {
  state: () => ({
    userId: '',
    userName: '',
    departmentList: [] as unknown[],
    departmentTreeSource: 'none' as DepartmentTreeSource,
    departmentTreeLoadState: 'idle' as DepartmentTreeLoadState,
    departmentTreeLoadError: '',
    departmentTreeLoadedAt: 0,
  }),
  actions: {
    updateUserId(id: string) {
      this.userId = id;
    },
    updateUserName(name: string) {
      this.userName = name;
    },
    updateDept(departmentList: unknown[], source: DepartmentTreeSource = 'parent') {
      // 迟到的空初始化消息不能覆盖已经获取成功的真实树。
      if (!isUsableDepartmentTree(departmentList)) return false;
      // HTTP 接口成功后以带防缓存参数获取的真实树为准。
      if (
        source === 'parent' &&
        this.departmentTreeSource === 'http-api' &&
        isUsableDepartmentTree(this.departmentList)
      ) {
        return false;
      }
      this.departmentList = [...departmentList];
      this.departmentTreeSource = source;
      this.departmentTreeLoadState = 'ready';
      this.departmentTreeLoadError = '';
      this.departmentTreeLoadedAt = Date.now();
      return true;
    },
    async refreshDepartmentTree(): Promise<boolean> {
      this.departmentTreeLoadState = 'loading';
      this.departmentTreeLoadError = '';
      try {
        const departmentList = await fetchFreshDepartmentTree();
        this.updateDept(departmentList, 'http-api');
        return true;
      } catch (error) {
        this.departmentTreeLoadState = 'error';
        this.departmentTreeLoadError =
          error instanceof Error && error.message.trim() ? error.message : '真实部门树获取失败';
        return false;
      }
    },
  },
});

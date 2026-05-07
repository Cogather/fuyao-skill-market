import { defineStore } from 'pinia';

export const useSkillMarketStore = defineStore('skillMarketStore', {
  state: () => ({
    userId: '',
    departmentList: [] as unknown[],
  }),
  actions: {
    updateUserId(id: string) {
      this.userId = id;
    },
    updateDept(departmentList: unknown[]) {
      this.departmentList = [...departmentList];
    },
  },
});

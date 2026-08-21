import { defineStore } from 'pinia';

export const useSkillMarketStore = defineStore('skillMarketStore', {
  state: () => ({
    userId: '',
    userName: '',
    departmentList: [] as unknown[],
  }),
  actions: {
    updateUserId(id: string) {
      this.userId = id;
    },
    updateUserName(name: string) {
      this.userName = name;
    },
    updateDept(departmentList: unknown[]) {
      this.departmentList = [...departmentList];
    },
  },
});

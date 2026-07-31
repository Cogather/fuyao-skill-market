import { createRouter, createWebHistory } from 'vue-router';
import HarnessManagementPage from '../views/HarnessManagementPage.vue';
import SkillMarketPage from '../views/SkillMarketPage.vue';
import SkillDetailPage from '../views/skill/SkillDetailPage.vue';

const legacyPlanningTabs = new Set([
  'planning',
  'skillPlanning',
  'Skill规划',
  'Skill 规划',
  'skill规划',
]);

function isLegacyPlanningTab(value: unknown): boolean {
  const tab = Array.isArray(value) ? value[0] : value;
  return typeof tab === 'string' && legacyPlanningTabs.has(tab);
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: 'skill-square',
    },
    {
      path: '/skill-square',
      name: 'skill-square',
      component: SkillMarketPage,
      beforeEnter: (to) =>
        isLegacyPlanningTab(to.query.tab) ? { name: 'harness-management' } : true,
    },
    {
      path: '/harness-management',
      name: 'harness-management',
      component: HarnessManagementPage,
    },
    {
      path: '/skill-detail/:skillId',
      name: 'skill-detail',
      component: SkillDetailPage,
      props: true,
      alias: '/skill-detail/:skillId',
    },
  ],
});

export default router;

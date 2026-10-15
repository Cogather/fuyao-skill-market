import { createRouter, createWebHistory } from 'vue-router';
import { useProfileStore } from '@/stores/userStore.ts';
import HarnessManagementPage from '../views/HarnessManagementPage.vue';
import SkillMarketPage from '../views/SkillMarketPage.vue';
import SkillDebugPage from '../views/skill/SkillDebugPage.vue';
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
      path: '/skill-debug',
      name: 'skill-debug',
      component: SkillDebugPage,
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

// 路由守卫：未登录时跳转 w3 登录页
router.beforeEach((to, from, next) => {
  const profileStore = useProfileStore();
  if(profileStore.userInfo.w3Id) {
    next();
    return;
  }
  // 登录校验尚未完成时也放行（initUserInfo 在 App.vue onMounted 中异步执行，
  // 若未登录会由 clearUserInfo 自动跳转 w3 登录页，不在此阻塞路由）
  next();
})

export default router;

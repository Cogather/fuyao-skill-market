import { createRouter, createWebHistory } from 'vue-router';
import SkillMarketPage from '../views/SkillMarketPage.vue';
import SkillDetailPage from '../views/skill/SkillDetailPage.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'skill-market',
      component: SkillMarketPage,
    },
    {
      path: '/skill-market/detail/:skillId',
      name: 'skill-detail',
      component: SkillDetailPage,
      props: true,
      alias: '/skill-detail/:skillId',
    },
    {
      path: '/skill-market',
      redirect: (to) => ({
        path: '/',
        query: to.query,
      }),
    },
  ],
});

export default router;

import { createRouter, createWebHistory } from 'vue-router';
import SkillMarketPage from '../views/SkillMarketPage.vue';
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'skill-market',
            component: SkillMarketPage,
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

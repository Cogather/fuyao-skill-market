import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router';
import { useProfileStore } from './stores/userStore';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  // 先完成自动登录上下文初始化，再挂载业务页面，避免页面携带空 userId 抢跑请求。
  const profileStore = useProfileStore(pinia);
  await profileStore.initUserInfo();

  app.use(router);
  app.mount('#app');
}

void bootstrap();

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const fuyaoTarget = 'https://fuyao.rnd.huawei.com';

  return {
    base: env.VITE_BASE || '/skill-market/',
    plugins: [vue()],
    server: {
      proxy: {
        '/fuyaoDomain': {
          target: fuyaoTarget,
          changeOrigin: true,
          secure: true,
        }
      },
    },
  };
});

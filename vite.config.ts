import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const fuyaoTarget = 'https://fuyao.rnd.huawei.com';

  return {
    base: env.VITE_BASE || '/',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy: {
        '/fuyaoDomain': {
          target: fuyaoTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/fuyaoDomain/, '') || '/',
        },
      },
    },
  };
});

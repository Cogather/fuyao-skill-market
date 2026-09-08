import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDebugPagePath = path.resolve(__dirname, 'src/views/skill/SkillDebugPage.vue');
const skillDebugFallbackPath = path.resolve(__dirname, 'src/views/SkillMarketPage.vue');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const fuyaoTarget = 'https://fuyao.rnd.huawei.com';

  return {
    base: env.VITE_BASE || '/',
    plugins: [vue()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        ...(!existsSync(skillDebugPagePath)
          ? [
              {
                find: '../views/skill/SkillDebugPage.vue',
                replacement: skillDebugFallbackPath,
              },
            ]
          : []),
      ],
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

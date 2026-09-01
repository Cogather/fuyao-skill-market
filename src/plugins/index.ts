import type { App } from 'vue';
import i18n from './lang';

export default (app: App) => {
  app.use(i18n);
};

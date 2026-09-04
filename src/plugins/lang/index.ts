import { createI18n } from 'vue-i18n';
import en from './en';
import zh from './zh';

const messages = {
  en: { ...en },
  zh: { ...zh },
};

const DEFAULT_LANG = 'zh';

const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LANG,
  messages,
  globalInjection: true,
});

export const t: (key: string, placeholderMap?: Record<string, string | number>) => string =
  i18n.global.t;

export default i18n;

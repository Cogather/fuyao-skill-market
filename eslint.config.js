import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

const commonRules = {
  curly: ['error', 'all'],
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vite/**', 'coverage/**', '*.log'],
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      ...commonRules,
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...commonRules,
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      vue: vuePlugin,
    },
    rules: {
      ...commonRules,
    },
  },
  // Keep this last to disable formatting rules that conflict with Prettier.
  prettierConfig,
];

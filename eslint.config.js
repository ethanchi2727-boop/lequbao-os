import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', 'docs/v6.1/source-package/**', 'database/**/*.sql'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/workbench-web/src/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/{consumer-miniapp,merchant-miniapp}/src/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
    languageOptions: {
      globals: {
        App: 'readonly',
        Component: 'readonly',
        Page: 'readonly',
        getApp: 'readonly',
        wx: 'readonly',
      },
    },
  },
);

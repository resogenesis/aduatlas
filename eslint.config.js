import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Serverless functions run on Node, not in the browser.
    files: ['api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Node scripts: the regression harness, its checks and the seed scripts.
    // They run on Node as ES modules, and the checks also pass callbacks to
    // page.evaluate() that run in the browser, so both sets of globals apply.
    // Same rules as the app, without the React plugins. no-use-before-define is
    // limited to the same scope: that is the TDZ ReferenceError that crashed a
    // check once, and a module-level const read inside a function is not one.
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
    },
  },
])

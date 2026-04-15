import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/e2e-report/**',
      '**/test-results/**',
    ],
  },

  // ── Base JS rules for all files ───────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript source + test files ────────────────────────────────────────
  {
    files: [
      'shared/src/**/*.ts',
      'server/src/**/*.ts',
      'server/tests/**/*.ts',
      'client/src/**/*.ts',
      'client/tests/**/*.ts',
      'client/scripts/**/*.ts',
    ],
    extends: tseslint.configs.recommended,
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Allow _-prefixed names as intentionally unused (conventional pattern)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── Jest globals for TypeScript test files ────────────────────────────────
  {
    files: ['server/tests/**/*.ts', 'client/tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // ── React renderer: JSX parsing for all renderer files ───────────────────
  {
    files: ['client/renderer/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // ── React plugin rules (all renderer files inc. tests) ───────────────────
  {
    files: ['client/renderer/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/prop-types': 'off',         // project uses no prop validation
    },
  },

  // ── Jest globals for renderer test files ──────────────────────────────────
  {
    files: ['client/renderer/tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // ── Node.js config files + mock files ────────────────────────────────────
  {
    files: ['**/*.config.{js,cjs,mjs}', '**/__mocks__/**/*.{js,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ── Prettier (must be last — disables conflicting formatting rules) ────────
  prettierConfig,
);

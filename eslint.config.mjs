import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/desktop/release/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/web/src/routeTree.gen.ts',
      'servers/api/prisma/migrations/**',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (no type-checking — fast, runs on every file)
  ...tseslint.configs.recommended,

  // React-specific rules for the web app
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Browser globals for any web/desktop renderer code
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/desktop/src/preload/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Node globals for server, electron main, scripts, tests
  {
    files: [
      'servers/**/*.ts',
      'apps/desktop/src/main/**/*.ts',
      'apps/e2e/**/*.ts',
      '**/*.test.ts',
      'packages/*/vitest.config.ts',
      '**/vite.config.ts',
      '**/playwright.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Loosen rules across the repo — pragmatic defaults
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // No-console is annoying for CLI scripts and server logs
      'no-console': 'off',
    },
  },
)

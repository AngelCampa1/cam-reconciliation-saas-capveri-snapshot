import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Disable React Compiler checks (React Compiler not enabled in this project)
      'react-hooks/incompatible-library': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Exception for UI library components, context providers, and hooks
  // These intentionally co-locate components with variants/utilities (Shadcn/UI pattern)
  {
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      'src/features/**/components/*.{ts,tsx}',
      'src/**/*Context.tsx',
      'src/hooks/*.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Relaxed rules for test files and mocks
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/e2e/**/*.{ts,tsx}',
      '**/mocks/**/*.{ts,tsx}',
      '**/setupTests.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
)

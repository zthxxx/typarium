//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      // The mobx pattern `observer(function Name() {})` intentionally
      // shadows the exported const to keep component display names.
      'no-shadow': 'off',
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      // Vendored Go wasm_exec runtime (plain JS, upstream style).
      'src/adapters/typescript/analyzer/go-runtime.js',
    ],
  },
]

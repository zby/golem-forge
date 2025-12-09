import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', '**/*.js', '**/*.mjs'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Architecture enforcement: Platform packages must not import AI SDK directly
  // See docs/notes/core-vs-platform.md for rationale
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['ai'],
              message:
                'Import AI SDK types from @golem-forge/core instead. See docs/notes/core-vs-platform.md',
            },
            {
              group: ['@ai-sdk/*'],
              message:
                'AI SDK provider imports belong in @golem-forge/core. See docs/notes/core-vs-platform.md',
            },
          ],
        },
      ],
    },
  }
);

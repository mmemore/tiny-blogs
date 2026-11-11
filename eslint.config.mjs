// @ts-check
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config shared by every workspace package.
 * Run from the repo root: `pnpm lint`.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/var/**',
      '**/*.d.ts',
      // Non-product directories: throwaway prototypes, agent workspace, reference design.
      '.scratch/**',
      '.workbuddy/**',
      'design/**',
      'docs/**',
      // QA 一次性脚本（playwright run-code / 安全断言），不是产品代码。
      'qa/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Nest 的依赖注入依赖 `emitDecoratorMetadata`：构造函数参数的类型必须保持**值导入**，
    // 否则 tsc 会把 `design:paramtypes` 退化成 `Object`，运行期注入变成 undefined。
    // 所以 API 包关闭"强制 type-only 导入"这条规则；其余包继续启用。
    // 注意：flat config 是后者覆盖前者，这个块必须放在通用规则块之后。
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);

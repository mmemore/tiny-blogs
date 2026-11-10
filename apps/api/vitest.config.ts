import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * API 测试配置。
 *
 * - 用 SWC 转译而不是 vitest 默认的 esbuild：Nest 的依赖注入依赖
 *   `emitDecoratorMetadata` 产出的 `design:paramtypes`，esbuild 不支持它，
 *   会让所有构造函数注入变成 undefined。SWC 支持 legacy 装饰器 + 元数据。
 * - `fileParallelism: false`：所有测试共用同一个 `tiny_blogs_test` schema，
 *   并行跑会互相清表。串行慢一点，但结果可信。
 * - 超时放宽：每个测试文件都要建连接、跑迁移、启动 Nest 应用。
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

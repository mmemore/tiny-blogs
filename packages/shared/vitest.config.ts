import { defineConfig } from 'vitest/config';

/**
 * shared 包的单测配置。
 *
 * `fileParallelism: false`：这组用例是纯函数、总耗时不到 1 秒，串行跑反而更稳
 * （与 API 包保持同一种"测试怎么跑"的约定，也避免多 worker 抢同一个临时目录）。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});

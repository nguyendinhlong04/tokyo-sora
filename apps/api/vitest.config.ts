import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // esbuild (mặc định của vitest) KHÔNG sinh decorator metadata, nên NestJS không
  // resolve được kiểu tham số constructor và mọi DI đều undefined. SWC sinh được.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Test tích hợp dùng chung một CSDL test nên phải chạy tuần tự,
    // không để hai file cùng lúc DROP SCHEMA của nhau.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})

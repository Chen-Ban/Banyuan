import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../packages/banvasgl/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/flow/**/*.test.ts'],
    reporters: ['verbose'],
  },
});

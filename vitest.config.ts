/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/banyan/backend/tests/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/banvasgl/src'),
    },
  },
})

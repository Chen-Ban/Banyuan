import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/core.ts',
    'src/design.ts',
    'src/runtime.ts',
    'src/flow.ts',
  ],
  dts: true,
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  // 所有实际实现都在子包中，伞包只做 re-export，标记为 external 避免重复打包
  external: [
    'react',
    'react-dom',
    '@banyuan/canvas',
    '@banyuan/canvas-runtime',
    '@banyuan/canvas-design',
    '@banyuan/flow-design',
  ],
  // 关闭 splitting，避免纯 re-export 被抽到 chunk 后丢失 export 语义
  splitting: false,
  clean: true,
})

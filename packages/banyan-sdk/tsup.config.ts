import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  // bundle: true（默认）但 external 掉所有子包，
  // 让 tsup 在 ESM 输出中保留 export * from '...' 语句
  external: [
    'react',
    'react-dom',
    '@banyuan/banvasgl',
    '@banyuan/banvas-runtime',
        '@banyuan/banvas-runtime-web',
    '@banyuan/banvas-design',
    '@banyuan/flow-design',
    '@banyuan/flow',
  ],
  clean: true,
})

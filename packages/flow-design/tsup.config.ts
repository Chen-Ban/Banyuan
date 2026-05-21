import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: true,
  treeshake: true,
  external: ['@banyuan/banvasgl', '@banyuan/flow', 'react'],
})

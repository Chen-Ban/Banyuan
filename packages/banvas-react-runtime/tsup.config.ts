import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  dts: true,
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  splitting: true,
  clean: true,
  external: ['react', '@banyuan/banvasgl', '@banyuan/banvasgl-react'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})

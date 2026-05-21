import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'presets/client': 'src/presets/client.ts',
    'presets/server': 'src/presets/server.ts',
    'types/index': 'src/types/index.ts',
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
})

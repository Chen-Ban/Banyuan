import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'flow/client': 'src/foundation/flow/presets/client.ts',
    'flow/server': 'src/foundation/flow/presets/server.ts',
  },
  dts: true,
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  splitting: true,
  clean: true,
  external: [],
  define: {
    __BANVASGL_VERSION__: JSON.stringify(pkg.version),
  },
})

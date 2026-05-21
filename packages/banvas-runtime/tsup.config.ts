import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm', 'cjs'],
    outExtension({ format }) {
        return { js: format === 'esm' ? '.mjs' : '.cjs' }
    },
    clean: true,
    external: ['react', 'react-dom', '@banyuan/banvasgl'],
})

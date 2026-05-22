import { defineConfig } from 'tsup'

export default defineConfig([
    // 主入口：编辑态 hook
    {
        entry: { index: 'src/index.ts' },
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        external: ['react', 'react-dom', '@banyuan/banvasgl', '@banyuan/banvas-runtime-web'],
    },
    // Worker 入口：独立 bundle，不拆分
    {
        entry: { worker: 'src/workers/WorkerRuntime.ts' },
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        noExternal: [/.*/],  // Worker 需打包所有依赖
        external: [],
    },
])

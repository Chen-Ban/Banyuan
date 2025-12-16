import { defineConfig } from "tsup";

export default defineConfig([
  // 主库打包：前端 / 后端入口
  {
    entry: ["src/index.frontend.ts", "src/index.backend.ts"],
    dts: true,
    format: ["esm", "cjs"],
    clean: true,
  },
  // 单独打包 WorkerRuntime，生成固定文件名，供 WorkerExecutor 使用
  {
    entry: {
      "banvas-worker": "src/workers/WorkerRuntime.ts",
    },
    format: ["esm"], // 仅浏览器 ESM 即可
    outDir: "dist",
    splitting: false,
    minify: false,
    dts: false,
    clean: false,
  },
]);



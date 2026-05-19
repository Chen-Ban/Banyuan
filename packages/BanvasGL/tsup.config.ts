import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig([
  // 三个打包维度：前端（编辑态）/ 后端 / 运行时
  {
    entry: [
      "src/index.frontend.ts",
      "src/index.backend.ts",
      "src/index.runtime.ts",
    ],
    dts: true,
    format: ["esm", "cjs"],
    outExtension({ format }) {
      return { js: format === "esm" ? ".mjs" : ".cjs" };
    },
    clean: true,
    external: ["react", "react-dom"],
    define: {
      __BANVASGL_VERSION__: JSON.stringify(pkg.version),
    },
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

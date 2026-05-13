import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  clean: true,
  external: ["banvasgl"],
  define: {
    __XIANGDI_VERSION__: JSON.stringify(pkg.version),
  },
});

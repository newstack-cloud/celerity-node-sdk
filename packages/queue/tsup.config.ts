import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
  },
  {
    entry: ["src/index.ts"],
    format: ["cjs"],
    sourcemap: true,
    splitting: false,
  },
]);

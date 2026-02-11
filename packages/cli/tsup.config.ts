import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/extract/cli.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  banner({ format }) {
    // Add shebang for the CLI entry point in ESM format
    if (format === "esm") {
      return { js: "" };
    }
    return {};
  },
  esbuildOptions(options) {
    options.keepNames = true;
  },
});

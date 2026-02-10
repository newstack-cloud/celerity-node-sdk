import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.d.ts"],
      thresholds: process.env.CI
        ? {
            functions: 80,
            branches: 80,
            lines: 80,
            statements: 80,
          }
        : undefined,
    },
  },
});

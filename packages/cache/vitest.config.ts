import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

const includeIntegration = process.env.VITEST_INCLUDE_INTEGRATION === "true";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: "node",
    ...(includeIntegration
      ? {
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 15_000,
          hookTimeout: 30_000,
          env: {
            CELERITY_LOCAL_REDIS_URL: "redis://localhost:6399",
          },
        }
      : {
          exclude: ["tests/integration/**", "node_modules/**"],
        }),
  },
});

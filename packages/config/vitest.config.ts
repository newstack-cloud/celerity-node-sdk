import { defineConfig } from "vitest/config";

const includeIntegration = process.env.VITEST_INCLUDE_INTEGRATION === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    ...(includeIntegration
      ? {
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 15_000,
          hookTimeout: 30_000,
          env: {
            AWS_ENDPOINT_URL: "http://localhost:4566",
            AWS_ACCESS_KEY_ID: "test",
            AWS_SECRET_ACCESS_KEY: "test",
            AWS_REGION: "us-east-1",
            CELERITY_CONFIG_VALKEY_HOST: "localhost",
            CELERITY_CONFIG_VALKEY_PORT: "6399",
          },
        }
      : {
          exclude: ["tests/integration/**", "node_modules/**"],
        }),
  },
});

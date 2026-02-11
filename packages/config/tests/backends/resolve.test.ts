import { describe, it, expect, afterEach } from "vitest";
import { resolveBackend } from "../../src/backends/resolve";
import { EmptyConfigBackend } from "../../src/backends/empty";
import { AwsSecretsManagerBackend } from "../../src/backends/aws-secrets-manager";
import { AwsParameterStoreBackend } from "../../src/backends/aws-parameter-store";
import { AwsLambdaExtensionBackend } from "../../src/backends/aws-lambda-extension";
import { LocalConfigBackend } from "../../src/backends/local";

describe("resolveBackend", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return EmptyConfigBackend for unknown platform", () => {
    const backend = resolveBackend("other", "secrets-manager");
    expect(backend).toBeInstanceOf(EmptyConfigBackend);
  });

  it("should return EmptyConfigBackend for unsupported platform", () => {
    const backend = resolveBackend("gcp", "secrets-manager");
    expect(backend).toBeInstanceOf(EmptyConfigBackend);
  });

  it("should return LocalConfigBackend for local platform", () => {
    const backend = resolveBackend("local", "secrets-manager");
    expect(backend).toBeInstanceOf(LocalConfigBackend);
  });

  describe("AWS platform", () => {
    it("should return AwsParameterStoreBackend when store kind is parameter-store", () => {
      const backend = resolveBackend("aws", "parameter-store");
      expect(backend).toBeInstanceOf(AwsParameterStoreBackend);
    });

    it("should return AwsSecretsManagerBackend when not on Lambda", () => {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      const backend = resolveBackend("aws", "secrets-manager");
      expect(backend).toBeInstanceOf(AwsSecretsManagerBackend);
    });

    it("should return AwsSecretsManagerBackend on Lambda without extension", () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = "my-function";
      delete process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
      const backend = resolveBackend("aws", "secrets-manager");
      expect(backend).toBeInstanceOf(AwsSecretsManagerBackend);
    });

    it("should return AwsLambdaExtensionBackend on Lambda with extension", () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = "my-function";
      process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = "2773";
      const backend = resolveBackend("aws", "secrets-manager");
      expect(backend).toBeInstanceOf(AwsLambdaExtensionBackend);
    });

    it("should return AwsParameterStoreBackend on Lambda with extension when store kind is parameter-store", () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = "my-function";
      process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = "2773";
      const backend = resolveBackend("aws", "parameter-store");
      expect(backend).toBeInstanceOf(AwsParameterStoreBackend);
    });
  });
});

describe("EmptyConfigBackend", () => {
  it("should return an empty map", async () => {
    const backend = new EmptyConfigBackend();
    const result = await backend.fetch("any-store");
    expect(result).toEqual(new Map());
  });
});

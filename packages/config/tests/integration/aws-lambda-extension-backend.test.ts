import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AwsLambdaExtensionBackend } from "../../src/backends/aws-lambda-extension";

describe("AwsLambdaExtensionBackend (integration)", () => {
  let server: Server;
  let port: number;
  const savedEnv: Record<string, string | undefined> = {};

  const mockSecrets: Record<string, string> = {
    "app/config": JSON.stringify({
      SecretString: JSON.stringify({ API_KEY: "ext-key-123", REGION: "us-west-2" }),
    }),
  };

  function saveAndSetEnv(vars: Record<string, string>) {
    for (const [key, value] of Object.entries(vars)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
  }

  function restoreEnv() {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://localhost`);
      const secretId = url.searchParams.get("secretId");
      const token = req.headers["x-aws-parameters-secrets-token"];

      if (token !== "test-session-token") {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (secretId && mockSecrets[secretId]) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(mockSecrets[secretId]);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should fetch a secret via the extension HTTP endpoint", async () => {
    saveAndSetEnv({
      AWS_SESSION_TOKEN: "test-session-token",
      PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: String(port),
    });
    const backend = new AwsLambdaExtensionBackend();

    const result = await backend.fetch("app/config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("API_KEY")).toBe("ext-key-123");
    expect(result.get("REGION")).toBe("us-west-2");
  });

  it("should return an empty map when extension returns secret with no SecretString", async () => {
    mockSecrets["app/no-string"] = JSON.stringify({});
    saveAndSetEnv({
      AWS_SESSION_TOKEN: "test-session-token",
      PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: String(port),
    });
    const backend = new AwsLambdaExtensionBackend();

    const result = await backend.fetch("app/no-string");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    delete mockSecrets["app/no-string"];
  });

  it("should fall back to direct SDK when extension returns an error", async () => {
    saveAndSetEnv({
      AWS_SESSION_TOKEN: "test-session-token",
      PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: String(port),
    });
    const backend = new AwsLambdaExtensionBackend();

    // "app/database-config" doesn't exist in mock server but is seeded in LocalStack
    const result = await backend.fetch("app/database-config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("DB_HOST")).toBe("rds.amazonaws.com");
  });

  it("should fall back to direct SDK when extension is unreachable", async () => {
    saveAndSetEnv({
      AWS_SESSION_TOKEN: "test-session-token",
      PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: "19999",
    });
    const backend = new AwsLambdaExtensionBackend();

    const result = await backend.fetch("app/database-config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("DB_HOST")).toBe("rds.amazonaws.com");
  });
});

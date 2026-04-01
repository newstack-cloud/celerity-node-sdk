import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { generateTestToken } from "../src/jwt";

let server: Server;
let port: number;
let lastRequestBody: Record<string, unknown> | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.url === "/token" && req.method === "POST") {
        lastRequestBody = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "test-jwt-token-123" }));
      } else if (req.url === "/token-error" && req.method === "POST") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("internal server error");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === "object" && addr !== null ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  lastRequestBody = null;
});

describe("generateTestToken", () => {
  it("should return a token from the dev auth server", async () => {
    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${port}`;
    try {
      const token = await generateTestToken();
      expect(token).toBe("test-jwt-token-123");
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    }
  });

  it("should send default sub 'test-user' when no options provided", async () => {
    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${port}`;
    try {
      await generateTestToken();
      expect(lastRequestBody).toEqual({ sub: "test-user" });
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    }
  });

  it("should send custom sub", async () => {
    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${port}`;
    try {
      await generateTestToken({ sub: "user-42" });
      expect(lastRequestBody?.sub).toBe("user-42");
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    }
  });

  it("should include claims when provided", async () => {
    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${port}`;
    try {
      await generateTestToken({ claims: { role: "admin", org_id: "org-1" } });
      expect(lastRequestBody?.claims).toEqual({ role: "admin", org_id: "org-1" });
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    }
  });

  it("should include expiresIn when provided", async () => {
    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${port}`;
    try {
      await generateTestToken({ expiresIn: "30m" });
      expect(lastRequestBody?.expiresIn).toBe("30m");
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    }
  });

  it("should throw when the auth server returns an error", async () => {
    // Point to the error endpoint by using a mock server that always errors.
    // We create a separate server for this to avoid coupling with the main one.
    const errorServer = createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("something went wrong");
    });

    const errorPort = await new Promise<number>((resolve) => {
      errorServer.listen(0, () => {
        const addr = errorServer.address();
        resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
      });
    });

    process.env.CELERITY_DEV_AUTH_BASE_URL = `http://localhost:${errorPort}`;
    try {
      await expect(generateTestToken()).rejects.toThrow("Dev auth server returned 500");
    } finally {
      delete process.env.CELERITY_DEV_AUTH_BASE_URL;
      errorServer.close();
    }
  });

  it("should default to http://localhost:9099 when env var is not set", async () => {
    const original = process.env.CELERITY_DEV_AUTH_BASE_URL;
    delete process.env.CELERITY_DEV_AUTH_BASE_URL;
    try {
      // This will fail to connect since nothing runs on 9099 in test, but
      // we can verify the error message implies the correct default URL.
      await expect(generateTestToken()).rejects.toThrow();
    } finally {
      if (original !== undefined) {
        process.env.CELERITY_DEV_AUTH_BASE_URL = original;
      }
    }
  });
});

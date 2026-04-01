import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { TestHttpClient, createTestClient } from "../src/http";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const route = `${req.method} ${req.url}`;

      switch (route) {
        case "GET /ok":
          res.writeHead(200, { "Content-Type": "application/json", "x-custom": "hello" });
          res.end(JSON.stringify({ message: "ok" }));
          break;
        case "POST /echo":
        case "PUT /echo":
        case "PATCH /echo":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(body);
          break;
        case "GET /text":
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("plain text response");
          break;
        case "GET /not-found":
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
          break;
        case "GET /auth":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ auth: req.headers.authorization ?? null }));
          break;
        default:
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

describe("TestHttpClient", () => {
  it("should make GET requests", async () => {
    const client = new TestHttpClient(`http://localhost:${port}`);
    const res = await client.get("/ok").end();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "ok" });
  });

  it("should make POST requests with JSON body", async () => {
    const client = new TestHttpClient(`http://localhost:${port}`);
    const res = await client.post("/echo").send({ hello: "world" }).end();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hello: "world" });
  });

  it("should make PUT requests", async () => {
    const client = new TestHttpClient(`http://localhost:${port}`);
    const res = await client.put("/echo").send({ updated: true }).end();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: true });
  });

  it("should make PATCH requests", async () => {
    const client = new TestHttpClient(`http://localhost:${port}`);
    const res = await client.patch("/echo").send({ patched: true }).end();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patched: true });
  });

  it("should make DELETE requests", async () => {
    const client = new TestHttpClient(`http://localhost:${port}`);
    const res = await client.delete("/not-found").end();
    expect(res.status).toBe(404);
  });
});

describe("TestRequest", () => {
  describe("#auth()", () => {
    it("should set the Authorization bearer header", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const res = await client.get("/auth").auth("my-token").end();
      expect(res.body).toEqual({ auth: "Bearer my-token" });
    });
  });

  describe("#set()", () => {
    it("should set custom headers", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const res = await client.get("/auth").set("Authorization", "Custom value").end();
      expect(res.body).toEqual({ auth: "Custom value" });
    });
  });

  describe("#expect() status", () => {
    it("should pass when status matches", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await client.get("/ok").expect(200).end();
    });

    it("should throw when status does not match", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await expect(client.get("/ok").expect(404).end()).rejects.toThrow(
        "Expected status 404 but got 200",
      );
    });
  });

  describe("#expect() body", () => {
    it("should pass when body matches object", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await client.get("/ok").expect({ message: "ok" }).end();
    });

    it("should throw when body does not match", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await expect(client.get("/ok").expect({ message: "wrong" }).end()).rejects.toThrow(
        "Expected body",
      );
    });

    it("should support body assertion function", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const assertFn = vi.fn((body: unknown) => {
        expect(body).toEqual({ message: "ok" });
      });
      await client.get("/ok").expect(assertFn).end();
      expect(assertFn).toHaveBeenCalledOnce();
    });
  });

  describe("#expect() header", () => {
    it("should pass when header matches string", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await client.get("/ok").expect("x-custom", "hello").end();
    });

    it("should throw when header does not match string", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await expect(client.get("/ok").expect("x-custom", "wrong").end()).rejects.toThrow(
        'Expected header "x-custom"',
      );
    });

    it("should pass when header matches regex", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await client.get("/ok").expect("x-custom", /hell/).end();
    });

    it("should throw when header does not match regex", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      await expect(client.get("/ok").expect("x-custom", /nope/).end()).rejects.toThrow(
        'Expected header "x-custom" to match',
      );
    });
  });

  describe("#then()", () => {
    it("should allow awaiting the request directly", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const res = await client.get("/ok").expect(200);
      expect(res.status).toBe(200);
    });
  });

  describe("text response handling", () => {
    it("should return text body when response is not JSON", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const res = await client.get("/text").end();
      expect(res.body).toBe("plain text response");
      expect(res.text).toBe("plain text response");
    });
  });

  describe("chaining", () => {
    it("should support chaining multiple expectations", async () => {
      const client = new TestHttpClient(`http://localhost:${port}`);
      const res = await client
        .get("/ok")
        .expect(200)
        .expect({ message: "ok" })
        .expect("x-custom", "hello")
        .end();
      expect(res.status).toBe(200);
    });
  });
});

describe("createTestClient", () => {
  it("should create a client with the provided baseUrl", () => {
    const client = createTestClient({ baseUrl: "http://custom:1234" });
    expect(client).toBeInstanceOf(TestHttpClient);
  });

  it("should read CELERITY_TEST_BASE_URL env var as fallback", () => {
    const original = process.env.CELERITY_TEST_BASE_URL;
    process.env.CELERITY_TEST_BASE_URL = "http://env-url:5555";
    try {
      const client = createTestClient();
      expect(client).toBeInstanceOf(TestHttpClient);
    } finally {
      if (original === undefined) {
        delete process.env.CELERITY_TEST_BASE_URL;
      } else {
        process.env.CELERITY_TEST_BASE_URL = original;
      }
    }
  });

  it("should default to http://localhost:8081", () => {
    const original = process.env.CELERITY_TEST_BASE_URL;
    delete process.env.CELERITY_TEST_BASE_URL;
    try {
      const client = createTestClient();
      expect(client).toBeInstanceOf(TestHttpClient);
    } finally {
      if (original !== undefined) {
        process.env.CELERITY_TEST_BASE_URL = original;
      }
    }
  });
});

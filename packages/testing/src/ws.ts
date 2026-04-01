/**
 * Sequential WebSocket test client for Celerity applications.
 *
 * Wraps `@celerity-sdk/ws-client` to provide an `await`-based message flow.
 * All runtime protocol concerns (heartbeat, capabilities negotiation, ack,
 * dedup) are handled by the underlying client — only application messages
 * surface to tests.
 *
 * Configuration is derived from the blueprint and `celerity dev test` env vars.
 */

import { generateTestToken, type GenerateTestTokenOptions } from "./jwt";
import { loadWebSocketConfig } from "./blueprint";

type AuthConfig = {
  strategy: "authMessage" | "connect";
  token: string | (() => Promise<string>);
};

type WsClientModule = typeof import("@celerity-sdk/ws-client");
type Unsubscribe = () => void;

/** Structural type for the subset of CelerityWsClient used by TestWsClient. */
type WsClient = {
  on(event: string, handler: (...args: never[]) => void): Unsubscribe;
  connect(): Promise<void>;
  send(route: string, data: unknown): string;
  disconnect(): Promise<void>;
  destroy(): void;
  state: string;
};

export type CreateTestWsClientOptions = {
  /** Override the WebSocket URL. Derived from CELERITY_TEST_BASE_URL + blueprint basePath if omitted. */
  url?: string;
  /** Token for auth. String = use directly. Object = options for generateTestToken(). Omit to skip auth entirely. */
  token?: string | GenerateTestTokenOptions | null;
  /** Path to the blueprint file (auto-detected if omitted). */
  blueprintPath?: string;
  /** Additional config passed through to createWsClient. */
  clientConfig?: Record<string, unknown>;
};

export type ReceivedMessage = {
  route: string;
  data: unknown;
};

/**
 * Create a sequential WebSocket test client.
 *
 * Config is derived from the blueprint (base path, route key, auth strategy)
 * and `CELERITY_TEST_BASE_URL`. Pass `token: null` to skip authentication
 * (useful for testing unauthenticated rejection).
 *
 * @example
 * ```typescript
 * const ws = await createTestWsClient();
 * await ws.connect();
 *
 * ws.send("notifications", { action: "subscribe", channels: ["alerts"] });
 * const msg = await ws.nextMessage();
 * expect(msg.data).toEqual({ subscribed: ["alerts"] });
 *
 * await ws.disconnect();
 * ```
 *
 * @example Skip auth for testing unauthenticated scenarios:
 * ```typescript
 * const ws = await createTestWsClient({ token: null });
 * ```
 */
export async function createTestWsClient(
  options?: CreateTestWsClientOptions,
): Promise<TestWsClient> {
  const wsModule: WsClientModule = await import("@celerity-sdk/ws-client");

  const wsConfig = loadWebSocketConfig(options?.blueprintPath);
  const basePath = wsConfig?.basePath ?? "/ws";
  const routeKey = wsConfig?.routeKey ?? "action";
  const authStrategy = wsConfig?.authStrategy ?? "authMessage";

  const baseUrl = process.env.CELERITY_TEST_BASE_URL ?? "http://localhost:8081";
  const wsUrl = options?.url ?? baseUrl.replace(/^http/, "ws") + basePath;

  const authConfig = resolveAuthConfig(options?.token, authStrategy);

  const innerClient = await wsModule.createWsClient({
    url: wsUrl,
    routeKey,
    auth: authConfig,
    ...options?.clientConfig,
  });

  return new TestWsClient(innerClient);
}

/**
 * Test-oriented WebSocket client with sequential `await`-based message flow.
 *
 * The underlying `CelerityWsClient` handles all runtime protocol messages
 * (heartbeat, capabilities, auth, ack, dedup) transparently.
 * Only application-level messages are surfaced via `nextMessage()`.
 */
export class TestWsClient {
  private inner: WsClient;
  private messageBuffer: ReceivedMessage[] = [];
  private waiters: Array<{
    resolve: (msg: ReceivedMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private cleanups: Unsubscribe[] = [];
  private connectionError: Error | null = null;

  constructor(inner: WsClient) {
    this.inner = inner;
  }

  /**
   * Connect and complete the full handshake (including auth if configured).
   *
   * After connect resolves, `nextMessage()` will receive application messages.
   * If auth fails or connection is rejected, the promise rejects with the error.
   */
  async connect(): Promise<void> {
    // Listen for errors and propagate to any pending nextMessage() waiters
    const errorUnsub = this.inner.on("error", (err: Error) => {
      this.connectionError = err;
      this.rejectAllWaiters(err);
    });
    this.cleanups.push(errorUnsub);

    const disconnectUnsub = this.inner.on("disconnected", () => {
      this.rejectAllWaiters(new Error("WebSocket disconnected while waiting for message"));
    });
    this.cleanups.push(disconnectUnsub);

    // Intercept all routed application messages via wildcard route ("*")
    const messageUnsub = this.inner.on("*", (data: unknown, meta: unknown) => {
      const route = (meta as { route?: string } | undefined)?.route ?? "";
      const msg: ReceivedMessage = { route, data };

      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift()!;
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.messageBuffer.push(msg);
      }
    });
    this.cleanups.push(messageUnsub);

    await this.inner.connect();
  }

  /** Send a routed application message. Returns the message ID. */
  send(route: string, data: unknown): string {
    return this.inner.send(route, data);
  }

  /**
   * Wait for the next application message from the server.
   *
   * If a message is already buffered, resolves immediately.
   * Otherwise blocks until a message arrives, the connection closes, or timeout expires.
   *
   * @param timeout - Maximum wait time in ms. Default: 5000.
   */
  nextMessage(timeout = 5000): Promise<ReceivedMessage> {
    if (this.connectionError) {
      return Promise.reject(this.connectionError);
    }

    if (this.messageBuffer.length > 0) {
      return Promise.resolve(this.messageBuffer.shift()!);
    }

    return new Promise<ReceivedMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`nextMessage timed out after ${timeout}ms`));
      }, timeout);

      this.waiters.push({ resolve, reject, timer });
    });
  }

  /** Disconnect and clean up all listeners and pending waiters. */
  async disconnect(): Promise<void> {
    this.cleanup();
    await this.inner.disconnect();
  }

  /** Force destroy without waiting for close handshake. */
  destroy(): void {
    this.cleanup();
    this.inner.destroy();
  }

  /** Current connection state. */
  get state(): string {
    return this.inner.state;
  }

  /** Access the underlying CelerityWsClient for advanced usage. */
  get raw(): WsClient {
    return this.inner;
  }

  private cleanup(): void {
    for (const unsub of this.cleanups) unsub();
    this.cleanups = [];
    this.rejectAllWaiters(new Error("WebSocket client closed"));
    this.messageBuffer = [];
  }

  private rejectAllWaiters(err: Error): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.waiters = [];
  }
}

function resolveAuthConfig(
  token: string | GenerateTestTokenOptions | null | undefined,
  authStrategy: "authMessage" | "connect",
): AuthConfig | undefined {
  if (token === null) return undefined;
  if (typeof token === "string") return { strategy: authStrategy, token };

  const tokenOpts = token ?? { sub: "test-user", claims: { roles: ["admin"] } };
  return { strategy: authStrategy, token: () => generateTestToken(tokenOpts) };
}

import "reflect-metadata";
import type {
  Type,
  InjectionToken,
  Provider,
  HttpRequest,
  HttpResponse,
  WebSocketMessage,
  ConsumerEventInput,
  ScheduleEventInput,
  EventResult,
} from "@celerity-sdk/types";
import type { Container, HandlerRegistry, TestingApplication } from "@celerity-sdk/core";
import { CelerityFactory } from "@celerity-sdk/core";
import { discoverResourceTokens } from "./discovery";
import { loadBlueprintResources } from "./blueprint";
import type { MockFn } from "./mocks";
import { createMocksForTokens } from "./mocks";
import { createRealClients } from "./clients";

export type CreateTestAppOptions = {
  /** The module under test. Its providers, controllers, guards, and imports are bootstrapped. */
  module: Type;
  /** When true, creates real resource clients from env vars. When false (default), creates mocks. */
  integration?: boolean;
  /** Additional providers to register in the test module. */
  providers?: Array<Type | (Provider & { provide: InjectionToken })>;
  /** Additional controllers to register. */
  controllers?: Type[];
  /** Additional guards to register. */
  guards?: Type[];
  /** Explicit overrides registered last — takes precedence over auto-discovery. */
  overrides?: Record<symbol, unknown>;
  /** Path to the blueprint file. Auto-detected if omitted. */
  blueprintPath?: string;
};

/**
 * TestApp wraps TestingApplication with mock access and lifecycle management.
 */
export class TestApp {
  private mocks: Map<symbol, Record<string, MockFn>>;
  private closeables: Array<{ close?(): void | Promise<void> }>;
  private inner: TestingApplication;

  constructor(
    inner: TestingApplication,
    mocks: Map<symbol, Record<string, MockFn>>,
    closeables: Array<{ close?(): void | Promise<void> }>,
  ) {
    this.inner = inner;
    this.mocks = mocks;
    this.closeables = closeables;
  }

  // -- Delegate to TestingApplication --

  injectHttp(request: HttpRequest): Promise<HttpResponse> {
    return this.inner.injectHttp(request);
  }

  injectWebSocket(route: string, message: WebSocketMessage): Promise<void> {
    return this.inner.injectWebSocket(route, message);
  }

  injectConsumer(handlerTag: string, event: ConsumerEventInput): Promise<EventResult> {
    return this.inner.injectConsumer(handlerTag, event);
  }

  injectSchedule(handlerTag: string, event: ScheduleEventInput): Promise<EventResult> {
    return this.inner.injectSchedule(handlerTag, event);
  }

  injectCustom(name: string, payload?: unknown): Promise<unknown> {
    return this.inner.injectCustom(name, payload);
  }

  getContainer(): Container {
    return this.inner.getContainer();
  }

  getRegistry(): HandlerRegistry {
    return this.inner.getRegistry();
  }

  // -- Mock access (unit mode) --

  /** Retrieve the auto-generated mock for a resource token. */
  getMock<T>(token: symbol): T {
    const mock = this.mocks.get(token);
    if (!mock) {
      throw new Error(`No mock found for token: ${String(token)}`);
    }
    return mock as T;
  }

  /** Get the mock Datastore for a named resource (e.g., "usersDatastore"). */
  getDatastoreMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:datastore:${name}`));
  }

  /** Get the mock Topic for a named resource. */
  getTopicMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:topic:${name}`));
  }

  /** Get the mock Queue for a named resource. */
  getQueueMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:queue:${name}`));
  }

  /** Get the mock Cache for a named resource. */
  getCacheMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:cache:${name}`));
  }

  /** Get the mock Bucket for a named resource. */
  getBucketMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:bucket:${name}`));
  }

  /** Get the mock Config namespace for a named resource. */
  getConfigMock(name: string): Record<string, MockFn> {
    return this.getMock(Symbol.for(`celerity:config:${name}`));
  }

  // -- Lifecycle --

  /** Close all real resource clients (integration mode). No-op in unit mode. */
  async close(): Promise<void> {
    for (const client of this.closeables) {
      try {
        await client.close?.();
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

/**
 * Create a test application for unit or integration testing.
 *
 * - `integration: false` (default): Auto-discovers resource dependencies from the
 *   module graph and creates mock objects for each. Access mocks via `app.getDatastoreMock()`, etc.
 *
 * - `integration: true`: Creates real resource clients from env vars provided by
 *   `celerity dev test`. Physical resource names are resolved from the blueprint.
 *
 * In both modes, custom providers/controllers/guards can be added, and explicit
 * overrides take precedence over auto-discovered resources.
 */
export async function createTestApp(options: CreateTestAppOptions): Promise<TestApp> {
  const { providers = [], controllers = [], guards = [], overrides = {} } = options;

  const { inner, mocks, closeables } = await setupResources(options);
  const container = inner.getContainer();

  for (const provider of providers) {
    if (typeof provider === "function") {
      container.registerClass(provider);
    } else {
      container.register(provider.provide, provider);
    }
  }

  for (const ctrl of controllers) {
    if (!container.has(ctrl)) container.registerClass(ctrl);
  }

  for (const guard of guards) {
    if (!container.has(guard)) container.registerClass(guard);
  }

  applyOverrides(container, overrides);

  return new TestApp(inner, mocks, closeables);
}

async function setupResources(options: CreateTestAppOptions): Promise<{
  inner: TestingApplication;
  mocks: Map<symbol, Record<string, MockFn>>;
  closeables: Array<{ close?(): void | Promise<void> }>;
}> {
  const { module: rootModule, integration = false, blueprintPath } = options;

  const resourceInfos = discoverResourceTokens(rootModule);

  let mocks = new Map<symbol, Record<string, MockFn>>();
  let closeables: Array<{ close?(): void | Promise<void> }> = [];
  let resourceHandles = new Map<symbol, unknown>();

  if (integration) {
    const blueprintResources = loadBlueprintResources(blueprintPath);
    const result = await createRealClients(resourceInfos, blueprintResources);
    resourceHandles = result.handles;
    closeables = result.closeables;
  } else {
    mocks = createMocksForTokens(resourceInfos);
    for (const [token, mock] of mocks) {
      resourceHandles.set(token, mock);
    }
  }

  const inner = await CelerityFactory.createTestingApp(rootModule, {
    systemLayers: [],
  });

  const container = inner.getContainer();
  for (const [token, handle] of resourceHandles) {
    container.registerValue(token, handle);
  }

  return { inner, mocks, closeables };
}

function applyOverrides(container: Container, overrides: Record<symbol, unknown>): void {
  for (const [token, value] of Object.entries(overrides)) {
    container.registerValue(token as unknown as symbol, value);
  }
  for (const sym of Object.getOwnPropertySymbols(overrides)) {
    container.registerValue(sym, (overrides as Record<symbol, unknown>)[sym]);
  }
}

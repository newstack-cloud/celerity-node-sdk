# @celerity-sdk/testing

Testing utilities for Celerity applications. Provides a test app factory, mock resource factories, JWT generation, HTTP/WebSocket test clients, and integration test helpers.

## Install

```bash
npm install -D @celerity-sdk/testing
# or
pnpm add -D @celerity-sdk/testing
# or
yarn add -D @celerity-sdk/testing
```

## Running Tests

API and integration tests are designed to run with the `celerity dev test` commands, which start your application in the Celerity runtime with local infrastructure and set the environment variables that the test helpers read. This means `createTestClient`, `createTestWsClient`, `generateTestToken`, and `createTestApp` with `integration: true` all work out of the box with zero configuration.

```bash
# Run API tests against the local runtime
celerity dev test --suite api

# Run integration tests with local infrastructure
celerity dev test --suite integration
```

You can override the defaults with environment variables (`CELERITY_TEST_BASE_URL`, `CELERITY_DEV_AUTH_BASE_URL`, etc.) if you need to point at a different endpoint.

## Quick Start

### Unit Testing

```typescript
import { createTestApp, TestApp } from "@celerity-sdk/testing";
import { AppModule } from "../src/app.module";

describe("OrderController", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp({ module: AppModule });
  });

  afterAll(() => app.close());

  it("should create an order", async () => {
    const datastore = app.getDatastoreMock("ordersDatastore");
    datastore.putItem.mockResolvedValue(undefined);

    const res = await app.injectHttp({
      method: "POST",
      path: "/orders",
      body: { item: "widget", qty: 3 },
    });

    expect(res.statusCode).toBe(201);
    expect(datastore.putItem).toHaveBeenCalled();
  });
});
```

### Integration Testing

When `integration: true`, the test app auto-discovers resource tokens from the module graph and creates real resource clients using local endpoints. Resolve services from the DI container and test against real infrastructure:

```typescript
import { createTestApp, type TestApp } from "@celerity-sdk/testing";
import { TasksModule } from "../../src/tasks/tasks-module.js";
import { TasksService } from "../../src/tasks/tasks-service.js";

describe("TasksService (integration)", () => {
  let app: TestApp;
  let service: TasksService;

  beforeAll(async () => {
    app = await createTestApp({ module: TasksModule, integration: true });
    service = await app.getContainer().resolve(TasksService);
  });

  afterAll(() => app.close());

  it("creates a task with status pending", async () => {
    const task = await service.create({
      title: "Integration test task",
      assigneeId: "user-001",
    });

    expect(task.taskId).toBeDefined();
    expect(task.status).toBe("pending");
    expect(task.assigneeId).toBe("user-001");
  });

  it("finds task by ID", async () => {
    const task = await service.create({ title: "Find by ID task" });
    const found = await service.findById(task.taskId);

    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find by ID task");
  });
});
```

### API Testing

`createTestClient` automatically connects to the application endpoint managed by `celerity dev test --suite api`, no URL configuration needed. Pair it with `generateTestToken` to test authenticated endpoints:

```typescript
import {
  createTestClient,
  generateTestToken,
  type TestHttpClient,
} from "@celerity-sdk/testing";

describe("Users API", () => {
  let client: TestHttpClient;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    client = createTestClient();
    adminToken = await generateTestToken({ sub: "admin-1", claims: { roles: ["admin"] } });
    userToken = await generateTestToken({ sub: "user-1", claims: { roles: ["viewer"] } });
  });

  it("GET /users requires auth (401)", async () => {
    await client.get("/users").expect(401);
  });

  it("GET /users returns list with valid token", async () => {
    const resp = await client.get("/users").auth(adminToken).expect(200);
    expect(Array.isArray(resp.body)).toBe(true);
  });

  it("POST /users requires admin (403 with viewer token)", async () => {
    await client
      .post("/users")
      .auth(userToken)
      .send({ name: "Forbidden User", email: "forbidden@example.com" })
      .expect(403);
  });

  it("POST /users creates user with admin token", async () => {
    const resp = await client
      .post<{ userId: string; name: string }>("/users")
      .auth(adminToken)
      .send({ name: "New User", email: "new@example.com" })
      .expect(200);

    expect(resp.body.userId).toBeDefined();
    expect(resp.body.name).toBe("New User");
  });
});
```

### WebSocket Testing

`createTestWsClient` automatically derives the WebSocket endpoint and route configuration from your application blueprint, no manual URL or path setup required:

```typescript
import { createTestWsClient, type TestWsClient } from "@celerity-sdk/testing";

describe("WebSocket API", () => {
  let ws: TestWsClient;

  afterEach(() => ws?.destroy());

  it("connects and authenticates", async () => {
    ws = await createTestWsClient();
    await ws.connect();
    expect(ws.state).toBe("ready");
  });

  it("subscribes to channels", async () => {
    ws = await createTestWsClient();
    await ws.connect();

    ws.send("notifications", {
      action: "subscribe",
      channels: ["alerts", "updates"],
    });

    const msg = await ws.nextMessage(10_000);
    expect(msg.route).toBe("notifications");
  });

  it("rejects unauthenticated connections", async () => {
    ws = await createTestWsClient({ token: null });
    try {
      await ws.connect();
    } catch {
      // Connection rejected, expected for connect-strategy auth
    }
  });
});
```

## API

### `createTestApp(options)`

Creates a test application for unit or integration testing.

| Option | Type | Default | Description |
|---|---|---|---|
| `module` | `Type` | *(required)* | Root module to bootstrap |
| `integration` | `boolean` | `false` | Use real resource clients instead of mocks |
| `providers` | `Provider[]` | `[]` | Additional providers to register |
| `controllers` | `Type[]` | `[]` | Additional controllers |
| `guards` | `Type[]` | `[]` | Additional guards |
| `overrides` | `Provider[]` | `[]` | Override providers (registered last, highest priority) |
| `blueprintPath` | `string` | auto-detected | Path to `app.blueprint.yaml` |

Returns a `TestApp` with these methods:

| Method | Description |
|---|---|
| `injectHttp(request)` | Inject an HTTP request |
| `injectWebSocket(route, message)` | Inject a WebSocket message |
| `injectConsumer(handlerTag, event)` | Inject a consumer event |
| `injectSchedule(handlerTag, event)` | Inject a schedule event |
| `injectCustom(name, payload?)` | Inject a custom event |
| `getContainer()` | Access the DI container |
| `getRegistry()` | Access the handler registry |
| `getMock<T>(token)` | Get mock by token symbol |
| `getDatastoreMock(name)` | Get mock datastore by resource name |
| `getTopicMock(name)` | Get mock topic by resource name |
| `getQueueMock(name)` | Get mock queue by resource name |
| `getCacheMock(name)` | Get mock cache by resource name |
| `getBucketMock(name)` | Get mock bucket by resource name |
| `getConfigMock(name)` | Get mock config namespace by resource name |
| `close()` | Close all real clients (integration mode) |

### `createTestClient(options?)`

HTTP test client with chainable assertions, similar to supertest.

```typescript
import { createTestClient } from "@celerity-sdk/testing";

const client = createTestClient(); // reads CELERITY_TEST_BASE_URL

const res = await client
  .get("/orders/123")
  .auth(token)
  .expect(200)
  .expect("content-type", /json/)
  .end();

expect(res.body.id).toBe("123");
```

| Method | Description |
|---|---|
| `get(path)`, `post(path)`, `put(path)`, `patch(path)`, `delete(path)` | Start a request |
| `.auth(token)` | Set `Authorization: Bearer <token>` |
| `.set(header, value)` | Set a request header |
| `.send(body)` | Set JSON request body |
| `.expect(status)` | Assert status code |
| `.expect(header, value)` | Assert response header (string or RegExp) |
| `.expect(body)` | Assert response body equality |
| `.expect(fn)` | Assert with custom function |
| `.end()` | Execute request and run assertions |

Requests are also `thenable` so you can `await` them directly without calling `.end()`.

### `createTestWsClient(options?)`

WebSocket test client for sequential message flow testing.

```typescript
import { createTestWsClient, generateTestToken } from "@celerity-sdk/testing";

const ws = await createTestWsClient({ token: { sub: "user-1" } });
await ws.connect();

ws.send("placeOrder", { item: "widget" });
const reply = await ws.nextMessage();

expect(reply.route).toBe("orderConfirmed");
await ws.disconnect();
```

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | auto-derived from blueprint | WebSocket endpoint URL |
| `token` | `string \| GenerateTestTokenOptions \| null` | `{}` | Auth token. Pass `null` to skip auth. |
| `blueprintPath` | `string` | auto-detected | Path to blueprint file |
| `clientConfig` | `object` | `{}` | Additional config for the underlying WS client |

### `generateTestToken(options?)`

Generates an RS256-signed JWT via the local dev auth server.

```typescript
import { generateTestToken } from "@celerity-sdk/testing";

const token = await generateTestToken({
  sub: "user-42",
  claims: { role: "admin", org_id: "org-1" },
  expiresIn: "2h",
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `sub` | `string` | `"test-user"` | Subject claim |
| `claims` | `Record<string, unknown>` | `{}` | Additional JWT claims |
| `expiresIn` | `string` | `"1h"` | Token lifetime (Go-style duration) |

Reads `CELERITY_DEV_AUTH_BASE_URL` (default: `http://localhost:9099`).

### `waitFor(predicate, options?)`

Polls a predicate until it returns `true` or the timeout expires.

```typescript
import { waitFor } from "@celerity-sdk/testing";

await waitFor(async () => {
  const item = await datastore.getItem({ id: "order-1" });
  return item !== null;
}, { timeout: 10_000, interval: 200 });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `timeout` | `number` | `5000` | Timeout in milliseconds |
| `interval` | `number` | `100` | Poll interval in milliseconds |

### `discoverResourceTokens(rootModule)`

Statically walks the module graph and extracts all resource DI tokens from constructor parameters without instantiating anything.

### `createRealClients(tokens, blueprintResources)`

Creates real resource client handles for integration testing. Dynamically imports only the SDK packages actually needed.

### Mock Factories

`createResourceMock(resourceType)` creates a mock object with all interface methods stubbed. Used internally by `createTestApp`, but available for standalone use:

```typescript
import { createResourceMock } from "@celerity-sdk/testing";

const mock = createResourceMock("datastore");
// mock.getItem, mock.putItem, mock.query, ...
```

### Re-exports

The following are re-exported from `@celerity-sdk/core` for convenience:

- `mockRequest` creates a mock `HttpRequest`
- `mockWebSocketMessage` creates a mock `WebSocketMessage`
- `mockConsumerEvent` creates a mock `ConsumerEventInput`
- `mockScheduleEvent` creates a mock `ScheduleEventInput`

## Optional Peer Dependencies

Install only the SDK packages your module actually uses:

```bash
# Example: app uses datastore + topic
pnpm add -D @celerity-sdk/datastore @celerity-sdk/topic
```

| Package | Required for |
|---|---|
| `@celerity-sdk/datastore` | Datastore mocks / integration clients |
| `@celerity-sdk/bucket` | Bucket mocks / integration clients |
| `@celerity-sdk/cache` | Cache mocks / integration clients |
| `@celerity-sdk/queue` | Queue mocks / integration clients |
| `@celerity-sdk/topic` | Topic mocks / integration clients |
| `@celerity-sdk/sql-database` | SQL database integration clients |
| `@celerity-sdk/ws-client` | WebSocket test client |
| `reflect-metadata` | Decorator metadata resolution |

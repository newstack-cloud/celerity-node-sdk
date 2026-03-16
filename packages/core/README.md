# @celerity-sdk/core

Core SDK for building Celerity applications — decorators, dependency injection, layers, guards, handler pipelines, and the application factory.

## Installation

```bash
pnpm add @celerity-sdk/core
```

Requires `reflect-metadata` and `@celerity-sdk/types` as peer dependencies.

## Handler Types

The core package supports five handler types, each with class-based (decorator-first) and function-based (blueprint-first) styles.

### HTTP

```typescript
// Class-based
@Controller("/orders")
class OrdersHandler {
  @Get("/{orderId}")
  getOrder(@Param("orderId") id: string) {
    return { id };
  }

  @Post("/")
  createOrder(@Body() body: unknown) {
    return { created: true };
  }
}

// Function-based
const getHealth = httpGet("/health", (req, ctx) => ({ status: "ok" }));
const handler = createHttpHandler({}, (req, ctx) => ({ ok: true }));
```

### WebSocket

```typescript
// Class-based
@WebSocketController()
class ChatHandler {
  @OnConnect()
  connect(@ConnectionId() connId: string) {}

  @OnMessage()
  message(@ConnectionId() connId: string, @MessageBody() body: unknown) {}

  @OnDisconnect()
  disconnect(@ConnectionId() connId: string) {}
}

// Function-based
const wsHandler = createWebSocketHandler({ route: "$default" }, (msg, ctx) => {});
```

### Consumer

```typescript
// Class-based
@Consumer("ordersConsumer")
class OrderConsumer {
  @MessageHandler()
  async process(
    @Messages(OrderSchema) messages: ValidatedConsumerMessage<Order>[],
  ): Promise<EventResult> {
    return { success: true };
  }
}

// Function-based
const consumer = createConsumerHandler(
  { messageSchema: OrderSchema },
  async (messages, ctx) => ({ success: true }),
);
```

### Schedule

```typescript
// Class-based — cross-cutting, works on any controller type
@Controller()
class MaintenanceTasks {
  @ScheduleHandler("dailyCleanup")
  async cleanup(@ScheduleInput() input: unknown): Promise<EventResult> {
    return { success: true };
  }

  @ScheduleHandler("rate(1 hour)")
  async sync(): Promise<EventResult> {
    return { success: true };
  }
}

// Function-based
const scheduled = createScheduleHandler(
  { source: "dailyCleanup", schedule: "rate(1 day)" },
  async (event, ctx) => ({ success: true }),
);
```

### Custom / Invocable

```typescript
// Class-based
@Controller()
class Reports {
  @Invoke("generateReport")
  async generate(@Payload() data: unknown) {
    return { reportId: "r-1" };
  }
}

// Function-based
const custom = createCustomHandler(
  { name: "generateReport" },
  async (payload, ctx) => ({ reportId: "r-1" }),
);
```

## Decorators

### Class Decorators

| Decorator | Purpose |
|---|---|
| `@Controller(prefix?)` | HTTP handler controller with optional path prefix |
| `@WebSocketController()` | WebSocket handler controller |
| `@Consumer(source?)` | Consumer controller with optional blueprint resource name |
| `@Injectable()` | Marks a class for DI registration |
| `@Guard(name)` | Declares a class as a named custom guard |
| `@Module(metadata)` | Defines a module with controllers, providers, imports, and exports |

### HTTP Method Decorators

| Decorator | Purpose |
|---|---|
| `@Get(path?)`, `@Post(path?)`, `@Put(path?)`, `@Patch(path?)`, `@Delete(path?)`, `@Head(path?)`, `@Options(path?)` | HTTP method routing on controller methods |

### WebSocket Event Decorators

| Decorator | Purpose |
|---|---|
| `@OnConnect()` | Handles `$connect` events |
| `@OnMessage(route?)` | Handles messages (custom route or `$default`) |
| `@OnDisconnect()` | Handles `$disconnect` events |

### Other Handler Decorators

| Decorator | Purpose |
|---|---|
| `@MessageHandler(route?)` | Consumer message handler with optional routing key |
| `@ScheduleHandler(arg?)` | Schedule handler — string or `{ source?, schedule? }` |
| `@Invoke(name)` | Custom invocable handler |

### Cross-Cutting Decorators

| Decorator | Purpose |
|---|---|
| `@ProtectedBy(...guards)` | Declares guard requirements (class or method level) |
| `@Public()` | Opts a method out of guard protection |
| `@UseLayer(...layers)` / `@UseLayers(layers)` | Attaches layers to handler or controller |
| `@UseResource(...names)` / `@UseResources(names)` | Declares blueprint resource dependencies |
| `@SetMetadata(key, value)` / `@Action(name)` | Attaches custom metadata |
| `@Inject(token)` | Overrides DI token for a constructor parameter |

### Parameter Decorators

| Handler Type | Decorators |
|---|---|
| HTTP | `@Body(schema?)`, `@Query(key?, schema?)`, `@Param(key?, schema?)`, `@Headers(key?, schema?)`, `@Auth()`, `@Token()`, `@Req()`, `@Cookies(key?)`, `@RequestId()` |
| WebSocket | `@ConnectionId()`, `@MessageBody(schema?)`, `@MessageId()`, `@RequestContext()`, `@EventType()` |
| Consumer | `@Messages(schema?)`, `@EventInput()`, `@Vendor()`, `@ConsumerTraceContext()` |
| Schedule | `@ScheduleInput(schema?)`, `@ScheduleId()`, `@ScheduleExpression()`, `@ScheduleEventInputParam()` |
| Custom | `@Payload(schema?)`, `@InvokeContext()` |

Parameter decorators that accept a `schema` use any Zod-compatible `Schema<T>` (`{ parse(data): T }`) for automatic validation.

## Dependency Injection

The DI container supports class, factory, and value providers with automatic constructor injection, lazy resolution, and circular dependency detection.

```typescript
@Injectable()
class OrderService {
  constructor(private db: DatabaseClient) {}
}

@Module({
  providers: [
    OrderService,
    { provide: DB_TOKEN, useFactory: () => new DatabaseClient(), onClose: (db) => db.close() },
  ],
  controllers: [OrdersHandler],
})
class AppModule {}
```

Provider types:

| Type | Registration |
|---|---|
| Class | `@Injectable()` class or `{ provide: token, useClass: MyClass }` |
| Factory | `{ provide: token, useFactory: (...deps) => value, inject?: [tokens] }` |
| Value | `{ provide: token, useValue: value }` |

All providers support an optional `onClose` hook for shutdown cleanup. The container also auto-detects `close`, `end`, `quit`, `disconnect`, and `destroy` methods.

## Layers

Layers are the cross-cutting mechanism (similar to middleware). They wrap handler execution in a composable pipeline.

```typescript
class LoggingLayer implements CelerityLayer {
  async handle(ctx: BaseHandlerContext, next: NextFunction) {
    console.log("before");
    const result = await next();
    console.log("after");
    return result;
  }
}

@Controller("/orders")
@UseLayer(LoggingLayer)
class OrdersHandler {
  @Post("/")
  @UseLayer(validate({ body: orderSchema }))
  createOrder(@Body() body: Order) {
    return { created: true };
  }
}
```

Layer execution order: `[system layers] → [app layers] → [class layers] → [method layers] → handler`.

The built-in `validate()` layer factory supports schema validation for all handler types:

```typescript
validate({ body: schema })            // HTTP body
validate({ query: schema })           // HTTP query
validate({ consumerMessage: schema })  // Consumer messages
validate({ scheduleInput: schema })    // Schedule input
validate({ customPayload: schema })    // Custom payload
validate({ wsMessageBody: schema })    // WebSocket message body
```

## Guards

Guards are declarative — they annotate handlers with protection requirements but do not execute in the Node.js process. Guard enforcement happens at the Rust runtime layer (containers) or API Gateway (serverless).

```typescript
@Guard("jwt")
class JwtGuard {
  async check(req: GuardHandlerRequest, ctx: GuardHandlerContext) {
    return { sub: "user-1", role: "admin" };
  }
}

@Controller("/api")
@ProtectedBy("jwt")
class ApiController {
  @Public()
  @Get("/health")
  health() { return { ok: true }; }

  @Get("/secret")
  secret(@Auth() claims: unknown) { return claims; }
}
```

Function-based guards: `createGuard({ name: "jwt" }, async (req, ctx) => claims)`.

## Application Factory

```typescript
import { CelerityFactory } from "@celerity-sdk/core";

// Auto-detects platform from CELERITY_RUNTIME_PLATFORM env var
const app = await CelerityFactory.create(AppModule);
```

Three application types:

| Class | Purpose |
|---|---|
| `CelerityApplication` | Runtime container application (default) |
| `ServerlessApplication` | Serverless adapter (created when `adapter` option provided) |
| `TestingApplication` | Lightweight app for unit testing handlers |

## Module System

Modules organize controllers, providers, and sub-modules into a dependency graph.

```typescript
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UserController, OrderController],
  providers: [UserService],
  functionHandlers: [healthCheck],
  guards: [JwtGuard],
})
class AppModule {}
```

## Testing

```typescript
import { CelerityFactory, mockRequest, mockConsumerEvent, mockScheduleEvent } from "@celerity-sdk/core";

const app = await CelerityFactory.createTestingApp(AppModule);

// HTTP
const response = await app.injectHttp(mockRequest({ method: "GET", path: "/orders/1" }));

// Consumer
const result = await app.injectConsumer("tag", mockConsumerEvent("tag"));

// Schedule
const result = await app.injectSchedule("tag", mockScheduleEvent("tag"));

// Custom
const result = await app.injectCustom("generateReport", { type: "monthly" });

// WebSocket
await app.injectWebSocket("$default", mockWebSocketMessage());
```

## Handler Resolution

When a handler is invoked by ID (e.g. from a blueprint's `spec.handler` field), the SDK resolves it using a multi-step strategy:

1. **Direct registry ID match** — looks up the handler by its explicit `id`.
2. **Module resolution fallback** — treats the ID as a module reference and dynamically imports it (e.g. `"handlers.hello"` → named export `hello` from module `handlers`).
3. **Path/method routing** — falls back to matching the incoming request's HTTP method and path against the registry.

## HTTP Exceptions

All extend `HttpException(statusCode, message, details?)` and are caught by the HTTP pipeline to return structured error responses:

| Exception | Status |
|---|---|
| `BadRequestException` | 400 |
| `UnauthorizedException` | 401 |
| `ForbiddenException` | 403 |
| `NotFoundException` | 404 |
| `MethodNotAllowedException` | 405 |
| `NotAcceptableException` | 406 |
| `ConflictException` | 409 |
| `GoneException` | 410 |
| `UnprocessableEntityException` | 422 |
| `TooManyRequestsException` | 429 |
| `InternalServerErrorException` | 500 |
| `NotImplementedException` | 501 |
| `BadGatewayException` | 502 |
| `ServiceUnavailableException` | 503 |
| `GatewayTimeoutException` | 504 |

## Advanced Exports

For adapter authors building custom serverless or runtime integrations:

| Export | Purpose |
|---|---|
| `HandlerRegistry` | Handler registry with route and ID-based lookups |
| `resolveHandlerByModuleRef` | Resolve a handler ID as a module reference via dynamic import |
| `executeHttpPipeline` | Execute the HTTP layer + handler pipeline |
| `executeWebSocketPipeline` | Execute the WebSocket pipeline |
| `executeConsumerPipeline` | Execute the consumer pipeline |
| `executeSchedulePipeline` | Execute the schedule pipeline |
| `executeCustomPipeline` | Execute the custom handler pipeline |
| `executeGuardPipeline` | Execute the guard pipeline |
| `bootstrapForRuntime` | Bootstrap for the Celerity runtime host |
| `mapRuntimeRequest` / `mapToRuntimeResponse` | Runtime request/response mappers |
| `mapWebSocketMessage` | Runtime WebSocket message mapper |
| `mapConsumerEventInput` | Runtime consumer event mapper |
| `mapScheduleEventInput` | Runtime schedule event mapper |
| `mapToNapiEventResult` | Runtime EventResult mapper |

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

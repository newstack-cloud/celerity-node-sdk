# @celerity-sdk/core

Core SDK for building Celerity applications — decorators, dependency injection, layers, guards, handler adapters, and the application factory.

## Installation

```bash
pnpm add @celerity-sdk/core
```

## Handler Styles

### Class-based (decorator-first)

Decorators drive routing. The class is registered as a controller and methods are decorated with HTTP method decorators.

```typescript
import { Controller, Get, Post, Body } from "@celerity-sdk/core";

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
```

### Function-based (blueprint-first or handler-first)

Lightweight handlers created with `createHttpHandler` or shorthand helpers. Routing can be defined inline or left to the blueprint.

```typescript
import { httpGet, createHttpHandler } from "@celerity-sdk/core";

// Handler-first: path and method defined in code
const getHealth = httpGet("/health", (req, ctx) => ({ status: "ok" }));

// Blueprint-first: path and method defined in the Celerity blueprint
const handler = createHttpHandler({}, (req, ctx) => ({ ok: true }));
```

## Decorators

| Decorator | Purpose |
|---|---|
| `@Controller(prefix)` | Marks a class as an HTTP handler controller |
| `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@Options` | HTTP method routing |
| `@Body`, `@Query`, `@Param`, `@Headers`, `@Auth`, `@Req`, `@Cookies`, `@RequestId` | Parameter extraction |
| `@Injectable()` | Marks a class for DI |
| `@Inject(token)` | Overrides constructor parameter injection token |
| `@Module(metadata)` | Defines a module with controllers, providers, imports, and exports |
| `@Guard(name)` | Declares a class as a named custom guard |
| `@ProtectedBy(...guards)` | Declares guard requirements (class or method level) |
| `@Public()` | Opts a method out of guard protection |
| `@UseLayer(layer)` / `@UseLayers(...layers)` | Attaches layers to a handler method |
| `@SetMetadata(key, value)` / `@Action(name)` | Attaches custom metadata |

## Dependency Injection

The DI container supports class, factory, and value providers with automatic constructor injection.

```typescript
@Injectable()
class OrderService {
  constructor(private db: DatabaseClient) {}
}

@Module({
  providers: [OrderService, DatabaseClient],
  controllers: [OrdersHandler],
})
class AppModule {}
```

## Layers

Layers are the cross-cutting mechanism (like middleware in Express). They wrap handler execution and can modify the request, response, or context.

```typescript
import { validate } from "@celerity-sdk/core";

@Controller("/orders")
class OrdersHandler {
  @Post("/")
  @UseLayer(validate({ body: orderSchema }))
  createOrder(@Body() body: Order) {
    return { created: true };
  }
}
```

## Application Factory

```typescript
import { CelerityFactory } from "@celerity-sdk/core";

const app = await CelerityFactory.create(AppModule);
// Auto-detects platform from CELERITY_RUNTIME_PLATFORM env var
```

## Guards

Guards are declarative — they annotate handlers with protection requirements but do not execute in the Node.js process. Guard enforcement happens at the Rust runtime layer (containers) or API Gateway (serverless).

## Testing

```typescript
import { TestingApplication, mockRequest } from "@celerity-sdk/core";

const app = new TestingApplication(AppModule);
const response = await app.handle(mockRequest({ method: "GET", path: "/orders/1" }));
```

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

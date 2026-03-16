# @celerity-sdk/cli

Build-time extraction tool for Celerity decorator metadata.

Scans a compiled Celerity application module and produces a JSON handler manifest describing all registered handlers, their routing annotations, guard declarations, custom metadata, and provider dependency graph. No classes are instantiated and no application code is executed.

## Installation

```bash
pnpm add @celerity-sdk/cli
```

## CLI Usage

```bash
celerity-extract --module ./dist/app.module.js
```

The Go-based Celerity CLI invokes this tool during the build phase to merge code-derived metadata with the Celerity blueprint.

## How It Works

1. **Module scan** (`scanModuleMetadata`) - walks the module tree (imports, controllers, function handlers, providers) using `reflect-metadata`, collecting all metadata without side effects.
2. **Serialization** (`serializeManifest`) - converts scanned metadata into a structured manifest with handler entries, annotations, and a dependency graph.
3. **Validation** (`validateScannedDependencies`) - checks that all provider dependencies are resolvable, reporting diagnostics for missing tokens.

## Supported Handler Types

The extraction tool produces manifest entries for both **class-based** (decorator-driven) and **function-based** (blueprint-driven) handlers across all handler types:

| Handler Type | Class Decorator | Function Type | Description |
|---|---|---|---|
| HTTP | `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` | `"http"` | REST API route handlers |
| WebSocket | `@OnConnect`, `@OnDisconnect`, `@OnMessage` | `"websocket"` | WebSocket event handlers |
| Consumer | `@ConsumerHandler` | `"consumer"` | Queue/topic message consumers |
| Schedule | `@ScheduleHandler` | `"schedule"` | Cron/rate scheduled handlers |
| Custom | `@Invoke` | `"custom"` | Direct invocation handlers |
| Guard | `@Guard` (class) or `defineGuard` (function) | — | Custom guard implementations |

### Cross-Cutting Decorators

`@ScheduleHandler` and `@Invoke` are cross-cutting — they can be applied to methods on any controller type (HTTP, WebSocket, or Consumer), producing additional manifest entries alongside the primary handler entry.

## Manifest Structure

The output conforms to `handler-manifest.v1.schema.json`:

```json
{
  "version": "1.0.0",
  "handlers": [
    {
      "resourceName": "ordersHandler_getOrder",
      "className": "OrdersHandler",
      "methodName": "getOrder",
      "handlerType": "http",
      "sourceFile": "/project/src/app.module.ts",
      "annotations": {
        "celerity.handler.http": true,
        "celerity.handler.http.method": "GET",
        "celerity.handler.http.path": "/orders/{orderId}",
        "celerity.handler.guard.protectedBy": ["jwt"]
      },
      "spec": {
        "handlerName": "OrdersHandler-getOrder",
        "codeLocation": "./src",
        "handler": "app.module.OrdersHandler.getOrder"
      }
    }
  ],
  "functionHandlers": [
    {
      "resourceName": "processOrder",
      "exportName": "processOrder",
      "handlerType": "consumer",
      "sourceFile": "/project/src/app.module.ts",
      "annotations": {
        "celerity.handler.consumer": true,
        "celerity.handler.consumer.route": "orders.*"
      },
      "spec": {
        "handlerName": "processOrder",
        "codeLocation": "./src",
        "handler": "app.module.processOrder"
      }
    }
  ],
  "guardHandlers": [
    {
      "resourceName": "rateLimiter_check",
      "guardName": "rateLimiter",
      "guardType": "class",
      "className": "RateLimiter",
      "sourceFile": "/project/src/app.module.ts",
      "annotations": {
        "celerity.handler.guard.custom": "rateLimiter"
      },
      "spec": {
        "handlerName": "RateLimiter-check",
        "codeLocation": "./src",
        "handler": "app.module.RateLimiter.check"
      }
    }
  ],
  "dependencyGraph": {
    "nodes": [
      {
        "token": "OrderService",
        "tokenType": "class",
        "providerType": "class",
        "dependencies": ["celerity:datastore:default"]
      }
    ]
  }
}
```

## Annotation Types

### HTTP

| Annotation | Source |
|---|---|
| `celerity.handler.http` | `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` |
| `celerity.handler.http.method` | HTTP method from decorator |
| `celerity.handler.http.path` | Full path (controller prefix + route) |

### WebSocket

| Annotation | Source |
|---|---|
| `celerity.handler.websocket` | `@OnConnect`, `@OnDisconnect`, `@OnMessage` |
| `celerity.handler.websocket.route` | WebSocket route key |
| `celerity.handler.websocket.eventType` | `connect`, `disconnect`, or `message` |

### Consumer

| Annotation | Source |
|---|---|
| `celerity.handler.consumer` | `@ConsumerHandler` |
| `celerity.handler.consumer.source` | Blueprint resource name from `@Consumer` controller |
| `celerity.handler.consumer.route` | Message routing pattern |

### Schedule

| Annotation | Source |
|---|---|
| `celerity.handler.schedule` | `@ScheduleHandler` |
| `celerity.handler.schedule.source` | Blueprint resource name from `@ScheduleHandler` |
| `celerity.handler.schedule.expression` | Cron or rate expression |

### Custom (Invoke)

| Annotation | Source |
|---|---|
| `celerity.handler.custom` | `@Invoke` |
| `celerity.handler.custom.name` | Invocation name |

### Guards

| Annotation | Source |
|---|---|
| `celerity.handler.guard.protectedBy` | `@ProtectedBy(...)` |
| `celerity.handler.guard.custom` | `@Guard(name)` or `defineGuard` |
| `celerity.handler.public` | `@Public()` |

### Shared

| Annotation | Source |
|---|---|
| `celerity.handler.metadata.*` | `@SetMetadata(key, value)`, `@Action(name)` |
| `celerity.handler.resource.ref` | `@Bucket`, `@Queue`, `@Topic`, etc. |

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

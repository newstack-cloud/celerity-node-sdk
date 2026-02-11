# @celerity-sdk/cli

Build-time extraction tool for Celerity decorator metadata.

Scans a compiled Celerity application module and produces a JSON handler manifest describing all registered handlers, their routing annotations, guard declarations, custom metadata, and provider dependency graph — without instantiating any classes or running application code.

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

1. **Module scan** (`scanModuleMetadata`) — walks the module tree (imports, controllers, function handlers, providers) using `reflect-metadata`, collecting all metadata without side effects.
2. **Serialization** (`serializeManifest`) — converts scanned metadata into a structured manifest with handler entries, annotations, and a dependency graph.
3. **Validation** (`validateScannedDependencies`) — checks that all provider dependencies are resolvable, reporting diagnostics for missing tokens.

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
  "functionHandlers": [],
  "dependencyGraph": {
    "nodes": []
  }
}
```

## Annotation Types

| Annotation | Source |
|---|---|
| `celerity.handler.http` | `@Get`, `@Post`, etc. |
| `celerity.handler.http.method` | HTTP method from decorator |
| `celerity.handler.http.path` | Full path (prefix + route) |
| `celerity.handler.guard.protectedBy` | `@ProtectedBy(...)` |
| `celerity.handler.guard.custom` | `@Guard(name)` |
| `celerity.handler.public` | `@Public()` |
| `celerity.handler.metadata.*` | `@SetMetadata(key, value)`, `@Action(name)` |

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

# @celerity-sdk/types

Shared TypeScript interfaces and types for the Celerity Node SDK.

This is the foundation package that all other `@celerity-sdk/*` packages depend on. It contains **no runtime code**, only type definitions and behavioral interfaces.

## Installation

```bash
pnpm add @celerity-sdk/types
```

## What's Included

| Category | Exports |
|---|---|
| **DI & Providers** | `Type`, `InjectionToken`, `Closeable`, `Provider`, `ClassProvider`, `FactoryProvider`, `ValueProvider`, `ServiceContainer` |
| **HTTP** | `HttpMethod`, `HttpRequest`, `HttpResponse`, `HandlerMetadata`, `HandlerContext`, `HttpHandlerRequest`, `HttpHandlerContext` |
| **Layers** | `CelerityLayer`, `NextFunction`, `HandlerResponse` |
| **Modules** | `ModuleMetadata`, `FunctionHandlerDefinition` |
| **Validation** | `Schema` |
| **Telemetry** | `LogLevel`, `CelerityLogger`, `CelerityTracer`, `CeleritySpan` |

## Conventions

- `type` is used for data shapes, configs, options, and result objects.
- `interface` is reserved for behavioral contracts that classes implement (e.g. `CelerityLayer`, `ServiceContainer`, `Schema`).

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

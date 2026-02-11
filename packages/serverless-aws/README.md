# @celerity-sdk/serverless-aws

AWS Lambda adapter for the Celerity Node SDK. Maps API Gateway v2 events to SDK types and routes them through the handler pipeline.

## Installation

```bash
pnpm add @celerity-sdk/serverless-aws
```

## How It Works

The `AwsLambdaAdapter` implements the `ServerlessAdapter` interface from `@celerity-sdk/core`. It:

1. Receives an API Gateway v2 proxy event
2. Maps it to an `HttpRequest` via `mapApiGatewayV2Event`
3. Resolves the matching handler using the three-tier resolution chain (see below)
4. Executes the full handler pipeline (system layers, app layers, handler layers, handler)
5. Maps the `HttpResponse` back to an `APIGatewayProxyResultV2`

### Handler Resolution

When `CELERITY_HANDLER_ID` is set (typical for serverless deployments where each Lambda maps to a single handler), the adapter resolves the handler using a three-tier chain:

1. **Direct registry lookup** - `registry.getHandlerById(CELERITY_HANDLER_ID)` for handlers with an explicit ID
2. **Module resolution fallback** - dynamically imports the handler module and matches the exported function against the registry by reference. Supports formats like `"handlers.hello"` (named export) and `"handlers"` (default export). Dotted module names like `"app.module"` are handled by trying the named export split first, then falling back to the full string as a module with a default export.
3. **Path/method routing** - falls back to matching the incoming request's HTTP method and path

Resolution is cached: once a handler is matched on cold start, subsequent warm invocations use the cached handler directly without repeating the lookup.

### Event Mapping

`mapApiGatewayV2Event` extracts from the API Gateway v2 event:

- HTTP method and path
- Path parameters, query string parameters, headers, cookies
- Request body (text or base64-decoded binary)
- Auth claims from the JWT authorizer
- Client IP, request ID, user agent, trace context (`X-Amzn-Trace-Id`)

### Lambda Entry Point

The `./handler` export provides a pre-configured Lambda handler that bootstraps the application module, initialises system layers, and caches the handler for warm invocations. It also registers a SIGTERM handler for graceful shutdown (container close + layer disposal).

```typescript
// handler.ts - used as the Lambda entry point
export { handler } from "@celerity-sdk/serverless-aws/handler";
```

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

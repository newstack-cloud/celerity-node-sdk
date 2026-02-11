# @celerity-sdk/common

Shared runtime utilities for the Celerity Node SDK.

This package provides small, general-purpose helpers used across multiple SDK packages. It has **no internal dependencies** and only requires `@celerity-sdk/types`.

## Installation

```bash
pnpm add @celerity-sdk/common
```

## API

### `joinHandlerPath(prefix, path)`

Joins a controller prefix and a route path into a single normalized path. Handles leading/trailing slashes and avoids double slashes.

```typescript
import { joinHandlerPath } from "@celerity-sdk/common";

joinHandlerPath("/api", "/users"); // "/api/users"
joinHandlerPath("/api", "/");      // "/api"
```

### `extractUserId(auth)`

Extracts a user identifier from an `HttpRequest.auth` object, checking common claim fields (`sub`, `userId`, `user_id`, `id`).

```typescript
import { extractUserId } from "@celerity-sdk/common";

const userId = extractUserId(request.auth); // string | null
```

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

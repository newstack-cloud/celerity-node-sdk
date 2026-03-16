# @celerity-sdk/config

Configuration resolution, secret access, and platform detection for the Celerity Node SDK.

Provides a `ConfigService` that lazily fetches and caches configuration from pluggable backends (environment variables, AWS Secrets Manager, AWS Parameter Store, etc.) with optional schema validation via a Zod-compatible `Schema<T>` interface.

## Installation

```bash
pnpm add @celerity-sdk/config
```

## Quick Start — `@Config(resourceName)`

The `@Config` decorator injects a `ConfigNamespace` for a named `celerity/config`
blueprint resource directly into your constructor:

```yaml
# app.blueprint.yaml
resources:
  appConfig:
    type: "celerity/config"
    spec:
      name: appConfig
      plaintext: [APP_NAME, LOG_LEVEL, MAX_PAGE_SIZE]
```

```typescript
import { Controller, Get, Public } from "@celerity-sdk/core";
import { Config, type ConfigNamespace } from "@celerity-sdk/config";

@Controller("/health")
export class HealthController {
  constructor(@Config("appConfig") private appConfig: ConfigNamespace) {}

  @Public()
  @Get()
  async check() {
    const appName = await this.appConfig.get("APP_NAME");
    return { status: "ok", appName: appName ?? "unknown" };
  }
}
```

### `ConfigNamespace` API

| Method | Description |
|--------|-------------|
| `get(key)` | Returns the value for `key`, or `undefined` if not set |
| `getOrThrow(key)` | Returns the value or throws if the key is missing |
| `getAll()` | Returns all key-value pairs in the namespace |
| `parse(schema)` | Fetches all values and validates with a Zod-compatible schema |

### Schema validation

Use `parse()` to validate and type config values:

```typescript
import { z } from "zod";

const schema = z.object({
  APP_NAME: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
  MAX_PAGE_SIZE: z.coerce.number().int().positive(),
});

const config = await this.appConfig.parse(schema);
// config: { APP_NAME: string; LOG_LEVEL: "debug"|"info"|...; MAX_PAGE_SIZE: number }
```

## Key Concepts

### ConfigService (advanced)

For dynamic namespace access, inject the full `ConfigService` via
`@Inject("ConfigService")`:

```typescript
import { Inject } from "@celerity-sdk/core";
import type { ConfigService } from "@celerity-sdk/config";

class MultiConfigService {
  constructor(@Inject("ConfigService") private config: ConfigService) {}

  async getFromNamespace(ns: string, key: string) {
    return this.config.namespace(ns).get(key);
  }
}
```

### ConfigLayer

A system layer that initialises the `ConfigService` once and registers it in
the DI container. Also registers each discovered namespace under its own DI
token so that `@Config("name")` resolves directly. Self-configures from
environment variables (e.g. `CELERITY_CONFIG_REFRESH_INTERVAL_MS`).

### Backends

| Backend | Description |
|---|---|
| `EmptyConfigBackend` | Returns empty config (default/testing) |
| `LocalConfigBackend` | Reads from environment variables |
| `AwsSecretsManagerBackend` | Fetches from AWS Secrets Manager |
| `AwsParameterStoreBackend` | Fetches from AWS Systems Manager Parameter Store |
| `AwsLambdaExtensionBackend` | Fetches via the Lambda secrets extension (skips refresh) |

Backend selection is automatic via `resolveBackend()` based on the `CELERITY_CONFIG_BACKEND` environment variable.

### Cloud SDK Peer Dependencies

Cloud-specific backends require the corresponding SDK as an optional peer dependency:

- AWS Secrets Manager: `@aws-sdk/client-secrets-manager`
- AWS Parameter Store: `@aws-sdk/client-ssm`

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

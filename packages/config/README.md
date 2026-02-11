# @celerity-sdk/config

Configuration resolution, secret access, and platform detection for the Celerity Node SDK.

Provides a `ConfigService` that lazily fetches and caches configuration from pluggable backends (environment variables, AWS Secrets Manager, AWS Parameter Store, etc.) with optional schema validation via a Zod-compatible `Schema<T>` interface.

## Installation

```bash
pnpm add @celerity-sdk/config
```

## Key Concepts

### ConfigService

DI-injectable service for accessing configuration values. Supports namespaced access and schema-validated retrieval.

```typescript
import { ConfigService, ConfigNamespace } from "@celerity-sdk/config";

const config = new ConfigService(backend);
const dbConfig = await config.get("database", dbSchema);
```

### ConfigLayer

A system layer that initialises the `ConfigService` once and registers it in the DI container. Self-configures from environment variables (e.g. `CELERITY_CONFIG_REFRESH_INTERVAL_MS`).

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

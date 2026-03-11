# @celerity-sdk/cache

Cache abstraction for the Celerity Node SDK.

Provides a unified `Cache` interface for working with managed Redis-compatible cache services across cloud providers. All three providers use the Redis wire protocol — only authentication differs.

- **AWS**: Amazon ElastiCache (Redis OSS)
- **GCP**: Google Cloud Memorystore *(planned)*
- **Azure**: Azure Cache for Redis *(planned)*

## Features

- **Full Redis data structure API** — strings, hashes, lists, sets, sorted sets, counters, transactions
- **Dual auth modes** — password-based and IAM token-based (AWS ElastiCache)
- **Cluster mode** — automatic hash slot routing for multi-key operations, same-slot validation for transactions and set operations
- **Deploy-aware connection presets** — tuned defaults for serverless functions vs. long-running containers
- **Key prefixing** — namespace isolation within a shared cluster
- **DI integration** — parameter decorators for injecting `Cache` instances into handler classes
- **Tracing** — automatic span creation for all cache operations when a tracer is available

## Installation

```bash
pnpm add @celerity-sdk/cache
```

Install the cache client as a peer dependency:

```bash
pnpm add ioredis
```

For IAM authentication on AWS:

```bash
pnpm add @smithy/signature-v4 @smithy/protocol-http @aws-crypto/sha256-js @aws-sdk/credential-provider-node
```

## Usage

### Basic usage

```typescript
import { Injectable } from "@celerity-sdk/core";
import { Cache } from "@celerity-sdk/cache";
import type { Cache as CacheClient } from "@celerity-sdk/cache";

@Injectable()
class SessionService {
  constructor(@Cache() private readonly cache: CacheClient) {}

  async getSession(id: string) {
    return this.cache.get(`session:${id}`);
  }

  async setSession(id: string, data: string) {
    await this.cache.set(`session:${id}`, data, { ttl: 3600 });
  }
}
```

### Multi-resource support

When multiple cache resources are linked, use the resource name to disambiguate:

```typescript
@Injectable()
class AppService {
  constructor(
    @Cache("sessionCache") private readonly sessions: CacheClient,
    @Cache("rateLimitCache") private readonly rateLimits: CacheClient,
  ) {}
}
```

For a single linked cache resource, the resource name can be omitted and default tokens are used automatically.

## Status

This package implements the `Cache` interface with a Redis provider (via ioredis) supporting both single-node and cluster modes. IAM authentication is supported for AWS ElastiCache via a pluggable `TokenProvider` interface. Support for Google Cloud Memorystore and Azure Cache for Redis will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

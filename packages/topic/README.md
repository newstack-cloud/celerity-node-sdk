# @celerity-sdk/topic

Cloud-agnostic pub/sub topic abstraction for the Celerity Node SDK.

Provides a unified `TopicClient` interface for publishing messages to topics across cloud providers. The Celerity runtime handles all consumption — this package is **publish-only** (`publish`, `publishBatch`).

- **AWS**: Amazon SNS
- **GCP**: Google Cloud Pub/Sub *(planned)*
- **Azure**: Azure Service Bus Topics *(planned)*
- **Local**: Redis pub/sub channels via Celerity CLI

## Installation

```bash
pnpm add @celerity-sdk/topic
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-sns

# Local development (managed by Celerity CLI, but needed for direct usage)
pnpm add ioredis
```

## Status

This package implements the `TopicClient` interface with providers for AWS SNS and Redis (local development). Support for Google Cloud Pub/Sub and Azure Service Bus Topics will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

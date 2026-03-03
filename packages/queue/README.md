# @celerity-sdk/queue

Cloud-agnostic queue producer abstraction for the Celerity Node SDK.

Provides a unified `QueueClient` interface for sending messages to queues across cloud providers. The Celerity runtime handles all consumption — this package is **producer-only** (`sendMessage`, `sendMessageBatch`).

- **AWS**: Amazon SQS
- **GCP**: Google Cloud Pub/Sub *(planned)*
- **Azure**: Azure Service Bus *(planned)*
- **Local**: Redis streams via Celerity CLI

## Installation

```bash
pnpm add @celerity-sdk/queue
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-sqs

# Local development (managed by Celerity CLI, but needed for direct usage)
pnpm add ioredis
```

## Status

This package implements the `QueueClient` interface with providers for AWS SQS and Redis (local development). Support for Google Cloud Pub/Sub and Azure Service Bus will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

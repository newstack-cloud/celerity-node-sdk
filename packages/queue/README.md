# @celerity-sdk/queue

Queue abstraction for the Celerity Node SDK.

Provides a unified `QueueClient` interface for working with message queues across cloud providers:

- **AWS**:Amazon SQS
- **GCP**:Google Cloud Pub/Sub
- **Azure**:Azure Service Bus

## Installation

```bash
pnpm add @celerity-sdk/queue
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-sqs

# GCP
pnpm add @google-cloud/pubsub

# Azure
pnpm add @azure/service-bus
```

## Status

This package is a stub:the interface and provider implementations are planned but not yet implemented.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

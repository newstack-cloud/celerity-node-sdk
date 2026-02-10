# @celerity-sdk/topic

Pub/Sub topic abstraction for the Celerity Node SDK.

Provides a unified `TopicClient` interface for publishing messages to topics across cloud providers:

- **AWS** — Amazon SNS
- **GCP** — Google Cloud Pub/Sub
- **Azure** — Azure Service Bus Topics

## Installation

```bash
pnpm add @celerity-sdk/topic
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-sns

# GCP
pnpm add @google-cloud/pubsub

# Azure
pnpm add @azure/service-bus
```

## Status

This package is a stub — the interface and provider implementations are planned but not yet implemented.

## Part of the Celerity Framework

See [celerityframework.com](https://celerityframework.com) for full documentation.

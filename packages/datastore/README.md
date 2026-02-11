# @celerity-sdk/datastore

NoSQL data store abstraction for the Celerity Node SDK.

Provides a unified `DatastoreClient` interface for working with NoSQL databases across cloud providers:

- **AWS**:Amazon DynamoDB
- **GCP**:Google Cloud Datastore
- **Azure**:Azure Cosmos DB

## Installation

```bash
pnpm add @celerity-sdk/datastore
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# GCP
pnpm add @google-cloud/datastore

# Azure
pnpm add @azure/cosmos
```

## Status

This package is a stub:the interface and provider implementations are planned but not yet implemented.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

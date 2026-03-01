# @celerity-sdk/datastore

NoSQL data store abstraction for the Celerity Node SDK.

Provides a unified `DatastoreClient` interface for working with NoSQL databases across cloud providers:

- **AWS**: Amazon DynamoDB
- **Google Cloud**: Google Cloud Firestore
- **Azure**: Azure Cosmos DB

## Installation

```bash
pnpm add @celerity-sdk/datastore
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# GCP
pnpm add @google-cloud/firestore

# Azure
pnpm add @azure/cosmos
```

## Status

This package implements the `DatastoreClient` interface and provides a `DynamoDBProvider` for AWS DynamoDB. Support for Google Cloud Firestore and Azure Cosmos DB will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

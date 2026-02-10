# Celerity Node SDK

The official Node.js SDK for building [Celerity](https://celerityframework.com) applications.

## Packages

| Package | Description |
|---|---|
| [`@celerity-sdk/types`](./packages/types) | Shared TypeScript interfaces and types |
| [`@celerity-sdk/config`](./packages/config) | Configuration resolution, secret access, and platform detection |
| [`@celerity-sdk/core`](./packages/core) | Application factory, decorators, DI, middleware, guards, and handler adapters |
| [`@celerity-sdk/bucket`](./packages/bucket) | Object storage abstraction (S3 / GCS / Azure Blob) |
| [`@celerity-sdk/queue`](./packages/queue) | Queue abstraction (SQS / Pub/Sub / Service Bus) |
| [`@celerity-sdk/topic`](./packages/topic) | Pub/Sub topic abstraction (SNS / Pub/Sub / Service Bus Topics) |
| [`@celerity-sdk/datastore`](./packages/datastore) | NoSQL data store abstraction (DynamoDB / Cloud Datastore / Cosmos DB) |
| [`@celerity-sdk/sql-database`](./packages/sql-database) | SQL database abstraction |
| [`@celerity-sdk/cache`](./packages/cache) | Cache abstraction (ElastiCache / Memorystore / Azure Cache for Redis) |
| [`@celerity-sdk/cli`](./packages/cli) | Metadata extraction CLI tools |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commands, and commit conventions.

## License

[Apache-2.0](./LICENSE)

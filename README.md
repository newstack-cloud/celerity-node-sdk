# Celerity Node SDK

[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=newstack-cloud_celerity-node-sdk&metric=coverage)](https://sonarcloud.io/summary/new_code?id=newstack-cloud_celerity-node-sdk)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=newstack-cloud_celerity-node-sdk&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=newstack-cloud_celerity-node-sdk)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=newstack-cloud_celerity-node-sdk&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=newstack-cloud_celerity-node-sdk)

The official Node.js SDK for building [Celerity](https://celerityframework.com) applications.

## Packages

| Package | Description |
|---|---|
| [`@celerity-sdk/types`](./packages/types) | Shared TypeScript interfaces and types |
| [`@celerity-sdk/common`](./packages/common) | Shared runtime utilities (auth helpers, path joining, etc.) |
| [`@celerity-sdk/config`](./packages/config) | Configuration resolution, secret access, and platform detection |
| [`@celerity-sdk/core`](./packages/core) | Application factory, decorators, DI, middleware, guards, and handler adapters |
| [`@celerity-sdk/bucket`](./packages/bucket) | Object storage abstraction (S3 / GCS / Azure Blob) |
| [`@celerity-sdk/queue`](./packages/queue) | Queue abstraction (SQS / Pub/Sub / Service Bus) |
| [`@celerity-sdk/topic`](./packages/topic) | Pub/Sub topic abstraction (SNS / Pub/Sub / Service Bus Topics) |
| [`@celerity-sdk/datastore`](./packages/datastore) | NoSQL data store abstraction (DynamoDB / Cloud Datastore / Cosmos DB) |
| [`@celerity-sdk/sql-database`](./packages/sql-database) | SQL database abstraction |
| [`@celerity-sdk/cache`](./packages/cache) | Cache abstraction (ElastiCache / Memorystore / Azure Cache for Redis) |
| [`@celerity-sdk/serverless-aws`](./packages/serverless-aws) | AWS Lambda adapter, API Gateway v2 event mapping, serverless entry point |
| [`@celerity-sdk/telemetry`](./packages/telemetry) | Observability: pino-based logger, OTel tracing, auto-instrumentation |
| [`@celerity-sdk/cli`](./packages/cli) | Build-time extraction tool for decorator metadata |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commands, and commit conventions.

## License

[Apache-2.0](./LICENSE)

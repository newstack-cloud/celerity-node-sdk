# @celerity-sdk/sql-database

SQL database abstraction for the Celerity Node SDK.

Provides credential resolution, connection pooling, and [Knex.js](https://knexjs.org) query builder instances for cloud-managed SQL databases:

- **AWS**: Amazon RDS (PostgreSQL, MySQL)
- **GCP**: Google Cloud SQL *(planned)*
- **Azure**: Azure Database *(planned)*

## Features

- **Dual auth modes** — password-based and IAM token-based authentication
- **Read replicas** — optional separate reader instance with automatic fallback to the writer
- **Deploy-aware pool presets** — tuned defaults for serverless functions vs. long-running containers
- **DI integration** — parameter decorators for injecting Knex instances into handler classes
- **BYO ORM** — inject `SqlDatabaseCredentials` directly for use with Prisma, Drizzle, or any other ORM

## Installation

```bash
pnpm add @celerity-sdk/sql-database
```

Install Knex and a database driver as peer dependencies:

```bash
# PostgreSQL
pnpm add knex pg

# MySQL
pnpm add knex mysql2
```

For IAM authentication on AWS:

```bash
pnpm add @aws-sdk/rds-signer
```

## Usage

### Basic usage

```typescript
import { Injectable } from "@celerity-sdk/core";
import { SqlDatabase } from "@celerity-sdk/sql-database";
import type { Knex } from "knex";

@Injectable()
class UserService {
  constructor(@SqlDatabase() private readonly db: Knex) {}

  async findById(id: string) {
    return this.db("users").where("id", id).first();
  }

  async create(name: string, email: string) {
    const [user] = await this.db("users")
      .insert({ name, email })
      .returning("*");
    return user;
  }
}
```

### Writer / reader split

Use `@SqlWriter()` and `@SqlReader()` when a read replica is configured:

```typescript
import { Injectable } from "@celerity-sdk/core";
import { SqlWriter, SqlReader } from "@celerity-sdk/sql-database";
import type { Knex } from "knex";

@Injectable()
class UserService {
  constructor(
    @SqlWriter() private readonly writer: Knex,
    @SqlReader() private readonly reader: Knex,
  ) {}
}
```

### BYO ORM (credentials only)

```typescript
import { Injectable } from "@celerity-sdk/core";
import { SqlCredentials } from "@celerity-sdk/sql-database";
import type { SqlDatabaseCredentials } from "@celerity-sdk/sql-database";

@Injectable()
class PrismaService {
  constructor(
    @SqlCredentials() private readonly credentials: SqlDatabaseCredentials,
  ) {}

  async getDatabaseUrl(): Promise<string> {
    const auth = await this.credentials.getPasswordAuth();
    return auth.url;
  }
}
```

### Multi-resource support

When multiple SQL databases are linked, use the resource name to disambiguate:

```typescript
import { Injectable } from "@celerity-sdk/core";
import { SqlWriter } from "@celerity-sdk/sql-database";
import type { Knex } from "knex";

@Injectable()
class AnalyticsService {
  constructor(
    @SqlWriter("analyticsDb") private readonly analytics: Knex,
    @SqlWriter("mainDb") private readonly main: Knex,
  ) {}
}
```

For a single linked database, the resource name can be omitted and default tokens are used automatically.

## Status

This package implements credential resolution, Knex.js connection factory, pool management, and DI integration for AWS RDS (PostgreSQL and MySQL). IAM authentication uses a pluggable `TokenProvider` interface, with an `RdsTokenProvider` for AWS. Support for Google Cloud SQL and Azure Database will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

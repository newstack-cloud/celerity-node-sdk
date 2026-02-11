import Redis from "ioredis";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const LOCALSTACK_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
const LOCALSTACK_REGION = "us-east-1";

const VALKEY_PORT = 6399;

export async function setup() {
  await seedValkey();
  await seedLocalStack();
}

export async function teardown() {
  await cleanValkey();
  await cleanLocalStack();
}

// ---------------------------------------------------------------------------
// Valkey
// ---------------------------------------------------------------------------

async function seedValkey() {
  const client = new Redis({ host: "localhost", port: VALKEY_PORT });

  await client.set(
    "app/config",
    JSON.stringify({
      DB_HOST: "db.example.com",
      DB_PORT: "5432",
      FEATURE_FLAG: "true",
    }),
  );
  await client.set("app/empty", JSON.stringify({}));

  await client.quit();
}

async function cleanValkey() {
  const client = new Redis({ host: "localhost", port: VALKEY_PORT });
  await client.del("app/config", "app/empty");
  await client.quit();
}

// ---------------------------------------------------------------------------
// LocalStack — SSM Parameter Store
// ---------------------------------------------------------------------------

async function seedLocalStack() {
  await seedSsmParameters();
  await seedSecretsManagerSecrets();
}

async function seedSsmParameters() {
  const client = new SSMClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });

  const params = [
    { Name: "/app/config/DB_HOST", Value: "rds.amazonaws.com", Type: "String" as const },
    { Name: "/app/config/DB_PORT", Value: "5432", Type: "String" as const },
    { Name: "/app/config/API_KEY", Value: "secret-key-123", Type: "SecureString" as const },
    { Name: "/app/config/nested/DEEP_KEY", Value: "deep-value", Type: "String" as const },
  ];

  for (const param of params) {
    await client.send(new PutParameterCommand({ ...param, Overwrite: true }));
  }
}

// ---------------------------------------------------------------------------
// LocalStack — Secrets Manager
// ---------------------------------------------------------------------------

async function seedSecretsManagerSecrets() {
  const client = new SecretsManagerClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });

  // Clean up any leftover secrets from previous runs
  for (const name of ["app/database-config", "app/binary-secret"]) {
    try {
      await client.send(
        new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }),
      );
    } catch {
      // Ignore — secret may not exist
    }
  }

  await client.send(
    new CreateSecretCommand({
      Name: "app/database-config",
      SecretString: JSON.stringify({
        DB_HOST: "rds.amazonaws.com",
        DB_PORT: "3306",
        DB_PASSWORD: "s3cret",
      }),
    }),
  );

  await client.send(
    new CreateSecretCommand({
      Name: "app/binary-secret",
      SecretBinary: Buffer.from("binary-data"),
    }),
  );
}

async function cleanLocalStack() {
  const client = new SecretsManagerClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });

  for (const name of ["app/database-config", "app/binary-secret"]) {
    try {
      await client.send(
        new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }),
      );
    } catch {
      // Ignore
    }
  }
}

import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const LOCALSTACK_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
const LOCALSTACK_REGION = "us-east-1";

const TEST_TABLE = "test-table";

function createClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export async function setup() {
  const client = createClient();

  try {
    await client.send(
      new CreateTableCommand({
        TableName: TEST_TABLE,
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
          { AttributeName: "gsiPk", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "gsi-index",
            KeySchema: [
              { AttributeName: "gsiPk", KeyType: "HASH" },
              { AttributeName: "sk", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
          },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        BillingMode: "PROVISIONED",
      }),
    );
  } catch {
    // Table may already exist from a previous run
  }

  // Seed test data: 20 items in "user-1" partition
  for (let i = 0; i < 20; i++) {
    await client.send(
      new PutCommand({
        TableName: TEST_TABLE,
        Item: {
          pk: "user-1",
          sk: `order-${String(i).padStart(3, "0")}`,
          total: (i + 1) * 10,
          status: i % 2 === 0 ? "active" : "archived",
          gsiPk: "category-a",
        },
      }),
    );
  }

  // 5 items in "user-2" partition
  for (let i = 0; i < 5; i++) {
    await client.send(
      new PutCommand({
        TableName: TEST_TABLE,
        Item: {
          pk: "user-2",
          sk: `order-${String(i).padStart(3, "0")}`,
          total: (i + 1) * 100,
          status: "active",
          gsiPk: "category-b",
        },
      }),
    );
  }

  client.destroy();
}

export async function teardown() {
  const base = new DynamoDBClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });

  try {
    await base.send(new DeleteTableCommand({ TableName: TEST_TABLE }));
  } catch {
    // Ignore cleanup errors
  }

  base.destroy();
}

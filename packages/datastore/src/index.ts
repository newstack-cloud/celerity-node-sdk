export {
  DatastoreClient,
  type ItemKey,
  type KeyCondition,
  type RangeCondition,
  type Condition,
  type AndGroup,
  type OrGroup,
  type ConditionExpression,
  type GetItemOptions,
  type PutItemOptions,
  type DeleteItemOptions,
  type QueryOptions,
  type ScanOptions,
  type ItemListing,
  type BatchGetItemsOptions,
  type BatchGetResult,
  type BatchWriteOperation,
  type BatchWriteResult,
} from "./types";

export type { DynamoDBDatastoreConfig } from "./providers/dynamodb/types";

export { createDatastoreClient } from "./factory";
export type { CreateDatastoreClientOptions } from "./factory";

export { Datastore, datastoreToken, DEFAULT_DATASTORE_TOKEN } from "./decorators";
export { getDatastore } from "./helpers";
export { DatastoreLayer } from "./layer";
export { DatastoreError, ConditionalCheckFailedError } from "./errors";

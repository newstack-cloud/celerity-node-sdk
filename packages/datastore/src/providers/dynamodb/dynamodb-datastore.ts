import createDebug from "debug";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import type {
  Datastore,
  ItemKey,
  GetItemOptions,
  PutItemOptions,
  DeleteItemOptions,
  QueryOptions,
  ScanOptions,
  ItemListing,
  BatchGetItemsOptions,
  BatchGetResult,
  BatchWriteOperation,
  BatchWriteResult,
} from "../../types";
import { DatastoreError, ConditionalCheckFailedError } from "../../errors";
import { DynamoDBItemListing } from "./dynamodb-item-listing";
import { buildFilterExpression } from "./expressions";
import { isConditionalCheckFailedError } from "./errors";

const debug = createDebug("celerity:datastore:dynamodb");

export class DynamoDBDatastore implements Datastore {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBDocumentClient,
    private readonly tracer?: CelerityTracer,
  ) {}

  async getItem<T = Record<string, unknown>>(
    key: ItemKey,
    options?: GetItemOptions,
  ): Promise<T | null> {
    debug("getItem %s %o", this.tableName, key);
    return this.traced(
      "celerity.datastore.get_item",
      { "datastore.table": this.tableName },
      async () => {
        try {
          const response = await this.client.send(
            new GetCommand({
              TableName: this.tableName,
              Key: key,
              ConsistentRead: options?.consistentRead,
            }),
          );
          return (response.Item as T) ?? null;
        } catch (error) {
          throw new DatastoreError(
            `Failed to get item from table "${this.tableName}"`,
            this.tableName,
            { cause: error },
          );
        }
      },
    );
  }

  async putItem(item: Record<string, unknown>, options?: PutItemOptions): Promise<void> {
    debug("putItem %s", this.tableName);
    return this.traced(
      "celerity.datastore.put_item",
      { "datastore.table": this.tableName },
      async () => {
        try {
          const conditionParams = options?.condition
            ? buildFilterExpression(options.condition)
            : undefined;

          await this.client.send(
            new PutCommand({
              TableName: this.tableName,
              Item: item,
              ConditionExpression: conditionParams?.expression,
              ExpressionAttributeNames: conditionParams?.names,
              ExpressionAttributeValues: conditionParams?.values,
            }),
          );
        } catch (error) {
          if (isConditionalCheckFailedError(error)) {
            throw new ConditionalCheckFailedError(this.tableName, { cause: error });
          }
          throw new DatastoreError(
            `Failed to put item in table "${this.tableName}"`,
            this.tableName,
            { cause: error },
          );
        }
      },
    );
  }

  async deleteItem(key: ItemKey, options?: DeleteItemOptions): Promise<void> {
    debug("deleteItem %s %o", this.tableName, key);
    return this.traced(
      "celerity.datastore.delete_item",
      { "datastore.table": this.tableName },
      async () => {
        try {
          const conditionParams = options?.condition
            ? buildFilterExpression(options.condition)
            : undefined;

          await this.client.send(
            new DeleteCommand({
              TableName: this.tableName,
              Key: key,
              ConditionExpression: conditionParams?.expression,
              ExpressionAttributeNames: conditionParams?.names,
              ExpressionAttributeValues: conditionParams?.values,
            }),
          );
        } catch (error) {
          if (isConditionalCheckFailedError(error)) {
            throw new ConditionalCheckFailedError(this.tableName, { cause: error });
          }
          throw new DatastoreError(
            `Failed to delete item from table "${this.tableName}"`,
            this.tableName,
            { cause: error },
          );
        }
      },
    );
  }

  query<T = Record<string, unknown>>(options: QueryOptions): ItemListing<T> {
    debug("query %s pk=%s", this.tableName, options.key.name);
    return new DynamoDBItemListing<T>(this.client, this.tableName, "query", options, this.tracer);
  }

  scan<T = Record<string, unknown>>(options?: ScanOptions): ItemListing<T> {
    debug("scan %s", this.tableName);
    return new DynamoDBItemListing<T>(
      this.client,
      this.tableName,
      "scan",
      options ?? {},
      this.tracer,
    );
  }

  async batchGetItems<T = Record<string, unknown>>(
    keys: ItemKey[],
    options?: BatchGetItemsOptions,
  ): Promise<BatchGetResult<T>> {
    debug("batchGetItems %s count=%d", this.tableName, keys.length);
    return this.traced(
      "celerity.datastore.batch_get_items",
      { "datastore.table": this.tableName, "datastore.batch_size": keys.length },
      async () => {
        try {
          const response = await this.client.send(
            new BatchGetCommand({
              RequestItems: {
                [this.tableName]: {
                  Keys: keys,
                  ConsistentRead: options?.consistentRead,
                },
              },
            }),
          );

          const items = (response.Responses?.[this.tableName] ?? []) as T[];
          const unprocessedKeys = (response.UnprocessedKeys?.[this.tableName]?.Keys ??
            []) as ItemKey[];

          return { items, unprocessedKeys };
        } catch (error) {
          throw new DatastoreError(
            `Failed to batch get items from table "${this.tableName}"`,
            this.tableName,
            { cause: error },
          );
        }
      },
    );
  }

  async batchWriteItems(operations: BatchWriteOperation[]): Promise<BatchWriteResult> {
    debug("batchWriteItems %s count=%d", this.tableName, operations.length);
    return this.traced(
      "celerity.datastore.batch_write_items",
      { "datastore.table": this.tableName, "datastore.batch_size": operations.length },
      async () => {
        try {
          const writeRequests = operations.map((op) => {
            if (op.type === "put") {
              return { PutRequest: { Item: op.item } };
            }
            return { DeleteRequest: { Key: op.key } };
          });

          const response = await this.client.send(
            new BatchWriteCommand({
              RequestItems: { [this.tableName]: writeRequests },
            }),
          );

          const unprocessedRequests = response.UnprocessedItems?.[this.tableName] ?? [];
          const unprocessedOperations: BatchWriteOperation[] = unprocessedRequests.map((req) => {
            if (req.PutRequest) {
              return { type: "put" as const, item: req.PutRequest.Item! };
            }
            return { type: "delete" as const, key: req.DeleteRequest!.Key! as ItemKey };
          });

          return { unprocessedOperations };
        } catch (error) {
          throw new DatastoreError(
            `Failed to batch write items to table "${this.tableName}"`,
            this.tableName,
            { cause: error },
          );
        }
      },
    );
  }

  private traced<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span?: CeleritySpan) => Promise<T>,
  ): Promise<T> {
    if (!this.tracer) return fn();
    return this.tracer.withSpan(name, (span) => fn(span), attributes);
  }
}

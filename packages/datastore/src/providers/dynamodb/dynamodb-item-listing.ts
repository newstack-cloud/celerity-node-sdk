import createDebug from "debug";
import { QueryCommand, ScanCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { ItemListing, QueryOptions, ScanOptions } from "../../types";
import { DatastoreError } from "../../errors";
import { buildKeyConditionExpression, buildFilterExpression } from "./expressions";

const debug = createDebug("celerity:datastore:dynamodb");

type CursorState = {
  lastEvaluatedKey: Record<string, unknown>;
};

function encodeCursor(lastEvaluatedKey: Record<string, unknown>): string {
  const state: CursorState = { lastEvaluatedKey };
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

function decodeCursor(cursor: string): CursorState {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as CursorState;
}

export class DynamoDBItemListing<T> implements ItemListing<T> {
  private _cursor: string | undefined;

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly mode: "query" | "scan",
    private readonly options: QueryOptions | ScanOptions,
    private readonly tracer?: CelerityTracer,
  ) {
    this._cursor = options.cursor;
  }

  get cursor(): string | undefined {
    return this._cursor;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const cursorState = this._cursor ? decodeCursor(this._cursor) : undefined;
    let exclusiveStartKey: Record<string, unknown> | undefined = cursorState?.lastEvaluatedKey;

    do {
      debug("%s page %s key=%o", this.mode, this.tableName, exclusiveStartKey ?? "(start)");

      const response = await this.fetchPage(exclusiveStartKey);

      for (const item of response.Items ?? []) {
        yield item as T;
      }

      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;

      if (exclusiveStartKey) {
        this._cursor = encodeCursor(exclusiveStartKey);
      } else {
        this._cursor = undefined;
      }
    } while (exclusiveStartKey);
  }

  private async fetchPage(exclusiveStartKey?: Record<string, unknown>) {
    const command =
      this.mode === "query"
        ? this.buildQueryCommand(exclusiveStartKey)
        : this.buildScanCommand(exclusiveStartKey);

    const doFetch = async () => {
      try {
        return await this.client.send(command);
      } catch (error) {
        throw new DatastoreError(
          `Failed to ${this.mode} table "${this.tableName}"`,
          this.tableName,
          { cause: error },
        );
      }
    };

    if (!this.tracer) return doFetch();
    return this.tracer.withSpan(`celerity.datastore.${this.mode}_page`, () => doFetch(), {
      "datastore.table": this.tableName,
    });
  }

  private buildQueryCommand(exclusiveStartKey?: Record<string, unknown>) {
    const opts = this.options as QueryOptions;
    const keyExpr = buildKeyConditionExpression(opts.key, opts.range);

    const filterExpr = opts.filter ? buildFilterExpression(opts.filter) : undefined;

    return new QueryCommand({
      TableName: this.tableName,
      IndexName: opts.indexName,
      KeyConditionExpression: keyExpr.expression,
      FilterExpression: filterExpr?.expression,
      ExpressionAttributeNames: { ...keyExpr.names, ...filterExpr?.names },
      ExpressionAttributeValues: { ...keyExpr.values, ...filterExpr?.values },
      ScanIndexForward: opts.sortAscending,
      Limit: opts.maxResults,
      ExclusiveStartKey: exclusiveStartKey,
      ConsistentRead: opts.consistentRead,
    });
  }

  private buildScanCommand(exclusiveStartKey?: Record<string, unknown>) {
    const opts = this.options as ScanOptions;

    const filterExpr = opts.filter ? buildFilterExpression(opts.filter) : undefined;

    return new ScanCommand({
      TableName: this.tableName,
      IndexName: opts.indexName,
      FilterExpression: filterExpr?.expression,
      ExpressionAttributeNames:
        filterExpr?.names && Object.keys(filterExpr.names).length > 0
          ? filterExpr.names
          : undefined,
      ExpressionAttributeValues:
        filterExpr?.values && Object.keys(filterExpr.values).length > 0
          ? filterExpr.values
          : undefined,
      Limit: opts.maxResults,
      ExclusiveStartKey: exclusiveStartKey,
      ConsistentRead: opts.consistentRead,
    });
  }
}

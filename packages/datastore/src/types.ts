import type { Closeable } from "@celerity-sdk/types";

export const DatastoreClient = Symbol.for("DatastoreClient");

/**
 * A data store client abstraction for NoSQL databases. Provides access to named
 * data stores (tables/collections), each representing a logical container for items.
 */
export interface DatastoreClient extends Closeable {
  /**
   * Retrieves a datastore instance by its logical name. The returned datastore
   * is a lightweight handle — no network calls are made until an operation is invoked.
   *
   * @param name The name of the datastore (table/collection).
   */
  datastore(name: string): Datastore;
}

/**
 * A datastore represents a logical container (table/collection) for items in a
 * NoSQL data store. It provides methods for performing CRUD operations, queries,
 * scans, and batch operations within the data store.
 */
export interface Datastore {
  /**
   * Retrieve an item from the data store by its primary key. Returns `null` if the
   * item does not exist.
   *
   * @param key The primary key attributes identifying the item.
   * @param options Optional parameters such as consistent read.
   * @returns A promise that resolves to the item, or `null` if not found.
   */
  getItem<T = Record<string, unknown>>(key: ItemKey, options?: GetItemOptions): Promise<T | null>;

  /**
   * Store an item in the data store. If an item with the same primary key already
   * exists, it is replaced entirely (upsert semantics).
   *
   * @param item The item to store. Must include all primary key attributes.
   * @param options Optional parameters such as condition expressions.
   */
  putItem(item: Record<string, unknown>, options?: PutItemOptions): Promise<void>;

  /**
   * Delete an item from the data store by its primary key. This operation is
   * idempotent — deleting a non-existent key does not throw.
   *
   * @param key The primary key attributes identifying the item to delete.
   * @param options Optional parameters such as condition expressions.
   */
  deleteItem(key: ItemKey, options?: DeleteItemOptions): Promise<void>;

  /**
   * Query items by primary key with optional range conditions. Returns an
   * {@link ItemListing} that handles pagination transparently, allowing the caller
   * to iterate over all matching items without managing page tokens.
   *
   * @param options Query parameters including key condition, range conditions,
   *   filters, and pagination controls.
   * @returns An item listing that yields items and exposes a cursor for resuming.
   */
  query<T = Record<string, unknown>>(options: QueryOptions): ItemListing<T>;

  /**
   * Perform a full scan of the data store. Returns an {@link ItemListing} that
   * handles pagination transparently. Scans read every item in the table and
   * should be used sparingly.
   *
   * @param options Optional scan parameters such as filters and pagination controls.
   * @returns An item listing that yields items and exposes a cursor for resuming.
   */
  scan<T = Record<string, unknown>>(options?: ScanOptions): ItemListing<T>;

  /**
   * Retrieve multiple items by their primary keys in a single batch operation.
   * The batch may be split into multiple requests if it exceeds provider limits.
   *
   * @param keys The primary keys of the items to retrieve.
   * @param options Optional parameters such as consistent read.
   * @returns A promise that resolves to the batch get result, including retrieved
   *   items and any unprocessed keys.
   */
  batchGetItems<T = Record<string, unknown>>(
    keys: ItemKey[],
    options?: BatchGetItemsOptions,
  ): Promise<BatchGetResult<T>>;

  /**
   * Perform multiple put and delete operations in a single batch. The batch may
   * be split into multiple requests if it exceeds provider limits.
   *
   * @param operations The batch of put and delete operations to execute.
   * @returns A promise that resolves to the batch write result, including any
   *   unprocessed operations.
   */
  batchWriteItems(operations: BatchWriteOperation[]): Promise<BatchWriteResult>;
}

/**
 * Primary key attributes for an item. Keys can be string or number values
 * corresponding to primary key and optional range key attributes.
 */
export type ItemKey = Record<string, string | number>;

/**
 * A condition on the primary key — always an equality match.
 */
export type KeyCondition = {
  /** The attribute name of the primary key. */
  name: string;
  /** The primary key value to match. */
  value: string | number;
};

/**
 * A condition on the range key. Supports equality, comparison, range,
 * and prefix matching operations.
 */
export type RangeCondition = {
  /** The attribute name of the range key. */
  name: string;
} & (
  | { operator: "eq"; value: string | number }
  | { operator: "lt"; value: string | number }
  | { operator: "le"; value: string | number }
  | { operator: "gt"; value: string | number }
  | { operator: "ge"; value: string | number }
  | { operator: "between"; low: string | number; high: string | number }
  | { operator: "startsWith"; value: string }
);

/**
 * A filter condition on an item attribute. Used for post-read filtering
 * in queries and scans, and for conditional writes.
 *
 * Only includes operators that map cleanly across all target providers
 * (DynamoDB, Firestore, Cosmos DB). The `not_exists` operator is
 * provider-specific and available through the concrete provider classes.
 */
export type Condition = {
  /** The attribute name to evaluate. */
  name: string;
} & (
  | { operator: "eq"; value: unknown }
  | { operator: "ne"; value: unknown }
  | { operator: "lt"; value: string | number }
  | { operator: "le"; value: string | number }
  | { operator: "gt"; value: string | number }
  | { operator: "ge"; value: string | number }
  | { operator: "between"; low: string | number; high: string | number }
  | { operator: "startsWith"; value: string }
  | { operator: "contains"; value: string | number }
  | { operator: "exists" }
);

/**
 * A group of conditions combined with AND logic. All conditions must be true.
 */
export type AndGroup = { and: ConditionExpression[] };

/**
 * A group of conditions combined with OR logic. At least one condition must be true.
 */
export type OrGroup = { or: ConditionExpression[] };

/**
 * One or more conditions combined with logical operators. A single {@link Condition},
 * an array of Conditions (implicit AND), or explicit
 * {@link AndGroup}/{@link OrGroup} for compound logic with recursive nesting.
 */
export type ConditionExpression = Condition | Condition[] | AndGroup | OrGroup;

/**
 * Options for the getItem operation.
 */
export type GetItemOptions = {
  /** When true, performs a strongly consistent read. Default is eventually consistent. */
  consistentRead?: boolean;
};

/**
 * Options for the putItem operation.
 */
export type PutItemOptions = {
  /**
   * Condition that must be met for the put to succeed. Throws
   * {@link ConditionalCheckFailedError} if the condition is not met.
   */
  condition?: ConditionExpression;
};

/**
 * Options for the deleteItem operation.
 */
export type DeleteItemOptions = {
  /**
   * Condition that must be met for the delete to succeed. Throws
   * {@link ConditionalCheckFailedError} if the condition is not met.
   */
  condition?: ConditionExpression;
};

/**
 * Options for the query operation.
 */
export type QueryOptions = {
  /** The primary key condition (required for queries). */
  key: KeyCondition;
  /** Optional range key condition to narrow the query range. */
  range?: RangeCondition;
  /** Optional filter conditions applied after the query read (does not reduce read capacity). */
  filter?: ConditionExpression;
  /** Query an index instead of the base table. */
  indexName?: string;
  /** When true, results are returned in ascending key order (default). Set to false for descending. */
  sortAscending?: boolean;
  /** Maximum number of items to return per internal page fetch. */
  maxResults?: number;
  /** Opaque cursor token to resume a previous query from where it left off. */
  cursor?: string;
  /** When true, performs a strongly consistent read (not supported on secondary indexes). */
  consistentRead?: boolean;
};

/**
 * Options for the scan operation.
 */
export type ScanOptions = {
  /** Optional filter conditions applied after the scan read. */
  filter?: ConditionExpression;
  /** Scan an index instead of the base table. */
  indexName?: string;
  /** Maximum number of items to return per internal page fetch. */
  maxResults?: number;
  /** Opaque cursor token to resume a previous scan from where it left off. */
  cursor?: string;
  /** When true, performs a strongly consistent read. */
  consistentRead?: boolean;
};

/**
 * An async iterable of items that also exposes a cursor token for resuming
 * iteration from the current position. The cursor is updated as pages are fetched
 * and encodes enough state to resume from the exact position across all providers.
 */
export interface ItemListing<T> extends AsyncIterable<T> {
  /**
   * A cursor token representing the current position in the listing. This token
   * can be passed to a subsequent query or scan call to resume iteration from
   * this position. The value is `undefined` before iteration begins or after all
   * items have been yielded.
   */
  readonly cursor: string | undefined;
}

/**
 * Options for the batchGetItems operation.
 */
export type BatchGetItemsOptions = {
  /** When true, performs strongly consistent reads for all items. */
  consistentRead?: boolean;
};

/**
 * The result of a batch get operation.
 */
export type BatchGetResult<T> = {
  /** The successfully retrieved items. */
  items: T[];
  /** Keys that could not be processed in this batch (caller should retry). */
  unprocessedKeys: ItemKey[];
};

/**
 * A single operation in a batch write request.
 */
export type BatchWriteOperation =
  | { type: "put"; item: Record<string, unknown> }
  | { type: "delete"; key: ItemKey };

/**
 * The result of a batch write operation.
 */
export type BatchWriteResult = {
  /** Operations that could not be processed in this batch (caller should retry). */
  unprocessedOperations: BatchWriteOperation[];
};

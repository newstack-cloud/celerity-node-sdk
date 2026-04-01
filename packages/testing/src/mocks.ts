import type { ResourceTokenInfo } from "./discovery";

// Intentionally uses `any` to remain compatible with jest.Mock and vi.fn return types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockFn = (...args: any[]) => any;
export type MockFnCreator = () => MockFn;

type TestFrameworkGlobals = {
  jest?: { fn?: MockFnCreator };
  vi?: { fn?: MockFnCreator };
};

/**
 * Detects the test framework and returns its mock function creator.
 * Falls back to a basic no-op function if neither jest nor vitest is detected.
 */
function detectMockFnCreator(): MockFnCreator {
  const g = globalThis as typeof globalThis & TestFrameworkGlobals;
  if (g.jest?.fn) {
    return g.jest.fn;
  }
  if (g.vi?.fn) {
    return g.vi.fn;
  }
  // Basic spy fallback
  return () => {
    const fn = (..._args: unknown[]) => undefined;
    return fn as MockFn;
  };
}

/**
 * Creates a mock object for a resource type with all interface methods stubbed.
 * Returns null for resource types that cannot be meaningfully mocked (e.g. sqlDatabase).
 */
export function createResourceMock(
  resourceType: string,
  mockFn?: MockFnCreator,
): Record<string, MockFn> | null {
  const create = mockFn ?? detectMockFnCreator();

  switch (resourceType) {
    case "datastore":
      return createDatastoreMock(create);
    case "topic":
      return createTopicMock(create);
    case "queue":
      return createQueueMock(create);
    case "cache":
      return createCacheMock(create);
    case "bucket":
      return createBucketMock(create);
    case "config":
      return createConfigMock(create);
    default:
      // sqlDatabase uses Knex with a massive fluent API — mocking it isn't
      // practical. Use integration mode with a real database instead.
      return null;
  }
}

function createDatastoreMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    getItem: fn(),
    putItem: fn(),
    deleteItem: fn(),
    query: fn(),
    scan: fn(),
    batchGetItems: fn(),
    batchWriteItems: fn(),
  };
}

function createTopicMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    publish: fn(),
    publishBatch: fn(),
  };
}

function createQueueMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    sendMessage: fn(),
    sendMessageBatch: fn(),
  };
}

function createCacheMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    get: fn(),
    set: fn(),
    delete: fn(),
    incr: fn(),
    decr: fn(),
    incrFloat: fn(),
    mget: fn(),
    mset: fn(),
    mdelete: fn(),
    exists: fn(),
    expire: fn(),
    persist: fn(),
    ttl: fn(),
    rename: fn(),
    getSet: fn(),
    append: fn(),
    keyType: fn(),
    scanKeys: fn(),
    hashGet: fn(),
    hashSet: fn(),
    hashDelete: fn(),
    hashGetAll: fn(),
    hashExists: fn(),
    hashIncr: fn(),
    hashKeys: fn(),
    hashLen: fn(),
    listPush: fn(),
    listPop: fn(),
    listRange: fn(),
    listLen: fn(),
    listTrim: fn(),
    listIndex: fn(),
    setAdd: fn(),
    setRemove: fn(),
    setMembers: fn(),
    setIsMember: fn(),
    setLen: fn(),
    setUnion: fn(),
    setIntersect: fn(),
    setDiff: fn(),
    sortedSetAdd: fn(),
    sortedSetRemove: fn(),
    sortedSetScore: fn(),
    sortedSetRank: fn(),
    sortedSetRange: fn(),
    sortedSetRangeByScore: fn(),
    sortedSetIncr: fn(),
    sortedSetLen: fn(),
    transaction: fn(),
  };
}

function createBucketMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    get: fn(),
    put: fn(),
    delete: fn(),
    info: fn(),
    exists: fn(),
    list: fn(),
    copy: fn(),
    signUrl: fn(),
  };
}

function createConfigMock(fn: MockFnCreator): Record<string, MockFn> {
  return {
    get: fn(),
    getOrThrow: fn(),
    getAll: fn(),
    parse: fn(),
  };
}

/**
 * Creates mock objects for all discovered resource tokens.
 * Returns a map of token → mock object. Tokens for unmockable resource types
 * (like sqlDatabase) are omitted.
 */
export function createMocksForTokens(
  tokens: ResourceTokenInfo[],
  mockFn?: MockFnCreator,
): Map<symbol, Record<string, MockFn>> {
  const mocks = new Map<symbol, Record<string, MockFn>>();
  for (const info of tokens) {
    const mock = createResourceMock(info.type, mockFn);
    if (mock) {
      mocks.set(info.token, mock);
    }
  }
  return mocks;
}

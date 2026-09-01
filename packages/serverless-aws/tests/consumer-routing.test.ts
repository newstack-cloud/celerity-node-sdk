import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExecuteConsumerPipeline = vi.fn();

// planRouting is left real, these tests are about the adapter honouring the
// routing plan, and a mocked planner would let the adapter pass while dispatch
// is wrong, which is exactly the defect being fixed.
vi.mock("@celerity-sdk/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@celerity-sdk/core")>();
  return {
    ...actual,
    executeConsumerPipeline: (...args: unknown[]) => mockExecuteConsumerPipeline(...args),
  };
});

import { AwsLambdaAdapter } from "../src/adapter";
import { HandlerRegistry } from "@celerity-sdk/core";

const CONSUMER = "userEventsConsumer";

function register(registry: HandlerRegistry, methodName: string, route?: string) {
  registry.register({
    type: "consumer",
    id: `UserEventsConsumer.${methodName}`,
    handlerTag: `${CONSUMER}::${methodName}`,
    consumerName: CONSUMER,
    route,
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    handlerFn: vi.fn(),
  });
}

function routedRegistry(withFallback = true): HandlerRegistry {
  const registry = new HandlerRegistry();
  register(registry, "onUserCreated", "user.created");
  register(registry, "onUserUpdated", "user.updated");
  register(registry, "onUserDeleted", "user.deleted");
  if (withFallback) register(registry, "onUnknownEvent");
  return registry;
}

function sqsEvent(bodies: unknown[]) {
  return {
    Records: bodies.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `handle-${i}`,
      body: typeof body === "string" ? body : JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1000",
        SenderId: "sender",
        ApproximateFirstReceiveTimestamp: "1000",
      },
      messageAttributes: {},
      md5OfBody: "abc",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:eu-west-2:123:user-events",
      awsRegion: "eu-west-2",
    })),
  };
}

/** The handler tag and message ids each pipeline invocation received. */
function dispatches(): Array<{ tag: string; ids: string[] }> {
  return mockExecuteConsumerPipeline.mock.calls.map((call) => {
    const [handler, event] = call as [{ handlerTag: string }, { messages: { messageId: string }[] }];
    return { tag: handler.handlerTag, ids: event.messages.map((m) => m.messageId) };
  });
}

const options = { container: {}, logger: undefined } as never;

describe("routed consumer dispatch", () => {
  beforeEach(() => {
    mockExecuteConsumerPipeline.mockReset();
    mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });
    process.env.CELERITY_HANDLER_TAG = CONSUMER;
    process.env.CELERITY_ROUTING_KEY = "type";
  });

  afterEach(() => {
    delete process.env.CELERITY_HANDLER_TAG;
    delete process.env.CELERITY_ROUTING_KEY;
  });

  it("invokes the handler the route names, not an arbitrary one", async () => {
    // Before this, all four handlers had their own function on one queue and a
    // user.created message was processed by onUserUpdated.
    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);

    await handler(sqsEvent([{ type: "user.created" }]), {});

    expect(dispatches()).toEqual([
      { tag: `${CONSUMER}::onUserCreated`, ids: ["msg-0"] },
    ]);
  });

  it("splits a mixed batch across handlers, one invocation each", async () => {
    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);

    await handler(
      sqsEvent([
        { type: "user.created" },
        { type: "user.deleted" },
        { type: "user.created" },
      ]),
      {},
    );

    expect(dispatches()).toEqual([
      { tag: `${CONSUMER}::onUserCreated`, ids: ["msg-0", "msg-2"] },
      { tag: `${CONSUMER}::onUserDeleted`, ids: ["msg-1"] },
    ]);
  });

  it("collects partial failures from every handler it dispatched to", async () => {
    mockExecuteConsumerPipeline
      .mockResolvedValueOnce({ success: false, failures: [{ messageId: "msg-0" }] })
      .mockResolvedValueOnce({ success: true, failures: [] });

    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);
    const result = (await handler(
      sqsEvent([{ type: "user.created" }, { type: "user.updated" }]),
      {},
    )) as { batchItemFailures: unknown[] };

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-0" }]);
  });

  it("fails only its own messages when one handler throws", async () => {
    // Letting the invocation fail would redeliver the whole batch and re-run the
    // handlers that already succeeded.
    mockExecuteConsumerPipeline
      .mockRejectedValueOnce(new Error("downstream is down"))
      .mockResolvedValueOnce({ success: true, failures: [] });

    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);
    const result = (await handler(
      sqsEvent([{ type: "user.created" }, { type: "user.updated" }]),
      {},
    )) as { batchItemFailures: unknown[] };

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-0" }]);
    expect(dispatches()).toHaveLength(2);
  });

  it("fails an unroutable message instead of deleting it, when others route", async () => {
    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(false), options);
    const result = (await handler(
      sqsEvent([{ type: "user.archived" }, { type: "user.created" }]),
      {},
    )) as { batchItemFailures: unknown[] };

    expect(dispatches()).toEqual([{ tag: `${CONSUMER}::onUserCreated`, ids: ["msg-1"] }]);
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-0" }]);
  });

  it("throws when nothing in the batch can be routed at all", async () => {
    // A wiring fault rather than a message fault; a thrown error surfaces it as
    // a failed invocation rather than as ordinary redelivery.
    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(false), options);

    await expect(handler(sqsEvent([{ type: "user.archived" }]), {})).rejects.toThrow(
      /could take any message in this batch/,
    );
    expect(dispatches()).toEqual([]);
  });

  it("defaults the routing field when the target tags only the consumer", async () => {
    delete process.env.CELERITY_ROUTING_KEY;
    const registry = new HandlerRegistry();
    register(registry, "onPing", "ping");

    const handler = new AwsLambdaAdapter().createConsumerHandler(registry, options);
    await handler(sqsEvent([{ event: "ping" }]), {});

    expect(dispatches()).toEqual([{ tag: `${CONSUMER}::onPing`, ids: ["msg-0"] }]);
  });

  it("lets an explicit handler id win over routing", async () => {
    // CELERITY_HANDLER_ID addresses exactly one handler, so it must dispatch to
    // that handler even if the tag alongside it names a consumer. Routing is the
    // last resort, not the first.
    process.env.CELERITY_HANDLER_ID = "UserEventsConsumer.onUserDeleted";

    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);
    await handler(sqsEvent([{ type: "user.created" }]), {});

    expect(dispatches()).toEqual([
      { tag: `${CONSUMER}::onUserDeleted`, ids: ["msg-0"] },
    ]);
    delete process.env.CELERITY_HANDLER_ID;
  });

  it("leaves a tag naming one handler on the single-handler path", async () => {
    // A tag registered as a handler resolves as a handler, exactly as before
    // routing existed, even though its consumer also has routed siblings.
    process.env.CELERITY_HANDLER_TAG = `${CONSUMER}::onUserCreated`;

    const handler = new AwsLambdaAdapter().createConsumerHandler(routedRegistry(), options);
    await handler(sqsEvent([{ type: "user.deleted" }]), {});

    // The whole batch goes to the tagged handler regardless of its route.
    expect(dispatches()).toEqual([
      { tag: `${CONSUMER}::onUserCreated`, ids: ["msg-0"] },
    ]);
  });
});

describe("routed consumer dispatch, function handlers", () => {
  /**
   * Function handlers reach the registry from `createConsumerHandler`, which
   * carries the consumer on `source` rather than on a class decorator. Routing
   * has to work the same for them, since the deploy target that puts a whole
   * consumer behind one function does not know which style wrote it.
   */
  function fnRegistry(): HandlerRegistry {
    const registry = new HandlerRegistry();
    for (const route of ["user.created", "user.deleted"]) {
      registry.register({
        type: "consumer",
        handlerTag: `${CONSUMER}::${route}`,
        consumerName: CONSUMER,
        route,
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
        isFunctionHandler: true,
        injectTokens: [],
      });
    }
    return registry;
  }

  beforeEach(() => {
    mockExecuteConsumerPipeline.mockReset();
    mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });
    process.env.CELERITY_HANDLER_TAG = CONSUMER;
    process.env.CELERITY_ROUTING_KEY = "type";
  });

  afterEach(() => {
    delete process.env.CELERITY_HANDLER_TAG;
    delete process.env.CELERITY_ROUTING_KEY;
  });

  it("splits a batch across function handlers of one consumer", async () => {
    const handler = new AwsLambdaAdapter().createConsumerHandler(fnRegistry(), options);

    await handler(sqsEvent([{ type: "user.created" }, { type: "user.deleted" }]), {});

    expect(dispatches()).toEqual([
      { tag: `${CONSUMER}::user.created`, ids: ["msg-0"] },
      { tag: `${CONSUMER}::user.deleted`, ids: ["msg-1"] },
    ]);
  });
});

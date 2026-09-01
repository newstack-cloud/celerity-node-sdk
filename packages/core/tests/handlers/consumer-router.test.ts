import "reflect-metadata";
import { describe, it, expect } from "vitest";
import type { ConsumerMessage } from "@celerity-sdk/types";
import { HandlerRegistry } from "../../src/handlers/registry";
import { planRouting, routesAsConsumer } from "../../src/handlers/consumer-router";

function registerHandler(
  registry: HandlerRegistry,
  consumerName: string,
  methodName: string,
  route?: string,
): void {
  registry.register({
    type: "consumer",
    id: `TestConsumer.${methodName}`,
    handlerTag: `${consumerName}::${methodName}`,
    consumerName,
    route,
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    handlerFn: () => ({ success: true, failures: [] }),
  });
}

function message(id: string, body: unknown): ConsumerMessage {
  return {
    messageId: id,
    body: typeof body === "string" ? body : JSON.stringify(body),
    source: "test-queue",
    messageAttributes: {},
    vendor: {},
  };
}

function registryWithRoutes(withFallback = true): HandlerRegistry {
  const registry = new HandlerRegistry();
  registerHandler(registry, "userEventsConsumer", "onUserCreated", "user.created");
  registerHandler(registry, "userEventsConsumer", "onUserUpdated", "user.updated");
  registerHandler(registry, "userEventsConsumer", "onUserDeleted", "user.deleted");
  if (withFallback) registerHandler(registry, "userEventsConsumer", "onUnknownEvent");
  return registry;
}

function tagsFor(plan: ReturnType<typeof planRouting>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const batch of plan.batches) {
    out[batch.handler.handlerTag] = batch.messages.map((m) => m.messageId);
  }
  return out;
}

describe("planRouting", () => {
  it("sends each message to the handler its route names", () => {
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", { type: "user.created", userId: "u1" }),
      message("m2", { type: "user.deleted", userId: "u2" }),
    ]);

    expect(tagsFor(plan)).toEqual({
      "userEventsConsumer::onUserCreated": ["m1"],
      "userEventsConsumer::onUserDeleted": ["m2"],
    });
    expect(plan.unrouted).toEqual([]);
  });

  it("keeps messages for one handler together in a single batch", () => {
    // A handler's signature takes a batch, so splitting per message would break
    // any handler that writes once for the whole batch.
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", { type: "user.created" }),
      message("m2", { type: "user.updated" }),
      message("m3", { type: "user.created" }),
    ]);

    expect(tagsFor(plan)).toEqual({
      "userEventsConsumer::onUserCreated": ["m1", "m3"],
      "userEventsConsumer::onUserUpdated": ["m2"],
    });
  });

  it("sends an unmatched route to the fallback handler", () => {
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", { type: "user.archived" }),
    ]);

    expect(tagsFor(plan)).toEqual({ "userEventsConsumer::onUnknownEvent": ["m1"] });
    expect(plan.unrouted).toEqual([]);
  });

  it("sends a message with no routing field to the fallback handler", () => {
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", { userId: "u1" }),
    ]);

    expect(tagsFor(plan)).toEqual({ "userEventsConsumer::onUnknownEvent": ["m1"] });
  });

  it("reports an unmatched route as unrouted when there is no fallback", () => {
    // Dropping it would delete the message from the source and lose it silently.
    const plan = planRouting(registryWithRoutes(false), "userEventsConsumer", "type", [
      message("m1", { type: "user.archived" }),
    ]);

    expect(plan.batches).toEqual([]);
    expect(plan.unrouted).toHaveLength(1);
    expect(plan.unrouted[0].message.messageId).toBe("m1");
    expect(plan.unrouted[0].reason).toContain('no @MessageHandler("user.archived")');
  });

  it("reports a body that is not JSON as unrouted rather than failing the batch", () => {
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", "not json at all"),
      message("m2", { type: "user.created" }),
    ]);

    expect(tagsFor(plan)).toEqual({ "userEventsConsumer::onUserCreated": ["m2"] });
    expect(plan.unrouted).toHaveLength(1);
    expect(plan.unrouted[0].reason).toContain("not JSON");
  });

  it("reports a body that is JSON but not an object as unrouted", () => {
    const plan = planRouting(registryWithRoutes(), "userEventsConsumer", "type", [
      message("m1", JSON.stringify([1, 2, 3])),
    ]);

    expect(plan.unrouted[0].reason).toContain("not a JSON object");
  });

  it("routes on a non-string discriminator", () => {
    const registry = new HandlerRegistry();
    registerHandler(registry, "versionedConsumer", "onV1", "1");
    registerHandler(registry, "versionedConsumer", "onV2", "2");

    const plan = planRouting(registry, "versionedConsumer", "version", [
      message("m1", { version: 1 }),
      message("m2", { version: 2 }),
    ]);

    expect(tagsFor(plan)).toEqual({
      "versionedConsumer::onV1": ["m1"],
      "versionedConsumer::onV2": ["m2"],
    });
  });

  it("ignores handlers belonging to a different consumer", () => {
    // One function serves one consumer; another consumer's identically routed
    // handler must not receive its messages.
    const registry = registryWithRoutes();
    registerHandler(registry, "otherConsumer", "onUserCreated", "user.created");

    const plan = planRouting(registry, "userEventsConsumer", "type", [
      message("m1", { type: "user.created" }),
    ]);

    expect(tagsFor(plan)).toEqual({ "userEventsConsumer::onUserCreated": ["m1"] });
  });

  it("routes on a field other than the default", () => {
    const registry = new HandlerRegistry();
    registerHandler(registry, "c", "onA", "a");
    const plan = planRouting(registry, "c", "eventName", [message("m1", { eventName: "a" })]);

    expect(tagsFor(plan)).toEqual({ "c::onA": ["m1"] });
  });
});

describe("routesAsConsumer", () => {
  it("recognises a tag that names a consumer with handlers", () => {
    expect(routesAsConsumer(registryWithRoutes(), "userEventsConsumer")).toBe(true);
  });

  it("does not claim a tag that is itself a registered handler", () => {
    // Precedence matters: an existing single-handler function is tagged
    // `<consumer>::<method>` and must keep resolving as a handler.
    expect(
      routesAsConsumer(registryWithRoutes(), "userEventsConsumer::onUserCreated"),
    ).toBe(false);
  });

  it("does not claim an unknown tag", () => {
    expect(routesAsConsumer(registryWithRoutes(), "somethingElse")).toBe(false);
  });

  it("does not claim an empty tag", () => {
    expect(routesAsConsumer(registryWithRoutes(), "")).toBe(false);
  });

  it("recognises a consumer whose only handler is the fallback", () => {
    const registry = new HandlerRegistry();
    registerHandler(registry, "plainConsumer", "handle");
    expect(routesAsConsumer(registry, "plainConsumer")).toBe(true);
  });
});

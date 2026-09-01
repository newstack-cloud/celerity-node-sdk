import createDebug from "debug";
import type { ConsumerMessage } from "@celerity-sdk/types";
import type { ResolvedConsumerHandler } from "./types";
import type { HandlerRegistry } from "./registry";

const debug = createDebug("celerity:core:consumer-router");

/** One handler and the subset of the batch that routes to it. */
export type RoutedBatch = {
  handler: ResolvedConsumerHandler;
  messages: ConsumerMessage[];
};

/**
 * The messages of a batch that could not be routed anywhere.
 *
 * A consumer with no fallback handler leaves any unmatched message with nowhere
 * to go. Reporting them rather than dropping them lets the caller fail them back
 * to the source for redelivery, which is how an unroutable message should be handled,
 * silently deleting it loses data for a reason the author never expressed.
 */
export type UnroutedMessage = {
  message: ConsumerMessage;
  reason: string;
};

export type RoutingPlan = {
  batches: RoutedBatch[];
  unrouted: UnroutedMessage[];
};

/**
 * Splits a batch across the handlers of one consumer, by the value of the
 * consumer's routing field in each message body.
 *
 * This exists because a routed consumer in a serverless deployment
 * is one function, not one per handler.
 * Giving every handler its own serverless function and pointing them all at the same queue
 * does not route, what happens instead is that the source hands each message to whichever consumer polls
 * first, so the declared routing key never applies and the message is processed
 * by an arbitrary handler. Routing therefore has to happen after delivery, in
 * the function that received the batch.
 *
 * Messages are grouped rather than dispatched one at a time so a handler still
 * receives a batch, which is the contract its signature declares and what makes
 * batch-wide work (a single write, one transaction) possible.
 */
export function planRouting(
  registry: HandlerRegistry,
  consumerName: string,
  routingKey: string,
  messages: ConsumerMessage[],
): RoutingPlan {
  const handlers = registry
    .getHandlersByType("consumer")
    .filter((handler) => handler.consumerName === consumerName);

  const byRoute = new Map<string, ResolvedConsumerHandler>();
  let fallback: ResolvedConsumerHandler | undefined;
  for (const handler of handlers) {
    if (handler.route === undefined) {
      fallback = handler;
      continue;
    }
    byRoute.set(handler.route, handler);
  }

  debug(
    "planRouting consumer=%s key=%s handlers=%d routes=[%s] fallback=%s",
    consumerName,
    routingKey,
    handlers.length,
    [...byRoute.keys()].join(","),
    fallback ? fallback.handlerTag : "none",
  );

  const grouped = new Map<ResolvedConsumerHandler, ConsumerMessage[]>();
  const unrouted: UnroutedMessage[] = [];

  for (const message of messages) {
    const { value, error } = readRoute(message, routingKey);
    if (error) {
      unrouted.push({ message, reason: error });
      continue;
    }

    const handler = (value !== undefined ? byRoute.get(value) : undefined) ?? fallback;
    if (!handler) {
      unrouted.push({
        message,
        reason:
          value === undefined
            ? `no "${routingKey}" field in the message body, and consumer "${consumerName}" has no fallback @MessageHandler()`
            : `no @MessageHandler("${value}") on consumer "${consumerName}", and it has no fallback @MessageHandler()`,
      });
      continue;
    }

    const existing = grouped.get(handler);
    if (existing) existing.push(message);
    else grouped.set(handler, [message]);
  }

  return {
    batches: [...grouped].map(([handler, msgs]) => ({ handler, messages: msgs })),
    unrouted,
  };
}

/**
 * Reads the routing field from a message body.
 *
 * A body that is not JSON, or not an object, cannot be routed on a field, and
 * that is reported rather than treated as "no route", the two cases call for different
 * fixes and collapsing them sends the author looking in the wrong place. A
 * non-string route value is read through String() so a numeric or boolean
 * discriminator works, which is a reasonable thing to route on.
 */
function readRoute(
  message: ConsumerMessage,
  routingKey: string,
): { value?: string; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.body);
  } catch {
    return { error: `the message body is not JSON, so "${routingKey}" cannot be read from it` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      error: `the message body is not a JSON object, so "${routingKey}" cannot be read from it`,
    };
  }

  const value = (parsed as Record<string, unknown>)[routingKey];
  if (value === undefined || value === null) return {};
  if (typeof value === "object") {
    return { error: `the "${routingKey}" field is an object, which cannot select a handler` };
  }
  return { value: String(value) };
}

/**
 * Reports whether a tag addresses a whole consumer rather than one of its
 * handlers.
 *
 * The handler tag stays the single way a function says which handler it serves;
 * for a routed consumer it names the consumer instead of a method. Callers check
 * this before resolving the tag as a handler, so a tag only reads as a consumer
 * when nothing is registered under it as a handler.
 */
export function routesAsConsumer(registry: HandlerRegistry, tag: string): boolean {
  if (!tag) return false;
  if (registry.getHandler("consumer", tag)) return false;

  return registry.getHandlersByType("consumer").some((handler) => handler.consumerName === tag);
}

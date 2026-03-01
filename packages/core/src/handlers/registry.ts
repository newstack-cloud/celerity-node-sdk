import createDebug from "debug";
import type {
  HandlerType,
  ResolvedHandler,
  ResolvedHttpHandler,
  ResolvedWebSocketHandler,
  ResolvedConsumerHandler,
  ResolvedScheduleHandler,
  ResolvedCustomHandler,
  ResolvedGuard,
} from "./types";
import { routingKeyOf } from "./routing";

const debug = createDebug("celerity:core:registry");

export class HandlerRegistry {
  private byType = new Map<HandlerType, ResolvedHandler[]>();
  private exactLookup = new Map<string, ResolvedHandler>();
  private byId = new Map<string, ResolvedHandler>();
  private guards = new Map<string, ResolvedGuard>();

  register(handler: ResolvedHandler): void {
    const list = this.byType.get(handler.type) ?? [];
    list.push(handler);
    this.byType.set(handler.type, list);

    // Non-HTTP types use O(1) exact-match lookup.
    // HTTP uses path-pattern matching (e.g., /items/{id} matches /items/42).
    if (handler.type !== "http") {
      this.exactLookup.set(`${handler.type}::${routingKeyOf(handler)}`, handler);
    }

    if (handler.id) {
      this.byId.set(handler.id, handler);
    }
  }

  getHandler(type: "http", routingKey: string): ResolvedHttpHandler | undefined;
  getHandler(type: "websocket", routingKey: string): ResolvedWebSocketHandler | undefined;
  getHandler(type: "consumer", routingKey: string): ResolvedConsumerHandler | undefined;
  getHandler(type: "schedule", routingKey: string): ResolvedScheduleHandler | undefined;
  getHandler(type: "custom", routingKey: string): ResolvedCustomHandler | undefined;
  getHandler(type: HandlerType, routingKey: string): ResolvedHandler | undefined {
    if (type === "http") return this.findHttpHandler(routingKey);
    const found = this.exactLookup.get(`${type}::${routingKey}`);
    debug("getHandler %s %s → %s", type, routingKey, found ? "matched" : "not found");
    return found;
  }

  getHandlerById<T extends HandlerType>(
    type: T,
    id: string,
  ): Extract<ResolvedHandler, { type: T }> | undefined {
    const handler = this.byId.get(id);
    if (handler && handler.type === type) {
      return handler as Extract<ResolvedHandler, { type: T }>;
    }
    debug("getHandlerById %s %s → not found", type, id);
    return undefined;
  }

  getHandlersByType<T extends HandlerType>(type: T): Extract<ResolvedHandler, { type: T }>[] {
    return (this.byType.get(type) ?? []) as Extract<ResolvedHandler, { type: T }>[];
  }

  getAllHandlers(): ResolvedHandler[] {
    const result: ResolvedHandler[] = [];
    for (const list of this.byType.values()) result.push(...list);
    return result;
  }

  registerGuard(guard: ResolvedGuard): void {
    debug("registerGuard: %s", guard.name);
    this.guards.set(guard.name, guard);
  }

  getGuard(name: string): ResolvedGuard | undefined {
    const found = this.guards.get(name);
    debug("getGuard %s → %s", name, found ? "matched" : "not found");
    return found;
  }

  getAllGuards(): ResolvedGuard[] {
    return [...this.guards.values()];
  }

  /**
   * HTTP routing uses path-pattern matching: `"GET /items/{id}"` matches `"GET /items/42"`.
   * The routing key format is `"METHOD path"` (e.g., `"GET /items/{id}"`).
   */
  private findHttpHandler(routingKey: string): ResolvedHttpHandler | undefined {
    const spaceIdx = routingKey.indexOf(" ");
    if (spaceIdx < 0) return undefined;
    const method = routingKey.slice(0, spaceIdx);
    const path = routingKey.slice(spaceIdx + 1);
    const httpHandlers = (this.byType.get("http") ?? []) as ResolvedHttpHandler[];
    const found = httpHandlers.find(
      (h) =>
        h.path !== undefined &&
        h.method !== undefined &&
        h.method === method &&
        matchRoute(h.path, path),
    );
    debug("getHandler http %s → %s", routingKey, found ? "matched" : "not found");
    return found;
  }
}

function matchRoute(pattern: string, actual: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);

  if (patternParts.length !== actualParts.length) return false;

  return patternParts.every((part, i) => part.startsWith("{") || part === actualParts[i]);
}

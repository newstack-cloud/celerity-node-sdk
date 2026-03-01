import "reflect-metadata";
import type { WebSocketEventType } from "@celerity-sdk/types";
import {
  WEBSOCKET_CONTROLLER_METADATA,
  WEBSOCKET_EVENT_METADATA,
  INJECTABLE_METADATA,
} from "../metadata/constants";

export type WebSocketEventMetadata = {
  eventType: WebSocketEventType;
  route: string;
};

/**
 * Marks a class as a WebSocket controller. The class becomes injectable and
 * its `@OnConnect()`, `@OnMessage()`, and `@OnDisconnect()` methods are
 * registered as WebSocket handler callbacks.
 *
 * @example
 * ```ts
 * @WebSocketController()
 * class ChatHandler {
 *   @OnMessage("chat")
 *   async onChat(@ConnectionId() id: string, @MessageBody() body: unknown): Promise<void> { ... }
 * }
 * ```
 */
export function WebSocketController(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(WEBSOCKET_CONTROLLER_METADATA, true, target);
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}

/**
 * Handles WebSocket connection events. Invoked when a client establishes a
 * new WebSocket connection. Registered with the fixed route `$connect`.
 */
export function OnConnect(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const meta: WebSocketEventMetadata = { eventType: "connect", route: "$connect" };
    Reflect.defineMetadata(WEBSOCKET_EVENT_METADATA, meta, target, propertyKey);
    return descriptor;
  };
}

/**
 * Handles WebSocket message events. Invoked when a connected client sends
 * a message.
 *
 * @param route - Optional route key for message dispatching. Defaults to
 *   `$default` which catches all messages not matched by a specific route.
 *   Custom routes enable action-based routing (e.g. `"chat"`, `"ping"`).
 */
export function OnMessage(route?: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const meta: WebSocketEventMetadata = {
      eventType: "message",
      route: route ?? "$default",
    };
    Reflect.defineMetadata(WEBSOCKET_EVENT_METADATA, meta, target, propertyKey);
    return descriptor;
  };
}

/**
 * Handles WebSocket disconnection events. Invoked when a client disconnects.
 * Registered with the fixed route `$disconnect`.
 */
export function OnDisconnect(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const meta: WebSocketEventMetadata = { eventType: "disconnect", route: "$disconnect" };
    Reflect.defineMetadata(WEBSOCKET_EVENT_METADATA, meta, target, propertyKey);
    return descriptor;
  };
}

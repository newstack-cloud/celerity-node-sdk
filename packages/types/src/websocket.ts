import type { BaseHandlerContext } from "./handler";

export type WebSocketEventType = "connect" | "message" | "disconnect";
export type WebSocketMessageType = "json" | "binary";

/** SDK representation of a WebSocket message from the runtime. */
export type WebSocketMessage = {
  messageType: WebSocketMessageType;
  eventType: WebSocketEventType;
  connectionId: string;
  messageId: string;
  jsonBody?: unknown;
  binaryBody?: Buffer;
  requestContext?: WebSocketRequestContext;
  traceContext?: Record<string, string> | null;
};

/** HTTP context from the original WebSocket upgrade request. */
export type WebSocketRequestContext = {
  requestId: string;
  requestTime: number;
  path: string;
  protocolVersion: string;
  headers: Record<string, string | string[]>;
  userAgent?: string;
  clientIp: string;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  auth?: Record<string, unknown>;
  traceContext?: Record<string, string>;
};

/** Context for WebSocket handlers. */
export type WebSocketHandlerContext = BaseHandlerContext & {
  message: WebSocketMessage;
};

export type WebSocketSendOptions = {
  messageId?: string;
  messageType?: "json" | "binary";
};

/** Platform-agnostic abstraction for sending WebSocket messages. */
export interface WebSocketSender {
  /** Send a message to a specific WebSocket connection. */
  sendMessage(connectionId: string, data: unknown, options?: WebSocketSendOptions): Promise<void>;
}

/**
 * DI token for WebSocketSender.
 * TypeScript uses the interface in type position and the symbol in value position.
 */
export const WebSocketSender: unique symbol = Symbol.for("celerity:websocket-sender");

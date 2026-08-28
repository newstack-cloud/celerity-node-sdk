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
  /**
   * Identifies the message to the runtime, for the acknowledgement between
   * nodes when the connection lives on another one, and in the loss event sent
   * to the clients named in `informClientsOnLoss`. Generated when left unset,
   * which is the right choice unless the caller needs to match a loss event
   * back to what it sent.
   *
   * Not the id the client sees. The message is sent to the socket exactly as
   * given, so a client-visible id belongs in the payload.
   */
  messageId?: string;
  /**
   * Wait for the client to acknowledge the message, rather than returning once
   * it has been written to the socket. The returned promise rejects where the
   * client never acknowledges it.
   *
   * The message has to ask the client for an acknowledgement in the payload it
   * carries, which the runtime does not compose. Setting this for one that asks
   * nothing waits until the runtime declares the message lost.
   *
   * Only under the Celerity runtime. A serverless adapter pushes through the
   * provider's own API, which has no such notion, and ignores this.
   */
  waitForAck?: boolean;
  /**
   * Connections to notify if the message cannot be delivered. They receive a
   * lost message event naming it, whether or not `waitForAck` was set.
   *
   * Only under the Celerity runtime, as above.
   */
  informClientsOnLoss?: string[];
  /**
   * The connection that caused this message to be sent, carried through to the
   * loss event so an informed client can tell who was being replied to. Only
   * meaningful alongside `informClientsOnLoss`.
   *
   * Only under the Celerity runtime, as above.
   */
  caller?: string;
};

/** One message in a call to `sendMessages`. */
export type OutboundMessage = {
  connectionId: string;
  data: unknown;
} & WebSocketSendOptions;

/**
 * One message in a call to `sendBinaryMessages`.
 *
 * The parts are kept separate rather than flattened as {@link OutboundMessage}
 * flattens its options, because both halves have a `messageId` and they are
 * different things: the one in `parts` is carried inside the frame and is what
 * an acknowledgement names, and the one in `options` is the runtime's own
 * handle for the send. Flattening them would silently make one of them
 * unreachable.
 */
export type OutboundBinaryMessage = {
  connectionId: string;
  parts: BinaryMessageParts;
  options?: WebSocketSendOptions;
};

/** One message in a batch that could not be delivered. */
export type SendFailure = {
  /**
   * Where the message sat in the batch. The id is not used, since the runtime
   * generates one where the caller did not supply it, so the caller may never
   * have seen it.
   */
  index: number;
  connectionId: string;
  error: string;
};

/**
 * Thrown by `sendMessages` where any message in the batch failed.
 *
 * Failures are per message so a caller can retry exactly what failed.
 * Resending a whole batch would redeliver the messages that did arrive, and
 * whether the client can tell those apart depends on the message ID: a client
 * SDK deduplicates by that where a message carries one, and cannot where it
 * does not.
 */
export class SendError extends Error {
  constructor(readonly failures: SendFailure[]) {
    super(
      failures.length === 1
        ? `websocket send failed for 1 message: ${failures[0].error}`
        : `websocket send failed for ${failures.length} messages`,
    );
    this.name = "SendError";
  }

  /** Whether the message at this position in the batch failed. */
  failed(index: number): boolean {
    return this.failures.some((failure) => failure.index === index);
  }
}

/**
 * Platform-agnostic abstraction for sending WebSocket messages.
 *
 * Under the Celerity runtime this reaches the connection wherever it is, on
 * this node or another one in a cluster. Under a serverless adapter it is the
 * provider's own push API, which supports fewer of the options above.
 */
export interface WebSocketSender {
  /** Send a message to a specific WebSocket connection. */
  sendMessage(connectionId: string, data: unknown, options?: WebSocketSendOptions): Promise<void>;
  /**
   * Send several messages, resolving once every outcome is known.
   *
   * The messages are sent alongside each other rather than one after another,
   * which matters where they ask their clients to acknowledge them, since each
   * of those is a round trip rather than a write.
   *
   * Throws a `SendError` naming exactly which messages failed, by their
   * position in the batch.
   */
  sendMessages(messages: OutboundMessage[]): Promise<void>;
}

/**
 * Sending binary, which only a transport that carries binary frames can do.
 *
 * Kept off {@link WebSocketSender} on purpose. API Gateway WebSocket APIs carry
 * text frames only and reject a client that sends a binary frame by
 * disconnecting it, so this is not something every deploy target can do. A pair
 * of methods on the portable interface would typecheck everywhere and work in
 * one place; a separate interface makes the capability something an application
 * asks about.
 */
export interface BinaryWebSocketSender {
  /**
   * Send bytes to a client, framed in the Celerity Binary Message Format.
   *
   * The caller gives the parts rather than the bytes: a client reads every
   * binary frame that is not a reserved one as a framed message, so unframed
   * bytes are read as a route length and a route, leaving the application a
   * payload short by its own invented header under a route nothing serves.
   */
  sendBinary(
    connectionId: string,
    parts: BinaryMessageParts,
    options?: WebSocketSendOptions,
  ): Promise<void>;
  /**
   * Send several binary messages, resolving once every outcome is known.
   *
   * The batch is framed in full before any of it goes out, and a message whose
   * parts cannot be represented rejects the whole call without sending
   * anything.
   */
  sendBinaryMessages(messages: OutboundBinaryMessage[]): Promise<void>;
}

/**
 * Whether this sender's transport carries binary frames.
 *
 * Asked of the sender rather than of the deploy target, and structurally rather
 * than by class, so an application tests for the capability it needs instead of
 * naming an implementation it happens to know has it:
 *
 * ```ts
 * if (supportsBinary(sender)) {
 *   await sender.sendBinary(connectionId, { route: "price.tick", message: bytes });
 * }
 * ```
 *
 * An application built for the Celerity runtime can narrow once at startup and
 * keep the result, rather than asking at every send.
 */
export function supportsBinary(
  sender: WebSocketSender,
): sender is WebSocketSender & BinaryWebSocketSender {
  const candidate = sender as Partial<BinaryWebSocketSender>;
  return (
    typeof candidate.sendBinary === "function" && typeof candidate.sendBinaryMessages === "function"
  );
}

/**
 * DI token for WebSocketSender.
 * TypeScript uses the interface in type position and the symbol in value position.
 */
export const WebSocketSender: unique symbol = Symbol.for("celerity:websocket-sender");

/**
 * The parts of a message in the Celerity Binary Message Format.
 *
 * Framed and sent by `RuntimeWebSocketSender.sendBinary`, which is where binary
 * lives: the format needs a transport that carries binary frames, and a managed
 * WebSocket gateway does not. This type is the shape of what to send, not a
 * capability every deploy target has.
 */
export type BinaryMessageParts = {
  /** The route the message is delivered by. Required, and at most 255 bytes. */
  route: string;
  /**
   * The id the message is known by, which is what an acknowledgement names,
   * what deduplication keys on and what a loss notification refers to. At most
   * 255 bytes.
   */
  messageId?: string;
  /**
   * Whether the client is being asked to acknowledge this message, which only
   * means anything alongside an id.
   */
  requireAck?: boolean;
  /** The payload, carried without being read. */
  message: Uint8Array;
};

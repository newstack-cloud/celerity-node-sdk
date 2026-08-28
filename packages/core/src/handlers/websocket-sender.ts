import type { CoreWebSocketRegistry, JsSendContext } from "@celerity-sdk/runtime";
import type {
  BinaryMessageParts,
  BinaryWebSocketSender,
  OutboundBinaryMessage,
  OutboundMessage,
  SendFailure,
  WebSocketSender,
  WebSocketSendOptions,
} from "@celerity-sdk/types";
import { SendError } from "@celerity-sdk/types";

export type { CoreWebSocketRegistry } from "@celerity-sdk/runtime";

/**
 * WebSocket sender implementation for local/container deployments.
 * Wraps the NAPI runtime's CoreWebSocketRegistry.
 */
export class RuntimeWebSocketSender implements WebSocketSender, BinaryWebSocketSender {
  constructor(private registry: CoreWebSocketRegistry) {}

  async sendMessage(
    connectionId: string,
    data: unknown,
    options?: WebSocketSendOptions,
  ): Promise<void> {
    const messageId = options?.messageId ?? crypto.randomUUID();
    await this.registry.sendMessage(
      connectionId,
      messageId,
      "json" as Parameters<CoreWebSocketRegistry["sendMessage"]>[2],
      typeof data === "string" ? data : JSON.stringify(data),
      sendContext(options),
    );
  }

  async sendMessages(messages: OutboundMessage[]): Promise<void> {
    // Sent alongside each other rather than one after another. Each crossing
    // into the runtime is cheap, but a message asking its client to
    // acknowledge it is not answered until that client does, and there is no
    // reason for the rest of the batch to wait on that.
    const outcomes = await Promise.allSettled(
      messages.map(({ connectionId, data, ...options }) =>
        this.sendMessage(connectionId, data, options),
      ),
    );

    const failures = outcomes.flatMap<SendFailure>((outcome, index) =>
      outcome.status === "rejected"
        ? [
            {
              index,
              connectionId: messages[index].connectionId,
              error: errorMessage(outcome.reason),
            },
          ]
        : [],
    );

    if (failures.length > 0) {
      throw new SendError(failures);
    }
  }

  /**
   * Sends bytes to a client, framed in the Celerity Binary Message Format.
   *
   * This is deliberately not a part of {@link WebSocketSender}.
   * Binary frames are a capability
   * of the transport, not of the SDK: a managed WebSocket gateway carries text
   * frames only, and rejects a client that sends a binary frame outright. An
   * application reaching for this is reaching for the Celerity runtime, and
   * having to name the runtime sender to do so is the point.
   *
   * `parts.messageId` is what an acknowledgement names, and is required when
   * `parts.requireAck` is set. `options.messageId` is the runtime's own handle
   * for the send, which is a different thing; where the two matter together,
   * set both.
   */
  async sendBinary(
    connectionId: string,
    parts: BinaryMessageParts,
    options?: WebSocketSendOptions,
  ): Promise<void> {
    await this.send(connectionId, await encodeFrame(parts), options);
  }

  /**
   * Sends several binary messages, resolving once every outcome is known.
   *
   * The batch is framed in full before any of it goes out, and a message whose
   * parts cannot be represented rejects the whole call without sending
   * anything. That is deliberately unlike {@link sendMessages}, where each
   * message stands alone: a frame that cannot be composed is a mistake in the
   * calling code rather than something that went wrong on the way, and sending
   * the messages before it would leave the client a partial batch to make sense
   * of while the caller fixes a bug.
   *
   * Once framed, the sends proceed alongside each other and a failure is
   * reported per message, as `sendMessages` reports it.
   * A message asking its client to acknowledge it is a round trip,
   * and there is no reason for the rest of the batch to wait on that.
   */
  async sendBinaryMessages(messages: OutboundBinaryMessage[]): Promise<void> {
    const framed = await Promise.all(messages.map((message) => encodeFrame(message.parts)));

    const outcomes = await Promise.allSettled(
      messages.map((message, index) =>
        this.send(message.connectionId, framed[index], message.options),
      ),
    );

    const failures = outcomes.flatMap<SendFailure>((outcome, index) =>
      outcome.status === "rejected"
        ? [
            {
              index,
              connectionId: messages[index].connectionId,
              error: errorMessage(outcome.reason),
            },
          ]
        : [],
    );

    if (failures.length > 0) {
      throw new SendError(failures);
    }
  }

  private async send(
    connectionId: string,
    framed: string,
    options?: WebSocketSendOptions,
  ): Promise<void> {
    await this.registry.sendMessage(
      connectionId,
      options?.messageId ?? crypto.randomUUID(),
      "binary" as Parameters<CoreWebSocketRegistry["sendMessage"]>[2],
      framed,
      sendContext(options),
    );
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

type RuntimeBinaryFraming = {
  encodeBinaryMessage(input: {
    route: string;
    messageId?: string;
    requireAck?: boolean;
    message: Buffer;
  }): string;
};

// Loaded once and kept, rather than per message as framing a batch would
// otherwise import the module once for each message in it which is unnecessary.
//
// Dynamic, and through a variable so TypeScript does not resolve it
// statically: @celerity-sdk/runtime is an optional peer dependency, and an
// application that never sends a binary message must not need it installed.
let runtime: Promise<RuntimeBinaryFraming> | null = null;

function loadRuntime(): Promise<RuntimeBinaryFraming> {
  const pkg = "@celerity-sdk/runtime";
  runtime ??= import(pkg).then((module) => module as RuntimeBinaryFraming);
  return runtime;
}

async function encodeFrame(parts: BinaryMessageParts): Promise<string> {
  const { encodeBinaryMessage } = await loadRuntime();

  return encodeBinaryMessage({
    route: parts.route,
    messageId: parts.messageId,
    requireAck: parts.requireAck,
    message: Buffer.from(parts.message.buffer, parts.message.byteOffset, parts.message.byteLength),
  });
}

/**
 * What the runtime needs beyond the message itself, where the caller asked for
 * anything at all.
 *
 * Undefined where it asked for none of it, which is the common case and the one
 * that returns once the message has been written to the socket.
 */
function sendContext(options?: WebSocketSendOptions): JsSendContext | undefined {
  const informClients = options?.informClientsOnLoss ?? [];
  if (!options?.waitForAck && informClients.length === 0) {
    return undefined;
  }
  return {
    waitForAck: options?.waitForAck ?? false,
    informClients,
    caller: options?.caller,
  };
}

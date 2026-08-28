import createDebug from "debug";
import type {
  OutboundMessage,
  SendFailure,
  WebSocketSender,
  WebSocketSendOptions,
} from "@celerity-sdk/types";
import { SendError } from "@celerity-sdk/types";

const debug = createDebug("celerity:serverless-aws");

// Dynamic import path (variable prevents static TS resolution)
const API_GW_MGMT_PKG = "@aws-sdk/client-apigatewaymanagementapi";

/**
 * Pushes through the API Gateway Management API.
 *
 * The acknowledgement options on {@link WebSocketSendOptions} are ignored as API
 * Gateway reports whether it accepted the message, and nothing about what the
 * client made of it, so there is nothing to wait for and no loss event to send.
 *
 * The transport carries text frames only. API Gateway WebSocket APIs do not
 * support binary frames in either direction, a client sending one is rejected
 * and disconnected with close code 1003; this is why binary is not on
 * {@link WebSocketSender} at all, but on the runtime sender that has a
 * transport for it. An application with bytes to send from here encodes them
 * into its own message and sends that as JSON.
 */
export class ApiGatewayWebSocketSender implements WebSocketSender {
  private client: unknown = null;

  constructor(private endpoint: string) {
    debug("ApiGatewayWebSocketSender: created with endpoint=%s", endpoint);
  }

  async sendMessage(
    connectionId: string,
    data: unknown,
    _options?: WebSocketSendOptions,
  ): Promise<void> {
    const client = await this.getClient();

    const { PostToConnectionCommand } = await import(API_GW_MGMT_PKG);
    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: encode(data),
      }),
    );

    debug("ApiGatewayWebSocketSender: sent message to connectionId=%s", connectionId);
  }

  async sendMessages(messages: OutboundMessage[]): Promise<void> {
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
              error:
                outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
            },
          ]
        : [],
    );

    if (failures.length > 0) {
      throw new SendError(failures);
    }
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      const { ApiGatewayManagementApiClient } = await import(API_GW_MGMT_PKG);
      this.client = new ApiGatewayManagementApiClient({ endpoint: this.endpoint });
      debug("ApiGatewayWebSocketSender: client initialized for endpoint=%s", this.endpoint);
    }
    return this.client;
  }
}

/**
 * The bytes to post to the connection, which are always a text frame's worth.
 *
 * A string is taken as already being the message, so an application that
 * composed its own JSON is not handed back a quoted copy of it.
 */
function encode(data: unknown): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return new TextEncoder().encode(payload);
}

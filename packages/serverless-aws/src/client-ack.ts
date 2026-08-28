/**
 * Client requested acknowledgements, in the JSON form a constrained transport
 * leaves as the only one.
 *
 * API Gateway WebSocket APIs carry text frames only, a client sending a binary
 * frame is rejected and disconnected with close code 1003.
 * For this reason, the capabilities signal `[0x1 0x5 0x0 0x0]` physically cannot reach a client here.
 * Its absence is what tells the client it is in a constrained environment, where the
 * protocol specifies acknowledgements as JSON text rather than binary control
 * frames.
 *
 * See the WebSocket Runtime Protocol, Server Capabilities and Acknowledgements:
 * https://celerityframework.io/docs/framework/runtime/websocket-runtime-protocol
 */

/**
 * Extracts the ID of the message the client asked to have acknowledged,
 * if it asked.
 */
export function clientAckRequest(jsonBody: unknown): string | null {
  if (typeof jsonBody !== "object" || jsonBody === null || Array.isArray(jsonBody)) {
    return null;
  }

  const body = jsonBody as Record<string, unknown>;
  if (body.ack !== true) return null;

  const messageId = body.messageId;
  if (typeof messageId !== "string" || messageId.length === 0) return null;

  return messageId;
}

/**
 * Returns the acknowledgement to send back, as a JSON text message.
 *
 * The `event` key is the protocol's own rather than the API's configured route
 * key, and holds the reserved value `ack`. An acknowledgement is a control
 * message the client recognises, not one the server routes, so it does not
 * follow the application's routing configuration.
 */
export function composeClientAck(messageId: string, epochSeconds: number): string {
  return JSON.stringify({
    event: "ack",
    data: { messageId, timestamp: String(epochSeconds) },
  });
}

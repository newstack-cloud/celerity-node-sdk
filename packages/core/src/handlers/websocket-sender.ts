import type { CoreWebSocketRegistry } from "@celerity-sdk/runtime";
import type { WebSocketSender, WebSocketSendOptions } from "@celerity-sdk/types";

export type { CoreWebSocketRegistry } from "@celerity-sdk/runtime";

/**
 * WebSocket sender implementation for local/container deployments.
 * Wraps the NAPI runtime's CoreWebSocketRegistry.
 */
export class RuntimeWebSocketSender implements WebSocketSender {
  constructor(private registry: CoreWebSocketRegistry) {}

  async sendMessage(
    connectionId: string,
    data: unknown,
    options?: WebSocketSendOptions,
  ): Promise<void> {
    const messageId = options?.messageId ?? crypto.randomUUID();
    const messageType = options?.messageType === "binary" ? "binary" : "json";
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    await this.registry.sendMessage(
      connectionId,
      messageId,
      messageType as Parameters<CoreWebSocketRegistry["sendMessage"]>[2],
      payload,
    );
  }
}

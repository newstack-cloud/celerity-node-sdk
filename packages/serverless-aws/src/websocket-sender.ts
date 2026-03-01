import createDebug from "debug";
import type { WebSocketSender, WebSocketSendOptions } from "@celerity-sdk/types";

const debug = createDebug("celerity:serverless-aws");

// Dynamic import path (variable prevents static TS resolution)
const API_GW_MGMT_PKG = "@aws-sdk/client-apigatewaymanagementapi";

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
    const payload = typeof data === "string" ? data : JSON.stringify(data);

    const { PostToConnectionCommand } = await import(API_GW_MGMT_PKG);
    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: new TextEncoder().encode(payload),
      }),
    );

    debug("ApiGatewayWebSocketSender: sent message to connectionId=%s", connectionId);
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

import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are available before vi.mock factory runs
const { mockSend, mockApiGatewayManagementApiClient, mockPostToConnectionCommand } = vi.hoisted(
  () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const mockPostToConnectionCommand = vi.fn();
    const mockApiGatewayManagementApiClient = vi.fn(() => ({
      send: mockSend,
    }));
    return { mockSend, mockApiGatewayManagementApiClient, mockPostToConnectionCommand };
  },
);

// Pass mock fns directly (vi.fn() creates regular functions, usable as constructors)
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: mockApiGatewayManagementApiClient,
  PostToConnectionCommand: mockPostToConnectionCommand,
}));

import { ApiGatewayWebSocketSender } from "../src/websocket-sender";

describe("ApiGatewayWebSocketSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs with an endpoint", () => {
    const sender = new ApiGatewayWebSocketSender("https://ws.example.com/prod");
    expect(sender).toBeDefined();
  });

  it("sends a string message as-is", async () => {
    const sender = new ApiGatewayWebSocketSender("https://ws.example.com/prod");

    await sender.sendMessage("conn-123", "hello world");

    expect(mockApiGatewayManagementApiClient).toHaveBeenCalledWith({
      endpoint: "https://ws.example.com/prod",
    });
    expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
      ConnectionId: "conn-123",
      Data: new TextEncoder().encode("hello world"),
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("JSON-stringifies non-string data", async () => {
    const sender = new ApiGatewayWebSocketSender("https://ws.example.com/prod");
    const data = { action: "broadcast", text: "hi" };

    await sender.sendMessage("conn-456", data);

    expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
      ConnectionId: "conn-456",
      Data: new TextEncoder().encode(JSON.stringify(data)),
    });
  });

  it("lazily creates the client on first sendMessage", async () => {
    const sender = new ApiGatewayWebSocketSender("https://ws.example.com/prod");

    // No client created yet
    expect(mockApiGatewayManagementApiClient).not.toHaveBeenCalled();

    await sender.sendMessage("conn-1", "msg1");
    expect(mockApiGatewayManagementApiClient).toHaveBeenCalledTimes(1);

    // Second call reuses the client
    await sender.sendMessage("conn-2", "msg2");
    expect(mockApiGatewayManagementApiClient).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

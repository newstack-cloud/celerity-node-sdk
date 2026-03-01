import { describe, it, expect, vi } from "vitest";
import { RuntimeWebSocketSender } from "../../src/handlers/websocket-sender";

describe("RuntimeWebSocketSender", () => {
  it("sends JSON data as a serialized string", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", { hello: "world" });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      '{"hello":"world"}',
    );
  });

  it("sends string data as-is", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", "raw text");

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      "raw text",
    );
  });

  it("uses binary messageType when specified", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", { data: true }, { messageType: "binary" });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "binary",
      '{"data":true}',
    );
  });

  it("serializes number values to JSON strings", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", 42);

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      "42",
    );
  });

  it("uses provided messageId when given", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", "hello", { messageId: "msg-42" });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith("conn-1", "msg-42", "json", "hello");
  });

  it("generates a unique messageId when not provided", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", "a");
    await sender.sendMessage("conn-1", "b");

    const id1 = mockRegistry.sendMessage.mock.calls[0][1] as string;
    const id2 = mockRegistry.sendMessage.mock.calls[1][1] as string;
    expect(id1).not.toBe(id2);
  });
});

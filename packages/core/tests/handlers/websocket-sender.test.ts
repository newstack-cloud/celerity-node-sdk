import { describe, it, expect, vi } from "vitest";
import { SendError } from "@celerity-sdk/types";
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
      undefined,
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
      undefined,
    );
  });

  // Everything the runtime does for an acknowledgement, waiting for the client,
  // sending again while attempts remain and declaring the message lost, happens
  // only if the request reaches it.
  it("passes a requested acknowledgement to the runtime", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", { hello: "world" }, { waitForAck: true });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      '{"hello":"world"}',
      { waitForAck: true, informClients: [], caller: undefined },
    );
  });

  it("passes the clients to inform and the caller they were replying to", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage(
      "conn-1",
      { hello: "world" },
      { informClientsOnLoss: ["conn-2"], caller: "conn-3" },
    );

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      '{"hello":"world"}',
      { waitForAck: false, informClients: ["conn-2"], caller: "conn-3" },
    );
  });

  it("passes no context for a message that asked for nothing", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", { hello: "world" });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "json",
      '{"hello":"world"}',
      undefined,
    );
  });

  // Binary is not something the portable interface can be asked for, it needs a
  // transport that carries binary frames, and a managed WebSocket gateway does
  // not have one. `sendBinary` on this sender is where it lives, covered in
  // binary-frame.test.ts.
  it("sends every message on the portable interface as text", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", { hello: "world" });

    expect(mockRegistry.sendMessage.mock.calls[0][2]).toBe("json");
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
      undefined,
    );
  });

  it("uses provided messageId when given", async () => {
    const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const sender = new RuntimeWebSocketSender(mockRegistry as never);

    await sender.sendMessage("conn-1", "hello", { messageId: "msg-42" });

    expect(mockRegistry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      "msg-42",
      "json",
      "hello",
      undefined,
    );
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

  describe("sendMessages", () => {
    it("sends every message and resolves once they are all done", async () => {
      const mockRegistry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
      const sender = new RuntimeWebSocketSender(mockRegistry as never);

      await sender.sendMessages([
        { connectionId: "conn-1", data: "a" },
        { connectionId: "conn-2", data: "b", waitForAck: true },
      ]);

      expect(mockRegistry.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockRegistry.sendMessage.mock.calls[1][4]).toEqual({
        waitForAck: true,
        informClients: [],
        caller: undefined,
      });
    });

    // Reported per message so a caller can retry exactly those rather than the
    // whole batch, which would redeliver the messages that did arrive.
    it("names which messages failed, by their place in the batch", async () => {
      const mockRegistry = {
        sendMessage: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("gone"))
          .mockResolvedValueOnce(undefined),
      };
      const sender = new RuntimeWebSocketSender(mockRegistry as never);

      const sending = sender.sendMessages([
        { connectionId: "conn-1", data: "a" },
        { connectionId: "conn-2", data: "b" },
        { connectionId: "conn-3", data: "c" },
      ]);

      await expect(sending).rejects.toBeInstanceOf(SendError);
      const error = await sending.catch((err: SendError) => err) as SendError;
      expect(error.failures).toEqual([{ index: 1, connectionId: "conn-2", error: "gone" }]);
      expect(error.failed(1)).toBe(true);
      expect(error.failed(0)).toBe(false);
    });

    // One message waiting on its client is exactly when a batch should not be
    // sent one after another.
    it("does not hold a message back while an earlier one waits", async () => {
      let releaseFirst: () => void = () => {};
      const firstSettled = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const started: string[] = [];
      const mockRegistry = {
        sendMessage: vi.fn().mockImplementation((connectionId: string) => {
          started.push(connectionId);
          return connectionId === "conn-slow" ? firstSettled : Promise.resolve();
        }),
      };
      const sender = new RuntimeWebSocketSender(mockRegistry as never);

      const sending = sender.sendMessages([
        { connectionId: "conn-slow", data: "a", waitForAck: true },
        { connectionId: "conn-fast", data: "b" },
      ]);

      await vi.waitFor(() => expect(started).toContain("conn-fast"));
      releaseFirst();
      await expect(sending).resolves.toBeUndefined();
    });
  });
});

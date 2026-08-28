import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendError, supportsBinary } from "@celerity-sdk/types";

const encodeBinaryMessage = vi.fn();

vi.mock("@celerity-sdk/runtime", () => ({
  encodeBinaryMessage: (...args: unknown[]) => encodeBinaryMessage(...args),
}));

const { RuntimeWebSocketSender } = await import("../../src/handlers/websocket-sender");

function senderWithRegistry() {
  const registry = { sendMessage: vi.fn().mockResolvedValue(undefined) };
  return { registry, sender: new RuntimeWebSocketSender(registry as never) };
}

describe("RuntimeWebSocketSender.sendBinary", () => {
  beforeEach(() => {
    encodeBinaryMessage.mockReset();
    encodeBinaryMessage.mockReturnValue("ZnJhbWU=");
  });

  it("frames through the runtime and sends the frame as binary", async () => {
    const { registry, sender } = senderWithRegistry();

    await sender.sendBinary("conn-1", {
      route: "price.tick",
      messageId: "m-1",
      requireAck: true,
      message: new Uint8Array([0xde, 0xad]),
    });

    expect(encodeBinaryMessage).toHaveBeenCalledWith({
      route: "price.tick",
      messageId: "m-1",
      requireAck: true,
      message: expect.any(Buffer),
    });
    expect(registry.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.any(String),
      "binary",
      "ZnJhbWU=",
      undefined,
    );
  });

  // A payload sliced off a larger read is a window onto that buffer. Framing
  // the whole backing buffer would send bytes the caller never passed, and the
  // frame would still parse.
  it("frames only the caller's view of a larger buffer", async () => {
    const { sender } = senderWithRegistry();
    const backing = new Uint8Array([0xaa, 0xbb, 0x01, 0x02, 0xcc]);

    await sender.sendBinary("conn-1", { route: "a", message: backing.subarray(2, 4) });

    const { message } = encodeBinaryMessage.mock.calls[0][0];
    expect(Array.from(message as Buffer)).toEqual([0x01, 0x02]);
  });

  // The runtime refuses a field it cannot represent rather than truncating it
  // into a frame that would be read as something other than what was meant.
  // That refusal is the caller's answer, not something to swallow.
  it("surfaces a frame the runtime refuses to compose", async () => {
    const { registry, sender } = senderWithRegistry();
    encodeBinaryMessage.mockImplementation(() => {
      throw new Error("encode_binary_message failed: a route can not begin with the byte 0x4");
    });

    await expect(
      sender.sendBinary("conn-1", { route: "\x04ck", message: new Uint8Array() }),
    ).rejects.toThrow(/0x4/);
    expect(registry.sendMessage).not.toHaveBeenCalled();
  });

  // The runtime's handle for the send, distinct from the id inside the frame
  // that an acknowledgement names.
  it("carries the acknowledgement options through to the runtime", async () => {
    const { registry, sender } = senderWithRegistry();

    await sender.sendBinary(
      "conn-1",
      { route: "a", messageId: "m-1", requireAck: true, message: new Uint8Array() },
      { waitForAck: true, informClientsOnLoss: ["conn-2"], caller: "orders" },
    );

    expect(registry.sendMessage.mock.calls[0][4]).toEqual({
      waitForAck: true,
      informClients: ["conn-2"],
      caller: "orders",
    });
  });

  describe("sendBinaryMessages", () => {
    it("frames and sends every message in the batch", async () => {
      const { registry, sender } = senderWithRegistry();
      encodeBinaryMessage.mockReturnValueOnce("Zg==").mockReturnValueOnce("Zw==");

      await sender.sendBinaryMessages([
        { connectionId: "conn-1", parts: { route: "a", message: new Uint8Array([0x01]) } },
        { connectionId: "conn-2", parts: { route: "b", message: new Uint8Array([0x02]) } },
      ]);

      expect(registry.sendMessage).toHaveBeenCalledTimes(2);
      expect(registry.sendMessage.mock.calls[0][0]).toBe("conn-1");
      expect(registry.sendMessage.mock.calls[0][3]).toBe("Zg==");
      expect(registry.sendMessage.mock.calls[1][0]).toBe("conn-2");
      expect(registry.sendMessage.mock.calls[1][3]).toBe("Zw==");
    });

    // Unlike a send that fails on the way, a frame that cannot be composed is a
    // mistake in the calling code. Sending the messages before it would leave
    // the client a partial batch to make sense of while the caller fixes a bug.
    it("sends nothing when any message in the batch cannot be framed", async () => {
      const { registry, sender } = senderWithRegistry();
      encodeBinaryMessage.mockImplementation((parts: { route: string }) => {
        if (parts.route === "\x04ck") throw new Error("a route can not begin with the byte 0x4");
        return "Zg==";
      });

      await expect(
        sender.sendBinaryMessages([
          { connectionId: "conn-1", parts: { route: "a", message: new Uint8Array() } },
          { connectionId: "conn-2", parts: { route: "\x04ck", message: new Uint8Array() } },
        ]),
      ).rejects.toThrow(/0x4/);

      expect(registry.sendMessage).not.toHaveBeenCalled();
    });

    // Reported per message so a caller can retry exactly those. A binary frame
    // can carry an id, which is what a client SDK deduplicates by, but the id is
    // optional and the sender cannot assume redelivery is free.
    it("names which messages failed to send, by position", async () => {
      const { registry, sender } = senderWithRegistry();
      registry.sendMessage
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("connection gone"))
        .mockResolvedValueOnce(undefined);

      const error = await sender
        .sendBinaryMessages([
          { connectionId: "conn-1", parts: { route: "a", message: new Uint8Array() } },
          { connectionId: "conn-2", parts: { route: "b", message: new Uint8Array() } },
          { connectionId: "conn-3", parts: { route: "c", message: new Uint8Array() } },
        ])
        .catch((err: unknown) => err as SendError);

      expect(error).toBeInstanceOf(SendError);
      expect((error as SendError).failures).toEqual([
        { index: 1, connectionId: "conn-2", error: "connection gone" },
      ]);
      expect((error as SendError).failed(0)).toBe(false);
      expect((error as SendError).failed(1)).toBe(true);
    });

    it("sends nothing for an empty batch", async () => {
      const { registry, sender } = senderWithRegistry();

      await sender.sendBinaryMessages([]);

      expect(registry.sendMessage).not.toHaveBeenCalled();
    });
  });

  it("is discoverable through supportsBinary", () => {
    const { sender } = senderWithRegistry();

    expect(supportsBinary(sender)).toBe(true);
  });
});

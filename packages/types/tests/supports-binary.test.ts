import { describe, it, expect } from "vitest";
import { supportsBinary } from "../src/websocket";
import type { WebSocketSender } from "../src/websocket";

const textOnly: WebSocketSender = {
  sendMessage: async () => {},
  sendMessages: async () => {},
};

const withBinary: WebSocketSender = {
  ...textOnly,
  sendBinary: async () => {},
  sendBinaryMessages: async () => {},
} as WebSocketSender;

// Asked of the sender rather than of the deploy target, so an application tests
// for the capability it needs instead of naming an implementation it happens to
// know has it.
describe("supportsBinary", () => {
  it("says no to a sender whose transport carries text only", () => {
    expect(supportsBinary(textOnly)).toBe(false);
  });

  it("says yes to a sender that carries binary frames", () => {
    expect(supportsBinary(withBinary)).toBe(true);
  });

  // Both methods or neither. A sender carrying one of them is a half-built
  // implementation, and treating it as capable would fail at the call that
  // reaches for the missing one rather than at the check meant to catch it.
  it.each([["sendBinary"], ["sendBinaryMessages"]])("says no when %s is missing", (present) => {
    const partial = { ...textOnly, [present]: async () => {} } as WebSocketSender;

    expect(supportsBinary(partial)).toBe(false);
  });

  it("narrows the sender so the binary methods are reachable", () => {
    if (!supportsBinary(withBinary)) throw new Error("expected the capability");

    // Reached through the narrowed type rather than a cast, which is the point
    // of the guard: this line does not compile without it.
    expect(typeof withBinary.sendBinary).toBe("function");
    expect(typeof withBinary.sendBinaryMessages).toBe("function");
  });
});

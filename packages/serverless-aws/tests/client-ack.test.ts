import { describe, it, expect } from "vitest";
import { clientAckRequest, composeClientAck } from "../src/client-ack";

describe("clientAckRequest", () => {
  it("reads the id out of a message that asked to be acknowledged", () => {
    expect(clientAckRequest({ event: "orders", ack: true, messageId: "m-1" })).toBe("m-1");
  });

  it("ignores an opt-in with no id to acknowledge", () => {
    expect(clientAckRequest({ event: "orders", ack: true })).toBeNull();
    expect(clientAckRequest({ event: "orders", ack: true, messageId: "" })).toBeNull();
  });

  it("ignores a message carrying an id but asking for nothing", () => {
    expect(clientAckRequest({ event: "orders", messageId: "m-1" })).toBeNull();
  });

  // The opt-in is the boolean true, not anything truthy. A client sending a
  // string here has not opted in, and answering it would be inventing a
  // protocol the client is not speaking.
  it.each([["true"], [1], [{}], [null]])("ignores an ack flag of %o", (ack) => {
    expect(clientAckRequest({ event: "orders", ack, messageId: "m-1" })).toBeNull();
  });

  // $connect and $disconnect carry no body, and a text frame that is not JSON
  // reaches the mapper as a bare string.
  it.each([[undefined], [null], ["not json"], [[1, 2]]])("ignores a body of %o", (body) => {
    expect(clientAckRequest(body)).toBeNull();
  });
});

describe("composeClientAck", () => {
  it("composes the acknowledgement the protocol specifies", () => {
    const ack = composeClientAck("m-1", 1_772_150_400);

    expect(JSON.parse(ack)).toEqual({
      event: "ack",
      data: { messageId: "m-1", timestamp: "1772150400" },
    });
  });

  it("sends the timestamp as a string of whole seconds", () => {
    const { data } = JSON.parse(composeClientAck("m-1", 1_772_150_400));

    expect(data.timestamp).toBe("1772150400");
    expect(typeof data.timestamp).toBe("string");
  });
});

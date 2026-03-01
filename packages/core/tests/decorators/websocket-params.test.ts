import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  ConnectionId,
  MessageBody,
  MessageId,
  RequestContext,
  EventType,
} from "../../src/decorators/websocket-params";
import { PARAM_METADATA } from "../../src/metadata/constants";
import type { ParamMetadata } from "../../src/decorators/params";

function getParamMetadata(target: object, methodName: string): ParamMetadata[] {
  return Reflect.getOwnMetadata(PARAM_METADATA, target, methodName) ?? [];
}

describe("WebSocket parameter decorators", () => {
  it("@ConnectionId() stores connectionId param metadata", () => {
    class TestHandler {
      message(@ConnectionId() _id: string) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "connectionId" });
  });

  it("@MessageBody() stores messageBody param metadata without schema", () => {
    class TestHandler {
      message(@MessageBody() _body: unknown) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("messageBody");
    expect(meta[0].schema).toBeUndefined();
  });

  it("@MessageBody(schema) stores messageBody param metadata with schema", () => {
    const schema = { parse: (data: unknown) => data as string };
    class TestHandler {
      message(@MessageBody(schema) _body: string) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("messageBody");
    expect(meta[0].schema).toBe(schema);
  });

  it("@MessageId() stores messageId param metadata", () => {
    class TestHandler {
      message(@MessageId() _id: string) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "messageId" });
  });

  it("@RequestContext() stores requestContext param metadata", () => {
    class TestHandler {
      message(@RequestContext() _ctx: unknown) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "requestContext" });
  });

  it("@EventType() stores eventType param metadata", () => {
    class TestHandler {
      message(@EventType() _type: string) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "eventType" });
  });

  it("multiple param decorators on a single method accumulate", () => {
    class TestHandler {
      message(
        @ConnectionId() _id: string,
        @MessageBody() _body: unknown,
        @EventType() _type: string,
      ) {}
    }

    const meta = getParamMetadata(TestHandler.prototype, "message");
    expect(meta).toHaveLength(3);
    const types = meta.map((m) => m.type);
    expect(types).toContain("connectionId");
    expect(types).toContain("messageBody");
    expect(types).toContain("eventType");
  });
});

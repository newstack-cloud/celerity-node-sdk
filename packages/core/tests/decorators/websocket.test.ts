import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  WebSocketController,
  OnConnect,
  OnMessage,
  OnDisconnect,
} from "../../src/decorators/websocket";
import {
  WEBSOCKET_CONTROLLER_METADATA,
  WEBSOCKET_EVENT_METADATA,
  INJECTABLE_METADATA,
} from "../../src/metadata/constants";
import type { WebSocketEventMetadata } from "../../src/decorators/websocket";

describe("WebSocket decorators", () => {
  describe("@WebSocketController()", () => {
    it("sets WEBSOCKET_CONTROLLER_METADATA on the class", () => {
      @WebSocketController()
      class TestHandler {}

      expect(Reflect.getOwnMetadata(WEBSOCKET_CONTROLLER_METADATA, TestHandler)).toBe(true);
    });

    it("sets INJECTABLE_METADATA on the class", () => {
      @WebSocketController()
      class TestHandler {}

      expect(Reflect.getOwnMetadata(INJECTABLE_METADATA, TestHandler)).toBe(true);
    });
  });

  describe("@OnConnect()", () => {
    it("sets WEBSOCKET_EVENT_METADATA with eventType connect and route $connect", () => {
      class TestHandler {
        @OnConnect()
        connect() {}
      }

      const meta: WebSocketEventMetadata = Reflect.getOwnMetadata(
        WEBSOCKET_EVENT_METADATA,
        TestHandler.prototype,
        "connect",
      );
      expect(meta).toEqual({ eventType: "connect", route: "$connect" });
    });
  });

  describe("@OnMessage()", () => {
    it("defaults route to $default", () => {
      class TestHandler {
        @OnMessage()
        message() {}
      }

      const meta: WebSocketEventMetadata = Reflect.getOwnMetadata(
        WEBSOCKET_EVENT_METADATA,
        TestHandler.prototype,
        "message",
      );
      expect(meta).toEqual({ eventType: "message", route: "$default" });
    });

    it("accepts a custom route", () => {
      class TestHandler {
        @OnMessage("chat")
        chat() {}
      }

      const meta: WebSocketEventMetadata = Reflect.getOwnMetadata(
        WEBSOCKET_EVENT_METADATA,
        TestHandler.prototype,
        "chat",
      );
      expect(meta).toEqual({ eventType: "message", route: "chat" });
    });
  });

  describe("@OnDisconnect()", () => {
    it("sets WEBSOCKET_EVENT_METADATA with eventType disconnect and route $disconnect", () => {
      class TestHandler {
        @OnDisconnect()
        disconnect() {}
      }

      const meta: WebSocketEventMetadata = Reflect.getOwnMetadata(
        WEBSOCKET_EVENT_METADATA,
        TestHandler.prototype,
        "disconnect",
      );
      expect(meta).toEqual({ eventType: "disconnect", route: "$disconnect" });
    });
  });
});

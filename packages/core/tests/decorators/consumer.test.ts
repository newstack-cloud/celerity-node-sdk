import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Consumer, MessageHandler } from "../../src/decorators/consumer";
import {
  CONSUMER_METADATA,
  CONSUMER_HANDLER_METADATA,
  INJECTABLE_METADATA,
} from "../../src/metadata/constants";
import type { ConsumerMetadata, ConsumerHandlerMetadata } from "../../src/decorators/consumer";

describe("Consumer decorators", () => {
  describe("@Consumer()", () => {
    it("sets CONSUMER_METADATA on the class", () => {
      @Consumer()
      class TestConsumer {}

      const meta: ConsumerMetadata = Reflect.getOwnMetadata(CONSUMER_METADATA, TestConsumer);
      expect(meta).toBeDefined();
      expect(meta).toEqual({});
    });

    it("sets INJECTABLE_METADATA on the class", () => {
      @Consumer()
      class TestConsumer {}

      expect(Reflect.getOwnMetadata(INJECTABLE_METADATA, TestConsumer)).toBe(true);
    });

    it("stores sourceId when provided", () => {
      @Consumer("orders-queue")
      class TestConsumer {}

      const meta: ConsumerMetadata = Reflect.getOwnMetadata(CONSUMER_METADATA, TestConsumer);
      expect(meta.sourceId).toBe("orders-queue");
    });

    it("omits sourceId when not provided", () => {
      @Consumer()
      class TestConsumer {}

      const meta: ConsumerMetadata = Reflect.getOwnMetadata(CONSUMER_METADATA, TestConsumer);
      expect(meta).not.toHaveProperty("sourceId");
    });
  });

  describe("@MessageHandler()", () => {
    it("sets CONSUMER_HANDLER_METADATA on the method", () => {
      class TestConsumer {
        @MessageHandler()
        process() {}
      }

      const meta: ConsumerHandlerMetadata = Reflect.getOwnMetadata(
        CONSUMER_HANDLER_METADATA,
        TestConsumer.prototype,
        "process",
      );
      expect(meta).toBeDefined();
      expect(meta).toEqual({});
    });

    it("stores route when provided", () => {
      class TestConsumer {
        @MessageHandler("new-order")
        process() {}
      }

      const meta: ConsumerHandlerMetadata = Reflect.getOwnMetadata(
        CONSUMER_HANDLER_METADATA,
        TestConsumer.prototype,
        "process",
      );
      expect(meta.route).toBe("new-order");
    });

    it("omits route when not provided", () => {
      class TestConsumer {
        @MessageHandler()
        process() {}
      }

      const meta: ConsumerHandlerMetadata = Reflect.getOwnMetadata(
        CONSUMER_HANDLER_METADATA,
        TestConsumer.prototype,
        "process",
      );
      expect(meta).not.toHaveProperty("route");
    });
  });
});

// This is a test suite for the full integration of the different parts
// required to create a Celerity application, not integration tests that
// involve external services.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { CelerityFactory } from "../src/application/factory";
import {
  TestingApplication,
  mockRequest,
  mockWebSocketMessage,
  mockConsumerEvent,
  mockScheduleEvent,
} from "../src/testing/test-app";
import { Module } from "../src/decorators/module";
import { Controller } from "../src/decorators/controller";
import { Get, Post } from "../src/decorators/http";
import { Body, Param, Query, Headers, Req, RequestId } from "../src/decorators/params";
import { ProtectedBy, Public } from "../src/decorators/guards";
import { Injectable } from "../src/decorators/injectable";
import { httpGet } from "../src/functions/create-handler";
import { createConsumerHandler } from "../src/functions/create-consumer-handler";
import { createScheduleHandler } from "../src/functions/create-schedule-handler";
import { createCustomHandler } from "../src/functions/create-custom-handler";
import { Consumer, MessageHandler } from "../src/decorators/consumer";
import { Messages } from "../src/decorators/consumer-params";
import { ScheduleHandler } from "../src/decorators/schedule";
import { ScheduleInput } from "../src/decorators/schedule-params";
import { Invoke } from "../src/decorators/invoke";
import { Payload } from "../src/decorators/invoke-params";
import { WebSocketController, OnMessage } from "../src/decorators/websocket";
import { MessageBody } from "../src/decorators/websocket-params";
import { NotFoundException } from "../src/errors/http-exception";
import type { HttpRequest, EventResult } from "@celerity-sdk/types";

// -- Fixtures -----------------------------------------------------------------

@Injectable()
class UserService {
  findById(id: string): { id: string; name: string } {
    return { id, name: `User ${id}` };
  }

  create(data: { name: string }): { id: string; name: string } {
    return { id: "new-1", name: data.name };
  }
}

@Controller("/users")
@ProtectedBy("jwt")
class UserHandler {
  constructor(private userService: UserService) {}

  @Get("/{id}")
  getUser(@Param("id") id: string): { id: string; name: string } {
    return this.userService.findById(id);
  }

  @Post("/")
  createUser(@Body() body: { name: string }): { id: string; name: string } {
    return this.userService.create(body);
  }

  @Get("/")
  @Public()
  listUsers(): { users: string[] } {
    return { users: ["alice", "bob"] };
  }
}

const healthCheck = httpGet("/health", (_req, ctx) => {
  return { status: "ok", requestId: ctx.requestId };
});

@Module({
  controllers: [UserHandler],
  providers: [UserService],
  functionHandlers: [healthCheck],
})
class AppModule {}

// -- Helper -------------------------------------------------------------------

async function createApp(): Promise<TestingApplication> {
  return CelerityFactory.createTestingApp(AppModule);
}

// -- Tests --------------------------------------------------------------------

describe("Integration: full handler pipeline via TestingApplication.inject", () => {
  // -- GET with @Param --------------------------------------------------------

  describe("GET /users/{id}", () => {
    it("should return user by id", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("GET", "/users/42", {
        pathParams: { id: "42" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers).toBeDefined();
      expect(response.headers!["content-type"]).toBe("application/json");
      const body = JSON.parse(response.body!);
      expect(body).toEqual({ id: "42", name: "User 42" });
    });

    it("should have protectedBy metadata on the handler", async () => {
      // Arrange
      const app = await createApp();
      const registry = app.getRegistry();

      // Act
      const handler = registry.getHandler("http", "GET /users/42");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.protectedBy).toEqual(["jwt"]);
    });
  });

  // -- POST with @Body --------------------------------------------------------

  describe("POST /users", () => {
    it("should create a user and return 200 with JSON body", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("POST", "/users", {
        body: { name: "Charlie" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers!["content-type"]).toBe("application/json");
      const body = JSON.parse(response.body!);
      expect(body).toEqual({ id: "new-1", name: "Charlie" });
    });
  });

  // -- @Public route ----------------------------------------------------------

  describe("GET /users (public)", () => {
    it("should return user list and be marked as public", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("GET", "/users");

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers!["content-type"]).toBe("application/json");
      const body = JSON.parse(response.body!);
      expect(body).toEqual({ users: ["alice", "bob"] });

      // Also verify isPublic metadata
      const handler = app.getRegistry().getHandler("http", "GET /users");
      expect(handler!.isPublic).toBe(true);
    });
  });

  // -- Function-based handler via httpGet -------------------------------------

  describe("GET /health (function handler)", () => {
    it("should invoke function-based handler and return response", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("GET", "/health");

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers!["content-type"]).toBe("application/json");
      const body = JSON.parse(response.body!);
      expect(body.status).toBe("ok");
      expect(body.requestId).toBe("test-request-id");
    });
  });

  // -- 404 for unregistered routes --------------------------------------------

  describe("unregistered route", () => {
    it("should throw NotFoundException for unknown path", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("GET", "/unknown");

      // Act & Assert
      await expect(app.injectHttp(request)).rejects.toThrow(NotFoundException);
      await expect(app.injectHttp(request)).rejects.toThrow(
        "No handler found for GET /unknown",
      );
    });

    it("should throw NotFoundException for wrong method on existing path", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("DELETE", "/users");

      // Act & Assert
      await expect(app.injectHttp(request)).rejects.toThrow(NotFoundException);
    });
  });

  // -- Response normalization -------------------------------------------------

  describe("response normalization", () => {
    it("should return 204 when handler returns null", async () => {
      // Arrange
      @Controller("/void")
      class VoidHandler {
        @Get("/")
        noop(): null {
          return null;
        }
      }

      @Module({ controllers: [VoidHandler] })
      class VoidModule {}

      const app = await CelerityFactory.createTestingApp(VoidModule);
      const request = mockRequest("GET", "/void");

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(204);
    });

    it("should pass through a full HttpResponse object unchanged", async () => {
      // Arrange
      @Controller("/custom")
      class CustomResponseHandler {
        @Get("/")
        handle() {
          return {
            status: 201,
            headers: { "x-custom": "value" },
            body: JSON.stringify({ created: true }),
          };
        }
      }

      @Module({ controllers: [CustomResponseHandler] })
      class CustomModule {}

      const app = await CelerityFactory.createTestingApp(CustomModule);
      const request = mockRequest("GET", "/custom");

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(201);
      expect(response.headers!["x-custom"]).toBe("value");
      const body = JSON.parse(response.body!);
      expect(body.created).toBe(true);
    });
  });

  // -- @ProtectedBy decorator behavior ----------------------------------------

  describe("@ProtectedBy behavior", () => {
    it("should store protectedBy metadata on handlers", async () => {
      // Arrange
      @Controller("/guarded")
      @ProtectedBy("jwt")
      class GuardedHandler {
        @Get("/")
        handle(): { ok: boolean } {
          return { ok: true };
        }
      }

      @Module({ controllers: [GuardedHandler] })
      class GuardedModule {}

      const app = await CelerityFactory.createTestingApp(GuardedModule);

      // Act
      const handler = app.getRegistry().getHandler("http", "GET /guarded");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.protectedBy).toEqual(["jwt"]);
    });

    it("should allow handler execution regardless of protectedBy (guards are external)", async () => {
      // Arrange
      @Controller("/guarded")
      @ProtectedBy("jwt")
      class GuardedHandler {
        @Get("/")
        handle(): { ok: boolean } {
          return { ok: true };
        }
      }

      @Module({ controllers: [GuardedHandler] })
      class GuardedModule {}

      const app = await CelerityFactory.createTestingApp(GuardedModule);
      const request = mockRequest("GET", "/guarded");

      // Act — should succeed because guard execution happens externally
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      expect(body.ok).toBe(true);
    });

    it("should mark @Public method correctly even with class-level @ProtectedBy", async () => {
      // Arrange
      @Controller("/mixed")
      @ProtectedBy("jwt")
      class MixedHandler {
        @Get("/secret")
        secret(): { data: string } {
          return { data: "secret" };
        }

        @Get("/open")
        @Public()
        open(): { data: string } {
          return { data: "public" };
        }
      }

      @Module({ controllers: [MixedHandler] })
      class MixedModule {}

      const app = await CelerityFactory.createTestingApp(MixedModule);

      // Act & Assert — public route returns data
      const publicReq = mockRequest("GET", "/mixed/open");
      const publicRes = await app.injectHttp(publicReq);
      expect(publicRes.status).toBe(200);
      const publicBody = JSON.parse(publicRes.body!);
      expect(publicBody.data).toBe("public");

      // Check metadata
      const openHandler = app.getRegistry().getHandler("http", "GET /mixed/open");
      expect(openHandler!.isPublic).toBe(true);

      const secretHandler = app.getRegistry().getHandler("http", "GET /mixed/secret");
      expect(secretHandler!.isPublic).toBe(false);
      expect(secretHandler!.protectedBy).toEqual(["jwt"]);
    });
  });

  // -- Param decorators -------------------------------------------------------

  describe("param extraction decorators", () => {
    it("should extract query parameters with @Query", async () => {
      // Arrange
      @Controller("/search")
      class SearchHandler {
        @Get("/")
        search(@Query("q") q: string): { query: string } {
          return { query: q as string };
        }
      }

      @Module({ controllers: [SearchHandler] })
      class SearchModule {}

      const app = await CelerityFactory.createTestingApp(SearchModule);
      const request = mockRequest("GET", "/search", {
        query: { q: "hello" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      expect(body.query).toBe("hello");
    });

    it("should extract headers with @Headers", async () => {
      // Arrange
      @Controller("/echo-header")
      class HeaderHandler {
        @Get("/")
        echoHeader(
          @Headers("x-custom") customHeader: string,
        ): { header: string } {
          return { header: customHeader as string };
        }
      }

      @Module({ controllers: [HeaderHandler] })
      class HeaderModule {}

      const app = await CelerityFactory.createTestingApp(HeaderModule);
      const request = mockRequest("GET", "/echo-header", {
        headers: { "x-custom": "my-value" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      expect(body.header).toBe("my-value");
    });

    it("should extract the full request with @Req", async () => {
      // Arrange
      @Controller("/raw")
      class RawHandler {
        @Get("/")
        raw(@Req() req: HttpRequest): { method: string; path: string } {
          return { method: req.method, path: req.path };
        }
      }

      @Module({ controllers: [RawHandler] })
      class RawModule {}

      const app = await CelerityFactory.createTestingApp(RawModule);
      const request = mockRequest("GET", "/raw");

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      expect(body.method).toBe("GET");
      expect(body.path).toBe("/raw");
    });

    it("should extract requestId with @RequestId", async () => {
      // Arrange
      @Controller("/rid")
      class RequestIdHandler {
        @Get("/")
        handle(@RequestId() rid: string): { requestId: string } {
          return { requestId: rid as string };
        }
      }

      @Module({ controllers: [RequestIdHandler] })
      class RidModule {}

      const app = await CelerityFactory.createTestingApp(RidModule);
      const request = mockRequest("GET", "/rid", {
        requestId: "req-abc-123",
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      expect(body.requestId).toBe("req-abc-123");
    });

    it("should extract multiple params in a single handler method", async () => {
      // Arrange
      @Controller("/multi")
      class MultiParamHandler {
        @Post("/{id}")
        handle(
          @Param("id") id: string,
          @Body() body: { value: number },
          @Query("verbose") verbose: string,
        ): { id: string; body: { value: number }; verbose: string } {
          return { id, body, verbose };
        }
      }

      @Module({ controllers: [MultiParamHandler] })
      class MultiModule {}

      const app = await CelerityFactory.createTestingApp(MultiModule);
      const request = mockRequest("POST", "/multi/99", {
        pathParams: { id: "99" },
        body: { value: 42 },
        query: { verbose: "true" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const resBody = JSON.parse(response.body!);
      expect(resBody.id).toBe("99");
      expect(resBody.body).toEqual({ value: 42 });
      expect(resBody.verbose).toBe("true");
    });
  });

  // -- DI integration ---------------------------------------------------------

  describe("dependency injection", () => {
    it("should inject service into handler and use it in request pipeline", async () => {
      // Arrange
      const app = await createApp();
      const request = mockRequest("GET", "/users/7", {
        pathParams: { id: "7" },
      });

      // Act
      const response = await app.injectHttp(request);

      // Assert
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body!);
      // UserService.findById returns { id, name: `User ${id}` }
      expect(body).toEqual({ id: "7", name: "User 7" });
    });

    it("should resolve service from container directly", async () => {
      // Arrange
      const app = await createApp();

      // Act
      const service = await app.getContainer().resolve<UserService>(UserService);

      // Assert
      expect(service).toBeInstanceOf(UserService);
      expect(service.findById("5")).toEqual({ id: "5", name: "User 5" });
    });
  });

  // -- mockRequest utility ----------------------------------------------------

  describe("mockRequest helper", () => {
    it("should create a valid HttpRequest with defaults", () => {
      // Act
      const request = mockRequest("GET", "/test");

      // Assert
      expect(request.method).toBe("GET");
      expect(request.path).toBe("/test");
      expect(request.pathParams).toEqual({});
      expect(request.query).toEqual({});
      expect(request.headers).toEqual({});
      expect(request.cookies).toEqual({});
      expect(request.textBody).toBeNull();
      expect(request.binaryBody).toBeNull();
      expect(request.contentType).toBeNull();
      expect(request.requestId).toBe("test-request-id");
      expect(request.auth).toBeNull();
      expect(request.clientIp).toBe("127.0.0.1");
      expect(request.userAgent).toBe("celerity-testing");
    });

    it("should set body as JSON string and set content-type", () => {
      // Act
      const request = mockRequest("POST", "/data", {
        body: { key: "value" },
      });

      // Assert
      expect(request.textBody).toBe('{"key":"value"}');
      expect(request.contentType).toBe("application/json");
    });

    it("should set all optional fields correctly", () => {
      // Arrange
      const opts = {
        pathParams: { id: "1" },
        query: { page: "2" },
        headers: { authorization: "Bearer xyz" },
        cookies: { session: "abc" },
        body: { data: true },
        auth: { sub: "user-1", role: "admin" },
        requestId: "custom-req-id",
        clientIp: "10.0.0.1",
      };

      // Act
      const request = mockRequest("PUT", "/resource/1", opts);

      // Assert
      expect(request.method).toBe("PUT");
      expect(request.path).toBe("/resource/1");
      expect(request.pathParams).toEqual({ id: "1" });
      expect(request.query).toEqual({ page: "2" });
      expect(request.headers).toEqual({ authorization: "Bearer xyz" });
      expect(request.cookies).toEqual({ session: "abc" });
      expect(request.textBody).toBe('{"data":true}');
      expect(request.auth).toEqual({ sub: "user-1", role: "admin" });
      expect(request.requestId).toBe("custom-req-id");
      expect(request.clientIp).toBe("10.0.0.1");
    });
  });
});

// ---------------------------------------------------------------------------
// Consumer handler integration
// ---------------------------------------------------------------------------

describe("Integration: consumer handler via TestingApplication.injectConsumer", () => {
  // -- Class-based consumer -------------------------------------------------

  describe("class-based @Consumer + @MessageHandler", () => {
    @Consumer()
    class OrderConsumer {
      @MessageHandler()
      async processOrders(@Messages() _messages: unknown[]): Promise<EventResult> {
        return { success: true };
      }
    }

    @Module({ controllers: [OrderConsumer] })
    class ConsumerModule {}

    it("should invoke consumer handler and return EventResult", async () => {
      const app = await CelerityFactory.createTestingApp(ConsumerModule);
      const event = mockConsumerEvent("processOrders", [
        { body: '{"orderId":"abc"}' },
        { body: '{"orderId":"def"}' },
      ]);

      const result = await app.injectConsumer("processOrders", event);

      expect(result.success).toBe(true);
    });

    it("should throw NotFoundException for unknown handler tag", async () => {
      const app = await CelerityFactory.createTestingApp(ConsumerModule);
      const event = mockConsumerEvent("unknown", [{ body: "{}" }]);

      await expect(app.injectConsumer("unknown", event)).rejects.toThrow(NotFoundException);
    });
  });

  // -- Function-based consumer ----------------------------------------------

  describe("function-based createConsumerHandler", () => {
    const processMessages = createConsumerHandler(
      {},
      async (_event, _ctx) => ({ success: true }),
    );

    @Module({ functionHandlers: [processMessages] })
    class FnConsumerModule {}

    it("should invoke function consumer handler", async () => {
      const app = await CelerityFactory.createTestingApp(FnConsumerModule);
      const event = mockConsumerEvent("default", [{ body: '{"key":"value"}' }]);

      const result = await app.injectConsumer("default", event);

      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Schedule handler integration
// ---------------------------------------------------------------------------

describe("Integration: schedule handler via TestingApplication.injectSchedule", () => {
  // -- Class-based schedule -------------------------------------------------

  describe("class-based @ScheduleHandler", () => {
    @Controller("/admin")
    class AdminHandler {
      @ScheduleHandler("daily-cleanup")
      async cleanup(@ScheduleInput() _input: unknown): Promise<EventResult> {
        return { success: true };
      }
    }

    @Module({ controllers: [AdminHandler] })
    class ScheduleModule {}

    it("should invoke schedule handler and return EventResult", async () => {
      const app = await CelerityFactory.createTestingApp(ScheduleModule);
      const event = mockScheduleEvent("daily-cleanup");

      const result = await app.injectSchedule("daily-cleanup", event);

      expect(result.success).toBe(true);
    });

    it("should throw NotFoundException for unknown schedule tag", async () => {
      const app = await CelerityFactory.createTestingApp(ScheduleModule);
      const event = mockScheduleEvent("unknown");

      await expect(app.injectSchedule("unknown", event)).rejects.toThrow(NotFoundException);
    });
  });

  // -- Function-based schedule ----------------------------------------------

  describe("function-based createScheduleHandler", () => {
    const hourlySync = createScheduleHandler("rate(1 hour)", {}, async (_event, _ctx) => ({
      success: true,
    }));

    @Module({ functionHandlers: [hourlySync] })
    class FnScheduleModule {}

    it("should invoke function schedule handler", async () => {
      const app = await CelerityFactory.createTestingApp(FnScheduleModule);
      const event = mockScheduleEvent("default");

      const result = await app.injectSchedule("default", event);

      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Custom (invoke) handler integration
// ---------------------------------------------------------------------------

describe("Integration: custom handler via TestingApplication.injectCustom", () => {
  // -- Class-based @Invoke --------------------------------------------------

  describe("class-based @Invoke", () => {
    @Controller("/payments")
    class PaymentHandler {
      @Invoke("processPayment")
      async processPayment(@Payload() payload: unknown): Promise<unknown> {
        const p = payload as { amount: number };
        return { processed: true, amount: p.amount };
      }
    }

    @Module({ controllers: [PaymentHandler] })
    class InvokeModule {}

    it("should invoke custom handler and return raw result", async () => {
      const app = await CelerityFactory.createTestingApp(InvokeModule);

      const result = await app.injectCustom("processPayment", { amount: 100 });

      expect(result).toEqual({ processed: true, amount: 100 });
    });

    it("should throw NotFoundException for unknown handler name", async () => {
      const app = await CelerityFactory.createTestingApp(InvokeModule);

      await expect(app.injectCustom("unknown")).rejects.toThrow(NotFoundException);
    });
  });

  // -- Function-based custom ------------------------------------------------

  describe("function-based createCustomHandler", () => {
    const echo = createCustomHandler({}, async (payload, _ctx) => ({
      echo: payload,
    }));

    @Module({ functionHandlers: [echo] })
    class FnCustomModule {}

    it("should invoke function custom handler", async () => {
      const app = await CelerityFactory.createTestingApp(FnCustomModule);

      const result = await app.injectCustom("default", { message: "hello" });

      expect(result).toEqual({ echo: { message: "hello" } });
    });
  });
});

// ---------------------------------------------------------------------------
// WebSocket handler integration
// ---------------------------------------------------------------------------

describe("Integration: WebSocket handler via TestingApplication.injectWebSocket", () => {
  describe("class-based @WebSocketController + @OnMessage", () => {
    @WebSocketController()
    class ChatHandler {
      @OnMessage("chat")
      async onChat(@MessageBody() _body: unknown): Promise<void> {
        // Handler processes the message — no return needed
      }
    }

    @Module({ controllers: [ChatHandler] })
    class WebSocketModule {}

    it("should invoke WebSocket handler without throwing", async () => {
      const app = await CelerityFactory.createTestingApp(WebSocketModule);
      const message = mockWebSocketMessage({
        jsonBody: { text: "hello" },
      });

      await expect(app.injectWebSocket("chat", message)).resolves.toBeUndefined();
    });

    it("should throw NotFoundException for unknown route", async () => {
      const app = await CelerityFactory.createTestingApp(WebSocketModule);
      const message = mockWebSocketMessage();

      await expect(app.injectWebSocket("unknown", message)).rejects.toThrow(NotFoundException);
    });
  });
});

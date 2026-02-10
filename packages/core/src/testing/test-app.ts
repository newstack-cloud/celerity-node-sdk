import type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  CelerityLayer,
  Type,
} from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { executeHandlerPipeline } from "../handlers/pipeline";
import { NotFoundException } from "../errors/http-exception";

export class TestingApplication {
  constructor(
    private registry: HandlerRegistry,
    private container: Container,
    private systemLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private appLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
  ) {}

  async inject(request: HttpRequest): Promise<HttpResponse> {
    const handler = this.registry.getHandler(request.path, request.method);
    if (!handler) {
      throw new NotFoundException(`No handler found for ${request.method} ${request.path}`);
    }
    return executeHandlerPipeline(handler, request, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  getContainer(): Container {
    return this.container;
  }

  getRegistry(): HandlerRegistry {
    return this.registry;
  }
}

export type MockRequestOptions = {
  pathParams?: Record<string, string>;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  body?: unknown;
  auth?: Record<string, unknown>;
  requestId?: string;
  clientIp?: string;
};

export function mockRequest(
  method: HttpMethod,
  path: string,
  options: MockRequestOptions = {},
): HttpRequest {
  return {
    method,
    path,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    headers: options.headers ?? {},
    cookies: options.cookies ?? {},
    textBody: options.body !== undefined ? JSON.stringify(options.body) : null,
    binaryBody: null,
    contentType: options.body !== undefined ? "application/json" : null,
    requestId: options.requestId ?? "test-request-id",
    requestTime: new Date().toISOString(),
    auth: options.auth ?? null,
    clientIp: options.clientIp ?? "127.0.0.1",
    traceContext: null,
    userAgent: "celerity-testing",
    matchedRoute: null,
  };
}

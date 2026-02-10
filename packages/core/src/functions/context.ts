import type {
  HttpMethod,
  HttpRequest,
  HandlerMetadata,
  ServiceContainer,
  CelerityLogger,
} from "@celerity-sdk/types";

export type HttpHandlerRequest<TBody = unknown> = {
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: TBody;
  headers: Record<string, string | string[]>;
  cookies: Record<string, string>;
  auth: Record<string, unknown> | null;
  clientIp: string | null;
  userAgent: string | null;
  contentType: string | null;
};

export type HttpHandlerContext = {
  requestId: string;
  requestTime: string;
  metadata: HandlerMetadata;
  container: ServiceContainer;
  /** Request-scoped logger set by TelemetryLayer. */
  logger?: CelerityLogger;
  raw: HttpRequest;
};

export function buildHttpRequest(
  request: HttpRequest,
  metadata: HandlerMetadata,
): HttpHandlerRequest {
  const validatedBody = metadata.get<unknown>("validatedBody");
  let body: unknown;
  if (validatedBody !== undefined) {
    body = validatedBody;
  } else if (request.binaryBody) {
    body = request.binaryBody;
  } else if (request.textBody) {
    body = JSON.parse(request.textBody);
  } else {
    body = null;
  }

  return {
    method: request.method,
    path: request.path,
    params: metadata.get<Record<string, string>>("validatedParams") ?? request.pathParams,
    query: metadata.get<Record<string, string | string[]>>("validatedQuery") ?? request.query,
    body,
    headers: metadata.get<Record<string, string | string[]>>("validatedHeaders") ?? request.headers,
    cookies: request.cookies,
    auth: request.auth,
    clientIp: request.clientIp,
    userAgent: request.userAgent,
    contentType: request.contentType,
  };
}

export function buildHttpContext(
  request: HttpRequest,
  metadata: HandlerMetadata,
  container: ServiceContainer,
  logger?: CelerityLogger,
): HttpHandlerContext {
  return {
    requestId: request.requestId,
    requestTime: request.requestTime,
    metadata,
    container,
    logger,
    raw: request,
  };
}

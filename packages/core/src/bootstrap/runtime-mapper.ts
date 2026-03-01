import type {
  Request as RuntimeRequest,
  Response as RuntimeResponse,
  JsWebSocketMessageInfo,
  JsConsumerEventInput,
  JsScheduleEventInput,
  JsEventResult,
} from "@celerity-sdk/runtime";
import type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketEventType,
  WebSocketRequestContext,
  ConsumerEventInput,
  ScheduleEventInput,
  EventResult,
} from "@celerity-sdk/types";

export type {
  JsWebSocketMessageInfo,
  JsConsumerEventInput,
  JsScheduleEventInput,
  JsEventResult,
} from "@celerity-sdk/runtime";

/** Flatten multi-value records: single-element arrays become plain strings. */
export function flattenMultiValueRecord(
  record: Record<string, string[]>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(record)) {
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}

/** Convert NAPI runtime Request → SDK HttpRequest. */
export function mapRuntimeRequest(request: RuntimeRequest): HttpRequest {
  return {
    method: request.method.toUpperCase() as HttpMethod,
    path: request.path,
    pathParams: request.pathParams,
    query: flattenMultiValueRecord(request.query),
    headers: flattenMultiValueRecord(request.headers),
    cookies: request.cookies,
    textBody: request.textBody,
    binaryBody: request.binaryBody,
    contentType: request.contentType || null,
    requestId: request.requestId,
    requestTime: request.requestTime,
    auth: request.auth ?? null,
    clientIp: request.clientIp || null,
    traceContext: request.traceContext ?? null,
    userAgent: request.userAgent || null,
    matchedRoute: request.matchedRoute,
  };
}

/** Convert SDK HttpResponse → NAPI runtime Response. */
export function mapToRuntimeResponse(response: HttpResponse): RuntimeResponse {
  return {
    status: response.status,
    headers: response.headers,
    body: response.body,
    binaryBody: response.binaryBody,
  };
}

/** Convert NAPI JsWebSocketMessageInfo → SDK WebSocketMessage. */
export function mapWebSocketMessage(info: JsWebSocketMessageInfo): WebSocketMessage {
  const requestContext: WebSocketRequestContext | undefined = info.requestContext
    ? {
        requestId: info.requestContext.requestId,
        requestTime: info.requestContext.requestTime,
        path: info.requestContext.path,
        protocolVersion: info.requestContext.protocolVersion,
        headers: flattenMultiValueRecord(info.requestContext.headers),
        userAgent: info.requestContext.userAgent,
        clientIp: info.requestContext.clientIp,
        query: flattenMultiValueRecord(info.requestContext.query),
        cookies: info.requestContext.cookies,
        auth: info.requestContext.auth,
        traceContext: info.requestContext.traceContext,
      }
    : undefined;

  return {
    messageType: info.messageType as WebSocketMessageType,
    eventType: info.eventType as WebSocketEventType,
    connectionId: info.connectionId,
    messageId: info.messageId,
    jsonBody: info.jsonBody,
    binaryBody: info.binaryBody,
    requestContext,
    traceContext: info.traceContext ?? null,
  };
}

/** Convert NAPI JsConsumerEventInput → SDK ConsumerEventInput. */
export function mapConsumerEventInput(input: JsConsumerEventInput): ConsumerEventInput {
  return {
    handlerTag: input.handlerTag,
    messages: input.messages.map((msg) => ({
      messageId: msg.messageId,
      body: msg.body,
      source: msg.source,
      messageAttributes: msg.messageAttributes,
      vendor: msg.vendor,
    })),
    vendor: input.vendor,
    traceContext: input.traceContext ?? null,
  };
}

/** Convert NAPI JsScheduleEventInput → SDK ScheduleEventInput. */
export function mapScheduleEventInput(input: JsScheduleEventInput): ScheduleEventInput {
  return {
    handlerTag: input.handlerTag,
    scheduleId: input.scheduleId,
    messageId: input.messageId,
    schedule: input.schedule,
    input: input.input,
    vendor: input.vendor,
    traceContext: input.traceContext ?? null,
  };
}

/** Convert SDK EventResult → NAPI JsEventResult. */
export function mapToNapiEventResult(result: EventResult): JsEventResult {
  return {
    success: result.success,
    failures: result.failures?.map((f) => ({
      messageId: f.messageId,
      errorMessage: f.errorMessage,
    })),
    errorMessage: result.errorMessage,
  };
}

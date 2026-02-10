import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type { HttpMethod, HttpRequest, HttpResponse } from "@celerity-sdk/types";

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

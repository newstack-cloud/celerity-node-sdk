import type { HttpMethod, HttpRequest, HttpResponse } from "@celerity-sdk/types";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

function parseBody(event: APIGatewayProxyEventV2): {
  textBody: string | null;
  binaryBody: Buffer | null;
} {
  if (!event.body) return { textBody: null, binaryBody: null };
  if (event.isBase64Encoded)
    return { textBody: null, binaryBody: Buffer.from(event.body, "base64") };
  return { textBody: event.body, binaryBody: null };
}

function parseHeaders(event: APIGatewayProxyEventV2): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  if (!event.headers) return headers;

  for (const [key, value] of Object.entries(event.headers)) {
    if (value !== undefined) {
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

function parseCookies(event: APIGatewayProxyEventV2): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!event.cookies) return cookies;

  for (const cookie of event.cookies) {
    const eqIndex = cookie.indexOf("=");
    if (eqIndex > 0) {
      cookies[cookie.slice(0, eqIndex).trim()] = cookie.slice(eqIndex + 1).trim();
    }
  }
  return cookies;
}

function parsePathParams(event: APIGatewayProxyEventV2): Record<string, string> {
  const params: Record<string, string> = {};
  if (!event.pathParameters) return params;

  for (const [key, value] of Object.entries(event.pathParameters)) {
    if (value !== undefined) {
      params[key] = value;
    }
  }
  return params;
}

export function mapApiGatewayV2Event(event: APIGatewayProxyEventV2): HttpRequest {
  const method = event.requestContext.http.method.toUpperCase() as HttpMethod;
  const headers = parseHeaders(event);
  const { textBody, binaryBody } = parseBody(event);

  const authorizer = (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }
  ).authorizer;

  const contentType = (headers["content-type"] as string | undefined) ?? null;
  const xrayHeader = (headers["x-amzn-trace-id"] as string | undefined) ?? null;

  return {
    method,
    path: event.rawPath,
    pathParams: parsePathParams(event),
    query: (event.queryStringParameters ?? {}) as Record<string, string | string[]>,
    headers,
    cookies: parseCookies(event),
    textBody,
    binaryBody,
    contentType,
    requestId: event.requestContext.requestId,
    requestTime: event.requestContext.time ?? new Date().toISOString(),
    auth: authorizer?.jwt?.claims ?? null,
    clientIp: event.requestContext.http.sourceIp,
    traceContext: xrayHeader ? { "x-amzn-trace-id": xrayHeader } : null,
    userAgent: event.requestContext.http.userAgent ?? null,
    matchedRoute: event.routeKey ?? null,
  };
}

export function mapHttpResponseToResult(response: HttpResponse): APIGatewayProxyStructuredResultV2 {
  const result: APIGatewayProxyStructuredResultV2 = {
    statusCode: response.status,
  };

  if (response.headers) {
    result.headers = response.headers;
  }

  if (response.binaryBody) {
    result.body = response.binaryBody.toString("base64");
    result.isBase64Encoded = true;
  } else if (response.body) {
    result.body = response.body;
  }

  return result;
}

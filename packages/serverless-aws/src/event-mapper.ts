import createDebug from "debug";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { mapBucketEventType, mapDatastoreEventType } from "@celerity-sdk/common";
import type {
  HttpMethod,
  HandlerType,
  HttpRequest,
  HttpResponse,
  WebSocketMessage,
  WebSocketEventType,
  ConsumerEventInput,
  ConsumerMessage,
  ScheduleEventInput,
} from "@celerity-sdk/types";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  APIGatewayProxyWebsocketEventV2,
  SQSEvent,
  SQSRecord,
  SQSBatchResponse,
  SQSBatchItemFailure,
} from "aws-lambda";
import type { EventBridgeEvent } from "aws-lambda/trigger/eventbridge";

const debug = createDebug("celerity:serverless-aws");

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

  const request: HttpRequest = {
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

  debug(
    "mapEvent: %s %s (auth=%s, traceContext=%s)",
    method,
    event.rawPath,
    !!authorizer?.jwt?.claims,
    !!xrayHeader,
  );

  return request;
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

// ---------------------------------------------------------------------------
// Handler type detection
// ---------------------------------------------------------------------------

export type { HandlerType };

const VALID_HANDLER_TYPES = new Set<string>([
  "http",
  "websocket",
  "consumer",
  "schedule",
  "custom",
]);

function hasNested(obj: Record<string, unknown>, key: string, nested: string): boolean {
  const child = obj[key];
  return (
    child !== null && typeof child === "object" && nested in (child as Record<string, unknown>)
  );
}

export function detectEventType(event: unknown): HandlerType {
  const envType = process.env.CELERITY_HANDLER_TYPE;
  if (envType && VALID_HANDLER_TYPES.has(envType)) {
    debug("detectEventType: using env var CELERITY_HANDLER_TYPE=%s", envType);
    return envType as HandlerType;
  }

  if (!event || typeof event !== "object") return "custom";
  const e = event as Record<string, unknown>;

  if (hasNested(e, "requestContext", "http")) return "http";
  if (hasNested(e, "requestContext", "connectionId") && hasNested(e, "requestContext", "eventType"))
    return "websocket";
  if (
    Array.isArray(e.Records) &&
    e.Records.length > 0 &&
    (e.Records[0] as Record<string, unknown>)?.eventSource === "aws:sqs"
  )
    return "consumer";
  if ("source" in e && "detail-type" in e) return "schedule";

  return "custom";
}

// ---------------------------------------------------------------------------
// WebSocket event mapper
// ---------------------------------------------------------------------------

const WS_EVENT_TYPE_MAP: Record<string, WebSocketEventType> = {
  CONNECT: "connect",
  MESSAGE: "message",
  DISCONNECT: "disconnect",
};

export type WebSocketMappedEvent = {
  message: WebSocketMessage;
  routeKey: string;
  endpoint: string;
};

export function mapApiGatewayWebSocketEvent(
  event: APIGatewayProxyWebsocketEventV2,
): WebSocketMappedEvent {
  const rc = event.requestContext;
  const eventType = WS_EVENT_TYPE_MAP[rc.eventType] ?? "message";

  let jsonBody: unknown | undefined;
  let binaryBody: Buffer | undefined;

  if (event.body) {
    if (event.isBase64Encoded) {
      binaryBody = Buffer.from(event.body, "base64");
    } else {
      try {
        jsonBody = JSON.parse(event.body);
      } catch {
        jsonBody = event.body;
      }
    }
  }

  const message: WebSocketMessage = {
    messageType: binaryBody ? "binary" : "json",
    eventType,
    connectionId: rc.connectionId,
    messageId: rc.requestId,
    jsonBody,
    binaryBody,
    requestContext: {
      requestId: rc.requestId,
      requestTime: rc.requestTimeEpoch,
      path: `/${rc.stage}`,
      protocolVersion: "websocket",
      headers: {},
      clientIp: "",
      query: {},
      cookies: {},
    },
    traceContext: null,
  };

  const routeKey = rc.routeKey;
  const endpoint = `https://${rc.domainName}/${rc.stage}`;

  debug("mapWebSocketEvent: %s connectionId=%s routeKey=%s", eventType, rc.connectionId, routeKey);

  return { message, routeKey, endpoint };
}

// ---------------------------------------------------------------------------
// Event-sourced SQS message detection and body transformation
// ---------------------------------------------------------------------------

type S3Record = {
  eventSource: string;
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string; size?: number; eTag?: string };
  };
};

type S3Notification = {
  Records: S3Record[];
};

type DynamoDBStreamRecord = {
  eventSource: string;
  eventName: string;
  eventSourceARN?: string;
  dynamodb?: {
    Keys?: Record<string, Record<string, unknown>>;
    NewImage?: Record<string, Record<string, unknown>>;
    OldImage?: Record<string, Record<string, unknown>>;
  };
};

function tryParseJson(body: string): unknown | undefined {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isS3Notification(parsed: unknown): parsed is S3Notification {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.Records) || obj.Records.length === 0) return false;
  const first = obj.Records[0] as Record<string, unknown>;
  return first.eventSource === "aws:s3";
}

function isDynamoDBStreamRecord(parsed: unknown): parsed is DynamoDBStreamRecord {
  if (!parsed || typeof parsed !== "object") return false;
  return (parsed as Record<string, unknown>).eventSource === "aws:dynamodb";
}

function extractTableName(eventSourceARN?: string): string | undefined {
  if (!eventSourceARN) return undefined;
  // arn:aws:dynamodb:region:account:table/TABLE_NAME/stream/timestamp
  const match = eventSourceARN.match(/table\/([^/]+)/);
  return match?.[1];
}

function transformS3Body(record: S3Record): string {
  return JSON.stringify({
    key: record.s3.object.key,
    ...(record.s3.object.size !== undefined && { size: record.s3.object.size }),
    ...(record.s3.object.eTag !== undefined && { eTag: record.s3.object.eTag }),
  });
}

function unmarshallRecord(
  attrs: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!attrs) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return unmarshall(attrs as any);
}

function transformDynamoDBBody(record: DynamoDBStreamRecord): string {
  const db = record.dynamodb;
  return JSON.stringify({
    keys: unmarshallRecord(db?.Keys) ?? {},
    ...(db?.NewImage !== undefined && { newItem: unmarshallRecord(db.NewImage) }),
    ...(db?.OldImage !== undefined && { oldItem: unmarshallRecord(db.OldImage) }),
  });
}

function mapSqsRecord(record: SQSRecord): ConsumerMessage {
  const sqsVendor = {
    receiptHandle: record.receiptHandle,
    attributes: record.attributes,
    md5OfBody: record.md5OfBody,
    eventSource: record.eventSource,
    awsRegion: record.awsRegion,
  };

  const parsed = tryParseJson(record.body);

  // S3 notification → bucket event
  if (isS3Notification(parsed)) {
    const s3Record = parsed.Records[0];
    return {
      messageId: record.messageId,
      body: transformS3Body(s3Record),
      source: record.eventSourceARN,
      sourceType: "bucket",
      sourceName: s3Record.s3.bucket.name,
      eventType: mapBucketEventType(s3Record.eventName),
      messageAttributes: record.messageAttributes,
      vendor: { ...sqsVendor, originalBody: parsed },
    };
  }

  // DynamoDB stream record → datastore event
  if (isDynamoDBStreamRecord(parsed)) {
    return {
      messageId: record.messageId,
      body: transformDynamoDBBody(parsed),
      source: record.eventSourceARN,
      sourceType: "datastore",
      sourceName: extractTableName(parsed.eventSourceARN),
      eventType: mapDatastoreEventType(parsed.eventName),
      messageAttributes: record.messageAttributes,
      vendor: { ...sqsVendor, originalBody: parsed },
    };
  }

  // Plain SQS message (queue/topic consumer)
  return {
    messageId: record.messageId,
    body: record.body,
    source: record.eventSourceARN,
    messageAttributes: record.messageAttributes,
    vendor: sqsVendor,
  };
}

export function mapSqsEvent(event: SQSEvent, handlerTag: string): ConsumerEventInput {
  const messages = event.Records.map(mapSqsRecord);

  const firstTraceHeader = event.Records[0]?.attributes?.AWSTraceHeader;
  const traceContext = firstTraceHeader ? { "x-amzn-trace-id": firstTraceHeader } : null;

  debug("mapSqsEvent: %d records, handlerTag=%s", messages.length, handlerTag);

  return {
    handlerTag,
    messages,
    vendor: { eventSource: "aws:sqs" },
    traceContext,
  };
}

export function mapConsumerResultToSqsBatchResponse(
  failures: Array<{ messageId: string }> | undefined,
): SQSBatchResponse {
  const batchItemFailures: SQSBatchItemFailure[] = (failures ?? []).map((f) => ({
    itemIdentifier: f.messageId,
  }));
  return { batchItemFailures };
}

// ---------------------------------------------------------------------------
// EventBridge / Schedule event mapper
// ---------------------------------------------------------------------------

export function mapEventBridgeEvent(
  event: EventBridgeEvent<string, unknown>,
  handlerTag: string,
): ScheduleEventInput {
  debug("mapEventBridgeEvent: id=%s handlerTag=%s", event.id, handlerTag);

  return {
    handlerTag,
    scheduleId: event.id,
    messageId: event.id,
    schedule: "",
    input: event.detail,
    vendor: {
      source: event.source,
      detailType: event["detail-type"],
      account: event.account,
      region: event.region,
    },
    traceContext: null,
  };
}

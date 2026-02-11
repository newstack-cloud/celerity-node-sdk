import { propagation, ROOT_CONTEXT, type Context } from "@opentelemetry/api";
import type { HttpRequest } from "@celerity-sdk/types";

export function extractTraceContext(request: HttpRequest): Context {
  if (!request.traceContext) return ROOT_CONTEXT;

  // The traceContext map is used directly as a carrier.
  // The composite propagator (W3C + X-Ray) extracts the appropriate context.
  return propagation.extract(ROOT_CONTEXT, request.traceContext);
}

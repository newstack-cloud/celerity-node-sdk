import {
  trace,
  context as otelContext,
  SpanStatusCode,
  type Span,
  type Attributes,
} from "@opentelemetry/api";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";

export class OTelTracer implements CelerityTracer {
  private tracer = trace.getTracer("celerity");

  startSpan(name: string, attributes?: Record<string, unknown>): CeleritySpan {
    const span = this.tracer.startSpan(name, {
      attributes: attributes as Attributes,
    });
    return new OTelSpan(span);
  }

  async withSpan<T>(
    name: string,
    fn: (span: CeleritySpan) => T | Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T> {
    const span = this.tracer.startSpan(name, {
      attributes: attributes as Attributes,
    });
    const ctx = trace.setSpan(otelContext.active(), span);

    return otelContext.with(ctx, async () => {
      const wrapped = new OTelSpan(span);
      try {
        const result = await fn(wrapped);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

export class OTelSpan implements CeleritySpan {
  constructor(private span: Span) {}

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.setAttribute(key, value);
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    this.span.setAttributes(attributes);
  }

  recordError(error: Error): void {
    this.span.recordException(error);
    this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  setOk(): void {
    this.span.setStatus({ code: SpanStatusCode.OK });
  }

  end(): void {
    this.span.end();
  }
}

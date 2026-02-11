import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";

export class NoopTracer implements CelerityTracer {
  startSpan(): CeleritySpan {
    return NOOP_SPAN;
  }

  async withSpan<T>(_name: string, fn: (span: CeleritySpan) => T | Promise<T>): Promise<T> {
    return fn(NOOP_SPAN);
  }
}

export const NOOP_SPAN: CeleritySpan = {
  setAttribute() {},
  setAttributes() {},
  recordError() {},
  setOk() {},
  end() {},
};

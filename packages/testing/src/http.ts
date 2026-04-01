/**
 * Asserting HTTP client for API tests against a running application.
 * Reads `CELERITY_TEST_BASE_URL` (default http://localhost:8081).
 */

export type TestResponse<TBody = unknown> = {
  status: number;
  headers: Headers;
  body: TBody;
  text: string;
};

type ExpectFn = (body: unknown) => void;

export class TestRequest<TBody = unknown> {
  private _headers: Record<string, string> = {};
  private _body?: unknown;
  private _expectations: Array<
    | { type: "status"; value: number }
    | { type: "body"; value: unknown | ExpectFn }
    | { type: "header"; key: string; value: string | RegExp }
  > = [];

  constructor(
    private baseUrl: string,
    private method: string,
    private path: string,
  ) {}

  /** Set an authorization bearer token. */
  auth(token: string): this {
    this._headers["Authorization"] = `Bearer ${token}`;
    return this;
  }

  /** Set a request header. */
  set(key: string, value: string): this {
    this._headers[key] = value;
    return this;
  }

  /** Set the request JSON body. */
  send(body: unknown): this {
    this._body = body;
    return this;
  }

  /** Add an expectation. Overloaded: status code, body object/fn, or header. */
  expect(statusOrBodyOrFn: number | unknown | ExpectFn): this;
  expect(header: string, value: string | RegExp): this;
  expect(first: unknown, second?: unknown): this {
    if (typeof first === "number") {
      this._expectations.push({ type: "status", value: first });
    } else if (typeof first === "string" && second !== undefined) {
      this._expectations.push({
        type: "header",
        key: first.toLowerCase(),
        value: second as string | RegExp,
      });
    } else if (typeof first === "function") {
      this._expectations.push({ type: "body", value: first as ExpectFn });
    } else {
      this._expectations.push({ type: "body", value: first });
    }
    return this;
  }

  /** Execute the request and run all expectations. Returns the response. */
  async end(): Promise<TestResponse<TBody>> {
    const headers: Record<string, string> = { ...this._headers };
    if (this._body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${this.path}`, {
      method: this.method,
      headers,
      body: this._body !== undefined ? JSON.stringify(this._body) : undefined,
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    const result: TestResponse<TBody> = {
      status: response.status,
      headers: response.headers,
      body: body as TBody,
      text,
    };

    for (const exp of this._expectations) {
      this.assertExpectation(exp, result, text);
    }

    return result;
  }

  private assertExpectation(
    exp: TestRequest<TBody>["_expectations"][number],
    result: TestResponse<TBody>,
    text: string,
  ): void {
    if (exp.type === "status") {
      if (result.status !== exp.value) {
        throw new Error(`Expected status ${exp.value} but got ${result.status}.\nBody: ${text}`);
      }
      return;
    }

    if (exp.type === "body") {
      if (typeof exp.value === "function") {
        (exp.value as ExpectFn)(result.body);
      } else {
        const expected = JSON.stringify(exp.value);
        const actual = JSON.stringify(result.body);
        if (expected !== actual) {
          throw new Error(`Expected body ${expected} but got ${actual}`);
        }
      }
      return;
    }

    if (exp.type === "header") {
      this.assertHeader(exp.key, exp.value, result.headers);
    }
  }

  private assertHeader(key: string, expected: string | RegExp, headers: Headers): void {
    const actual = headers.get(key);
    if (expected instanceof RegExp) {
      if (!actual || !expected.test(actual)) {
        throw new Error(`Expected header "${key}" to match ${expected} but got "${actual}"`);
      }
      return;
    }
    if (actual !== expected) {
      throw new Error(`Expected header "${key}" to be "${expected}" but got "${actual}"`);
    }
  }

  /** Implements PromiseLike so the request chain can be awaited directly. */
  then<T>( // intentional thenable for fluent await syntax
    resolve: (value: TestResponse<TBody>) => T | PromiseLike<T>,
    reject?: (reason: unknown) => T | PromiseLike<T>,
  ): Promise<T> {
    return this.end().then(resolve, reject);
  }
}

export class TestHttpClient {
  constructor(private baseUrl: string) {}

  get<TBody = Record<string, unknown>>(path: string): TestRequest<TBody> {
    return new TestRequest<TBody>(this.baseUrl, "GET", path);
  }

  post<TBody = Record<string, unknown>>(path: string): TestRequest<TBody> {
    return new TestRequest<TBody>(this.baseUrl, "POST", path);
  }

  put<TBody = Record<string, unknown>>(path: string): TestRequest<TBody> {
    return new TestRequest<TBody>(this.baseUrl, "PUT", path);
  }

  patch<TBody = Record<string, unknown>>(path: string): TestRequest<TBody> {
    return new TestRequest<TBody>(this.baseUrl, "PATCH", path);
  }

  delete<TBody = Record<string, unknown>>(path: string): TestRequest<TBody> {
    return new TestRequest<TBody>(this.baseUrl, "DELETE", path);
  }
}

/**
 * Create a test HTTP client for API tests.
 * Reads `CELERITY_TEST_BASE_URL` env var (default: http://localhost:8081).
 */
export function createTestClient(options?: { baseUrl?: string }): TestHttpClient {
  const baseUrl = options?.baseUrl ?? process.env.CELERITY_TEST_BASE_URL ?? "http://localhost:8081";
  return new TestHttpClient(baseUrl);
}

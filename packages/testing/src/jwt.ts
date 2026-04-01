export type GenerateTestTokenOptions = {
  /** Subject claim (required by the dev auth server). Default: "test-user" */
  sub?: string;
  /** Arbitrary claims spread into the JWT payload (roles, permissions, org_id, etc.). */
  claims?: Record<string, unknown>;
  /** Token lifetime as a Go-style duration string. Default: "1h" */
  expiresIn?: string;
};

/**
 * Generate an RS256-signed JWT by calling the local dev auth server.
 *
 * The dev auth server runs as a sidecar in `celerity dev test` / `celerity dev run`
 * and is accessible via the `CELERITY_DEV_AUTH_BASE_URL` env var.
 *
 * @returns The signed access token string.
 * @throws If the dev auth server is unreachable or returns an error.
 */
export async function generateTestToken(options?: GenerateTestTokenOptions): Promise<string> {
  const baseURL = process.env.CELERITY_DEV_AUTH_BASE_URL ?? "http://localhost:9099";

  const body: Record<string, unknown> = {
    sub: options?.sub ?? "test-user",
  };
  if (options?.claims) {
    body.claims = options.claims;
  }
  if (options?.expiresIn) {
    body.expiresIn = options.expiresIn;
  }

  const response = await fetch(`${baseURL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dev auth server returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

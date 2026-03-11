import type { TokenProvider, TokenProviderFactory } from "../../../types";

/**
 * Generates IAM auth tokens for ElastiCache using SigV4 presigned requests.
 * Tokens are cached and refreshed ~1 minute before expiry.
 */
export class ElastiCacheTokenProvider implements TokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly cacheId: string,
    private readonly userId: string,
    private readonly region: string,
  ) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached.token;

    const { SignatureV4 } = await import("@smithy/signature-v4");
    const { Sha256 } = await import("@aws-crypto/sha256-js");
    const { defaultProvider } = await import("@aws-sdk/credential-provider-node");
    const { HttpRequest } = await import("@smithy/protocol-http");

    const signer = new SignatureV4({
      service: "elasticache",
      region: this.region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    const request = new HttpRequest({
      method: "GET",
      protocol: "https:",
      hostname: this.cacheId,
      path: "/",
      query: { Action: "connect", User: this.userId },
      headers: { host: this.cacheId },
    });

    const presigned = await signer.presign(request, { expiresIn: 900 });
    const token = formatPresignedUrl(presigned);

    // Cache with refresh ~1 min before 15-min expiry
    this.cached = { token, expiresAt: now + 14 * 60 * 1000 };
    return token;
  }
}

function formatPresignedUrl(request: {
  hostname?: string;
  path?: string;
  query?: Record<string, string | string[] | null>;
}): string {
  const params = new URLSearchParams();
  if (request.query) {
    for (const [key, value] of Object.entries(request.query)) {
      if (value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else {
        params.append(key, value);
      }
    }
  }
  return `${request.hostname}${request.path}?${params.toString()}`;
}

export function createElastiCacheTokenProviderFactory(): TokenProviderFactory {
  return (cacheId: string, userId: string, region: string) =>
    new ElastiCacheTokenProvider(cacheId, userId, region);
}

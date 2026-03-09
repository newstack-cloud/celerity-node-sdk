import type { TokenProvider, TokenProviderFactory } from "./types";

// 14 minutes — refresh ~1 min before the 15-minute RDS token expiry
const TOKEN_CACHE_MS = 14 * 60 * 1_000;

export class RdsTokenProvider implements TokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly hostname: string,
    private readonly port: number,
    private readonly username: string,
    private readonly region?: string,
  ) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached.token;

    const pkg = "@aws-sdk/rds-signer";
    const { Signer } = (await import(pkg)) as typeof import("@aws-sdk/rds-signer");
    const signer = new Signer({
      hostname: this.hostname,
      port: this.port,
      username: this.username,
      region: this.region,
    });

    const token = await signer.getAuthToken();
    this.cached = { token, expiresAt: now + TOKEN_CACHE_MS };
    return token;
  }
}

export function createRdsTokenProviderFactory(region?: string): TokenProviderFactory {
  return (hostname, port, username) => new RdsTokenProvider(hostname, port, username, region);
}

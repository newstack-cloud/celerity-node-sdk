import type { ConfigBackend } from "./types";

/**
 * Local/CI backend using Valkey (Redis-compatible).
 * Fetches a JSON-encoded string by storeId key.
 * Gracefully returns empty map if Valkey is unavailable.
 */
export class LocalConfigBackend implements ConfigBackend {
  async fetch(storeId: string): Promise<Map<string, string>> {
    try {
      const client = await this.createClient();
      const raw = await client.get(storeId);
      await client.quit();

      if (!raw) {
        return new Map();
      }

      const parsed: Record<string, unknown> = JSON.parse(raw);
      return new Map(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    } catch {
      return new Map();
    }
  }

  private async createClient() {
    const pkg = "ioredis";
    const { default: Redis } = (await import(pkg)) as {
      default: new (options?: object) => IoRedisClient;
    };

    const host = process.env.CELERITY_CONFIG_VALKEY_HOST ?? "localhost";
    const port = Number(process.env.CELERITY_CONFIG_VALKEY_PORT ?? "6379");
    return new Redis({ host, port, lazyConnect: true, connectTimeout: 2000 });
  }
}

type IoRedisClient = {
  get(key: string): Promise<string | null>;
  quit(): Promise<void>;
};

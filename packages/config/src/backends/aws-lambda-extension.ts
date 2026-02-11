import type { ConfigBackend } from "./types";
import { AwsSecretsManagerBackend } from "./aws-secrets-manager";

/**
 * AWS Lambda extension backend — Secrets Manager only.
 * Uses the Parameters and Secrets Lambda Extension local HTTP cache.
 * Falls back to direct SDK calls if the extension is unavailable.
 *
 * Detection: PARAMETERS_SECRETS_EXTENSION_HTTP_PORT env var is set
 * automatically when the extension layer is attached.
 */
export class AwsLambdaExtensionBackend implements ConfigBackend {
  private readonly sessionToken: string;
  private readonly extensionPort: string;
  private readonly fallback: AwsSecretsManagerBackend;

  constructor() {
    this.sessionToken = process.env.AWS_SESSION_TOKEN ?? "";
    this.extensionPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? "2773";
    this.fallback = new AwsSecretsManagerBackend();
  }

  async fetch(storeId: string): Promise<Map<string, string>> {
    try {
      const base = `http://localhost:${this.extensionPort}`;
      const url = `${base}/secretsmanager/get?secretId=${encodeURIComponent(storeId)}`;
      const res = await fetch(url, {
        headers: { "X-Aws-Parameters-Secrets-Token": this.sessionToken },
      });
      if (!res.ok) {
        throw new Error(`Extension returned ${res.status}`);
      }
      const data = (await res.json()) as { SecretString?: string };
      if (!data.SecretString) {
        return new Map();
      }
      const parsed: Record<string, unknown> = JSON.parse(data.SecretString);
      return new Map(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    } catch {
      return this.fallback.fetch(storeId);
    }
  }
}

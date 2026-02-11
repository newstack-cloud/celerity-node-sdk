import type { ConfigBackend } from "./types";

/** Fetches config from AWS Secrets Manager as a single JSON blob. */
export class AwsSecretsManagerBackend implements ConfigBackend {
  async fetch(storeId: string): Promise<Map<string, string>> {
    const pkg = "@aws-sdk/client-secrets-manager";
    const sdk = await import(pkg);
    const client = new sdk.SecretsManagerClient({});
    const result = await client.send(new sdk.GetSecretValueCommand({ SecretId: storeId }));

    if (!result.SecretString) {
      return new Map();
    }

    const parsed: Record<string, unknown> = JSON.parse(result.SecretString);
    return new Map(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  }
}

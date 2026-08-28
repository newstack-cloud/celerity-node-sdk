import type { SecretResolver } from "./types";

/** Reads single-credential secrets from AWS Secrets Manager. */
export class AwsSecretsManagerResolver implements SecretResolver {
  private client: SecretsManagerLike | null = null;

  async getString(ref: string): Promise<string> {
    const { client, GetSecretValueCommand } = await this.ensureClient();
    const result = await client.send(new GetSecretValueCommand({ SecretId: ref }));

    if (!result.SecretString) {
      throw new Error(`secret ${ref} has no string value`);
    }

    return result.SecretString;
  }

  async getFields(ref: string): Promise<Record<string, string>> {
    const raw = await this.getString(ref);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`secret ${ref} is not a JSON object of credential fields`);
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`secret ${ref} is not a JSON object of credential fields`);
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  }

  // The SDK is an optional peer dependency, so it is imported on first use
  // rather than at module load. The client is kept as a resource with a rotating
  // credential re-reads its secret, and the resolver outlives a single read.
  private async ensureClient(): Promise<{
    client: SecretsManagerLike;
    GetSecretValueCommand: GetSecretValueCommandCreator;
  }> {
    const pkg = "@aws-sdk/client-secrets-manager";
    const sdk = await import(pkg);
    const client = (this.client ??= new sdk.SecretsManagerClient({}) as SecretsManagerLike);
    return { client, GetSecretValueCommand: sdk.GetSecretValueCommand };
  }
}

type SecretsManagerLike = {
  send(command: unknown): Promise<{ SecretString?: string }>;
};

type GetSecretValueCommandCreator = new (input: { SecretId: string }) => unknown;

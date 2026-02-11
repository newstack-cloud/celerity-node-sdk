import type { ConfigBackend } from "./types";

/** Fetches config from AWS SSM Parameter Store using GetParametersByPath. */
export class AwsParameterStoreBackend implements ConfigBackend {
  async fetch(storeId: string): Promise<Map<string, string>> {
    const pkg = "@aws-sdk/client-ssm";
    const sdk = await import(pkg);
    const client = new sdk.SSMClient({});

    const prefix = storeId.endsWith("/") ? storeId : `${storeId}/`;
    const values = new Map<string, string>();
    let nextToken: string | undefined;

    do {
      const result = await client.send(
        new sdk.GetParametersByPathCommand({
          Path: prefix,
          Recursive: true,
          WithDecryption: true,
          NextToken: nextToken,
        }),
      );
      for (const param of result.Parameters ?? []) {
        if (param.Name && param.Value !== undefined) {
          const key = param.Name.slice(prefix.length);
          values.set(key, param.Value);
        }
      }
      nextToken = result.NextToken;
    } while (nextToken);

    return values;
  }
}

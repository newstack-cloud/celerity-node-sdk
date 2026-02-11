import { CelerityConfig } from "./env";

export type ResolvedResourceConfig = {
  provider: string;
  properties: Record<string, string>;
};

export function resolveConfig(resourceType: string, resourceName?: string): ResolvedResourceConfig {
  const prefix = resourceName
    ? `${resourceType.toUpperCase()}_${resourceName.toUpperCase()}_`
    : `${resourceType.toUpperCase()}_`;

  const allVars = CelerityConfig.getAllAppVars();
  const properties: Record<string, string> = {};
  let provider: string | undefined;

  for (const [key, value] of Object.entries(allVars)) {
    if (!key.startsWith(prefix)) continue;

    const suffix = key.slice(prefix.length);
    if (suffix === "PROVIDER") {
      provider = value;
    } else {
      properties[suffix] = value;
    }
  }

  if (!provider) {
    const platform = CelerityConfig.getPlatform();
    provider = platform === "other" ? "unknown" : platform;
  }

  return { provider, properties };
}

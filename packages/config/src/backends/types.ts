export type AwsStoreKind = "secrets-manager" | "parameter-store";

/** Backend that knows how to fetch config values from a specific store. */
export interface ConfigBackend {
  fetch(storeId: string): Promise<Map<string, string>>;
}

import type { ConfigBackend } from "./types";

/** No-op backend that always returns an empty config map. */
export class EmptyConfigBackend implements ConfigBackend {
  async fetch(_storeId: string): Promise<Map<string, string>> {
    return new Map();
  }
}

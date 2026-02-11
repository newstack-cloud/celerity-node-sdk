import createDebug from "debug";
import type { Schema } from "@celerity-sdk/types";
import type { ConfigBackend } from "./backends/types";

const debug = createDebug("celerity:config");

/**
 * A single config namespace backed by one celerity/config resource.
 * Lazy — fetches on first access, then caches with optional staleness-based refresh.
 */
export class ConfigNamespace {
  private values: Map<string, string> | null = null;
  private lastFetchedAt = 0;

  constructor(
    private readonly backend: ConfigBackend,
    private readonly storeId: string,
    private readonly refreshIntervalMs?: number | null,
  ) {}

  async get(key: string): Promise<string | undefined> {
    const values = await this.ensureLoaded();
    return values.get(key);
  }

  async getOrThrow(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === undefined) {
      throw new Error(`Config key "${key}" not found in namespace`);
    }
    return value;
  }

  async getAll(): Promise<Readonly<Record<string, string>>> {
    const values = await this.ensureLoaded();
    return Object.fromEntries(values);
  }

  async parse<T>(schema: Schema<T>): Promise<T> {
    const all = await this.getAll();
    return schema.parse(all);
  }

  private async ensureLoaded(): Promise<ReadonlyMap<string, string>> {
    const now = Date.now();
    const isStale =
      this.refreshIntervalMs !== null &&
      typeof this.refreshIntervalMs !== "undefined" &&
      this.values !== null &&
      now - this.lastFetchedAt >= this.refreshIntervalMs;

    if (this.values === null) {
      debug("namespace %s: first fetch", this.storeId);
      this.values = await this.backend.fetch(this.storeId);
      this.lastFetchedAt = now;
      debug("namespace %s: %d keys loaded", this.storeId, this.values.size);
    } else if (isStale) {
      debug(
        "namespace %s: stale (age=%dms), triggering background refresh",
        this.storeId,
        now - this.lastFetchedAt,
      );
      void this.backend
        .fetch(this.storeId)
        .then((fresh) => {
          this.values = fresh;
          this.lastFetchedAt = Date.now();
          debug("namespace %s: refreshed, %d keys", this.storeId, fresh.size);
        })
        .catch(() => {
          debug("namespace %s: refresh failed, serving stale values", this.storeId);
        });
    }

    return this.values;
  }
}

/**
 * DI-injectable config service. Provides stringly-typed and schema-validated
 * access to config values from platform-specific stores.
 */
export class ConfigService {
  private readonly namespaces = new Map<string, ConfigNamespace>();

  registerNamespace(name: string, namespace: ConfigNamespace): void {
    debug("registerNamespace: %s", name);
    this.namespaces.set(name, namespace);
  }

  namespace(name: string): ConfigNamespace {
    const ns = this.namespaces.get(name);
    if (!ns) {
      throw new Error(`Config namespace "${name}" not registered`);
    }
    return ns;
  }

  async get(key: string): Promise<string | undefined> {
    return this.defaultNamespace().get(key);
  }

  async getOrThrow(key: string): Promise<string> {
    return this.defaultNamespace().getOrThrow(key);
  }

  async getAll(): Promise<Readonly<Record<string, string>>> {
    return this.defaultNamespace().getAll();
  }

  async parse<T>(schema: Schema<T>): Promise<T> {
    return this.defaultNamespace().parse(schema);
  }

  private defaultNamespace(): ConfigNamespace {
    if (this.namespaces.size === 0) {
      throw new Error("No config namespaces registered");
    }
    if (this.namespaces.size > 1) {
      throw new Error(
        "Multiple config namespaces registered. Use config.namespace(name) to access a specific one.",
      );
    }
    return this.namespaces.values().next().value!;
  }
}

import { readFileSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import yaml from "js-yaml";
import stripJsonComments from "strip-json-comments";

/**
 * Physical resource info extracted from the blueprint.
 */
export type BlueprintResource = {
  resourceId: string;
  type: string; // "celerity/datastore", "celerity/topic", etc.
  physicalName: string; // spec.name or fallback to resourceId
};

type BlueprintSpec = {
  resources?: Record<string, { type?: string; spec?: { name?: string } }>;
};

/**
 * Parse the app blueprint and extract resource definitions with their
 * physical names (spec.name). This maps resource IDs used in decorators
 * (e.g., "usersDatastore") to the actual infrastructure names (e.g., "users").
 */
export function loadBlueprintResources(blueprintPath?: string): Map<string, BlueprintResource> {
  const path = blueprintPath ?? findBlueprintPath();
  if (!path) return new Map();

  const bp = parseBlueprint(path) as BlueprintSpec | undefined;

  const resources = new Map<string, BlueprintResource>();
  const bpResources = bp?.resources;
  if (!bpResources || typeof bpResources !== "object") return resources;

  for (const [id, resource] of Object.entries(bpResources)) {
    if (!resource?.type) continue;

    resources.set(id, {
      resourceId: id,
      type: resource.type,
      physicalName: resource.spec?.name ?? id,
    });
  }

  return resources;
}

/**
 * Map a resource type from the token format ("datastore") to the blueprint
 * format ("celerity/datastore").
 */
export function tokenTypeToBlueprintType(tokenType: string): string {
  return `celerity/${tokenType}`;
}

/**
 * WebSocket configuration extracted from the blueprint's API resource.
 */
export type WebSocketConfig = {
  /** The base path for WebSocket connections (e.g., "/ws"). */
  basePath: string;
  /** The route key used for message routing (e.g., "action"). */
  routeKey: string;
  /** The auth strategy: "authMessage" or "connect". */
  authStrategy: "authMessage" | "connect";
};

/**
 * Extract WebSocket configuration from the first celerity/api resource
 * in the blueprint that has WebSocket protocol configured.
 *
 * Returns null if no WebSocket configuration is found.
 */
export function loadWebSocketConfig(blueprintPath?: string): WebSocketConfig | null {
  const path = blueprintPath ?? findBlueprintPath();
  if (!path) return null;

  const bp = parseBlueprint(path) as unknown;
  if (!bp || typeof bp !== "object") return null;

  const resources = (bp as Record<string, unknown>).resources;
  if (!resources || typeof resources !== "object") return null;

  for (const resource of Object.values(resources as Record<string, unknown>)) {
    if (!resource || typeof resource !== "object") continue;
    const res = resource as Record<string, unknown>;
    if (res.type !== "celerity/api" || !res.spec) continue;

    const spec = res.spec as Record<string, unknown>;
    const { routeKey, authStrategy } = findWsProtocolConfig(spec.protocols);
    const basePath = findWsBasePath(spec.domain);

    return { basePath, routeKey, authStrategy };
  }

  return null;
}

function findWsProtocolConfig(protocols: unknown): {
  routeKey: string;
  authStrategy: "authMessage" | "connect";
} {
  const defaults = { routeKey: "action", authStrategy: "authMessage" as const };
  if (!Array.isArray(protocols)) return defaults;

  for (const proto of protocols) {
    if (typeof proto !== "object" || !proto) continue;
    const wsCfg = (proto as Record<string, unknown>).websocketConfig;
    if (!wsCfg || typeof wsCfg !== "object") continue;

    const cfg = wsCfg as Record<string, unknown>;
    return {
      routeKey: typeof cfg.routeKey === "string" ? cfg.routeKey : defaults.routeKey,
      authStrategy:
        cfg.authStrategy === "connect" || cfg.authStrategy === "authMessage"
          ? cfg.authStrategy
          : defaults.authStrategy,
    };
  }

  return defaults;
}

function findWsBasePath(domain: unknown): string {
  if (!domain || typeof domain !== "object") return "/ws";

  const basePaths = (domain as Record<string, unknown>).basePaths;
  if (!Array.isArray(basePaths)) return "/ws";

  for (const entry of basePaths) {
    if (typeof entry !== "object" || !entry) continue;
    const bp = entry as Record<string, unknown>;
    if (bp.protocol !== "websocket") continue;
    return typeof bp.basePath === "string" ? bp.basePath : "/ws";
  }

  return "/ws";
}

function parseBlueprint(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath);
  if (ext === ".jsonc" || ext === ".json") {
    return JSON.parse(stripJsonComments(content, { trailingCommas: true }));
  }
  return yaml.load(content);
}

function findBlueprintPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "app.blueprint.yaml"),
    join(cwd, "app.blueprint.yml"),
    join(cwd, "app.blueprint.jsonc"),
    join(cwd, "app.blueprint.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate);
    }
  }
  return null;
}

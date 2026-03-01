import type { CelerityLayer } from "@celerity-sdk/types";
import { ConfigLayer, captureResourceLinks, getResourceTypes } from "@celerity-sdk/config";

const RESOURCE_LAYER_MAP: Record<string, { pkg: string; className: string }> = {
  bucket: { pkg: "@celerity-sdk/bucket", className: "ObjectStorageLayer" },
  queue: { pkg: "@celerity-sdk/queue", className: "QueueLayer" },
  cache: { pkg: "@celerity-sdk/cache", className: "CacheLayer" },
};

export async function createDefaultSystemLayers(): Promise<CelerityLayer[]> {
  const layers: CelerityLayer[] = [];

  // Telemetry layer first — always try to load.
  // The layer itself decides: full OTel (tracing enabled) or logger-only (tracing disabled).
  try {
    const pkg = "@celerity-sdk/telemetry";
    const mod = (await import(pkg)) as Record<string, unknown>;
    const TelemetryLayerClass = mod.TelemetryLayer as new () => CelerityLayer;
    layers.push(new TelemetryLayerClass());
  } catch {
    // telemetry package not installed — skip
  }

  layers.push(new ConfigLayer());

  // Resource layers — driven by CELERITY_RESOURCE_LINKS topology.
  // Each loads AFTER config so it can resolve identifiers via ConfigService.
  const links = captureResourceLinks();
  const resourceTypes = getResourceTypes(links);

  for (const type of resourceTypes) {
    const entry = RESOURCE_LAYER_MAP[type];
    if (!entry) continue;

    try {
      const pkg = entry.pkg;
      const mod = (await import(pkg)) as Record<string, unknown>;
      const LayerClass = mod[entry.className] as new () => CelerityLayer;
      layers.push(new LayerClass());
    } catch {
      // resource package not installed — skip
    }
  }

  return layers;
}

import type { CelerityLayer } from "@celerity-sdk/types";
import { ConfigLayer } from "@celerity-sdk/config";

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
  return layers;
}

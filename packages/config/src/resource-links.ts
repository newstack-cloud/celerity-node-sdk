export type ResourceLink = {
  type: string;
  configKey: string;
};

export type ResourceLinks = ReadonlyMap<string, ResourceLink>;

/**
 * Well-known config namespace name for resource identifiers.
 * The build/deploy process populates this namespace with actual infrastructure
 * identifiers (bucket names, queue URLs, etc.).
 */
export const RESOURCE_CONFIG_NAMESPACE = "resources";

/**
 * Captures resource link topology from the `CELERITY_RESOURCE_LINKS` env var.
 * Returns a map of resource name → { type, configKey }. Actual infrastructure
 * identifiers are resolved via ConfigService at runtime, not from this env var.
 */
export function captureResourceLinks(): ResourceLinks {
  const raw = process.env.CELERITY_RESOURCE_LINKS;
  if (!raw) return new Map();

  const parsed = JSON.parse(raw) as Record<string, { type: string; configKey: string }>;
  return new Map(Object.entries(parsed).map(([resourceName, link]) => [resourceName, link]));
}

/** Filters resource links by type, returning resourceName → configKey. */
export function getLinksOfType(links: ResourceLinks, type: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [resourceName, link] of links) {
    if (link.type === type) result.set(resourceName, link.configKey);
  }
  return result;
}

/** Returns the set of distinct resource types present in the links. */
export function getResourceTypes(links: ResourceLinks): Set<string> {
  return new Set([...links.values()].map((l) => l.type));
}

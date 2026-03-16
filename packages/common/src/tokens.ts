// -- DI service tokens (string constants for container registration) --

/** DI token for the CelerityLogger service. */
export const LOGGER_TOKEN = "CelerityLogger";

/** DI token for the CelerityTracer service. */
export const TRACER_TOKEN = "CelerityTracer";

/** DI token for the ConfigService. */
export const CONFIG_SERVICE_TOKEN = "ConfigService";

// -- Cross-package decorator metadata symbols --
// Used by resource-type packages (bucket, queue, etc.) to write DI and
// resource metadata without depending on @celerity-sdk/core.

/** Metadata key for `@Inject()` parameter overrides. */
export const INJECT_METADATA = Symbol.for("celerity:inject");

/** Metadata key for `@UseResource()` / resource-type param decorators. */
export const USE_RESOURCE_METADATA = Symbol.for("celerity:useResource");

// -- Resource layer token detection --
// Resource decorators (@Datastore, @Bucket, @Cache, @Queue, @Topic,
// @SqlDatabase) produce Symbol.for("celerity:<type>:<name>") tokens that are
// registered lazily by system layers at runtime, not by user modules.
// Both the runtime validator and CLI extractor need to recognise these tokens
// to skip them during static dependency validation.

const RESOURCE_TOKEN_PREFIXES = [
  "celerity:config:",
  "celerity:datastore:",
  "celerity:bucket:",
  "celerity:cache:",
  "celerity:queue:",
  "celerity:topic:",
  "celerity:sqlDatabase:",
];

/**
 * Returns true if the given DI token is a resource layer token that will be
 * registered lazily by a system layer at runtime rather than by any user module.
 */
export function isResourceLayerToken(token: unknown): boolean {
  if (typeof token !== "symbol") return false;
  const desc = token.description;
  return desc != null && RESOURCE_TOKEN_PREFIXES.some((p) => desc.startsWith(p));
}

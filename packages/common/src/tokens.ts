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

// -- Runtime-provided token detection --
// The runtime registers certain DI tokens (resource handles, WebSocket sender,
// etc.) lazily at startup rather than through user module providers.
// The module-graph validator and CLI extractor need to recognise these tokens
// so they can be skipped during static dependency validation.

/** Prefixes for resource layer tokens: Symbol.for("celerity:<type>:<name>") */
const RESOURCE_TOKEN_PREFIXES = [
  "celerity:config:",
  "celerity:datastore:",
  "celerity:bucket:",
  "celerity:cache:",
  "celerity:queue:",
  "celerity:topic:",
  "celerity:sqlDatabase:",
];

/** Exact symbol descriptions for other runtime-provided tokens. */
const RUNTIME_PROVIDED_TOKENS = ["celerity:websocket-sender"];

/**
 * Returns true if the given DI token is provided by the runtime rather than
 * by user modules. This includes resource layer tokens (datastore, bucket, etc.)
 * and system services (WebSocketSender).
 *
 * Used by the module-graph validator to skip these tokens during static
 * dependency analysis, since they are registered at runtime startup.
 */
export function isRuntimeProvidedToken(token: unknown): boolean {
  if (typeof token !== "symbol") return false;
  const desc = token.description;
  return (
    desc != null &&
    (RESOURCE_TOKEN_PREFIXES.some((p) => desc.startsWith(p)) ||
      RUNTIME_PROVIDED_TOKENS.includes(desc))
  );
}

/**
 * @deprecated Use `isRuntimeProvidedToken` instead.
 */
export const isResourceLayerToken = isRuntimeProvidedToken;

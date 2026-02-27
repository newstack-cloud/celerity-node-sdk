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

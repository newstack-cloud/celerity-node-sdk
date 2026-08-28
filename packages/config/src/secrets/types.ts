/**
 * Reads a credential that a config namespace refers to rather than contains.
 *
 * Connection details for a cache or a database are published to the resources
 * namespace as ordinary parameters, but the credential itself stays in the
 * secret store that owns it and the namespace carries only a reference. Copying
 * the value into the namespace would leave a second copy of something that
 * rotates on a schedule the application does not control, and the copy would go
 * stale silently with the failure surfacing much later as an authentication error
 * with nothing to connect it to.
 *
 * This differs from {@link ConfigBackend}, which reads a store holding a whole
 * namespace of config values. A resolver reads one secret holding one
 * credential, either as a bare string or as a small object of fields.
 *
 * Service packages take a resolver rather than reaching for a store directly,
 * so that resolving `myCache_authTokenSecretId` stays the same operation
 * whichever cloud the application is deployed to.
 */
export interface SecretResolver {
  /** Fetches a secret whose value is a single credential string. */
  getString(ref: string): Promise<string>;
  /** Fetches a secret holding an object of credential fields. */
  getFields(ref: string): Promise<Record<string, string>>;
}

import type { ConfigNamespace, SecretResolver } from "@celerity-sdk/config";
import type {
  CacheAuthMode,
  CacheConnectionInfo,
  CacheCredentials,
  CacheCredentialsOptions,
  CacheIamAuth,
  CachePasswordAuth,
  TokenProvider,
  TokenProviderContext,
  TokenProviderFactory,
} from "./types";
import { CacheError } from "./errors";

const DEFAULT_PORT = 6379;

export async function resolveCacheCredentials(
  configKey: string,
  resourceConfig: ConfigNamespace,
  options: CacheCredentialsOptions = {},
): Promise<CacheCredentials> {
  const { tokenProviderFactory, secrets } = options;

  const host = await resourceConfig.get(`${configKey}_host`);
  if (!host) {
    throw new CacheError(`Missing required config key "${configKey}_host"`, configKey);
  }

  const portRaw = await resourceConfig.get(`${configKey}_port`);
  const port = portRaw ? Number.parseInt(portRaw, 10) : DEFAULT_PORT;

  const authModeRaw = await resourceConfig.get(`${configKey}_authMode`);
  const authMode: CacheAuthMode = authModeRaw === "iam" ? "iam" : "password";

  const tlsRaw = await resourceConfig.get(`${configKey}_tls`);
  // IAM auth forces TLS; otherwise default to true
  const tls = authMode === "iam" ? true : tlsRaw !== "false";

  const clusterModeRaw = await resourceConfig.get(`${configKey}_clusterMode`);
  const clusterMode = clusterModeRaw === "true";

  const user = await resourceConfig.get(`${configKey}_user`);
  const keyPrefix = (await resourceConfig.get(`${configKey}_keyPrefix`)) ?? "";

  const connectionInfo: CacheConnectionInfo = {
    host,
    port,
    tls,
    clusterMode,
    authMode,
    keyPrefix,
    ...(user ? { user } : {}),
  };

  if (authMode === "password") {
    const authToken = await resolveAuthToken(configKey, resourceConfig, secrets);
    return new PasswordCacheCredentials(connectionInfo, authToken);
  }

  if (!tokenProviderFactory) {
    throw new CacheError(
      `IAM auth requires a tokenProviderFactory for config key "${configKey}"`,
      configKey,
    );
  }

  // Everything else IAM auth needs is the provider's to ask for. What a token
  // is signed with differs by platform, a region and an RBAC user on AWS, an
  // object id and a scope on Azure, neither on GCP where the token is the whole
  // credential. Each provider reads its own keys out of the namespace rather
  // than having them named here and required of every platform.
  return new IamCacheCredentials(connectionInfo, tokenProviderFactory, {
    configKey,
    resourceConfig,
    host,
    ...(user ? { user } : {}),
  });
}

/**
 * The AUTH token, from wherever this environment keeps it.
 *
 * Local development seeds the literal into the namespace, because the value is a
 * fixed constant that doesn't need to be protected. A deployed cache has a generated token
 * living in a secret store, and the namespace carries a reference to it.
 *
 * Which store holds it is the resolver's business, not this function's.
 * Here, a reference is an opaque id handed to a secrets resolver that knows how to read it.
 *
 * An absent token is not an error, a local cache with no auth configured is
 * legitimate, and the client connects without a password.
 */
async function resolveAuthToken(
  configKey: string,
  resourceConfig: ConfigNamespace,
  secrets: SecretResolver | undefined,
): Promise<string | undefined> {
  const literal = await resourceConfig.get(`${configKey}_authToken`);
  if (literal) return literal;

  const secretId = await resourceConfig.get(`${configKey}_authTokenSecretId`);
  if (!secretId) return undefined;

  if (!secrets) {
    throw new CacheError(
      `"${configKey}_authTokenSecretId" refers to a secret, but no secret store is ` +
        "configured for this platform",
      configKey,
    );
  }

  try {
    return await secrets.getString(secretId);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new CacheError(
      `reading the AUTH token for "${configKey}" from ${secretId}: ${cause}`,
      configKey,
    );
  }
}

class PasswordCacheCredentials implements CacheCredentials {
  constructor(
    private readonly info: CacheConnectionInfo,
    private readonly authToken?: string,
  ) {}

  async getConnectionInfo(): Promise<CacheConnectionInfo> {
    return this.info;
  }

  async getPasswordAuth(): Promise<CachePasswordAuth> {
    return { authToken: this.authToken };
  }

  async getIamAuth(): Promise<CacheIamAuth> {
    throw new CacheError('Cannot call getIamAuth() when authMode is "password"', this.info.host);
  }
}

class IamCacheCredentials implements CacheCredentials {
  private tokenProvider: Promise<TokenProvider> | null = null;

  constructor(
    private readonly info: CacheConnectionInfo,
    private readonly factory: TokenProviderFactory,
    private readonly context: TokenProviderContext,
  ) {}

  async getConnectionInfo(): Promise<CacheConnectionInfo> {
    return this.info;
  }

  async getPasswordAuth(): Promise<CachePasswordAuth> {
    throw new CacheError('Cannot call getPasswordAuth() when authMode is "iam"', this.info.host);
  }

  async getIamAuth(): Promise<CacheIamAuth> {
    const provider = await this.getOrCreateTokenProvider();
    const token = await provider.getToken();
    return { token };
  }

  private getOrCreateTokenProvider(): Promise<TokenProvider> {
    this.tokenProvider ??= this.factory(this.context);
    return this.tokenProvider;
  }
}

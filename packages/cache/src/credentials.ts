import type { ConfigNamespace } from "@celerity-sdk/config";
import type {
  CacheAuthMode,
  CacheConnectionInfo,
  CacheCredentials,
  CacheIamAuth,
  CachePasswordAuth,
  TokenProvider,
  TokenProviderFactory,
} from "./types";
import { CacheError } from "./errors";

const DEFAULT_PORT = 6379;

export async function resolveCacheCredentials(
  configKey: string,
  resourceConfig: ConfigNamespace,
  tokenProviderFactory?: TokenProviderFactory,
): Promise<CacheCredentials> {
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
    const authToken = await resourceConfig.get(`${configKey}_authToken`);
    return new PasswordCacheCredentials(connectionInfo, authToken);
  }

  if (!user) {
    throw new CacheError(`Missing required config key "${configKey}_user" for IAM auth`, configKey);
  }

  if (!tokenProviderFactory) {
    throw new CacheError(
      `IAM auth requires a tokenProviderFactory for config key "${configKey}"`,
      configKey,
    );
  }

  const region = await resourceConfig.get(`${configKey}_region`);
  if (!region) {
    throw new CacheError(
      `Missing required config key "${configKey}_region" for IAM auth`,
      configKey,
    );
  }

  return new IamCacheCredentials(connectionInfo, tokenProviderFactory, host, user, region);
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
  private tokenProvider: TokenProvider | null = null;

  constructor(
    private readonly info: CacheConnectionInfo,
    private readonly factory: TokenProviderFactory,
    private readonly cacheId: string,
    private readonly userId: string,
    private readonly region: string,
  ) {}

  async getConnectionInfo(): Promise<CacheConnectionInfo> {
    return this.info;
  }

  async getPasswordAuth(): Promise<CachePasswordAuth> {
    throw new CacheError('Cannot call getPasswordAuth() when authMode is "iam"', this.info.host);
  }

  async getIamAuth(): Promise<CacheIamAuth> {
    const provider = this.getOrCreateTokenProvider();
    const token = await provider.getToken();
    return { token };
  }

  private getOrCreateTokenProvider(): TokenProvider {
    if (!this.tokenProvider) {
      this.tokenProvider = this.factory(this.cacheId, this.userId, this.region);
    }
    return this.tokenProvider;
  }
}

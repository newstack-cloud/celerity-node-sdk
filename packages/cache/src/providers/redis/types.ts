import type { CacheAuthMode, ConnectionConfig } from "../../types";

export type RedisCacheConfig = {
  host: string;
  port: number;
  tls: boolean;
  clusterMode: boolean;
  authMode: CacheAuthMode;
  authToken?: string;
  user?: string;
  connectionConfig: ConnectionConfig;
  /** Function returning a fresh auth token for IAM mode connections. */
  authTokenProvider?: () => Promise<string>;
};

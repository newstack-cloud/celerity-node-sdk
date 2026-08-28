export { CelerityConfig } from "./env";
export type { Platform } from "./env";
export { resolveConfig } from "./resolver";
export type { ResolvedResourceConfig } from "./resolver";

export type { ConfigService, ConfigNamespace } from "./config-service";
export { ConfigServiceImpl, ConfigNamespaceImpl } from "./config-service";
export { ConfigLayer } from "./config-layer";
export { Config, configNamespaceToken } from "./decorators";

export type { ConfigBackend, AwsStoreKind } from "./backends/types";
export { resolveBackend } from "./backends/resolve";
export { EmptyConfigBackend } from "./backends/empty";
export { AwsSecretsManagerBackend } from "./backends/aws-secrets-manager";
export { selectSecretResolver } from "./secrets/resolve";
export { AwsSecretsManagerResolver } from "./secrets/aws";
export type { SecretResolver } from "./secrets/types";
export { AwsParameterStoreBackend } from "./backends/aws-parameter-store";
export { AwsLambdaExtensionBackend } from "./backends/aws-lambda-extension";
export { LocalConfigBackend } from "./backends/local";

export {
  captureResourceLinks,
  captureHandlerScope,
  getLinksOfType,
  getResourceTypes,
  HANDLER_SCOPE_FILENAME,
  RESOURCE_CONFIG_NAMESPACE,
} from "./resource-links";
export type { ResourceLink, ResourceLinks } from "./resource-links";

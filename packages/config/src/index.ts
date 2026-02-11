export { CelerityConfig } from "./env";
export { resolveConfig } from "./resolver";
export type { ResolvedResourceConfig } from "./resolver";

export { ConfigService, ConfigNamespace } from "./config-service";
export { ConfigLayer } from "./config-layer";

export type { ConfigBackend, AwsStoreKind } from "./backends/types";
export { resolveBackend } from "./backends/resolve";
export { EmptyConfigBackend } from "./backends/empty";
export { AwsSecretsManagerBackend } from "./backends/aws-secrets-manager";
export { AwsParameterStoreBackend } from "./backends/aws-parameter-store";
export { AwsLambdaExtensionBackend } from "./backends/aws-lambda-extension";
export { LocalConfigBackend } from "./backends/local";

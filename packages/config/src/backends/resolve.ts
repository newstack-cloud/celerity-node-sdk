import createDebug from "debug";
import type { ConfigBackend, AwsStoreKind } from "./types";
import { AwsSecretsManagerBackend } from "./aws-secrets-manager";
import { AwsParameterStoreBackend } from "./aws-parameter-store";
import { AwsLambdaExtensionBackend } from "./aws-lambda-extension";
import { LocalConfigBackend } from "./local";
import { EmptyConfigBackend } from "./empty";

const debug = createDebug("celerity:config:backend");

/**
 * Selects the appropriate config backend based on platform and environment.
 *
 * AWS backend selection:
 * - Parameter Store → always direct SDK (extension doesn't support GetParametersByPath)
 * - Secrets Manager on Lambda with extension → Lambda extension cache
 * - Secrets Manager otherwise → direct SDK
 */
export function resolveBackend(platform: string, storeKind: AwsStoreKind): ConfigBackend {
  let backend: ConfigBackend;
  switch (platform) {
    case "aws":
      backend = resolveAwsBackend(storeKind);
      break;
    case "local":
      backend = new LocalConfigBackend();
      break;
    default:
      backend = new EmptyConfigBackend();
      break;
  }
  debug(
    "resolveBackend: platform=%s storeKind=%s → %s",
    platform,
    storeKind,
    backend.constructor.name,
  );
  return backend;
}

function resolveAwsBackend(storeKind: AwsStoreKind): ConfigBackend {
  if (storeKind === "parameter-store") {
    return new AwsParameterStoreBackend();
  }

  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const hasExtension = !!process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;

  if (isLambda && hasExtension) {
    return new AwsLambdaExtensionBackend();
  }

  return new AwsSecretsManagerBackend();
}

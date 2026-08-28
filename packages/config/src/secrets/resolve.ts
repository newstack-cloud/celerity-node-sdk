import createDebug from "debug";
import type { Platform } from "../env";
import type { SecretResolver } from "./types";
import { AwsSecretsManagerResolver } from "./aws";

const debug = createDebug("celerity:config:secrets");

/**
 * Selects the secret resolver for the platform the application is deployed to.
 *
 * One resolver per platform, which is why these are filed by platform rather
 * than by store the way config backends are: AWS alone has three of those,
 * chosen by how the namespace is stored, where a credential reference has one
 * answer per cloud.
 *
 * Returns `undefined` where the platform has no secret store wired up. Local
 * development is the most obvious example, as credentials are seeded as literals and a
 * reference should never appear. Callers treat a reference they cannot resolve
 * as a configuration error and say so in terms of the resource it belongs to.
 */
export function selectSecretResolver(platform: Platform): SecretResolver | undefined {
  let resolver: SecretResolver | undefined;
  switch (platform) {
    case "aws":
      resolver = new AwsSecretsManagerResolver();
      break;
    // case "gcp":
    //   v1: Google Cloud Secret Manager
    // case "azure":
    //   v1: Azure Key Vault
    default:
      resolver = undefined;
      break;
  }
  debug("selectSecretResolver: platform=%s → %s", platform, resolver?.constructor.name ?? "none");
  return resolver;
}

import { describe, it, expect, vi } from "vitest";
import { selectSecretResolver } from "../../src/secrets/resolve";
import { AwsSecretsManagerResolver } from "../../src/secrets/aws";

describe("selectSecretResolver", () => {
  it("gives AWS deployments a Secrets Manager resolver", () => {
    expect(selectSecretResolver("aws")).toBeInstanceOf(AwsSecretsManagerResolver);
  });

  // Local development seeds credentials as literals, so a reference should
  // never appear and there is nothing to resolve it with. Service packages turn
  // the absence into an error naming the resource that asked for one.
  it.each(["local", "gcp", "azure", "other"] as const)(
    "leaves %s without a resolver until a store is wired up",
    (platform) => {
      expect(selectSecretResolver(platform)).toBeUndefined();
    },
  );
});

// The SDK call itself is stubbed, what matters here is the shape the resolver
// hands back, not the call over the wire.
function stubResolver(secretString: string | undefined): AwsSecretsManagerResolver {
  const resolver = new AwsSecretsManagerResolver();
  const send = vi.fn().mockResolvedValue({ SecretString: secretString });
  Reflect.set(resolver, "ensureClient", () =>
    Promise.resolve({ client: { send }, GetSecretValueCommand: class {} }),
  );
  return resolver;
}

describe("AwsSecretsManagerResolver", () => {
  it("returns a single-credential secret as-is", async () => {
    await expect(stubResolver("generated-token").getString("secret-id")).resolves.toBe(
      "generated-token",
    );
  });

  it("fails when the secret has no string value", async () => {
    await expect(stubResolver(undefined).getString("secret-id")).rejects.toThrow(
      /secret-id has no string value/,
    );
  });

  it("parses a fields secret into strings", async () => {
    const raw = JSON.stringify({ username: "celerity_app", password: "generated", port: 5432 });

    await expect(stubResolver(raw).getFields("secret-id")).resolves.toEqual({
      username: "celerity_app",
      password: "generated",
      port: "5432",
    });
  });

  // Pointed at a single-credential secret by mistake, 
  // or a secret that is not JSON at all,
  // or a JSON value that is not an object.
  it.each([["not json"], ['"a string"'], ["[1,2]"], ["null"]])(
    "rejects %s as a fields secret",
    async (raw) => {
      await expect(stubResolver(raw).getFields("secret-id")).rejects.toThrow(
        /not a JSON object of credential fields/,
      );
    },
  );
});

import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getDatastore } from "../src/helpers";
import { datastoreToken, DEFAULT_DATASTORE_TOKEN } from "../src/decorators";

function mockContainer(resolveImpl: (token: unknown) => unknown): ServiceContainer {
  return {
    resolve: vi.fn().mockImplementation((token: unknown) => Promise.resolve(resolveImpl(token))),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

describe("getDatastore", () => {
  it("resolves the resource-specific token for a named resource", async () => {
    const fakeDatastore = { name: "users" };
    const container = mockContainer((token) =>
      token === datastoreToken("usersTable") ? fakeDatastore : undefined,
    );

    const result = await getDatastore(container, "usersTable");

    expect(result).toBe(fakeDatastore);
    expect(container.resolve).toHaveBeenCalledWith(datastoreToken("usersTable"));
  });

  it("resolves the default token when no resource name is given", async () => {
    const fakeDatastore = { name: "default" };
    const container = mockContainer((token) =>
      token === DEFAULT_DATASTORE_TOKEN ? fakeDatastore : undefined,
    );

    const result = await getDatastore(container);

    expect(result).toBe(fakeDatastore);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_DATASTORE_TOKEN);
  });
});

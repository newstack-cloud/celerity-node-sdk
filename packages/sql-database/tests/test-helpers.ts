import { vi } from "vitest";
import type { ConfigNamespace } from "@celerity-sdk/config";
import type { ServiceContainer } from "@celerity-sdk/types";

export { PG_TEST_CONFIG } from "./pg-test-config";

export function mockNamespace(
  values: Record<string, string | undefined>,
): ConfigNamespace {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`Key "${key}" not found`);
      return Promise.resolve(v);
    }),
    getAll: vi.fn().mockImplementation(() =>
      Promise.resolve(
        Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined) as [string, string][],
        ),
      ),
    ),
    parse: vi.fn().mockRejectedValue(new Error("not implemented")),
  } as unknown as ConfigNamespace;
}

export function mockContainer(
  resolveImpl: (token: unknown) => unknown,
): ServiceContainer {
  return {
    resolve: vi.fn().mockImplementation((token: unknown) => Promise.resolve(resolveImpl(token))),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

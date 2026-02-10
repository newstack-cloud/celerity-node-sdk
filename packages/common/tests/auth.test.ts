import { describe, it, expect } from "vitest";
import { extractUserId } from "../src/auth";

describe("extractUserId", () => {
  it("should return undefined for null auth", () => {
    expect(extractUserId(null)).toBeUndefined();
  });

  it("should return undefined for empty auth", () => {
    expect(extractUserId({})).toBeUndefined();
  });

  it("should extract sub from JWT guard claims", () => {
    expect(
      extractUserId({
        jwt: { claims: { sub: "user-42", aud: "my-app", iss: "https://issuer.example.com" } },
      }),
    ).toBe("user-42");
  });

  it("should extract direct sub from a custom guard result", () => {
    expect(extractUserId({ oidcProxy: { sub: "oidc-user-1" } })).toBe("oidc-user-1");
  });

  it("should extract userId from a custom guard result", () => {
    expect(
      extractUserId({ customGuard: { userId: "104932", email: "test@test.com" } }),
    ).toBe("104932");
  });

  it("should extract user_id (snake_case) from a custom guard result", () => {
    expect(extractUserId({ internalAuth: { user_id: "u-789" } })).toBe("u-789");
  });

  it("should prefer claims.sub over direct sub/userId", () => {
    expect(
      extractUserId({
        jwt: { claims: { sub: "jwt-user" } },
        customGuard: { userId: "custom-user" },
      }),
    ).toBe("jwt-user");
  });

  it("should skip non-object guard results", () => {
    expect(extractUserId({ jwt: "invalid", apiKey: 12345, valid: { sub: "found" } })).toBe(
      "found",
    );
  });

  it("should skip null guard results", () => {
    expect(extractUserId({ jwt: null, valid: { userId: "ok" } })).toBe("ok");
  });

  it("should return undefined when no guard has a user identifier", () => {
    expect(extractUserId({ apiKey: { key: "abc123", scope: "read" } })).toBeUndefined();
  });

  it("should coerce numeric sub in claims to string", () => {
    expect(extractUserId({ jwt: { claims: { sub: 12345 } } })).toBe("12345");
  });

  it("should coerce numeric userId to string", () => {
    expect(extractUserId({ guard: { userId: 999 } })).toBe("999");
  });

  it("should coerce numeric user_id to string", () => {
    expect(extractUserId({ internalAuth: { user_id: 42 } })).toBe("42");
  });

  it("should skip boolean/object/null values", () => {
    expect(extractUserId({ guard: { sub: true } })).toBeUndefined();
    expect(extractUserId({ guard: { userId: { nested: true } } })).toBeUndefined();
    expect(extractUserId({ guard: { user_id: null } })).toBeUndefined();
  });
});

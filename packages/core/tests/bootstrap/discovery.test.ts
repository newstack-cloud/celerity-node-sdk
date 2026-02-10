import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { discoverModule } from "../../src/bootstrap/discovery";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

afterEach(() => {
  delete process.env.CELERITY_MODULE_PATH;
});

describe("discoverModule", () => {
  it("discovers a module from explicit path (default export)", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const rootModule = await discoverModule(modulePath);

    expect(typeof rootModule).toBe("function");
    expect(rootModule.name).toBe("TestModule");
  });

  it("discovers a module from explicit path (named export)", async () => {
    const modulePath = resolve(fixturesDir, "named-export-module.ts");
    const rootModule = await discoverModule(modulePath);

    expect(typeof rootModule).toBe("function");
    expect(rootModule.name).toBe("AppModule");
  });

  it("discovers a module from CELERITY_MODULE_PATH env var", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");
    const rootModule = await discoverModule();

    expect(typeof rootModule).toBe("function");
    expect(rootModule.name).toBe("TestModule");
  });

  it("prefers explicit path over env var", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "named-export-module.ts");
    const explicitPath = resolve(fixturesDir, "test-module.ts");
    const rootModule = await discoverModule(explicitPath);

    expect(rootModule.name).toBe("TestModule");
  });

  it("throws when no module path is provided and env var is not set", async () => {
    await expect(discoverModule()).rejects.toThrow("Cannot discover module");
  });

  it("throws when the module file does not exist", async () => {
    await expect(discoverModule("/nonexistent/module.ts")).rejects.toThrow();
  });

  it("throws when the module has no class export", async () => {
    const modulePath = resolve(fixturesDir, "no-module.ts");
    await expect(discoverModule(modulePath)).rejects.toThrow("No module class found");
  });
});

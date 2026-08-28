import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  captureHandlerScope,
  getLinksOfType,
  HANDLER_SCOPE_FILENAME,
  RESOURCE_LINKS_FILENAME,
  type ResourceLinks,
} from "../src/resource-links";

// One bundle serves every function, so the resource links file describes the
// whole application rather than any one handler. The scope file is what says
// which of those resources a given handler actually uses; without it, a handler
// needing nothing but its own config would initialise every resource type
// present anywhere in the app and fail at cold start resolving a namespace it
// had no reason to look at.
describe("handler scope", () => {
  let tmpDir: string;

  const links: ResourceLinks = new Map([
    ["appCache", { type: "cache", configKey: "appCache" }],
    ["appConfig", { type: "config", configKey: "appConfig" }],
    ["usersDatastore", { type: "datastore", configKey: "users" }],
  ]);

  const writeScope = (scope: Record<string, string[]>) => {
    // Located next to the links file, which is what the SDK resolves from.
    writeFileSync(join(tmpDir, RESOURCE_LINKS_FILENAME), "{}", "utf8");
    writeFileSync(join(tmpDir, HANDLER_SCOPE_FILENAME), JSON.stringify(scope), "utf8");
    process.env.CELERITY_RESOURCE_LINKS_PATH = join(tmpDir, RESOURCE_LINKS_FILENAME);
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "celerity-handler-scope-"));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS_PATH;
    delete process.env.CELERITY_HANDLER_ID;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("narrows links to the resources this handler uses", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.StatsController.check";
    writeScope({ "app-module.StatsController.check": ["appCache"] });

    expect([...getLinksOfType(links, "cache").keys()]).toEqual(["appCache"]);
    expect([...getLinksOfType(links, "datastore").keys()]).toEqual([]);
  });

  it("does not load resources that a handler does not use", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.HealthController.check";
    writeScope({ "app-module.HealthController.check": ["appConfig"] });

    expect(getLinksOfType(links, "cache").size).toBe(0);
    expect([...getLinksOfType(links, "config").keys()]).toEqual(["appConfig"]);
  });

  it("gives a handler with an empty scope nothing", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.AdminGuard.check";
    writeScope({ "app-module.AdminGuard.check": [] });

    expect(getLinksOfType(links, "cache").size).toBe(0);
    expect(getLinksOfType(links, "config").size).toBe(0);
    expect(captureHandlerScope()).toEqual(new Set());
  });

  it("falls back to every resource when the file is absent", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.StatsController.check";
    writeFileSync(join(tmpDir, RESOURCE_LINKS_FILENAME), "{}", "utf8");
    process.env.CELERITY_RESOURCE_LINKS_PATH = join(tmpDir, RESOURCE_LINKS_FILENAME);

    expect(captureHandlerScope()).toBeNull();
    expect([...getLinksOfType(links, "cache").keys()]).toEqual(["appCache"]);
  });

  it("falls back when this handler has no entry", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.SomeNewController.check";
    writeScope({ "app-module.StatsController.check": ["appCache"] });

    expect(captureHandlerScope()).toBeNull();
    expect([...getLinksOfType(links, "cache").keys()]).toEqual(["appCache"]);
  });

  // A runtime that does not identify the handler cannot be narrowed safely.
  it("falls back when no handler id is set", () => {
    writeScope({ "app-module.StatsController.check": ["appCache"] });

    expect(captureHandlerScope()).toBeNull();
    expect([...getLinksOfType(links, "cache").keys()]).toEqual(["appCache"]);
  });

  it("falls back on a malformed scope file", () => {
    process.env.CELERITY_HANDLER_ID = "app-module.StatsController.check";
    writeFileSync(join(tmpDir, RESOURCE_LINKS_FILENAME), "{}", "utf8");
    writeFileSync(join(tmpDir, HANDLER_SCOPE_FILENAME), "not json", "utf8");
    process.env.CELERITY_RESOURCE_LINKS_PATH = join(tmpDir, RESOURCE_LINKS_FILENAME);

    expect(captureHandlerScope()).toBeNull();
    expect([...getLinksOfType(links, "cache").keys()]).toEqual(["appCache"]);
  });
});

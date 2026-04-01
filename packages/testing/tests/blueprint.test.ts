import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadBlueprintResources, tokenTypeToBlueprintType } from "../src/blueprint";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadBlueprintResources", () => {
  it("should parse blueprint YAML and extract resources", () => {
    const yaml = `
resources:
  usersDatastore:
    type: celerity/datastore
    spec:
      name: users
  eventsTopic:
    type: celerity/topic
    spec:
      name: events
`;
    mockReadFileSync.mockReturnValue(yaml);

    const resources = loadBlueprintResources("/path/to/blueprint.yaml");

    expect(resources.size).toBe(2);

    const users = resources.get("usersDatastore");
    expect(users).toEqual({
      resourceId: "usersDatastore",
      type: "celerity/datastore",
      physicalName: "users",
    });

    const events = resources.get("eventsTopic");
    expect(events).toEqual({
      resourceId: "eventsTopic",
      type: "celerity/topic",
      physicalName: "events",
    });
  });

  it("should fallback to resourceId when spec.name is missing", () => {
    const yaml = `
resources:
  ordersQueue:
    type: celerity/queue
`;
    mockReadFileSync.mockReturnValue(yaml);

    const resources = loadBlueprintResources("/path/to/blueprint.yaml");
    const queue = resources.get("ordersQueue");
    expect(queue?.physicalName).toBe("ordersQueue");
  });

  it("should skip resources without a type field", () => {
    const yaml = `
resources:
  valid:
    type: celerity/datastore
    spec:
      name: valid-table
  invalid:
    spec:
      name: no-type
`;
    mockReadFileSync.mockReturnValue(yaml);

    const resources = loadBlueprintResources("/path/to/blueprint.yaml");
    expect(resources.size).toBe(1);
    expect(resources.has("valid")).toBe(true);
    expect(resources.has("invalid")).toBe(false);
  });

  it("should return empty map when blueprint has no resources", () => {
    mockReadFileSync.mockReturnValue("version: 2025-01-01\n");

    const resources = loadBlueprintResources("/path/to/blueprint.yaml");
    expect(resources.size).toBe(0);
  });

  it("should return empty map when resources is not an object", () => {
    mockReadFileSync.mockReturnValue("resources: null\n");

    const resources = loadBlueprintResources("/path/to/blueprint.yaml");
    expect(resources.size).toBe(0);
  });

  it("should auto-detect blueprint path from cwd", () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith("app.blueprint.yaml");
    });
    mockReadFileSync.mockReturnValue("resources:\n  ds:\n    type: celerity/datastore\n");

    const resources = loadBlueprintResources();
    expect(resources.size).toBe(1);
  });

  it("should try .yml extension as second candidate", () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith("app.blueprint.yml");
    });
    mockReadFileSync.mockReturnValue("resources:\n  ds:\n    type: celerity/datastore\n");

    const resources = loadBlueprintResources();
    expect(resources.size).toBe(1);
  });

  it("should try .jsonc extension as third candidate", () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith("app.blueprint.jsonc");
    });
    mockReadFileSync.mockReturnValue(
      '{\n// resource definitions\n"resources":{"ds":{"type":"celerity/datastore"}}}\n',
    );

    const resources = loadBlueprintResources();
    expect(resources.size).toBe(1);
  });

  it("should try .json extension as fourth candidate", () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith("app.blueprint.json");
    });
    mockReadFileSync.mockReturnValue('{"resources":{"ds":{"type":"celerity/datastore"}}}');

    const resources = loadBlueprintResources();
    expect(resources.size).toBe(1);
  });

  it("should parse JSONC blueprint with comments and trailing commas", () => {
    const jsonc = `{
      // The resources for the application
      "resources": {
        "ordersDatastore": {
          "type": "celerity/datastore",
          "spec": {
            /* Physical table name */
            "name": "orders",
          },
        },
      },
    }`;
    mockReadFileSync.mockReturnValue(jsonc);

    const resources = loadBlueprintResources("/path/to/blueprint.jsonc");

    expect(resources.size).toBe(1);
    expect(resources.get("ordersDatastore")).toEqual({
      resourceId: "ordersDatastore",
      type: "celerity/datastore",
      physicalName: "orders",
    });
  });

  it("should return empty map when no blueprint file is found", () => {
    mockExistsSync.mockReturnValue(false);

    const resources = loadBlueprintResources();
    expect(resources.size).toBe(0);
  });
});

describe("tokenTypeToBlueprintType", () => {
  it("should prefix token type with 'celerity/'", () => {
    expect(tokenTypeToBlueprintType("datastore")).toBe("celerity/datastore");
    expect(tokenTypeToBlueprintType("topic")).toBe("celerity/topic");
    expect(tokenTypeToBlueprintType("queue")).toBe("celerity/queue");
    expect(tokenTypeToBlueprintType("cache")).toBe("celerity/cache");
    expect(tokenTypeToBlueprintType("bucket")).toBe("celerity/bucket");
  });
});

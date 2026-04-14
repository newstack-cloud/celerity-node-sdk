import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@celerity-sdk/config", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    captureResourceLinks: vi.fn(),
    getResourceTypes: vi.fn(),
  };
});

import { createDefaultSystemLayers } from "../../src/layers/system";
import { captureResourceLinks, getResourceTypes } from "@celerity-sdk/config";

const mockedCaptureResourceLinks = vi.mocked(captureResourceLinks);
const mockedGetResourceTypes = vi.mocked(getResourceTypes);

describe("createDefaultSystemLayers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always includes ConfigLayer", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetResourceTypes.mockReturnValue(new Set());

    const layers = await createDefaultSystemLayers();

    const classNames = layers.map((l) => l.constructor.name);
    expect(classNames).toContain("ConfigLayer");
  });

  it("does not include resource layers when the resource links file is empty", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetResourceTypes.mockReturnValue(new Set());

    const layers = await createDefaultSystemLayers();

    const classNames = layers.map((l) => l.constructor.name);
    expect(classNames).not.toContain("ObjectStorageLayer");
    expect(classNames).not.toContain("QueueLayer");
    expect(classNames).not.toContain("CacheLayer");
  });

  it("silently skips unknown resource types", async () => {
    mockedCaptureResourceLinks.mockReturnValue(
      new Map([["custom", { type: "custom-thing", configKey: "custom" }]]),
    );
    mockedGetResourceTypes.mockReturnValue(new Set(["custom-thing"]));

    const layers = await createDefaultSystemLayers();

    // Only telemetry (if installed) + config — no crash
    const classNames = layers.map((l) => l.constructor.name);
    expect(classNames).toContain("ConfigLayer");
  });

  it("silently skips resource packages that are not installed", async () => {
    // "queue" is in RESOURCE_LAYER_MAP but @celerity-sdk/queue is not installed
    mockedCaptureResourceLinks.mockReturnValue(
      new Map([["orderQueue", { type: "queue", configKey: "orderQueue" }]]),
    );
    mockedGetResourceTypes.mockReturnValue(new Set(["queue"]));

    const layers = await createDefaultSystemLayers();

    const classNames = layers.map((l) => l.constructor.name);
    expect(classNames).toContain("ConfigLayer");
    expect(classNames).not.toContain("QueueLayer");
  });
});

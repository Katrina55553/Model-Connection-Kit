import { describe, expect, it } from "vitest";
import { filterModelsByCapabilities } from "./filter-models";
import type { ModelSummary } from "./types";

const models: ModelSummary[] = [
  {
    id: "text",
    providerId: "demo",
    name: "Text",
    input: ["text"],
    reasoning: false,
    contextWindow: 8_192,
    maxTokens: 2_048,
  },
  {
    id: "vision",
    providerId: "demo",
    name: "Vision",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
];

describe("filterModelsByCapabilities", () => {
  it("keeps all models when no capability is required", () => {
    expect(filterModelsByCapabilities(models)).toEqual(models);
  });

  it("keeps only models with every required capability", () => {
    expect(filterModelsByCapabilities(models, ["text", "image"]).map((model) => model.id)).toEqual([
      "vision",
    ]);
  });

  it("filters by one required capability", () => {
    expect(filterModelsByCapabilities(models, ["image"]).map((model) => model.id)).toEqual([
      "vision",
    ]);
  });

  it("returns an empty list for an empty catalog", () => {
    expect(filterModelsByCapabilities([], ["text"])).toEqual([]);
  });
});

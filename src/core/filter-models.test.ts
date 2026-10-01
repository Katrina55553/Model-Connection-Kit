import { describe, expect, it } from "vitest";
import { filterModelsByCapabilities } from "./filter-models";
import type { ModelSummary } from "./types";

const models: ModelSummary[] = [
  { id: "text", providerId: "demo", name: "Text", input: ["text"] },
  { id: "vision", providerId: "demo", name: "Vision", input: ["text", "image"] },
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
});

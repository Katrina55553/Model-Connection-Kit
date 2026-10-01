import { describe, expect, it } from "vitest";
import { AdapterError } from "./adapter-error";
import { normalizeModels, normalizeProviders } from "./normalize-catalog";

describe("normalizeProviders", () => {
  it("trims fields, fills a blank name, and keeps the first duplicate", () => {
    expect(
      normalizeProviders([
        {
          id: " openai ",
          name: " ",
          description: "  Primary provider  ",
          auth: { oauth: { label: " Subscription " }, ambient: false },
        },
        { id: "openai", name: "Duplicate", auth: {} },
      ]),
    ).toEqual([
      {
        id: "openai",
        name: "openai",
        description: "Primary provider",
        auth: { oauth: { label: "Subscription", isSubscription: false } },
      },
    ]);
  });

  it("rejects a blank provider id with a catalog error", () => {
    expect(() => normalizeProviders([{ id: " ", name: "Broken", auth: {} }])).toThrow(
      expect.objectContaining<Partial<AdapterError>>({ category: "catalog" }),
    );
  });
});

describe("normalizeModels", () => {
  it("normalizes text, de-duplicates capabilities and scoped model ids", () => {
    expect(
      normalizeModels([
        {
          id: " vision ",
          providerId: " demo ",
          name: " ",
          input: ["text", "image", "image"],
          reasoning: true,
          contextWindow: 128_000,
          maxTokens: 8_192,
        },
        {
          id: "vision",
          providerId: "demo",
          name: "Duplicate",
          input: ["text"],
          reasoning: false,
          contextWindow: 1,
          maxTokens: 1,
        },
        {
          id: "vision",
          providerId: "other",
          name: "Same model id, other provider",
          input: ["text"],
          reasoning: false,
          contextWindow: 32_000,
          maxTokens: 4_096,
        },
      ]),
    ).toHaveLength(2);
  });
});

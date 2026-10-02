import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, validateCustomEndpoint, validateModelId, validateModelMetadata } from "./validate-custom-endpoint";
import type { ModelMetadata } from "./types";

const metadata: ModelMetadata = { input: ["text"], reasoning: false, contextWindow: 8192, maxTokens: 2048 };

describe("custom endpoint validation", () => {
  it("normalizes whitespace and host without rewriting the API path", () => {
    expect(normalizeBaseUrl("  HTTPS://API.EXAMPLE/proxy/%2Fv1/  ")).toBe("https://api.example/proxy/%2Fv1/");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234/");
  });
  it.each(["", "hello", "file:///tmp/model", "ftp://api.example/v1", "https://user:secret@api.example/v1", "https://api.example/v1?api_key=secret", "https://api.example/v1#secret", "https://api.example/a b", "https://api.example\\v1"])("rejects unsafe or invalid URL %s", (value) => {
    expect(() => normalizeBaseUrl(value)).toThrow();
  });
  it("accepts namespaced model IDs and trims boundary whitespace", () => {
    expect(validateModelId("  organization/model:latest  ")).toBe("organization/model:latest");
  });
  it.each(["", "  ", "a b", "a\nb", "x".repeat(201)])("rejects invalid model ID %s", (value) => expect(() => validateModelId(value)).toThrow());
  it.each([
    { contextWindow: 0 }, { contextWindow: Infinity }, { contextWindow: 3.1 }, { maxTokens: -1 },
    { maxTokens: 8193 }, { maxTokens: NaN }, { input: [] }, { input: ["audio"] },
    { cost: { input: -1, output: 0 } }, { cost: { input: 0, output: Infinity } },
    { cost: { input: 0 } }, { cost: { input: 0, output: 0, cacheRead: -1 } },
  ])("rejects invalid metadata %j", (patch) => {
    expect(() => validateModelMetadata({ ...metadata, ...patch } as ModelMetadata)).toThrow();
  });
  it("preserves unknown prices and distinguishes explicit zero prices", () => {
    expect(validateModelMetadata(metadata)).not.toHaveProperty("cost");
    expect(validateModelMetadata({ ...metadata, cost: { input: 0, output: 0 } })).toHaveProperty("cost.input", 0);
  });
  it("clones metadata and deduplicates input capabilities", () => {
    const original = { ...metadata, input: ["text", "image", "text"] as const };
    const validated = validateModelMetadata(original);
    expect(validated.input).toEqual(["text", "image"]);
    expect(validated.input).not.toBe(original.input);
  });
  it("rejects unsupported protocols and normalizes display names", () => {
    expect(validateCustomEndpoint({ api: "openai-completions", baseUrl: "https://api.example/v1", displayName: "  Example  ", model: metadata }).displayName).toBe("Example");
    expect(() => validateCustomEndpoint({ api: "unknown", baseUrl: "https://api.example/v1", model: metadata } as never)).toThrow();
  });
});

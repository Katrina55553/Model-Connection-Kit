import { describe, expect, it, vi } from "vitest";
import { AdapterError } from "../core/adapter-error";
import type { ModelSelection } from "../core/types";
import { createMockModelSettingsAdapter } from "./mock";

const selection: ModelSelection = {
  connectionType: "builtin",
  authMethod: "oauth",
  providerId: "openai-codex",
  modelId: "codex-mini",
};

describe("createMockModelSettingsAdapter", () => {
  it("provides text and vision catalogs with capability filtering", async () => {
    const adapter = createMockModelSettingsAdapter();
    const providers = await adapter.listProviders();
    const vision = await adapter.listModels({
      providerId: "openai",
      requiredCapabilities: ["text", "image"],
    });

    expect(providers.map((provider) => provider.id)).toEqual([
      "openai-codex",
      "openai",
      "google",
    ]);
    expect(vision.map((model) => model.id)).toEqual(["gpt-vision"]);
  });

  it("distinguishes configured authentication from a failed probe", async () => {
    const adapter = createMockModelSettingsAdapter({ failProbeFor: ["openai-codex"] });
    await adapter.connect({
      connectionType: "builtin",
      authMethod: "oauth",
      providerId: "openai-codex",
    });

    await expect(adapter.getAuthStatus("openai-codex")).resolves.toMatchObject({
      state: "configured",
    });
    await expect(adapter.testConnection(selection)).resolves.toMatchObject({
      state: "unreachable",
      mayBeBillable: true,
    });
  });

  it("reports unconfigured authentication independently", async () => {
    const adapter = createMockModelSettingsAdapter();
    await expect(adapter.getAuthStatus("openai")).resolves.toEqual({ state: "unconfigured" });
  });

  it("simulates auth events and fails clearly when a required prompt handler is absent", async () => {
    const adapter = createMockModelSettingsAdapter({ requireOAuthPrompt: true });
    const onEvent = vi.fn();
    const operation = adapter.connect(
      { connectionType: "builtin", authMethod: "oauth", providerId: "openai-codex" },
      { onEvent },
    );

    await expect(operation).rejects.toEqual(
      expect.objectContaining<Partial<AdapterError>>({ category: "capability" }),
    );
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "auth-url" }));
  });

  it("cancels delayed operations", async () => {
    const adapter = createMockModelSettingsAdapter({ delayMs: 100 });
    const controller = new AbortController();
    const operation = adapter.listProviders({ signal: controller.signal });
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });
});

import {
  InMemoryCredentialStore,
  createModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { ModelSelection } from "../../core/types";
import {
  createOpenAICompatibleProvider,
  createPiAiAdapter,
  type PiAiModels,
} from "./index";

const customSelection: Extract<ModelSelection, { connectionType: "custom" }> = {
  connectionType: "custom",
  authMethod: "api-key",
  providerId: "openai",
  modelId: "test-model",
  custom: {
    baseUrl: "http://127.0.0.1:4010/v1",
    api: "openai-completions",
    displayName: "Local OpenAI",
    model: {
      input: ["text", "image"],
      reasoning: true,
      contextWindow: 32_000,
      maxTokens: 4_096,
    },
  },
};

describe("createOpenAICompatibleProvider", () => {
  it("builds a static openai-completions provider from non-secret metadata", () => {
    const provider = createOpenAICompatibleProvider(customSelection);
    expect(provider).toMatchObject({
      id: "openai",
      name: "Local OpenAI",
      baseUrl: "http://127.0.0.1:4010/v1",
    });
    expect(provider.getModels()[0]).toMatchObject({
      id: "test-model",
      api: "openai-completions",
      provider: "openai",
      input: ["text", "image"],
      reasoning: true,
      contextWindow: 32_000,
      maxTokens: 4_096,
      compat: {
        supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false,
        supportsUsageInStreaming: false, maxTokensField: "max_tokens",
      },
    });
  });
});

describe("createPiAiAdapter", () => {
  it("uses the injected store as the fallback write path for an allowed API-key provider", async () => {
    const credentials = new InMemoryCredentialStore();
    const models = createModels({ credentials });
    models.setProvider(createOpenAICompatibleProvider(customSelection));
    const adapter = createPiAiAdapter({ models, credentials });

    const result = await adapter.connect({
      connectionType: "builtin",
      authMethod: "api-key",
      providerId: "openai",
      apiKey: "test-secret",
    });

    await expect(credentials.read("openai")).resolves.toEqual({
      type: "api_key",
      key: "test-secret",
    });
    expect(result.auth).toMatchObject({ state: "configured", method: "api-key" });
    await expect(adapter.listModels({ providerId: "openai" })).resolves.toEqual([
      expect.objectContaining({ id: "test-model", providerId: "openai" }),
    ]);
  });

  it("does not present ambient-only providers as interactive API-key flows", async () => {
    const credentials = new InMemoryCredentialStore();
    const models = createModels({ credentials });
    const provider = createOpenAICompatibleProvider({
      ...customSelection,
      providerId: "ambient-provider",
    });
    models.setProvider(provider);
    const adapter = createPiAiAdapter({ models, credentials });

    await expect(adapter.listProviders()).resolves.toEqual([
      expect.objectContaining({
        id: "ambient-provider",
        auth: expect.objectContaining({
          apiKey: expect.objectContaining({ interactive: false }),
          ambient: true,
        }),
      }),
    ]);
    await expect(
      adapter.connect({
        connectionType: "builtin",
        authMethod: "api-key",
        providerId: "ambient-provider",
        apiKey: "must-not-be-written",
      }),
    ).rejects.toMatchObject({ category: "capability" });
    await expect(credentials.read("ambient-provider")).resolves.toBeUndefined();
  });

  it("registers a keyless custom provider and reports it configured", async () => {
    const credentials = new InMemoryCredentialStore();
    const models = createModels({ credentials });
    const adapter = createPiAiAdapter({ models, credentials });
    const request = {
      ...customSelection,
      providerId: "ollama",
      authMethod: "none" as const,
    };

    const result = await adapter.connect(request);
    expect(models.getProvider("ollama")).toBeDefined();
    expect(result.auth).toMatchObject({ state: "configured" });
    await expect(credentials.read("ollama")).resolves.toBeUndefined();
  });

  it("maps OAuth subscription capability without exposing runtime credentials", async () => {
    const oauthProvider = {
      id: "openai-codex",
      name: "OpenAI Codex",
      auth: {
        oauth: {
          name: "OpenAI Codex OAuth",
          loginLabel: "使用 ChatGPT 登录",
          isSubscription: true,
          login: vi.fn(),
        },
      },
    } as unknown as Provider;
    const fakeModels = {
      getProviders: () => [oauthProvider],
    } as unknown as PiAiModels;
    const adapter = createPiAiAdapter({
      models: fakeModels,
      credentials: new InMemoryCredentialStore(),
    });

    await expect(adapter.listProviders()).resolves.toEqual([
      {
        id: "openai-codex",
        name: "OpenAI Codex",
        auth: {
          oauth: { label: "使用 ChatGPT 登录", isSubscription: true },
        },
      },
    ]);
  });

  it("performs a cancellable one-token real probe through Models.completeSimple", async () => {
    const provider = createOpenAICompatibleProvider(customSelection);
    const model = provider.getModels()[0]!;
    const completeSimple = vi.fn().mockResolvedValue({ stopReason: "stop" });
    const fakeModels = {
      getProviders: () => [provider],
      getProvider: (id: string) => (id === provider.id ? provider : undefined),
      getModels: () => provider.getModels(),
      getModel: () => model,
      checkAuth: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      completeSimple,
      setProvider: vi.fn(),
    } as unknown as PiAiModels;
    const adapter = createPiAiAdapter({
      models: fakeModels,
      credentials: new InMemoryCredentialStore(),
    });

    await expect(adapter.testConnection(customSelection)).resolves.toMatchObject({
      state: "reachable",
      mayBeBillable: true,
    });
    expect(completeSimple).toHaveBeenCalledWith(
      model,
      {
        messages: [
          expect.objectContaining({ role: "user", content: "Respond with OK." }),
        ],
      },
      expect.objectContaining({ maxTokens: 1, timeoutMs: 15_000 }),
    );
  });
});

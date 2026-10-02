import { createModels, createProvider, envApiKeyAuth, InMemoryCredentialStore, ModelsError, type AuthEvent as PiAuthEvent, type AuthPrompt as PiAuthPrompt, type CreateProviderOptions, type OAuthCredential } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthEvent, AuthPrompt, ModelSelection } from "../../core/types";
import { createOpenAICompatibleProvider, createPiAiAdapter, type PiAiModels } from "./index";
import { createInitialPiAiProviders, initialPiAiProviderIds } from "./initial-providers";

const selection: Extract<ModelSelection, { connectionType: "custom" }> = {
  connectionType: "custom", authMethod: "none", providerId: "sample", modelId: "text",
  custom: { baseUrl: "http://localhost:1234/v1", api: "openai-completions", model: { input: ["text"], reasoning: false, contextWindow: 8192, maxTokens: 2048 } },
};
const baseline = createOpenAICompatibleProvider(selection).getModels()[0]!;
const noEnvironment = { env: async () => undefined, fileExists: async () => false };

function provider(id = "sample", overrides: Partial<CreateProviderOptions<"openai-completions">> = {}) {
  return createProvider({ id, models: [{ ...baseline, provider: id }], auth: { apiKey: envApiKeyAuth("Test key", ["TEST_KEY"]) }, api: openAICompletionsApi(), ...overrides });
}

function runtime(options: { provider?: ReturnType<typeof provider>; ambient?: string } = {}) {
  const credentials = new InMemoryCredentialStore();
  const models = createModels({ credentials, authContext: { ...noEnvironment, env: async (name) => name === "TEST_KEY" ? options.ambient : undefined } });
  models.setProvider(options.provider ?? provider());
  return { credentials, models, adapter: createPiAiAdapter({ models, credentials }) };
}

const oauthCredential: OAuthCredential = { type: "oauth", access: "oauth-access-secret", refresh: "oauth-refresh-secret", expires: Date.now() + 3_600_000 };

afterEach(() => vi.useRealTimers());

describe("initial Pi AI providers", () => {
  it("loads exactly the five baseline providers without network or credentials", async () => {
    const providers = await createInitialPiAiProviders();
    expect(providers.map((entry) => entry.id)).toEqual(initialPiAiProviderIds);
    const credentials = new InMemoryCredentialStore();
    const models = createModels({ credentials, authContext: noEnvironment });
    for (const entry of providers) models.setProvider(entry);
    const adapter = createPiAiAdapter({ models, credentials });
    const catalog = await adapter.listProviders();
    expect(catalog.find((entry) => entry.id === "openai-codex")?.auth.oauth?.isSubscription).toBe(true);
    for (const id of initialPiAiProviderIds) {
      expect(await adapter.listModels({ providerId: id })).not.toHaveLength(0);
      expect(await adapter.getAuthStatus(id)).toEqual({ state: "unconfigured" });
    }
    const login = vi.spyOn(models, "login");
    for (const id of initialPiAiProviderIds.filter((entry) => entry !== "openai-codex")) {
      const result = await adapter.connect({ connectionType: "builtin", authMethod: "api-key", providerId: id, apiKey: `test-key-${id}` });
      expect(result.auth).toMatchObject({ state: "configured", method: "api-key", source: "stored credential" });
      expect(await credentials.read(id)).toEqual({ type: "api_key", key: `test-key-${id}` });
      expect(catalog.find((entry) => entry.id === id)?.auth.apiKey?.interactive).toBe(true);
    }
    expect(login).toHaveBeenCalledTimes(4);
  });
});

describe("Pi AI catalogs", () => {
  it("reads static catalogs without refreshing or resolving request credentials", async () => {
    const { models, adapter } = runtime();
    const refresh = vi.spyOn(models, "refresh");
    const auth = vi.spyOn(models, "getAuth");
    expect(await adapter.listModels({ providerId: "sample", refresh: true })).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it("refreshes the selected dynamic provider and applies all input requirements", async () => {
    const fetchModels = vi.fn(async () => [{ ...baseline, id: "vision", input: ["text", "image"] as ("text" | "image")[] }]);
    const { models, adapter } = runtime({ provider: provider("sample", { fetchModels }), ambient: "ambient-key" });
    const refresh = vi.spyOn(models, "refresh");
    const controller = new AbortController();
    const catalog = await adapter.listModels({ providerId: "sample", requiredCapabilities: ["text", "image"], refresh: true, signal: controller.signal });
    expect(catalog.map((entry) => entry.id)).toEqual(["vision"]);
    expect(fetchModels).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith({ providers: ["sample"], force: true, allowNetwork: true, signal: controller.signal });
  });

  it("reports only the selected provider's refresh error and keeps other catalogs readable", async () => {
    const broken = provider("broken", { fetchModels: async () => { throw new Error("Authorization: Bearer raw-secret"); } });
    const { models, adapter } = runtime({ provider: broken, ambient: "ambient-key" });
    models.setProvider(provider("healthy"));
    await expect(adapter.listModels({ providerId: "broken" })).rejects.toMatchObject({ category: "catalog" });
    const result = await adapter.refresh();
    const error = result.errors.get("broken");
    expect(error?.message).not.toContain("raw-secret");
    expect(error?.cause).toBeUndefined();
    expect(await adapter.listModels({ providerId: "healthy" })).toHaveLength(1);
  });

  it("does not apply a sibling error to a healthy dynamic catalog", async () => {
    const { models, credentials } = runtime({ provider: provider("sample", { fetchModels: async () => [] }), ambient: "ambient-key" });
    vi.spyOn(models, "refresh").mockResolvedValue({ aborted: false, errors: new Map([["sibling", new Error("private-secret")]]) });
    const adapter = createPiAiAdapter({ models, credentials });
    expect(await adapter.listModels({ providerId: "sample" })).toHaveLength(1);
  });

  it("cancels a dynamic refresh and prevents late publication", async () => {
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let finish!: (models: typeof baseline[]) => void;
    const fetchModels = vi.fn(() => { started(); return new Promise<typeof baseline[]>((resolve) => { finish = resolve; }); });
    const { models, adapter } = runtime({ provider: provider("sample", { fetchModels }), ambient: "ambient-key" });
    const controller = new AbortController();
    const pending = adapter.listModels({ providerId: "sample", signal: controller.signal });
    const canceled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await entered;
    controller.abort();
    await canceled;
    finish([{ ...baseline, id: "late-model" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(models.getModels("sample").map((model) => model.id)).toEqual(["text"]);
  });

  it("exposes an offline refresh and preserves unknown custom prices", async () => {
    const { models, adapter } = runtime();
    const refresh = vi.spyOn(models, "refresh");
    await adapter.refresh({ providerIds: ["sample"], allowNetwork: false });
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ allowNetwork: false }));
    await adapter.connect({ ...selection, authMethod: "none" });
    const catalog = await adapter.listModels({ providerId: "sample" });
    expect(catalog[0]).not.toHaveProperty("cost");
    expect(await adapter.getAuthStatus("sample")).toMatchObject({ method: "none" });
  });
});

describe("Pi AI authentication", () => {
  it("recomputes logout status from ambient credentials without exposing their value", async () => {
    const { models, credentials, adapter } = runtime({ ambient: "ambient-secret" });
    await adapter.connect({ connectionType: "builtin", authMethod: "api-key", providerId: "sample", apiKey: "stored-secret" });
    expect(await adapter.getAuthStatus("sample")).toMatchObject({ method: "api-key", source: "stored credential" });
    expect(await adapter.disconnect("sample")).toMatchObject({ state: "configured", method: "ambient", source: "TEST_KEY" });
    expect(await credentials.read("sample")).toBeUndefined();
    expect(await adapter.resolveAuthStatus("sample")).toMatchObject({ state: "configured", method: "ambient", source: "TEST_KEY" });
    const getAuth = vi.spyOn(models, "getAuth");
    await adapter.getAuthStatus("sample");
    expect(getAuth).not.toHaveBeenCalled();
    expect(JSON.stringify(await adapter.resolveAuthStatus("sample"))).not.toContain("ambient-secret");
  });

  it("distinguishes OAuth configuration from failed token refresh and preserves stored credentials", async () => {
    const refresh = vi.fn(async () => { throw new Error("refresh failed oauth-refresh-secret"); });
    const { credentials, adapter } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "Subscription", isSubscription: true, login: async () => oauthCredential,
      refresh, toAuth: async (credential) => ({ apiKey: credential.access }),
    } } }) });
    const expired = { ...oauthCredential, expires: 0 };
    await credentials.modify("sample", async () => expired);
    expect(await adapter.getAuthStatus("sample")).toMatchObject({ state: "configured", method: "oauth" });
    expect(refresh).not.toHaveBeenCalled();
    const result = await adapter.resolveAuthStatus("sample");
    expect(result).toMatchObject({ state: "error", message: expect.stringContaining("OAuth") });
    expect(JSON.stringify(result)).not.toContain("oauth-refresh-secret");
    expect(await credentials.read("sample")).toEqual(expired);
  });

  it("refreshes OAuth internally and returns no tokens or request headers", async () => {
    const refresh = vi.fn(async () => oauthCredential);
    const { credentials, adapter } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "OAuth", login: async () => oauthCredential, refresh,
      toAuth: async (credential) => ({ apiKey: credential.access, headers: { Authorization: `Bearer ${credential.access}` } }),
    } } }) });
    await credentials.modify("sample", async () => ({ ...oauthCredential, expires: 0 }));
    const status = await adapter.resolveAuthStatus("sample");
    expect(status).toMatchObject({ state: "configured", method: "oauth" });
    expect(status).not.toHaveProperty("auth");
    expect(JSON.stringify(status)).not.toContain("oauth-access-secret");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("maps all prompts and events while keeping secret answers out of progress", async () => {
    const events: AuthEvent[] = [];
    const prompts: AuthPrompt[] = [];
    const promptController = new AbortController();
    const loginOptions = { getDeviceId: () => "host-installation" };
    const login = vi.fn(async (interaction, options) => {
      expect(options).toBe(loginOptions);
      for (const event of [
        { type: "auth_url", url: "https://example.test/authorize", instructions: "浏览器授权" },
        { type: "device_code", userCode: "ABC123", verificationUri: "https://example.test/device", expiresInSeconds: 300 },
        { type: "info", message: "准备授权" },
      ] satisfies PiAuthEvent[]) interaction.notify(event);
      for (const prompt of [
        { type: "text", message: "Account" },
        { type: "select", message: "Region", options: [{ id: "one", label: "One" }] },
        { type: "secret", message: "Secret", signal: promptController.signal },
        { type: "manual_code", message: "Code" },
      ] satisfies PiAuthPrompt[]) await interaction.prompt(prompt);
      interaction.notify({ type: "progress", message: "Finished entered-secret" });
      return oauthCredential;
    });
    const { models, credentials } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "OAuth", isSubscription: true, login, refresh: async () => oauthCredential, toAuth: async (credential) => ({ apiKey: credential.access }),
    } } }) });
    const adapter = createPiAiAdapter({ models, credentials, loginOptions });
    const result = await adapter.connect({ connectionType: "builtin", authMethod: "oauth", providerId: "sample" }, {
      onEvent: (event) => events.push(event), prompt: async (prompt) => { prompts.push(prompt); return prompt.type === "secret" ? "entered-secret" : "one"; },
    });
    expect(prompts.map((prompt) => prompt.type)).toEqual(["text", "select", "secret", "manual-code"]);
    expect(events.map((event) => event.type)).toEqual(["auth-url", "device-code", "info", "progress"]);
    expect(prompts[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(events)).not.toContain("entered-secret");
    expect(JSON.stringify(result)).not.toContain("oauth-access-secret");
  });

  it("fails clearly when a required prompt handler is missing", async () => {
    const { credentials, adapter } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "OAuth", login: async (interaction) => { await interaction.prompt({ type: "manual_code", message: "Code" }); return oauthCredential; },
      refresh: async () => oauthCredential, toAuth: async (credential) => ({ apiKey: credential.access }),
    } } }) });
    await expect(adapter.connect({ connectionType: "builtin", authMethod: "oauth", providerId: "sample" })).rejects.toMatchObject({ category: "capability", message: expect.stringContaining("prompt handler") });
    expect(await credentials.read("sample")).toBeUndefined();
  });

  it("cancels a prompt independently without writing OAuth credentials", async () => {
    const promptController = new AbortController();
    const { credentials, adapter } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "OAuth", login: async (interaction) => { await interaction.prompt({ type: "manual_code", message: "Code", signal: promptController.signal }); return oauthCredential; },
      refresh: async () => oauthCredential, toAuth: async (credential) => ({ apiKey: credential.access }),
    } } }) });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const pending = adapter.connect({ connectionType: "builtin", authMethod: "oauth", providerId: "sample" }, { prompt: () => { started(); return new Promise(() => {}); } });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await entered;
    promptController.abort();
    await assertion;
    expect(await credentials.read("sample")).toBeUndefined();
  });

  it("suppresses events after login completes", async () => {
    let notify!: (event: PiAuthEvent) => void;
    const events = vi.fn();
    const { adapter } = runtime({ provider: provider("sample", { auth: { oauth: {
      name: "OAuth", login: async (interaction) => { notify = interaction.notify; return oauthCredential; },
      refresh: async () => oauthCredential, toAuth: async (credential) => ({ apiKey: credential.access }),
    } } }) });
    await adapter.connect({ connectionType: "builtin", authMethod: "oauth", providerId: "sample" }, { onEvent: events });
    notify({ type: "progress", message: "late event" });
    expect(events).not.toHaveBeenCalled();
  });

  it("never invokes login for ambient-only authentication", async () => {
    const { models, adapter } = runtime({ provider: provider("sample", { auth: { apiKey: { name: "ADC", resolve: async () => ({ auth: {}, source: "ADC" }) } } }) });
    const login = vi.spyOn(models, "login");
    expect(await adapter.connect({ connectionType: "builtin", authMethod: "ambient", providerId: "sample" })).toMatchObject({ auth: { state: "configured", method: "ambient", source: "ADC" } });
    await expect(adapter.connect({ connectionType: "builtin", authMethod: "api-key", providerId: "sample", apiKey: "do-not-write" })).rejects.toMatchObject({ category: "capability" });
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects blank API keys and sanitizes store errors without raw causes", async () => {
    const { credentials, models, adapter } = runtime();
    await expect(adapter.connect({ connectionType: "builtin", authMethod: "api-key", providerId: "sample", apiKey: " " })).rejects.toMatchObject({ category: "auth" });
    const badStore = { read: credentials.read.bind(credentials), delete: credentials.delete.bind(credentials), list: vi.fn(async () => []), modify: vi.fn(async () => { throw new Error("store rejected raw-secret"); }) };
    const fallback = createPiAiAdapter({ models, credentials: badStore, apiKeyFallbackProviderIds: ["sample"] });
    models.setProvider(provider("sample", { auth: { apiKey: { name: "Standard key", resolve: async () => undefined } } }));
    const result = await fallback.connect({ connectionType: "builtin", authMethod: "api-key", providerId: "sample", apiKey: "raw-secret" }).catch((error: unknown) => error);
    expect(result).toMatchObject({ category: "auth" });
    expect(result).not.toHaveProperty("cause");
    expect(String(result)).not.toContain("raw-secret");
  });
});

describe("Pi AI probes", () => {
  function pendingProbe(probeTimeoutMs = 20) {
    const { models, credentials } = runtime({ ambient: "ambient-secret" });
    const completeSimple = vi.spyOn(models, "completeSimple").mockImplementation(() => new Promise(() => {}));
    const adapter = createPiAiAdapter({ models, credentials, probeTimeoutMs });
    const builtin: ModelSelection = { connectionType: "builtin", authMethod: "ambient", providerId: "sample", modelId: "text" };
    return { adapter, completeSimple, builtin };
  }

  it("times out even when the runtime ignores the abort signal", async () => {
    vi.useFakeTimers();
    const { adapter, completeSimple, builtin } = pendingProbe();
    const pending = adapter.testConnection(builtin);
    await vi.advanceTimersByTimeAsync(21);
    const result = await pending;
    expect(result).toMatchObject({ state: "unreachable", mayBeBillable: true, message: expect.stringContaining("超时") });
    expect(completeSimple.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    expect(completeSimple.mock.calls[0]?.[2]).toMatchObject({ maxTokens: 1, maxRetries: 0 });
  });

  it("rejects an already canceled probe before any model lookup or request", async () => {
    const { models, adapter } = runtime();
    const getModel = vi.spyOn(models, "getModel");
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.testConnection(selection, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(getModel).not.toHaveBeenCalled();
  });

  it("cancels without waiting for a non-cooperative runtime", async () => {
    const { adapter, completeSimple, builtin } = pendingProbe(5000);
    const controller = new AbortController();
    const pending = adapter.testConnection(builtin, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(completeSimple).toHaveBeenCalledOnce());
    controller.abort();
    await assertion;
  });

  it("does not dispatch or mark a missing credential as billable", async () => {
    const { models, adapter } = runtime();
    const completeSimple = vi.spyOn(models, "completeSimple");
    expect(await adapter.testConnection({ connectionType: "builtin", authMethod: "api-key", providerId: "sample", modelId: "text" })).toMatchObject({ state: "unreachable", mayBeBillable: false });
    expect(completeSimple).not.toHaveBeenCalled();
  });

  it("reports OAuth resolution failures without leaking token errors or dispatching a model request", async () => {
    const { models, credentials } = runtime();
    vi.spyOn(models, "getAuth").mockRejectedValue(new ModelsError("oauth", "refresh raw-oauth-token"));
    const completeSimple = vi.spyOn(models, "completeSimple");
    const adapter = createPiAiAdapter({ models, credentials });
    const status = await adapter.testConnection({ connectionType: "builtin", authMethod: "oauth", providerId: "sample", modelId: "text" });
    expect(status).toMatchObject({ state: "unreachable", mayBeBillable: false });
    expect(status.message).toContain("OAuth");
    expect(status.message).not.toContain("raw-oauth-token");
    expect(completeSimple).not.toHaveBeenCalled();
  });

  it("reports a failed real request independently from configured auth", async () => {
    const { models, adapter } = runtime({ ambient: "ambient-secret" });
    vi.spyOn(models, "completeSimple").mockResolvedValue({ stopReason: "error", errorMessage: "ambient-secret" } as Awaited<ReturnType<PiAiModels["completeSimple"]>>);
    expect(await adapter.getAuthStatus("sample")).toMatchObject({ state: "configured" });
    const status = await adapter.testConnection({ connectionType: "builtin", authMethod: "ambient", providerId: "sample", modelId: "text" });
    expect(status).toMatchObject({ state: "unreachable", mayBeBillable: true });
    expect(status.message).not.toContain("ambient-secret");
    expect(await adapter.getAuthStatus("sample")).toMatchObject({ state: "configured" });
  });
});

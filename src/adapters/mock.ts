import { AdapterError } from "../core/adapter-error";
import { filterModelsByCapabilities } from "../core/filter-models";
import type {
  AuthStatus,
  ConnectOptions,
  ConnectionRequest,
  ListModelsOptions,
  ListProvidersOptions,
  ModelSelection,
  ModelSettingsAdapter,
  ModelSummary,
  ProbeStatus,
  ProviderSummary,
} from "../core/types";

export interface MockAdapterOptions {
  delayMs?: number;
  failProbeFor?: readonly string[];
  requireOAuthPrompt?: boolean;
  initialAuth?: Readonly<Record<string, AuthStatus>>;
}

const providers: ProviderSummary[] = [
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    description: "订阅账号登录演示",
    auth: { oauth: { label: "使用 ChatGPT 订阅登录", isSubscription: true } },
  },
  {
    id: "openai",
    name: "OpenAI",
    auth: { apiKey: { label: "OpenAI API Key", interactive: true } },
  },
  {
    id: "google",
    name: "Google",
    auth: {
      apiKey: { label: "通过宿主环境配置", interactive: false },
      ambient: true,
    },
  },
];

const models: ModelSummary[] = [
  {
    id: "codex-mini",
    providerId: "openai-codex",
    name: "Codex Mini",
    input: ["text"],
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 32_000,
  },
  {
    id: "gpt-text",
    providerId: "openai",
    name: "GPT Text",
    input: ["text"],
    reasoning: false,
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: "gpt-vision",
    providerId: "openai",
    name: "GPT Vision",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: "gemini-vision",
    providerId: "google",
    name: "Gemini Vision",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  },
];

function abortError(): DOMException {
  return new DOMException("操作已取消", "AbortError");
}

async function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  if (delayMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export function createMockModelSettingsAdapter(
  options: MockAdapterOptions = {},
): ModelSettingsAdapter {
  const delayMs = options.delayMs ?? 0;
  const failingProviders = new Set(options.failProbeFor ?? []);
  const auth = new Map<string, AuthStatus>(Object.entries(options.initialAuth ?? {}));

  return {
    async listProviders(operation: ListProvidersOptions = {}) {
      await wait(delayMs, operation.signal);
      return providers.map((provider) => ({ ...provider, auth: { ...provider.auth } }));
    },

    async listModels(operation: ListModelsOptions) {
      await wait(delayMs, operation.signal);
      const catalog = models.filter((model) => model.providerId === operation.providerId);
      return filterModelsByCapabilities(catalog, operation.requiredCapabilities);
    },

    async getAuthStatus(providerId, signal) {
      await wait(delayMs, signal);
      return auth.get(providerId) ?? { state: "unconfigured" };
    },

    async connect(request: ConnectionRequest, connectOptions: ConnectOptions = {}) {
      await wait(delayMs, connectOptions.signal);

      if (request.authMethod === "api-key" && !request.apiKey.trim()) {
        throw new AdapterError("auth", "API Key 不能为空");
      }

      if (request.connectionType === "builtin" && request.authMethod === "oauth") {
        connectOptions.onEvent?.({ type: "info", message: "正在准备订阅登录" });
        connectOptions.onEvent?.({
          type: "auth-url",
          url: "https://example.test/authorize",
          instructions: "在浏览器中完成授权",
        });
        if (options.requireOAuthPrompt) {
          if (!connectOptions.prompt) {
            throw new AdapterError("capability", "此授权流程需要 prompt handler");
          }
          await connectOptions.prompt({
            type: "manual-code",
            message: "输入授权码",
            signal: connectOptions.signal,
          });
        }
        connectOptions.onEvent?.({ type: "progress", message: "授权完成" });
      }

      const status: AuthStatus = {
        state: "configured",
        method: request.authMethod,
        source: request.connectionType === "custom" ? "mock-custom" : "mock-store",
      };
      auth.set(request.providerId, status);
      return { providerId: request.providerId, auth: status };
    },

    async testConnection(selection: ModelSelection, operation = {}): Promise<ProbeStatus> {
      await wait(delayMs, operation.signal);
      const isConfigured =
        selection.connectionType === "custom" ||
        auth.get(selection.providerId)?.state === "configured";
      const reachable = isConfigured && !failingProviders.has(selection.providerId);
      return {
        state: reachable ? "reachable" : "unreachable",
        testedAt: Date.now(),
        message: reachable
          ? "最小模型请求成功"
          : isConfigured
            ? "认证已配置，但最小模型请求失败"
            : "认证尚未配置",
        mayBeBillable: true,
      };
    },

    async disconnect(providerId, signal) {
      await wait(delayMs, signal);
      const status: AuthStatus = { state: "unconfigured" };
      auth.set(providerId, status);
      return status;
    },
  };
}

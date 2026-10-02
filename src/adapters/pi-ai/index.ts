import type {
  AuthEvent as PiAuthEvent,
  AuthInteraction as PiAuthInteraction,
  AuthPrompt as PiAuthPrompt,
  CredentialStore,
  Models,
  MutableModels,
  Provider,
} from "@earendil-works/pi-ai";
import { AdapterError } from "../../core/adapter-error";
import { filterModelsByCapabilities } from "../../core/filter-models";
import type {
  AuthEvent,
  AuthPrompt,
  AuthStatus,
  ConnectOptions,
  ConnectionRequest,
  ModelSelection,
  ModelSettingsAdapter,
  ModelSummary,
  ProviderSummary,
} from "../../core/types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export { createOpenAICompatibleProvider } from "./openai-compatible";
export type { CustomModelSelection } from "./openai-compatible";

export type PiAiModels = Pick<
  Models,
  | "getProviders"
  | "getProvider"
  | "getModels"
  | "getModel"
  | "checkAuth"
  | "login"
  | "logout"
  | "completeSimple"
> &
  Partial<Pick<MutableModels, "setProvider">>;

export interface PiAiAdapterOptions {
  models: PiAiModels;
  /** Must be the same store that was passed to createModels(). */
  credentials: CredentialStore;
  probePrompt?: string;
  probeTimeoutMs?: number;
  /** Providers whose standard API key may be written directly when Pi AI has no login flow. */
  apiKeyFallbackProviderIds?: readonly string[];
}

function abortError(): DOMException {
  return new DOMException("操作已取消", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function mapProvider(provider: Provider, apiKeyFallbackProviders: ReadonlySet<string>): ProviderSummary {
  const apiKey = provider.auth.apiKey;
  const oauth = provider.auth.oauth;
  return {
    id: provider.id,
    name: provider.name,
    auth: {
      ...(oauth
        ? {
            oauth: {
              label: oauth.loginLabel ?? oauth.name,
              isSubscription: oauth.isSubscription ?? false,
            },
          }
        : {}),
      ...(apiKey
        ? {
            apiKey: {
              label: apiKey.name,
              interactive: Boolean(apiKey.login) || apiKeyFallbackProviders.has(provider.id),
            },
          }
        : {}),
      ...(apiKey && !apiKey.login && !apiKeyFallbackProviders.has(provider.id)
        ? { ambient: true }
        : {}),
    },
  };
}

function mapModel(model: ReturnType<Models["getModels"]>[number]): ModelSummary {
  return {
    id: model.id,
    providerId: model.provider,
    name: model.name,
    input: [...model.input],
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    cost: {
      input: model.cost.input,
      output: model.cost.output,
      cacheRead: model.cost.cacheRead,
      cacheWrite: model.cost.cacheWrite,
    },
  };
}

function mapPrompt(prompt: PiAuthPrompt): AuthPrompt {
  if (prompt.type === "select") {
    return {
      type: "select",
      message: prompt.message,
      options: prompt.options,
      signal: prompt.signal,
    };
  }
  return {
    type: prompt.type === "manual_code" ? "manual-code" : prompt.type,
    message: prompt.message,
    placeholder: prompt.placeholder,
    signal: prompt.signal,
  };
}

function mapEvent(event: PiAuthEvent): AuthEvent {
  switch (event.type) {
    case "auth_url":
      return { type: "auth-url", url: event.url, instructions: event.instructions };
    case "device_code":
      return {
        type: "device-code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        expiresInSeconds: event.expiresInSeconds,
      };
    default:
      return { type: event.type, message: event.message };
  }
}

function interaction(options: ConnectOptions): PiAuthInteraction {
  return {
    signal: options.signal,
    notify: (event) => options.onEvent?.(mapEvent(event)),
    prompt: async (prompt) => {
      if (!options.prompt) {
        throw new AdapterError("capability", "此认证流程需要宿主提供 prompt handler");
      }
      return options.prompt(mapPrompt(prompt));
    },
  };
}

function authMethod(type: "api_key" | "oauth"): "api-key" | "oauth" {
  return type === "api_key" ? "api-key" : "oauth";
}

function customSelectionFromRequest(
  request: Extract<ConnectionRequest, { connectionType: "custom" }>,
): Extract<ModelSelection, { connectionType: "custom" }> {
  return {
    connectionType: "custom",
    authMethod: request.authMethod,
    providerId: request.providerId,
    modelId: request.modelId,
    custom: request.custom,
  };
}

export function createPiAiAdapter(options: PiAiAdapterOptions): ModelSettingsAdapter {
  const probePrompt = options.probePrompt ?? "Respond with OK.";
  const probeTimeoutMs = options.probeTimeoutMs ?? 15_000;
  const apiKeyFallbackProviders = new Set(options.apiKeyFallbackProviderIds ?? ["openai"]);

  async function getAuthStatus(providerId: string, signal?: AbortSignal): Promise<AuthStatus> {
    try {
      throwIfAborted(signal);
      const result = await options.models.checkAuth(providerId, { signal });
      throwIfAborted(signal);
      return result
        ? {
            state: "configured",
            method: authMethod(result.type),
            source: result.source,
          }
        : { state: "unconfigured" };
    } catch (cause) {
      if (signal?.aborted) throw abortError();
      return {
        state: "error",
        message: "认证状态检查失败，请检查宿主凭证配置",
      };
    }
  }

  return {
    async listProviders(operation = {}) {
      throwIfAborted(operation.signal);
      return options.models.getProviders().map((provider) =>
        mapProvider(provider, apiKeyFallbackProviders),
      );
    },

    async listModels(operation) {
      throwIfAborted(operation.signal);
      const catalog = options.models.getModels(operation.providerId).map(mapModel);
      return filterModelsByCapabilities(catalog, operation.requiredCapabilities);
    },

    getAuthStatus,

    async connect(request, connectOptions = {}) {
      throwIfAborted(connectOptions.signal);

      if (request.connectionType === "custom") {
        if (!options.models.setProvider) {
          throw new AdapterError("capability", "Models 实例不支持注册自定义 provider");
        }
        options.models.setProvider(createOpenAICompatibleProvider(customSelectionFromRequest(request)));
        if (request.authMethod === "api-key") {
          await options.credentials.modify(
            request.providerId,
            async () => ({ type: "api_key", key: request.apiKey }),
            { signal: connectOptions.signal },
          );
        }
      } else {
        const provider = options.models.getProvider(request.providerId);
        if (!provider) throw new AdapterError("catalog", "找不到指定的 provider");

        if (request.authMethod === "oauth") {
          if (!provider.auth.oauth) {
            throw new AdapterError("capability", "该 provider 不支持 OAuth");
          }
          await options.models.login(
            request.providerId,
            "oauth",
            interaction(connectOptions),
          );
        } else if (request.authMethod === "api-key") {
          if (!provider.auth.apiKey) {
            throw new AdapterError("capability", "该 provider 不支持 API Key");
          }
          if (provider.auth.apiKey.login) {
            let suppliedKey = false;
            await options.models.login(
              request.providerId,
              "api_key",
              interaction({
                ...connectOptions,
                prompt: async (prompt) => {
                  throwIfAborted(connectOptions.signal);
                  if (prompt.type === "secret" && !suppliedKey && request.apiKey) {
                    suppliedKey = true;
                    return request.apiKey;
                  }
                  if (!connectOptions.prompt) throw new AdapterError("capability", "此认证流程需要宿主提供 prompt handler");
                  return connectOptions.prompt(prompt);
                },
              }),
            );
          } else {
            if (!apiKeyFallbackProviders.has(request.providerId)) {
              throw new AdapterError("capability", "该 provider 只能使用宿主环境凭证");
            }
            await options.credentials.modify(
              request.providerId,
              async () => ({ type: "api_key", key: request.apiKey }),
              { signal: connectOptions.signal },
            );
          }
        }
      }

      throwIfAborted(connectOptions.signal);
      return {
        providerId: request.providerId,
        auth: await getAuthStatus(request.providerId, connectOptions.signal),
      };
    },

    async testConnection(selection, operation = {}) {
      throwIfAborted(operation.signal);
      if (selection.connectionType === "custom" && !options.models.getProvider(selection.providerId)) {
        if (!options.models.setProvider) {
          throw new AdapterError("capability", "Models 实例不支持注册自定义 provider");
        }
        options.models.setProvider(createOpenAICompatibleProvider(selection));
      }
      const model = options.models.getModel(selection.providerId, selection.modelId);
      if (!model) {
        return {
          state: "unreachable",
          message: "找不到指定的模型",
          testedAt: Date.now(),
          mayBeBillable: false,
        };
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      operation.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, probeTimeoutMs);
      try {
        const response = await options.models.completeSimple(
          model,
          {
            messages: [
              { role: "user", content: probePrompt, timestamp: Date.now() },
            ],
          },
          { signal: controller.signal, maxTokens: 1, timeoutMs: probeTimeoutMs },
        );
        if (operation.signal?.aborted) throw abortError();
        const reachable = !controller.signal.aborted && response.stopReason !== "error" && response.stopReason !== "aborted";
        return {
          state: reachable ? "reachable" : "unreachable",
          message: reachable
            ? "最小模型请求成功"
            : "最小模型请求失败或超时，请检查认证与网络",
          testedAt: Date.now(),
          mayBeBillable: true,
        };
      } catch (cause) {
        if (operation.signal?.aborted) throw abortError();
        return {
          state: "unreachable",
          message: "最小模型请求失败，请检查认证与网络",
          testedAt: Date.now(),
          mayBeBillable: true,
        };
      } finally {
        clearTimeout(timer);
        operation.signal?.removeEventListener("abort", abort);
      }
    },

    async disconnect(providerId, signal) {
      throwIfAborted(signal);
      await options.models.logout(providerId, { signal });
      return getAuthStatus(providerId, signal);
    },
  };
}

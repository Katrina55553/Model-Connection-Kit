import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Model, Provider } from "@earendil-works/pi-ai";
import type { ModelSelection } from "../../core/types";
import { validateCustomEndpoint, validateModelId } from "../../core/validate-custom-endpoint";

export type CustomModelSelection = Extract<ModelSelection, { connectionType: "custom" }>;

export function createOpenAICompatibleProvider(selection: CustomModelSelection): Provider<"openai-completions"> {
  const custom = validateCustomEndpoint(selection.custom);
  const modelId = validateModelId(selection.modelId);
  const cost = custom.model.cost;
  const model: Model<"openai-completions"> = {
    id: modelId,
    name: custom.displayName || modelId,
    api: "openai-completions",
    provider: selection.providerId,
    baseUrl: custom.baseUrl,
    input: [...custom.model.input],
    reasoning: custom.model.reasoning,
    contextWindow: custom.model.contextWindow,
    maxTokens: custom.model.maxTokens,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      maxTokensField: "max_tokens",
    },
    cost: {
      input: cost?.input ?? 0,
      output: cost?.output ?? 0,
      cacheRead: cost?.cacheRead ?? 0,
      cacheWrite: cost?.cacheWrite ?? 0,
    },
  };

  return createProvider({
    id: selection.providerId,
    name: custom.displayName || selection.providerId,
    baseUrl: custom.baseUrl,
    auth: {
      apiKey: {
        name: "OpenAI-compatible API key",
        resolve: async ({ credential }) => {
          if (selection.authMethod === "none") {
            // Pi requires a non-empty key internally; the SDK must not send its placeholder on the wire.
            return { auth: { apiKey: "not-required", headers: { Authorization: null } }, source: "无需认证" };
          }
          return credential?.key
            ? { auth: { apiKey: credential.key }, source: "CredentialStore" }
            : undefined;
        },
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });
}

import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Model, Provider } from "@earendil-works/pi-ai";
import type { ModelSelection } from "../../core/types";

export type CustomModelSelection = Extract<ModelSelection, { connectionType: "custom" }>;

export function createOpenAICompatibleProvider(selection: CustomModelSelection): Provider<"openai-completions"> {
  const { custom } = selection;
  const cost = custom.model.cost;
  const model: Model<"openai-completions"> = {
    id: selection.modelId,
    name: custom.displayName || selection.modelId,
    api: "openai-completions",
    provider: selection.providerId,
    baseUrl: custom.baseUrl,
    input: [...custom.model.input],
    reasoning: custom.model.reasoning,
    contextWindow: custom.model.contextWindow,
    maxTokens: custom.model.maxTokens,
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
            return { auth: { apiKey: "not-required" }, source: "无需认证" };
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

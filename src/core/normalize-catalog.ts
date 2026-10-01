import { AdapterError } from "./adapter-error";
import type { ModelCapability, ModelSummary, ProviderSummary } from "./types";

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AdapterError("catalog", `${field} 不能为空`);
  }
  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function normalizeProvider(provider: ProviderSummary): ProviderSummary {
  const id = requiredText(provider.id, "provider id");
  const oauth = provider.auth.oauth
    ? {
        label: optionalText(provider.auth.oauth.label),
        isSubscription: provider.auth.oauth.isSubscription ?? false,
      }
    : undefined;
  const apiKey = provider.auth.apiKey
    ? {
        label: requiredText(provider.auth.apiKey.label, "API Key label"),
        interactive: provider.auth.apiKey.interactive,
      }
    : undefined;

  return {
    id,
    name: optionalText(provider.name) ?? id,
    description: optionalText(provider.description),
    auth: {
      ...(oauth ? { oauth } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(provider.auth.ambient ? { ambient: true } : {}),
    },
  };
}

export function normalizeModel(model: ModelSummary): ModelSummary {
  const id = requiredText(model.id, "model id");
  const input = [...new Set(model.input)] satisfies ModelCapability[];

  return {
    id,
    providerId: requiredText(model.providerId, "model provider id"),
    name: optionalText(model.name) ?? id,
    description: optionalText(model.description),
    input,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.cost ? { cost: { ...model.cost } } : {}),
  };
}

export function normalizeProviders(providers: readonly ProviderSummary[]): ProviderSummary[] {
  const seen = new Set<string>();
  return providers.map(normalizeProvider).filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}

export function normalizeModels(models: readonly ModelSummary[]): ModelSummary[] {
  const seen = new Set<string>();
  return models.map(normalizeModel).filter((model) => {
    const key = `${model.providerId}\u0000${model.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

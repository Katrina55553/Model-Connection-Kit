import type { ModelCapability, ModelSummary } from "./types";

export function filterModelsByCapabilities(
  models: readonly ModelSummary[],
  required: readonly ModelCapability[] = [],
): ModelSummary[] {
  if (required.length === 0) return [...models];

  return models.filter((model) => required.every((capability) => model.input.includes(capability)));
}

import type { CustomEndpointConfig, ModelCapability } from "../core/types";
import type { ModelSettingsText } from "./types";
import styles from "./model-settings.module.css";

export interface CustomEndpointDraft {
  displayName: string;
  input: readonly ModelCapability[];
  reasoning: boolean;
  contextWindow: string;
  maxTokens: string;
  inputCost: string;
  outputCost: string;
  cacheReadCost: string;
  cacheWriteCost: string;
}

export function createCustomEndpointDraft(config?: CustomEndpointConfig): CustomEndpointDraft {
  return {
    displayName: config?.displayName ?? "",
    input: config?.model.input ?? ["text"], reasoning: config?.model.reasoning ?? false,
    contextWindow: String(config?.model.contextWindow ?? 8192),
    maxTokens: String(config?.model.maxTokens ?? 2048),
    inputCost: config?.model.cost?.input?.toString() ?? "",
    outputCost: config?.model.cost?.output?.toString() ?? "",
    cacheReadCost: config?.model.cost?.cacheRead?.toString() ?? "",
    cacheWriteCost: config?.model.cost?.cacheWrite?.toString() ?? "",
  };
}

export function draftMetadata(draft: CustomEndpointDraft): CustomEndpointConfig["model"] {
  const hasCost = [draft.inputCost, draft.outputCost, draft.cacheReadCost, draft.cacheWriteCost].some((value) => value.trim());
  return {
    input: draft.input, reasoning: draft.reasoning,
    contextWindow: Number(draft.contextWindow), maxTokens: Number(draft.maxTokens),
    ...(hasCost ? { cost: {
      input: draft.inputCost.trim() ? Number(draft.inputCost) : NaN,
      output: draft.outputCost.trim() ? Number(draft.outputCost) : NaN,
      ...(draft.cacheReadCost.trim() ? { cacheRead: Number(draft.cacheReadCost) } : {}),
      ...(draft.cacheWriteCost.trim() ? { cacheWrite: Number(draft.cacheWriteCost) } : {}),
    } } : {}),
  };
}

export function CustomEndpointFields({ draft, onChange, labels }: {
  draft: CustomEndpointDraft;
  onChange: (draft: CustomEndpointDraft) => void;
  labels: ModelSettingsText;
}) {
  const numberFields = [
    ["contextWindow", labels.contextWindowLabel], ["maxTokens", labels.maxTokensLabel],
    ["inputCost", labels.inputCostLabel], ["outputCost", labels.outputCostLabel],
    ["cacheReadCost", labels.cacheReadCostLabel], ["cacheWriteCost", labels.cacheWriteCostLabel],
  ] as const;
  return (
    <div className={styles.customFields}>
      <label>{labels.displayNameLabel}<input value={draft.displayName} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} /></label>
      <label>{labels.protocolLabel}<select value="openai-completions" disabled><option value="openai-completions">OpenAI Chat Completions</option></select></label>
      <fieldset>
        <legend>{labels.inputCapabilitiesLabel}</legend>
        {(["text", "image"] as const).map((capability) => (
          <label className={styles.checkbox} key={capability}>
            <input type="checkbox" checked={draft.input.includes(capability)} onChange={(event) => onChange({
              ...draft, input: event.target.checked ? [...draft.input, capability] : draft.input.filter((item) => item !== capability),
            })} />{capability === "text" ? labels.textInputLabel : labels.imageInputLabel}
          </label>
        ))}
      </fieldset>
      <label className={styles.checkbox}><input type="checkbox" checked={draft.reasoning} onChange={(event) => onChange({ ...draft, reasoning: event.target.checked })} />{labels.reasoningLabel}</label>
      {numberFields.map(([field, label]) => (
        <label key={field}>{label}<input type="number" min={field.endsWith("Cost") ? 0 : 1} step={field.endsWith("Cost") ? "any" : 1} value={draft[field]} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} /></label>
      ))}
      <p className={styles.fullWidth}>{[draft.inputCost, draft.outputCost, draft.cacheReadCost, draft.cacheWriteCost].some((amount) => amount.trim()) ? labels.priceUnitHint : labels.priceUnknown}</p>
      <p className={styles.fullWidth}>{labels.corsHint}</p>
    </div>
  );
}

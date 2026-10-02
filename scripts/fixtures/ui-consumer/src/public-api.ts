import {
  AdapterError, isAdapterError, filterModelsByCapabilities, normalizeBaseUrl,
  normalizeModel, normalizeModels, normalizeProvider, normalizeProviders,
  validateCustomEndpoint, validateModelId, validateModelMetadata, redactSensitiveText,
  enUSText, zhCNText,
  type AuthEvent, type AuthPrompt, type AuthStatus, type ConnectOptions,
  type ConnectionRequest, type ModelSettingsAdapter, type ModelSelection,
  type ModelSummary, type ProbeStatus, type ProviderSummary,
  type ModelSettingsPanelProps, type ModelSettingsDialogProps,
} from "model-connection-kit";

// Ensure consumers can resolve public declarations without any Pi AI installation.
export type PublicContracts = AuthEvent | AuthPrompt | AuthStatus | ConnectOptions |
  ConnectionRequest | ModelSettingsAdapter | ModelSelection | ModelSummary |
  ProbeStatus | ProviderSummary | ModelSettingsPanelProps | ModelSettingsDialogProps;
export const helpers = { AdapterError, isAdapterError, filterModelsByCapabilities,
  normalizeBaseUrl, normalizeModel, normalizeModels, normalizeProvider, normalizeProviders,
  validateCustomEndpoint, validateModelId, validateModelMetadata, redactSensitiveText, enUSText, zhCNText };

// @ts-expect-error Secrets are rejected by the installed public ModelSelection declaration.
const invalid: ModelSelection = { connectionType: "builtin", authMethod: "api-key", providerId: "sample", modelId: "text", apiKey: "never-persist" };
void invalid;

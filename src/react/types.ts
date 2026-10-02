import type { ReactNode } from "react";
import type {
  ModelCapability,
  ModelSelection,
  ModelSettingsAdapter,
} from "../core/types";

export type ModelSettingsMode = "subscription" | "api-key" | "custom";

export interface ModelSettingsText {
  eyebrow: string;
  title: string;
  description: string;
  methods: Record<ModelSettingsMode, string>;
  providerLabel: string;
  modelLabel: string;
  capabilityHint: string;
  apiKeyLabel: string;
  baseUrlLabel: string;
  customModelLabel: string;
  displayNameLabel: string;
  protocolLabel: string;
  inputCapabilitiesLabel: string;
  textInputLabel: string;
  imageInputLabel: string;
  reasoningLabel: string;
  contextWindowLabel: string;
  maxTokensLabel: string;
  inputCostLabel: string;
  outputCostLabel: string;
  cacheReadCostLabel: string;
  cacheWriteCostLabel: string;
  priceUnitHint: string;
  priceUnknown: string;
  corsHint: string;
  subscriptionTitle: string;
  subscriptionDescription: string;
  connect: string;
  connecting: string;
  disconnect: string;
  disconnecting: string;
  test: string;
  testing: string;
  save: string;
  saving: string;
  cancel: string;
  close: string;
  authConfigured: string;
  authUnconfigured: string;
  authError: string;
  noProviders: string;
  noModels: string;
  retry: string;
  promptSubmit: string;
  operationTimeout: string;
  loading: string;
}

export interface ModelSettingsPanelProps {
  adapter: ModelSettingsAdapter;
  value?: ModelSelection | null;
  defaultMode?: ModelSettingsMode;
  requiredCapabilities?: readonly ModelCapability[];
  text?: Partial<ModelSettingsText>;
  onChange?: (selection: ModelSelection) => void;
  onSave: (selection: ModelSelection) => void | Promise<void>;
  onCancel?: () => void;
  footerStart?: ReactNode;
  className?: string;
}

export interface ModelSettingsDialogProps extends ModelSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

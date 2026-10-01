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
  subscriptionTitle: string;
  subscriptionDescription: string;
  connect: string;
  connecting: string;
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

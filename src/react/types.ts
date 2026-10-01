import type { ReactNode } from "react";
import type {
  ConnectionMethod,
  ModelCapability,
  ModelSelection,
  ModelSettingsAdapter,
} from "../core/types";

export interface ModelSettingsText {
  eyebrow: string;
  title: string;
  description: string;
  methods: Record<ConnectionMethod, string>;
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
  connected: string;
  disconnected: string;
  loading: string;
}

export interface ModelSettingsPanelProps {
  adapter: ModelSettingsAdapter;
  value?: ModelSelection | null;
  defaultMethod?: ConnectionMethod;
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

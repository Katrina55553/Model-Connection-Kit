export type ConnectionType = "builtin" | "custom";

export type AuthMethod = "oauth" | "api-key" | "ambient" | "none";

export type ModelCapability = "text" | "image";

export interface ModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelMetadata {
  input: readonly ModelCapability[];
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  modelId?: never;
  cost?: ModelCost;
}

export interface CustomEndpointConfig {
  baseUrl: string;
  api: "openai-completions";
  displayName?: string;
  model: ModelMetadata;
}

/** Serializable, non-secret configuration safe to keep in application state. */
export type ModelSelection =
  | {
      connectionType: "builtin";
      authMethod: Exclude<AuthMethod, "none">;
      providerId: string;
      modelId: string;
      apiKey?: never;
      custom?: never;
    }
  | {
      connectionType: "custom";
      authMethod: Extract<AuthMethod, "api-key" | "none">;
      providerId: string;
      modelId: string;
      custom: CustomEndpointConfig;
      apiKey?: never;
    };

export interface ProviderSummary {
  id: string;
  name: string;
  description?: string;
  auth: {
    oauth?: {
      label?: string;
      isSubscription?: boolean;
    };
    apiKey?: {
      label: string;
      interactive: boolean;
    };
    ambient?: boolean;
  };
}

export interface ModelSummary extends ModelMetadata {
  id: string;
  providerId: string;
  name: string;
  description?: string;
}

export type AuthPrompt =
  | {
      type: "text" | "secret" | "manual-code";
      message: string;
      placeholder?: string;
      signal?: AbortSignal;
    }
  | {
      type: "select";
      message: string;
      options: readonly { id: string; label: string; description?: string }[];
      signal?: AbortSignal;
    };

export type AuthEvent =
  | { type: "info" | "progress"; message: string }
  | { type: "auth-url"; url: string; instructions?: string }
  | {
      type: "device-code";
      userCode: string;
      verificationUri: string;
      expiresInSeconds?: number;
    };

export interface ConnectOptions {
  signal?: AbortSignal;
  prompt?: (prompt: AuthPrompt) => Promise<string>;
  onEvent?: (event: AuthEvent) => void;
}

export interface AuthStatus {
  state: "configured" | "unconfigured" | "error";
  method?: AuthMethod;
  source?: string;
  message?: string;
}

export interface ProbeStatus {
  state: "untested" | "testing" | "reachable" | "unreachable";
  testedAt?: number;
  message?: string;
  mayBeBillable: boolean;
}

interface BuiltinConnectionRequestBase {
  connectionType: "builtin";
  providerId: string;
}

export type BuiltinConnectionRequest =
  | (BuiltinConnectionRequestBase & { authMethod: "oauth" })
  | (BuiltinConnectionRequestBase & { authMethod: "ambient" })
  | (BuiltinConnectionRequestBase & { authMethod: "api-key"; apiKey: string });

interface CustomConnectionRequestBase {
  connectionType: "custom";
  providerId: string;
  modelId: string;
  custom: CustomEndpointConfig;
}

export type CustomConnectionRequest =
  | (CustomConnectionRequestBase & { authMethod: "none" })
  | (CustomConnectionRequestBase & { authMethod: "api-key"; apiKey: string });

/** Secrets are accepted only at this one-way adapter boundary. */
export type ConnectionRequest = BuiltinConnectionRequest | CustomConnectionRequest;

export interface ListProvidersOptions {
  signal?: AbortSignal;
}

export interface ListModelsOptions {
  providerId: string;
  requiredCapabilities?: readonly ModelCapability[];
  signal?: AbortSignal;
}

export interface ConnectResult {
  providerId: string;
  auth: AuthStatus;
}

export type AdapterErrorCategory =
  | "validation"
  | "auth"
  | "oauth"
  | "capability"
  | "network"
  | "catalog"
  | "policy"
  | "unknown";

/** Runtime boundary implemented by Pi AI, a server API, or a test double. */
export interface ModelSettingsAdapter {
  listProviders(options?: ListProvidersOptions): Promise<ProviderSummary[]>;
  listModels(options: ListModelsOptions): Promise<ModelSummary[]>;
  getAuthStatus(providerId: string, signal?: AbortSignal): Promise<AuthStatus>;
  connect(request: ConnectionRequest, options?: ConnectOptions): Promise<ConnectResult>;
  testConnection(
    request: ModelSelection,
    options?: { signal?: AbortSignal },
  ): Promise<ProbeStatus>;
  disconnect(providerId: string, signal?: AbortSignal): Promise<AuthStatus>;
}

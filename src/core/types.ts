export type ConnectionMethod = "subscription" | "api-key" | "custom";

export type ModelCapability = "text" | "image" | "audio" | "video" | "tools";

export interface ProviderSummary {
  id: string;
  name: string;
  description?: string;
  methods: readonly Exclude<ConnectionMethod, "custom">[];
}

export interface ModelSummary {
  id: string;
  providerId: string;
  name: string;
  input: readonly ModelCapability[];
  reasoning?: boolean;
  contextWindow?: number;
}

export interface CustomEndpointConfig {
  baseUrl: string;
  modelId: string;
  displayName?: string;
}

/** Serializable, non-secret configuration safe to keep in application state. */
export interface ModelSelection {
  method: ConnectionMethod;
  providerId: string;
  modelId: string;
  custom?: CustomEndpointConfig;
}

export type ConnectionRequest =
  | {
      method: "subscription";
      providerId: string;
    }
  | {
      method: "api-key";
      providerId: string;
      apiKey: string;
    }
  | {
      method: "custom";
      providerId?: string;
      baseUrl: string;
      apiKey?: string;
      modelId: string;
      displayName?: string;
    };

export interface ConnectionStatus {
  state: "connected" | "disconnected" | "connecting" | "error";
  source?: string;
  message?: string;
}

export type AuthEvent =
  | { type: "info" | "progress"; message: string }
  | { type: "auth-url"; url: string; message?: string }
  | { type: "device-code"; userCode: string; verificationUri: string };

export interface AdapterOperationOptions {
  signal?: AbortSignal;
  onAuthEvent?: (event: AuthEvent) => void;
}

export interface ListModelsOptions {
  providerId: string;
  requiredCapabilities?: readonly ModelCapability[];
  signal?: AbortSignal;
}

export interface ConnectResult {
  providerId: string;
  status: ConnectionStatus;
}

/** Runtime boundary implemented by Pi AI, a server API, or a test double. */
export interface ModelSettingsAdapter {
  listProviders(method: Exclude<ConnectionMethod, "custom">, signal?: AbortSignal): Promise<ProviderSummary[]>;
  listModels(options: ListModelsOptions): Promise<ModelSummary[]>;
  getConnectionStatus(providerId: string, signal?: AbortSignal): Promise<ConnectionStatus>;
  connect(request: ConnectionRequest, options?: AdapterOperationOptions): Promise<ConnectResult>;
  testConnection(request: ConnectionRequest, options?: AdapterOperationOptions): Promise<ConnectionStatus>;
  disconnect(providerId: string, signal?: AbortSignal): Promise<void>;
}

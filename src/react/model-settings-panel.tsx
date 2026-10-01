import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthEvent,
  AuthStatus,
  ConnectionRequest,
  ModelSelection,
  ModelSummary,
  ProbeStatus,
  ProviderSummary,
} from "../core/types";
import { zhCNText } from "./text";
import type { ModelSettingsMode, ModelSettingsPanelProps } from "./types";

function modeForSelection(value: ModelSelection | null | undefined): ModelSettingsMode {
  if (!value) return "subscription";
  if (value.connectionType === "custom") return "custom";
  return value.authMethod === "oauth" ? "subscription" : "api-key";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ModelSettingsPanel({
  adapter,
  value,
  defaultMode,
  requiredCapabilities,
  text,
  onChange,
  onSave,
  onCancel,
  footerStart,
  className,
}: ModelSettingsPanelProps) {
  const labels = { ...zhCNText, ...text, methods: { ...zhCNText.methods, ...text?.methods } };
  const [mode, setMode] = useState<ModelSettingsMode>(defaultMode ?? modeForSelection(value));
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [providerId, setProviderId] = useState(value?.providerId ?? "");
  const [modelId, setModelId] = useState(value?.modelId ?? "");
  const [baseUrl, setBaseUrl] = useState(
    value?.connectionType === "custom" ? value.custom.baseUrl : "http://localhost:11434/v1",
  );
  const [apiKey, setApiKey] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus | null>(null);
  const [eventMessage, setEventMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"connect" | "test" | "save" | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (mode === "custom") {
      setProviders([]);
      setProviderId("custom");
      setModels([]);
      setModelId(value?.connectionType === "custom" ? value.modelId : "");
      setAuthStatus(null);
      return;
    }

    const controller = new AbortController();
    setError("");
    void adapter
      .listProviders({ signal: controller.signal })
      .then((catalog) => {
        if (controller.signal.aborted) return;
        const available = catalog.filter((provider) =>
          mode === "subscription"
            ? provider.auth.oauth?.isSubscription
            : provider.auth.apiKey?.interactive,
        );
        setProviders(available);
        setProviderId((current) =>
          available.some((provider) => provider.id === current) ? current : (available[0]?.id ?? ""),
        );
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause) && mounted.current) {
          setError(cause instanceof Error ? cause.message : "服务商目录加载失败");
        }
      });
    return () => controller.abort();
  }, [adapter, mode, value]);

  useEffect(() => {
    if (mode === "custom" || !providerId) return;
    const controller = new AbortController();
    setModels([]);
    setModelId("");
    setAuthStatus(null);
    void Promise.all([
      adapter.listModels({ providerId, requiredCapabilities, signal: controller.signal }),
      adapter.getAuthStatus(providerId, controller.signal),
    ])
      .then(([catalog, status]) => {
        if (controller.signal.aborted) return;
        setModels(catalog);
        setModelId((current) =>
          catalog.some((model) => model.id === current) ? current : (catalog[0]?.id ?? ""),
        );
        setAuthStatus(status);
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause) && mounted.current) {
          setError(cause instanceof Error ? cause.message : "模型目录加载失败");
        }
      });
    return () => controller.abort();
  }, [adapter, mode, providerId, requiredCapabilities]);

  const selection = useMemo<ModelSelection | null>(() => {
    if (!modelId) return null;
    if (mode === "custom") {
      if (!baseUrl.trim()) return null;
      return {
        connectionType: "custom",
        authMethod: apiKey ? "api-key" : "none",
        providerId: "custom",
        modelId: modelId.trim(),
        custom: {
          baseUrl: baseUrl.trim(),
          api: "openai-completions",
          model: {
            input: requiredCapabilities?.length ? requiredCapabilities : ["text"],
            reasoning: false,
            contextWindow: 8_192,
            maxTokens: 2_048,
          },
        },
      };
    }
    if (!providerId) return null;
    return {
      connectionType: "builtin",
      authMethod: mode === "subscription" ? "oauth" : "api-key",
      providerId,
      modelId,
    };
  }, [apiKey, baseUrl, mode, modelId, providerId, requiredCapabilities]);

  function beginAction(kind: "connect" | "test" | "save"): AbortController {
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(kind);
    setError("");
    return controller;
  }

  function finishAction(controller: AbortController) {
    if (mounted.current && actionController.current === controller && !controller.signal.aborted) {
      setBusy(null);
    }
  }

  async function handleConnect() {
    if (!providerId && mode !== "custom") return;
    const controller = beginAction("connect");
    const customSelection = mode === "custom" && selection?.connectionType === "custom" ? selection : null;
    const request: ConnectionRequest = customSelection
      ? apiKey
        ? {
            connectionType: "custom",
            authMethod: "api-key",
            providerId: customSelection.providerId,
            modelId: customSelection.modelId,
            custom: customSelection.custom,
            apiKey,
          }
        : {
            connectionType: "custom",
            authMethod: "none",
            providerId: customSelection.providerId,
            modelId: customSelection.modelId,
            custom: customSelection.custom,
          }
      : mode === "subscription"
        ? { connectionType: "builtin", authMethod: "oauth", providerId }
        : { connectionType: "builtin", authMethod: "api-key", providerId, apiKey };

    try {
      const result = await adapter.connect(request, {
        signal: controller.signal,
        onEvent: (event: AuthEvent) => {
          if (controller.signal.aborted || !mounted.current) return;
          setEventMessage(
            event.type === "auth-url"
              ? event.instructions ?? event.url
              : event.type === "device-code"
                ? `${event.verificationUri} · ${event.userCode}`
                : event.message,
          );
        },
        prompt: async (prompt) => {
          if (prompt.signal?.aborted) throw new DOMException("操作已取消", "AbortError");
          return window.prompt(
            prompt.message,
            prompt.type === "select" ? undefined : prompt.placeholder,
          ) ?? "";
        },
      });
      if (!controller.signal.aborted && mounted.current) {
        setAuthStatus(result.auth);
        setApiKey("");
      }
    } catch (cause) {
      if (!isAbortError(cause) && mounted.current) {
        setError(cause instanceof Error ? cause.message : "连接失败");
      }
    } finally {
      finishAction(controller);
    }
  }

  async function handleTest() {
    if (!selection) return;
    const controller = beginAction("test");
    setProbeStatus({ state: "testing", mayBeBillable: true });
    try {
      const status = await adapter.testConnection(selection, { signal: controller.signal });
      if (!controller.signal.aborted && mounted.current) setProbeStatus(status);
    } catch (cause) {
      if (!isAbortError(cause) && mounted.current) {
        setProbeStatus({
          state: "unreachable",
          message: cause instanceof Error ? cause.message : "连接测试失败",
          mayBeBillable: true,
        });
      }
    } finally {
      finishAction(controller);
    }
  }

  async function handleSave() {
    if (!selection || busy) return;
    const controller = beginAction("save");
    try {
      onChange?.(selection);
      await onSave(selection);
    } catch (cause) {
      if (!isAbortError(cause) && mounted.current) {
        setError(cause instanceof Error ? cause.message : "保存失败");
      }
    } finally {
      finishAction(controller);
    }
  }

  const authMessage =
    authStatus?.state === "configured"
      ? `${labels.connected}${authStatus.source ? ` · ${authStatus.source}` : ""}`
      : labels.disconnected;

  return (
    <section className={["mck-panel", className].filter(Boolean).join(" ")}>
      <header>
        <p className="mck-eyebrow">{labels.eyebrow}</p>
        <h2>{labels.title}</h2>
        <p>{labels.description}</p>
      </header>

      <div className="mck-tabs" role="tablist" aria-label={labels.title}>
        {(Object.keys(labels.methods) as ModelSettingsMode[]).map((item) => (
          <button
            aria-selected={mode === item}
            key={item}
            onClick={() => {
              actionController.current?.abort();
              setMode(item);
              setApiKey("");
              setProbeStatus(null);
              setEventMessage("");
              setError("");
            }}
            role="tab"
            type="button"
          >
            {labels.methods[item]}
          </button>
        ))}
      </div>

      {mode !== "custom" ? (
        <>
          <label>
            {labels.providerLabel}
            <select
              aria-label={labels.providerLabel}
              onChange={(event) => setProviderId(event.target.value)}
              value={providerId}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          {mode === "subscription" ? (
            <div className="mck-callout">
              <strong>{labels.subscriptionTitle}</strong>
              <span>{labels.subscriptionDescription}</span>
            </div>
          ) : (
            <label>
              {labels.apiKeyLabel}
              <input
                aria-label={labels.apiKeyLabel}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                value={apiKey}
              />
            </label>
          )}
        </>
      ) : (
        <>
          <label>
            {labels.baseUrlLabel}
            <input
              aria-label={labels.baseUrlLabel}
              onChange={(event) => setBaseUrl(event.target.value)}
              type="url"
              value={baseUrl}
            />
          </label>
          <label>
            {labels.apiKeyLabel}
            <input
              aria-label={labels.apiKeyLabel}
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              value={apiKey}
            />
          </label>
          <label>
            {labels.customModelLabel}
            <input
              aria-label={labels.customModelLabel}
              onChange={(event) => setModelId(event.target.value)}
              value={modelId}
            />
          </label>
        </>
      )}

      {mode !== "custom" && (
        <label>
          {labels.modelLabel}
          <select
            aria-label={labels.modelLabel}
            onChange={(event) => setModelId(event.target.value)}
            value={modelId}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p aria-live="polite" className="mck-status">
        {eventMessage || authMessage}
      </p>
      {probeStatus && (
        <p aria-live="polite" className={`mck-probe mck-probe-${probeStatus.state}`}>
          {probeStatus.message ?? probeStatus.state}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="mck-billing-note">测试将发送最小请求，可能产生少量费用。</p>

      <footer>
        {footerStart}
        <button disabled={busy !== null} onClick={handleConnect} type="button">
          {busy === "connect" ? labels.connecting : labels.connect}
        </button>
        <button disabled={!selection || busy !== null} onClick={handleTest} type="button">
          {busy === "test" ? labels.testing : labels.test}
        </button>
        {onCancel && (
          <button disabled={busy !== null} onClick={onCancel} type="button">
            {labels.cancel}
          </button>
        )}
        <button disabled={!selection || busy !== null} onClick={handleSave} type="button">
          {busy === "save" ? labels.saving : labels.save}
        </button>
      </footer>
    </section>
  );
}

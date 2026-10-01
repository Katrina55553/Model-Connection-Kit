import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
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
import styles from "./model-settings.module.css";

function modeForSelection(value: ModelSelection | null | undefined): ModelSettingsMode {
  if (!value) return "subscription";
  if (value.connectionType === "custom") return "custom";
  return value.authMethod === "oauth" ? "subscription" : "api-key";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

interface CatalogSelectProps {
  label: string;
  value: string;
  items: readonly { id: string; name: string }[];
  disabled?: boolean;
  placeholder: string;
  onValueChange: (value: string) => void;
}

function CatalogSelect({
  label,
  value,
  items,
  disabled,
  placeholder,
  onValueChange,
}: CatalogSelectProps) {
  return (
    <label className={styles.field}>
      {label}
      <Select.Root disabled={disabled} onValueChange={onValueChange} value={value}>
        <Select.Trigger aria-label={label} className={styles.selectTrigger}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon aria-hidden="true">⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={styles.selectContent} position="popper">
            <Select.Viewport>
              {items.map((item) => (
                <Select.Item className={styles.selectItem} key={item.id} value={item.id}>
                  <Select.ItemText>{item.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
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
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [busy, setBusy] = useState<"connect" | "test" | "save" | null>(null);
  const busyRef = useRef<typeof busy>(null);
  const actionController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionController.current?.abort();
      busyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mode === "custom") {
      setProviders([]);
      setProviderId("custom");
      setModels([]);
      setModelId(value?.connectionType === "custom" ? value.modelId : "");
      setAuthStatus(null);
      setLoadingProviders(false);
      setLoadingModels(false);
      return;
    }

    const controller = new AbortController();
    setError("");
    setLoadingProviders(true);
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
        setLoadingProviders(false);
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause) && mounted.current) {
          setError(cause instanceof Error ? cause.message : "服务商目录加载失败");
          setLoadingProviders(false);
        }
      });
    return () => controller.abort();
  }, [adapter, mode, retryVersion, value]);

  useEffect(() => {
    if (mode === "custom" || !providerId) return;
    const controller = new AbortController();
    setModels([]);
    setModelId("");
    setAuthStatus(null);
    setLoadingModels(true);
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
        setLoadingModels(false);
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause) && mounted.current) {
          setError(cause instanceof Error ? cause.message : "模型目录加载失败");
          setLoadingModels(false);
        }
      });
    return () => controller.abort();
  }, [adapter, mode, providerId, requiredCapabilities, retryVersion]);

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

  function beginAction(kind: "connect" | "test" | "save"): AbortController | null {
    if (busyRef.current) return null;
    const controller = new AbortController();
    actionController.current = controller;
    busyRef.current = kind;
    setBusy(kind);
    setError("");
    return controller;
  }

  function finishAction(controller: AbortController) {
    if (mounted.current && actionController.current === controller && !controller.signal.aborted) {
      busyRef.current = null;
      actionController.current = null;
      setBusy(null);
    }
  }

  async function handleConnect() {
    if ((!providerId && mode !== "custom") || (mode === "custom" && !selection)) return;
    const controller = beginAction("connect");
    if (!controller) return;
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
    if (!controller) return;
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
    if (!selection) return;
    const controller = beginAction("save");
    if (!controller) return;
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
      ? `${labels.authConfigured}${authStatus.source ? ` · ${authStatus.source}` : ""}`
      : authStatus?.state === "error"
        ? `${labels.authError}${authStatus.message ? ` · ${authStatus.message}` : ""}`
        : labels.authUnconfigured;
  const canConnect =
    mode === "custom"
      ? selection !== null
      : Boolean(providerId) && (mode === "subscription" || Boolean(apiKey.trim()));

  return (
    <section className={["mck-panel", styles.panel, className].filter(Boolean).join(" ")}>
      <header>
        <p className="mck-eyebrow">{labels.eyebrow}</p>
        <h2>{labels.title}</h2>
        <p>{labels.description}</p>
      </header>

      <Tabs.Root
        className={styles.tabs}
        onValueChange={(nextMode) => {
          if (nextMode === "subscription" || nextMode === "api-key" || nextMode === "custom") {
              actionController.current?.abort();
              actionController.current = null;
              busyRef.current = null;
              setBusy(null);
              setMode(nextMode);
              setApiKey("");
              setProbeStatus(null);
              setEventMessage("");
              setError("");
          }
        }}
        value={mode}
      >
        <Tabs.List aria-label={labels.title} className="mck-tabs">
          {(Object.keys(labels.methods) as ModelSettingsMode[]).map((item) => (
            <Tabs.Trigger className={styles.tabTrigger} key={item} value={item}>
              {labels.methods[item]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {mode !== "custom" ? (
        <>
          <CatalogSelect
            disabled={loadingProviders || providers.length === 0}
            items={providers}
            label={labels.providerLabel}
            onValueChange={setProviderId}
            placeholder={loadingProviders ? labels.loading : labels.noProviders}
            value={providerId}
          />
          {!loadingProviders && providers.length === 0 && !error && (
            <p className={styles.empty}>{labels.noProviders}</p>
          )}
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
        <>
          <CatalogSelect
            disabled={loadingModels || models.length === 0}
            items={models}
            label={labels.modelLabel}
            onValueChange={setModelId}
            placeholder={loadingModels ? labels.loading : labels.noModels}
            value={modelId}
          />
          {!loadingModels && providerId && models.length === 0 && !error && (
            <p className={styles.empty}>{labels.noModels}</p>
          )}
        </>
      )}

      <p aria-live="polite" className="mck-status">
        {eventMessage || authMessage}
      </p>
      {probeStatus && (
        <p aria-live="polite" className={`mck-probe mck-probe-${probeStatus.state}`}>
          {probeStatus.message ?? probeStatus.state}
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={() => setRetryVersion((version) => version + 1)} type="button">
            {labels.retry}
          </button>
        </div>
      )}
      <p className="mck-billing-note">测试将发送最小请求，可能产生少量费用。</p>

      <footer>
        {footerStart}
        <button disabled={!canConnect || busy !== null} onClick={handleConnect} type="button">
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

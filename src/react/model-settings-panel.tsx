import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthEvent,
  AuthPrompt,
  AuthStatus,
  ConnectionRequest,
  ModelSelection,
  ModelSummary,
  ProbeStatus,
  ProviderSummary,
} from "../core/types";
import { redactSensitiveText } from "../core/redact-sensitive";
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
  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus | null>(null);
  const [eventMessage, setEventMessage] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [activePrompt, setActivePrompt] = useState<AuthPrompt | null>(null);
  const [promptSelectValue, setPromptSelectValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPrompt = useRef<{
    resolve: (value: string) => void;
    reject: (reason: unknown) => void;
    cleanup: () => void;
  } | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "test" | "save" | null>(null);
  const busyRef = useRef<typeof busy>(null);
  const actionController = useRef<AbortController | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionController.current?.abort();
      if (actionTimer.current) clearTimeout(actionTimer.current);
      pendingPrompt.current?.cleanup();
      pendingPrompt.current?.reject(new DOMException("操作已取消", "AbortError"));
      pendingPrompt.current = null;
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
            : provider.auth.apiKey?.interactive || provider.auth.ambient,
        );
        setProviders(available);
        setProviderId((current) =>
          available.some((provider) => provider.id === current) ? current : (available[0]?.id ?? ""),
        );
        setLoadingProviders(false);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
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
        if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
          setError(cause instanceof Error ? cause.message : "模型目录加载失败");
          setLoadingModels(false);
        }
      });
    return () => controller.abort();
  }, [adapter, mode, providerId, requiredCapabilities, retryVersion]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const isAmbientOnly =
    mode === "api-key" &&
    Boolean(selectedProvider?.auth.ambient) &&
    !selectedProvider?.auth.apiKey?.interactive;

  const selection = useMemo<ModelSelection | null>(() => {
    if (!modelId) return null;
    if (mode === "custom") {
      if (!baseUrl.trim()) return null;
      return {
        connectionType: "custom",
        authMethod: hasApiKey || authStatus?.method === "api-key" ? "api-key" : "none",
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
      authMethod: mode === "subscription" ? "oauth" : isAmbientOnly ? "ambient" : "api-key",
      providerId,
      modelId,
    };
  }, [baseUrl, hasApiKey, authStatus, isAmbientOnly, mode, modelId, providerId, requiredCapabilities]);

  function dismissPrompt(reason = new DOMException("操作已取消", "AbortError")) {
    const pending = pendingPrompt.current;
    if (!pending) return;
    pendingPrompt.current = null;
    pending.cleanup();
    if (promptInputRef.current) promptInputRef.current.value = "";
    if (mounted.current) setActivePrompt(null);
    pending.reject(reason);
  }

  function submitPrompt() {
    const pending = pendingPrompt.current;
    if (!pending || !activePrompt) return;
    const value =
      activePrompt.type === "select"
        ? promptSelectValue
        : (promptInputRef.current?.value ?? "");
    pendingPrompt.current = null;
    pending.cleanup();
    if (promptInputRef.current) promptInputRef.current.value = "";
    setActivePrompt(null);
    pending.resolve(value);
  }

  function requestPrompt(prompt: AuthPrompt, signal: AbortSignal): Promise<string> {
    if (prompt.signal?.aborted || signal.aborted) return Promise.reject(new DOMException("操作已取消", "AbortError"));
    dismissPrompt();
    return new Promise<string>((resolve, reject) => {
      const abort = () => {
        if (pendingPrompt.current?.reject !== reject) return;
        pendingPrompt.current = null;
        cleanup();
        if (promptInputRef.current) promptInputRef.current.value = "";
        if (mounted.current) setActivePrompt(null);
        reject(new DOMException("操作已取消", "AbortError"));
      };
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        prompt.signal?.removeEventListener("abort", abort);
      };
      signal.addEventListener("abort", abort, { once: true });
      prompt.signal?.addEventListener("abort", abort, { once: true });
      pendingPrompt.current = { resolve, reject, cleanup };
      setPromptSelectValue(prompt.type === "select" ? (prompt.options[0]?.id ?? "") : "");
      setActivePrompt(prompt);
    });
  }

  function beginAction(
    kind: "connect" | "disconnect" | "test" | "save",
  ): AbortController | null {
    if (busyRef.current) return null;
    const controller = new AbortController();
    actionController.current = controller;
    busyRef.current = kind;
    setBusy(kind);
    setError("");
    if (kind === "connect") {
      actionTimer.current = setTimeout(() => {
        if (actionController.current !== controller) return;
        controller.abort();
        dismissPrompt();
        actionController.current = null;
        busyRef.current = null;
        if (mounted.current) {
          setBusy(null);
          setError(labels.operationTimeout);
        }
      }, 60_000);
    }
    return controller;
  }

  function finishAction(controller: AbortController) {
    if (actionController.current === controller) {
      if (actionTimer.current) clearTimeout(actionTimer.current);
      actionTimer.current = null;
      busyRef.current = null;
      actionController.current = null;
      if (mounted.current) setBusy(null);
    }
  }

  async function handleConnect() {
    if (
      isAmbientOnly ||
      (!providerId && mode !== "custom") ||
      (mode === "custom" && !selection)
    ) return;
    const controller = beginAction("connect");
    if (!controller) return;
    const submittedApiKey = apiKeyRef.current?.value ?? "";
    const customSelection = mode === "custom" && selection?.connectionType === "custom" ? selection : null;
    const request: ConnectionRequest = customSelection
      ? submittedApiKey
        ? {
            connectionType: "custom",
            authMethod: "api-key",
            providerId: customSelection.providerId,
            modelId: customSelection.modelId,
            custom: customSelection.custom,
            apiKey: submittedApiKey,
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
        : {
            connectionType: "builtin",
            authMethod: "api-key",
            providerId,
            apiKey: submittedApiKey,
          };

    try {
      const result = await adapter.connect(request, {
        signal: controller.signal,
        onEvent: (event: AuthEvent) => {
          if (controller.signal.aborted || !mounted.current) return;
          if (event.type === "auth-url" || event.type === "device-code") {
            const target = event.type === "auth-url" ? event.url : event.verificationUri;
            try {
              const parsed = new URL(target);
              setAuthorizationUrl(parsed.protocol === "https:" ? parsed.href : null);
            } catch { setAuthorizationUrl(null); }
          }
          setEventMessage(
            event.type === "auth-url"
              ? event.instructions ?? event.url
              : event.type === "device-code"
                ? `${event.verificationUri} · ${event.userCode}`
                : redactSensitiveText(event.message, [submittedApiKey]),
          );
        },
        prompt: (prompt) => requestPrompt(prompt, controller.signal),
      });
      if (!controller.signal.aborted && mounted.current) {
        setAuthStatus(result.auth);
        setEventMessage("");
        setAuthorizationUrl(null);
        if (apiKeyRef.current) apiKeyRef.current.value = "";
        setHasApiKey(false);
      }
    } catch (cause) {
      if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
        setError(
          redactSensitiveText(cause instanceof Error ? cause.message : "连接失败", [
            submittedApiKey,
          ]),
        );
      }
    } finally {
      finishAction(controller);
    }
  }

  async function handleDisconnect() {
    if (!providerId) return;
    const controller = beginAction("disconnect");
    if (!controller) return;
    try {
      const status = await adapter.disconnect(providerId, controller.signal);
      if (!controller.signal.aborted && mounted.current) {
        setAuthStatus(status);
        setProbeStatus(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
        setError(redactSensitiveText(cause instanceof Error ? cause.message : "断开认证失败"));
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
      if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
        setProbeStatus({
          state: "unreachable",
          message: redactSensitiveText(cause instanceof Error ? cause.message : "连接测试失败"),
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
      if (!controller.signal.aborted && !isAbortError(cause) && mounted.current) {
        setError(redactSensitiveText(cause instanceof Error ? cause.message : "保存失败"));
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
      : !isAmbientOnly && Boolean(providerId) && (mode === "subscription" || hasApiKey);

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
              if (actionTimer.current) clearTimeout(actionTimer.current);
              actionTimer.current = null;
              actionController.current = null;
              busyRef.current = null;
              setBusy(null);
              dismissPrompt();
              setMode(nextMode);
              if (apiKeyRef.current) apiKeyRef.current.value = "";
              setHasApiKey(false);
              setProbeStatus(null);
              setEventMessage("");
              setAuthorizationUrl(null);
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
          ) : isAmbientOnly ? (
            <div className="mck-callout">
              <strong>{selectedProvider?.auth.apiKey?.label}</strong>
              <span>此服务商只读取宿主环境中的凭证，不接受组件输入。</span>
            </div>
          ) : (
            <label>
              {labels.apiKeyLabel}
              <input
                aria-label={labels.apiKeyLabel}
                autoComplete="off"
                onChange={(event) => setHasApiKey(Boolean(event.target.value))}
                ref={apiKeyRef}
                type="password"
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
              onChange={(event) => setHasApiKey(Boolean(event.target.value))}
              ref={apiKeyRef}
              type="password"
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

      {activePrompt && (
        <div aria-label={activePrompt.message} className={styles.prompt} role="group">
          <strong>{activePrompt.message}</strong>
          {activePrompt.type === "select" ? (
            <select
              aria-label={activePrompt.message}
              onChange={(event) => setPromptSelectValue(event.target.value)}
              value={promptSelectValue}
            >
              {activePrompt.options.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label={activePrompt.message}
              autoComplete="off"
              placeholder={activePrompt.placeholder}
              ref={promptInputRef}
              type={activePrompt.type === "secret" ? "password" : "text"}
            />
          )}
          <div className={styles.promptActions}>
            <button onClick={() => dismissPrompt()} type="button">{labels.cancel}</button>
            <button
              disabled={activePrompt.type === "select" && !promptSelectValue}
              onClick={submitPrompt}
              type="button"
            >
              {labels.promptSubmit}
            </button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="mck-status">
        {eventMessage || redactSensitiveText(authMessage)}
      </p>
      {authorizationUrl && (
        <a href={authorizationUrl} rel="noopener noreferrer" target="_blank">{labels.subscriptionTitle}</a>
      )}
      {probeStatus && (
        <p aria-live="polite" className={`mck-probe mck-probe-${probeStatus.state}`}>
          {redactSensitiveText(probeStatus.message ?? probeStatus.state)}
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
        {authStatus?.state === "configured" && (
          <button disabled={busy !== null} onClick={handleDisconnect} type="button">
            {busy === "disconnect" ? labels.disconnecting : labels.disconnect}
          </button>
        )}
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

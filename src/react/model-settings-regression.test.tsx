import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import type { AuthStatus, ConnectOptions, ConnectResult, ModelSelection, ModelSettingsAdapter, ModelSummary, ProbeStatus } from "../core/types";
import { ModelSettingsPanel } from "./model-settings-panel";
import { ModelSettingsDialog } from "./model-settings-dialog";

describe("model settings regressions", () => {
  it("ignores authorization events emitted after a successful login has finished", async () => {
    let options!: ConnectOptions;
    const adapter: ModelSettingsAdapter = { ...createMockModelSettingsAdapter(), connect: async (request, supplied = {}) => {
      options = supplied;
      return { providerId: request.providerId, auth: { state: "configured", method: "oauth", source: "finished" } };
    } };
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByText("认证已配置 · finished")).toBeInTheDocument();
    act(() => options.onEvent?.({ type: "auth-url", url: "https://example.test/old", instructions: "旧授权链接" }));
    expect(screen.queryByText("旧授权链接")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("focuses the authorization prompt so it can be completed with the keyboard", async () => {
    const user = userEvent.setup();
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter({ requireOAuthPrompt: true })} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "连接" }));
    const prompt = await screen.findByLabelText("输入授权码", { selector: "input" });
    expect(prompt).toHaveFocus();
    await user.keyboard("keyboard-code");
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "继续" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("认证已配置 · mock-store")).toBeInTheDocument();
  });

  it("supports keyboard model selection and Escape without changing the chosen model", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter()} defaultMode="api-key" onSave={onSave} />);
    const models = screen.getByLabelText("模型");
    await waitFor(() => expect(models).toHaveTextContent("GPT Text"));
    act(() => models.focus());
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(models).toHaveTextContent("GPT Vision");
    await user.keyboard("{Enter}{ArrowUp}{Escape}");
    expect(models).toHaveFocus();
    expect(models).toHaveTextContent("GPT Vision");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ modelId: "gpt-vision" });
  });

  it("times out non-cooperative login, permits retry and ignores the late old result", async () => {
    const base = createMockModelSettingsAdapter();
    let finish!: (result: ConnectResult) => void;
    let signal: AbortSignal | undefined;
    const connect = vi.fn<ModelSettingsAdapter["connect"]>()
      .mockImplementationOnce(async (_request, options) => { signal = options?.signal; return new Promise((resolve) => { finish = resolve; }); })
      .mockImplementation(base.connect);
    const view = render(<ModelSettingsPanel adapter={{ ...base, connect }} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "连接" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(signal?.aborted).toBe(true);
      expect(screen.getByRole("alert")).toHaveTextContent("认证操作超时，请重试");
      fireEvent.click(screen.getByRole("button", { name: "连接" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByText("认证已配置 · mock-store")).toBeInTheDocument();
      await act(async () => finish({ providerId: "openai-codex", auth: { state: "unconfigured", source: "old" } }));
      expect(screen.getByText("认证已配置 · mock-store")).toBeInTheDocument();
      expect(connect).toHaveBeenCalledTimes(2);
    } finally { view.unmount(); vi.useRealTimers(); }
  });

  it("does not emit selection callbacks or alter the saved choice when a probe fails", async () => {
    const value: ModelSelection = { connectionType: "builtin", authMethod: "oauth", providerId: "openai-codex", modelId: "codex-mini" };
    const onChange = vi.fn();
    const onSave = vi.fn();
    const adapter = createMockModelSettingsAdapter({ failProbeFor: ["openai-codex"], initialAuth: { "openai-codex": { state: "configured", method: "oauth", source: "mock-store" } } });
    render(<ModelSettingsPanel adapter={adapter} value={value} onChange={onChange} onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled());
    const chosenModel = screen.getByLabelText("模型").textContent;
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText("认证已配置，但最小模型请求失败")).toBeInTheDocument();
    expect(screen.getByLabelText("模型").textContent).toBe(chosenModel);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(value.modelId).toBe("codex-mini");
  });

  it("keeps a custom draft when the host rerenders an equivalent selection", async () => {
    const adapter = createMockModelSettingsAdapter();
    const value: ModelSelection = { connectionType: "custom", authMethod: "none", providerId: "local", modelId: "saved", custom: { baseUrl: "http://localhost:1234/v1", api: "openai-completions", model: { input: ["text"], reasoning: false, contextWindow: 8192, maxTokens: 2048 } } };
    const view = render(<ModelSettingsPanel adapter={adapter} value={value} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "unsaved-draft" } });
    view.rerender(<ModelSettingsPanel adapter={adapter} value={{ ...value }} onSave={vi.fn()} />);
    expect(screen.getByLabelText("模型 ID")).toHaveValue("unsaved-draft");
  });

  it("does not reload a catalog when capability props are recreated with equal contents", async () => {
    const base = createMockModelSettingsAdapter();
    const listModels = vi.fn(base.listModels);
    const adapter = { ...base, listModels };
    const view = render(<ModelSettingsPanel adapter={adapter} defaultMode="api-key" requiredCapabilities={["text"]} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Text"));
    view.rerender(<ModelSettingsPanel adapter={adapter} defaultMode="api-key" requiredCapabilities={["text"]} onSave={vi.fn()} />);
    expect(listModels).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Text");
  });

  it("ignores reversed catalog responses across rapid provider switches", async () => {
    const user = userEvent.setup();
    const base = createMockModelSettingsAdapter();
    const requests: { providerId: string; signal?: AbortSignal; resolve: (models: ModelSummary[]) => void }[] = [];
    const adapter: ModelSettingsAdapter = { ...base, listModels: ({ providerId, signal }) => new Promise((resolve) => { requests.push({ providerId, signal, resolve }); }) };
    render(<ModelSettingsPanel adapter={adapter} defaultMode="api-key" onSave={vi.fn()} />);
    await waitFor(() => expect(requests).toHaveLength(1));
    await user.click(screen.getByLabelText("服务商"));
    await user.click(await screen.findByRole("option", { name: "Google" }));
    await user.click(screen.getByLabelText("服务商"));
    await user.click(await screen.findByRole("option", { name: "OpenAI" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    const model = (request: typeof requests[number], name: string): ModelSummary => ({ id: name, name, providerId: request.providerId, input: ["text"], reasoning: false, contextWindow: 8192, maxTokens: 2048 });
    await act(async () => requests[2]!.resolve([model(requests[2]!, "最新目录")]));
    await act(async () => { requests[1]!.resolve([model(requests[1]!, "Google 旧目录")]); requests[0]!.resolve([model(requests[0]!, "OpenAI 旧目录")]); });
    expect(requests[0]!.signal?.aborted).toBe(true);
    expect(requests[1]!.signal?.aborted).toBe(true);
    expect(screen.getByLabelText("模型")).toHaveTextContent("最新目录");
    expect(screen.queryByText(/旧目录/)).not.toBeInTheDocument();
  });

  it("aborts login on tab changes and suppresses late events and auth results", async () => {
    const user = userEvent.setup();
    let options!: ConnectOptions;
    let finish!: (result: ConnectResult) => void;
    const adapter: ModelSettingsAdapter = { ...createMockModelSettingsAdapter(), connect: async (_request, supplied = {}) => { options = supplied; return new Promise((resolve) => { finish = resolve; }); } };
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    await user.click(screen.getByRole("tab", { name: "自定义接口" }));
    expect(options.signal?.aborted).toBe(true);
    await act(async () => {
      options.onEvent?.({ type: "info", message: "迟到的授权事件" });
      finish({ providerId: "openai-codex", auth: { state: "configured", source: "old-session" } });
    });
    expect(screen.queryByText("迟到的授权事件")).not.toBeInTheDocument();
    expect(screen.queryByText(/old-session/)).not.toBeInTheDocument();
  });

  it("cancels an external prompt while allowing callback-based login to finish", async () => {
    const external = new AbortController();
    const rejected = vi.fn();
    let finish!: () => void;
    const adapter: ModelSettingsAdapter = { ...createMockModelSettingsAdapter(), connect: async (request, options) => {
      try { await options!.prompt!({ type: "manual-code", message: "备用授权码", signal: external.signal }); } catch (cause) { rejected(cause); }
      await new Promise<void>((resolve) => { finish = resolve; });
      return { providerId: request.providerId, auth: { state: "configured", method: "oauth", source: "callback" } };
    } };
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    const input = await screen.findByLabelText("备用授权码", { selector: "input" });
    fireEvent.change(input, { target: { value: "temporary-code" } });
    await act(async () => external.abort());
    expect(rejected.mock.calls[0]?.[0]).toMatchObject({ name: "AbortError" });
    expect(input).toHaveValue("");
    expect(input).not.toBeInTheDocument();
    await act(async () => finish());
    expect(await screen.findByText("认证已配置 · callback")).toBeInTheDocument();
  });

  it("does not let an old auth check overwrite a newly completed login", async () => {
    let resolveAuth!: (status: AuthStatus) => void;
    const adapter = { ...createMockModelSettingsAdapter(), getAuthStatus: () => new Promise<AuthStatus>((resolve) => { resolveAuth = resolve; }) };
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByText("认证已配置 · mock-store")).toBeInTheDocument();
    await act(async () => resolveAuth({ state: "unconfigured" }));
    expect(screen.getByText("认证已配置 · mock-store")).toBeInTheDocument();
  });

  it("rejects pending authorization prompts when the dialog closes", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const rejected = vi.fn();
    const adapter: ModelSettingsAdapter = { ...createMockModelSettingsAdapter(), connect: async (request, options) => {
      signal = options?.signal;
      try { await options!.prompt!({ type: "secret", message: "登录秘密" }); } catch (cause) { rejected(cause); throw cause; }
      return { providerId: request.providerId, auth: { state: "configured" } };
    } };
    function Harness() { const [open, setOpen] = useState(true); return <ModelSettingsDialog adapter={adapter} open={open} onOpenChange={setOpen} onSave={vi.fn()} />; }
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "连接" }));
    await screen.findByLabelText("登录秘密", { selector: "input" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(signal?.aborted).toBe(true);
    expect(rejected.mock.calls[0]?.[0]).toMatchObject({ name: "AbortError" });
  });

  it("does not close a newly reopened dialog when an old save finally completes", async () => {
    const user = userEvent.setup();
    const adapter = createMockModelSettingsAdapter();
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const value: ModelSelection = { connectionType: "custom", authMethod: "none", providerId: "local", modelId: "text", custom: { baseUrl: "http://localhost:1234/v1", api: "openai-completions", model: { input: ["text"], reasoning: false, contextWindow: 8192, maxTokens: 2048 } } };
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>打开设置</button><ModelSettingsDialog adapter={adapter} value={value} open={open} onOpenChange={setOpen} onSave={onSave} /></>;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(await screen.findByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await screen.findByRole("dialog");
    await act(async () => finish());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("keeps configured auth visible even if the model catalog fails", async () => {
    const adapter = { ...createMockModelSettingsAdapter(), listModels: async () => { throw new Error("目录暂不可用"); }, getAuthStatus: async () => ({ state: "configured" as const, method: "oauth" as const, source: "saved-account" }) };
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("目录暂不可用");
    expect(await screen.findByText("认证已配置 · saved-account")).toBeInTheDocument();
  });
  it("gives the active keyboard-selected tab a real labelled tabpanel", async () => {
    const user = userEvent.setup();
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter()} onSave={vi.fn()} />);
    const tab = screen.getByRole("tab", { name: "订阅登录" });
    await user.click(tab);
    await user.keyboard("{ArrowRight}");
    const selected = screen.getByRole("tab", { name: "API Key" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "API Key" });
    expect(panel).toHaveAttribute("id", selected.getAttribute("aria-controls"));
    expect(panel).toContainElement(screen.getByLabelText("服务商"));
  });
  it("cancels an old provider probe and ignores its late result after switching", async () => {
    const user = userEvent.setup();
    let finish!: (status: ProbeStatus) => void;
    let probeSignal: AbortSignal | undefined;
    const adapter = {
      ...createMockModelSettingsAdapter(),
      testConnection: async (_selection: ModelSelection, options?: { signal?: AbortSignal }) => {
        probeSignal = options?.signal;
        return new Promise<ProbeStatus>((resolve) => { finish = resolve; });
      },
    };
    render(<ModelSettingsPanel adapter={adapter} defaultMode="api-key" onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Text"));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await user.click(screen.getByLabelText("服务商"));
    await user.click(await screen.findByRole("option", { name: "Google" }));
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("Gemini Vision"));
    expect(probeSignal?.aborted).toBe(true);
    await act(async () => finish({ state: "reachable", message: "旧模型请求成功", mayBeBillable: true }));
    expect(screen.queryByText("旧模型请求成功")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled();
  });
  it("restores the saved model instead of silently selecting the first catalog item", async () => {
    const onSave = vi.fn();
    const value: ModelSelection = { connectionType: "builtin", authMethod: "api-key", providerId: "openai", modelId: "gpt-vision" };
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter()} value={value} onSave={onSave} />);
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Vision"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(value));
  });
});

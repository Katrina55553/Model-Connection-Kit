import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import type { ModelSettingsAdapter } from "../core/types";
import { ModelSettingsPanel } from "./model-settings-panel";

describe("ModelSettingsPanel", () => {
  it("validates and saves complete custom metadata without a model catalog", async () => {
    const base = createMockModelSettingsAdapter();
    const listModels = vi.fn(base.listModels);
    const connect = vi.fn(base.connect);
    const onSave = vi.fn();
    render(<ModelSettingsPanel adapter={{ ...base, listModels, connect }} defaultMode="custom" onSave={onSave} />);
    expect(screen.getByText("价格未知（留空不代表免费）")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "org/local:latest" } });
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: " https://models.example/proxy/v1/ " } });
    fireEvent.change(screen.getByLabelText("显示名称（可选）"), { target: { value: "My model" } });
    fireEvent.click(screen.getByLabelText("图片"));
    fireEvent.click(screen.getByLabelText("推理模型（reasoning）"));
    fireEvent.change(screen.getByLabelText("Context window"), { target: { value: "16384" } });
    fireEvent.change(screen.getByLabelText("Max tokens"), { target: { value: "32768" } });
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Max tokens"), { target: { value: "4096" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      connectionType: "custom", authMethod: "none", modelId: "org/local:latest",
      custom: { baseUrl: "https://models.example/proxy/v1/", api: "openai-completions", displayName: "My model", model: { input: ["text", "image"], reasoning: true, contextWindow: 16384, maxTokens: 4096 } },
    });
    expect(onSave.mock.calls[0]?.[0].custom.model).not.toHaveProperty("cost");
    expect(connect).toHaveBeenCalledOnce();
    expect(listModels).not.toHaveBeenCalled();
  });

  it("does not treat a partially filled price as free", () => {
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter()} defaultMode="custom" onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local" } });
    fireEvent.change(screen.getByLabelText("输入价格（可选）"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("输出价格（可选）"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("clears credentials and probe state when the custom target changes", async () => {
    const base = createMockModelSettingsAdapter();
    const onSave = vi.fn();
    render(<ModelSettingsPanel adapter={base} defaultMode="custom" onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local" } });
    fireEvent.change(screen.getByLabelText("API Key", { selector: "input" }), { target: { value: "first-endpoint-key" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText("最小模型请求成功")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "https://second.example/v1" } });
    expect(screen.queryByText("最小模型请求成功")).not.toBeInTheDocument();
    expect(screen.getByLabelText("API Key", { selector: "input" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ authMethod: "none", providerId: "custom:https://second.example/v1" });
  });

  it("submits a pending custom key before probing and does not forward it to the probe", async () => {
    const base = createMockModelSettingsAdapter();
    const connect = vi.fn(base.connect);
    const testConnection = vi.fn(base.testConnection);
    render(<ModelSettingsPanel adapter={{ ...base, connect, testConnection }} defaultMode="custom" onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local" } });
    fireEvent.change(screen.getByLabelText("API Key", { selector: "input" }), { target: { value: "test-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(testConnection).toHaveBeenCalledOnce());
    expect(connect.mock.calls[0]?.[0]).toMatchObject({ apiKey: "test-secret", authMethod: "api-key" });
    expect(testConnection.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
    expect(screen.getByLabelText("API Key", { selector: "input" })).toHaveValue("");
  });
  it("cancels an OAuth prompt without configuring credentials", async () => {
    const adapter = createMockModelSettingsAdapter({ requireOAuthPrompt: true });
    render(<ModelSettingsPanel adapter={adapter} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连接" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByLabelText("输入授权码", { selector: "input" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByLabelText("输入授权码", { selector: "input" })).not.toBeInTheDocument());
    expect(await adapter.getAuthStatus("openai-codex")).toEqual({ state: "unconfigured" });
  });

  it("retains custom key authentication after clearing the secret input", async () => {
    const onSave = vi.fn();
    render(<ModelSettingsPanel adapter={createMockModelSettingsAdapter()} defaultMode="custom" onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local" } });
    const input = screen.getByLabelText("API Key", { selector: "input" });
    fireEvent.change(input, { target: { value: "private-key" } });
    expect(input).not.toHaveAttribute("value");
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    await waitFor(() => expect(input).toHaveValue(""));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].authMethod).toBe("api-key");
  });

  it("redacts a submitted secret from connection errors", async () => {
    const base = createMockModelSettingsAdapter();
    render(<ModelSettingsPanel adapter={{ ...base, connect: async () => { throw new Error("拒绝 private-key"); } }} defaultMode="api-key" onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Text"));
    fireEvent.change(screen.getByLabelText("API Key", { selector: "input" }), { target: { value: "private-key" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private-key");
  });
  it("submits an API key one way, clears it, and never includes it in callbacks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(
      <ModelSettingsPanel
        adapter={createMockModelSettingsAdapter()}
        defaultMode="api-key"
        onChange={onChange}
        onSave={onSave}
      />,
    );

    const keyInput = await screen.findByLabelText("API Key", { selector: "input" });
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("GPT Text"));
    await user.type(keyInput, "top-secret");
    await user.click(screen.getByRole("button", { name: "连接" }));
    await waitFor(() => expect(keyInput).toHaveValue(""));
    expect(screen.getByText("认证已配置 · mock-store")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
    expect(JSON.stringify(onSave.mock.calls[0]?.[0])).not.toContain("top-secret");
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
  });

  it("shows configured authentication and an independent failed probe", async () => {
    const user = userEvent.setup();
    render(
      <ModelSettingsPanel
        adapter={
          createMockModelSettingsAdapter({
            failProbeFor: ["openai-codex"],
            initialAuth: {
              "openai-codex": { state: "configured", method: "oauth", source: "mock-store" },
            },
          })
        }
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findByText(/认证已配置/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText("认证已配置，但最小模型请求失败")).toBeInTheDocument();
    expect(screen.getByText("认证已配置 · mock-store")).toBeInTheDocument();
  });

  it("aborts catalog loading when unmounted", async () => {
    let observedSignal: AbortSignal | undefined;
    const pendingAdapter: ModelSettingsAdapter = {
      ...createMockModelSettingsAdapter(),
      listProviders: ({ signal } = {}) => {
        observedSignal = signal;
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    };
    const view = render(<ModelSettingsPanel adapter={pendingAdapter} onSave={vi.fn()} />);
    await waitFor(() => expect(observedSignal).toBeDefined());

    act(() => view.unmount());
    expect(observedSignal?.aborted).toBe(true);
  });

  it("supports a custom endpoint without exposing its key", async () => {
    const onSave = vi.fn();
    render(
      <ModelSettingsPanel
        adapter={createMockModelSettingsAdapter()}
        defaultMode="custom"
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local-model" } });
    fireEvent.change(screen.getByLabelText("API Key", { selector: "input" }), { target: { value: "local-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      connectionType: "custom",
      authMethod: "api-key",
      modelId: "local-model",
    });
    expect(JSON.stringify(onSave.mock.calls[0]?.[0])).not.toContain("local-secret");
  });

  it("prevents concurrent saves even before the disabled state renders", async () => {
    let finishSave: (() => void) | undefined;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    render(
      <ModelSettingsPanel
        adapter={createMockModelSettingsAdapter()}
        defaultMode="custom"
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("模型 ID"), { target: { value: "local-model" } });
    const save = screen.getByRole("button", { name: "保存" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await act(async () => finishSave?.());
  });

  it("retries a failed provider catalog", async () => {
    const base = createMockModelSettingsAdapter();
    const listProviders = vi
      .fn<ModelSettingsAdapter["listProviders"]>()
      .mockRejectedValueOnce(new Error("目录暂不可用"))
      .mockImplementation((options) => base.listProviders(options));
    render(
      <ModelSettingsPanel adapter={{ ...base, listProviders }} onSave={vi.fn()} />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("目录暂不可用");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.getByLabelText("服务商")).toHaveTextContent("OpenAI Codex"));
    expect(listProviders).toHaveBeenCalledTimes(2);
  });

  it("shows an explicit empty provider state", async () => {
    const base = createMockModelSettingsAdapter();
    render(
      <ModelSettingsPanel
        adapter={{ ...base, listProviders: async () => [] }}
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findAllByText("没有支持此认证方式的服务商")).not.toHaveLength(0);
    expect(screen.getByLabelText("服务商")).toBeDisabled();
  });

  it("clears an invalid model when the provider changes", async () => {
    const user = userEvent.setup();
    const providers = [
      {
        id: "alpha",
        name: "Alpha",
        auth: { apiKey: { label: "Alpha key", interactive: true } },
      },
      {
        id: "beta",
        name: "Beta",
        auth: { apiKey: { label: "Beta key", interactive: true } },
      },
    ];
    const base = createMockModelSettingsAdapter();
    const adapter: ModelSettingsAdapter = {
      ...base,
      listProviders: async () => providers,
      listModels: async ({ providerId }) => [
        {
          id: `${providerId}-model`,
          providerId,
          name: `${providerId.toUpperCase()} Model`,
          input: ["text"],
          reasoning: false,
          contextWindow: 8_192,
          maxTokens: 2_048,
        },
      ],
    };
    render(<ModelSettingsPanel adapter={adapter} defaultMode="api-key" onSave={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("ALPHA Model"));
    await user.click(screen.getByLabelText("服务商"));
    await user.click(await screen.findByRole("option", { name: "Beta" }));
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveTextContent("BETA Model"));
    expect(screen.getByLabelText("模型")).not.toHaveTextContent("ALPHA Model");
  });
});

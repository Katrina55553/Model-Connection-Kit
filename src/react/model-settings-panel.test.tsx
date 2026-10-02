import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import type { ModelSettingsAdapter } from "../core/types";
import { ModelSettingsPanel } from "./model-settings-panel";

describe("ModelSettingsPanel", () => {
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
    const input = screen.getByLabelText("API Key");
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
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "private-key" } });
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

    const keyInput = await screen.findByLabelText("API Key");
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
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "local-secret" } });
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
    expect(onSave).toHaveBeenCalledOnce();
    finishSave?.();
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

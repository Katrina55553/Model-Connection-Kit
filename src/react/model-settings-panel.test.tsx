import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import type { ModelSettingsAdapter } from "../core/types";
import { ModelSettingsPanel } from "./model-settings-panel";

describe("ModelSettingsPanel", () => {
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
    await waitFor(() => expect(screen.getByLabelText("模型")).toHaveValue("gpt-text"));
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
});

import { render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import { ModelSettingsPanel } from "./model-settings-panel";
import { ModelSettingsDialog } from "./model-settings-dialog";

describe("model settings accessibility", () => {
  it.each(["subscription", "api-key", "custom"] as const)("has no detectable semantic accessibility violations in %s mode", async (defaultMode) => {
    render(<main><ModelSettingsPanel adapter={createMockModelSettingsAdapter()} defaultMode={defaultMode} onSave={vi.fn()} /></main>);
    if (defaultMode !== "custom") await waitFor(() => expect(screen.getByLabelText("模型")).toBeEnabled());
    const report = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  });

  it("has an accessible dialog name, description and no detectable semantic violations", async () => {
    render(<ModelSettingsDialog adapter={createMockModelSettingsAdapter()} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "选择模型服务" });
    expect(dialog).toHaveAccessibleDescription("配置认证方式并选择要使用的模型。");
    await waitFor(() => expect(screen.getByLabelText("模型")).toBeEnabled());
    const report = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations.map(({ id }) => id)).toEqual([]);
  });
});

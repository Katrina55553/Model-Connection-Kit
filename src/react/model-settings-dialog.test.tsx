import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import { ModelSettingsDialog } from "./model-settings-dialog";

describe("ModelSettingsDialog", () => {
  it("closes with Escape and keeps focus inside while open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ModelSettingsDialog
        adapter={createMockModelSettingsAdapter()}
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
        open
      />,
    );

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    for (let index = 0; index < 20; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let index = 0; index < 20; index += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("returns focus to the opener after closing", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">打开设置</button>
          <ModelSettingsDialog
            adapter={createMockModelSettingsAdapter()}
            onOpenChange={setOpen}
            onSave={vi.fn()}
            open={open}
          />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "打开设置" });
    await user.click(opener);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

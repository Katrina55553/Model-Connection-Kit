import { useState } from "react";
import {
  createMockModelSettingsAdapter,
  ModelSettingsDialog,
  ModelSettingsPanel,
  type ModelSelection,
} from "model-connection-kit";
import "model-connection-kit/styles.css";

const adapter = createMockModelSettingsAdapter();

export default function App() {
  const [saved, setSaved] = useState<ModelSelection | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <main>
      <ModelSettingsPanel adapter={adapter} value={saved} onSave={setSaved} />
      <button type="button" onClick={() => setOpen(true)}>打开设置</button>
      <ModelSettingsDialog
        adapter={adapter}
        value={saved}
        open={open}
        onOpenChange={setOpen}
        onSave={setSaved}
      />
      <pre>{saved ? JSON.stringify(saved, null, 2) : "尚未保存"}</pre>
    </main>
  );
}

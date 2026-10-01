import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMockModelSettingsAdapter } from "../adapters/mock";
import type { ModelSelection } from "../core/types";
import { ModelSettingsPanel } from "../react/model-settings-panel";
import "../react/styles.css";
import "./styles.css";

const adapter = createMockModelSettingsAdapter({
  delayMs: 350,
  failProbeFor: ["openai-codex"],
  initialAuth: {
    "openai-codex": { state: "configured", method: "oauth", source: "mock-store" },
  },
});

function Demo() {
  const [saved, setSaved] = useState<ModelSelection | null>(null);

  return (
    <main className="demo-shell">
      <ModelSettingsPanel adapter={adapter} onSave={setSaved} value={saved} />
      <aside>
        <h2>安全的保存结果</h2>
        <pre>{saved ? JSON.stringify(saved, null, 2) : "尚未保存"}</pre>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);

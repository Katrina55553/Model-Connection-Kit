import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelSettingsPanel, ModelSettingsDialog, createMockModelSettingsAdapter, normalizeBaseUrl } from "model-connection-kit";

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("@earendil-works/pi-ai"), { code: "MODULE_NOT_FOUND" });
assert.ok(import.meta.resolve("model-connection-kit/styles.css").endsWith("model-connection-kit.css"));
assert.equal(normalizeBaseUrl(" https://example.test/v1/ "), "https://example.test/v1/");
const adapter = createMockModelSettingsAdapter();
const html = renderToStaticMarkup(createElement(ModelSettingsPanel, { adapter, onSave() {} }));
assert.match(html, /选择模型服务/);
assert.match(html, /role="tabpanel"/);
assert.equal(renderToStaticMarkup(createElement(ModelSettingsDialog, { adapter, open: false, onOpenChange() {}, onSave() {} })), "");
assert.ok((await adapter.listProviders()).length > 0);
console.log("UI ESM/SSR/CSS smoke 通过，Pi AI 不可解析。");

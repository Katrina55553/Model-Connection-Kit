# Model Connection Kit

用于配置 AI 模型连接的 React 组件库：订阅/OAuth 登录、API Key 或宿主环境凭证，以及自定义 OpenAI-compatible 接口。UI 通过 `ModelSettingsAdapter` 接入运行时，不直接管理生产凭证。

当前版本为 **0.1.0 发布准备基线，尚未执行 npm 发布**。提供 ESM、TypeScript 声明和独立 CSS。真实浏览器颜色对比度、屏幕阅读器和生产 OAuth/云 API 仍需宿主验收。

## 安装

React / React DOM 要求 `>=18.2.0`。开发工具及 Pi AI Node/桌面宿主使用 Node.js `>=22.19.0`。

尚未发布时，在本仓库执行 `npm ci`、`npm pack`，将生成的 tarball 复制到消费者项目后安装：

```sh
npm install ./model-connection-kit-0.1.0.tgz react react-dom
```

发布后可使用 `npm install model-connection-kit react react-dom`。**只使用 UI 时无需安装 Pi AI**。样式必须显式导入 `model-connection-kit/styles.css`；ESM 不支持 `require()`。

## React 快速接入（不含 Pi AI）

在 Vite React 项目中使用下面的 `App.tsx`。Mock 仅用于演示，凭证只保留在内存中，探测也是模拟结果。

```tsx
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
```

`value` 用于恢复已保存配置；面板保留本地编辑草稿，**不是逐字段受控表单**。`onChange` 在保存时发出非秘密选择，随后调用可异步的 `onSave`；二者不要重复持久化。若需要替换整个编辑会话，请重新挂载 Panel（例如改变 `key`）。Dialog 的 `open` 完全受控，保存成功后请求关闭，失败时保留弹窗。

内置 API Key 输入需要先点击“连接”，提交成功即清空。自定义接口点击连接、测试或保存时都会先提交待输入密钥。测试结果与认证配置是独立状态，失败测试不会自动保存或改写已有选择。

## Pi AI Node / 桌面宿主

此入口为显式可选功能，已验证的 Pi AI 版本是 `0.99.2`；兼容 peer 范围为 `^0.99.2`。

```sh
npm install @earendil-works/pi-ai@0.99.2
```

```ts
import { createModels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createInitialPiAiProviders, createPiAiAdapter } from "model-connection-kit/pi-ai";

const credentials = new InMemoryCredentialStore(); // 演示；生产替换为宿主持久化存储
const models = createModels({ credentials });
for (const provider of await createInitialPiAiProviders()) models.setProvider(provider);
const adapter = createPiAiAdapter({ models, credentials }); // 必须是同一个 store
```

首批工厂包含 OpenAI、Anthropic、Google、OpenRouter、OpenAI Codex。将 `adapter` 传给桌面宿主中的组件；Web 应用则通过经过认证的后端/IPC 实现同一契约，不能将 Node store、共享密钥或 OAuth token 放入浏览器。

重启时先恢复凭证 store，并由非秘密自定义选择重建 provider。完整说明见 [Pi AI 接入](docs/PI_AI_ADAPTER.md) 和 [宿主初始化示例](examples/pi-ai-host.ts)。

## 自定义接口与安全

自定义协议固定为 `openai-completions`（Chat Completions），手动填写实际模型 ID 和 Base URL，如 `http://localhost:11434/v1`。组件不会自动添加 `/v1` 或删改路径尾部斜杠；密钥可选，价格未知不代表免费。

API Key 只经 `connect()` 单向提交，不进入 `ModelSelection`、`onChange` 或 `onSave`；OAuth token 由宿主管理。宿主仍须保护 store、日志、IPC 和 HTTP 传输。认证已配置不等于模型可调用；真实探测最多生成 1 token，默认 15 秒截止，无重试，可能计费，不写入用户会话。

URL 校验器 **不是 SSRF 防护器**。浏览器直连受 CORS 限制；后端代理需要目标 allowlist、公网 DNS 校验、地址固定、防重定向、认证与费用控制。见 [自定义接口与后端代理](examples/README.md)。

## API、主题与开发

- [组件、适配器与辅助函数 API](docs/API.md)
- [CSS 变量、主题与英文文案](docs/THEMING.md)
- [变更记录](CHANGELOG.md) · [版本策略与发布检查](docs/RELEASING.md)

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run test:integration
npm run verify:package
```

默认测试不调用云服务。显式集成测试仅调用临时本地 SSE 服务；包验证在仓库之外的系统临时目录中安装真实 tarball，检查声明、CSS、生产构建及不安装 Pi AI 的 UI 接入。tarball 保留在被忽略的 `.release-check/`，消费者路径会输出到控制台，均保留供排查；这些命令不会发布包。

## License

MIT

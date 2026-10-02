# 自定义接口与后端代理示例

## 桌面 / Node 宿主

自定义协议固定为 `openai-completions`（Chat Completions）。填入服务实际提供的 Base URL，例如本地服务的 `http://localhost:11434/v1` 或 `http://localhost:1234/v1`；组件不会添加 `/v1` 或删改路径尾部的 `/`。填写服务实际存在的模型 ID，不依赖 `/models` 目录。

`normalizeBaseUrl()` 使用标准 URL 解析，去除边界空白、规范化主机及默认端口，保留编码路径和尾部斜杠；拒绝非 HTTP(S)、内嵌凭证、查询参数和片段。它是配置校验器，**不是 SSRF 防护器**。桌面直连允许本地服务；公网服务建议只用 HTTPS。

组件提供显示名称、输入能力、reasoning、context window、max tokens 和可选价格。输出 token 上限不得大于 context window；价格单位是每百万 token，输入和输出价格须同时填写。价格未配置时，选择值不含 `cost`，UI 显示“价格未知”，Pi AI 内部计费字段的零值不代表免费。

```ts
import { InMemoryCredentialStore, createModels } from "@earendil-works/pi-ai";
import { createPiAiAdapter, createOpenAICompatibleProvider } from "model-connection-kit/pi-ai";
import type { ModelSelection } from "model-connection-kit";

const credentials = new InMemoryCredentialStore(); // 生产环境替换为宿主持久化 store
const models = createModels({ credentials });
const adapter = createPiAiAdapter({ models, credentials });

function restoreSelection(selection: ModelSelection) {
  if (selection.connectionType === "custom") {
    models.setProvider(createOpenAICompatibleProvider(selection));
  }
}
```

保存配置后，宿主在重新启动时从非秘密选择值重建 provider，并恢复同一个凭证 store。模型元数据变化时，探测会重新注册 provider，不会继续使用旧模型定义。

自定义 API Key 可选。输入密钥后点击连接、测试或保存，会先通过 `connect()` 单向提交，成功即清空输入；随后探测和保存均只接收非秘密配置。API Key 的认证方式在输入清空后仍保留。改变 Base URL 会清除待提交密钥、认证状态和探测结果，新建配置的 provider ID 绑定规范化 URL，以避免跨目标复用凭证。宿主自行提供的 provider ID 也必须保证目标隔离。

兼容默认值关闭 `store`、`developer` role、`reasoning_effort`、流式 usage 请求，并使用 `max_tokens`。无认证接口内部使用满足 Pi SDK 要求的占位值，但不会在 HTTP 请求中发送 Authorization header。探测最多生成 1 token，关闭 SDK 重试，不写入用户会话。

## 浏览器

演示页仅使用 Mock Adapter，不直接保存生产密钥。浏览器直连需要目标服务允许宿主 origin、所用请求头和 OPTIONS 预检。组件不能绕过 CORS。共享密钥和 Pi OAuth 应放在桌面进程或经过认证的后端服务中执行。

## 后端代理（Node 22.19+）

[backend-proxy.ts](./backend-proxy.ts) 是宿主侧参考实现，**不从包根入口导出，不是现成的开放 HTTP 代理**。

```ts
import { probeViaBackend } from "./backend-proxy";

// 只由服务器配置；不要从请求 body 获取 allowlist 或共享 API Key。
const policy = { allowedBaseUrls: ["https://models.your-company.example/v1"] };

await probeViaBackend(
  submittedBaseUrl,
  submittedModelId,
  policy,
  { apiKey: serverOwnedKey, signal: requestSignal },
);
```

安全约束：

- 精确匹配服务器 allowlist 的完整 Base URL，连路径也要匹配；不允许子域后缀或任意路径。
- 仅允许 HTTPS / 443；拒绝 URL 凭证、查询参数和片段。
- 检查所有 DNS A/AAAA 结果；任一非公网地址即拒绝，包含 loopback、私网、link-local、CGNAT、保留地址及 IPv4-mapped IPv6。
- IPv6 仅允许常规 global-unicast 范围，并排除文档和常见过渡地址；不支持的特殊范围失败关闭。
- 将检查过的 IP 固定给同一次 HTTPS 请求，仍使用原始域名验证 TLS 证书，不再次做可被重绑定的 DNS 查询。
- 不跟随任何重定向；只向固定的 `/chat/completions` 子路径发送固定最小请求，不转发调用者的 cookies、headers 或任意载荷。
- HTTP 请求 15 秒截止、响应体最多 1 MiB；不把上游响应或原始错误写入日志或传给 UI。

此函数只验证最小 HTTP 请求获得 2xx 响应，不解析模型回答。要对 Pi AI 提供严格的 `ProbeStatus`，宿主需验证上游响应格式；不要将单独的 HTTP 2xx 直接视为模型可调用。

接入路由仍须实现用户认证、授权、速率限制、请求体大小限制和费用控制，并对 DNS 解析设置宿主级截止时间。生产网络还应配置出口防火墙、可信 DNS 与维护中的 IP 策略；URL 校验不能代替网络隔离。不要通过放宽此公网代理的策略访问 Ollama/LM Studio，局域网服务应由单独、受信的桌面或内网连接器处理。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

默认测试不访问外部模型服务。显式集成测试启动临时本地 SSE 兼容服务，验证手动模型 ID、API 路径、1 token 上限、无认证 header 与兼容参数；它并不声称已在本机安装并测试 Ollama 或 LM Studio。

# 公共 API（0.1.0）

## 入口

| 导入路径 | 用途 |
| --- | --- |
| `model-connection-kit` | React 组件、Core 类型/校验器、Mock Adapter、中文/英文文案；不导入 Pi AI |
| `model-connection-kit/pi-ai` | Pi AI adapter、自定义 provider 工厂、首批 provider 工厂及 Pi 专用类型 |
| `model-connection-kit/styles.css` | 公共变量与组件样式；消费者需显式导入 |

仅支持 ESM。其他内部路径不属于公共导出，不能深层导入 `dist/react/*` 等文件。消费者建议使用 TypeScript `moduleResolution: "Bundler"` 或兼容 ESM 的 `NodeNext`。

## React 组件

`ModelSettingsPanel` 和 `ModelSettingsDialog` 使用相同的配置属性；Dialog 额外要求 `open` 和 `onOpenChange`。

| 属性 | 类型 / 默认 | 行为 |
| --- | --- | --- |
| `adapter` | `ModelSettingsAdapter`，必需 | 运行时边界；保持实例稳定，避免每次渲染重新创建 |
| `value` | `ModelSelection \| null`，可选 | 恢复已保存配置；不是逐字段受控值。要完整切换编辑会话请重新挂载 |
| `defaultMode` | `"subscription" \| "api-key" \| "custom"` | 初次挂载的标签；未提供时根据 value 推导，无 value 时为 subscription |
| `requiredCapabilities` | `readonly ("text" \| "image")[]` | 内置模型需满足全部要求；自定义模型输入能力也须满足 |
| `text` | `Partial<ModelSettingsText>` | 默认中文；可传 `enUSText` 或覆盖文案，`methods` 如提供需含三个键 |
| `onChange` | `(selection) => void`，可选 | 保存动作中先调用；不在每次编辑或探测时调用 |
| `onSave` | `(selection) => void \| Promise<void>`，必需 | 持久化非秘密配置；异步期间禁用重复保存，失败展示错误 |
| `onCancel` | `() => void`，可选 | 面板取消按钮回调；Dialog 取消按钮还请求关闭 |
| `footerStart` | `ReactNode`，可选 | 底部操作区自定义内容 |
| `className` | `string`，可选 | 附加在 Panel 上，可用于作用域主题 |
| `open` | `boolean`，Dialog 必需 | 受控显示状态；宿主必须响应关闭请求 |
| `onOpenChange` | `(open: boolean) => void`，Dialog 必需 | Escape、关闭按钮、取消或成功保存时请求关闭 |

在 `onSave` 中完成唯一一次持久化；若同时使用 `onChange`，它应只更新内存状态或观察选择。`onSave` 失败不会撤销先前 `onChange` 或宿主已经产生的副作用。关闭/切换会取消组件操作，但 `onSave` 本身没有 signal，宿主写入不自动回滚。

内置 API Key 先通过“连接”提交再保存；自定义待输入密钥在连接、测试、保存前均会提交。密钥输入非受控，不进入 React 选择值，成功后清空。认证 prompt 支持 text、secret、manual-code 和 select，可通过自己的 signal 被取消。

## 非秘密选择与状态

```ts
import type { ModelSelection } from "model-connection-kit";

const builtin: ModelSelection = {
  connectionType: "builtin",
  authMethod: "oauth", // 或 "api-key" / "ambient"
  providerId: "openai-codex",
  modelId: "host-catalog-model-id", // 使用当前目录实际存在的 ID
};

const custom: ModelSelection = {
  connectionType: "custom",
  authMethod: "none", // 或 "api-key"；凭证另存于宿主
  providerId: "local-ollama", // 宿主自定义 ID 必须隔离不同目标
  modelId: "installed-model-id",
  custom: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    displayName: "本地模型",
    model: {
      input: ["text"],
      reasoning: false,
      contextWindow: 8192,
      maxTokens: 2048,
      // cost 可省略；如提供，input/output 单位为每百万 token。
    },
  },
};
```

上述两个变量都不含 `apiKey`。模型 ID 只位于外层；`custom.model` 只描述元数据，不能重复 `modelId`。`ModelMetadata.cost` 可含 `input`、`output` 和可选 `cacheRead` / `cacheWrite`，缺省不代表免费。

`AuthStatus.state` 为 `configured | unconfigured | error`，可带非秘密 `method`、`source`、`message`；它描述认证配置，不保证模型可调用。`ProbeStatus.state` 为 `untested | testing | reachable | unreachable`，包含 `mayBeBillable` 及可选 `testedAt`、`message`；它是独立探测状态，不会自动保存选择。

## 自定义适配器

| 方法 | 职责 |
| --- | --- |
| `listProviders({ signal? }?)` | 返回 provider 目录及真实认证能力 |
| `listModels({ providerId, requiredCapabilities?, refresh?, signal? })` | 返回所选服务商的模型，满足全部能力；refresh 表示强制刷新请求 |
| `getAuthStatus(providerId, signal?)` | 返回非秘密配置状态与最新来源，不用模型探测代替 |
| `connect(request, { signal?, prompt?, onEvent? }?)` | 单向接收认证请求，按需与用户交互，返回 `{ providerId, auth }` |
| `testConnection(selection, { signal? }?)` | 发送最小真实请求，返回独立 ProbeStatus；不得写入用户会话 |
| `disconnect(providerId, signal?)` | 删除可删除的宿主凭证后重算状态；仍有 ambient 来源时可保持 configured |

所有方法返回 Promise。`ConnectionRequest` 区分内置 oauth、ambient、api-key 与自定义 none、api-key；只有 api-key 分支接收 `apiKey: string`。自定义分支另含 modelId/custom。

`ConnectOptions.prompt` 返回 `Promise<string>`。`AuthPrompt` 包含 `type`、`message`、可选 `signal`，文本类可含 placeholder，select 含 `{ id, label, description? }[]`。`onEvent` 接收 info/progress 消息、auth-url 或 device-code（验证 URL、用户码、可选到期秒数），不能携带 token。

适配器需响应 signal：拒绝 `DOMException(..., "AbortError")`，消费迟到 rejection，在取消/结束后停止事件和凭证写入。组件的状态隔离不能替代宿主网络/存储的取消协议。面板交互认证 60 秒超时；Pi 探测默认 15 秒。不要记录 request、prompt 答案或原始认证异常。

Provider 能力声明须准确：`auth.oauth.isSubscription` 控制订阅标签可见性，`auth.apiKey.interactive` 控制输入/登录；仅 ambient 的 provider 不会显示密钥输入。其他 OAuth 流程可通过 adapter 调用，当前面板订阅标签只列订阅型 OAuth。

## 辅助函数与 Mock

| 导出 | 行为 |
| --- | --- |
| `normalizeBaseUrl(string)` | 规范化 HTTP(S) URL，保留路径语义，拒绝凭证、查询和片段；不提供 SSRF 防护 |
| `validateModelId(string)` | 返回去边界空白后的 1–200 字符 ID，拒绝内部空白与控制字符 |
| `validateModelMetadata(model)` | 正整数 token 上限、合法输入能力、非负有限价格，返回已知字段副本 |
| `validateCustomEndpoint(config)` | 校验并规范化固定协议配置 |
| `normalizeProvider(s)` / `normalizeModel(s)` | 规范化必填 ID、显示名与目录；复数函数去重，不用于替代自定义元数据校验 |
| `filterModelsByCapabilities(models, required?)` | 全部能力匹配，空要求返回新数组 |
| `redactSensitiveText(text, secrets?)` | 移除常见敏感模式和显式已知秘密；不是未知敏感值的通用检测器 |
| `AdapterError` / `isAdapterError` | 可处理类别：validation、auth、oauth、capability、network、catalog、policy、unknown |
| `createMockModelSettingsAdapter(options?)` | 内存演示，支持 delayMs、failProbeFor、requireOAuthPrompt、initialAuth；不是生产认证或真实探测 |

Core 还导出以上方法使用的类型，例如 `ProviderSummary`、`ModelSummary`、`AuthPrompt`、`AuthEvent`、`ConnectOptions`、`ModelCost`；React 类型为 `ModelSettingsPanelProps`、`ModelSettingsDialogProps`、`ModelSettingsText`、`ModelSettingsMode`。

## Pi 专用入口

`createPiAiAdapter({ models, credentials, loginOptions?, probePrompt?, probeTimeoutMs?, apiKeyFallbackProviderIds? })` 使用宿主提供的 Models 与同一个 CredentialStore。默认探测提示词为 `Respond with OK.`，最多生成 1 token；不要把用户数据放进 probePrompt。

返回的 `PiAiAdapter` 另有 `refresh({ providerIds?, force?, allowNetwork?, signal? }?)`（返回非秘密 errors map）和 `resolveAuthStatus(providerId, signal?)`（可刷新 OAuth，但只返回状态）。`createOpenAICompatibleProvider(customSelection)` 从保存配置重建静态 provider；`createInitialPiAiProviders()` 显式加载五个首批 provider，`initialPiAiProviderIds` 是对应只读 ID 列表。

Pi 专用类型包括 `CustomModelSelection`、`PiAiModels`、`PiAiAdapterOptions`、`PiAiAdapter`、`PiAiRefreshOptions`、`PiAiRefreshResult`。认证来源、后备密钥名单及安全限制见 [Pi AI 接入说明](PI_AI_ADAPTER.md)。

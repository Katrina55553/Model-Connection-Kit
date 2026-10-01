# Model Connection Kit 开发文档

## 1. 项目目标

Model Connection Kit 是一个可嵌入 React 应用的模型连接配置组件库。它提供统一的模型服务商、认证方式和模型选择界面，并通过适配器隔离具体 AI 运行时。

首个正式适配器面向 `@earendil-works/pi-ai`，但 React 组件不直接依赖 Pi AI，因此宿主也可以接入自己的后端 API、桌面端凭证服务或其他模型运行时。

第一版支持三种连接方式：

1. 订阅登录：OAuth、设备码或其他交互式授权。
2. API Key：提交密钥，由宿主或适配器安全持久化。
3. 自定义接口：配置 OpenAI 兼容的 Base URL、API Key 和模型 ID。

## 2. 非目标

第一版不负责：

- 实现聊天、流式生成或工具调用界面。
- 在 React 组件状态或保存回调中暴露 API Key、OAuth Token。
- 为浏览器应用直接托管生产密钥。
- 一次性集成 Pi AI 的全部 provider。
- 管理计费、用量统计或模型调用历史。

## 3. 技术栈

- TypeScript：公共接口与适配器契约。
- React：可复用设置面板和对话框。
- Vite library mode：ESM 构建、样式产物和演示页。
- Radix UI Primitives：Dialog、Tabs、Select 等无障碍交互基础。
- CSS Modules + CSS 变量：样式隔离与宿主主题覆盖。
- Vitest + Testing Library：核心逻辑和组件交互测试。
- `@earendil-works/pi-ai`：可选 peer dependency，只从 `model-connection-kit/pi-ai` 入口引入。

运行 Pi AI `0.99.2` 需要 Node.js `>=22.19.0`。开发环境使用 Node.js 24，满足要求。该限制只约束 Pi AI 适配器的运行端和本项目的开发工具；纯 UI/Core 包不得声明为 Node-only，也不得在根入口引入 Node API。

## 4. 包边界

```text
model-connection-kit
├─ src/core/             类型、过滤规则、状态逻辑
├─ src/react/            React 组件与样式
├─ src/adapters/pi-ai/   Pi AI 适配器
├─ src/demo/             浏览器演示，仅使用 mock adapter
├─ src/index.ts          UI 和核心类型入口
└─ src/pi-ai.ts          Pi AI 可选入口
```

发布入口：

```ts
import { ModelSettingsDialog } from "model-connection-kit";
import "model-connection-kit/styles.css";

// 只有使用 Pi AI 的宿主才需要这个入口。
import { createPiAiAdapter } from "model-connection-kit/pi-ai";
```

这样，不使用 Pi AI 的消费者不会因为 UI 组件而引入其 provider、SDK 或 Node 端认证代码。

## 5. 安全边界

### 组件可以持有的数据

- 当前连接类型与认证方式。
- provider ID 和 model ID。
- 自定义接口 Base URL。
- “认证已配置/未配置”和“已验证可调用/未验证”等非秘密状态。
- 用户尚未提交的 API Key，只保存在局部临时状态中。

### 组件不能输出或持久化的数据

- API Key。
- OAuth access token、refresh token。
- 包含秘密的认证响应或错误日志。

`onChange` 和 `onSave` 只返回可序列化的 `ModelSelection`。密钥通过 `adapter.connect()` 单向提交；请求完成后，组件应立即清空密钥输入。

### 宿主责任

- 桌面/Node 应用：向 Pi AI 注入持久化 `CredentialStore`。
- Web 应用：通过后端代理执行认证和模型请求；生产环境不得把共享 API Key 放进浏览器。
- OAuth：Pi AI 的 OAuth 登录流程只在 Node 环境运行。浏览器组件负责展示授权事件，实际登录由后端或桌面宿主完成。
- 自定义接口代理：后端必须限制协议、主机、端口、重定向和内网地址，不能直接请求任意用户输入的 URL，以免形成 SSRF 通道。
- 浏览器直连：自定义服务必须正确配置 CORS；组件不能绕过浏览器同源策略。

## 6. 公共领域模型

### 6.1 术语

- `connectionType` 描述目录来源：内置 provider 或自定义接口。
- `authMethod` 描述认证方式：OAuth、API Key、ambient credential 或无认证。
- “订阅登录”是界面文案，不是底层认证类型。它映射到带有 `isSubscription` 元数据的 OAuth provider。
- `configured` 只表示认证配置完整；`reachable` 才表示最近一次真实模型调用成功。

### 6.2 非秘密配置

```ts
type ModelSelection =
  | {
      connectionType: "builtin";
      authMethod: "oauth" | "api-key" | "ambient";
      providerId: string;
      modelId: string;
    }
  | {
      connectionType: "custom";
      authMethod: "api-key" | "none";
      providerId: string;
      modelId: string;
      custom: {
        baseUrl: string;
        api: "openai-completions";
        displayName?: string;
        model: {
          input: readonly ("text" | "image")[];
          reasoning: boolean;
          contextWindow: number;
          maxTokens: number;
          cost?: {
            input: number;
            output: number;
            cacheRead?: number;
            cacheWrite?: number;
          };
        };
      };
    };
```

`modelId` 只允许出现在顶层。`custom.model` 保存重建 Pi 模型定义所需的非秘密元数据；缺少上游价格信息时，UI 必须显示“价格未知”，不能把内部使用的零值解释成免费。

### 6.3 Provider 认证能力

```ts
interface ProviderSummary {
  id: string;
  name: string;
  auth: {
    oauth?: {
      label?: string;
      isSubscription?: boolean;
    };
    apiKey?: {
      label: string;
      interactive: boolean;
    };
    ambient?: boolean;
  };
}
```

适配器必须从 provider 的实际能力生成此结构，不能假设所有 provider 都同时支持 OAuth 和交互式 API Key 登录。`interactive: false` 表示 provider 只能通过环境变量、ADC、AWS Profile 等宿主环境完成配置。

### 6.4 授权交互契约

Core 包定义与具体运行时无关的交互类型，Pi adapter 负责映射到 Pi AI 的 `AuthPrompt`、`AuthEvent` 和 `AuthInteraction`。

```ts
type AuthPrompt =
  | { type: "text" | "secret" | "manual-code"; message: string; placeholder?: string; signal?: AbortSignal }
  | { type: "select"; message: string; options: readonly { id: string; label: string; description?: string }[]; signal?: AbortSignal };

type AuthEvent =
  | { type: "info" | "progress"; message: string }
  | { type: "auth-url"; url: string; instructions?: string }
  | { type: "device-code"; userCode: string; verificationUri: string; expiresInSeconds?: number };

interface ConnectOptions {
  signal?: AbortSignal;
  prompt?: (prompt: AuthPrompt) => Promise<string>;
  onEvent?: (event: AuthEvent) => void;
}
```

需要 prompt 的认证流程在未提供 handler 时必须返回明确的能力错误。任何 `secret` prompt 的输入都不得进入事件、诊断日志或选择值。

### 6.5 认证状态与连通性状态

```ts
interface AuthStatus {
  state: "configured" | "unconfigured" | "error";
  method?: "oauth" | "api-key" | "ambient" | "none";
  source?: string;
  message?: string;
}

interface ProbeStatus {
  state: "untested" | "testing" | "reachable" | "unreachable";
  testedAt?: number;
  message?: string;
  mayBeBillable: boolean;
}
```

`getAuthStatus()` 可以使用 Pi AI 的 `checkAuth()` 或 `getAuth()`，但不得把结果描述为“模型可用”。`testConnection()` 必须发起一次可取消的最小真实模型请求，因此可能产生少量费用。UI 必须在用户触发测试前明确提示这一点。

### 6.6 适配器能力

```ts
interface ModelSettingsAdapter {
  listProviders(options?): Promise<ProviderSummary[]>;
  listModels(options): Promise<ModelSummary[]>;
  getAuthStatus(providerId, signal?): Promise<AuthStatus>;
  connect(request, options?: ConnectOptions): Promise<{ providerId: string; auth: AuthStatus }>;
  testConnection(request, options?: { signal?: AbortSignal }): Promise<ProbeStatus>;
  disconnect(providerId, signal?: AbortSignal): Promise<AuthStatus>;
}
```

UI 只依赖此接口。Pi AI、后端 HTTP API 和测试替身都实现同一个契约。

### 6.7 Pi AI 凭证写入契约

Pi AI 的 `Models` 实例不会公开内部 `CredentialStore`。创建 Pi adapter 时，宿主必须把同一个 store 同时传给 `createModels()` 和 `createPiAiAdapter()`：

```ts
const credentials = createCredentialStore();
const models = createModels({ credentials });
const adapter = createPiAiAdapter({ models, credentials });
```

- provider 提供对应 `login` 方法时，adapter 调用 `models.login()`，由 Pi AI 完成交互和持久化。
- API Key provider 没有交互式 `login` 方法时，adapter 通过注入的 `CredentialStore.modify()` 保存标准 API Key credential。
- ambient-only provider 不显示 API Key 输入框，只展示其认证来源和配置指引。
- `models.logout()` 只删除 store 中的凭证；如果环境变量或其他 ambient source 仍存在，`disconnect()` 返回的状态仍可能是 `configured`，UI 必须显示最新 `source`。

## 7. 用户流程

### 7.1 订阅登录

1. 用户切换到“订阅登录”。
2. 组件加载声明了 OAuth 且标记为订阅认证的 provider。
3. 用户选择 provider 并点击“连接”。
4. 组件通过 `ConnectOptions.prompt` 响应文本、选择或手动验证码，通过 `onEvent` 接收授权 URL、设备码和进度。
5. 组件展示授权交互，但不接收或保存 token。
6. 授权完成后刷新认证状态和模型列表。
7. 用户选择模型并保存非秘密配置。

### 7.2 API Key

1. 用户选择 provider 和模型。
2. 用户输入 API Key。
3. 点击“测试连接”前提示该操作会发起真实模型请求，可能产生少量费用；密钥仅传入 `testConnection()`。
4. 点击“保存”时，密钥传入 `connect()`，由适配器持久化。
5. 成功后清空密钥输入，再调用 `onSave(selection)`。
6. 对 ambient-only provider 不显示 API Key 输入框，只显示配置来源与宿主环境指引。

### 7.3 自定义接口

1. 用户填写 Base URL、API Key、模型 ID 和必要的模型元数据。
2. 组件规范化 Base URL，但不擅自修改用户路径语义。
3. 适配器创建 OpenAI-compatible provider 和模型描述。
4. 浏览器直连时先说明 CORS 要求；后端代理模式对目标地址执行 SSRF 防护。
5. “测试连接”通过最小真实请求验证认证和模型可用性，并提示可能产生费用。
6. 保存时输出 Base URL、协议、provider ID、模型 ID 和非秘密模型元数据，不输出 API Key。

## 8. 分阶段实施计划

每个阶段都必须独立通过验收后再进入下一阶段，避免 UI、认证和运行时集成同时变化。

### 阶段 0：确认约束与基线

任务：

- 固定项目名、包名和最低 React/Node 版本。
- 确认首批内置 provider 范围。
- 确认首个真实宿主是桌面端、Node 服务还是 Web 应用。
- 记录 Pi AI 版本并核对其类型接口。

产物：本开发文档、依赖版本表。

完成标准：不存在会改变公共 API 或安全边界的未决问题。

### 阶段 1：项目脚手架

任务：

- 安装 React、Radix、Vite、TypeScript、Vitest 和 Pi AI 开发依赖。
- 完成 library mode 双入口构建。
- 配置类型声明、CSS 产物和 package exports。
- 添加 `dev`、`build`、`typecheck`、`test` 脚本。

验收：

- `npm run typecheck` 通过。
- `npm run build` 生成 `dist/index.js`、`dist/pi-ai.js`、声明文件和独立 CSS。
- 根入口不静态打包 Pi AI。

### 阶段 2：核心类型与纯逻辑

任务：

- 使用判别联合完成 `ModelSelection`，分离 `connectionType` 与 `authMethod`，消除重复的 `modelId`。
- 完成 `ConnectionRequest`、`ProviderSummary`、`AuthPrompt`、`AuthEvent` 和 `ModelSettingsAdapter` 等公共类型。
- 实现 provider/model 归一化与能力过滤。
- 定义 AbortSignal、错误、`AuthStatus` 和 `ProbeStatus` 语义。
- 确保秘密不出现在选择值和回调类型中。

验收：

- 单元测试覆盖无过滤、单能力、多能力和空目录。
- TypeScript 编译期测试证明 `ModelSelection` 不能包含 API Key。
- 类型测试证明 custom selection 不能出现两个 `modelId`，且内置、自定义配置不能非法混用。

### 阶段 3：Mock Adapter 与最小 UI

任务：

- 实现内存 mock adapter，提供含文本模型和视觉模型的 provider 数据。
- 模拟授权 prompt、授权事件、真实探测语义、成功/失败、延迟和取消。
- 实现最小设置面板：连接类型、认证方式、provider、model、测试与保存。

验收：

- 不接入 Pi AI 也能完整演示三种连接流程。
- 中止请求后不会继续更新组件状态。
- mock 能分别呈现“认证已配置但探测失败”和“认证未配置”状态。
- UI 回调中不存在 API Key 或 OAuth token。

### 阶段 4：端到端 tracer bullet

在扩展完整 UI 和大量 provider 前，先打通一条最窄的真实链路：mock 全流程、一个真实 Pi AI provider、一个自定义 OpenAI-compatible endpoint。

任务：

- 实现 Pi adapter 最小子集：provider/model 读取、一个 API Key provider、认证状态和真实探测。
- 接受宿主创建的 Pi `Models` 以及同一个 `CredentialStore`。
- 实现最小 `createOpenAICompatibleProvider()`，固定使用 `openai-completions`。
- 用测试凭证或本地兼容服务器执行一次手工集成验证；真实网络调用不进入默认测试。

验收：

- 同一 UI 可以无改动地切换 mock adapter 和 Pi adapter。
- 一个真实 provider 可以读取模型、保存凭证、解析来源并完成最小真实调用。
- 一个本地 OpenAI-compatible 服务可以通过手动模型 ID 连接。
- 根入口 bundle 不包含 Pi AI，纯 UI 仍可在浏览器构建。

### 阶段 5：完整设置面板

任务：

- 完成 Tabs、provider Select、model Select、认证状态、探测状态和底部操作区。
- 实现 `ModelSettingsPanel` 与 `ModelSettingsDialog`。
- 使用 CSS Modules 和公开 CSS 变量复刻参考图的视觉层级。
- 支持受控弹窗、键盘导航、焦点回收和屏幕阅读器标签。
- 完成加载、空目录、错误、重试和提交中禁用状态。

验收：

- 三种界面流程可切换，provider 变化后失效的 model 选择会被清理。
- UI 不使用模糊的“已连接”同时表达认证配置和真实可调用性。
- Dialog 可通过 Escape 关闭，Tab 焦点不会离开弹窗。
- 快速重复点击不会产生并发保存或乱序状态覆盖。

### 阶段 6：完整认证流程

任务：

- 根据 provider 的真实能力呈现 OAuth、交互式 API Key 或 ambient 配置指引。
- API Key 成功提交后清空局部密钥状态；测试按钮旁说明真实探测可能产生少量费用。
- 通过 `ConnectOptions.onEvent` 展示授权 URL、设备码和进度事件。
- 通过 `ConnectOptions.prompt` 处理文本、选项、密钥或手动验证码，并支持 prompt 自身被取消。
- 支持取消、超时、重新登录与 logout 后状态重算。

验收：

- 密钥不会进入 `onChange`、`onSave`、DOM 属性、日志或错误文本。
- 测试失败不会覆盖原有已保存选择。
- ambient-only provider 不会错误调用 `models.login(providerId, "api_key", ...)`。
- UI 不接收或显示 OAuth token；关闭弹窗会取消尚未完成的授权流程。
- 未提供 prompt handler 时，交互式认证返回明确的能力错误，而不是挂起。
- 环境变量仍存在时，logout 后显示 `configured` 及最新凭证来源。

### 阶段 7：自定义接口完整化与安全加固

任务：

- 添加 Base URL、模型 ID、显示名称、协议、输入能力、reasoning、context window、max tokens、可选价格和可选 API Key。
- 实现 URL、模型 ID 和模型元数据校验。
- 完成 `createOpenAICompatibleProvider()` 和常见兼容开关的安全默认值。
- 浏览器模式说明 CORS 要求；后端示例实现协议、域名、端口、重定向和私网地址限制。

验收：

- 可连接 Ollama、LM Studio 或兼容测试服务器。
- 自定义 API Key 不出现在保存结果中，无模型目录的接口仍可通过手动模型 ID 使用。
- 价格未知时不会在 UI 中显示为免费。
- 后端代理拒绝 loopback、link-local、私网和不受允许的目标地址。

### 阶段 8：Pi AI 适配器完整化与 provider 扩展

任务：

- 映射 `getProviders()`、`getModels()`、`refresh()`、`getAuth()`、`checkAuth()` 和 `logout()`。
- 根据 `provider.auth` 生成真实认证能力，区分 OAuth、交互式 API Key 与 ambient-only。
- 仅当 provider 对应认证对象存在 `login` 时调用 `models.login()`；标准 API Key 的后备持久化通过注入的 `CredentialStore.modify()` 完成。
- 将 Core 的 `prompt`/`onEvent` 映射到 Pi AI `AuthInteraction`。
- 使用 `checkAuth()` 表示“配置完整”，使用最小真实模型请求实现 `testConnection()`。
- 映射模型输入能力，并支持静态及动态模型目录。
- 在 tracer bullet 稳定后再逐个加入首批 provider。

验收：

- 静态目录可直接读取，动态目录可取消地刷新并正确报告局部错误。
- API Key 与 OAuth 凭证由注入的同一个 `CredentialStore` 管理。
- API Key provider 没有 `login` 方法时仍可按契约保存；ambient-only provider 不提供错误的输入界面。
- `testConnection()` 可取消、标记为可能计费，并且不会把测试 prompt 或响应写入用户会话。
- 从根入口构建的 bundle 不包含 Pi AI。

### 阶段 9：集成与回归测试

任务：

- 为公共组件编写 Testing Library 测试。
- 为 Pi adapter 编写 fake Models 契约测试。
- 覆盖竞态：切换 tab、快速切换 provider、关闭弹窗、中止请求和 prompt 被外部事件取消。
- 执行无障碍检查和键盘操作检查。
- 增加凭证来源、logout 后 ambient fallback、真实探测失败和 SSRF URL 校验测试。

验收：

- `npm test`、`npm run typecheck`、`npm run build` 全部通过。
- 无 React act 警告、未处理 Promise 或控制台错误。

### 阶段 10：文档与发布准备

任务：

- 完成 README、API 示例、Pi AI 接入示例和后端代理说明。
- 添加 CSS 变量清单和主题示例。
- 检查 package tarball 内容与导出路径。
- 建立 changelog 和语义化版本策略。

验收：

- 在一个全新 React 示例项目中仅按 README 即可接入。
- `npm pack --dry-run` 只包含必要文件。
- 消费者可只使用 UI 入口而不安装 Pi AI。

## 9. 测试矩阵

| 层级 | 重点 | 工具 |
| --- | --- | --- |
| Core | 判别联合、认证能力、过滤、归一化、URL 与模型元数据校验 | Vitest + TypeScript |
| Adapter | Pi 方法映射、prompt/event、凭证来源、ambient fallback、取消 | Vitest + fake Models/store |
| Component | 选择、认证配置、真实探测提示、保存、竞态 | Testing Library |
| Accessibility | 标签、焦点、键盘、Dialog 语义 | Testing Library + 手工检查 |
| Build | exports、tree shaking、CSS、声明文件 | Vite + TypeScript |
| Security | 密钥泄露防护、日志脱敏、SSRF URL 策略 | Vitest + 安全用例 |
| Integration | 一个真实 provider、自定义兼容服务与持久化凭证 | Node 手工/显式集成测试 |

真实网络调用不得进入默认测试套件，以免泄露凭证或造成不稳定结果。

## 10. 错误处理约定

适配器应把运行时错误转成用户可处理的错误类别：

- `validation`：表单或自定义接口配置错误。
- `auth`：API Key 缺失、无效或权限不足。
- `oauth`：登录取消、超时或 token 刷新失败。
- `capability`：provider 不支持请求的登录方式或宿主没有提供所需 prompt handler。
- `network`：无法访问 provider 或代理。
- `catalog`：模型目录加载失败。
- `policy`：自定义目标地址被 CORS 或后端 SSRF 策略拒绝。
- `unknown`：未识别错误。

界面展示短消息；原始错误可交给宿主的可选诊断回调，但必须先移除密钥、Authorization header 和 token。

## 11. CSS 主题契约

组件至少公开以下变量：

```css
:root {
  --mck-color-accent: #8f83e8;
  --mck-color-text: #262431;
  --mck-color-muted: #817f8c;
  --mck-color-border: #e9e7ef;
  --mck-color-surface: #ffffff;
  --mck-color-soft: #f7f5ff;
  --mck-radius-panel: 24px;
  --mck-radius-control: 12px;
  --mck-shadow-dialog: 0 24px 80px rgb(28 24 50 / 18%);
}
```

变量名属于公共 API，发布后不能在小版本中随意改名。

## 12. 当前仓库状态

已完成：

- 阶段 0 基线决策。
- 阶段 1 项目脚手架：依赖与 lockfile、Vite/TypeScript/Vitest 配置、双入口构建、声明文件和独立 CSS 产物。
- 阶段 2 核心类型与纯逻辑：判别联合、适配器契约、认证/探测状态、错误分类、目录归一化和能力过滤。
- 编译期类型测试保证选择值不包含 API Key、重复 `modelId` 或内置/自定义混合配置。

尚未完成：

- React 组件、样式、mock adapter、Pi AI adapter 和演示页。
- 阶段 3 之后的组件、适配器和回归验证。

阶段 0 至阶段 2 已完成；下一步执行阶段 3，不跳阶段。

## 13. 阶段 0 基线决策

以下决策于 2026-10-02 确认，作为第一版实现基线：

1. npm 包名固定为 `model-connection-kit`。
2. 首批内置 provider 限定为 OpenAI、Anthropic、Google、OpenRouter 和 OpenAI Codex。
3. 第一个真实接入宿主为桌面/Node 应用；浏览器演示只使用 mock adapter，不直接承载 Pi AI OAuth 或生产凭证。
4. 中文为默认文案，英文作为首个可选文案包。
5. 真实连通性探测使用不包含用户数据的最小提示词，最多生成 1 token，默认 15 秒超时。触发前显示“测试将发送最小请求，可能产生少量费用”。
6. 后端代理由宿主实现；组件库提供 URL 校验器和 allowlist 参考实现，不默认允许任意目标地址。

这些选择不会改变“UI 依赖 adapter、秘密由宿主管理”的总体架构。若后续更换首个宿主或扩大 provider 范围，应先评估公共 API、安全边界和演示内容。

### 13.1 版本基线

| 项目 | 版本约束 | 说明 |
| --- | --- | --- |
| Node.js | `>=22.19.0` | Pi AI 适配器和本项目开发工具；当前开发环境为 Node.js 24 |
| React / React DOM | `>=18.2.0` | 公共 UI peer dependency，不限制宿主使用 React 19 |
| TypeScript | `>=5.7.0` | 严格模式与声明文件构建 |
| Vite | `>=6.0.0` | library mode 双入口构建和演示页 |
| Vitest | `>=2.1.0` | Core、Adapter 和组件测试 |
| Radix UI | 当前稳定版 | Dialog、Tabs、Select 等无障碍 primitives；由 lockfile 固定安装结果 |
| `@earendil-works/pi-ai` | `0.99.2` | 可选 peer dependency；只允许从 `model-connection-kit/pi-ai` 入口引入 |

阶段 1 安装依赖后，以 `package-lock.json` 固定直接和传递依赖；升级 Pi AI 前必须重新核对认证、凭证存储和模型调用接口。

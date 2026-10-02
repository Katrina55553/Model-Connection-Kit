# Pi AI 适配器接入（0.99.2）

适配器只从 `model-connection-kit/pi-ai` 入口引入。UI 根入口不依赖 Pi AI，浏览器演示仍使用 Mock Adapter。首个运行宿主是 Node/桌面进程；Web 宿主需用后端实现 `ModelSettingsAdapter`，不能把 store 或 OAuth token 传到 React。

## 初始化

```ts
import { createModels } from "@earendil-works/pi-ai";
import { createInitialPiAiProviders, createPiAiAdapter } from "model-connection-kit/pi-ai";

const models = createModels({ credentials: hostCredentialStore });
for (const provider of await createInitialPiAiProviders()) models.setProvider(provider);
const adapter = createPiAiAdapter({
  models,
  credentials: hostCredentialStore, // 必须与 createModels 使用同一个实例
  loginOptions: { getDeviceId: () => hostInstallationId }, // 按需传递稳定的安装 ID
});
```

工厂显式加载 OpenAI、Anthropic、Google、OpenRouter、OpenAI Codex 五个 provider，不自动创建 store，不发起登录或模型请求。宿主也可自行注册其他 provider；适配器不会伪造其认证能力。

参见可类型检查的 [宿主初始化示例](../examples/pi-ai-host.ts)。自定义选择值在重启时需重建 provider，持久化凭证由宿主 store 恢复。

## 目录与刷新

- `listProviders()` 映射实际 `provider.auth`，经过归一化和去重。只有具备 OAuth `login` 的 provider 才声明 OAuth 能力。
- `listModels()` 直接读取所选 provider，避免 Pi 的 best-effort `Models.getModels()` 把目录异常隐藏为空列表。静态目录不刷新，不解析请求凭证，不联网。
- 动态 provider 的 `refreshModels` 存在时，先调用 `Models.refresh({ providers: [id], signal })` 再读取目录。`listModels({ providerId, refresh: true })` 强制刷新；UI 重试会传该标记。
- 只把当前 provider 的局部错误转为 `catalog` 错误，不影响其他服务商。模型按全部所需输入能力过滤。
- Pi 专用 `adapter.refresh({ providerIds?, force?, allowNetwork?, signal? })` 返回非秘密 `errors: ReadonlyMap<string, AdapterError>`。`allowNetwork: false` 用于恢复缓存；它不会验证连通性。
- 刷新中止时拒绝为 `AbortError`，不把取消显示为目录错误。实际 Pi `Models` 负责事务性发布，阻止已取消刷新覆盖新目录。宿主替身也必须遵守此约定。

## 认证与真实探测

`getAuthStatus()` 使用 `checkAuth()` 检查配置完整性，**不刷新 OAuth、不调用模型**。方法依据 store 的非秘密凭证清单区分 `api-key` 与 `ambient`，返回最新 `source`。刚登录的 OAuth 只返回配置状态，不表示模型请求已成功。

Pi 专用 `resolveAuthStatus()` 使用 `getAuth()` 解析请求认证并按需刷新 OAuth，但只返回非秘密 `AuthStatus`，不返回 apiKey、auth、headers、env 或 token。OAuth 刷新失败返回状态错误，不删除原凭证，也不会静默退到环境凭证；重新登录或退出需由用户主动触发。

API Key 登录优先走 provider 的真实 `login`，提交值填入首次 `secret` prompt，后续文本/选项/密钥步骤交给宿主 handler。没有 `login` 的 provider 默认视为 ambient-only；只有显式标准密钥后备名单内的 provider 才允许 `CredentialStore.modify()` 写入。默认名单为 OpenAI、Anthropic、Google、OpenRouter；扩展名单前须确认 provider 接受标准 `{ type: "api_key", key }`，不要把 AWS/ADC 等环境认证 provider 加进去。

`connect()` 映射 text/secret/select/manual-code prompt 与 auth-url/device-code/info/progress 事件；prompt 自身的 signal 和整次登录的 signal 都有效。缺少必要 handler 返回 `capability` 错误，取消不写入凭证。事件文本会移除已知秘密，认证完成/取消后不再发送迟到事件。秘密仅用于此次交互，不进入返回值或原始 error cause。

`disconnect()` 调用 `logout()` 删除 store 凭证，然后重新 `checkAuth()`。环境变量或 ADC 等来源仍存在时，结果仍是 `configured` / `ambient` 并展示新来源；不能显示成“彻底退出所有凭证来源”。

`testConnection()` 先解析请求认证，再发起独立的最小真实请求，默认提示词 `Respond with OK.`、最多 1 token、15 秒截止、无 SDK 重试。未找到模型或认证解析失败时不发送模型请求，`mayBeBillable: false`；已提交模型请求时标记可能计费。探测结果不会替换认证状态，也不写入用户会话。

所有异步边界支持及时取消，即便宿主替身不及时响应 signal 也不会挂住调用方，迟到 rejection 会被消费。**取消等待不等于回滚**：真实网络/凭证操作必须由注入的 Models/store 配合 signal 停止；已经持久化的凭证或已经计费的请求不会自动撤销。不要忽略宿主侧取消协议。

## 错误与验证边界

Pi 错误映射为 auth/oauth/catalog/network/capability 等可处理类别。消息固定且不附带原始 cause、上游响应或凭证；宿主不应另行打印原始登录/请求错误。

默认测试通过真实 Pi Models + 内存 store 验证五个 provider 的静态目录、四个标准密钥登录、动态目录事务、OAuth 交互/刷新、退出后的 ambient fallback 与非协作运行时取消。显式集成测试调用本地 SSE 兼容服务器；没有使用真实云端凭证，不声称已完成五家生产 API 或 OAuth 的现场授权测试。

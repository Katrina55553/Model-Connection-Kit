# 集成与回归验证

## 本地验收命令

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:integration
```

默认测试不调用云服务或使用生产凭证。显式集成测试启动本地 OpenAI-compatible SSE 服务，通过真实 Pi AI 运行时验证有密钥和无密钥请求、API 路径、认证 header 和最多 1 token 的探测。

## 回归范围

| 测试位置 | 覆盖 |
| --- | --- |
| `src/react/model-settings-panel.test.tsx` | 三种配置流程、单向密钥提交、脱敏、失败状态、空目录、重试和重复保存 |
| `src/react/model-settings-regression.test.tsx` | 保存模型恢复、等价 props 保留草稿、快速切换 provider 的乱序响应、切换 tab 取消授权、旧探测与迟到事件隔离、独立认证检查、外部 prompt 取消、关闭弹窗取消 prompt、超时重试、旧保存不关闭新弹窗 |
| `src/react/model-settings-dialog.test.tsx` | Escape、反复 Tab/Shift+Tab 的焦点陷阱、关闭后的焦点回收 |
| `src/react/model-settings-accessibility.test.tsx` | 三种 tabpanel 的关联标签、Dialog 名称与描述、axe-core 语义检查 |
| `src/react/theme-contrast.test.ts` | 默认与示例亮暗主题的普通文字 WCAG AA 对比度、主按钮语义色使用 |
| `src/adapters/pi-ai/pi-ai-adapter.test.ts`、`pi-ai-contract.test.ts`、`operation.test.ts` | fake/真实 Models 契约、凭证来源、logout 后 ambient fallback、交互能力、prompt/event、动态目录、取消、探测失败与截止时间 |
| `src/core/backend-proxy.test.ts`、`backend-proxy-transport.test.ts`、`validate-custom-endpoint.test.ts` | URL 与元数据校验、精确 allowlist、公网 DNS 校验、地址固定、拒绝重定向和私网目标 |

键盘回归还验证方向键切换标签、Enter/方向键选择模型、Escape 取消选择，以及授权 prompt 自动聚焦后通过键盘完成。

`src/test/setup.ts` 在每项测试后检查 `console.error` 和 `console.warn`，不屏蔽输出；React act 警告也会导致失败。未处理 Promise 由 Vitest 报错。

## 阶段 9 结果与边界

2026-10-02：151 项默认测试通过，2 项显式集成测试在默认套件中跳过；类型检查、双入口构建和 2 项本地真实 SSE 集成测试通过。

回归修复了保存模型被首项替换、等价 props 重置草稿/重读目录、旧认证检查覆盖登录状态、模型目录失败隐藏认证状态、切换目标未取消操作、登录完成后事件污染、旧保存关闭新弹窗、标签页缺少关联 panel 和授权 prompt 未获取焦点的问题。公共适配器接口与秘密边界保持不变。

axe-core 运行在 jsdom 中，关闭了需要真实布局的 `color-contrast` 规则；主题回归测试直接计算公开颜色变量的对比度作为补充。上述结果不代表完整 WCAG 合规，也不替代真实浏览器交互状态、非文本对比度、屏幕阅读器或生产 OAuth/云 API 验证；未声明本机完成 Ollama、LM Studio 产品现场验证。

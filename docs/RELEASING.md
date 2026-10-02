# 版本策略与发布准备

## 版本契约

当前 `0.1.0` 为准备中的首次发布，不等于已在 npm 注册表发布。

- `0.x`：不兼容的公开 API 变化提高 minor；兼容修复、文档和不改变契约的改进提高 patch。每次变化仍需写 changelog，不能仅以“尚未 1.0”为由静默破坏消费者。
- `1.x` 之后：破坏性改变提高 major；兼容功能提高 minor；兼容修复提高 patch。
- 组件 props、Core 类型、导出路径、CSS 变量名与适配器行为都属于公开契约；内部文件路径、CSS Modules 哈希类名不属于契约。
- Pi AI 是可选 peer，已验证版本 `0.99.2`，范围 `^0.99.2` 限定在同一个 0.x minor。扩展兼容范围前重新核对 Models、凭证、认证与调用接口并跑契约/集成测试。
- 本包仅 ESM，React/React DOM 是必需 peer；消费者必须显式导入 CSS。不要把 CommonJS 或完整国际化支持作为当前保证。

## 发布前门禁

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:integration
npm run verify:package
npm pack --dry-run --json
```

`prepack` 自动重建 JS/CSS/声明，避免误发陈旧 dist；声明不发布编译期测试或指向未打包源码的 declaration map。JS source map 用于调试。仅包含 dist、README、许可证、changelog、公开接入文档及可复制示例，不包含缓存、测试、开发演示或凭证。

`verify:package` 是显式检查，可能联网下载 npm 依赖，但不调用模型、不读取生产凭证、不执行 publish。它会：

1. 构建，检查 pack dry-run 清单与所有 export 目标，排除测试/缓存产物，并校验文档本地链接。
2. 在 `.release-check/` 生成真实 tarball，将 README 同步的 React 消费 fixture 复制到仓库外的系统临时目录，安装依赖（禁用第三方安装脚本），避免借用本仓库的 node_modules。
3. 检查安装后的依赖树没有 Pi AI，TypeScript 不使用 skipLibCheck 校验 UI 声明，进行 Vite 生产构建与 Node ESM / SSR smoke。
4. 检查 CSS 变量、产物及根入口递归依赖图不含 Pi AI / Node 内建模块。

tarball 保留在被忽略的 `.release-check/`，独立消费者保留在控制台输出的系统临时路径，便于排查，不会被 pack。无 Pi AI 用例只导入 UI，Pi 入口需要宿主另行安装可选 peer，不能将这个用例当作 Pi 生产授权验证。

## 人工发布步骤（另需明确授权）

确认目标 registry 的包名权限、维护者身份和所需 2FA；核对版本、LICENSE、README 与 changelog 的发布日期。若首次候选仍未完成宿主现场验收，应在发布说明明确限制，或另行决定预发布版本策略。

验证实际 tarball 后由维护者决定是否 publish 和打 tag；自动化脚本不执行这两项。发布后从目标 registry 在新项目中复验，不能以本地 tarball 成功推断注册表发布成功。

现场验收包括生产 OAuth/云 API、凭证持久化与日志策略、真实浏览器/屏幕阅读器、颜色对比度、宿主 IPC/代理授权/速率限制和费用控制。当前自动测试不能替代这些检查。

## 本地验证记录

2026-10-02：151 项默认测试、类型检查、双入口构建、2 项本地 SSE 集成及 37 文件 pack dry-run 通过。真实 tarball 在仓库外 React 18.3.1 / Vite 8.3.2 / TypeScript 7.0.2 项目中安装成功，未跳过库声明检查的 tsc、生产 JS/CSS 构建和 ESM/SSR smoke 通过；Pi AI 未安装且不可解析，符合仅 UI 接入预期。

这些检查不代表已在 npm 发布，也不替代现场 OAuth、云 API 和视觉验收。

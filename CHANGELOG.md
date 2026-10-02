# Changelog

按语义化版本记录用户可见变化；本仓库提交信息遵循中文 Conventional Commits。

## Unreleased

后续变化在此记录；发布时移入对应版本，并填写实际发布日期。

## 0.1.0 — 待首次发布

- 添加 React `ModelSettingsPanel` / `ModelSettingsDialog`，三种连接流程、受控弹窗、目录选择与认证/探测独立状态。
- 添加非秘密选择契约、Core 校验/归一化/过滤、中文与英文文案字段和内存 Mock Adapter。
- 添加可选 Pi AI 入口，注入 Models/store、首批五个 provider、动态目录、prompt/event、认证来源、ambient fallback 与一 token 最小探测。
- 添加自定义 OpenAI-compatible 配置、兼容默认值和宿主侧 SSRF 代理参考。
- 添加取消、迟到结果与事件隔离、认证超时重试、键盘焦点及语义无障碍回归。
- 添加双 ESM 入口、声明与独立 CSS、主题/接入/API 文档和真实 tarball 的无 Pi AI React 消费验证。

尚未执行 npm publish、创建发布 tag 或使用生产凭证进行云 API/OAuth 现场验收；英文文案仍有部分中文状态/校验消息，暗色主题与颜色对比度须宿主复核。

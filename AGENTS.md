# Git Commit Message 规范

所有 Git commit message 必须使用中文书写。

格式遵循 Conventional Commits：

```text
type: description
```

要求：

- `type` 只能取：`feat`、`fix`、`refactor`、`chore`、`docs`、`style`、`test`、`per`。
- `description` 必须使用中文，且不超过 72 个字符。
- `description` 以动词开头，例如“添加”“修复”“优化”。
- `description` 聚焦说明本次提交做了什么。
- 如需补充细节，可空一行后在正文中展开说明。

示例：

```text
feat: 添加用户登录接口

fix: 修复 token 过期未刷新问题
```

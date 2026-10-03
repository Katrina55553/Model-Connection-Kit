# 主题与文案

消费者先导入 `model-connection-kit/styles.css`，再加载覆盖样式。变量是公共主题 API，发布后不在兼容版本中改名。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--mck-color-accent` | `#6250b6` | 强调文字和焦点提示 |
| `--mck-color-accent-solid` | `var(--mck-color-accent)` | 主操作背景；暗色主题通常需要单独覆盖 |
| `--mck-color-on-accent` | `#ffffff` | 主操作背景上的文字 |
| `--mck-color-text` | `#262431` | 正文 |
| `--mck-color-muted` | `#625f70` | 辅助文字 |
| `--mck-color-border` | `#e9e7ef` | 边框 |
| `--mck-color-surface` | `#ffffff` | 面板与输入背景 |
| `--mck-color-soft` | `#f7f5ff` | 标签、提示区域背景 |
| `--mck-radius-panel` | `24px` | 面板和弹窗圆角 |
| `--mck-radius-control` | `12px` | 输入与选择器圆角 |
| `--mck-shadow-dialog` | `0 24px 80px rgb(28 24 50 / 18%)` | 弹窗、选择菜单阴影 |

## 全局主题与 Portal

```css
:root {
  --mck-color-accent: #6250b6;
  --mck-color-muted: #625f70;
  --mck-radius-panel: 18px;
}

body[data-mck-theme="dark"] {
  --mck-color-accent: #9c8df0;
  --mck-color-accent-solid: #6250b6;
}
```

可复制 [主题示例](../examples/theme.css)，在库 CSS 后导入。demo 已显式导入该文件，因此设置 `body[data-mck-theme="dark"]` 会立即应用暗色变量。强调文字与主操作背景使用不同变量，避免暗色主题为了提高文字可读性而把按钮背景一并调亮。示例主题的普通文字已达到 WCAG AA 对比度；错误/成功颜色、交互状态和边框仍需宿主结合最终页面复核。

仅对 Panel 设置 `className` 可以作用于内嵌内容，但 Select 菜单和 Dialog 使用挂载到 body 的 Radix Portal，不继承局部祖先变量。希望菜单/弹窗一致时将主题变量放在 `:root` 或 `body`（例如 `body[data-mck-theme="dark"]`），不要只放在 React 应用容器上。

CSS Modules 的哈希类名不是公开契约；使用变量和 Panel 的 `className`。宿主应检查最终前景/背景的对比度、焦点可见性、缩放及窄屏布局。库尊重 `prefers-reduced-motion`，在减少动态效果设置下关闭弹窗动画。

## 英文与自定义文案

```tsx
import { enUSText, ModelSettingsPanel } from "model-connection-kit";

<ModelSettingsPanel
  adapter={adapter}
  text={{ ...enUSText, title: "Choose your model" }}
  onSave={saveSelection}
/>;
```

`zhCNText` 是默认文案包。`text` 可以只覆盖部分字段；覆盖 `methods` 时需给全 subscription、api-key、custom 三个标签。`enUSText` 覆盖公开文案字段，但当前部分认证、价格说明、探测计费提示、校验器与 adapter 错误仍是中文；它不是完全国际化保证。宿主展示 adapter 消息时应自行进行安全的本地化。

自动 axe 测试在 jsdom 中只检查语义，不能证明颜色对比度或屏幕阅读器体验符合所有无障碍要求。

import { AdapterError } from "./adapter-error";
import type { CustomEndpointConfig, ModelMetadata } from "./types";

function invalid(message: string): never {
  throw new AdapterError("validation", message);
}

/** Desktop/local URLs are allowed here. A backend must additionally enforce an SSRF policy. */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u0020\u007f\\]/u.test(trimmed)) invalid("Base URL 必须是有效的 HTTP(S) 地址");
  let url: URL;
  try { url = new URL(trimmed); } catch { return invalid("Base URL 必须是有效的 HTTP(S) 地址"); }
  if (!/^https?:$/.test(url.protocol) || !url.hostname) invalid("Base URL 仅支持 HTTP 和 HTTPS");
  if (url.username || url.password) invalid("Base URL 不得包含凭证");
  if (trimmed.includes("?") || trimmed.includes("#")) invalid("Base URL 不得包含查询参数或片段");
  // Do not append /v1, remove a trailing slash, or decode escaped path segments.
  return url.href;
}

export function validateModelId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 200 || /[\s\u0000-\u001f\u007f]/u.test(id)) invalid("模型 ID 必须为 1–200 个非空白字符");
  return id;
}

export function validateModelMetadata(model: ModelMetadata): ModelMetadata {
  if (!Array.isArray(model.input) || !model.input.length || model.input.some((item) => item !== "text" && item !== "image")) invalid("至少选择一种有效输入能力");
  if (typeof model.reasoning !== "boolean") invalid("reasoning 必须为布尔值");
  if (!Number.isSafeInteger(model.contextWindow) || model.contextWindow <= 0) invalid("Context window 必须为正整数");
  if (!Number.isSafeInteger(model.maxTokens) || model.maxTokens <= 0 || model.maxTokens > model.contextWindow) invalid("Max tokens 必须为不超过 context window 的正整数");
  if (model.cost) {
    for (const amount of [model.cost.input, model.cost.output, model.cost.cacheRead, model.cost.cacheWrite]) {
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) invalid("价格必须为非负有限数字");
    }
    if (model.cost.input === undefined || model.cost.output === undefined) invalid("输入和输出价格必须同时填写");
  }
  return {
    input: [...new Set(model.input)], reasoning: model.reasoning,
    contextWindow: model.contextWindow, maxTokens: model.maxTokens,
    ...(model.cost ? { cost: {
      input: model.cost.input, output: model.cost.output,
      ...(model.cost.cacheRead !== undefined ? { cacheRead: model.cost.cacheRead } : {}),
      ...(model.cost.cacheWrite !== undefined ? { cacheWrite: model.cost.cacheWrite } : {}),
    } } : {}),
  };
}

export function validateCustomEndpoint(config: CustomEndpointConfig): CustomEndpointConfig {
  if (config.api !== "openai-completions") invalid("目前仅支持 OpenAI Chat Completions 协议");
  const displayName = config.displayName?.trim();
  if (displayName && (displayName.length > 200 || /[\u0000-\u001f\u007f]/u.test(displayName))) invalid("显示名称不得超过 200 个字符或包含控制字符");
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl), api: "openai-completions",
    ...(displayName ? { displayName } : {}), model: validateModelMetadata(config.model),
  };
}

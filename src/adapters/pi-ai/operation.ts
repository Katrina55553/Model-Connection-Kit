import { AdapterError } from "../../core/adapter-error";
import type { AdapterErrorCategory } from "../../core/types";

export function abortError(): DOMException { return new DOMException("操作已取消", "AbortError"); }
export function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }

/** Reject promptly even when a host implementation ignores cancellation; consume late failures. */
export function withAbort<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!signal) return Promise.resolve().then(task);
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(abortError()); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { throwIfAborted(signal); return task(); }).then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

const messages: Record<AdapterErrorCategory, string> = {
  validation: "连接配置无效，请检查输入",
  auth: "认证失败，请检查密钥或宿主凭证配置",
  oauth: "OAuth 登录或刷新失败，请重新登录",
  capability: "服务商不支持请求的认证方式，或宿主缺少所需 prompt handler",
  network: "模型请求失败，请检查认证与网络",
  catalog: "当前服务商的模型目录加载或刷新失败，请重试",
  policy: "请求目标不符合宿主安全策略",
  unknown: "操作失败，请重试",
};

/** Do not attach a raw cause: Pi/provider errors may contain credentials or response bodies. */
export function safeAdapterError(cause: unknown, fallback: AdapterErrorCategory): AdapterError {
  let category = fallback;
  let current = cause;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if (current instanceof AdapterError) { category = current.category; break; }
    if ("code" in current) {
      const code = current.code;
      if (code === "oauth" || code === "auth") category = code;
      else if (code === "model_source" || code === "model_validation" || code === "provider") category = "catalog";
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return new AdapterError(category, messages[category]);
}

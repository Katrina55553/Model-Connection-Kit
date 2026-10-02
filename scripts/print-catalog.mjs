/**
 * 通过真实 Pi AI 适配器打印服务商与模型目录。
 *
 * 只读取 Pi AI 内置的静态目录，不登录、不联网、不发起模型请求。
 * 凭证仅在内存中，进程结束即丢弃。
 *
 * 用法: node scripts/print-catalog.mjs
 */
import { createModels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createInitialPiAiProviders, createPiAiAdapter } from "model-connection-kit/pi-ai";

const credentials = new InMemoryCredentialStore();
const models = createModels({ credentials });
for (const provider of await createInitialPiAiProviders()) models.setProvider(provider);
const adapter = createPiAiAdapter({ models, credentials });

function authMethods(provider) {
  const methods = [];
  if (provider.auth.oauth) methods.push(`oauth${provider.auth.oauth.isSubscription ? "(订阅)" : ""}`);
  if (provider.auth.apiKey) methods.push(`api-key${provider.auth.apiKey.interactive ? "(可输入)" : "(宿主环境)"}`);
  if (provider.auth.ambient) methods.push("ambient");
  return methods.join(", ") || "无";
}

const providers = await adapter.listProviders();
console.log(`服务商 (${providers.length})`);

for (const provider of providers) {
  console.log(`\n- ${provider.name} [${provider.id}]`);
  console.log(`  认证: ${authMethods(provider)}`);
  try {
    const list = await adapter.listModels({ providerId: provider.id, signal: AbortSignal.timeout(10_000) });
    console.log(`  模型 (${list.length}):`);
    for (const model of list) {
      const flags = [model.input.join("+"), model.reasoning ? "reasoning" : ""].filter(Boolean).join(", ");
      const cost = model.cost ? `, $${model.cost.input}/$${model.cost.output} 每百万 token` : "";
      console.log(`    - ${model.name} [${model.id}] ${flags}, ctx ${model.contextWindow}, max ${model.maxTokens}${cost}`);
    }
  } catch (cause) {
    console.log(`  模型: 读取失败 - ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
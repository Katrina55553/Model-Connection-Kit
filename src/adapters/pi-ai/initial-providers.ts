import type { Provider } from "@earendil-works/pi-ai";

export const initialPiAiProviderIds = ["openai", "anthropic", "google", "openrouter", "openai-codex"] as const;

/** Explicit opt-in host factory. No provider SDK/OAuth code is loaded through the UI entry. */
export async function createInitialPiAiProviders(): Promise<Provider[]> {
  const [openai, anthropic, google, openrouter, codex] = await Promise.all([
    import("@earendil-works/pi-ai/providers/openai"),
    import("@earendil-works/pi-ai/providers/anthropic"),
    import("@earendil-works/pi-ai/providers/google"),
    import("@earendil-works/pi-ai/providers/openrouter"),
    import("@earendil-works/pi-ai/providers/openai-codex"),
  ]);
  return [openai.openaiProvider(), anthropic.anthropicProvider(), google.googleProvider(), openrouter.openrouterProvider(), codex.openaiCodexProvider()];
}

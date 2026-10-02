/** Node/desktop initialization; keep Models/store behind the host boundary in a web app. */
import { createModels, type CredentialStore, type LoginOptions } from "@earendil-works/pi-ai";
import type { ModelSelection } from "model-connection-kit";
import { createOpenAICompatibleProvider, createPiAiAdapter, createInitialPiAiProviders } from "model-connection-kit/pi-ai";

export async function createPiAiHost(credentials: CredentialStore, savedSelection?: ModelSelection, loginOptions?: LoginOptions) {
  const models = createModels({ credentials });
  for (const provider of await createInitialPiAiProviders()) models.setProvider(provider);
  if (savedSelection?.connectionType === "custom") models.setProvider(createOpenAICompatibleProvider(savedSelection));
  const adapter = createPiAiAdapter({ models, credentials, loginOptions });
  return { models, adapter };
}

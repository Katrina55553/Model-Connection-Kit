import type { ModelSelection } from "./types";

const builtinSelection: ModelSelection = {
  connectionType: "builtin",
  authMethod: "oauth",
  providerId: "openai-codex",
  modelId: "codex",
};

const customSelection: ModelSelection = {
  connectionType: "custom",
  authMethod: "none",
  providerId: "custom",
  modelId: "local-model",
  custom: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    model: {
      input: ["text"],
      reasoning: false,
      contextWindow: 8_192,
      maxTokens: 2_048,
    },
  },
};

const secretSelection: ModelSelection = {
  connectionType: "builtin",
  authMethod: "api-key",
  providerId: "openai",
  modelId: "gpt",
  // @ts-expect-error secrets cannot be stored in a selection
  apiKey: "secret",
};

const duplicateModelId: ModelSelection = {
  connectionType: "custom",
  authMethod: "none",
  providerId: "custom",
  modelId: "top-level-only",
  custom: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    model: {
      // @ts-expect-error custom model metadata cannot contain another model id
      modelId: "duplicate",
      input: ["text"],
      reasoning: false,
      contextWindow: 8_192,
      maxTokens: 2_048,
    },
  },
};

// @ts-expect-error built-in selections cannot include custom endpoint settings
const mixedSelection: ModelSelection = {
  connectionType: "builtin",
  authMethod: "ambient",
  providerId: "google",
  modelId: "gemini",
  custom: customSelection.custom,
};

void builtinSelection;
void customSelection;
void secretSelection;
void duplicateModelId;
void mixedSelection;

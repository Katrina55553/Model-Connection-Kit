import { createServer } from "node:http";
import { InMemoryCredentialStore, createModels } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createPiAiAdapter } from "./index";

const integration = describe.skipIf(process.env.MCK_INTEGRATION !== "1");

integration("OpenAI-compatible local integration", () => {
  it("performs a minimal one-token request against a local SSE server", async () => {
    let requestBody = "";
    const server = createServer((request, response) => {
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        requestBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-local",
            object: "chat.completion.chunk",
            created: 0,
            model: "local-model",
            choices: [
              { index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null },
            ],
          })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-local",
            object: "chat.completion.chunk",
            created: 0,
            model: "local-model",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("本地测试服务启动失败");

      const credentials = new InMemoryCredentialStore();
      const models = createModels({ credentials });
      const adapter = createPiAiAdapter({ models, credentials });
      const selection = {
        connectionType: "custom" as const,
        authMethod: "none" as const,
        providerId: "local-openai",
        modelId: "local-model",
        custom: {
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          api: "openai-completions" as const,
          model: {
            input: ["text" as const],
            reasoning: false,
            contextWindow: 8_192,
            maxTokens: 2_048,
          },
        },
      };

      await adapter.connect(selection);
      const status = await adapter.testConnection(selection);
      if (status.state !== "reachable") {
        throw new Error(`本地探测失败: ${JSON.stringify(status)}`);
      }
      expect(status).toMatchObject({
        state: "reachable",
        mayBeBillable: true,
      });

      const parsed = JSON.parse(requestBody) as {
        max_tokens?: number;
        max_completion_tokens?: number;
        messages: Array<{ content: string }>;
      };
      expect(parsed.max_tokens ?? parsed.max_completion_tokens).toBe(1);
      expect(parsed.messages.at(-1)?.content).toBe("Respond with OK.");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

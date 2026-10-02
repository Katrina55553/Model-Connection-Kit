// @vitest-environment node
import { EventEmitter } from "node:events";
import { request, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { probeViaBackend } from "../../examples/backend-proxy";

vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) }));

const policy = { allowedBaseUrls: ["https://api.example/proxy/v1/"] };
let requestOptions: RequestOptions;
let sentBody: string;

function respond(statusCode: number, body = "{}") {
  vi.mocked(request).mockImplementation((...args: unknown[]) => {
    requestOptions = args[1] as RequestOptions;
    const callback = args[2] as (response: IncomingMessage) => void;
    const upstream = new EventEmitter();
    Object.assign(upstream, { end: (payload: string) => {
      sentBody = payload;
      queueMicrotask(() => {
        const response = new PassThrough();
        Object.assign(response, { statusCode, headers: { location: "http://127.0.0.1/admin" } });
        callback(response as unknown as IncomingMessage);
        if (!response.destroyed) response.end(body);
      });
    } });
    return upstream as ClientRequest;
  });
}

beforeEach(() => vi.clearAllMocks());

describe("backend probe transport", () => {
  it("pins DNS, preserves the allowed path, and only sends a minimal request", async () => {
    respond(200);
    await probeViaBackend(policy.allowedBaseUrls[0]!, "test-model", policy);
    expect(requestOptions).toMatchObject({ method: "POST", path: "/proxy/v1/chat/completions", family: 4, agent: false });
    const callback = vi.fn();
    expect(requestOptions.lookup).toBeTypeOf("function");
    requestOptions.lookup!("api.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(JSON.parse(sentBody)).toEqual({ model: "test-model", messages: [{ role: "user", content: "Respond with OK." }], max_tokens: 1, stream: false });
    expect(requestOptions.headers).not.toHaveProperty("authorization");
  });

  it.each([301, 302, 307, 308])("rejects redirect %s without contacting its Location", async (status) => {
    respond(status);
    await expect(probeViaBackend(policy.allowedBaseUrls[0]!, "test", policy)).rejects.toMatchObject({ category: "network" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("limits the response body", async () => {
    respond(200, "x".repeat(1_048_577));
    await expect(probeViaBackend(policy.allowedBaseUrls[0]!, "test", policy)).rejects.toMatchObject({ category: "network" });
  });
});

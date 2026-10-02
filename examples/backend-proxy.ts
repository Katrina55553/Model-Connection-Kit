/** Node-only reference. Do not import this file from a browser bundle. */
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { AdapterError } from "../src/core/adapter-error";
import { normalizeBaseUrl, validateModelId } from "../src/core/validate-custom-endpoint";

export interface ProxyPolicy {
  /** Server-owned exact Base URLs, including path; never accept this list from the client. */
  allowedBaseUrls: readonly string[];
}
type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<readonly Address[]>;

const denied = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) denied.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) denied.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, "ipv4");
  // Fail closed outside ordinary global unicast; also excludes IPv4-mapped IPv6 and NAT64.
  return family === 6 && globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
}

function forbidden(): never { throw new AdapterError("policy", "代理目标不符合安全策略"); }

export async function resolveProxyTarget(baseUrl: string, policy: ProxyPolicy, resolve: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true })) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) forbidden();
  if (!policy.allowedBaseUrls.some((allowed) => normalizeBaseUrl(allowed) === url.href)) forbidden();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await resolve(hostname);
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || entry.family !== isIP(entry.address))) forbidden();
  return { url, address: addresses[0]! };
}

/** A fixed one-token probe, not a generic arbitrary-URL forwarder. */
export async function probeViaBackend(
  baseUrl: string, modelId: string, policy: ProxyPolicy,
  options: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const model = validateModelId(modelId);
  const { url, address } = await resolveProxyTarget(baseUrl, policy);
  const signal = AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]);
  const body = JSON.stringify({ model, messages: [{ role: "user", content: "Respond with OK." }], max_tokens: 1, stream: false });
  await new Promise<void>((resolve, reject) => {
    const upstream = request(url, {
      method: "POST", path: `${url.pathname.replace(/\/$/, "")}/chat/completions`,
      signal, agent: false, // Fresh socket; DNS is pinned to the checked address, TLS still verifies the original hostname.
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}) },
    }, (response) => {
      // node:https does not follow redirects. Reject all 3xx rather than resolving Location.
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        reject(new AdapterError("network", "上游请求失败或返回重定向"));
        return;
      }
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_048_576) response.destroy(new Error("响应超过限制"));
      });
      response.on("end", resolve);
      response.on("error", () => reject(new AdapterError("network", "上游响应读取失败")));
    });
    upstream.on("error", () => reject(new AdapterError("network", "上游请求失败或已取消")));
    upstream.end(body);
  });
}

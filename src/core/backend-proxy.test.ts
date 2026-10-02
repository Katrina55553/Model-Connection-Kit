import { describe, expect, it, vi } from "vitest";
import { isPublicAddress, resolveProxyTarget } from "../../examples/backend-proxy";

describe("backend proxy policy", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2002:7f00:1::", "64:ff9b::7f00:1", "2001:db8::1",
  ])("rejects non-public IP %s", (address) => expect(isPublicAddress(address)).toBe(false));

  it("accepts ordinary public IPv4 and IPv6", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each(["http://api.example/v1", "https://api.example:8443/v1", "https://evil.example/v1", "https://api.example/private", "https://api.example.evil/v1"])("rejects a non-allowlisted target %s before DNS", async (url) => {
    const resolver = vi.fn();
    await expect(resolveProxyTarget(url, { allowedBaseUrls: ["https://api.example/v1"] }, resolver)).rejects.toMatchObject({ category: "policy" });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects DNS with any private address, even alongside a public answer", async () => {
    await expect(resolveProxyTarget("https://api.example/v1", { allowedBaseUrls: ["https://api.example/v1"] }, async () => [
      { address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 },
    ])).rejects.toMatchObject({ category: "policy" });
  });

  it.each(["https://127.0.0.1/v1", "https://2130706433/v1", "https://[::ffff:127.0.0.1]/v1"])("rejects private IP literals even when allowlisted %s", async (url) => {
    await expect(resolveProxyTarget(url, { allowedBaseUrls: [url] })).rejects.toMatchObject({ category: "policy" });
  });

  it("returns the checked IP for the transport to pin without a second DNS lookup", async () => {
    const resolver = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const target = await resolveProxyTarget("https://api.example/v1", { allowedBaseUrls: ["https://api.example/v1"] }, resolver);
    expect(target.address).toEqual({ address: "8.8.8.8", family: 4 });
    expect(target.url.hostname).toBe("api.example");
    expect(resolver).toHaveBeenCalledOnce();
  });
});

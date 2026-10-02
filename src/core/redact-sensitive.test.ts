import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "./redact-sensitive";

describe("redactSensitiveText", () => {
  it("removes explicit secrets and common authorization fields", () => {
    const message = "request failed: api_key=sk-example-secret Authorization: Bearer token-value";
    const redacted = redactSensitiveText(message, ["sk-example-secret"]);
    expect(redacted).not.toContain("sk-example-secret");
    expect(redacted).not.toContain("token-value");
    expect(redacted).toContain("[REDACTED]");
  });
});

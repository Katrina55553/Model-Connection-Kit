import { describe, expect, it } from "vitest";
import { ModelsError } from "@earendil-works/pi-ai";
import { AdapterError } from "../../core/adapter-error";
import { safeAdapterError, withAbort } from "./operation";

describe("Pi AI operation boundaries", () => {
  it("does not start an already canceled operation", async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    await expect(withAbort(async () => { started = true; }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toBe(false);
  });

  it("consumes a late rejection after cancellation", async () => {
    const controller = new AbortController();
    let fail!: (error: unknown) => void;
    const pending = withAbort(() => new Promise<void>((_resolve, reject) => { fail = reject; }), controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await assertion;
    fail(new Error("late secret error"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("keeps a nested prompt capability category but discards raw error content", () => {
    const result = safeAdapterError(new ModelsError("auth", "access-secret", { cause: new AdapterError("capability", "prompt-secret") }), "oauth");
    expect(result).toMatchObject({ category: "capability", message: expect.stringContaining("prompt handler") });
    expect(result.cause).toBeUndefined();
    expect(result.message).not.toContain("secret");
  });

  it.each(["model_source", "model_validation", "provider"] as const)("maps Pi error %s to catalog", (code) => {
    expect(safeAdapterError(new ModelsError(code, "raw-secret"), "unknown")).toMatchObject({ category: "catalog" });
  });
});

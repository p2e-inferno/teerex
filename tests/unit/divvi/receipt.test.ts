import { describe, it, expect, vi } from "vitest";
import { waitForReceipt } from "@/lib/divvi/receipt";

describe("waitForReceipt", () => {
  it("resolves when receipt becomes available", async () => {
    vi.useFakeTimers();
    const provider = {
      request: vi.fn(async () => null),
    } as any;

    provider.request.mockImplementationOnce(async () => null);
    provider.request.mockImplementationOnce(async () => ({ status: "0x1" }));

    const p = waitForReceipt(provider, "0xabc", { pollMs: 10, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    const receipt = await p;
    expect(receipt).toEqual({ status: "0x1" });
    vi.useRealTimers();
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const provider = {
      request: vi.fn(async () => null),
    } as any;

    const p = waitForReceipt(provider, "0xabc", { pollMs: 10, timeoutMs: 25 });
    const assertion = expect(p).rejects.toThrow(/Timed out/i);
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    vi.useRealTimers();
  });
});

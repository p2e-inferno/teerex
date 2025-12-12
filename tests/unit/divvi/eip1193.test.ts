import { describe, it, expect, vi } from "vitest";
import { wrapEip1193ProviderWithDivvi } from "@/lib/divvi/eip1193";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("wrapEip1193ProviderWithDivvi", () => {
  it("appends tag (strip0x) to tx.data and submits after receipt", async () => {
    let sentTx: any;
    const provider = {
      request: vi.fn(async ({ method, params }: any) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_sendTransaction") {
          sentTx = params[0];
          return "0xabc";
        }
        if (method === "eth_getTransactionReceipt") {
          return { status: "0x1", transactionHash: params[0] };
        }
        throw new Error(`unexpected method: ${method}`);
      }),
    };

    const submitReferral = vi.fn(async () => ({}));
    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xdeadbeef",
      submitReferral,
    });

    const txHash = await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          data: "0x1234",
        },
      ],
    });

    expect(txHash).toBe("0xabc");
    expect(sentTx.data).toBe("0x1234deadbeef");

    await flush();
    expect(submitReferral).toHaveBeenCalledWith({ txHash: "0xabc", chainId: 1 });
  });

  it("uses tx.input when tx.data is missing, and mirrors the write to input", async () => {
    let sentTx: any;
    const provider = {
      request: vi.fn(async ({ method, params }: any) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_sendTransaction") {
          sentTx = params[0];
          return "0xabc";
        }
        if (method === "eth_getTransactionReceipt") return { status: "0x1" };
        throw new Error(`unexpected method: ${method}`);
      }),
    };

    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xaaaa",
      submitReferral: vi.fn(async () => ({})),
    });

    await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          input: "0x1234",
        },
      ],
    });

    expect(sentTx.data).toBe("0x1234aaaa");
    expect(sentTx.input).toBe("0x1234aaaa");
  });

  it("does not tag when data is empty (0x)", async () => {
    let sentTx: any;
    const provider = {
      request: vi.fn(async ({ method, params }: any) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_sendTransaction") {
          sentTx = params[0];
          return "0xabc";
        }
        if (method === "eth_getTransactionReceipt") return { status: "0x1" };
        throw new Error(`unexpected method: ${method}`);
      }),
    };

    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xdeadbeef",
      submitReferral: vi.fn(async () => ({})),
    });

    await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          data: "0x",
        },
      ],
    });

    expect(sentTx.data).toBe("0x");
  });

  it("does not tag contract creation (missing to)", async () => {
    let sentTx: any;
    const provider = {
      request: vi.fn(async ({ method, params }: any) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_sendTransaction") {
          sentTx = params[0];
          return "0xabc";
        }
        if (method === "eth_getTransactionReceipt") return { status: "0x1" };
        throw new Error(`unexpected method: ${method}`);
      }),
    };

    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xdeadbeef",
      submitReferral: vi.fn(async () => ({})),
    });

    await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x1111111111111111111111111111111111111111",
          data: "0x1234",
        },
      ],
    });

    expect(sentTx.data).toBe("0x1234");
  });

  it("falls back to chainId lookup if pre-send lookup fails", async () => {
    const submitReferral = vi.fn(async () => ({}));
    const provider = {
      request: vi.fn(async ({ method, params }: any) => {
        if (method === "eth_chainId") {
          if (provider.request.mock.calls.length < 2) throw new Error("nope");
          return "0x2";
        }
        if (method === "eth_sendTransaction") return "0xabc";
        if (method === "eth_getTransactionReceipt") return { status: "0x1" };
        throw new Error(`unexpected method: ${method}`);
      }),
    };

    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xdeadbeef",
      submitReferral,
      onError: vi.fn(),
    });

    await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          data: "0x1234",
        },
      ],
    });

    await flush();
    expect(submitReferral).toHaveBeenCalledWith({ txHash: "0xabc", chainId: 2 });
  });

  it("reuses the same wrapper for the same provider", () => {
    const provider = { request: vi.fn() };
    const opts = {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: () => "0x1111111111111111111111111111111111111111",
      getReferralTag: () => "0xdeadbeef",
      submitReferral: vi.fn(async () => ({})),
    } as any;
    const a = wrapEip1193ProviderWithDivvi(provider as any, opts);
    const b = wrapEip1193ProviderWithDivvi(provider as any, opts);
    expect(a).toBe(b);
  });
});


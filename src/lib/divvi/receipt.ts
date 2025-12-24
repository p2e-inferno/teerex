export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
};

export async function waitForReceipt(
  provider: Eip1193Provider,
  txHash: string,
  {
    pollMs = 1500,
    timeoutMs = 180_000,
  }: { pollMs?: number; timeoutMs?: number } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("Timed out waiting for tx receipt");
}


import { usePrivy, useWallets } from "@privy-io/react-auth";

type UsePrivyReturn = ReturnType<typeof usePrivy>;
type UseWalletsReturn = ReturnType<typeof useWallets>;

export function mockUsePrivy(value: Partial<UsePrivyReturn>) {
  (usePrivy as unknown as { mockReturnValue: (v: any) => void }).mockReturnValue({
    authenticated: false,
    ready: true,
    user: null,
    login: () => undefined,
    connectWallet: () => undefined,
    getAccessToken: async () => null,
    ...value,
  });
}

export function mockUseWallets(value: Partial<UseWalletsReturn>) {
  (useWallets as unknown as { mockReturnValue: (v: any) => void }).mockReturnValue({
    wallets: [],
    ...value,
  });
}

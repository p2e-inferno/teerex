
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string;
  readonly VITE_PRIMARY_CHAIN_ID?: string;
  readonly VITE_USDC_ADDRESS_BASE_MAINNET?: string;
  readonly VITE_USDC_ADDRESS_BASE_SEPOLIA?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    isMetaMask?: boolean;
  };
}

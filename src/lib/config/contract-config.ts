export const getBatchAttestationAddress = (chainId: number): string => {
  if (chainId === 8453) {
    return (import.meta as any).env?.VITE_TEEREX_ADDRESS_BASE_MAINNET || '';
  }
  if (chainId === 84532) {
    return (import.meta as any).env?.VITE_TEEREX_ADDRESS_BASE_SEPOLIA || '';
  }
  throw new Error(`Chain ID ${chainId} not supported for BatchAttestation contract`);
};


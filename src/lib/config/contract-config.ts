import { getNetworkConfigByChainId } from '@/lib/config/network-config';

/**
 * Resolve the deployed TeeRexTicketPassControllerV1 address for a chain from network_configs.
 * Throws if the controller is not configured for the chain.
 */
export const getTicketPassControllerAddress = async (chainId: number): Promise<string> => {
  const cfg = await getNetworkConfigByChainId(chainId);
  const address = cfg?.ticket_pass_controller_address;
  if (!address) {
    throw new Error('Ticket Pass controller is not configured for this network.');
  }
  return address;
};

/**
 * Resolve the deployed TeeRexRewardsControllerV1 address for a chain from network_configs.
 * Throws if the controller is not configured for the chain.
 */
export const getRewardsControllerAddress = async (chainId: number): Promise<string> => {
  const cfg = await getNetworkConfigByChainId(chainId);
  const address = cfg?.rewards_controller_address;
  if (!address) {
    throw new Error('Rewards controller is not configured for this network.');
  }
  return address;
};

export const getBatchAttestationAddress = (chainId: number): string => {
  if (chainId === 8453) {
    return (import.meta as any).env?.VITE_TEEREX_ADDRESS_BASE_MAINNET || '';
  }
  if (chainId === 84532) {
    return (import.meta as any).env?.VITE_TEEREX_ADDRESS_BASE_SEPOLIA || '';
  }
  throw new Error(`Chain ID ${chainId} not supported for BatchAttestation contract`);
};


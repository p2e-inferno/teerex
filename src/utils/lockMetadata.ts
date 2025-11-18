import { ethers } from 'ethers';
import PublicLockABI from '../../supabase/functions/_shared/abi/PublicLockV15.json';

/**
 * Static symbol for all TeeRex event NFTs
 */
export const TEEREX_NFT_SYMBOL = 'TEEREX';

/**
 * Set NFT metadata on a lock contract
 * Configures the tokenURI base URL for OpenSea and other marketplaces
 * 
 * @param lockAddress - Address of the lock contract
 * @param lockName - Name of the lock/event
 * @param lockSymbol - Symbol for the NFT (use TEEREX_NFT_SYMBOL)
 * @param baseTokenURI - Base URI for token metadata
 * @param signer - Ethers signer with lock manager permissions
 * @returns Result object with success status and transaction hash or error
 */
export async function setLockMetadata(
  lockAddress: string,
  lockName: string,
  lockSymbol: string,
  baseTokenURI: string,
  signer: ethers.Signer
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const lock = new ethers.Contract(lockAddress, PublicLockABI, signer);
    const tx = await lock.setLockMetadata(lockName, lockSymbol, baseTokenURI);
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: receipt.hash
    };
  } catch (error: any) {
    console.error('Error setting lock metadata:', error);
    return {
      success: false,
      error: error.message || 'Failed to set lock metadata'
    };
  }
}

/**
 * Get the base token URI for the current environment and lock
 * Points to the Edge Function that serves NFT metadata for a specific lock
 * 
 * @param lockAddress - Address of the lock contract
 * @returns Base URI for token metadata
 */
export function getBaseTokenURI(lockAddress: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/nft-metadata/${lockAddress}/`;
}

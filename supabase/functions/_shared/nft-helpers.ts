import { ethers } from "https://esm.sh/ethers@6.14.4";

/**
 * Extract token ID from transaction receipt by parsing Transfer events
 *
 * This function parses the ERC721 Transfer event from a transaction receipt
 * to extract the token ID that was minted or transferred.
 *
 * Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
 * Topic 0: Event signature hash
 * Topic 1: from address (0x0 for minting)
 * Topic 2: to address (recipient)
 * Topic 3: token ID
 *
 * @param receipt Transaction receipt from grantKeys() or purchase() call
 * @param lockAddress Lock contract address (for event filtering)
 * @param recipient Address that received the NFT
 * @returns Token ID as string, or null if not found
 */
export async function extractTokenIdFromReceipt(
  receipt: ethers.TransactionReceipt,
  lockAddress: string,
  recipient: string
): Promise<string | null> {
  // ERC721 Transfer event signature: keccak256("Transfer(address,address,uint256)")
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  const normalizedLockAddress = lockAddress.toLowerCase();
  const normalizedRecipient = recipient.toLowerCase();

  for (const log of receipt.logs) {
    // Filter by lock contract address
    if (log.address.toLowerCase() !== normalizedLockAddress) continue;

    // Filter by Transfer event signature
    if (log.topics[0] !== transferTopic) continue;

    // Extract recipient address from topics[2] (remove 0x prefix and padding)
    // Topics are 32 bytes, addresses are 20 bytes, so remove first 12 bytes of padding
    const toAddress = ("0x" + log.topics[2].slice(26)).toLowerCase();

    if (toAddress === normalizedRecipient) {
      // Token ID is in topics[3]
      const tokenId = BigInt(log.topics[3]).toString();
      console.log(`[extractTokenIdFromReceipt] Found token ID: ${tokenId} for recipient ${recipient}`);
      return tokenId;
    }
  }

  console.warn(`[extractTokenIdFromReceipt] No Transfer event found for recipient ${recipient}`);
  return null;
}

/**
 * Query token ID from transaction hash by fetching receipt and parsing events
 *
 * This function fetches the transaction receipt for a given tx hash and
 * extracts the token ID by parsing Transfer events.
 *
 * @param txHash Transaction hash
 * @param provider ethers JsonRpcProvider
 * @param lockAddress Lock contract address
 * @param recipient Address that received the NFT
 * @returns Token ID as string, or null if not found
 */
export async function getTokenIdFromTxHash(
  txHash: string,
  provider: any,
  lockAddress: string,
  recipient: string
): Promise<string | null> {
  try {
    console.log(`[getTokenIdFromTxHash] Fetching receipt for tx: ${txHash}`);

    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      console.warn(`[getTokenIdFromTxHash] No receipt found for tx: ${txHash}`);
      return null;
    }

    return await extractTokenIdFromReceipt(receipt, lockAddress, recipient);
  } catch (error: any) {
    console.error(`[getTokenIdFromTxHash] Error fetching token ID:`, error.message || error);
    return null;
  }
}

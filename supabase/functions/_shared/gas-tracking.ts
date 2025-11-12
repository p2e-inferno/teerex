/* deno-lint-ignore-file no-explicit-any */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

/**
 * Logs gas transaction to gas_transactions table
 * Handles gas cost calculation from receipt and transaction
 */
export async function logGasTransaction(
  supabase: SupabaseClient,
  receipt: any,
  tx: any,
  chainId: number,
  serviceWalletAddress: string,
  eventId?: string
): Promise<void> {
  const gasUsed = BigInt(receipt.gasUsed.toString());

  // Optimized fallback: compute string once
  const gasPriceStr = receipt.effectiveGasPrice?.toString() ??
                      receipt.gasPrice?.toString() ??
                      tx.gasPrice?.toString() ??
                      '0';
  const gasPrice = BigInt(gasPriceStr);
  const gasCostWei = gasUsed * gasPrice;
  const gasCostEth = Number(gasCostWei) / 1e18;

  await supabase.from('gas_transactions').insert({
    transaction_hash: receipt.transactionHash,
    chain_id: chainId,
    gas_used: gasUsed.toString(),
    gas_price: gasPriceStr,
    gas_cost_wei: gasCostWei.toString(),
    gas_cost_eth: gasCostEth,
    service_wallet_address: serviceWalletAddress,
    event_id: eventId || null,
    block_number: receipt.blockNumber?.toString() || null,
    status: 'confirmed',
  });
}

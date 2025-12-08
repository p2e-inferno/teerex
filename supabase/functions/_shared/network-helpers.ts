/* deno-lint-ignore-file no-explicit-any */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

export interface NetworkConfig {
  chain_id: number;
  chain_name: string;
  rpc_url: string | null;
  unlock_factory_address: string | null;
  usdc_token_address: string | null;
  is_active: boolean;
}

/**
 * Validates if a chain is supported (active in network_configs)
 * Returns network config if valid, null if not
 *
 * @param supabase - Supabase client instance
 * @param chainId - Chain ID to validate
 * @returns NetworkConfig if chain is active and exists, null otherwise
 */
export async function validateChain(
  supabase: SupabaseClient,
  chainId: number
): Promise<NetworkConfig | null> {
  const { data, error } = await supabase
    .from('network_configs')
    .select('chain_id, chain_name, rpc_url, unlock_factory_address, usdc_token_address, is_active')
    .eq('chain_id', chainId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as NetworkConfig;
}

/**
 * Gets all active networks (for admin displays, dropdowns, etc.)
 *
 * @param supabase - Supabase client instance
 * @returns Array of active network configurations
 */
export async function getActiveNetworks(
  supabase: SupabaseClient
): Promise<NetworkConfig[]> {
  const { data, error } = await supabase
    .from('network_configs')
    .select('chain_id, chain_name, rpc_url, unlock_factory_address, usdc_token_address, is_active')
    .eq('is_active', true)
    .order('chain_id');

  if (error || !data) {
    return [];
  }

  return data as NetworkConfig[];
}

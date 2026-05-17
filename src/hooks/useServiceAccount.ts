import { useEffect, useState, useCallback } from 'react';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrivy } from '@privy-io/react-auth';

type ServiceBalance = {
  chain_id: number;
  chain_name: string;
  rpc_url: string | null;
  block_explorer_url: string | null;
  native_currency_symbol: string;
  native_balance_eth: number | null;
  warning: boolean;
  error?: string;
};

type KeyHealthStats = {
  success: number;
  pending: number;
  failed: number;
};

type StuckReference = {
  id: string;
  reference: string;
  event_id: string | null;
  created_at: string;
  key_granted?: boolean;
};

type GrantAttempt = {
  payment_transaction_id: string;
  status: string;
  attempt_number: number;
  error_message: string | null;
  grant_tx_hash: string | null;
  created_at: string;
};

type GasTotal = { chain_id: number; gas_cost_eth: number; count: number };
type GasRecent = {
  transaction_hash: string;
  chain_id: number;
  gas_cost_eth: number;
  gas_used: number | null;
  gas_price: number | null;
  event_id: string | null;
  payment_transaction_id: string | null;
  created_at: string;
  status: string | null;
};

type GasActivity = {
  id: string;
  user_id: string;
  activity: string;
  chain_id: number;
  event_id: string | null;
  created_at: string;
};


export function useServiceBalances() {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<{
    primary_chain_id?: number;
    service_address?: string;
    balances: ServiceBalance[];
  }>({ balances: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('service-account-balances', {}, { privyToken: token, withAnonKey: true });
      setData({
        primary_chain_id: data.primary_chain_id,
        service_address: data.service_address,
        balances: data.balances || [],
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load balances');
      setData({ balances: [] });
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { ...data, loading, error, refresh: fetchBalances };
}

export function useServiceKeyHealth() {
  const { getAccessToken } = usePrivy();
  const [stats, setStats] = useState<KeyHealthStats>({ success: 0, pending: 0, failed: 0 });
  const [stuck, setStuck] = useState<StuckReference[]>([]);
  const [attempts, setAttempts] = useState<GrantAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKeyHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('service-account-key-health', {}, { privyToken: token, withAnonKey: true });
      setStats(data.stats || { success: 0, pending: 0, failed: 0 });
      setStuck(data.stuck || []);
      setAttempts(data.attempts || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load key health');
      setStats({ success: 0, pending: 0, failed: 0 });
      setStuck([]);
      setAttempts([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchKeyHealth();
  }, [fetchKeyHealth]);

  return { stats, stuck, attempts, loading, error, refresh: fetchKeyHealth };
}

export function useServiceGasStats() {
  const { getAccessToken } = usePrivy();
  const [totals, setTotals] = useState<GasTotal[]>([]);
  const [recent, setRecent] = useState<GasRecent[]>([]);
  const [activity, setActivity] = useState<GasActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGasStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('service-account-gas-stats', {}, { privyToken: token, withAnonKey: true });
      setTotals(data.totals || []);
      setRecent(data.recent || []);
      setActivity(data.activity || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load gas stats');
      setTotals([]);
      setRecent([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchGasStats();
  }, [fetchGasStats]);

  return { totals, recent, activity, loading, error, refresh: fetchGasStats };
}

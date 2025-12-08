import React, { useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { useServiceBalances, useServiceGasStats, useServiceKeyHealth } from '@/hooks/useServiceAccount';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, Wallet, Eye } from 'lucide-react';

const LOCK_MANAGER_ABI = [
  {
    inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    name: 'isLockManager',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const AdminServiceAccount: React.FC = () => {
  const { user } = usePrivy();
  const { networks, isLoading: networksLoading, getNetworkByChainId } = useNetworkConfigs();
  const { primary_chain_id, service_address, balances, loading: balancesLoading, error: balancesError, refresh: refreshBalances } = useServiceBalances();
  const { stats, stuck, attempts, loading: keyHealthLoading, error: keyHealthError, refresh: refreshKeyHealth } = useServiceKeyHealth();
  const { totals, recent, activity, loading: gasLoading, error: gasError, refresh: refreshGas } = useServiceGasStats();

  const [lockAddress, setLockAddress] = useState<string>('');
  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(undefined);
  const [lockCheckResult, setLockCheckResult] = useState<{ status: 'idle' | 'checking' | 'yes' | 'no' | 'error'; message?: string }>({ status: 'idle' });

  const explorerForChain = useMemo(() => {
    const map: Record<number, string> = {};
    for (const net of networks) {
      if (net.block_explorer_url) {
        map[net.chain_id] = net.block_explorer_url.replace(/\/+$/, '');
      }
    }
    return map;
  }, [networks]);

  const humanizeError = (err?: string | null) => {
    if (!err) return null;
    if (err.includes('unauthorized')) return 'You are not an admin for this environment.';
    if (err.includes('admin_lock_not_configured')) return 'Admin lock is not configured. Set ADMIN_LOCK_ADDRESS.';
    if (err.includes('network_rpc_not_configured')) return 'RPC URL for primary chain is not configured.';
    return err;
  };

  const handleLockCheck = async () => {
    if (!service_address) {
      toast({ title: 'Service address missing', variant: 'destructive' });
      return;
    }
    if (!lockAddress || !ethers.isAddress(lockAddress)) {
      toast({ title: 'Enter a valid lock address', variant: 'destructive' });
      return;
    }
    const chainId = selectedChainId || networks[0]?.chain_id;
    if (!chainId) {
      toast({ title: 'No active networks configured', description: 'Add a network in Admin → Networks.', variant: 'destructive' });
      return;
    }
    const network = chainId ? getNetworkByChainId(chainId) : null;
    if (!network?.rpc_url) {
      toast({ title: 'RPC URL not configured for selected network', variant: 'destructive' });
      return;
    }

    try {
      setLockCheckResult({ status: 'checking' });
      const provider = new ethers.JsonRpcProvider(network.rpc_url);
      const lock = new ethers.Contract(lockAddress, LOCK_MANAGER_ABI, provider);
      const isManager = await lock.isLockManager(service_address);
      setLockCheckResult({ status: isManager ? 'yes' : 'no' });
    } catch (err: any) {
      setLockCheckResult({ status: 'error', message: err?.message || 'RPC error' });
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>Please connect your wallet to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const renderBalanceRows = () => {
    if (balancesLoading) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading balances...
          </TableCell>
        </TableRow>
      );
    }

    if (balancesError) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center text-destructive">
            {humanizeError(balancesError)}
          </TableCell>
        </TableRow>
      );
    }

    if (!balances.length) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center text-muted-foreground">
            No balances available
          </TableCell>
        </TableRow>
      );
    }

    return balances.map((b) => (
      <TableRow key={b.chain_id}>
        <TableCell className="font-medium">
          {b.chain_name} ({b.chain_id})
        </TableCell>
        <TableCell>{b.rpc_url || '—'}</TableCell>
        <TableCell>{b.block_explorer_url ? <a className="text-primary hover:underline" href={b.block_explorer_url} target="_blank" rel="noreferrer">Explorer</a> : '—'}</TableCell>
        <TableCell>
          {b.native_balance_eth === null ? 'Error' : `${b.native_balance_eth.toFixed(6)} ${b.native_currency_symbol}`}
        </TableCell>
        <TableCell>
          {b.warning ? <Badge variant="destructive">Low</Badge> : <Badge variant="secondary">OK</Badge>}
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Service Account</h1>
            <p className="text-muted-foreground">Monitor the service wallet, balances, and key issuance health.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshBalances} disabled={balancesLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${balancesLoading ? 'animate-spin' : ''}`} />
              Refresh Balances
            </Button>
            <Button variant="outline" onClick={refreshKeyHealth} disabled={keyHealthLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${keyHealthLoading ? 'animate-spin' : ''}`} />
              Refresh Key Health
            </Button>
            <Button variant="outline" onClick={refreshGas} disabled={gasLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${gasLoading ? 'animate-spin' : ''}`} />
              Refresh Gas
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Service Wallet
              </CardTitle>
              <CardDescription>Address and lock manager check (on-chain)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Address</div>
                <div className="font-mono break-all">{service_address || '—'}</div>
                {primary_chain_id && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Primary chain: {primary_chain_id}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Lock address (0x...)"
                    value={lockAddress}
                    onChange={(e) => setLockAddress(e.target.value)}
                  />
                  <Select
                    value={String(selectedChainId || networks[0]?.chain_id || '')}
                    onValueChange={(val) => setSelectedChainId(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={networksLoading ? 'Loading networks...' : 'Select network'} />
                    </SelectTrigger>
                    <SelectContent>
                      {networks.map((n) => (
                        <SelectItem key={n.chain_id} value={String(n.chain_id)}>
                          {n.chain_name} ({n.chain_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {networks.length === 0 && !networksLoading && (
                  <Alert variant="destructive">
                    <AlertDescription>No active networks configured. Add one in Admin → Networks to use lock checks.</AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleLockCheck}
                  disabled={lockCheckResult.status === 'checking' || networksLoading || networks.length === 0}
                >
                  {lockCheckResult.status === 'checking' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Check Lock Manager
                </Button>

                {lockCheckResult.status !== 'idle' && (
                  <Alert variant={lockCheckResult.status === 'yes' ? 'default' : lockCheckResult.status === 'no' ? 'destructive' : 'default'}>
                    <AlertDescription className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      {lockCheckResult.status === 'yes' && 'Service wallet is a lock manager for this lock.'}
                      {lockCheckResult.status === 'no' && 'Service wallet is not a lock manager on this lock.'}
                      {lockCheckResult.status === 'error' && (lockCheckResult.message || 'RPC error checking lock manager.')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Balances</CardTitle>
              <CardDescription>Native balances per active network</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Network</TableHead>
                    <TableHead>RPC</TableHead>
                    <TableHead>Explorer</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{renderBalanceRows()}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Key Grant Health</CardTitle>
            <CardDescription>Paystack → Unlock issuance status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {keyHealthError && (
              <Alert variant="destructive">
                <AlertDescription>{humanizeError(keyHealthError)}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border bg-background/60">
                <div className="text-sm text-muted-foreground">Success</div>
                <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              </div>
              <div className="p-4 rounded-lg border bg-background/60">
                <div className="text-sm text-muted-foreground">Pending</div>
                <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
              </div>
              <div className="p-4 rounded-lg border bg-background/60">
                <div className="text-sm text-muted-foreground">Failed</div>
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">Stuck references (status=success but key not granted)</span>
                </div>
                <div className="border rounded-lg max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stuck || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            None
                          </TableCell>
                        </TableRow>
                      ) : (
                        stuck.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                            <TableCell className="font-mono text-xs">{tx.event_id || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium">Recent grant attempts</span>
                </div>
                <div className="border rounded-lg max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tx</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempt</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(attempts || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            None
                          </TableCell>
                        </TableRow>
                      ) : (
                        attempts.map((a) => (
                          <TableRow key={`${a.payment_transaction_id}-${a.attempt_number}`}>
                            <TableCell className="font-mono text-xs">
                              {a.payment_transaction_id.slice(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant={a.status === 'success' ? 'default' : a.status === 'failed' ? 'destructive' : 'secondary'}>
                                {a.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{a.attempt_number}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(a.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Gas Spend & Activity</CardTitle>
            <CardDescription>Totals and recent gasless actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gasError && (
              <Alert variant="destructive">
                <AlertDescription>{humanizeError(gasError)}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {totals.length === 0 ? (
                <div className="text-muted-foreground">No gas data yet.</div>
              ) : (
                totals.map((t) => {
                  const network = getNetworkByChainId(t.chain_id);
                  const symbol = network?.native_currency_symbol || 'ETH';
                  return (
                    <div key={t.chain_id} className="p-4 rounded-lg border bg-background/60">
                      <div className="text-sm text-muted-foreground">Chain {t.chain_id}</div>
                      <div className="text-xl font-bold">{t.gas_cost_eth.toFixed(6)} {symbol}</div>
                      <div className="text-xs text-muted-foreground">{t.count} tx</div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span className="font-medium">Recent gas transactions</span>
                </div>
                <div className="border rounded-lg max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tx Hash</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Gas Cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(recent || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            None
                          </TableCell>
                        </TableRow>
                      ) : (
                        recent.map((r) => {
                          const explorer = explorerForChain[r.chain_id];
                          const href = explorer ? `${explorer}/tx/${r.transaction_hash}` : undefined;
                          const network = getNetworkByChainId(r.chain_id);
                          const symbol = network?.native_currency_symbol || 'ETH';
                          return (
                            <TableRow key={r.transaction_hash}>
                              <TableCell className="font-mono text-xs">
                                {href ? (
                                  <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                    {r.transaction_hash.slice(0, 10)}...
                                  </a>
                                ) : (
                                  `${r.transaction_hash.slice(0, 10)}...`
                                )}
                              </TableCell>
                              <TableCell>{r.chain_id}</TableCell>
                              <TableCell>{Number(r.gas_cost_eth || 0).toFixed(6)} {symbol}</TableCell>
                              <TableCell>
                                <Badge variant={r.status === 'confirmed' ? 'default' : 'secondary'}>
                                  {r.status || 'unknown'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="font-medium">Recent gasless activity</span>
                </div>
                <div className="border rounded-lg max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activity</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activity || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            None
                          </TableCell>
                        </TableRow>
                      ) : (
                        activity.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>{a.activity}</TableCell>
                            <TableCell className="font-mono text-xs">{a.user_id.slice(0, 10)}...</TableCell>
                            <TableCell>{a.chain_id}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(a.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminServiceAccount;

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface NetworkConfig {
  chain_id: number;
  chain_name: string;
  is_active: boolean;
  is_mainnet: boolean;
}

export default function AdminGasSponsorship() {
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalDeploys: 0, totalPurchases: 0, totalGasCost: 0 });
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    loadData();
    loadNetworks();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('gasless-admin-stats', {
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to load stats');
      }

      setActivityLog(data.activity || []);
      setStats({
        totalDeploys: data.stats.totalDeploys,
        totalPurchases: data.stats.totalPurchases,
        totalGasCost: data.stats.totalGasCostEth,
      });
    } catch (err: any) {
      console.error('Failed to load gasless stats', err);
      toast.error(err?.message || 'Could not load gasless stats');
    } finally {
      setIsLoading(false);
    }
  };

  const loadNetworks = async () => {
    try {
      const { data, error } = await supabase
        .from('network_configs')
        .select('chain_id, chain_name, is_active, is_mainnet')
        .eq('is_active', true)
        .order('chain_id');

      if (error) throw error;
      setNetworks(data || []);
    } catch (err: any) {
      console.error('Failed to load networks', err);
      toast.error('Could not load network configurations');
    }
  };

  // Helper function to get chain name by chain_id
  const getChainName = (chainId: number): string => {
    const network = networks.find(n => n.chain_id === chainId);
    return network ? network.chain_name : `Chain ${chainId}`;
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gas Sponsorship Dashboard</h1>
        <Button onClick={loadData} disabled={isLoading} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Lock Deployments</CardTitle>
            <CardDescription>Server-sponsored lock deployments</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{stats.totalDeploys}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total FREE Ticket Purchases</CardTitle>
            <CardDescription>Server-sponsored ticket claims</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{stats.totalPurchases}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Gas Cost</CardTitle>
            <CardDescription>Cumulative gas spent on sponsorship</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{stats.totalGasCost.toFixed(6)} ETH</p>
          </CardContent>
        </Card>
      </div>

      {/* Rate Limits Section (Informational) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Rate Limits</CardTitle>
          <CardDescription>Current daily limits per user (configured in edge functions)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Lock Deployments</h3>
              <p className="text-2xl font-bold text-primary">15 per day</p>
              <p className="text-xs text-muted-foreground">Resets at midnight UTC</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">FREE Ticket Purchases</h3>
              <p className="text-2xl font-bold text-primary">20 per day</p>
              <p className="text-xs text-muted-foreground">Resets at midnight UTC</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <h3 className="font-semibold text-sm mb-2">Supported Chains</h3>
            <div className="flex flex-wrap gap-2">
              {networks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Loading networks...</p>
              ) : (
                networks.map((network) => (
                  <span
                    key={network.chain_id}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      network.is_mainnet
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    }`}
                  >
                    {network.chain_name} ({network.chain_id})
                  </span>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 100 gasless transactions (lock deployments and ticket purchases)</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLog.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No gasless activity recorded yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {log.user_id.substring(0, 12)}...
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          log.activity === 'lock_deploy'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        }`}>
                          {log.activity === 'lock_deploy' ? 'Lock Deploy' : 'Ticket Purchase'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getChainName(log.chain_id)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>About Gas Sponsorship</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Gas sponsorship allows users to deploy event locks and claim FREE tickets without paying gas fees.
            TeeRex covers the transaction costs to improve user experience.
          </p>
          <p>
            Rate limits are enforced to prevent abuse. If a user exceeds their daily limit,
            the system automatically falls back to client-side transactions where users pay their own gas.
          </p>
          <p className="font-medium text-foreground">
            Service wallet must be funded with native tokens on all active networks to sponsor transactions.
            Manage networks in the Admin Networks page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

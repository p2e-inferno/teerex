import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, Settings, Database, Bell, Activity, AlertTriangle } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface GaslessConfig {
  id: string;
  daily_global_limit_per_user: number;
  log_sensitive_data: boolean;
  enabled: boolean;
}

interface Chain {
  chain_id: number;
  name: string;
  enabled: boolean;
  rpc_url_override: string | null;
}

interface Schema {
  schema_uid: string;
  name: string;
  category: string;
  daily_limit_per_user: number | null;
  exempt_from_global_limit: boolean;
  allow_revocations: boolean;
  enabled: boolean;
}

interface AttestationLog {
  id: string;
  user_id: string;
  schema_uid: string;
  recipient: string;
  chain_id: number;
  event_id: string | null;
  gas_used: number | null;
  gas_cost_usd: number | null;
  tx_hash: string | null;
  attestation_uid: string | null;
  created_at: string;
}

interface Alert {
  id: string;
  alert_type: string;
  threshold_value: number;
  enabled: boolean;
  alert_emails: string[];
}

export default function AdminGaslessConfig() {
  const { getAccessToken, user } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<GaslessConfig | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [logs, setLogs] = useState<AttestationLog[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Load all data
  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, chainsRes, schemasRes, logsRes, alertsRes] = await Promise.all([
        supabase.from('gasless_config' as any).select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('gasless_chains' as any).select('*').order('chain_id'),
        supabase.from('gasless_schemas' as any).select('*').order('category, name'),
        supabase.from('gasless_attestation_log' as any).select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('gasless_alerts' as any).select('*').order('alert_type'),
      ]);

      if ((configRes as any)?.data) setConfig((configRes as any).data as any);
      if ((chainsRes as any)?.data) setChains(((chainsRes as any).data as any) as Chain[]);
      if ((schemasRes as any)?.data) setSchemas(((schemasRes as any).data as any) as Schema[]);
      if ((logsRes as any)?.data) setLogs(((logsRes as any).data as any) as AttestationLog[]);
      if ((alertsRes as any)?.data) setAlerts(((alertsRes as any).data as any) as Alert[]);
    } catch (error) {
      toast({
        title: 'Failed to load data',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const accessToken = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('is-admin', {
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
          },
        });
        if (error) throw error;
        setIsAdmin(Boolean(data?.is_admin));
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [getAccessToken]);

  // Update global config
  const updateConfig = async (updates: Partial<GaslessConfig>) => {
    if (!config) return;
    try {
      const { error } = await supabase
        .from('gasless_config' as any)
        .update(updates)
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, ...updates });
      toast({ title: 'Configuration updated' });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Toggle chain enabled status
  const toggleChain = async (chainId: number, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('gasless_chains' as any)
        .update({ enabled })
        .eq('chain_id', chainId);

      if (error) throw error;

      setChains(chains.map(c => c.chain_id === chainId ? { ...c, enabled } : c));
      toast({ title: `Chain ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Toggle schema enabled status
  const toggleSchema = async (schemaUid: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('gasless_schemas' as any)
        .update({ enabled })
        .eq('schema_uid', schemaUid);

      if (error) throw error;

      setSchemas(schemas.map(s => s.schema_uid === schemaUid ? { ...s, enabled } : s));
      toast({ title: `Schema ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Update schema limits
  const updateSchemaLimit = async (schemaUid: string, dailyLimit: number | null) => {
    try {
      const { error } = await supabase
        .from('gasless_schemas' as any)
        .update({ daily_limit_per_user: dailyLimit })
        .eq('schema_uid', schemaUid);

      if (error) throw error;

      setSchemas(schemas.map(s => s.schema_uid === schemaUid ? { ...s, daily_limit_per_user: dailyLimit } : s));
      toast({ title: 'Schema limit updated' });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Toggle alert
  const toggleAlert = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('gasless_alerts' as any)
        .update({ enabled })
        .eq('id', id);

      if (error) throw error;

      setAlerts(alerts.map(a => a.id === id ? { ...a, enabled } : a));
      toast({ title: `Alert ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access the admin panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking admin access...
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Access denied. You must be an admin (lock manager) to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gasless Attestation System</h1>
          <p className="text-muted-foreground">Manage security, rate limits, and monitoring</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-2" />
            Config
          </TabsTrigger>
          <TabsTrigger value="chains">
            <Database className="h-4 w-4 mr-2" />
            Chains
          </TabsTrigger>
          <TabsTrigger value="schemas">
            <Database className="h-4 w-4 mr-2" />
            Schemas
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* Global Configuration */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Global Configuration</CardTitle>
              <CardDescription>System-wide settings for gasless attestations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {config && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>System Enabled</Label>
                      <p className="text-sm text-muted-foreground">
                        Master switch for all gasless attestations
                      </p>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(enabled) => updateConfig({ enabled })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Daily Global Limit Per User</Label>
                    <p className="text-sm text-muted-foreground">
                      Maximum attestations per user per day (safety net)
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={config.daily_global_limit_per_user}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          setConfig({ ...config, daily_global_limit_per_user: value });
                        }}
                        className="max-w-xs"
                      />
                      <Button
                        onClick={() => updateConfig({ daily_global_limit_per_user: config.daily_global_limit_per_user })}
                      >
                        Update
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Log Sensitive Data</Label>
                      <p className="text-sm text-muted-foreground">
                        Include wallet addresses and signatures in logs
                      </p>
                    </div>
                    <Switch
                      checked={config.log_sensitive_data}
                      onCheckedChange={(log_sensitive_data) => updateConfig({ log_sensitive_data })}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chain Management */}
        <TabsContent value="chains">
          <Card>
            <CardHeader>
              <CardTitle>Chain Whitelist</CardTitle>
              <CardDescription>Manage which blockchain networks support gasless attestations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {chains.map((chain) => (
                  <div key={chain.chain_id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{chain.name}</div>
                      <div className="text-sm text-muted-foreground">Chain ID: {chain.chain_id}</div>
                      {chain.rpc_url_override && (
                        <div className="text-xs text-muted-foreground mt-1">
                          RPC: {chain.rpc_url_override}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={chain.enabled}
                      onCheckedChange={(enabled) => toggleChain(chain.chain_id, enabled)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schema Management */}
        <TabsContent value="schemas">
          <Card>
            <CardHeader>
              <CardTitle>Schema Whitelist & Rate Limits</CardTitle>
              <CardDescription>Manage attestation schemas, categories, and per-schema limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {schemas.map((schema) => (
                  <div key={schema.schema_uid} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{schema.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Category: {schema.category}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">
                          {schema.schema_uid}
                        </div>
                      </div>
                      <Switch
                        checked={schema.enabled}
                        onCheckedChange={(enabled) => toggleSchema(schema.schema_uid, enabled)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Daily Limit Per User</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="Unlimited"
                            value={schema.daily_limit_per_user || ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseInt(e.target.value) : null;
                              updateSchemaLimit(schema.schema_uid, value);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`exempt-${schema.schema_uid}`}
                          checked={schema.exempt_from_global_limit}
                          disabled
                        />
                        <Label htmlFor={`exempt-${schema.schema_uid}`} className="text-xs">
                          Exempt from global limit
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`revocable-${schema.schema_uid}`}
                          checked={schema.allow_revocations}
                          disabled
                        />
                        <Label htmlFor={`revocable-${schema.schema_uid}`} className="text-xs">
                          Allow revocations
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attestation Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Attestations</CardTitle>
              <CardDescription>Last 50 gasless attestations (for monitoring and billing)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">User ID</th>
                      <th className="text-left p-2">Chain</th>
                      <th className="text-left p-2">Schema</th>
                      <th className="text-left p-2">Event ID</th>
                      <th className="text-right p-2">Gas Used</th>
                      <th className="text-left p-2">TX Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {log.user_id.substring(0, 12)}...
                        </td>
                        <td className="p-2">{log.chain_id}</td>
                        <td className="p-2 font-mono text-xs">
                          {log.schema_uid.substring(0, 10)}...
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {log.event_id ? `${log.event_id.substring(0, 8)}...` : '-'}
                        </td>
                        <td className="p-2 text-right">
                          {log.gas_used ? Number(log.gas_used).toLocaleString() : '-'}
                        </td>
                        <td className="p-2">
                          {log.tx_hash ? (
                            <a
                              href={`https://sepolia.basescan.org/tx/${log.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline font-mono text-xs"
                            >
                              {log.tx_hash.substring(0, 10)}...
                            </a>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Configuration */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alert Configuration</CardTitle>
              <CardDescription>Monitor service wallet balance and gas costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium capitalize">
                        {alert.alert_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Threshold: {alert.threshold_value}
                        {alert.alert_type === 'low_balance' && ' ETH'}
                        {alert.alert_type === 'high_gas_cost' && ' USD'}
                        {alert.alert_type === 'daily_limit_reached' && ' attestations'}
                      </div>
                      {alert.alert_emails.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Recipients: {alert.alert_emails.join(', ')}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={alert.enabled}
                      onCheckedChange={(enabled) => toggleAlert(alert.id, enabled)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

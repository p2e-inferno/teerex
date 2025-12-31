import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, Network, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { clearAllNetworkCaches } from '@/lib/config/network-config';
import { clearNetworkConfigsCache } from '@/hooks/useNetworkConfigs';

interface NetworkConfig {
  id: string;
  chain_id: number;
  chain_name: string;
  usdc_token_address: string | null;
  dg_token_address: string | null;
  g_token_address: string | null;
  up_token_address: string | null;
  unlock_factory_address: string | null;
  native_currency_symbol: string;
  native_currency_name: string | null;
  native_currency_decimals: number | null;
  rpc_url: string | null;
  block_explorer_url: string | null;
  is_mainnet: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface NetworkFormData {
  chain_id: number;
  chain_name: string;
  usdc_token_address: string;
  dg_token_address: string;
  g_token_address: string;
  up_token_address: string;
  unlock_factory_address: string;
  native_currency_symbol: string;
  native_currency_name: string;
  native_currency_decimals: number;
  rpc_url: string;
  block_explorer_url: string;
  is_mainnet: boolean;
  is_active: boolean;
}

const AdminNetworks: React.FC = () => {
  const { user, getAccessToken } = usePrivy();
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingNetworkId, setTogglingNetworkId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<NetworkConfig | null>(null);
  const [formData, setFormData] = useState<NetworkFormData>({
    chain_id: 0,
    chain_name: '',
    usdc_token_address: '',
    dg_token_address: '',
    g_token_address: '',
    up_token_address: '',
    unlock_factory_address: '',
    native_currency_symbol: 'ETH',
    native_currency_name: 'Ethereum',
    native_currency_decimals: 18,
    rpc_url: '',
    block_explorer_url: '',
    is_mainnet: false,
    is_active: true,
  });

  const loadNetworks = async (opts?: { background?: boolean }) => {
    const isBackground = opts?.background;

    try {
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const token = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('manage-network-config', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setNetworks(data.networks || []);
    } catch (error) {
      console.error('Error loading networks:', error);
      toast({
        title: "Error Loading Networks",
        description: "There was an error loading network configurations.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadNetworks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);

      const token = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const payload = {
        chain_id: formData.chain_id,
        chain_name: formData.chain_name,
        usdc_token_address: formData.usdc_token_address || null,
        dg_token_address: formData.dg_token_address || null,
        g_token_address: formData.g_token_address || null,
        up_token_address: formData.up_token_address || null,
        unlock_factory_address: formData.unlock_factory_address || null,
        native_currency_symbol: formData.native_currency_symbol,
        native_currency_name: formData.native_currency_name,
        native_currency_decimals: formData.native_currency_decimals,
        rpc_url: formData.rpc_url || null,
        block_explorer_url: formData.block_explorer_url || null,
        is_mainnet: formData.is_mainnet,
        is_active: formData.is_active,
      };

      if (editingNetwork) {
        // Update existing network
        const { data, error } = await supabase.functions.invoke('manage-network-config', {
          method: 'PUT',
          body: { id: editingNetwork.id, ...payload },
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${token}`,
          },
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        // Clear caches across contexts (memory, Privy, React Query)
        clearAllNetworkCaches();
        clearNetworkConfigsCache();

        toast({
          title: "Network Updated",
          description: `${formData.chain_name} has been updated successfully. Cache cleared for all users.`,
        });
      } else {
        // Create new network
        const { data, error } = await supabase.functions.invoke('manage-network-config', {
          method: 'POST',
          body: payload,
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${token}`,
          },
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        // Clear caches across contexts (memory, Privy, React Query)
        clearAllNetworkCaches();
        clearNetworkConfigsCache();

        toast({
          title: "Network Added",
          description: `${formData.chain_name} has been added successfully. Cache cleared for all users.`,
        });
      }

      setDialogOpen(false);
      setEditingNetwork(null);
      resetForm();
      loadNetworks({ background: true });
    } catch (error: any) {
      console.error('Error saving network:', error);
      toast({
        title: "Error Saving Network",
        description: error.message || "There was an error saving the network configuration.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (network: NetworkConfig) => {
    setEditingNetwork(network);
    setFormData({
      chain_id: network.chain_id,
      chain_name: network.chain_name,
      usdc_token_address: network.usdc_token_address || '',
      dg_token_address: network.dg_token_address || '',
      g_token_address: network.g_token_address || '',
      up_token_address: network.up_token_address || '',
      unlock_factory_address: network.unlock_factory_address || '',
      native_currency_symbol: network.native_currency_symbol,
      native_currency_name: network.native_currency_name || '',
      native_currency_decimals: network.native_currency_decimals || 18,
      rpc_url: network.rpc_url || '',
      block_explorer_url: network.block_explorer_url || '',
      is_mainnet: network.is_mainnet,
      is_active: network.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (network: NetworkConfig) => {
    if (!confirm(`Are you sure you want to delete ${network.chain_name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const token = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('manage-network-config', {
        method: 'DELETE',
        body: { id: network.id },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Clear caches across contexts (memory, Privy, React Query)
      clearAllNetworkCaches();
      clearNetworkConfigsCache();

      // Optimistic update: remove from local state
      setNetworks((prev) => prev.filter((n) => n.id !== network.id));

      toast({
        title: "Network Deleted",
        description: `${network.chain_name} has been deleted successfully. Cache cleared for all users.`,
      });

      // Background refetch to reconcile
      loadNetworks({ background: true });
    } catch (error: any) {
      console.error('Error deleting network:', error);

      // Refetch on error to restore state
      loadNetworks({ background: true });
      toast({
        title: "Error Deleting Network",
        description: error.message || "There was an error deleting the network.",
        variant: "destructive"
      });
    }
  };

  const handleToggleActive = async (network: NetworkConfig) => {
    try {
      setTogglingNetworkId(network.id);

      // Optimistic update: update local state immediately
      const newActiveState = !network.is_active;
      setNetworks((prev) =>
        prev.map((n) => (n.id === network.id ? { ...n, is_active: newActiveState } : n))
      );

      const token = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('manage-network-config', {
        method: 'PUT',
        body: {
          id: network.id,
          chain_id: network.chain_id,
          chain_name: network.chain_name,
          usdc_token_address: network.usdc_token_address,
          dg_token_address: network.dg_token_address,
          g_token_address: network.g_token_address,
          up_token_address: network.up_token_address,
          unlock_factory_address: network.unlock_factory_address,
          native_currency_symbol: network.native_currency_symbol,
          native_currency_name: network.native_currency_name,
          native_currency_decimals: network.native_currency_decimals,
          rpc_url: network.rpc_url,
          block_explorer_url: network.block_explorer_url,
          is_mainnet: network.is_mainnet,
          is_active: newActiveState,
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Clear caches across contexts (memory, Privy, React Query)
      clearAllNetworkCaches();
      clearNetworkConfigsCache();

      toast({
        title: network.is_active ? "Network Deactivated" : "Network Activated",
        description: `${network.chain_name} has been ${network.is_active ? 'deactivated' : 'activated'}. Cache cleared for all users.`,
      });

      // Background refetch to reconcile with server state
      loadNetworks({ background: true });
    } catch (error: any) {
      console.error('Error toggling network status:', error);

      // Revert optimistic update on error
      setNetworks((prev) =>
        prev.map((n) => (n.id === network.id ? { ...n, is_active: network.is_active } : n))
      );

      toast({
        title: "Error Updating Network",
        description: error.message || "There was an error updating the network status.",
        variant: "destructive"
      });
    } finally {
      setTogglingNetworkId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      chain_id: 0,
      chain_name: '',
      usdc_token_address: '',
      dg_token_address: '',
      g_token_address: '',
      up_token_address: '',
      unlock_factory_address: '',
      native_currency_symbol: 'ETH',
      native_currency_name: 'Ethereum',
      native_currency_decimals: 18,
      rpc_url: '',
      block_explorer_url: '',
      is_mainnet: false,
      is_active: true,
    });
  };

  const openAddDialog = () => {
    setEditingNetwork(null);
    resetForm();
    setDialogOpen(true);
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Please connect your wallet to access admin features.</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header Section */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Network className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Network Management
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Configure blockchain networks supported by the application
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex justify-between items-center mb-8">
          <Button onClick={loadNetworks} variant="outline" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Network
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingNetwork ? 'Edit Network' : 'Add New Network'}
                </DialogTitle>
                <DialogDescription>
                  Configure network settings for blockchain integration
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chain_id">Chain ID</Label>
                    <Input
                      id="chain_id"
                      type="number"
                      value={formData.chain_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, chain_id: Number(e.target.value) }))}
                      disabled={!!editingNetwork}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chain_name">Chain Name</Label>
                    <Input
                      id="chain_name"
                      value={formData.chain_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, chain_name: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="native_currency_symbol">Native Currency Symbol</Label>
                    <Input
                      id="native_currency_symbol"
                      value={formData.native_currency_symbol}
                      onChange={(e) => setFormData(prev => ({ ...prev, native_currency_symbol: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="native_currency_name">Native Currency Name</Label>
                    <Input
                      id="native_currency_name"
                      value={formData.native_currency_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, native_currency_name: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="native_currency_decimals">Native Currency Decimals</Label>
                  <Input
                    id="native_currency_decimals"
                    type="number"
                    value={formData.native_currency_decimals}
                    onChange={(e) => setFormData(prev => ({ ...prev, native_currency_decimals: Number(e.target.value) }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="usdc_token_address">USDC Token Address (Optional)</Label>
                  <Input
                    id="usdc_token_address"
                    value={formData.usdc_token_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, usdc_token_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dg_token_address">DG Token Address (Optional)</Label>
                  <Input
                    id="dg_token_address"
                    value={formData.dg_token_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, dg_token_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="g_token_address">G Token Address (Optional)</Label>
                  <Input
                    id="g_token_address"
                    value={formData.g_token_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, g_token_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="up_token_address">UP Token Address (Optional)</Label>
                  <Input
                    id="up_token_address"
                    value={formData.up_token_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, up_token_address: e.target.value }))}
                    placeholder="0x..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unlock_factory_address">Unlock Factory Address (Optional)</Label>
                  <Input
                    id="unlock_factory_address"
                    value={formData.unlock_factory_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, unlock_factory_address: e.target.value }))}
                    placeholder="0x..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Required for gasless lock deployment. Get addresses from Unlock Protocol docs.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rpc_url">RPC URL</Label>
                  <Input
                    id="rpc_url"
                    value={formData.rpc_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, rpc_url: e.target.value }))}
                    placeholder="https://..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="block_explorer_url">Block Explorer URL</Label>
                  <Input
                    id="block_explorer_url"
                    value={formData.block_explorer_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, block_explorer_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_mainnet"
                      checked={formData.is_mainnet}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_mainnet: checked }))}
                    />
                    <Label htmlFor="is_mainnet">Mainnet</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingNetwork ? 'Update Network' : 'Add Network'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Networks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            networks.map((network) => (
              <Card key={network.id} className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${network.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <div>
                        <CardTitle className="text-lg">{network.chain_name}</CardTitle>
                        <CardDescription>Chain ID: {network.chain_id}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {network.is_mainnet && <Badge variant="default">Mainnet</Badge>}
                      {!network.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    <div><strong>Native:</strong> {network.native_currency_name} ({network.native_currency_symbol})</div>
                    {network.usdc_token_address && (
                      <div><strong>USDC:</strong> {network.usdc_token_address.slice(0, 6)}...{network.usdc_token_address.slice(-4)}</div>
                    )}
                    {network.dg_token_address && (
                      <div><strong>DG:</strong> {network.dg_token_address.slice(0, 6)}...{network.dg_token_address.slice(-4)}</div>
                    )}
                    {network.g_token_address && (
                      <div><strong>G:</strong> {network.g_token_address.slice(0, 6)}...{network.g_token_address.slice(-4)}</div>
                    )}
                    {network.up_token_address && (
                      <div><strong>UP:</strong> {network.up_token_address.slice(0, 6)}...{network.up_token_address.slice(-4)}</div>
                    )}
                    {network.unlock_factory_address && (
                      <div><strong>Unlock Factory:</strong> {network.unlock_factory_address.slice(0, 6)}...{network.unlock_factory_address.slice(-4)}</div>
                    )}
                    {network.rpc_url && (
                      <div><strong>RPC:</strong> {network.rpc_url.replace('https://', '')}</div>
                    )}
                    {network.block_explorer_url && (
                      <div><strong>Explorer:</strong> {network.block_explorer_url.replace('https://', '')}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(network)}
                        disabled={togglingNetworkId === network.id}
                      >
                        {togglingNetworkId === network.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            {network.is_active ? 'Deactivating...' : 'Activating...'}
                          </>
                        ) : network.is_active ? (
                          <>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(network)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(network)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {networks.length === 0 && !isLoading && (
          <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader className="text-center py-12">
              <Network className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <CardTitle>No Networks Configured</CardTitle>
              <CardDescription>
                Add your first blockchain network to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Add First Network
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminNetworks;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { purchaseKey } from '@/utils/lockUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, AlertCircle, RefreshCw, Edit } from 'lucide-react';
import type { GamingBundle } from '@/types/gaming';
import { GamingBundlePaystackDialog } from '@/components/gaming/GamingBundlePaystackDialog';
import { GamingBundleProcessingDialog } from '@/components/gaming/GamingBundleProcessingDialog';
import { ServiceManagerControls } from '@/components/shared/ServiceManagerControls';
import { getGamingBundleMetadataBaseURI } from '@/utils/gamingBundleNftMetadata';
import { useQueryClient } from '@tanstack/react-query';
import { useLockManagerVerification } from '@/components/interactions/hooks/useLockManagerVerification';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const GamingBundleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bundles = [], isLoading } = useGamingBundles({ bundle_id: id || '' }, { enabled: !!id });
  const bundle = useMemo(() => bundles[0] as GamingBundle | undefined, [bundles]);
  const fiatEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  type PurchaseModalState = 'none' | 'paystack' | 'processing';
  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>('none');
  const [paymentData, setPaymentData] = useState<any | null>(null);
  const [isCryptoPurchasing, setIsCryptoPurchasing] = useState(false);
  const [isSettingMetadata, setIsSettingMetadata] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    game_title: '',
    console: '',
    location: '',
    price_fiat: 0,
    price_dg: 0,
    quantity_units: 0,
    unit_label: '',
    is_active: true,
  });

  // Check if current user is a lock manager
  const { isLockManager } = useLockManagerVerification(
    bundle?.bundle_address || '',
    bundle?.chain_id || 0
  );

  // Initialize edit form when bundle loads or edit dialog opens
  useEffect(() => {
    if (bundle && isEditOpen) {
      setEditForm({
        title: bundle.title || '',
        description: bundle.description || '',
        game_title: bundle.game_title || '',
        console: bundle.console || '',
        location: bundle.location || '',
        price_fiat: bundle.price_fiat || 0,
        price_dg: bundle.price_dg || 0,
        quantity_units: bundle.quantity_units || 0,
        unit_label: bundle.unit_label || '',
        is_active: bundle.is_active ?? true,
      });
    }
  }, [bundle, isEditOpen]);

  useEffect(() => {
    if (!isLoading && id && !bundle) {
      navigate('/gaming-bundles');
    }
  }, [bundle, id, isLoading, navigate]);

  const handleCryptoPurchase = async () => {
    if (!bundle) return;
    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Connect wallet', description: 'Connect a wallet to purchase with DG.', variant: 'destructive' });
      login();
      return;
    }

    const dgPrice = Number(bundle.price_dg || 0);
    if (!dgPrice || dgPrice <= 0) {
      toast({ title: 'DG not available', description: 'This bundle does not accept DG payments.', variant: 'destructive' });
      return;
    }

    setIsCryptoPurchasing(true);
    try {
      const result = await purchaseKey(bundle.bundle_address, dgPrice, 'DG', wallet, bundle.chain_id);
      if (!result.success || !result.transactionHash) {
        throw new Error(result.error || 'Failed to purchase bundle');
      }

      let recordFailed = false;
      let tokenId: string | null = null;
      try {
        const token = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('record-gaming-bundle-crypto-purchase', {
          body: {
            bundle_id: bundle.id,
            wallet_address: wallet.address,
            tx_hash: result.transactionHash,
          },
          headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
        });

        if (error || !data?.ok) {
          recordFailed = true;
          console.warn('[BUNDLE CRYPTO] Failed to record purchase:', error?.message || data?.error);
        } else {
          tokenId = data?.order?.token_id || null;
        }
      } catch (err) {
        recordFailed = true;
        console.warn('[BUNDLE CRYPTO] Failed to record purchase:', err);
      }

      const tokenIdMessage = tokenId ? ` Your NFT token ID is #${tokenId}.` : '';
      toast({
        title: recordFailed ? 'Purchase complete (record pending)' : 'Purchase complete',
        description: recordFailed
          ? 'Your NFT was minted, but the purchase record may sync later.'
          : `Your DG purchase was recorded.${tokenIdMessage}`,
      });
    } catch (error) {
      toast({
        title: 'Purchase failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsCryptoPurchasing(false);
    }
  };

  const handleSetMetadata = async () => {
    if (!bundle) return;
    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Connect wallet', description: 'Connect a wallet to set metadata.', variant: 'destructive' });
      login();
      return;
    }

    setIsSettingMetadata(true);
    try {
      const { ethers } = await import('ethers');
      const provider = await wallet.getEthereumProvider();
      const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();

      const bundleMetadataURI = getGamingBundleMetadataBaseURI(bundle.bundle_address);
      const PublicLockABI = (await import('../../supabase/functions/_shared/abi/PublicLockV15.json')).default;
      const lock = new ethers.Contract(bundle.bundle_address, PublicLockABI, ethersSigner);

      // Retry logic (2 attempts)
      let success = false;
      let lastError: any;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[Set Metadata] Attempt ${attempt}/2`);
          const tx = await lock.setLockMetadata(bundle.title, 'BUNDLE', bundleMetadataURI);
          await tx.wait();
          console.log('[Set Metadata] Success');
          success = true;
          break;
        } catch (error: any) {
          lastError = error;
          console.warn(`[Set Metadata] Attempt ${attempt}/2 failed:`, error.message);
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!success) {
        throw lastError;
      }

      // Update database
      const token = await getAccessToken?.();
      const { error: updateError } = await supabase.functions.invoke('update-gaming-bundle', {
        body: { bundle_id: bundle.id, metadata_set: true },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (updateError) {
        console.warn('Failed to update metadata status in database:', updateError);
      }

      toast({ title: 'Metadata set!', description: 'NFT metadata URI has been set successfully.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });
    } catch (error: any) {
      console.error('Error setting metadata:', error);
      toast({
        title: 'Failed to set metadata',
        description: error.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setIsSettingMetadata(false);
    }
  };

  const handleUpdateBundle = async () => {
    if (!bundle) return;

    setIsUpdating(true);
    try {
      // Check if DG price changed - requires on-chain transaction
      const dgPriceChanged = editForm.price_dg !== (bundle.price_dg || 0);

      if (dgPriceChanged) {
        const wallet = wallets[0];
        if (!wallet) {
          toast({
            title: 'Connect wallet',
            description: 'Connect a wallet to update on-chain pricing.',
            variant: 'destructive'
          });
          login();
          return;
        }

        // Update on-chain pricing
        const { ethers } = await import('ethers');
        const { getTokenAddressAsync } = await import('@/lib/config/network-config');

        const provider = await wallet.getEthereumProvider();
        const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();
        const PublicLockABI = (await import('../../supabase/functions/_shared/abi/PublicLockV15.json')).default;
        const lock = new ethers.Contract(bundle.bundle_address, PublicLockABI, ethersSigner);

        // Get DG token address for the chain
        const dgTokenAddress = await getTokenAddressAsync(bundle.chain_id, 'DG');
        if (!dgTokenAddress) {
          throw new Error('DG token not configured for this chain');
        }

        // Convert DG price to wei (assuming 18 decimals for DG token)
        const priceInWei = ethers.parseUnits(editForm.price_dg.toString(), 18);

        toast({ title: 'Updating on-chain price...', description: 'Please confirm the transaction in your wallet.' });

        const tx = await lock.updateKeyPricing(priceInWei, dgTokenAddress);
        await tx.wait();

        toast({ title: 'On-chain price updated!', description: 'Updating database...' });
      }

      // Update database fields
      const token = await getAccessToken?.();
      const { error: updateError } = await supabase.functions.invoke('update-gaming-bundle', {
        body: {
          bundle_id: bundle.id,
          title: editForm.title,
          description: editForm.description,
          game_title: editForm.game_title || null,
          console: editForm.console || null,
          location: editForm.location,
          price_fiat: editForm.price_fiat,
          price_dg: editForm.price_dg,
          quantity_units: editForm.quantity_units,
          unit_label: editForm.unit_label,
          is_active: editForm.is_active,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update bundle');
      }

      toast({ title: 'Bundle updated!', description: 'Your changes have been saved.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });
      setIsEditOpen(false);
    } catch (error: any) {
      console.error('Error updating bundle:', error);
      toast({
        title: 'Update failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading || !bundle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const dgPrice = Number(bundle.price_dg || 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl space-y-6">
        <Card className="border border-gray-200 shadow-sm overflow-hidden">
          {/* Bundle Image */}
          {bundle.image_url && (
            <div className="w-full max-h-80 overflow-hidden">
              <img
                src={bundle.image_url}
                alt={bundle.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{bundle.bundle_type}</Badge>
                <Badge variant="secondary">{bundle.quantity_units} {bundle.unit_label}</Badge>
                {bundle.console && (
                  <Badge variant="secondary">{bundle.console}</Badge>
                )}
                {bundle.game_title && (
                  <Badge variant="outline" className="bg-purple-50">{bundle.game_title}</Badge>
                )}
              </div>
              {isLockManager && (
                <Button
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                  className="flex-shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
            <CardTitle className="text-2xl">{bundle.title}</CardTitle>
            {/* Location */}
            {bundle.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{bundle.location}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">{bundle.description}</p>

            {/* Lock manager-only metadata warning */}
            {isLockManager && !bundle.metadata_set && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">NFT Metadata Not Set</p>
                  <p className="text-xs text-amber-700 mt-1">
                    The NFT metadata URI hasn't been set for this bundle. This affects how the NFT appears on marketplaces like OpenSea.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetMetadata}
                    disabled={isSettingMetadata}
                    className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    {isSettingMetadata ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting Metadata...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Set Metadata Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {isLockManager && (
              <ServiceManagerControls
                entityType="bundle"
                entityId={bundle.id}
                lockAddress={bundle.bundle_address}
                chainId={bundle.chain_id}
                canManage={isLockManager}
                initialAdded={bundle.service_manager_added}
                onUpdated={() => queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] })}
              />
            )}

            <div className="border-t pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {bundle.price_fiat > 0 && (
                  <Button
                    onClick={() => {
                      if (!fiatEnabled) {
                        toast({
                          title: 'Fiat payments disabled',
                          description: 'Card/Bank payments are currently disabled.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setPurchaseModal('paystack');
                    }}
                    className="flex-1"
                  >
                    Pay NGN {Number(bundle.price_fiat).toLocaleString()}
                  </Button>
                )}
                {dgPrice > 0 && (
                  <Button variant="outline" onClick={handleCryptoPurchase} disabled={isCryptoPurchasing} className="flex-1">
                    {isCryptoPurchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${dgPrice} DG`}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <GamingBundlePaystackDialog
          bundle={bundle}
          isOpen={purchaseModal === 'paystack'}
          onClose={() => setPurchaseModal('none')}
          onSuccess={(data) => {
            setPaymentData(data);
            setPurchaseModal('processing');
          }}
        />

        <GamingBundleProcessingDialog
          bundle={bundle}
          isOpen={purchaseModal === 'processing'}
          paymentData={paymentData}
          onClose={() => setPurchaseModal('none')}
        />

        {/* Edit Bundle Dialog - Lock Manager Only */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Gaming Bundle</DialogTitle>
              <DialogDescription>
                Update bundle details. Note: On-chain configuration (expiration, max keys, pricing) requires separate smart contract transactions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Bundle title"
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Bundle description"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-game-title">Game Title (Optional)</Label>
                  <Input
                    id="edit-game-title"
                    value={editForm.game_title}
                    onChange={(e) => setEditForm(prev => ({ ...prev, game_title: e.target.value }))}
                    placeholder="e.g., FIFA 24"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-console">Console (Optional)</Label>
                  <Input
                    id="edit-console"
                    value={editForm.console}
                    onChange={(e) => setEditForm(prev => ({ ...prev, console: e.target.value }))}
                    placeholder="e.g., PS5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editForm.location}
                  onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Gaming center location"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-quantity">Quantity</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    value={editForm.quantity_units}
                    onChange={(e) => setEditForm(prev => ({ ...prev, quantity_units: Number(e.target.value) }))}
                    min={1}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-unit-label">Unit Label</Label>
                  <Input
                    id="edit-unit-label"
                    value={editForm.unit_label}
                    onChange={(e) => setEditForm(prev => ({ ...prev, unit_label: e.target.value }))}
                    placeholder="e.g., hours, matches"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-price-fiat">Fiat Price (NGN)</Label>
                  <Input
                    id="edit-price-fiat"
                    type="number"
                    value={editForm.price_fiat}
                    onChange={(e) => setEditForm(prev => ({ ...prev, price_fiat: Number(e.target.value) }))}
                    min={0}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-price-dg">DG Price (On-Chain)</Label>
                  <Input
                    id="edit-price-dg"
                    type="number"
                    value={editForm.price_dg}
                    onChange={(e) => setEditForm(prev => ({ ...prev, price_dg: Number(e.target.value) }))}
                    min={0}
                    step="0.01"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Updating this will trigger an on-chain transaction
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Bundle is active</Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleUpdateBundle}
                  disabled={isUpdating || !editForm.title.trim() || !editForm.location.trim()}
                  className="flex-1"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isUpdating ? 'Updating...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default GamingBundleDetails;
